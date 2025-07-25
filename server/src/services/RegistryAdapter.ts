import { registry, OperationInfo, OperationMetadata } from '@atomic-ehr/fhirpath';
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
    
    // Extract parameters from operation info
    const parameters: FHIRPathParameter[] = info?.signature.parameters?.map(param => ({
      name: param.name,
      type: param.types?.join(' | ') || 'any',
      description: `Parameter ${param.name}`,
      optional: param.optional
    })) || [];

    // Determine return type
    const returnType = this.determineReturnType(info);

    // Get or infer category
    const category = doc?.category || this.inferCategory(metadata.name);

    return {
      name: metadata.name,
      signature: this.buildSignature(metadata.name, parameters),
      description: info?.description || doc?.description || `FHIRPath function ${metadata.name}`,
      examples: doc?.examples?.map(e => e.expression) || info?.examples || [],
      returnType,
      parameters,
      category: category as any
    };
  }

  private convertToFHIRPathOperator(metadata: OperationMetadata): FHIRPathOperator {
    const info = registry.getOperationInfo(metadata.name);
    const doc = this.getDocumentation(metadata.name);
    
    // For operators, the name is the symbol
    const symbol = metadata.name;
    
    return {
      symbol,
      name: this.getOperatorDisplayName(symbol),
      description: info?.description || doc?.description || `FHIRPath operator ${symbol}`,
      precedence: this.getOperatorPrecedence(symbol),
      associativity: this.getOperatorAssociativity(symbol),
      examples: doc?.examples?.map(e => e.expression) || info?.examples || []
    };
  }

  private buildSignature(name: string, parameters: FHIRPathParameter[]): string {
    if (parameters.length === 0) {
      return `${name}()`;
    }
    
    const paramList = parameters.map(p => {
      const optional = p.optional ? '?' : '';
      return `${p.name}${optional}`;
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

  private getOperatorPrecedence(symbol: string): number {
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

  private getOperatorAssociativity(symbol: string): 'left' | 'right' {
    // Most operators are left-associative
    // Only 'implies' is right-associative in FHIRPath
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