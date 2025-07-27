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

export interface HoverContext {
  text: string;
  position: Position;
  wordRange: Range;
  word: string;
  previousWord?: string;
  isAfterDot: boolean;
  parentExpression?: string;
}

export class HoverProvider {
  private functionRegistry: FHIRPathFunctionRegistry;

  constructor(
    private fhirPathService: FHIRPathService,
    private fhirPathContextService?: FHIRPathContextService
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
        return this.createFHIRPropertyHover(context.word, resourceType);
      }
    }

    // Check if it's a general FHIR property
    if (context.isAfterDot) {
      return this.createGenericPropertyHover(context.word);
    }

    return null;
  }



  private createFunctionHover(func: FHIRPathFunction): MarkupContent {
    // Parse JSDoc description if available
    if (func.description.startsWith('/**')) {
      return this.createHoverFromJSDoc(func);
    }
    
    // Fallback to old format
    let content = `\`${func.signature}\` → \`${func.returnType}\`\\n\\n`;
    content += `${func.description}\\n`;
    
    if (func.parameters && func.parameters.length > 0) {
      content += '\\n**Parameters:**\\n';
      func.parameters.forEach(param => {
        if (!param) return;
        const optional = param.optional ? ' *(optional)*' : '';
        const name = param.name || 'unknown';
        const type = param.type || 'any';
        const shortType = this.shortenType(type);
        content += `• \`${name}\` \`${shortType}\`${optional}\\n`;
      });
    }

    return {
      kind: MarkupKind.Markdown,
      value: content
    };
  }

  private createHoverFromJSDoc(func: FHIRPathFunction): MarkupContent {
    const parsed = this.parseJSDoc(func.description);
    
    // Build clean format: signature → returnType
    let content = `\`${func.signature}\` → \`${func.returnType}\`\\n\\n`;
    
    // Description
    content += `${parsed.description}\\n`;
    
    // Parameters
    if (parsed.params.length > 0) {
      content += '\\n**Parameters:**\\n';
      parsed.params.forEach(param => {
        content += `• \`${param.name}\` \`${this.shortenType(param.type || 'any')}\`${param.optional ? ' *(optional)*' : ''}\\n`;
      });
    }
    
    // Examples
    if (parsed.examples.length > 0) {
      content += '\\n**Examples:**\\n';
      parsed.examples.forEach(example => {
        content += `\`${example}\`\\n`;
      });
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
    // Clean operator header
    let content = `\`${operator.symbol}\` **${operator.name}**\\n\\n`;
    
    // Description
    content += `${operator.description}\\n`;
    
    // Compact precedence and associativity info
    content += `\\n*Precedence: ${operator.precedence}, ${operator.associativity} associative*\\n`;
    
    // Examples (more compact)
    if (operator.examples.length > 0) {
      content += '\\n**Examples:**\\n';
      operator.examples.slice(0, 2).forEach(example => {
        content += `\`${example}\`\\n`;
      });
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
    let content = `**${keyword.keyword}** *(keyword)*\\n\\n`;
    content += `${keyword.description}\\n\\n`;
    
    if (keyword.examples.length > 0) {
      content += '**Examples:**\\n';
      keyword.examples.forEach((example: string) => {
        content += `\`\`\`fhirpath\\n${example}\\n\`\`\`\\n`;
      });
    }

    return {
      kind: MarkupKind.Markdown,
      value: content
    };
  }

  private createFHIRResourceHover(resourceType: string): MarkupContent {
    const resourceInfo = this.getFHIRResourceInfo(resourceType);
    
    let content = `### 🔷 ${resourceType}\\n`;
    content += `<sub>**FHIR Resource** • ${resourceInfo.version || 'R4'} • ${resourceInfo.maturity || 'Normative'}</sub>\\n\\n`;
    content += `<sub>${resourceInfo.description}</sub>\\n\\n`;
    
    if (resourceInfo.commonProperties.length > 0) {
      // Show only top 3-4 most important properties in collapsed format
      const keyProps = resourceInfo.commonProperties.slice(0, 4);
      content += `<details>\\n<summary><sub>📝 <strong>Key Properties</strong> (${resourceInfo.commonProperties.length} total)</sub></summary>\\n\\n`;
      
      keyProps.forEach((prop: any) => {
        if (!prop) return; // Skip if prop is undefined
        const badge = this.getCompactTypeBadge(prop.type);
        const reqBadge = prop.required ? '⚠️' : '';
        const description = prop.description || 'No description available';
        content += `<sub>• **\`${prop.name || 'unknown'}\`** ${badge}${reqBadge} — ${this.truncateText(description, 60)}</sub>\\n`;
      });
      
      if (resourceInfo.commonProperties.length > 4) {
        content += `<sub>• <em>...and ${resourceInfo.commonProperties.length - 4} more</em></sub>\\n`;
      }
      content += `\\n</details>\\n\\n`;
    }

    // Compact examples in collapsible section
    if (resourceInfo.examples && resourceInfo.examples.length > 0) {
      content += `<details>\\n<summary><sub>💡 <strong>FHIRPath Examples</strong></sub></summary>\\n\\n`;
      const topExamples = resourceInfo.examples.slice(0, 3);
      topExamples.forEach((example: string) => {
        content += `<sub>\`${example}\`</sub>\\n`;
      });
      content += `\\n</details>\\n\\n`;
    }

    content += `<sub>📚 [Specification](https://hl7.org/fhir/R4/${resourceType.toLowerCase()}.html)</sub>`;

    return {
      kind: MarkupKind.Markdown,
      value: content
    };
  }

  private createFHIRPropertyHover(propertyName: string, resourceType: string): MarkupContent {
    const propertyInfo = this.getFHIRPropertyInfo(propertyName, resourceType);
    
    let content = `### 📋 ${resourceType}.${propertyName}\\n`;
    
    // Compact property badge and basic info
    const typeBadge = this.getCompactTypeBadge(propertyInfo.type);
    const requiredBadge = propertyInfo.required ? '⚠️' : '✨';
    const cardinalityBadge = propertyInfo.cardinality ? ` \`${propertyInfo.cardinality}\`` : '';
    
    content += `<sub>${requiredBadge} ${typeBadge}${cardinalityBadge}</sub>\\n\\n`;
    content += `<sub>${propertyInfo.description}</sub>\\n\\n`;
    
    // Compact constraints in collapsible section
    if (propertyInfo.constraints && propertyInfo.constraints.length > 0) {
      content += `<details>\\n<summary><sub>🔒 <strong>Constraints</strong></sub></summary>\\n\\n`;
      propertyInfo.constraints.forEach((constraint: string) => {
        content += `<sub>• ${constraint}</sub>\\n`;
      });
      content += `\\n</details>\\n\\n`;
    }
    
    // Compact binding information
    if (propertyInfo.binding) {
      content += `<details>\\n<summary><sub>🏷️ <strong>Value Set</strong> (${propertyInfo.binding.strength})</sub></summary>\\n\\n`;
      if (propertyInfo.binding.valueSet) {
        content += `<sub>[${propertyInfo.binding.name || 'View ValueSet'}](${propertyInfo.binding.valueSet})</sub>\\n`;
      }
      content += `\\n</details>\\n\\n`;
    }
    
    // Compact examples
    if (propertyInfo.examples && propertyInfo.examples.length > 0) {
      content += `<details>\\n<summary><sub>💡 <strong>Examples</strong></sub></summary>\\n\\n`;
      const topExamples = propertyInfo.examples.slice(0, 3);
      topExamples.forEach((example: string) => {
        content += `<sub>\`${example}\`</sub>\\n`;
      });
      content += `\\n</details>\\n\\n`;
    }

    content += `<sub>📚 [Specification](https://hl7.org/fhir/R4/${resourceType.toLowerCase()}.html#${propertyName})</sub>`;

    return {
      kind: MarkupKind.Markdown,
      value: content
    };
  }

  private createGenericPropertyHover(propertyName: string): MarkupContent {
    const content = `**${propertyName}** *(property)*\\n\\nFHIR resource property. Use with appropriate resource context.`;

    return {
      kind: MarkupKind.Markdown,
      value: content
    };
  }

  private isFHIRResourceType(name: string): boolean {
    const fhirResourceTypes = [
      'Patient', 'Observation', 'Condition', 'Procedure', 'MedicationRequest',
      'DiagnosticReport', 'Encounter', 'Organization', 'Practitioner', 'Location',
      'Device', 'Medication', 'Substance', 'AllergyIntolerance', 'Immunization',
      'Bundle', 'Composition', 'DocumentReference', 'Binary', 'HealthcareService',
      'Endpoint', 'Schedule', 'Slot', 'Appointment', 'AppointmentResponse'
    ];
    return fhirResourceTypes.includes(name);
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

  private getFHIRResourceInfo(resourceType: string): any {
    const resourceInfoMap: Record<string, any> = {
      Patient: {
        description: 'Demographics and other administrative information about an individual or animal receiving care or other health-related services.',
        version: 'R4',
        maturity: 'Normative',
        examples: [
          'Patient.name.family',
          'Patient.active = true',
          'Patient.birthDate < today()',
          'Patient.telecom.where(system = "phone").value'
        ],
        commonProperties: [
          { name: 'id', type: 'id', required: true, cardinality: '0..1', description: 'Logical id of this artifact' },
          { name: 'active', type: 'boolean', required: false, cardinality: '0..1', description: 'Whether this patient record is in active use' },
          { name: 'name', type: 'HumanName[]', required: false, cardinality: '0..*', description: 'A name associated with the patient' },
          { name: 'telecom', type: 'ContactPoint[]', required: false, cardinality: '0..*', description: 'A contact detail for the patient' },
          { name: 'gender', type: 'code', required: false, cardinality: '0..1', description: 'Administrative gender (male | female | other | unknown)' },
          { name: 'birthDate', type: 'date', required: false, cardinality: '0..1', description: 'The date of birth for the patient' },
          { name: 'address', type: 'Address[]', required: false, cardinality: '0..*', description: 'An address for the patient' },
          { name: 'identifier', type: 'Identifier[]', required: false, cardinality: '0..*', description: 'An identifier for this patient' }
        ]
      },
      Observation: {
        description: 'Measurements and simple assertions made about a patient, device or other subject.',
        version: 'R4',
        maturity: 'Normative',
        examples: [
          'Observation.status = "final"',
          'Observation.value.as(Quantity).value',
          'Observation.code.coding.code',
          'Observation.component.where(code.coding.code = "8480-6").value'
        ],
        commonProperties: [
          { name: 'id', type: 'id', required: true, cardinality: '0..1', description: 'Logical id of this artifact' },
          { name: 'status', type: 'code', required: true, cardinality: '1..1', description: 'Status of the observation (registered | preliminary | final | amended +)' },
          { name: 'category', type: 'CodeableConcept[]', required: false, cardinality: '0..*', description: 'Classification of type of observation' },
          { name: 'code', type: 'CodeableConcept', required: true, cardinality: '1..1', description: 'Type of observation (code / type)' },
          { name: 'subject', type: 'Reference', required: false, cardinality: '0..1', description: 'Who and/or what the observation is about' },
          { name: 'value[x]', type: 'Element', required: false, cardinality: '0..1', description: 'Actual result (Quantity, CodeableConcept, string, etc.)' },
          { name: 'component', type: 'BackboneElement[]', required: false, cardinality: '0..*', description: 'Component observations' }
        ]
      },
      Condition: {
        description: 'A clinical condition, problem, diagnosis, or other event, situation, issue, or clinical concept that has risen to a level of concern.',
        version: 'R4',
        maturity: 'Normative',
        examples: [
          'Condition.code.coding.code',
          'Condition.clinicalStatus = "active"',
          'Condition.subject.reference',
          'Condition.onset.as(dateTime)'
        ],
        commonProperties: [
          { name: 'id', type: 'id', required: true, cardinality: '0..1', description: 'Logical id of this artifact' },
          { name: 'clinicalStatus', type: 'CodeableConcept', required: false, cardinality: '0..1', description: 'active | recurrence | relapse | inactive | remission | resolved' },
          { name: 'verificationStatus', type: 'CodeableConcept', required: false, cardinality: '0..1', description: 'unconfirmed | provisional | differential | confirmed | refuted' },
          { name: 'code', type: 'CodeableConcept', required: false, cardinality: '0..1', description: 'Identification of the condition, problem or diagnosis' },
          { name: 'subject', type: 'Reference', required: true, cardinality: '1..1', description: 'Who has the condition?' },
          { name: 'onset[x]', type: 'Element', required: false, cardinality: '0..1', description: 'Estimated or actual date or date-time the condition began' }
        ]
      }
    };

    return resourceInfoMap[resourceType] || {
      description: `FHIR ${resourceType} resource.`,
      commonProperties: [
        { name: 'id', type: 'id', description: 'Logical id of this artifact' },
        { name: 'meta', type: 'Meta', description: 'Metadata about the resource' }
      ]
    };
  }

  private getFHIRPropertyInfo(propertyName: string, resourceType: string): any {
    const propertyInfoMap: Record<string, Record<string, any>> = {
      Patient: {
        active: {
          description: 'Whether this patient record is in active use. A record is marked as inactive when it should no longer be used.',
          type: 'boolean',
          cardinality: '0..1',
          required: false,
          examples: ['Patient.active', 'Patient.active = true', 'Patient.where(active = false)'],
          constraints: ['When absent, no inference can be made about whether the patient record is active or not']
        },
        name: {
          description: 'A name associated with the patient. Multiple names may be recorded with different purposes.',
          type: 'HumanName[]',
          cardinality: '0..*',
          required: false,
          examples: ['Patient.name', 'Patient.name.family', 'Patient.name.where(use = "official").family'],
          constraints: ['A patient may have multiple names with different uses or applicable periods']
        },
        birthDate: {
          description: 'The date of birth for the patient. At least an estimated year should be provided as a guess.',
          type: 'date',
          cardinality: '0..1',
          required: false,
          examples: ['Patient.birthDate', 'Patient.birthDate > @1980-01-01', 'Patient.birthDate < today()'],
          constraints: ['If a date is partial, e.g. just year or year + month, this SHALL be valid date']
        },
        gender: {
          description: 'Administrative gender - the gender that the patient is considered to have for administration.',
          type: 'code',
          cardinality: '0..1',
          required: false,
          examples: ['Patient.gender', 'Patient.gender = "female"'],
          binding: {
            strength: 'required',
            name: 'AdministrativeGender',
            valueSet: 'http://hl7.org/fhir/ValueSet/administrative-gender'
          }
        }
      },
      Observation: {
        status: {
          description: 'The status of the result value. This is typically used to indicate whether the result is preliminary, final, amended, etc.',
          type: 'code',
          cardinality: '1..1',
          required: true,
          examples: ['Observation.status', 'Observation.status = "final"', 'Observation.where(status = "preliminary")'],
          binding: {
            strength: 'required',
            name: 'ObservationStatus',
            valueSet: 'http://hl7.org/fhir/ValueSet/observation-status'
          },
          constraints: ['registered | preliminary | final | amended | corrected | cancelled | entered-in-error | unknown']
        },
        value: {
          description: 'The information determined as a result of making the observation, if the information has a simple value.',
          type: 'Element',
          cardinality: '0..1',
          required: false,
          examples: ['Observation.value', 'Observation.value.as(Quantity)', 'Observation.value.as(string)'],
          constraints: ['Must have either a value or component observations (but not both)', 'valueQuantity, valueCodeableConcept, valueString, etc.']
        },
        code: {
          description: 'Describes what was observed. Sometimes this is called the observation "name".',
          type: 'CodeableConcept',
          cardinality: '1..1',
          required: true,
          examples: ['Observation.code', 'Observation.code.coding.code', 'Observation.code.text'],
          binding: {
            strength: 'example',
            name: 'LOINCCodes',
            valueSet: 'http://hl7.org/fhir/ValueSet/observation-codes'
          },
          constraints: ['Should use LOINC codes where possible']
        }
      }
    };

    const resourceProps = propertyInfoMap[resourceType];
    if (resourceProps && resourceProps[propertyName]) {
      return resourceProps[propertyName];
    }

    // Default property info
    return {
      description: `${resourceType} property: ${propertyName}`,
      type: 'Element',
      cardinality: '0..*',
      required: false,
      examples: [`${resourceType}.${propertyName}`],
      constraints: []
    };
  }
}