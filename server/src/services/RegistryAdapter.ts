import { registry } from '@atomic-ehr/fhirpath';
import type { OperatorDefinition, FunctionDefinition } from '@atomic-ehr/fhirpath';

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
  getOperationInfo(name: string): OperatorDefinition | FunctionDefinition | undefined;
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

  getOperationInfo(name: string): OperatorDefinition | FunctionDefinition | undefined {
    return registry.getOperationInfo(name);
  }

  hasOperation(name: string): boolean {
    return registry.isFunction(name) || registry.isBinaryOperator(name) || registry.isUnaryOperator(name);
  }

  getDocumentation(name: string): OperationDocumentation | undefined {
    return this.documentationMap.get(name);
  }

  private convertFunctions(): FHIRPathFunction[] {
    const functionNames = registry.listFunctions();
    return functionNames.map(name => {
      try {
        const funcDef = registry.getFunction(name);
        if (!funcDef) return null;
        return this.convertToFHIRPathFunction(funcDef, name);
      } catch (error) {
        console.warn(`Failed to convert function ${name}:`, error);
        return null;
      }
    }).filter((f): f is FHIRPathFunction => f !== null);
  }

  private convertOperators(): FHIRPathOperator[] {
    const operatorNames = registry.listOperators();
    return operatorNames.map(name => {
      try {
        const opDef = registry.getOperatorDefinition(name);
        if (!opDef) return null;
        return this.convertToFHIRPathOperator(opDef, name);
      } catch (error) {
        console.warn(`Failed to convert operator ${name}:`, error);
        return null;
      }
    }).filter((op): op is FHIRPathOperator => op !== null);
  }

  private convertToFHIRPathFunction(funcDef: FunctionDefinition, name: string): FHIRPathFunction {
    const doc = this.getDocumentation(name);
    
    // Extract parameters from function definition
    const parameters: FHIRPathParameter[] = funcDef.signature?.parameters?.map(param => ({
      name: param.name,
      type: this.typeInfoToString(param.type),
      description: `Parameter ${param.name}`,
      optional: param.optional || false
    })) || [];

    // Determine return type
    const returnType = this.typeInfoToString(funcDef.signature?.result) || 'any';

    // Get or infer category
    const category = doc?.category || funcDef.category?.[0] || this.inferCategory(name);

    return {
      name,
      signature: this.buildSignature(name, parameters),
      description: funcDef.description || doc?.description || `FHIRPath ${name} function`,
      examples: doc?.examples?.map(e => e.expression) || funcDef.examples || [],
      returnType,
      parameters,
      category: category as any
    };
  }

  private convertToFHIRPathOperator(opDef: OperatorDefinition, name: string): FHIRPathOperator {
    const doc = this.getDocumentation(name);
    
    return {
      symbol: opDef.symbol || name,
      name: this.getOperatorDisplayName(opDef.symbol || name),
      description: opDef.description || doc?.description || `${name} operator`,
      precedence: opDef.precedence || 10,
      associativity: opDef.associativity || 'left',
      examples: doc?.examples?.map(e => e.expression) || opDef.examples || []
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

  private typeInfoToString(typeInfo: any): string {
    if (!typeInfo) return 'any';
    if (typeof typeInfo === 'string') return typeInfo;
    if (typeInfo.type) return typeInfo.type;
    return 'any';
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

  private initializeDocumentation(): void {
    // Initialize with core function documentation
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