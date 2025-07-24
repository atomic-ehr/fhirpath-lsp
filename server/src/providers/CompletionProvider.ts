import {
  CompletionItem,
  CompletionItemKind,
  CompletionParams,
  Position,
  TextDocumentPositionParams,
  MarkupKind
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { FHIRPathService } from '../parser/FHIRPathService';
import { FHIRPathFunctionRegistry } from '../services/FHIRPathFunctionRegistry';
import { FHIRPathContextService } from '../services/FHIRPathContextService';
import { FHIRResourceService } from '../services/FHIRResourceService';
import { cacheService } from '../services/CacheService';

export interface CompletionContext {
  text: string;
  position: Position;
  triggerCharacter?: string;
  currentToken?: string;
  previousToken?: string;
  isAfterDot: boolean;
  isInFunction: boolean;
  isInBrackets: boolean;
  parentExpression?: string;
}

export class CompletionProvider {
  private functionRegistry: FHIRPathFunctionRegistry;
  private contextService?: FHIRPathContextService;

  constructor(
    private fhirPathService: FHIRPathService,
    private fhirResourceService?: FHIRResourceService
  ) {
    this.functionRegistry = new FHIRPathFunctionRegistry();
    if (fhirResourceService) {
      this.contextService = new FHIRPathContextService(fhirResourceService);
    }
  }

  async provideCompletions(
    document: TextDocument,
    params: CompletionParams
  ): Promise<CompletionItem[]> {
    try {
      // Generate cache key
      const cacheKey = cacheService.generateCompletionKey(
        document.uri,
        params.position,
        params.context?.triggerCharacter
      );

      // Check cache first
      const cached = cacheService.getCompletion(cacheKey);
      if (cached) {
        return cached;
      }

      // Generate completions
      const context = this.analyzeCompletionContext(document, params.position, params.context?.triggerCharacter);
      const completions = await this.getCompletionsForContext(context, document);

      // Cache the result
      cacheService.setCompletion(cacheKey, completions);

      return completions;
    } catch (error) {
      console.error('Error providing completions:', error);
      return [];
    }
  }

  private analyzeCompletionContext(
    document: TextDocument,
    position: Position,
    triggerCharacter?: string
  ): CompletionContext {
    const text = document.getText();
    const offset = document.offsetAt(position);
    const lineText = document.getText({
      start: { line: position.line, character: 0 },
      end: { line: position.line, character: position.character }
    });

    // Parse multi-expressions from the current line to get the specific expression at cursor
    const currentExpressionContext = this.getCurrentExpressionAtPosition(lineText, position.character);
    
    // Use the current expression context for analysis
    const expressionBeforeCursor = currentExpressionContext.expressionText;
    const expressionOffset = currentExpressionContext.startColumn;

    // Find current token and previous token within the current expression
    const tokens = this.tokenizeForCompletion(expressionBeforeCursor);
    const currentTokenInfo = this.getCurrentToken(expressionBeforeCursor, position.character - expressionOffset);
    const previousTokenInfo = this.getPreviousToken(tokens, currentTokenInfo);

    // Analyze context flags based on expression, not entire line
    const isAfterDot = /\.\s*$/.test(expressionBeforeCursor) || triggerCharacter === '.';
    const isInFunction = this.isInsideFunction(expressionBeforeCursor);
    const isInBrackets = this.isInsideBrackets(expressionBeforeCursor);

    // Extract parent expression for context-aware completion
    const parentExpression = this.extractParentExpression(expressionBeforeCursor);

    return {
      text: expressionBeforeCursor,
      position,
      triggerCharacter,
      currentToken: currentTokenInfo?.token,
      previousToken: previousTokenInfo?.token,
      isAfterDot,
      isInFunction,
      isInBrackets,
      parentExpression
    };
  }

  /**
   * Parse multi-expressions from a line and find the expression at the cursor position
   * Supports semicolon-separated expressions while handling strings correctly
   */
  private getCurrentExpressionAtPosition(lineText: string, cursorPosition: number): {
    expressionText: string;
    startColumn: number;
    endColumn: number;
  } {
    // Handle semicolon-separated expressions, but be careful about semicolons in strings
    let expressions: Array<{text: string; start: number; end: number}> = [];
    let currentExpression = '';
    let inString = false;
    let stringChar = '';
    let expressionStart = 0;
    
    for (let i = 0; i < lineText.length; i++) {
      const char = lineText[i];
      const prevChar = i > 0 ? lineText[i - 1] : '';
      
      if (!inString && (char === '"' || char === "'")) {
        inString = true;
        stringChar = char;
      } else if (inString && char === stringChar && prevChar !== '\\') {
        inString = false;
        stringChar = '';
      } else if (!inString && char === ';') {
        // End of expression
        if (currentExpression.trim()) {
          expressions.push({
            text: currentExpression.trim(),
            start: expressionStart,
            end: i
          });
        }
        currentExpression = '';
        // Find the next non-whitespace character for the new expression start
        let nextStart = i + 1;
        while (nextStart < lineText.length && (lineText[nextStart] === ' ' || lineText[nextStart] === '\t')) {
          nextStart++;
        }
        expressionStart = nextStart;
        continue;
      }
      
      currentExpression += char;
    }
    
    // Add the last expression
    if (currentExpression.trim()) {
      expressions.push({
        text: currentExpression.trim(),
        start: expressionStart,
        end: lineText.length
      });
    }
    
    // If no expressions found, treat the whole line as one expression
    if (expressions.length === 0) {
      const trimmed = lineText.trim();
      if (trimmed) {
        let start = 0;
        while (start < lineText.length && (lineText[start] === ' ' || lineText[start] === '\t')) {
          start++;
        }
        expressions.push({
          text: trimmed,
          start: start,
          end: lineText.length
        });
      }
    }
    
    // Find which expression contains the cursor
    for (const expr of expressions) {
      if (cursorPosition >= expr.start && cursorPosition <= expr.end) {
        return {
          expressionText: lineText.substring(expr.start, cursorPosition),
          startColumn: expr.start,
          endColumn: expr.end
        };
      }
    }
    
    // Fallback: return the last expression or empty
    if (expressions.length > 0) {
      const lastExpr = expressions[expressions.length - 1];
      return {
        expressionText: lineText.substring(lastExpr.start, cursorPosition),
        startColumn: lastExpr.start,
        endColumn: lastExpr.end
      };
    }
    
    return {
      expressionText: '',
      startColumn: 0,
      endColumn: lineText.length
    };
  }

  private tokenizeForCompletion(text: string): string[] {
    // Simple tokenization for completion context
    return text.split(/[\s\(\)\[\]\.\,]+/).filter(token => token.length > 0);
  }

  private getCurrentToken(lineText: string, position: number): { token: string; start: number; end: number } | null {
    // Find the token at the cursor position
    const beforeCursor = lineText.substring(0, position);
    const afterCursor = lineText.substring(position);
    
    // Find token boundaries - look for the last delimiter
    const tokenStart = Math.max(
      beforeCursor.lastIndexOf(' '),
      beforeCursor.lastIndexOf('.'),
      beforeCursor.lastIndexOf('('),
      beforeCursor.lastIndexOf('['),
      beforeCursor.lastIndexOf(','),
      -1 // Use -1 as default to handle start of line
    ) + 1; // Start after the delimiter
    
    const tokenEnd = afterCursor.search(/[\s\.\(\)\[\],]/);
    const actualTokenEnd = tokenEnd === -1 ? lineText.length : position + tokenEnd;

    const token = lineText.substring(tokenStart, actualTokenEnd).trim();
    
    if (token.length === 0) {
      return null;
    }

    return {
      token,
      start: tokenStart,
      end: actualTokenEnd
    };
  }

  private getPreviousToken(tokens: string[], currentTokenInfo: any): { token: string } | null {
    if (tokens.length < 2) {
      return null;
    }

    // Return the second-to-last token
    return { token: tokens[tokens.length - 2] };
  }

  private isInsideFunction(text: string): boolean {
    // Count unmatched opening parentheses
    let parenCount = 0;
    for (let i = text.length - 1; i >= 0; i--) {
      if (text[i] === ')') parenCount++;
      if (text[i] === '(') parenCount--;
      if (parenCount < 0) return true;
    }
    return false;
  }

  private isInsideBrackets(text: string): boolean {
    // Count unmatched opening brackets
    let bracketCount = 0;
    for (let i = text.length - 1; i >= 0; i--) {
      if (text[i] === ']') bracketCount++;
      if (text[i] === '[') bracketCount--;
      if (bracketCount < 0) return true;
    }
    return false;
  }

  private extractParentExpression(text: string): string | undefined {
    // Extract the expression before the last dot for context
    const match = text.match(/([\w\.\[\]\(\)]+)\.[\w]*$/);
    return match ? match[1] : undefined;
  }

  private async getCompletionsForContext(context: CompletionContext, document: TextDocument): Promise<CompletionItem[]> {
    const completions: CompletionItem[] = [];

    // Get document context if available
    let documentContext = null;
    if (this.contextService) {
      documentContext = await this.contextService.getCompletionContext(document);
    }

    if (context.isAfterDot) {
      // After dot: suggest FHIR resource properties first, then functions
      completions.push(...this.getFHIRResourcePropertyCompletions(context, documentContext));
      completions.push(...this.getFunctionCompletions(context));
    } else if (context.isInFunction) {
      // Inside function: suggest parameters and values
      completions.push(...this.getFunctionParameterCompletions(context));
      completions.push(...this.getValueCompletions(context));
    } else if (context.isInBrackets) {
      // Inside brackets: suggest filter expressions
      completions.push(...this.getFilterCompletions(context));
    } else {
      // General context: suggest everything, prioritizing context resource type
      completions.push(...this.getFunctionCompletions(context));
      completions.push(...this.getOperatorCompletions(context));
      completions.push(...this.getKeywordCompletions(context));
      completions.push(...this.getFHIRResourceCompletions(context, documentContext));
    }

    // Filter and sort completions based on current input
    return this.filterAndSortCompletions(completions, context);
  }

  private getFunctionCompletions(context: CompletionContext): CompletionItem[] {
    const allFunctions = this.functionRegistry.getFunctionCompletionItems();
    
    // If we're after a dot, prioritize functions that make sense on collections/values
    if (context.isAfterDot && context.parentExpression) {
      // Sort functions by relevance based on context
      return allFunctions.map(func => {
        // Boost relevance for commonly used functions after properties (but still after properties)
        const commonAfterProperty = ['exists', 'empty', 'first', 'last', 'count', 'where', 'select'];
        if (commonAfterProperty.includes(func.label)) {
          return {
            ...func,
            sortText: `1_${func.label}` // Functions come after properties (0_)
          };
        }
        return {
          ...func,
          sortText: `2_${func.label}` // Less common functions come after common ones
        };
      });
    }
    
    // For non-dot contexts, ensure functions still come after properties
    return allFunctions.map(func => ({
      ...func,
      sortText: func.sortText || `1_${func.label}` // Ensure functions come after properties
    }));
  }

  private getOperatorCompletions(context: CompletionContext): CompletionItem[] {
    return this.functionRegistry.getOperatorCompletionItems();
  }

  private getKeywordCompletions(context: CompletionContext): CompletionItem[] {
    return this.functionRegistry.getKeywordCompletionItems();
  }

  private getFHIRResourceCompletions(context: CompletionContext, documentContext?: any): CompletionItem[] {
    // If we have document context, prioritize the context resource type
    if (documentContext?.resourceType) {
      return [{
        label: documentContext.resourceType,
        kind: CompletionItemKind.Class,
        detail: `FHIR ${documentContext.resourceType} resource (from context)`,
        documentation: {
          kind: MarkupKind.Markdown,
          value: `FHIR ${documentContext.resourceType} resource type from document context. Access properties using dot notation.`
        },
        insertText: documentContext.resourceType,
        sortText: `0_${documentContext.resourceType}` // Context resource gets highest priority
      }];
    }

    // Basic FHIR resource types for root-level completion
    const fhirResources = [
      'Patient', 'Observation', 'Condition', 'Procedure', 'MedicationRequest',
      'DiagnosticReport', 'Encounter', 'Organization', 'Practitioner', 'Location',
      'Device', 'Medication', 'Substance', 'AllergyIntolerance', 'Immunization'
    ];

    return fhirResources.map(resource => ({
      label: resource,
      kind: CompletionItemKind.Class,
      detail: `FHIR ${resource} resource`,
      documentation: {
        kind: MarkupKind.Markdown,
        value: `FHIR ${resource} resource type. Access properties using dot notation.`
      },
      insertText: resource,
      sortText: `1_${resource}` // Resources get high priority
    }));
  }

  private getFHIRResourcePropertyCompletions(context: CompletionContext, documentContext?: any): CompletionItem[] {
    // Check if we're at the beginning of an expression without any parent context
    const isRootContext = !context.parentExpression || context.parentExpression.trim() === '';
    
    if (isRootContext) {
      // If no parent expression but we have document context, suggest root properties
      if (documentContext?.resourceType && this.fhirResourceService) {
        const properties = this.fhirResourceService.getResourceProperties(documentContext.resourceType);
        return properties.map(prop => ({
          label: prop.name,
          kind: CompletionItemKind.Property,
          detail: `${documentContext.resourceType}.${prop.name}: ${prop.type}`,
          documentation: {
            kind: MarkupKind.Markdown,
            value: `**${prop.name}** (${prop.type})\\n\\n${prop.description}`
          },
          insertText: prop.name,
          sortText: `0_${prop.name}` // Context properties get high priority
        }));
      }
      
      // No document context, suggest common root-level completions
      return this.getCommonFHIRProperties();
    }

    // Determine the resource type from parent expression or use document context
    let resourceType = context.parentExpression ? this.extractResourceType(context.parentExpression) : null;
    if (!resourceType && documentContext?.resourceType) {
      // If the parent expression doesn't contain an explicit resource type,
      // but we have document context, treat it as a property access on the context resource
      resourceType = documentContext.resourceType;
    }

    if (!resourceType) {
      return this.getCommonFHIRProperties();
    }

    return this.getFHIRPropertiesForResource(resourceType);
  }

  private extractResourceType(expression: string): string | null {
    // Extract resource type from expressions like "Patient", "Patient.name", etc.
    // Handle complex expressions by getting the root identifier
    const trimmed = expression.trim();
    if (!trimmed) return null;
    
    // Match the first identifier (resource type)
    const match = trimmed.match(/^([A-Z][a-zA-Z0-9]*)/);
    if (match) {
      const resourceType = match[1];
      // Check if it's a known FHIR resource type
      const knownResourceTypes = [
        'Patient', 'Observation', 'Condition', 'Procedure', 'MedicationRequest',
        'DiagnosticReport', 'Encounter', 'Organization', 'Practitioner', 'Location',
        'Device', 'Medication', 'Substance', 'AllergyIntolerance', 'Immunization',
        'Bundle', 'Composition', 'DocumentReference', 'Binary', 'HealthcareService'
      ];
      
      if (knownResourceTypes.includes(resourceType)) {
        return resourceType;
      }
    }
    
    return null;
  }

  private getCommonFHIRProperties(): CompletionItem[] {
    // Common properties that exist on most FHIR resources
    const commonProperties = [
      { name: 'id', description: 'Resource identifier' },
      { name: 'meta', description: 'Resource metadata' },
      { name: 'text', description: 'Narrative text' },
      { name: 'extension', description: 'Extensions' },
      { name: 'modifierExtension', description: 'Modifier extensions' }
    ];

    return commonProperties.map(prop => ({
      label: prop.name,
      kind: CompletionItemKind.Property,
      detail: `FHIR property`,
      documentation: prop.description,
      insertText: prop.name,
      sortText: `0_${prop.name}` // Common properties should have same priority as resource properties
    }));
  }

  private getFHIRPropertiesForResource(resourceType: string): CompletionItem[] {
    // Resource-specific properties (basic implementation)
    const resourceProperties: Record<string, Array<{ name: string; description: string; type?: string }>> = {
      Patient: [
        { name: 'active', description: 'Whether this patient record is in active use', type: 'boolean' },
        { name: 'name', description: 'A name associated with the patient', type: 'HumanName[]' },
        { name: 'telecom', description: 'Contact details for the patient', type: 'ContactPoint[]' },
        { name: 'gender', description: 'Administrative gender', type: 'code' },
        { name: 'birthDate', description: 'Date of birth', type: 'date' },
        { name: 'address', description: 'Addresses for the patient', type: 'Address[]' },
        { name: 'deceased', description: 'Indicates if the patient is deceased', type: 'boolean | dateTime' },
        { name: 'contact', description: 'A contact party for the patient', type: 'BackboneElement[]' },
        { name: 'identifier', description: 'An identifier for this patient', type: 'Identifier[]' }
      ],
      Observation: [
        { name: 'status', description: 'Status of the observation', type: 'code' },
        { name: 'category', description: 'Classification of type of observation', type: 'CodeableConcept[]' },
        { name: 'code', description: 'Type of observation', type: 'CodeableConcept' },
        { name: 'subject', description: 'Who/what this observation is about', type: 'Reference' },
        { name: 'value', description: 'Actual result', type: 'Element' },
        { name: 'effectiveDateTime', description: 'Clinically relevant time/time-period', type: 'dateTime' },
        { name: 'issued', description: 'Date/Time this observation was made available', type: 'instant' },
        { name: 'performer', description: 'Who performed the observation', type: 'Reference[]' },
        { name: 'component', description: 'Component observations', type: 'BackboneElement[]' }
      ]
    };

    const properties = resourceProperties[resourceType] || [];
    
    return [
      ...this.getCommonFHIRProperties(),
      ...properties.map(prop => ({
        label: prop.name,
        kind: CompletionItemKind.Property,
        detail: prop.type ? `${resourceType}.${prop.name}: ${prop.type}` : `${resourceType}.${prop.name}`,
        documentation: {
          kind: MarkupKind.Markdown,
          value: `**${prop.name}**${prop.type ? ` (${prop.type})` : ''}\\n\\n${prop.description}`
        },
        insertText: prop.name,
        sortText: `0_${prop.name}` // Resource properties get high priority
      }))
    ];
  }

  private getFunctionParameterCompletions(context: CompletionContext): CompletionItem[] {
    // TODO: Analyze which function we're inside and suggest appropriate parameters
    return [];
  }

  private getValueCompletions(context: CompletionContext): CompletionItem[] {
    // Common FHIR value completions
    const commonValues = [
      { value: '"official"', description: 'Official name/identifier use' },
      { value: '"usual"', description: 'Usual name/identifier use' },
      { value: '"temp"', description: 'Temporary name/identifier use' },
      { value: '"final"', description: 'Final observation status' },
      { value: '"preliminary"', description: 'Preliminary observation status' },
      { value: '"amended"', description: 'Amended observation status' },
      { value: 'true', description: 'Boolean true value' },
      { value: 'false', description: 'Boolean false value' }
    ];

    return commonValues.map(val => ({
      label: val.value,
      kind: CompletionItemKind.Value,
      detail: 'FHIR value',
      documentation: val.description,
      insertText: val.value,
      sortText: `3_${val.value}`
    }));
  }

  private getFilterCompletions(context: CompletionContext): CompletionItem[] {
    // Common filter patterns
    const filterPatterns = [
      { pattern: 'use = "official"', description: 'Filter by use field' },
      { pattern: 'system = "phone"', description: 'Filter by system field' },
      { pattern: 'status = "final"', description: 'Filter by status field' },
      { pattern: 'exists()', description: 'Filter where field exists' },
      { pattern: 'empty()', description: 'Filter where field is empty' }
    ];

    return filterPatterns.map(filter => ({
      label: filter.pattern,
      kind: CompletionItemKind.Snippet,
      detail: 'Filter pattern',
      documentation: filter.description,
      insertText: filter.pattern,
      sortText: `2_${filter.pattern}`
    }));
  }

  private filterAndSortCompletions(
    completions: CompletionItem[],
    context: CompletionContext
  ): CompletionItem[] {
    if (!context.currentToken || context.currentToken.length === 0) {
      return completions.slice(0, 50); // Limit to 50 items when no filter
    }

    const filtered = completions.filter(item =>
      item.label.toLowerCase().startsWith(context.currentToken!.toLowerCase())
    );

    // Sort by relevance: exact match first, then alphabetical
    return filtered.sort((a, b) => {
      const aExact = a.label.toLowerCase() === context.currentToken!.toLowerCase();
      const bExact = b.label.toLowerCase() === context.currentToken!.toLowerCase();
      
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      
      return a.sortText?.localeCompare(b.sortText || '') || a.label.localeCompare(b.label);
    }).slice(0, 30); // Limit filtered results
  }
}