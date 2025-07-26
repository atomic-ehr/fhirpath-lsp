import { registry, OperationInfo, OperationMetadata } from '@atomic-ehr/fhirpath';

// Extended interface to handle enhanced syntax information from registry
interface OperationInfoWithSyntax extends OperationInfo {
  syntax: {
    notation: string;
    form?: 'prefix' | 'infix' | 'postfix';
    precedence?: number;
    associativity?: 'left' | 'right';
  };
}
import { 
  FHIRPathFunction, 
  FHIRPathOperator, 
  FHIRPathKeyword,
  FHIRPathParameter 
} from './FHIRPathFunctionRegistry';

export interface OperationDocumentation {
  description: string;
  category?: string;
  examples?: Array<{
    expression: string;
    description?: string;
  }>;
  related?: string[];
}

export interface IRegistryAdapter {
  getFunctions(): FHIRPathFunction[];
  getOperators(): FHIRPathOperator[];
  getKeywords(): FHIRPathKeyword[];
  getOperationInfo(name: string): OperationInfo | undefined;
  hasOperation(name: string): boolean;
  getDocumentation(name: string): OperationDocumentation | undefined;
}

export class RegistryAdapter implements IRegistryAdapter {
  private functionsCache?: FHIRPathFunction[];
  private operatorsCache?: FHIRPathOperator[];
  private documentationMap: Map<string, OperationDocumentation> = new Map();

  constructor() {
    this.initializeDocumentation();
  }

  getFunctions(): FHIRPathFunction[] {
    if (!this.functionsCache) {
      this.functionsCache = this.convertFunctions();
    }
    return this.functionsCache;
  }

  getOperators(): FHIRPathOperator[] {
    if (!this.operatorsCache) {
      this.operatorsCache = this.convertOperators();
    }
    return this.operatorsCache;
  }

  getKeywords(): FHIRPathKeyword[] {
    // Keywords are not in the registry, return static list
    return [
      {
        keyword: 'true',
        description: 'Boolean literal representing true value.',
        examples: ['Patient.active = true', 'Observation.value.exists() = true']
      },
      {
        keyword: 'false',
        description: 'Boolean literal representing false value.',
        examples: ['Patient.active = false', 'Observation.value.empty() = false']
      },
      {
        keyword: 'null',
        description: 'Null literal representing empty/missing value.',
        examples: ['Patient.deceased = null', 'Observation.value != null']
      }
    ];
  }

  getOperationInfo(name: string): OperationInfo | undefined {
    return registry.getOperationInfo(name);
  }

  hasOperation(name: string): boolean {
    return registry.hasOperation(name);
  }

  getDocumentation(name: string): OperationDocumentation | undefined {
    return this.documentationMap.get(name);
  }

  private convertFunctions(): FHIRPathFunction[] {
    const functions = registry.listFunctions();
    return functions.map(metadata => this.convertToFHIRPathFunction(metadata));
  }

  private convertOperators(): FHIRPathOperator[] {
    const operators = registry.listOperators();
    return operators.map(metadata => this.convertToFHIRPathOperator(metadata));
  }

  private convertToFHIRPathFunction(metadata: OperationMetadata): FHIRPathFunction {
    const info = registry.getOperationInfo(metadata.name);
    const doc = this.getDocumentation(metadata.name);
    
    // Extract parameters from operation info with enhanced information
    const parameters: FHIRPathParameter[] = this.extractFunctionParameters(info);

    // Determine return type with enhanced logic
    const returnType = this.determineReturnType(info);

    // Get or infer category with better categorization
    const category = doc?.category || this.inferCategory(metadata.name);

    return {
      name: metadata.name,
      signature: this.buildSignature(metadata.name, parameters),
      description: this.generateJSDocDescription(metadata.name, info, doc, parameters, returnType),
      examples: doc?.examples?.map(e => e.expression) || info?.examples || [],
      returnType,
      parameters,
      category: category as any
    };
  }

  private convertToFHIRPathOperator(metadata: OperationMetadata): FHIRPathOperator {
    const info = registry.getOperationInfo(metadata.name) as OperationInfoWithSyntax | undefined;
    const doc = this.getDocumentation(metadata.name);
    
    // For operators, the name is the symbol
    const symbol = metadata.name;
    
    // Extract precedence and associativity from registry if available
    const precedence = this.extractOperatorPrecedence(info, symbol);
    const associativity = this.extractOperatorAssociativity(info, symbol);
    
    return {
      symbol,
      name: this.getOperatorDisplayName(symbol),
      description: this.extractCleanDescription(this.generateOperatorDescription(symbol, info, doc)),
      precedence,
      associativity,
      examples: doc?.examples?.map(e => e.expression) || info?.examples || []
    };
  }

  private buildSignature(name: string, parameters: FHIRPathParameter[]): string {
    if (parameters.length === 0) {
      return `${name}()`;
    }
    
    const paramList = parameters.map(p => {
      const optional = p.optional ? '?' : '';
      const typeHint = p.type && p.type !== 'any' ? `: ${p.type}` : '';
      return `${p.name}${optional}${typeHint}`;
    }).join(', ');
    
    return `${name}(${paramList})`;
  }

  private determineReturnType(info: OperationInfo | undefined): string {
    if (!info?.signature.output) {
      return 'any';
    }
    
    const output = info.signature.output;
    const type = output.type || 'any';
    const cardinality = output.cardinality;
    
    if (cardinality === 'collection') {
      return `${type}[]`;
    }
    
    return type;
  }

  private extractFunctionParameters(info: OperationInfo | undefined): FHIRPathParameter[] {
    if (!info?.signature.parameters) {
      return [];
    }
    
    return info.signature.parameters.map(param => ({
      name: param.name,
      type: this.formatParameterType(param.types, param.cardinality),
      description: this.generateParameterDescription(param.name, param.types, param.cardinality),
      optional: param.optional || false
    }));
  }

  private formatParameterType(types: string[] | undefined, cardinality: string | undefined): string {
    if (!types || types.length === 0) {
      const baseType = 'any';
      return cardinality === 'collection' ? `${baseType}[]` : baseType;
    }
    
    const typeStr = types.length === 1 ? types[0] : types.join(' | ');
    return cardinality === 'collection' ? `${typeStr}[]` : typeStr;
  }

  private generateParameterDescription(name: string, types: string[] | undefined, cardinality: string | undefined): string {
    const typeDesc = types?.length ? types.join(' or ') : 'any type';
    const cardinalityDesc = cardinality === 'collection' ? ' (collection)' : 
                           cardinality === 'singleton' ? ' (single value)' : '';
    return `Parameter ${name} of type ${typeDesc}${cardinalityDesc}`;
  }

  private generateJSDocDescription(name: string, info: OperationInfo | undefined, doc: OperationDocumentation | undefined, parameters: FHIRPathParameter[], returnType: string): string {
    // Get the base description
    let baseDescription = '';
    if (doc?.description) {
      baseDescription = doc.description;
    } else if (info?.description) {
      baseDescription = info.description;
    } else {
      baseDescription = this.generateSmartDescription(name, info);
    }

    // Build JSDoc format - handle multiline descriptions
    const formattedDescription = baseDescription.split('\n').map(line => line.trim()).join('\n * ');
    let jsdoc = `/**\n * ${formattedDescription}`;
    
    // Add parameters
    if (parameters.length > 0) {
      jsdoc += '\n *';
      parameters.forEach(param => {
        const typeStr = param.type || 'any';
        const optional = param.optional ? '?' : '';
        jsdoc += `\n * @param {${typeStr}} ${param.name}${optional}`;
      });
    }
    
    // Add return type
    if (returnType && returnType !== 'any') {
      jsdoc += `\n * @returns {${returnType}}`;
    }
    
    // Add examples
    const examples = doc?.examples?.map(e => e.expression) || info?.examples || [];
    if (examples.length > 0) {
      jsdoc += '\n *';
      examples.slice(0, 2).forEach(example => {
        jsdoc += `\n * @example ${example}`;
      });
    }
    
    jsdoc += '\n */';
    return jsdoc;
  }

  private generateFunctionDescription(name: string, info: OperationInfo | undefined, doc: OperationDocumentation | undefined): string {
    // Priority: documentation description > generated smart description
    if (doc?.description) {
      return doc.description;
    }
    
    if (info?.description) {
      return info.description;
    }
    
    // Generate smart description based on function name and signature
    return this.generateSmartDescription(name, info);
  }

  private generateSmartDescription(name: string, info: OperationInfo | undefined): string {
    // Use curated descriptions for common functions
    const descriptions: Record<string, string> = {
      'join': 'Joins collection elements into a single string using the specified separator',
      'split': 'Splits a string into a collection using the specified separator',
      'where': 'Filters the collection to return only elements that satisfy the given criteria.\n\nThis function evaluates the criteria expression for each element in the collection and returns a new collection containing only those elements for which the criteria evaluates to true.',
      'select': 'Transforms each element in the collection using the given expression.\n\nThe select function applies the projection expression to each element in the input collection and returns a new collection containing the results. This is useful for extracting specific values or performing calculations on collection elements.',
      'exists': 'Returns true if the collection is not empty or if any element matches the criteria',
      'empty': 'Returns true if the collection is empty',
      'contains': 'Returns true if the string contains the given substring',
      'startsWith': 'Returns true if the string starts with the given prefix',
      'endsWith': 'Returns true if the string ends with the given suffix',
      'substring': 'Extracts a substring from the string starting at the specified position',
      'length': 'Returns the length of the string or collection',
      'upper': 'Converts the string to uppercase',
      'lower': 'Converts the string to lowercase',
      'trim': 'Removes whitespace from the beginning and end of the string',
      'replace': 'Replaces occurrences of a pattern with a substitution string',
      'first': 'Returns the first element in the collection',
      'last': 'Returns the last element in the collection',
      'count': 'Returns the number of elements in the collection',
      'distinct': 'Returns a collection with duplicate elements removed',
      'union': 'Returns the union of two collections',
      'combine': 'Combines two collections into one',
      'intersect': 'Returns elements common to both collections',
      'exclude': 'Returns elements from the first collection that are not in the second',
      'skip': 'Skips the specified number of elements from the beginning',
      'take': 'Takes the specified number of elements from the beginning',
      'single': 'Returns the single element in the collection (error if more than one)',
      'ofType': 'Filters the collection to elements of the specified type',
      'is': 'Tests whether the input is of the specified type',
      'as': 'Casts the input to the specified type',
      'toString': 'Converts the value to a string representation',
      'toInteger': 'Converts the value to an integer',
      'toDecimal': 'Converts the value to a decimal number',
      'toBoolean': 'Converts the value to a boolean',
      'not': 'Returns the logical negation of the boolean value'
    };
    
    if (descriptions[name]) {
      return descriptions[name];
    }
    
    // Fallback to generic description
    const inputDesc = info?.signature.input ? 
      ` operating on ${info.signature.input.types?.join(' or ') || 'any'} input` : '';
    const outputDesc = info?.signature.output?.type ? 
      ` returning ${info.signature.output.type}` : '';
      
    return `FHIRPath ${name} function${inputDesc}${outputDesc}`;
  }

  private generateOperatorDescription(symbol: string, info: OperationInfoWithSyntax | undefined, doc: OperationDocumentation | undefined): string {
    // Priority: documentation description > registry description > generated JSDoc
    if (doc?.description) {
      return this.formatAsJSDoc(doc.description, info, doc.examples?.map(e => e.expression));
    }
    
    if (info?.description) {
      return this.formatAsJSDoc(info.description, info, info?.examples);
    }
    
    // Generate JSDoc description based on operator properties
    const displayName = this.getOperatorDisplayName(symbol);
    const baseDesc = `${displayName} operator`;
    const formDesc = info?.syntax?.form ? `\n@syntax ${info.syntax.form}` : '';
    const precedenceDesc = info?.syntax?.precedence ? `\n@precedence ${info.syntax.precedence}` : '';
    const associativityDesc = info?.syntax?.associativity ? `\n@associativity ${info.syntax.associativity}` : '';
    
    return this.formatAsJSDoc(baseDesc, info, undefined, formDesc + precedenceDesc + associativityDesc);
  }

  private extractCleanDescription(jsdocOrDescription: string): string {
    // If it's already a JSDoc comment, extract just the main description
    if (jsdocOrDescription.startsWith('/**')) {
      const lines = jsdocOrDescription.split('\n');
      const descriptionLines: string[] = [];
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        // Stop when we hit a tag like @param, @returns, @example
        if (line.startsWith('* @') || line === '*/') {
          break;
        }
        // Extract the description part (remove '* ' prefix)
        if (line.startsWith('* ')) {
          descriptionLines.push(line.substring(2));
        } else if (line === '*') {
          descriptionLines.push(''); // Empty line
        }
      }
      
      return descriptionLines.join(' ').trim();
    }
    
    // If it's already a plain description, return as-is
    return jsdocOrDescription;
  }

  private formatAsJSDoc(description: string, info: OperationInfo | undefined, examples?: string[], additionalTags?: string): string {
    let jsdoc = `/**\n * ${description.replace(/\n/g, '\n * ')}`;
    
    // Add parameter documentation for functions
    if (info?.signature.parameters && info.signature.parameters.length > 0) {
      jsdoc += '\n *';
      info.signature.parameters.forEach(param => {
        const typeStr = param.types?.join(' | ') || 'any';
        const optional = param.optional ? '?' : '';
        const cardinalityNote = param.cardinality === 'collection' ? '[]' : '';
        jsdoc += `\n * @param {${typeStr}${cardinalityNote}} ${param.name}${optional} ${this.generateParameterDescription(param.name, param.types, param.cardinality)}`;
      });
    }
    
    // Add return type documentation
    if (info?.signature.output?.type) {
      const returnType = info.signature.output.type;
      const cardinality = info.signature.output.cardinality === 'collection' ? '[]' : '';
      jsdoc += `\n * @returns {${returnType}${cardinality}} The result of the operation`;
    }
    
    // Add additional custom tags
    if (additionalTags) {
      jsdoc += '\n *' + additionalTags.replace(/\n@/g, '\n * @');
    }
    
    // Add examples
    if (examples && examples.length > 0) {
      jsdoc += '\n *';
      examples.forEach(example => {
        jsdoc += `\n * @example ${example}`;
      });
    }
    
    jsdoc += '\n */';
    return jsdoc;
  }

  private inferCategory(name: string): string {
    // Infer category based on function name patterns
    if (['exists', 'empty', 'all', 'allTrue', 'anyTrue', 'allFalse', 'anyFalse'].includes(name)) {
      return 'existence';
    }
    if (['where', 'select', 'ofType', 'repeat'].includes(name)) {
      return 'filtering';
    }
    if (['first', 'last', 'tail', 'skip', 'take', 'single'].includes(name)) {
      return 'navigation';
    }
    if (['count', 'distinct', 'union', 'combine', 'intersect', 'exclude'].includes(name)) {
      return 'manipulation';
    }
    if (['abs', 'ceiling', 'floor', 'round', 'sqrt', 'ln', 'log', 'exp', 'power'].includes(name)) {
      return 'math';
    }
    if (['contains', 'startsWith', 'endsWith', 'matches', 'length', 'substring', 'upper', 'lower'].includes(name)) {
      return 'string';
    }
    if (['now', 'today', 'timeOfDay'].includes(name)) {
      return 'date';
    }
    if (['toString', 'toInteger', 'toDecimal', 'toBoolean', 'toQuantity', 'toDate', 'toDateTime', 'toTime'].includes(name)) {
      return 'conversion';
    }
    
    return 'utility';
  }

  private getOperatorDisplayName(symbol: string): string {
    // For now, keep the display names as they are comprehensive
    // The registry doesn't contain human-readable display names
    const operatorNames: Record<string, string> = {
      '.': 'Member access',
      '[]': 'Indexer',
      '=': 'Equals',
      '!=': 'Not equals',
      '>': 'Greater than',
      '<': 'Less than',
      '>=': 'Greater than or equal',
      '<=': 'Less than or equal',
      '+': 'Addition',
      '-': 'Subtraction',
      '*': 'Multiplication',
      '/': 'Division',
      'div': 'Integer division',
      'mod': 'Modulo',
      '&': 'String concatenation',
      '|': 'Union',
      'and': 'Logical AND',
      'or': 'Logical OR',
      'xor': 'Logical XOR',
      'implies': 'Logical implication',
      'in': 'Membership',
      'contains': 'Contains'
    };
    
    return operatorNames[symbol] || symbol;
  }

  private extractOperatorPrecedence(info: OperationInfoWithSyntax | undefined, symbol: string): number {
    // First try to get precedence from registry metadata
    if (info?.syntax?.precedence !== undefined) {
      return info.syntax.precedence;
    }
    
    // Fallback to hardcoded values for operators not properly registered
    const precedenceMap: Record<string, number> = {
      '.': 1,
      '[]': 1,
      '*': 2,
      '/': 2,
      'div': 2,
      'mod': 2,
      '+': 3,
      '-': 3,
      '&': 4,
      '|': 5,
      '=': 6,
      '!=': 6,
      '<': 6,
      '>': 6,
      '<=': 6,
      '>=': 6,
      'in': 7,
      'contains': 7,
      'is': 8,
      'as': 8,
      'and': 11,
      'or': 12,
      'xor': 12,
      'implies': 13
    };
    
    return precedenceMap[symbol] || 10;
  }

  private extractOperatorAssociativity(info: OperationInfoWithSyntax | undefined, symbol: string): 'left' | 'right' {
    // First try to get associativity from registry metadata
    if (info?.syntax?.associativity !== undefined) {
      return info.syntax.associativity;
    }
    
    // Fallback: Most operators are left-associative, only 'implies' is right-associative in FHIRPath
    return symbol === 'implies' ? 'right' : 'left';
  }

  private initializeDocumentation(): void {
    // Initialize with core function documentation
    // This will be expanded with a proper documentation loader
    
    // Existence functions
    this.documentationMap.set('exists', {
      description: 'Returns true if the collection is not empty. If criteria provided, returns true if any element satisfies the criteria.',
      category: 'existence',
      examples: [
        { expression: 'Patient.name.exists()', description: 'Check if patient has any names' },
        { expression: 'Patient.telecom.exists(system = "phone")', description: 'Check if patient has a phone number' }
      ],
      related: ['empty', 'all', 'where']
    });

    this.documentationMap.set('empty', {
      description: 'Returns true if the input collection is empty.',
      category: 'existence',
      examples: [
        { expression: 'Patient.name.empty()', description: 'Check if patient has no names' },
        { expression: 'Observation.value.empty()', description: 'Check if observation has no value' }
      ],
      related: ['exists', 'count']
    });

    // Filtering functions
    this.documentationMap.set('where', {
      description: 'Filters the collection to return only elements that satisfy the given criteria.',
      category: 'filtering',
      examples: [
        { expression: 'Patient.name.where(use = "official")', description: 'Filter names by official use' },
        { expression: 'Observation.component.where(code.coding.code = "8480-6")', description: 'Filter components by code' }
      ],
      related: ['select', 'exists', 'all']
    });

    this.documentationMap.set('select', {
      description: 'Transforms each element in the collection using the given projection expression.',
      category: 'projection',
      examples: [
        { expression: 'Patient.name.select(given)', description: 'Extract given names from all patient names' },
        { expression: 'Observation.component.select(value.as(Quantity))', description: 'Extract quantity values from components' }
      ],
      related: ['where', 'ofType']
    });

    // String functions
    this.documentationMap.set('contains', {
      description: 'Returns true if the string contains the given substring.',
      category: 'string',
      examples: [
        { expression: 'Patient.name.family.contains("Smith")', description: 'Check if family name contains "Smith"' },
        { expression: 'Observation.code.text.contains("blood")', description: 'Check if code text contains "blood"' }
      ],
      related: ['startsWith', 'endsWith', 'matches']
    });

    // Add more documentation as needed...
  }
}