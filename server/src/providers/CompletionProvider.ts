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
import { createDebouncedMethod } from '../services/RequestThrottler';
import { getGlobalProfiler } from '../utils/PerformanceProfiler';
import * as fs from 'fs';
import * as path from 'path';

export interface CompletionContext {
  text: string;
  position: Position;
  triggerCharacter?: string;
  currentToken?: string;
  previousToken?: string;
  isAfterDot: boolean;
  isInFunction: boolean;
  isInBrackets: boolean;
  isInComment: boolean;
  isInDirective: boolean;
  directiveType?: string;
  directiveValue?: string;
  parentExpression?: string;
}

export class CompletionProvider {
  private functionRegistry: FHIRPathFunctionRegistry;
  private contextService?: FHIRPathContextService;
  private profiler = getGlobalProfiler();
  private debouncedProvideCompletions: (document: TextDocument, params: CompletionParams) => Promise<CompletionItem[]>;

  constructor(
    private fhirPathService: FHIRPathService,
    private fhirResourceService?: FHIRResourceService
  ) {
    this.functionRegistry = new FHIRPathFunctionRegistry();
    if (fhirResourceService) {
      this.contextService = new FHIRPathContextService(fhirResourceService);
    }

    // Create debounced version of completion method
    this.debouncedProvideCompletions = this.provideCompletionsInternal.bind(this);
  }

  async provideCompletions(
    document: TextDocument,
    params: CompletionParams
  ): Promise<CompletionItem[]> {
    return this.profiler.profile('completion', async () => {
      return this.debouncedProvideCompletions(document, params);
    });
  }

  private async provideCompletionsInternal(
    document: TextDocument,
    params: CompletionParams
  ): Promise<CompletionItem[]> {
    try {
      const lineText = document.getText({
        start: { line: params.position.line, character: 0 },
        end: { line: params.position.line, character: params.position.character }
      });

      console.log(`CompletionProvider: request for ${document.uri} at ${params.position.line}:${params.position.character}`);
      console.log(`Trigger character: ${params.context?.triggerCharacter}`);
      console.log(`Line text: "${lineText}"`);
      console.log(`Full line: "${document.getText({
        start: { line: params.position.line, character: 0 },
        end: { line: params.position.line + 1, character: 0 }
      }).replace('\n', '')}"`);

      // Generate cache key
      const cacheKey = cacheService.generateCompletionKey(
        document.uri,
        params.position,
        params.context?.triggerCharacter
      );

      // Check cache first
      const cached = cacheService.getCompletion(cacheKey);
      if (cached) {
        console.log(`Returning cached completions: ${cached.length} items`);
        return cached;
      }

      // Generate completions
      const context = this.analyzeCompletionContext(document, params.position, params.context?.triggerCharacter);
      console.log(`Context analysis result:`, {
        isInComment: context.isInComment,
        isInDirective: context.isInDirective,
        directiveType: context.directiveType,
        triggerCharacter: context.triggerCharacter,
        text: context.text.substring(0, 50) + (context.text.length > 50 ? '...' : '')
      });

      const completions = await this.getCompletionsForContext(context, document);
      console.log(`Generated ${completions.length} completions`);

      // Log first few completions for debugging
      if (completions.length > 0) {
        console.log(`First few completions:`, completions.slice(0, 3).map(c => ({ label: c.label, kind: c.kind })));
      }

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

    // Check if we're in a comment/directive context FIRST
    const commentContext = this.analyzeCommentContext(lineText, position.character);
    console.log(`Comment context for line "${lineText}" at pos ${position.character}:`, commentContext);

    // If we're in a directive, use the line text directly for completion
    if (commentContext.isInDirective) {
      return {
        text: lineText,
        position,
        triggerCharacter,
        currentToken: commentContext.currentToken,
        previousToken: undefined,
        isAfterDot: false,
        isInFunction: false,
        isInBrackets: false,
        isInComment: commentContext.isInComment,
        isInDirective: commentContext.isInDirective,
        directiveType: commentContext.directiveType,
        directiveValue: commentContext.directiveValue,
        parentExpression: undefined
      };
    }

    // For non-directive contexts, proceed with normal expression analysis
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
      isInComment: commentContext.isInComment,
      isInDirective: commentContext.isInDirective,
      directiveType: commentContext.directiveType,
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

  private analyzeCommentContext(lineText: string, cursorPosition: number): {
    isInComment: boolean;
    isInDirective: boolean;
    directiveType?: string;
    directiveValue?: string;
    currentToken?: string;
  } {
    const textBeforeCursor = lineText.substring(0, cursorPosition);

    // Check if we're in a comment
    const commentMatch = textBeforeCursor.match(/^\s*\/\//);
    if (!commentMatch) {
      return { isInComment: false, isInDirective: false };
    }

    // Check if the line contains @ symbol indicating directive
    if (!textBeforeCursor.includes('@')) {
      return { isInComment: true, isInDirective: false };
    }

    // Extract content after the @ symbol
    const atIndex = textBeforeCursor.lastIndexOf('@');
    if (atIndex === -1) {
      return { isInComment: true, isInDirective: false };
    }

    const afterAt = textBeforeCursor.substring(atIndex + 1);

    // If we're right after @, we're starting a directive
    if (afterAt.trim() === '') {
      return {
        isInComment: true,
        isInDirective: true,
        directiveType: undefined,
        directiveValue: undefined,
        currentToken: ''
      };
    }

    // Check if we have a partial or complete directive
    const directiveMatch = afterAt.match(/^(\w+)(\s+(.*))?$/);
    if (directiveMatch) {
      const [, directiveType, , directiveValue] = directiveMatch;

      // Extract the current token being typed (for file paths, etc.)
      let currentToken = '';
      if (directiveValue) {
        // For inputfile directive, preserve whitespace in file paths
        if (directiveType === 'inputfile') {
          // Don't split by whitespace - treat the entire value as the current token
          currentToken = directiveValue;
        } else {
          // For other directives, use the old behavior of splitting by whitespace
          const tokens = directiveValue.trim().split(/\s+/);
          currentToken = tokens[tokens.length - 1] || '';
        }
      } else if (afterAt.endsWith(' ')) {
        // If there's whitespace after the directive name but no value yet,
        // we're still in directive context and should trigger completion
        currentToken = '';
      }

      return {
        isInComment: true,
        isInDirective: true,
        directiveType: directiveType,
        directiveValue: directiveValue || '',
        currentToken: currentToken
      };
    }

    // We're in a directive context but haven't typed a valid directive yet
    return {
      isInComment: true,
      isInDirective: true,
      directiveType: undefined,
      directiveValue: undefined,
      currentToken: afterAt
    };
  }

  private async getCompletionsForContext(context: CompletionContext, document: TextDocument): Promise<CompletionItem[]> {
    const completions: CompletionItem[] = [];

    // Get document context if available
    let documentContext = null;
    if (this.contextService) {
      documentContext = await this.contextService.getCompletionContext(document);
    }

    if (context.isInDirective) {
      // In directive context: provide directive-specific completions
      completions.push(...this.getDirectiveCompletions(context, document));
    } else if (context.isAfterDot) {
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
        // Use Registry API to get functions by category
        const commonCategories = ['existence', 'navigation', 'manipulation', 'filtering'];
        const funcDetails = this.functionRegistry.getFunction(func.label);
        const isCommon = funcDetails && commonCategories.includes(funcDetails.category);

        if (isCommon) {
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
          detail: prop.type ? `${documentContext.resourceType}.${prop.name}: ${prop.type}` : `${documentContext.resourceType}.${prop.name}`,
          documentation: {
            kind: MarkupKind.Markdown,
            value: `**${prop.name}**${prop.type ? ` (${prop.type})` : ''}\\n\\n${prop.description || 'No description available'}`
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

  private getDirectiveCompletions(context: CompletionContext, document: TextDocument): CompletionItem[] {
    console.log(`Getting directive completions for directiveType: ${context.directiveType}`);
    const completions: CompletionItem[] = [];

    // If no directive type yet, suggest all available directives
    if (!context.directiveType) {
      console.log('No directive type, providing all directive names');

      // Always show all directives - let "last wins" behavior handle conflicts
      const directives = [
        {
          label: 'inputfile',
          kind: CompletionItemKind.Keyword,
          detail: 'Load input data from file',
          documentation: {
            kind: MarkupKind.Markdown,
            value: 'Load FHIR resource data from a JSON file.\n\nExample: `// @inputfile patient-example.json`\n\n**Note:** If multiple directives exist, the last one will be used.'
          },
          insertText: 'inputfile ',
          sortText: '0_inputfile'
        },
        {
          label: 'input',
          kind: CompletionItemKind.Keyword,
          detail: 'Inline input data',
          documentation: {
            kind: MarkupKind.Markdown,
            value: 'Provide FHIR resource data inline as JSON.\n\nExample: `// @input {"resourceType": "Patient", "id": "example"}`\n\n**Note:** If multiple directives exist, the last one will be used.'
          },
          insertText: 'input ',
          sortText: '0_input'
        },
        {
          label: 'resource',
          kind: CompletionItemKind.Keyword,
          detail: 'Specify resource type',
          documentation: {
            kind: MarkupKind.Markdown,
            value: 'Specify the FHIR resource type for context.\n\nExample: `// @resource Patient`\n\n**Note:** If multiple directives exist, the last one will be used.'
          },
          insertText: 'resource ',
          sortText: '0_resource'
        }
      ];

      completions.push(...directives);
      console.log(`Added ${directives.length} directive completions (all directives always available)`);
    } else {
      // Provide specific completions based on directive type
      console.log(`Providing completions for directive type: ${context.directiveType}`);
      switch (context.directiveType) {
        case 'inputfile':
          const fileCompletions = this.getFilePathCompletions(document, context.currentToken);
          completions.push(...fileCompletions);
          console.log(`Added ${fileCompletions.length} file path completions for path: "${context.currentToken}"`);
          break;
        case 'resource':
          const resourceCompletions = this.getFHIRResourceTypeCompletions();
          completions.push(...resourceCompletions);
          console.log(`Added ${resourceCompletions.length} resource type completions`);
          break;
        case 'input':
          const inputCompletions = this.getInlineInputCompletions();
          completions.push(...inputCompletions);
          console.log(`Added ${inputCompletions.length} input template completions`);
          break;
        default:
          console.log(`Unknown directive type: ${context.directiveType}`);
      }
    }

    console.log(`Total directive completions: ${completions.length}`);
    return completions;
  }


  private getFilePathCompletions(document: TextDocument, currentPath?: string): CompletionItem[] {
    const completions: CompletionItem[] = [];

    try {
      // Get the document's directory as the base path
      const documentUri = document.uri;
      const documentPath = documentUri.startsWith('file://')
        ? documentUri.substring(7)
        : documentUri;
      const documentDir = path.dirname(documentPath);

      // Determine the target directory based on current path
      let targetDir = documentDir;
      let searchPattern = '';

      if (currentPath) {
        if (currentPath.includes('/') || currentPath.includes('\\')) {
          // Extract directory and filename pattern
          const pathParts = currentPath.split(/[/\\]/);
          const filePattern = pathParts.pop() || '';
          const dirPath = pathParts.join(path.sep);

          if (dirPath) {
            targetDir = path.resolve(documentDir, dirPath);
          }
          searchPattern = filePattern.toLowerCase();
        } else {
          // Just a filename pattern
          searchPattern = currentPath.toLowerCase();
        }
      }

      // Read directory contents
      if (fs.existsSync(targetDir)) {
        const entries = fs.readdirSync(targetDir, { withFileTypes: true });

        for (const entry of entries) {
          const entryName = entry.name;

          // Skip hidden files and directories
          if (entryName.startsWith('.') && entryName !== '.' && entryName !== '..') {
            continue;
          }

          // Filter based on search pattern
          if (searchPattern && !entryName.toLowerCase().includes(searchPattern)) {
            continue;
          }

          if (entry.isDirectory()) {
            completions.push({
              label: entryName + '/',
              kind: CompletionItemKind.Folder,
              detail: 'Directory',
              insertText: entryName + '/',
              sortText: `0_${entryName}`
            });
          } else if (entry.isFile()) {
            // Prioritize JSON files for FHIR resources
            const isJsonFile = entryName.toLowerCase().endsWith('.json');
            const sortPrefix = isJsonFile ? '1' : '2';

            completions.push({
              label: entryName,
              kind: CompletionItemKind.File,
              detail: isJsonFile ? 'JSON file' : 'File',
              insertText: entryName,
              sortText: `${sortPrefix}_${entryName}`
            });
          }
        }
      }

      // Add common relative path suggestions if no specific path is being typed
      if (!currentPath || currentPath === '') {
        const commonPaths = [
          {
            label: './data/',
            kind: CompletionItemKind.Folder,
            detail: 'Data directory',
            insertText: './data/',
            sortText: '0_data'
          },
          {
            label: './examples/',
            kind: CompletionItemKind.Folder,
            detail: 'Examples directory',
            insertText: './examples/',
            sortText: '0_examples'
          },
          {
            label: '../',
            kind: CompletionItemKind.Folder,
            detail: 'Parent directory',
            insertText: '../',
            sortText: '0_parent'
          }
        ];

        // Only add common paths that actually exist
        for (const commonPath of commonPaths) {
          const fullPath = path.resolve(documentDir, commonPath.insertText);
          if (fs.existsSync(fullPath)) {
            completions.push(commonPath);
          }
        }
      }

    } catch (error) {
      console.error('Error reading file system for completions:', error);

      // Fallback to static suggestions if file system reading fails
      const fallbackPatterns = [
        {
          label: 'patient-example.json',
          kind: CompletionItemKind.File,
          detail: 'Example Patient resource file',
          insertText: 'patient-example.json',
          sortText: '1_patient-example.json'
        },
        {
          label: 'observation-example.json',
          kind: CompletionItemKind.File,
          detail: 'Example Observation resource file',
          insertText: 'observation-example.json',
          sortText: '1_observation-example.json'
        }
      ];

      completions.push(...fallbackPatterns);
    }

    return completions;
  }

  private getFHIRResourceTypeCompletions(): CompletionItem[] {
    const fhirResourceTypes = [
      'Patient', 'Observation', 'Condition', 'Procedure', 'MedicationRequest',
      'DiagnosticReport', 'Encounter', 'Organization', 'Practitioner', 'Location',
      'Device', 'Medication', 'Substance', 'AllergyIntolerance', 'Immunization',
      'Bundle', 'Composition', 'DocumentReference', 'Binary', 'HealthcareService',
      'Appointment', 'AppointmentResponse', 'Schedule', 'Slot', 'Coverage',
      'Claim', 'ClaimResponse', 'ExplanationOfBenefit', 'Goal', 'CarePlan',
      'CareTeam', 'ServiceRequest', 'ActivityDefinition', 'PlanDefinition'
    ];

    return fhirResourceTypes.map(resourceType => ({
      label: resourceType,
      kind: CompletionItemKind.Class,
      detail: `FHIR ${resourceType} resource type`,
      documentation: {
        kind: MarkupKind.Markdown,
        value: `FHIR ${resourceType} resource type for context declaration.`
      },
      insertText: resourceType,
      sortText: `0_${resourceType}`
    }));
  }

  private getInlineInputCompletions(): CompletionItem[] {
    const templates = [
      {
        label: 'Patient template',
        kind: CompletionItemKind.Snippet,
        detail: 'Basic Patient resource template',
        documentation: 'Template for a basic Patient resource',
        insertText: '{"resourceType": "Patient", "id": "example", "active": true, "name": [{"family": "Doe", "given": ["John"]}]}',
        sortText: '0_patient'
      },
      {
        label: 'Observation template',
        kind: CompletionItemKind.Snippet,
        detail: 'Basic Observation resource template',
        documentation: 'Template for a basic Observation resource',
        insertText: '{"resourceType": "Observation", "id": "example", "status": "final", "code": {"text": "Example"}, "subject": {"reference": "Patient/example"}}',
        sortText: '0_observation'
      }
    ];

    return templates;
  }

  private filterAndSortCompletions(
    completions: CompletionItem[],
    context: CompletionContext
  ): CompletionItem[] {
    // Special handling for directive contexts - don't limit completions even if no currentToken
    if (!context.currentToken || context.currentToken.length === 0) {
      // For directive contexts (especially @inputfile), show all completions without filtering
      if (context.isInDirective) {
        // Don't filter, just sort and return all completions for directive contexts
        return completions.sort((a, b) => {
          return a.sortText?.localeCompare(b.sortText || '') || a.label.localeCompare(b.label);
        }).slice(0, 50);
      }
      return completions.slice(0, 50); // Limit to 50 items when no filter for non-directive contexts
    }

    let filtered: CompletionItem[];

    // For directive completions, especially file paths, use different filtering logic
    if (context.isInDirective && context.directiveType === 'inputfile') {
      // For file paths, we need reactive filtering based on the current token
      // Extract the filename part from the current token for additional filtering
      const currentToken = context.currentToken.toLowerCase();

      // Check if currentToken is a complete directory path (ends with / or \)
      const isCompleteDirPath = currentToken.endsWith('/') || currentToken.endsWith('\\');

      if (isCompleteDirPath) {
        // If it's a complete directory path like "../" or "./data/",
        // don't filter - show all contents of that directory
        filtered = completions;
      } else {
        // Extract filename pattern for filtering
        let filenamePattern = '';

        if (currentToken.includes('/') || currentToken.includes('\\')) {
          // Extract just the filename part after the last separator
          const pathParts = currentToken.split(/[/\\]/);
          filenamePattern = pathParts[pathParts.length - 1] || '';
        } else {
          // The whole token is a filename pattern
          filenamePattern = currentToken;
        }

        // Apply reactive filtering based on the filename pattern
        if (filenamePattern) {
          filtered = completions.filter(item => {
            const itemLabel = item.label.toLowerCase();
            // For directories, check if they start with the pattern
            if (item.kind === CompletionItemKind.Folder) {
              return itemLabel.startsWith(filenamePattern) || itemLabel.includes(filenamePattern);
            }
            // For files, check if they contain the pattern (more flexible matching)
            return itemLabel.includes(filenamePattern);
          });
        } else {
          // No specific pattern, return all completions
          filtered = completions;
        }
      }
    } else if (context.isInDirective && !context.directiveType) {
      // For directive names, use prefix matching
      filtered = completions.filter(item =>
        item.label.toLowerCase().startsWith(context.currentToken!.toLowerCase())
      );
    } else {
      // For regular completions, use prefix matching
      filtered = completions.filter(item =>
        item.label.toLowerCase().startsWith(context.currentToken!.toLowerCase())
      );
    }

    // Sort by relevance: exact match first, then by sortText, then alphabetical
    return filtered.sort((a, b) => {
      const aExact = a.label.toLowerCase() === context.currentToken!.toLowerCase();
      const bExact = b.label.toLowerCase() === context.currentToken!.toLowerCase();

      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;

      return a.sortText?.localeCompare(b.sortText || '') || a.label.localeCompare(b.label);
    }).slice(0, 50); // Increased limit for file path completions
  }
}
