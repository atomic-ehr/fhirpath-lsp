import { CompletionItem, CompletionItemKind, MarkupKind } from 'vscode-languageserver/node';
import { RegistryAdapter, IRegistryAdapter } from './RegistryAdapter';

export interface FHIRPathFunction {
  name: string;
  signature: string;
  description: string;
  examples: string[];
  returnType: string;
  parameters: FHIRPathParameter[];
  category: 'existence' | 'filtering' | 'projection' | 'navigation' | 'manipulation' | 'math' | 'string' | 'date' | 'conversion' | 'utility';
}

export interface FHIRPathParameter {
  name: string;
  type: string;
  description: string;
  optional?: boolean;
}

export interface FHIRPathOperator {
  symbol: string;
  name: string;
  description: string;
  precedence: number;
  associativity: 'left' | 'right';
  examples: string[];
}

export interface FHIRPathKeyword {
  keyword: string;
  description: string;
  examples: string[];
}

export class FHIRPathFunctionRegistry {
  private functions: Map<string, FHIRPathFunction> = new Map();
  private operators: Map<string, FHIRPathOperator> = new Map();
  private keywords: Map<string, FHIRPathKeyword> = new Map();
  private registryAdapter: IRegistryAdapter;

  constructor() {
    this.registryAdapter = new RegistryAdapter();
    this.initializeFromRegistry();
  }

  private initializeFromRegistry(): void {
    // Load functions from registry
    const functions = this.registryAdapter.getFunctions();
    functions.forEach(func => this.functions.set(func.name, func));

    // Load operators from registry
    const operators = this.registryAdapter.getOperators();
    operators.forEach(op => this.operators.set(op.symbol, op));

    // Load keywords from registry
    const keywords = this.registryAdapter.getKeywords();
    keywords.forEach(kw => this.keywords.set(kw.keyword, kw));
  }

  // Legacy method kept for reference - will be removed
  private initializeFunctionsLegacy(): void {
    const functions: FHIRPathFunction[] = [
      // Existence functions
      {
        name: 'empty',
        signature: 'empty()',
        description: 'Returns true if the input collection is empty.',
        examples: ['Patient.name.empty()', 'Observation.value.empty()'],
        returnType: 'boolean',
        parameters: [],
        category: 'existence'
      },
      {
        name: 'exists',
        signature: 'exists([criteria])',
        description: 'Returns true if the collection is not empty. If criteria provided, returns true if any element satisfies the criteria.',
        examples: ['Patient.name.exists()', 'Patient.telecom.exists(system = "phone")'],
        returnType: 'boolean',
        parameters: [
          { name: 'criteria', type: 'expression', description: 'Optional criteria expression', optional: true }
        ],
        category: 'existence'
      },
      {
        name: 'all',
        signature: 'all(criteria)',
        description: 'Returns true if all elements in the collection satisfy the given criteria.',
        examples: ['Patient.name.all(use = "official")', 'Observation.component.all(value.exists())'],
        returnType: 'boolean',
        parameters: [
          { name: 'criteria', type: 'expression', description: 'Criteria expression to evaluate' }
        ],
        category: 'existence'
      },
      
      // Filtering functions
      {
        name: 'where',
        signature: 'where(criteria)',
        description: 'Filters the collection to return only elements that satisfy the given criteria.',
        examples: ['Patient.name.where(use = "official")', 'Observation.component.where(code.coding.code = "8480-6")'],
        returnType: 'collection',
        parameters: [
          { name: 'criteria', type: 'expression', description: 'Criteria expression for filtering' }
        ],
        category: 'filtering'
      },
      {
        name: 'select',
        signature: 'select(projection)',
        description: 'Transforms each element in the collection using the given projection expression.',
        examples: ['Patient.name.select(given)', 'Observation.component.select(value.as(Quantity))'],
        returnType: 'collection',
        parameters: [
          { name: 'projection', type: 'expression', description: 'Projection expression' }
        ],
        category: 'projection'
      },
      
      // Navigation functions
      {
        name: 'first',
        signature: 'first()',
        description: 'Returns the first element in the collection.',
        examples: ['Patient.name.first()', 'Observation.component.first()'],
        returnType: 'element',
        parameters: [],
        category: 'navigation'
      },
      {
        name: 'last',
        signature: 'last()',
        description: 'Returns the last element in the collection.',
        examples: ['Patient.name.last()', 'Observation.component.last()'],
        returnType: 'element',
        parameters: [],
        category: 'navigation'
      },
      {
        name: 'tail',
        signature: 'tail()',
        description: 'Returns all but the first element in the collection.',
        examples: ['Patient.name.tail()', 'Observation.component.tail()'],
        returnType: 'collection',
        parameters: [],
        category: 'navigation'
      },
      {
        name: 'skip',
        signature: 'skip(num)',
        description: 'Returns all but the first num elements in the collection.',
        examples: ['Patient.name.skip(1)', 'Observation.component.skip(2)'],
        returnType: 'collection',
        parameters: [
          { name: 'num', type: 'integer', description: 'Number of elements to skip' }
        ],
        category: 'navigation'
      },
      {
        name: 'take',
        signature: 'take(num)',
        description: 'Returns the first num elements in the collection.',
        examples: ['Patient.name.take(1)', 'Observation.component.take(3)'],
        returnType: 'collection',
        parameters: [
          { name: 'num', type: 'integer', description: 'Number of elements to take' }
        ],
        category: 'navigation'
      },
      
      // Manipulation functions
      {
        name: 'distinct',
        signature: 'distinct()',
        description: 'Returns a collection with duplicate elements removed.',
        examples: ['Patient.name.given.distinct()', 'Observation.category.coding.code.distinct()'],
        returnType: 'collection',
        parameters: [],
        category: 'manipulation'
      },
      {
        name: 'count',
        signature: 'count()',
        description: 'Returns the number of elements in the collection.',
        examples: ['Patient.name.count()', 'Observation.component.count()'],
        returnType: 'integer',
        parameters: [],
        category: 'manipulation'
      },
      
      // String functions
      {
        name: 'contains',
        signature: 'contains(substring)',
        description: 'Returns true if the string contains the given substring.',
        examples: ['Patient.name.family.contains("Smith")', 'Observation.code.text.contains("blood")'],
        returnType: 'boolean',
        parameters: [
          { name: 'substring', type: 'string', description: 'Substring to search for' }
        ],
        category: 'string'
      },
      {
        name: 'startsWith',
        signature: 'startsWith(prefix)',
        description: 'Returns true if the string starts with the given prefix.',
        examples: ['Patient.name.family.startsWith("Dr")', 'Observation.code.text.startsWith("Blood")'],
        returnType: 'boolean',
        parameters: [
          { name: 'prefix', type: 'string', description: 'Prefix to check for' }
        ],
        category: 'string'
      },
      {
        name: 'endsWith',
        signature: 'endsWith(suffix)',
        description: 'Returns true if the string ends with the given suffix.',
        examples: ['Patient.name.family.endsWith("Jr")', 'Observation.code.text.endsWith("level")'],
        returnType: 'boolean',
        parameters: [
          { name: 'suffix', type: 'string', description: 'Suffix to check for' }
        ],
        category: 'string'
      },
      {
        name: 'matches',
        signature: 'matches(regex)',
        description: 'Returns true if the string matches the given regular expression.',
        examples: ['Patient.telecom.value.matches("^\\\\d{3}-\\\\d{3}-\\\\d{4}$")', 'Patient.name.family.matches("[A-Z][a-z]+")'],
        returnType: 'boolean',
        parameters: [
          { name: 'regex', type: 'string', description: 'Regular expression pattern' }
        ],
        category: 'string'
      },
      {
        name: 'length',
        signature: 'length()',
        description: 'Returns the length of the string.',
        examples: ['Patient.name.family.length()', 'Observation.valueString.length()'],
        returnType: 'integer',
        parameters: [],
        category: 'string'
      },
      
      // Conversion functions
      {
        name: 'as',
        signature: 'as(type)',
        description: 'Casts the input to the specified type if possible.',
        examples: ['Observation.value.as(Quantity)', 'Patient.birthDate.as(date)'],
        returnType: 'specified_type',
        parameters: [
          { name: 'type', type: 'type', description: 'Target type for casting' }
        ],
        category: 'conversion'
      },
      {
        name: 'is',
        signature: 'is(type)',
        description: 'Returns true if the input is of the specified type.',
        examples: ['Observation.value.is(Quantity)', 'Patient.birthDate.is(date)'],
        returnType: 'boolean',
        parameters: [
          { name: 'type', type: 'type', description: 'Type to check against' }
        ],
        category: 'conversion'
      },
      
      // Math functions
      {
        name: 'abs',
        signature: 'abs()',
        description: 'Returns the absolute value of the number.',
        examples: ['Observation.valueQuantity.value.abs()', '(-5).abs()'],
        returnType: 'number',
        parameters: [],
        category: 'math'
      },
      {
        name: 'ceiling',
        signature: 'ceiling()',
        description: 'Returns the smallest integer greater than or equal to the number.',
        examples: ['Observation.valueDecimal.ceiling()', '(3.2).ceiling()'],
        returnType: 'integer',
        parameters: [],
        category: 'math'
      },
      {
        name: 'floor',
        signature: 'floor()',
        description: 'Returns the largest integer less than or equal to the number.',
        examples: ['Observation.valueDecimal.floor()', '(3.8).floor()'],
        returnType: 'integer',
        parameters: [],
        category: 'math'
      },
      {
        name: 'round',
        signature: 'round([precision])',
        description: 'Rounds the number to the specified precision (default 0).',
        examples: ['Observation.valueDecimal.round()', '(3.14159).round(2)'],
        returnType: 'number',
        parameters: [
          { name: 'precision', type: 'integer', description: 'Number of decimal places', optional: true }
        ],
        category: 'math'
      },
      
      // Date functions
      {
        name: 'now',
        signature: 'now()',
        description: 'Returns the current date and time.',
        examples: ['now()', 'Patient.birthDate < now()'],
        returnType: 'dateTime',
        parameters: [],
        category: 'date'
      },
      {
        name: 'today',
        signature: 'today()',
        description: 'Returns the current date.',
        examples: ['today()', 'Patient.birthDate.to(today())'],
        returnType: 'date',
        parameters: [],
        category: 'date'
      }
    ];

    functions.forEach(func => this.functions.set(func.name, func));
  }

  // Legacy method kept for reference - will be removed
  private initializeOperatorsLegacy(): void {
    const operators: FHIRPathOperator[] = [
      {
        symbol: '.',
        name: 'Member access',
        description: 'Accesses a member or property of an object.',
        precedence: 1,
        associativity: 'left',
        examples: ['Patient.name', 'Observation.value']
      },
      {
        symbol: '[]',
        name: 'Indexer',
        description: 'Indexes into a collection or filters with criteria.',
        precedence: 1,
        associativity: 'left',
        examples: ['Patient.name[0]', 'Patient.telecom[system = "phone"]']
      },
      {
        symbol: '=',
        name: 'Equals',
        description: 'Tests for equality between two values.',
        precedence: 6,
        associativity: 'left',
        examples: ['Patient.active = true', 'Observation.status = "final"']
      },
      {
        symbol: '!=',
        name: 'Not equals',
        description: 'Tests for inequality between two values.',
        precedence: 6,
        associativity: 'left',
        examples: ['Patient.active != false', 'Observation.status != "cancelled"']
      },
      {
        symbol: '>',
        name: 'Greater than',
        description: 'Tests if left value is greater than right value.',
        precedence: 6,
        associativity: 'left',
        examples: ['Observation.valueQuantity.value > 10', 'Patient.birthDate > @1980-01-01']
      },
      {
        symbol: '<',
        name: 'Less than',
        description: 'Tests if left value is less than right value.',
        precedence: 6,
        associativity: 'left',
        examples: ['Observation.valueQuantity.value < 100', 'Patient.birthDate < today()']
      },
      {
        symbol: '>=',
        name: 'Greater than or equal',
        description: 'Tests if left value is greater than or equal to right value.',
        precedence: 6,
        associativity: 'left',
        examples: ['Observation.valueQuantity.value >= 5', 'Patient.birthDate >= @1970-01-01']
      },
      {
        symbol: '<=',
        name: 'Less than or equal',
        description: 'Tests if left value is less than or equal to right value.',
        precedence: 6,
        associativity: 'left',
        examples: ['Observation.valueQuantity.value <= 200', 'Patient.birthDate <= today()']
      },
      {
        symbol: 'and',
        name: 'Logical AND',
        description: 'Logical AND operation between two boolean expressions.',
        precedence: 11,
        associativity: 'left',
        examples: ['Patient.active = true and Patient.name.exists()', 'Observation.status = "final" and Observation.value.exists()']
      },
      {
        symbol: 'or',
        name: 'Logical OR',
        description: 'Logical OR operation between two boolean expressions.',
        precedence: 12,
        associativity: 'left',
        examples: ['Patient.active = true or Patient.active.empty()', 'Observation.status = "final" or Observation.status = "amended"']
      },
      {
        symbol: 'xor',
        name: 'Logical XOR',
        description: 'Logical exclusive OR operation between two boolean expressions.',
        precedence: 12,
        associativity: 'left',
        examples: ['Patient.active = true xor Patient.active = false']
      },
      {
        symbol: 'implies',
        name: 'Logical implication',
        description: 'Logical implication (if-then) operation.',
        precedence: 13,
        associativity: 'right',
        examples: ['Patient.active = true implies Patient.name.exists()']
      }
    ];

    operators.forEach(op => this.operators.set(op.symbol, op));
  }

  // Legacy method kept for reference - will be removed  
  private initializeKeywordsLegacy(): void {
    const keywords: FHIRPathKeyword[] = [
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

    keywords.forEach(kw => this.keywords.set(kw.keyword, kw));
  }

  getFunctions(): FHIRPathFunction[] {
    return Array.from(this.functions.values());
  }

  getFunction(name: string): FHIRPathFunction | undefined {
    return this.functions.get(name);
  }

  getFunctionsByCategory(category: string): FHIRPathFunction[] {
    return Array.from(this.functions.values()).filter(func => func.category === category);
  }

  getOperators(): FHIRPathOperator[] {
    return Array.from(this.operators.values());
  }

  getOperator(symbol: string): FHIRPathOperator | undefined {
    return this.operators.get(symbol);
  }

  getKeywords(): FHIRPathKeyword[] {
    return Array.from(this.keywords.values());
  }

  getKeyword(keyword: string): FHIRPathKeyword | undefined {
    return this.keywords.get(keyword);
  }

  getFunctionCompletionItems(): CompletionItem[] {
    return Array.from(this.functions.values()).map(func => ({
      label: func.name,
      kind: CompletionItemKind.Function,
      detail: func.signature,
      documentation: {
        kind: MarkupKind.Markdown,
        value: this.formatFunctionDocumentation(func)
      },
      insertText: func.parameters.length > 0 ? `${func.name}($1)` : `${func.name}()`,
      insertTextFormat: 2, // Snippet format
      sortText: `1_${func.name}` // Functions get high priority
    }));
  }

  getOperatorCompletionItems(): CompletionItem[] {
    return Array.from(this.operators.values())
      .filter(op => op.symbol.length > 1) // Only include word operators, not symbols
      .map(op => ({
        label: op.symbol,
        kind: CompletionItemKind.Operator,
        detail: op.name,
        documentation: {
          kind: MarkupKind.Markdown,
          value: this.formatOperatorDocumentation(op)
        },
        insertText: op.symbol,
        sortText: `2_${op.symbol}` // Operators get medium priority
      }));
  }

  getKeywordCompletionItems(): CompletionItem[] {
    return Array.from(this.keywords.values()).map(kw => ({
      label: kw.keyword,
      kind: CompletionItemKind.Keyword,
      detail: 'FHIRPath keyword',
      documentation: {
        kind: MarkupKind.Markdown,
        value: this.formatKeywordDocumentation(kw)
      },
      insertText: kw.keyword,
      sortText: `3_${kw.keyword}` // Keywords get lower priority
    }));
  }

  private formatFunctionDocumentation(func: FHIRPathFunction): string {
    let doc = `**${func.signature}**\n\n${func.description}\n\n`;
    
    if (func.parameters && func.parameters.length > 0) {
      doc += '**Parameters:**\n';
      func.parameters.forEach(param => {
        if (!param) return; // Skip if param is undefined
        const optional = param.optional ? ' (optional)' : '';
        const name = param.name || 'unknown';
        const type = param.type || 'unknown';
        const description = param.description || 'No description available';
        doc += `- \`${name}\` (${type}${optional}): ${description}\n`;
      });
      doc += '\n';
    }

    doc += `**Returns:** ${func.returnType}\n\n`;
    
    if (func.examples.length > 0) {
      doc += '**Examples:**\n';
      func.examples.forEach(example => {
        doc += `\`\`\`fhirpath\n${example}\n\`\`\`\n`;
      });
    }

    return doc;
  }

  private formatOperatorDocumentation(op: FHIRPathOperator): string {
    let doc = `**${op.name}** (\`${op.symbol}\`)\n\n${op.description}\n\n`;
    doc += `**Precedence:** ${op.precedence}\n`;
    doc += `**Associativity:** ${op.associativity}\n\n`;
    
    if (op.examples.length > 0) {
      doc += '**Examples:**\n';
      op.examples.forEach(example => {
        doc += `\`\`\`fhirpath\n${example}\n\`\`\`\n`;
      });
    }

    return doc;
  }

  private formatKeywordDocumentation(kw: FHIRPathKeyword): string {
    let doc = `**${kw.keyword}**\n\n${kw.description}\n\n`;
    
    if (kw.examples.length > 0) {
      doc += '**Examples:**\n';
      kw.examples.forEach(example => {
        doc += `\`\`\`fhirpath\n${example}\n\`\`\`\n`;
      });
    }

    return doc;
  }
}