import {
  Hover,
  HoverParams,
  MarkupContent,
  MarkupKind,
  Position,
  Range
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { FHIRPathService } from '../parser/FHIRPathService';
import { FHIRPathFunctionRegistry, FHIRPathFunction, FHIRPathOperator } from '../services/FHIRPathFunctionRegistry';
import { FHIRPathContextService } from '../services/FHIRPathContextService';
import { cacheService } from '../services/CacheService';
import type { TypeInfo } from '@atomic-ehr/fhirpath';
import { ModelProviderService, EnhancedTypeInfo, TerminologyBinding } from '../services/ModelProviderService';

export interface HoverContext {
  text: string;
  position: Position;
  wordRange: Range;
  word: string;
  previousWord?: string;
  isAfterDot: boolean;
  parentExpression?: string;
}

export interface EnhancedHoverContent {
  title: string;
  type: string;
  hierarchy?: string[];
  cardinality?: string;
  required?: boolean;
  choiceTypes?: string[];
  terminology?: TerminologyBinding;
  inheritance?: string;
  description?: string;
  examples?: string[];
}

export interface ExpressionContext {
  isValid: boolean;
  resourceType: string;
  propertyPath: string[];
  fullPath?: string;
}

export class HoverProvider {
  private functionRegistry: FHIRPathFunctionRegistry;
  private hoverCache = new Map<string, { content: MarkupContent; timestamp: number }>();
  private readonly cacheExpiryMs = 600000; // 10 minutes

  constructor(
    private fhirPathService: FHIRPathService,
    private fhirPathContextService?: FHIRPathContextService,
    private modelProviderService?: ModelProviderService
  ) {
    this.functionRegistry = new FHIRPathFunctionRegistry();
  }

  async provideHover(
    document: TextDocument, 
    params: HoverParams
  ): Promise<Hover | null> {
    try {
      // Generate cache key
      const cacheKey = cacheService.generateHoverKey(document.uri, params.position);

      // Check cache first
      const cached = cacheService.getHover(cacheKey);
      if (cached) {
        return cached;
      }

      const context = this.analyzeHoverContext(document, params.position);
      if (!context || !context.word) {
        return null;
      }

      const hoverContent = await this.getHoverContentForContext(context, document);
      if (!hoverContent) {
        return null;
      }

      const result = {
        contents: hoverContent,
        range: context.wordRange
      };

      // Cache the result
      cacheService.setHover(cacheKey, result);

      return result;
    } catch (error) {
      console.error('Error providing hover:', error);
      return null;
    }
  }

  private analyzeHoverContext(document: TextDocument, position: Position): HoverContext | null {
    const text = document.getText();
    const offset = document.offsetAt(position);
    
    // Get word at position
    const wordRange = this.getWordRangeAtPosition(document, position);
    if (!wordRange) {
      return null;
    }

    const word = document.getText(wordRange);
    if (!word || word.trim().length === 0) {
      return null;
    }

    // Get text before cursor for context analysis
    const textBeforeCursor = text.substring(0, offset);
    const lineText = document.getText({
      start: { line: position.line, character: 0 },
      end: { line: position.line, character: position.character }
    });

    // Analyze context
    const isAfterDot = /\.\s*\w*$/.test(textBeforeCursor);
    const parentExpression = this.extractParentExpression(textBeforeCursor);
    const previousWord = this.getPreviousWord(lineText, wordRange.start.character);

    return {
      text: textBeforeCursor,
      position,
      wordRange,
      word: word.trim(),
      previousWord,
      isAfterDot,
      parentExpression
    };
  }

  private getWordRangeAtPosition(document: TextDocument, position: Position): Range | null {
    const line = document.getText({
      start: { line: position.line, character: 0 },
      end: { line: position.line + 1, character: 0 }
    });

    const character = position.character;
    
    // Find word boundaries
    let start = character;
    let end = character;

    // Move start back to find word beginning
    while (start > 0 && /[a-zA-Z0-9_]/.test(line[start - 1])) {
      start--;
    }

    // Move end forward to find word end
    while (end < line.length && /[a-zA-Z0-9_]/.test(line[end])) {
      end++;
    }

    // If no word found, return null
    if (start === end) {
      return null;
    }

    return {
      start: { line: position.line, character: start },
      end: { line: position.line, character: end }
    };
  }

  private extractParentExpression(text: string): string | undefined {
    // Extract the expression before the last dot for context
    const match = text.match(/([\w\.\[\]\(\)]+)\.[\w]*$/);
    return match ? match[1] : undefined;
  }

  private getPreviousWord(lineText: string, currentWordStart: number): string | undefined {
    // Get text before current word
    const textBefore = lineText.substring(0, currentWordStart).trim();
    
    // Find the last word before current position
    const match = textBefore.match(/([a-zA-Z_]\w*)(?:[^a-zA-Z0-9_]*)?$/);
    return match ? match[1] : undefined;
  }

  private async getHoverContentForContext(context: HoverContext, document: TextDocument): Promise<MarkupContent | null> {
    // Try enhanced hover first if ModelProviderService is available
    if (this.modelProviderService) {
      const fullExpression = this.extractFullExpression(context, document);
      if (fullExpression) {
        const enhancedHover = await this.createEnhancedTypeHover(fullExpression, context.position, document);
        if (enhancedHover) {
          return enhancedHover;
        }
      }
    }

    // Check if it's a function
    const func = this.functionRegistry.getFunction(context.word);
    if (func) {
      return this.createFunctionHover(func);
    }

    // Check if it's an operator
    const operator = this.functionRegistry.getOperator(context.word);
    if (operator) {
      return this.createOperatorHover(operator);
    }

    // Check if it's a keyword
    const keyword = this.functionRegistry.getKeyword(context.word);
    if (keyword) {
      return this.createKeywordHover(keyword);
    }

    // Check if it's a FHIR resource type
    if (this.isFHIRResourceType(context.word)) {
      return this.createFHIRResourceHover(context.word);
    }

    // Check if it's a FHIR resource property
    if (context.isAfterDot && context.parentExpression) {
      const resourceType = this.extractResourceType(context.parentExpression);
      if (resourceType) {
        // Check if it's a choice type property
        if (this.isChoiceProperty(context.word)) {
          const baseProperty = this.extractBasePropertyFromChoice(context.word);
          const typeInfo = { name: resourceType } as TypeInfo;
          return this.createChoiceTypeHover(baseProperty, context.word, typeInfo);
        }
        return this.createFHIRPropertyHover(context.word, resourceType);
      }
    }

    // Try to get type information for the expression
    const typeHover = await this.createTypeInferenceHover(context, document);
    if (typeHover) {
      return typeHover;
    }

    // Check if it's a general FHIR property
    if (context.isAfterDot) {
      return this.createGenericPropertyHover(context.word);
    }

    return null;
  }

  /**
   * Check if a property name is a choice type expansion
   */
  private isChoiceProperty(propertyName: string): boolean {
    return /^[a-z]+[A-Z]\w+$/.test(propertyName);
  }

  /**
   * Extract base property name from choice property
   */
  private extractBasePropertyFromChoice(choiceProperty: string): string {
    const match = choiceProperty.match(/^([a-z]+)[A-Z]/);
    return match ? match[1] : choiceProperty;
  }



  private createFunctionHover(func: FHIRPathFunction): MarkupContent {
    // Parse JSDoc description if available
    if (func.description.startsWith('/**')) {
      return this.createHoverFromJSDoc(func);
    }
    
    // Compact function format
    let content = `**${func.signature}** → \`${func.returnType}\`\n`;
    content += `${func.description}`;
    
    if (func.parameters && func.parameters.length > 0) {
      content += '\n\n**Parameters:** ';
      const paramList = func.parameters
        .filter(param => param)
        .map(param => {
          const optional = param.optional ? '?' : '';
          const name = param.name || 'unknown';
          const type = param.type || 'any';
          const shortType = this.shortenType(type);
          return `\`${name}${optional}\`: \`${shortType}\``;
        })
        .join(', ');
      content += paramList;
    }

    return {
      kind: MarkupKind.Markdown,
      value: content
    };
  }

  private createHoverFromJSDoc(func: FHIRPathFunction): MarkupContent {
    const parsed = this.parseJSDoc(func.description);
    
    // Compact format: signature → returnType
    let content = `**${func.signature}** → \`${func.returnType}\`\n`;
    content += `${parsed.description}`;
    
    // Inline parameters
    if (parsed.params.length > 0) {
      content += '\n\n**Parameters:** ';
      const paramList = parsed.params
        .map(param => `\`${param.name}${param.optional ? '?' : ''}\`: \`${this.shortenType(param.type || 'any')}\``)
        .join(', ');
      content += paramList;
    }
    
    // Inline examples
    if (parsed.examples.length > 0) {
      content += '\n\n**Examples:** ' + parsed.examples.map(ex => `\`${ex}\``).join(', ');
    }

    return {
      kind: MarkupKind.Markdown,
      value: content
    };
  }

  private parseJSDoc(jsdoc: string): { description: string; params: Array<{name: string; type: string; optional: boolean}>; examples: string[]; returnType?: string } {
    const lines = jsdoc.split('\n');
    let description = '';
    const params: Array<{name: string; type: string; optional: boolean}> = [];
    const examples: string[] = [];
    let returnType: string | undefined;
    
    let currentSection = 'description';
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('/**') || trimmed === '*/') {
        continue;
      }
      
      if (trimmed.startsWith('* @param')) {
        // Parse @param {Type} name? description
        const match = trimmed.match(/\* @param \{([^}]+)\} (\w+)(\?)?/);
        if (match) {
          params.push({
            name: match[2],
            type: match[1],
            optional: !!match[3]
          });
        }
        currentSection = 'param';
      } else if (trimmed.startsWith('* @returns')) {
        // Parse @returns {Type}
        const match = trimmed.match(/\* @returns \{([^}]+)\}/);
        if (match) {
          returnType = match[1];
        }
        currentSection = 'returns';
      } else if (trimmed.startsWith('* @example')) {
        // Parse @example code
        const example = trimmed.replace('* @example ', '');
        if (example) {
          examples.push(example);
        }
        currentSection = 'example';
      } else if (trimmed.startsWith('* ') && currentSection === 'description') {
        // Description line
        const text = trimmed.substring(2);
        if (description) {
          description += '\\n' + text;
        } else {
          description = text;
        }
      } else if (trimmed === '*' && currentSection === 'description') {
        // Empty line in description - add paragraph break
        if (description && !description.endsWith('\\n\\n')) {
          description += '\\n\\n';
        }
      }
    }
    
    return { 
      description: description.trim(), 
      params, 
      examples, 
      returnType 
    };
  }

  private createOperatorHover(operator: FHIRPathOperator): MarkupContent {
    // Compact operator format
    let content = `**${operator.symbol}** *${operator.name}* | Precedence: ${operator.precedence}\n`;
    content += `${operator.description}`;
    
    // Compact examples
    if (operator.examples.length > 0) {
      const exampleList = operator.examples.slice(0, 2).map(ex => `\`${ex}\``).join(', ');
      content += `\n\n**Examples:** ${exampleList}`;
    }

    return {
      kind: MarkupKind.Markdown,
      value: content
    };
  }

  private shortenType(type: string): string {
    // Shorten common type unions for better readability
    if (type.includes('|')) {
      const types = type.split(' | ').map(t => t.trim());
      if (types.length > 3) {
        return `${types.slice(0, 2).join('|')}|...`;
      }
      return types.join('|');
    }
    
    // Shorten array notation
    if (type.endsWith('[]')) {
      return type.replace('[]', '⎡⎦');
    }
    
    return type;
  }

  private createKeywordHover(keyword: any): MarkupContent {
    let content = `**${keyword.keyword}** *(keyword)*\n`;
    content += `${keyword.description}`;
    
    if (keyword.examples.length > 0) {
      const exampleList = keyword.examples.map((ex: string) => `\`${ex}\``).join(', ');
      content += `\n\n**Examples:** ${exampleList}`;
    }

    return {
      kind: MarkupKind.Markdown,
      value: content
    };
  }

  private createFHIRResourceHover(resourceType: string): MarkupContent {
    // Get resource information from model provider
    const properties = this.fhirPathService.getResourcePropertyDetails(resourceType);
    
    let content = `**🔷 ${resourceType}** *FHIR Resource*\n`;
    
    if (properties && properties.length > 0) {
      // Show key properties inline
      const keyProps = properties.slice(0, 3);
      const propList = keyProps
        .filter(prop => prop)
        .map(prop => {
          const badge = this.getCompactTypeBadge(prop.type);
          return `\`${prop.name || 'unknown'}\`${badge}`;
        })
        .join(', ');
      
      if (propList) {
        content += `\n**Key Properties:** ${propList}`;
        if (properties.length > 3) {
          content += ` *(+${properties.length - 3} more)*`;
        }
      }
    }

    // Add compact examples
    const examples = this.getResourceExamples(resourceType);
    if (examples.length > 0) {
      const exampleList = examples.slice(0, 2).map(ex => `\`${ex}\``).join(', ');
      content += `\n\n**Examples:** ${exampleList}`;
    }

    content += `\n\n[📚 Specification](https://hl7.org/fhir/R4/${resourceType.toLowerCase()}.html)`;

    return {
      kind: MarkupKind.Markdown,
      value: content
    };
  }

  /**
   * Get common FHIRPath examples for a resource type
   */
  private getResourceExamples(resourceType: string): string[] {
    const exampleMap: Record<string, string[]> = {
      'Patient': [
        'Patient.name.family',
        'Patient.birthDate < today()',
        'Patient.identifier.where(system = "MRN")'
      ],
      'Observation': [
        'Observation.status = "final"',
        'Observation.value as Quantity',
        'Observation.code.coding.exists()'
      ],
      'Condition': [
        'Condition.clinicalStatus.coding.code',
        'Condition.onset as dateTime',
        'Condition.severity.exists()'
      ]
    };
    
    return exampleMap[resourceType] || [];
  }

  private createFHIRPropertyHover(propertyName: string, resourceType: string): MarkupContent {
    const propertyInfo = this.getFHIRPropertyInfo(propertyName, resourceType);
    
    let content = `**📋 ${resourceType}.${propertyName}**\n`;
    
    // Compact property info on one line
    const typeBadge = this.getCompactTypeBadge(propertyInfo.type);
    const requiredBadge = propertyInfo.required ? '⚠️' : '';
    const cardinalityBadge = propertyInfo.cardinality ? ` \`${propertyInfo.cardinality}\`` : '';
    
    content += `${typeBadge}${requiredBadge}${cardinalityBadge} — ${propertyInfo.description}`;
    
    // Inline constraints
    if (propertyInfo.constraints && propertyInfo.constraints.length > 0) {
      const constraintList = propertyInfo.constraints.slice(0, 2).join(', ');
      content += `\n\n**Constraints:** ${constraintList}`;
    }
    
    // Inline binding
    if (propertyInfo.binding) {
      content += `\n\n**Binding:** ${propertyInfo.binding.strength}`;
      if (propertyInfo.binding.valueSet) {
        content += ` ([ValueSet](${propertyInfo.binding.valueSet}))`;
      }
    }
    
    // Inline examples
    if (propertyInfo.examples && propertyInfo.examples.length > 0) {
      const exampleList = propertyInfo.examples.slice(0, 2).map(ex => `\`${ex}\``).join(', ');
      content += `\n\n**Examples:** ${exampleList}`;
    }

    content += `\n\n[📚 Specification](https://hl7.org/fhir/R4/${resourceType.toLowerCase()}.html#${propertyName})`;

    return {
      kind: MarkupKind.Markdown,
      value: content
    };
  }

  private getFHIRPropertyInfo(propertyName: string, resourceType: string): {
    type: string;
    required?: boolean;
    cardinality?: string;
    description?: string;
    constraints?: string[];
    binding?: {
      strength: string;
      valueSet?: string;
      name?: string;
    };
    examples?: string[];
  } {
    // Get all properties for the resource type
    const allProperties = this.fhirPathService.getResourcePropertyDetails(resourceType);
    
    // Find the specific property
    const property = allProperties.find(p => p.name === propertyName);
    
    if (property) {
      return {
        type: property.type,
        cardinality: property.cardinality,
        description: property.description || `Property of ${resourceType} resource`,
        required: false, // TODO: Get from model provider when available
        constraints: [], // TODO: Get from model provider when available  
        binding: undefined, // TODO: Get from model provider when available
        examples: this.getPropertyExamples(propertyName, resourceType)
      };
    }
    
    // Fallback for unknown properties
    return {
      type: 'unknown',
      description: `Property of ${resourceType} resource`,
      cardinality: '[0..*]',
      required: false,
      examples: []
    };
  }

  private getPropertyExamples(propertyName: string, resourceType: string): string[] {
    // Common property examples based on property name patterns
    const exampleMap: Record<string, string[]> = {
      'id': [`"${resourceType.toLowerCase()}-example-1"`],
      'name': [
        '{ "family": "Smith", "given": ["John"] }',
        '"John Smith"'
      ],
      'status': ['"active"', '"final"', '"completed"'],
      'code': [
        '{ "coding": [{ "system": "http://loinc.org", "code": "12345" }] }'
      ],
      'value': ['"example value"', '123', 'true'],
      'text': ['"Example text content"'],
      'system': ['"http://terminology.hl7.org/CodeSystem/v2-0203"'],
      'display': ['"Example Display Text"'],
      'use': ['"official"', '"usual"', '"temp"'],
      'period': [
        '{ "start": "2023-01-01", "end": "2023-12-31" }'
      ],
      'reference': [`"${resourceType}/example-id"`],
      'identifier': [
        '{ "system": "http://example.org/id", "value": "12345" }'
      ]
    };

    // Return examples based on property name
    return exampleMap[propertyName] || [`"example ${propertyName} value"`];
  }

  private createGenericPropertyHover(propertyName: string): MarkupContent {
    const content = `**${propertyName}** *(property)* — FHIR resource property`;

    return {
      kind: MarkupKind.Markdown,
      value: content
    };
  }

  private isFHIRResourceType(name: string): boolean {
    // Use model provider instead of hardcoded list
    return this.fhirPathService.isValidResourceType(name);
  }

  private extractResourceType(expression: string): string | null {
    // Extract resource type from expressions like "Patient", "Patient.name", etc.
    const match = expression.match(/^(\w+)/);
    return match && this.isFHIRResourceType(match[1]) ? match[1] : null;
  }


  /**
   * Get a type badge for display formatting
   */
  private getTypeBadge(type: string | undefined): string {
    // Handle undefined or null type
    if (!type) {
      return '⚙️ `unknown`';
    }

    const typeBadges: Record<string, string> = {
      'boolean': '🔲 `boolean`',
      'string': '📝 `string`',
      'integer': '🔢 `integer`',
      'decimal': '🔢 `decimal`',
      'date': '📅 `date`',
      'dateTime': '📅 `dateTime`',
      'time': '⏰ `time`',
      'code': '🏷️ `code`',
      'uri': '🔗 `uri`',
      'url': '🌐 `url`',
      'id': '🆔 `id`',
      'oid': '🆔 `oid`',
      'uuid': '🆔 `uuid`',
      'canonical': '🔗 `canonical`',
      'base64Binary': '📎 `base64Binary`',
      'instant': '⚡ `instant`',
      'unsignedInt': '🔢 `unsignedInt`',
      'positiveInt': '🔢 `positiveInt`',
      'markdown': '📄 `markdown`',
      'xhtml': '🌐 `xhtml`'
    };

    // Handle complex types
    if (type.includes('[]')) {
      const baseType = type.replace('[]', '');
      return `📚 \`${type}\``;
    }
    
    if (type.startsWith('Reference')) {
      return '🔗 `Reference`';
    }
    
    if (type.includes('CodeableConcept')) {
      return '🏷️ `CodeableConcept`';
    }
    
    if (type.includes('Quantity')) {
      return '📏 `Quantity`';
    }
    
    if (type.includes('HumanName')) {
      return '👤 `HumanName`';
    }
    
    if (type.includes('ContactPoint')) {
      return '📞 `ContactPoint`';
    }
    
    if (type.includes('Address')) {
      return '🏠 `Address`';
    }
    
    if (type.includes('Identifier')) {
      return '🆔 `Identifier`';
    }

    return typeBadges[type] || `⚙️ \`${type}\``;
  }

  /**
   * Get a compact type badge for smaller displays
   */
  private getCompactTypeBadge(type: string | undefined): string {
    // Handle undefined or null type
    if (!type) {
      return '⚙️';
    }

    const compactBadges: Record<string, string> = {
      'boolean': '🔲',
      'string': '📝',
      'integer': '🔢',
      'decimal': '🔢',
      'date': '📅',
      'dateTime': '📅',
      'code': '🏷️',
      'uri': '🔗',
      'id': '🆔'
    };

    // Handle arrays and complex types
    if (type.includes('[]')) {
      return '📚';
    }
    
    if (type.includes('Reference')) return '🔗';
    if (type.includes('CodeableConcept')) return '🏷️';
    if (type.includes('Quantity')) return '📏';
    if (type.includes('HumanName')) return '👤';
    if (type.includes('ContactPoint')) return '📞';
    if (type.includes('Address')) return '🏠';
    if (type.includes('Identifier')) return '🆔';

    return compactBadges[type] || '⚙️';
  }

  /**
   * Truncate text to specified length with ellipsis
   */
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength - 3) + '...';
  }



  /**
   * Create hover with type inference information
   */
  private async createTypeInferenceHover(
    context: HoverContext,
    document: TextDocument
  ): Promise<MarkupContent | null> {
    try {
      // Extract the full expression up to the cursor
      const fullExpression = this.extractFullExpression(context, document);
      if (!fullExpression) {
        return null;
      }

      // Try to infer the resource type from context
      const resourceType = this.inferResourceType(fullExpression);
      
      // Get type information for the expression
      const typeInfo = this.fhirPathService.getExpressionType(fullExpression, resourceType);
      
      if (typeInfo && typeInfo.type) {
        return this.createTypeInfoHover(fullExpression, typeInfo, resourceType);
      }

      // If no specific type info, try to analyze the expression
      const analysis = this.fhirPathService.analyzeWithContext(fullExpression, resourceType);
      if (analysis && analysis.ast) {
        return this.createAnalysisHover(fullExpression, analysis, resourceType);
      }

    } catch (error) {
      console.warn('Type inference hover failed:', error);
    }

    return null;
  }

  /**
   * Extract full expression for type analysis
   */
  private extractFullExpression(context: HoverContext, document: TextDocument): string | null {
    const line = document.getText({
      start: { line: context.position.line, character: 0 },
      end: { line: context.position.line + 1, character: 0 }
    });

    // Find the start of the expression (simple heuristic)
    let start = 0;
    const beforeCursor = line.substring(0, context.position.character);
    
    // Look for common expression boundaries
    const boundaries = [';', '\n', '(', ')', '{', '}', '[', ']'];
    for (let i = beforeCursor.length - 1; i >= 0; i--) {
      if (boundaries.includes(beforeCursor[i])) {
        start = i + 1;
        break;
      }
    }

    // Extract from start to cursor position
    const expression = line.substring(start, context.position.character + context.word.length).trim();
    
    return expression.length > 0 ? expression : null;
  }

  /**
   * Infer resource type from expression context
   */
  private inferResourceType(expression: string): string | undefined {
    // Look for resource type at the beginning of the expression
    const resourceMatch = expression.match(/^\s*([A-Z][a-zA-Z]+)\b/);
    if (resourceMatch && this.isFHIRResourceType(resourceMatch[1])) {
      return resourceMatch[1];
    }

    // Check for common patterns
    const patterns = [
      /Patient\./,
      /Observation\./,
      /Condition\./,
      /Procedure\./,
      /MedicationRequest\./,
      /DiagnosticReport\./
    ];

    for (const pattern of patterns) {
      const match = expression.match(pattern);
      if (match) {
        return match[0].replace('.', '');
      }
    }

    return undefined;
  }

  /**
   * Create hover content with type information
   */
  private createTypeInfoHover(
    expression: string,
    typeInfo: TypeInfo,
    resourceType?: string
  ): MarkupContent {
    const typeStr = String(typeInfo.type);
    const cardinality = typeInfo.singleton ? '' : '[]';
    const contextStr = resourceType ? ` *in ${resourceType}*` : '';
    
    let content = `**🔍 ${expression}** → \`${typeStr}${cardinality}\`${contextStr}\n`;
    
    // Add description if available
    if ((typeInfo as any).description) {
      content += `${(typeInfo as any).description}\n`;
    }

    // Add compact cardinality
    const cardinalityText = typeInfo.singleton ? 'Single value' : 'Collection';
    content += `\n**Type:** ${cardinalityText}`;

    // Add type-specific suggestions inline
    const suggestions = this.getTypeSuggestions(typeStr, typeInfo.singleton ?? false);
    if (suggestions.length > 0) {
      content += `\n\n**💡 Tips:** ${suggestions.slice(0, 2).join(', ')}`;
    }

    return {
      kind: MarkupKind.Markdown,
      value: content
    };
  }

  /**
   * Create hover content from analysis result
   */
  private createAnalysisHover(
    expression: string,
    analysis: any,
    resourceType?: string
  ): MarkupContent {
    let content = `**🔍 ${expression}**`;
    
    if (resourceType) {
      content += ` *in ${resourceType}*`;
    }
    content += '\n';

    // Add AST information if available
    if (analysis.ast) {
      const nodeType = analysis.ast.type || 'Expression';
      content += `**Node:** ${nodeType}`;
    }

    // Add compact warnings
    if (analysis.diagnostics && analysis.diagnostics.length > 0) {
      const warnings = analysis.diagnostics.filter((d: any) => d.severity === 2);
      if (warnings.length > 0) {
        const warningList = warnings.map((w: any) => w.message).join(', ');
        content += `\n\n**⚠️ Warning:** ${warningList}`;
      }
    }

    return {
      kind: MarkupKind.Markdown,
      value: content
    };
  }

  /**
   * Get type-specific suggestions
   */
  private getTypeSuggestions(type: string, isSingleton: boolean): string[] {
    const suggestions: string[] = [];

    switch (type.toLowerCase()) {
      case 'boolean':
        suggestions.push('Can be used directly in conditions (no need for = true)');
        break;
      case 'integer':
      case 'decimal':
        suggestions.push('Can be compared with numeric operators (>, <, =, etc.)');
        if (!isSingleton) {
          suggestions.push('Consider using .sum() or .count() for collections');
        }
        break;
      case 'string':
        suggestions.push('Use string functions: contains(), startsWith(), endsWith()');
        if (!isSingleton) {
          suggestions.push('Consider using .join() to combine multiple strings');
        }
        break;
      case 'date':
      case 'datetime':
        suggestions.push('Compare with date literals: @2023-01-01 or today()');
        break;
    }

    if (!isSingleton && type !== 'unknown') {
      suggestions.push('Collection - consider .first(), .last(), or .single() to get single value');
      suggestions.push('Use .exists() to check if collection has any items');
      suggestions.push('Use .count() to get number of items');
    }

    return suggestions;
  }

  /**
   * Get cached hover content
   */
  private getCachedHover(expression: string): MarkupContent | undefined {
    const cached = this.hoverCache.get(expression);
    if (cached && Date.now() - cached.timestamp < this.cacheExpiryMs) {
      return cached.content;
    }
    return undefined;
  }

  /**
   * Cache hover content
   */
  private cacheHoverContent(expression: string, content: MarkupContent): void {
    this.hoverCache.set(expression, {
      content,
      timestamp: Date.now()
    });

    // Prevent cache from growing too large
    if (this.hoverCache.size > 100) {
      const oldestEntries = Array.from(this.hoverCache.entries())
        .sort(([, a], [, b]) => a.timestamp - b.timestamp)
        .slice(0, 20);
      
      for (const [key] of oldestEntries) {
        this.hoverCache.delete(key);
      }
    }
  }

  /**
   * Create enhanced type hover with ModelProviderService
   */
  private async createEnhancedTypeHover(
    expression: string,
    position: Position,
    document: TextDocument
  ): Promise<MarkupContent | undefined> {
    if (!this.modelProviderService) {
      return undefined;
    }

    // Check cache first
    const cached = this.getCachedHover(expression);
    if (cached) {
      return cached;
    }

    const context = this.analyzeExpressionContext(expression, position);
    if (!context.isValid) {
      return undefined;
    }

    const navigation = await this.modelProviderService.navigatePropertyPath(
      context.resourceType,
      context.propertyPath
    );

    if (!navigation.isValid || !navigation.finalType) {
      return undefined;
    }

    const enhanced = await this.modelProviderService.getEnhancedTypeInfo(
      navigation.finalType.name
    );

    const content = this.formatEnhancedHover(context, navigation.finalType, enhanced);
    
    // Cache the result
    this.cacheHoverContent(expression, content);
    
    return content;
  }

  /**
   * Analyze expression context for navigation
   */
  private analyzeExpressionContext(expression: string, position: Position): ExpressionContext {
    const match = expression.match(/^([A-Z]\w+)(?:\.(\w+(?:\.\w+)*))?$/);
    if (!match) {
      return { isValid: false, resourceType: '', propertyPath: [] };
    }

    const resourceType = match[1];
    const propertyPath = match[2] ? match[2].split('.') : [];
    const fullPath = propertyPath.length > 0 
      ? `${resourceType}.${propertyPath.join('.')}`
      : resourceType;

    return {
      isValid: true,
      resourceType,
      propertyPath,
      fullPath
    };
  }

  /**
   * Format enhanced hover content with collapsible sections
   */
  private formatEnhancedHover(
    context: ExpressionContext,
    typeInfo: TypeInfo,
    enhanced?: EnhancedTypeInfo
  ): MarkupContent {
    const fullPath = context.fullPath || context.resourceType;
    
    let content = `**🔷 ${fullPath}** *${typeInfo.name}*\n`;
    
    // Inline constraints
    if (enhanced?.constraints) {
      const constraintParts = [`\`${enhanced.constraints.cardinality}\``];
      if (enhanced.constraints.required) constraintParts.push('⚠️ Required');
      if (enhanced.constraints.minLength !== undefined) constraintParts.push(`min:${enhanced.constraints.minLength}`);
      if (enhanced.constraints.maxLength !== undefined) constraintParts.push(`max:${enhanced.constraints.maxLength}`);
      content += `**Constraints:** ${constraintParts.join(', ')}\n`;
    }
    
    // Inline choice types
    if (enhanced?.choiceTypes && enhanced.choiceTypes.length > 1) {
      const choices = enhanced.choiceTypes
        .slice(0, 3)
        .map(choice => {
          const choiceName = this.formatChoicePropertyName(context.propertyPath, choice.type.name);
          return `\`${choiceName}\``;
        })
        .join(', ');
      content += `\n**Choice Types:** ${choices}`;
      if (enhanced.choiceTypes.length > 3) {
        content += ` *(+${enhanced.choiceTypes.length - 3} more)*`;
      }
    }
    
    // Inline terminology
    if (enhanced?.terminology) {
      content += `\n\n**Binding:** ${enhanced.terminology.strength}`;
      if (enhanced.terminology.valueSet) {
        content += ` ([ValueSet](${enhanced.terminology.valueSet}))`;
      }
    }
    
    // Compact hierarchy
    if (enhanced?.hierarchy && enhanced.hierarchy.length > 1) {
      const hierarchy = enhanced.hierarchy.map(t => t.type.name).slice(-2).join(' → ');
      content += `\n\n**Hierarchy:** ${hierarchy}`;
    }
    
    content += `\n\n[📖 Specification](https://hl7.org/fhir/R4/${typeInfo.name.toLowerCase()}.html)`;
    
    return {
      kind: MarkupKind.Markdown,
      value: content
    };
  }

  /**
   * Format choice property name
   */
  private formatChoicePropertyName(propertyPath: string[], typeName: string): string {
    if (propertyPath.length === 0) {
      return typeName;
    }
    
    const lastProperty = propertyPath[propertyPath.length - 1];
    if (lastProperty.endsWith('[x]')) {
      const baseProperty = lastProperty.slice(0, -3);
      return baseProperty + typeName.charAt(0).toUpperCase() + typeName.slice(1);
    }
    
    return lastProperty + typeName;
  }

  /**
   * Find property source in type hierarchy
   */
  private findPropertySource(propertyPath: string[], hierarchy: TypeInfo[]): string | undefined {
    const targetProperty = propertyPath[propertyPath.length - 1];
    
    // Search hierarchy from most specific to most general
    for (let i = hierarchy.length - 1; i >= 0; i--) {
      const typeInHierarchy = hierarchy[i];
      // We would need ModelProvider method access here to check properties
      // For now, return undefined
    }
    
    return undefined;
  }

  /**
   * Create choice type hover with enhanced information
   */
  private async createChoiceTypeHover(
    baseProperty: string,
    choiceProperty: string,
    typeInfo: TypeInfo
  ): Promise<MarkupContent> {
    const choiceType = this.extractChoiceType(choiceProperty);
    
    let content = `**🔀 ${choiceProperty}** *Choice from ${baseProperty}[x]*\n`;
    content += `**Type:** \`${choiceType}\``;
    
    // Show other choice types inline
    if (this.modelProviderService) {
      const choiceTypes = await this.modelProviderService.resolveChoiceTypes(typeInfo);
      if (choiceTypes.length > 1) {
        const otherChoices = choiceTypes
          .filter(choice => choice.type.name !== choiceType)
          .slice(0, 3)
          .map(choice => {
            const altProperty = this.formatChoicePropertyName([baseProperty], choice.type.name);
            return `\`${altProperty}\``;
          })
          .join(', ');
        
        if (otherChoices) {
          content += `\n\n**Other Choices:** ${otherChoices}`;
          if (choiceTypes.length > 4) {
            content += ` *(+${choiceTypes.length - 4} more)*`;
          }
        }
      }
    }
    
    // Add compact type-specific info
    const compactInfo = this.getCompactTypeInfo(choiceType);
    if (compactInfo) {
      content += `\n\n${compactInfo}`;
    }
    
    return {
      kind: MarkupKind.Markdown,
      value: content
    };
  }

  /**
   * Extract choice type from property name
   */
  private extractChoiceType(propertyName: string): string {
    // Extract type from patterns like "valueQuantity" -> "Quantity"
    const match = propertyName.match(/^[a-z]+([A-Z]\w+)$/);
    if (match) {
      return match[1];
    }
    return 'unknown';
  }

  /**
   * Add type-specific information for common FHIR types
   */
  private getCompactTypeInfo(typeName: string): string | null {
    const typeInfoMap: Record<string, string> = {
      'Quantity': '**Properties:** \`value\`, \`unit\`, \`system\`, \`code\`',
      'CodeableConcept': '**Properties:** \`coding[]\`, \`text\`',
      'Reference': '**Properties:** \`reference\`, \`type\`, \`identifier\`, \`display\`',
      'Period': '**Properties:** \`start\`, \`end\`',
      'HumanName': '**Properties:** \`family\`, \`given[]\`, \`use\`, \`period\`',
      'Address': '**Properties:** \`line[]\`, \`city\`, \`state\`, \`postalCode\`, \`country\`',
      'ContactPoint': '**Properties:** \`system\`, \`value\`, \`use\`, \`rank\`',
      'Identifier': '**Properties:** \`system\`, \`value\`, \`use\`, \`type\`'
    };
    
    return typeInfoMap[typeName] || null;
  }
}