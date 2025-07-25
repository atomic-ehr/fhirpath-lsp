import { TextDocument } from 'vscode-languageserver-textdocument';
import { FHIRResourceService } from './FHIRResourceService';
import * as fs from 'fs';
import * as path from 'path';

export interface FHIRPathContext {
  resourceType?: string;
  inputFile?: string;
  inputData?: any;
  isValid: boolean;
  errors: string[];
}

export interface ContextDeclaration {
  type: 'inputfile' | 'input' | 'resource';
  value: string;
  line: number;
  column: number;
}

export class FHIRPathContextService {
  constructor(private fhirResourceService: FHIRResourceService) {}

  /**
   * Parse context declarations from .fhirpath file
   * Supports declarations like:
   * // @inputfile patient-example.json
   * // @input {"resourceType": "Patient", "id": "example"}
   * // @resource Patient
   */
  async parseContext(document: TextDocument): Promise<FHIRPathContext> {
    const text = document.getText();
    const lines = text.split('\n');
    const declarations: ContextDeclaration[] = [];
    const errors: string[] = [];

    // Parse context declarations from comments
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip empty lines and non-comments
      if (!line || !line.startsWith('//')) {
        continue;
      }

      const declaration = this.parseContextDeclaration(line, i);
      if (declaration) {
        declarations.push(declaration);
      }
    }

    // Process declarations to build context
    const context = this.buildContextFromDeclarations(declarations);
    
    // If no resource type is explicitly defined, try to infer it from loaded data
    if (!context.resourceType && (context.inputFile || context.inputData)) {
      try {
        const inferredType = await this.inferResourceTypeFromData(context, document.uri);
        if (inferredType) {
          context.resourceType = inferredType;
          console.log(`Inferred resource type '${inferredType}' from loaded data`);
        }
      } catch (error) {
        console.warn('Failed to infer resource type from data:', error);
        errors.push(`Failed to infer resource type from data: ${(error as Error).message}`);
      }
    }
    
    // Validate context
    const validationErrors = this.validateContext(context);
    errors.push(...validationErrors);

    return {
      ...context,
      isValid: errors.length === 0,
      errors
    };
  }

  private parseContextDeclaration(line: string, lineNumber: number): ContextDeclaration | null {
    // Remove comment prefix and trim
    const content = line.replace(/^\/\*+|\*+\/$/g, '').replace(/^\/\//, '').trim();
    
    // Parse @directive format
    const directiveMatch = content.match(/^@(\w+)\s+(.+)$/);
    if (!directiveMatch) {
      return null;
    }

    const [, directive, value] = directiveMatch;
    
    switch (directive.toLowerCase()) {
      case 'inputfile':
        return {
          type: 'inputfile',
          value: value.trim(),
          line: lineNumber,
          column: line.indexOf('@')
        };
        
      case 'input':
        return {
          type: 'input',
          value: value.trim(),
          line: lineNumber,
          column: line.indexOf('@')
        };
        
      case 'resource':
        return {
          type: 'resource',
          value: value.trim(),
          line: lineNumber,
          column: line.indexOf('@')
        };
        
      default:
        return null;
    }
  }

  private buildContextFromDeclarations(declarations: ContextDeclaration[]): Partial<FHIRPathContext> {
    const context: Partial<FHIRPathContext> = {};

    // Process declarations in order - last one wins for conflicts
    for (const declaration of declarations) {
      switch (declaration.type) {
        case 'inputfile':
          // Clear any existing input data when setting inputfile (mutually exclusive)
          context.inputData = undefined;
          context.inputFile = declaration.value;
          // Try to infer resource type from filename
          const inferredType = this.inferResourceTypeFromFilename(declaration.value);
          if (inferredType) {
            context.resourceType = inferredType;
          }
          console.log(`Using @inputfile directive: ${declaration.value} (line ${declaration.line})`);
          break;
          
        case 'input':
          // Clear any existing input file when setting input data (mutually exclusive)
          context.inputFile = undefined;
          // Handle inline JSON data
          try {
            context.inputData = JSON.parse(declaration.value);
            // Try to infer resource type from the JSON data
            if (context.inputData && context.inputData.resourceType) {
              context.resourceType = context.inputData.resourceType;
            }
            console.log(`Using @input directive (line ${declaration.line})`);
          } catch (error) {
            // Invalid JSON - this will be caught in validation
            console.warn('Invalid JSON in @input directive:', error);
          }
          break;
          
        case 'resource':
          context.resourceType = declaration.value;
          console.log(`Using @resource directive: ${declaration.value} (line ${declaration.line})`);
          break;
      }
    }

    return context;
  }

  private inferResourceTypeFromFilename(filename: string): string | null {
    const basename = filename.toLowerCase().replace(/\.[^.]*$/, ''); // Remove extension
    
    // Common patterns
    const patterns = [
      { pattern: /^patient/i, type: 'Patient' },
      { pattern: /^observation/i, type: 'Observation' },
      { pattern: /^condition/i, type: 'Condition' },
      { pattern: /^procedure/i, type: 'Procedure' },
      { pattern: /^medication/i, type: 'MedicationRequest' },
      { pattern: /^encounter/i, type: 'Encounter' },
      { pattern: /^diagnostic/i, type: 'DiagnosticReport' },
      { pattern: /^practitioner/i, type: 'Practitioner' },
      { pattern: /^organization/i, type: 'Organization' },
      { pattern: /^location/i, type: 'Location' }
    ];

    for (const { pattern, type } of patterns) {
      if (pattern.test(basename)) {
        return type;
      }
    }

    return null;
  }

  /**
   * Infer resource type from loaded data when no explicit @resource directive is provided
   */
  private async inferResourceTypeFromData(context: Partial<FHIRPathContext>, documentUri?: string): Promise<string | null> {
    try {
      // Load the actual data to inspect its resourceType field
      const data = await this.loadContextData(context as FHIRPathContext, documentUri);
      
      if (data && typeof data === 'object' && data.resourceType) {
        return data.resourceType;
      }
      
      return null;
    } catch (error) {
      throw new Error(`Cannot infer resource type: ${(error as Error).message}`);
    }
  }

  private validateContext(context: Partial<FHIRPathContext>): string[] {
    const errors: string[] = [];

    // Validate resource type if provided
    if (context.resourceType) {
      const resourceDefinition = this.fhirResourceService.getResourceDefinition(context.resourceType);
      if (!resourceDefinition) {
        errors.push(`Unknown FHIR resource type: ${context.resourceType}`);
      }
    }

    // Validate input file format if provided (but don't require it)
    if (context.inputFile) {
      if (!context.inputFile.match(/\.(json|xml)$/i)) {
        errors.push(`Input file should be a JSON or XML file: ${context.inputFile}`);
      }
    }

    // Validate inline input data format if provided (but don't require it)
    if (context.inputData) {
      if (typeof context.inputData !== 'object' || context.inputData === null) {
        errors.push('Inline input data must be a valid JSON object');
      } else if (!context.inputData.resourceType) {
        errors.push('Inline input data must have a resourceType property');
      }
    }

    // Note: We no longer require input data to be present - expressions can be parsed and analyzed without it

    return errors;
  }

  /**
   * Load context data from file or inline data
   */
  async loadContextData(context: FHIRPathContext, documentUri?: string): Promise<any> {
    // Return inline data if available
    if (context.inputData) {
      return context.inputData;
    }

    // Load from file if specified
    if (context.inputFile) {
      try {
        // Resolve the file path relative to the document or working directory
        let inputFilePath = context.inputFile;
        
        if (!path.isAbsolute(inputFilePath)) {
          if (documentUri) {
            // Convert VS Code URI to file path and get directory
            const documentPath = this.uriToPath(documentUri);
            const documentDir = path.dirname(documentPath);
            inputFilePath = path.resolve(documentDir, context.inputFile);
          } else {
            // Fallback to current working directory
            inputFilePath = path.resolve(process.cwd(), context.inputFile);
          }
        }

        // Check if file exists
        if (!fs.existsSync(inputFilePath)) {
          console.warn(`Input file not found: ${inputFilePath}`);
          return this.getMockDataForResourceType(context.resourceType);
        }

        // Read and parse the JSON file
        const fileContent = fs.readFileSync(inputFilePath, 'utf8');
        const jsonData = JSON.parse(fileContent);

        // Validate that it's a FHIR resource if resource type is specified  
        if (context.resourceType && jsonData.resourceType !== context.resourceType) {
          console.warn(`Resource type mismatch: expected ${context.resourceType}, got ${jsonData.resourceType}`);
        }

        return jsonData;

      } catch (error) {
        console.error(`Error loading input file ${context.inputFile}:`, error);
        // Fallback to mock data
        return this.getMockDataForResourceType(context.resourceType);
      }
    }

    return null;
  }

  /**
   * Convert VS Code URI to file system path
   */
  private uriToPath(uri: string): string {
    // Handle file:// URIs
    if (uri.startsWith('file://')) {
      return decodeURIComponent(uri.substring(7));
    }
    return uri;
  }

  private getMockDataForResourceType(resourceType?: string): any {
    switch (resourceType) {
      case 'Patient':
        return {
          resourceType: 'Patient',
          id: 'example-patient',
          name: [
            {
              use: 'official',
              family: 'Doe',
              given: ['John']
            }
          ],
          gender: 'male',
          birthDate: '1974-12-25',
          active: true
        };
        
      case 'Observation':
        return {
          resourceType: 'Observation',
          id: 'example-observation',
          status: 'final',
          category: [
            {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/observation-category',
                  code: 'vital-signs'
                }
              ]
            }
          ],
          code: {
            coding: [
              {
                system: 'http://loinc.org',
                code: '85354-9',
                display: 'Blood pressure panel'
              }
            ]
          },
          subject: {
            reference: 'Patient/example-patient'
          },
          valueQuantity: {
            value: 120,
            unit: 'mmHg',
            system: 'http://unitsofmeasure.org',
            code: 'mm[Hg]'
          }
        };
        
      default:
        return {
          resourceType: resourceType || 'Resource',
          id: 'example'
        };
    }
  }

  /**
   * Get validation context for FHIRPath expression
   */
  async getValidationContext(document: TextDocument): Promise<FHIRPathContext> {
    return await this.parseContext(document);
  }

  /**
   * Check if document has context declarations
   */
  hasContextDeclarations(document: TextDocument): boolean {
    const text = document.getText();
    return /@(inputfile|input|resource)/i.test(text);
  }

  /**
   * Extract FHIRPath expressions from document (excluding context declarations)
   * Returns expressions with their line numbers for accurate diagnostics
   */
  extractFHIRPathExpressions(document: TextDocument): Array<{expression: string; line: number; column: number}> {
    const text = document.getText();
    const lines = text.split('\n');
    const expressions: Array<{expression: string; line: number; column: number}> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Parse multiple expressions from this line - the method handles skipping non-expression lines
      const lineExpressions = this.parseMultipleExpressions(line);
      
      for (const expr of lineExpressions) {
        if (expr.expression.trim()) {
          expressions.push({
            expression: expr.expression.trim(),
            line: i,
            column: expr.startColumn
          });
        }
      }
    }

    return expressions;
  }

  /**
   * Parse multiple expressions from a single line (separated by semicolons)
   */
  private parseMultipleExpressions(line: string): Array<{expression: string; startColumn: number}> {
    const expressions: Array<{expression: string; startColumn: number}> = [];
    
    // First, check if the line contains any context declarations - if so, skip processing
    const trimmed = line.trim();
    if (!trimmed || 
        trimmed.startsWith('//') || 
        trimmed.startsWith('/*') ||
        trimmed.includes('@inputfile') ||
        trimmed.includes('@input') ||
        trimmed.includes('@resource')) {
      return expressions; // Return empty array for non-expression lines
    }
    
    // Handle semicolon-separated expressions, but be careful about semicolons in strings
    let currentExpression = '';
    let inString = false;
    let stringChar = '';
    let expressionStartColumn = 0;
    let foundFirstNonWhitespace = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const prevChar = i > 0 ? line[i - 1] : '';
      
      // Track the start column of the current expression (first non-whitespace character)
      if (!foundFirstNonWhitespace && char !== ' ' && char !== '\t') {
        expressionStartColumn = i;
        foundFirstNonWhitespace = true;
      }
      
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
            expression: currentExpression.trim(),
            startColumn: expressionStartColumn
          });
        }
        currentExpression = '';
        foundFirstNonWhitespace = false;
        // Find the next non-whitespace character after the semicolon for the next expression
        let nextStart = i + 1;
        while (nextStart < line.length && (line[nextStart] === ' ' || line[nextStart] === '\t')) {
          nextStart++;
        }
        expressionStartColumn = nextStart;
        continue;
      }
      
      currentExpression += char;
    }
    
    // Add the last expression
    if (currentExpression.trim()) {
      expressions.push({
        expression: currentExpression.trim(),
        startColumn: expressionStartColumn
      });
    }
    
    // If no expressions were found but we have content, treat the whole line as one expression
    if (expressions.length === 0 && trimmed.length > 0) {
      // Find the first non-whitespace character
      let startCol = 0;
      for (let i = 0; i < line.length; i++) {
        if (line[i] !== ' ' && line[i] !== '\t') {
          startCol = i;
          break;
        }
      }
      expressions.push({
        expression: trimmed,
        startColumn: startCol
      });
    }
    
    return expressions;
  }

  /**
   * Validate a single FHIRPath expression without context
   * This provides basic syntax and semantic validation
   */
  validateExpressionWithoutContext(expression: string): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic syntax validation patterns
    const validationRules = [
      {
        pattern: /^[.\s]*$/,
        error: 'Expression cannot be empty or contain only dots'
      },
      {
        pattern: /\.\./,
        error: 'Double dots are not allowed in FHIRPath'
      },
      {
        pattern: /\(\s*\)/,
        warning: 'Empty function call parentheses'
      },
      {
        pattern: /\[\s*\]/,
        warning: 'Empty indexer brackets'
      },
      {
        pattern: /\s(and|or|xor|implies)\s*$/,
        error: 'Logical operator at end of expression'
      },
      {
        pattern: /^\s*(and|or|xor|implies)\s/,
        error: 'Logical operator at beginning of expression'
      },
      {
        pattern: /['"]((?:[^'"]|\\.)*)$/,
        error: 'Unterminated string literal'
      },
      {
        pattern: /\([^)]*$/,
        error: 'Unclosed parenthesis'
      },
      {
        pattern: /\[[^\]]*$/,
        error: 'Unclosed bracket'
      }
    ];

    // Apply validation rules
    for (const rule of validationRules) {
      if (rule.pattern.test(expression)) {
        if (rule.error) {
          errors.push(rule.error);
        }
        if (rule.warning) {
          warnings.push(rule.warning);
        }
      }
    }

    // Check for balanced parentheses and brackets
    const balanceCheck = this.checkBalancedDelimiters(expression);
    if (!balanceCheck.isValid) {
      errors.push(...balanceCheck.errors);
    }

    // Check for valid function names (basic)
    const functionCheck = this.validateFunctionNames(expression);
    warnings.push(...functionCheck.warnings);

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  private checkBalancedDelimiters(expression: string): {isValid: boolean; errors: string[]} {
    const errors: string[] = [];
    const stack: Array<{char: string; pos: number}> = [];
    const pairs: {[key: string]: string} = {'(': ')', '[': ']'};
    
    for (let i = 0; i < expression.length; i++) {
      const char = expression[i];
      
      if (char === '(' || char === '[') {
        stack.push({char, pos: i});
      } else if (char === ')' || char === ']') {
        if (stack.length === 0) {
          errors.push(`Unexpected closing ${char === ')' ? 'parenthesis' : 'bracket'} at position ${i}`);
        } else {
          const last = stack.pop()!;
          if (pairs[last.char] !== char) {
            errors.push(`Mismatched delimiter: expected ${pairs[last.char]} but found ${char} at position ${i}`);
          }
        }
      }
    }
    
    // Check for unclosed delimiters
    for (const item of stack) {
      errors.push(`Unclosed ${item.char === '(' ? 'parenthesis' : 'bracket'} at position ${item.pos}`);
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  private validateFunctionNames(expression: string): {warnings: string[]} {
    const warnings: string[] = [];
    
    // Known FHIRPath functions
    const knownFunctions = [
      'empty', 'exists', 'all', 'where', 'select', 'first', 'last', 'tail',
      'skip', 'take', 'distinct', 'count', 'contains', 'startsWith', 'endsWith',
      'matches', 'length', 'as', 'is', 'abs', 'ceiling', 'floor', 'round',
      'now', 'today', 'substring', 'indexOf', 'replace', 'split', 'join',
      'upper', 'lower', 'toInteger', 'toDecimal', 'toString', 'convertsToInteger',
      'convertsToDecimal', 'convertsToString', 'convertsToBoolean', 'convertsToDateTime',
      'convertsToDate', 'convertsToTime', 'convertsToQuantity', 'iif', 'trace'
    ];
    
    // Find function calls in the expression
    const functionCallPattern = /(\w+)\s*\(/g;
    let match;
    
    while ((match = functionCallPattern.exec(expression)) !== null) {
      const functionName = match[1];
      if (!knownFunctions.includes(functionName)) {
        warnings.push(`Unknown function '${functionName}' - verify this is a valid FHIRPath function`);
      }
    }
    
    return {warnings};
  }

  /**
   * Get completion context based on input context
   */
  async getCompletionContext(document: TextDocument): Promise<{
    resourceType?: string;
    availableProperties: string[];
  }> {
    const context = await this.parseContext(document);
    const availableProperties: string[] = [];

    if (context.resourceType) {
      const properties = this.fhirResourceService.getResourceProperties(context.resourceType);
      availableProperties.push(...properties.map(p => p.name));
    }

    return {
      resourceType: context.resourceType,
      availableProperties
    };
  }
}