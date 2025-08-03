import {
  TextDocument,
  Range,
  Position,
  WorkspaceEdit,
  TextEdit
} from 'vscode-languageserver';

import { FHIRPathService } from '../parser/FHIRPathService';
import { getLogger } from '../logging/index.js';

/**
 * Information about an extractable expression
 */
export interface ExtractableExpression {
  range: Range;
  text: string;
  type: 'simple' | 'complex' | 'function-call' | 'property-access';
  dependencies: string[];
  suggestedName: string;
}

/**
 * Parameters for extract operations
 */
export interface ExtractParams {
  name: string;
  insertionPoint?: Position;
  scope?: 'local' | 'document' | 'global';
}

/**
 * Result of an extract operation
 */
export interface ExtractResult {
  success: boolean;
  edits?: WorkspaceEdit;
  error?: string;
  extractedCode?: string;
  newVariable?: string;
}

/**
 * Service for extracting expressions to variables and functions
 */
export class ExtractService {
  private logger = getLogger('ExtractService');

  constructor(private fhirPathService: FHIRPathService) {}

  /**
   * Analyze if a range can be extracted to a variable
   */
  canExtractVariable(document: TextDocument, range: Range): boolean {
    try {
      const expression = this.getExpressionInfo(document, range);
      if (!expression) return false;

      // Must be a complete, valid expression
      const parseResult = this.fhirPathService.parse(expression.text);
      if (!parseResult.success) return false;

      // Should not be too simple (single identifiers) or too complex (multiple statements)
      return expression.type !== 'simple' && !expression.text.includes(';');
    } catch (error) {
      return false;
    }
  }

  /**
   * Analyze if a range can be extracted to a function
   */
  canExtractFunction(document: TextDocument, range: Range): boolean {
    try {
      const expression = this.getExpressionInfo(document, range);
      if (!expression) return false;

      // Must be a complex expression worth extracting
      return expression.type === 'complex' && expression.text.length > 20;
    } catch (error) {
      return false;
    }
  }

  /**
   * Extract the selected range to a variable
   */
  async extractToVariable(
    document: TextDocument,
    range: Range,
    params: ExtractParams
  ): Promise<ExtractResult> {
    try {
      const expression = this.getExpressionInfo(document, range);
      if (!expression) {
        return { success: false, error: 'Invalid expression to extract' };
      }

      // Validate the variable name
      if (!this.isValidVariableName(params.name)) {
        return { success: false, error: 'Invalid variable name' };
      }

      // Determine insertion point for variable declaration
      const insertionPoint = params.insertionPoint || this.findBestInsertionPoint(document, range);

      // Create the workspace edit
      const workspaceEdit: WorkspaceEdit = {
        changes: {
          [document.uri]: [
            // Insert variable declaration
            {
              range: { start: insertionPoint, end: insertionPoint },
              newText: `let ${params.name} = ${expression.text}\n`
            },
            // Replace original expression with variable reference
            {
              range: range,
              newText: params.name
            }
          ]
        }
      };

      // Validate the result
      if (!await this.validateExtractResult(document, workspaceEdit)) {
        return { success: false, error: 'Extract operation would create invalid syntax' };
      }

      return {
        success: true,
        edits: workspaceEdit,
        extractedCode: expression.text,
        newVariable: params.name
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Extract the selected range to a function
   */
  async extractToFunction(
    document: TextDocument,
    range: Range,
    params: ExtractParams
  ): Promise<ExtractResult> {
    try {
      const expression = this.getExpressionInfo(document, range);
      if (!expression) {
        return { success: false, error: 'Invalid expression to extract' };
      }

      // Validate the function name
      if (!this.isValidFunctionName(params.name)) {
        return { success: false, error: 'Invalid function name' };
      }

      // Analyze parameters needed for the function
      const parameters = this.analyzeParameters(expression);
      const parameterList = parameters.map(p => `${p.name}: ${p.type}`).join(', ');
      const argumentList = parameters.map(p => p.name).join(', ');

      // Create function definition
      const functionDef = `define function ${params.name}(${parameterList}): ${expression.text}`;

      // Determine insertion point for function definition
      const insertionPoint = params.insertionPoint || this.findBestFunctionInsertionPoint(document);

      // Create the workspace edit
      const workspaceEdit: WorkspaceEdit = {
        changes: {
          [document.uri]: [
            // Insert function definition
            {
              range: { start: insertionPoint, end: insertionPoint },
              newText: `${functionDef}\n\n`
            },
            // Replace original expression with function call
            {
              range: range,
              newText: argumentList ? `${params.name}(${argumentList})` : `${params.name}()`
            }
          ]
        }
      };

      // Validate the result
      if (!await this.validateExtractResult(document, workspaceEdit)) {
        return { success: false, error: 'Extract operation would create invalid syntax' };
      }

      return {
        success: true,
        edits: workspaceEdit,
        extractedCode: functionDef,
        newVariable: params.name
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Generate suggested names for extraction
   */
  suggestVariableNames(document: TextDocument, range: Range): string[] {
    const expression = this.getExpressionInfo(document, range);
    if (!expression) return ['temp', 'value', 'result'];

    const suggestions: string[] = [];

    // Extract meaningful parts from the expression
    const text = expression.text.toLowerCase();

    // Common patterns
    if (text.includes('patient')) suggestions.push('patientData', 'patient');
    if (text.includes('name')) suggestions.push('nameValue', 'fullName');
    if (text.includes('active')) suggestions.push('isActive', 'activeStatus');
    if (text.includes('given')) suggestions.push('givenName', 'firstName');
    if (text.includes('family')) suggestions.push('familyName', 'lastName');
    if (text.includes('telecom')) suggestions.push('contact', 'contactInfo');
    if (text.includes('address')) suggestions.push('address', 'location');
    if (text.includes('count')) suggestions.push('count', 'total');
    if (text.includes('where')) suggestions.push('filtered', 'matches');
    if (text.includes('select')) suggestions.push('selected', 'mapped');

    // Based on return type
    if (text.includes('.first()') || text.includes('.single()')) {
      suggestions.push('item', 'single');
    }
    if (text.includes('.exists()')) {
      suggestions.push('hasValue', 'exists');
    }
    if (text.includes('.empty()')) {
      suggestions.push('isEmpty', 'empty');
    }

    // Default suggestions
    if (suggestions.length === 0) {
      suggestions.push('value', 'result', 'temp', 'data');
    }

    return [...new Set(suggestions)].slice(0, 5);
  }

  /**
   * Generate suggested names for function extraction
   */
  suggestFunctionNames(document: TextDocument, range: Range): string[] {
    const expression = this.getExpressionInfo(document, range);
    if (!expression) return ['helper', 'utility', 'transform'];

    const suggestions: string[] = [];
    const text = expression.text.toLowerCase();

    // Based on what the function does
    if (text.includes('where')) suggestions.push('filter', 'findMatching');
    if (text.includes('select')) suggestions.push('transform', 'map');
    if (text.includes('count')) suggestions.push('countItems', 'getTotal');
    if (text.includes('first') || text.includes('single')) suggestions.push('getFirst', 'getSingle');
    if (text.includes('name')) suggestions.push('getName', 'extractName');
    if (text.includes('active')) suggestions.push('checkActive', 'isActive');
    if (text.includes('exists')) suggestions.push('hasValue', 'checkExists');

    // Based on resource type
    if (text.includes('patient')) suggestions.push('processPatient', 'getPatientInfo');
    if (text.includes('observation')) suggestions.push('processObservation', 'getObsValue');
    if (text.includes('condition')) suggestions.push('processCondition', 'getConditionInfo');

    // Default suggestions
    if (suggestions.length === 0) {
      suggestions.push('helper', 'process', 'calculate', 'extract');
    }

    return [...new Set(suggestions)].slice(0, 5);
  }

  // Private helper methods

  private getExpressionInfo(document: TextDocument, range: Range): ExtractableExpression | null {
    try {
      const text = this.getTextInRange(document.getText(), range).trim();
      if (!text) return null;

      // Determine expression type
      let type: ExtractableExpression['type'] = 'simple';
      if (text.includes('(') && text.includes(')')) {
        type = 'function-call';
      } else if (text.includes('.') && text.length > 10) {
        type = 'property-access';
      } else if ((text.includes('where') || text.includes('select')) && text.length > 15) {
        type = 'complex';
      }

      // Extract dependencies (simplified)
      const dependencies = this.extractDependencies(text);

      // Generate suggested name
      const suggestedName = this.suggestVariableNames(document, range)[0];

      return {
        range,
        text,
        type,
        dependencies,
        suggestedName
      };
    } catch (error) {
      return null;
    }
  }

  private getTextInRange(text: string, range: Range): string {
    const lines = text.split('\n');
    
    if (range.start.line === range.end.line) {
      return lines[range.start.line]?.substring(range.start.character, range.end.character) || '';
    }
    
    let result = '';
    for (let i = range.start.line; i <= range.end.line; i++) {
      if (i < lines.length) {
        if (i === range.start.line) {
          result += lines[i].substring(range.start.character);
        } else if (i === range.end.line) {
          result += '\n' + lines[i].substring(0, range.end.character);
        } else {
          result += '\n' + lines[i];
        }
      }
    }
    
    return result;
  }

  private isValidVariableName(name: string): boolean {
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) && name.length > 0;
  }

  private isValidFunctionName(name: string): boolean {
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) && name.length > 0;
  }

  private findBestInsertionPoint(document: TextDocument, range: Range): Position {
    // Insert at the beginning of the line containing the range
    return { line: Math.max(0, range.start.line), character: 0 };
  }

  private findBestFunctionInsertionPoint(document: TextDocument): Position {
    // Insert at the beginning of the document
    return { line: 0, character: 0 };
  }

  private extractDependencies(expression: string): string[] {
    // Simplified dependency extraction
    const dependencies: string[] = [];
    
    // Look for identifiers that might be variables
    const identifierPattern = /\b[a-zA-Z_][a-zA-Z0-9_]*\b/g;
    let match;
    
    while ((match = identifierPattern.exec(expression)) !== null) {
      const identifier = match[0];
      // Skip known keywords and functions
      if (!this.isKeyword(identifier) && !dependencies.includes(identifier)) {
        dependencies.push(identifier);
      }
    }
    
    return dependencies;
  }

  private isKeyword(word: string): boolean {
    const keywords = [
      'and', 'or', 'not', 'true', 'false', 'where', 'select', 'exists', 
      'empty', 'first', 'last', 'single', 'count', 'length', 'substring',
      'contains', 'startsWith', 'endsWith', 'matches', 'Patient', 'Bundle'
    ];
    return keywords.includes(word);
  }

  private analyzeParameters(expression: ExtractableExpression): Array<{name: string, type: string}> {
    // Simplified parameter analysis
    const parameters: Array<{name: string, type: string}> = [];
    
    for (const dep of expression.dependencies) {
      if (!this.isKeyword(dep)) {
        parameters.push({
          name: dep,
          type: 'string' // Simplified - would need more sophisticated type inference
        });
      }
    }
    
    return parameters;
  }

  private async validateExtractResult(document: TextDocument, workspaceEdit: WorkspaceEdit): Promise<boolean> {
    try {
      // Apply the edits temporarily to validate syntax
      const edits = workspaceEdit.changes?.[document.uri] || [];
      let text = document.getText();
      
      // Apply edits in reverse order to maintain positions
      const sortedEdits = edits.sort((a, b) => {
        const lineCompare = b.range.start.line - a.range.start.line;
        if (lineCompare !== 0) return lineCompare;
        return b.range.start.character - a.range.start.character;
      });

      for (const edit of sortedEdits) {
        const startOffset = this.getOffsetAt(text, edit.range.start);
        const endOffset = this.getOffsetAt(text, edit.range.end);
        text = text.substring(0, startOffset) + edit.newText + text.substring(endOffset);
      }

      // Try to parse the result
      const parseResult = this.fhirPathService.parse(text);
      return parseResult.success;
    } catch (error) {
      this.logger.error('Error validating extract result:', error);
      return false;
    }
  }

  private getOffsetAt(text: string, position: Position): number {
    const lines = text.split('\n');
    let offset = 0;
    
    for (let i = 0; i < position.line && i < lines.length; i++) {
      offset += lines[i].length + 1; // +1 for newline
    }
    
    return offset + position.character;
  }
}