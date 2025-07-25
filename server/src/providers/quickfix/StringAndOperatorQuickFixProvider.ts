import {
  Range,
  Diagnostic,
  Position,
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

import {
  ICodeActionProvider,
  FHIRPathCodeAction,
  FHIRPathCodeActionContext,
  FHIRPathCodeActionKind,
  CodeActionBuilder,
} from '../../types/CodeActionTypes';

import { CodeActionService } from '../../services/CodeActionService';

/**
 * Provides quick fixes for string literal and operator issues
 */
export class StringAndOperatorQuickFixProvider implements ICodeActionProvider {

  /**
   * Check if this provider can fix the given diagnostic
   */
  canFix(diagnostic: Diagnostic): boolean {
    const code = diagnostic.code?.toString() || '';
    const message = diagnostic.message.toLowerCase();
    
    // Handle unterminated strings
    if (code === 'E008') {
      return true;
    }
    
    // Handle invalid operators
    if (code === 'E005') {
      return true;
    }
    
    // Handle syntax errors that might be string or operator related
    if (code === 'E001') {
      return this.isStringOrOperatorError(message);
    }
    
    return false;
  }

  /**
   * Check if the diagnostic message indicates a string or operator error
   */
  private isStringOrOperatorError(message: string): boolean {
    const keywords = [
      'string',
      'quote',
      'unterminated',
      'operator',
      'expected',
      'missing',
      '=',
      '!=',
      '>',
      '<',
      'and',
      'or',
    ];

    return keywords.some(keyword => message.includes(keyword));
  }

  /**
   * Provide code actions for string and operator fixes
   */
  async provideCodeActions(
    document: TextDocument,
    range: Range,
    context: FHIRPathCodeActionContext
  ): Promise<FHIRPathCodeAction[]> {
    const actions: FHIRPathCodeAction[] = [];

    // Only process diagnostics that we can fix
    const relevantDiagnostics = (context.diagnostics || []).filter(d => this.canFix(d));
    
    if (relevantDiagnostics.length === 0) {
      return actions;
    }

    for (const diagnostic of relevantDiagnostics) {
      const fixActions = await this.createStringAndOperatorFixes(document, diagnostic);
      actions.push(...fixActions);
    }

    return actions;
  }

  /**
   * Create string and operator fix actions for a diagnostic
   */
  private async createStringAndOperatorFixes(
    document: TextDocument,
    diagnostic: Diagnostic
  ): Promise<FHIRPathCodeAction[]> {
    const actions: FHIRPathCodeAction[] = [];

    try {
      const code = diagnostic.code?.toString() || '';
      
      if (code === 'E008') {
        // Unterminated string fixes
        actions.push(...this.createStringFixes(document, diagnostic));
      } else if (code === 'E005') {
        // Invalid operator fixes
        actions.push(...this.createOperatorFixes(document, diagnostic));
      } else if (code === 'E001') {
        // General syntax errors - try both
        actions.push(...this.createStringFixes(document, diagnostic));
        actions.push(...this.createOperatorFixes(document, diagnostic));
        actions.push(...this.createMissingOperatorFixes(document, diagnostic));
      }

    } catch (error) {
      console.error('Error creating string and operator fixes:', error);
    }

    return actions;
  }

  /**
   * Create fixes for unterminated or malformed strings
   */
  private createStringFixes(
    document: TextDocument,
    diagnostic: Diagnostic
  ): FHIRPathCodeAction[] {
    const actions: FHIRPathCodeAction[] = [];

    try {
      // Get the line containing the error
      const lineRange = Range.create(
        Position.create(diagnostic.range.start.line, 0),
        Position.create(diagnostic.range.start.line + 1, 0)
      );
      const line = document.getText(lineRange);

      // Find unterminated strings
      const unterminatedStrings = this.findUnterminatedStrings(line);
      
      for (const stringInfo of unterminatedStrings) {
        const insertPos = Position.create(
          diagnostic.range.start.line,
          stringInfo.endPosition
        );

        const action = CodeActionService.createInsertion(
          `Add missing ${stringInfo.quoteType === '"' ? 'double' : 'single'} quote`,
          FHIRPathCodeActionKind.QuickFixString,
          document,
          insertPos,
          stringInfo.quoteType,
          [diagnostic]
        );

        const enhancedAction = CodeActionBuilder.create(action.title, action.kind!)
          .withEdit(action.edit!)
          .withDiagnostics([diagnostic])
          .withPriority(95)
          .withPreferred(true)
          .withCategory('String Literals')
          .withMetadata({
            description: `Close unterminated string with ${stringInfo.quoteType}`,
            tags: ['string-fix', 'quote-fix'],
            confidence: 0.95
          })
          .build();

        actions.push(enhancedAction);
      }

      // Find quote mismatches (mixing single and double quotes)
      const quoteMismatches = this.findQuoteMismatches(line);
      
      for (const mismatch of quoteMismatches) {
        const replaceRange = Range.create(
          Position.create(diagnostic.range.start.line, mismatch.position),
          Position.create(diagnostic.range.start.line, mismatch.position + 1)
        );

        const action = CodeActionService.createTextReplacement(
          `Change ${mismatch.found === '"' ? 'double' : 'single'} quote to ${mismatch.expected === '"' ? 'double' : 'single'} quote`,
          FHIRPathCodeActionKind.QuickFixString,
          document,
          replaceRange,
          mismatch.expected,
          [diagnostic]
        );

        const enhancedAction = CodeActionBuilder.create(action.title, action.kind!)
          .withEdit(action.edit!)
          .withDiagnostics([diagnostic])
          .withPriority(90)
          .withCategory('String Literals')
          .withMetadata({
            description: `Fix quote mismatch: ${mismatch.found} → ${mismatch.expected}`,
            tags: ['string-fix', 'quote-mismatch'],
            confidence: 0.9
          })
          .build();

        actions.push(enhancedAction);
      }

    } catch (error) {
      console.error('Error creating string fixes:', error);
    }

    return actions;
  }

  /**
   * Create fixes for invalid operators
   */
  private createOperatorFixes(
    document: TextDocument,
    diagnostic: Diagnostic
  ): FHIRPathCodeAction[] {
    const actions: FHIRPathCodeAction[] = [];

    try {
      // Get the problematic text
      const problemText = document.getText(diagnostic.range);
      
      // Find suggested operators
      const operatorSuggestions = this.getOperatorSuggestions(problemText);
      
      for (let i = 0; i < operatorSuggestions.length; i++) {
        const suggestion = operatorSuggestions[i];
        const isTopSuggestion = i === 0;

        const action = CodeActionService.createTextReplacement(
          `Use '${suggestion.operator}' operator`,
          FHIRPathCodeActionKind.QuickFixOperator,
          document,
          diagnostic.range,
          suggestion.operator,
          [diagnostic]
        );

        const enhancedAction = CodeActionBuilder.create(action.title, action.kind!)
          .withEdit(action.edit!)
          .withDiagnostics([diagnostic])
          .withPriority(isTopSuggestion ? 95 : 90 - i * 5)
          .withPreferred(isTopSuggestion)
          .withCategory('Operators')
          .withMetadata({
            description: suggestion.description,
            tags: ['operator-fix'],
            confidence: suggestion.confidence
          })
          .build();

        actions.push(enhancedAction);
      }

    } catch (error) {
      console.error('Error creating operator fixes:', error);
    }

    return actions;
  }

  /**
   * Create fixes for missing operators
   */
  private createMissingOperatorFixes(
    document: TextDocument,
    diagnostic: Diagnostic
  ): FHIRPathCodeAction[] {
    const actions: FHIRPathCodeAction[] = [];

    try {
      // Get the line containing the error
      const lineRange = Range.create(
        Position.create(diagnostic.range.start.line, 0),
        Position.create(diagnostic.range.start.line + 1, 0)
      );
      const line = document.getText(lineRange);

      // Look for patterns that suggest missing operators
      const missingOperators = this.findMissingOperators(line, diagnostic.range);

      for (const missing of missingOperators) {
        const insertPos = Position.create(
          diagnostic.range.start.line,
          missing.position
        );

        const action = CodeActionService.createInsertion(
          `Insert '${missing.operator}' operator`,
          FHIRPathCodeActionKind.QuickFixOperator,
          document,
          insertPos,
          ` ${missing.operator} `,
          [diagnostic]
        );

        const enhancedAction = CodeActionBuilder.create(action.title, action.kind!)
          .withEdit(action.edit!)
          .withDiagnostics([diagnostic])
          .withPriority(90)
          .withCategory('Operators')
          .withMetadata({
            description: `Insert missing ${missing.operator} operator`,
            tags: ['operator-fix', 'missing-operator'],
            confidence: missing.confidence
          })
          .build();

        actions.push(enhancedAction);
      }

    } catch (error) {
      console.error('Error creating missing operator fixes:', error);
    }

    return actions;
  }

  /**
   * Find unterminated strings in a line
   */
  private findUnterminatedStrings(line: string): Array<{
    startPosition: number;
    endPosition: number;
    quoteType: '"' | "'";
  }> {
    const unterminated: Array<{
      startPosition: number;
      endPosition: number;
      quoteType: '"' | "'";
    }> = [];

    let i = 0;
    while (i < line.length) {
      const char = line[i];
      
      if (char === '"' || char === "'") {
        const quoteType = char as '"' | "'";
        const startPos = i;
        i++; // Move past opening quote
        
        // Look for closing quote
        let found = false;
        while (i < line.length) {
          if (line[i] === quoteType && (i === 0 || line[i-1] !== '\\')) {
            found = true;
            i++; // Move past closing quote
            break;
          }
          i++;
        }
        
        if (!found) {
          // Unterminated string
          unterminated.push({
            startPosition: startPos,
            endPosition: line.length,
            quoteType
          });
        }
      } else {
        i++;
      }
    }

    return unterminated;
  }

  /**
   * Find quote mismatches in a line
   */
  private findQuoteMismatches(line: string): Array<{
    position: number;
    found: '"' | "'";
    expected: '"' | "'";
  }> {
    const mismatches: Array<{
      position: number;
      found: '"' | "'";
      expected: '"' | "'";
    }> = [];

    // This is a simplified implementation
    // A more sophisticated version would track quote pairs
    
    return mismatches;
  }

  /**
   * Get operator suggestions for invalid operator text
   */
  private getOperatorSuggestions(problemText: string): Array<{
    operator: string;
    description: string;
    confidence: number;
  }> {
    const suggestions: Array<{
      operator: string;
      description: string;
      confidence: number;
    }> = [];

    const text = problemText.toLowerCase().trim();

    // Common operator typos and corrections
    const operatorMappings: Record<string, Array<{
      operator: string;
      description: string;
    }>> = {
      'eq': [{ operator: '=', description: 'Equal comparison' }],
      'equals': [{ operator: '=', description: 'Equal comparison' }],
      'ne': [{ operator: '!=', description: 'Not equal comparison' }],
      'neq': [{ operator: '!=', description: 'Not equal comparison' }],
      'gt': [{ operator: '>', description: 'Greater than comparison' }],
      'lt': [{ operator: '<', description: 'Less than comparison' }],
      'gte': [{ operator: '>=', description: 'Greater than or equal comparison' }],
      'lte': [{ operator: '<=', description: 'Less than or equal comparison' }],
      '&&': [{ operator: 'and', description: 'Logical AND operator' }],
      '||': [{ operator: 'or', description: 'Logical OR operator' }],
      '&': [{ operator: 'and', description: 'Logical AND operator' }],
      '|': [{ operator: 'or', description: 'Logical OR operator' }],
    };

    if (operatorMappings[text]) {
      operatorMappings[text].forEach(mapping => {
        suggestions.push({
          ...mapping,
          confidence: 0.9
        });
      });
    }

    // If no exact match, try fuzzy matching
    if (suggestions.length === 0) {
      const allOperators = ['=', '!=', '>', '<', '>=', '<=', 'and', 'or', 'xor', 'implies'];
      const similar = CodeActionService.findSimilarStrings(text, allOperators, 2, 2);
      
      similar.forEach(op => {
        suggestions.push({
          operator: op,
          description: `${op} operator`,
          confidence: 0.7
        });
      });
    }

    return suggestions;
  }

  /**
   * Find missing operators in a line
   */
  private findMissingOperators(line: string, range: Range): Array<{
    position: number;
    operator: string;
    confidence: number;
  }> {
    const missing: Array<{
      position: number;
      operator: string;
      confidence: number;
    }> = [];

    // Look for patterns like "Patient.active true" (missing =)
    const missingEqualsPattern = /(\w+)\s+(true|false|\d+|'[^']*'|"[^"]*")/g;
    let match;
    
    while ((match = missingEqualsPattern.exec(line)) !== null) {
      const afterFirst = match.index + match[1].length;
      missing.push({
        position: afterFirst,
        operator: '=',
        confidence: 0.8
      });
    }

    // Look for patterns like "value 10" (missing comparison)
    const missingComparisonPattern = /(\w+)\s+(\d+)/g;
    match = null;
    
    while ((match = missingComparisonPattern.exec(line)) !== null) {
      const afterFirst = match.index + match[1].length;
      missing.push({
        position: afterFirst,
        operator: '=',
        confidence: 0.7
      });
    }

    return missing;
  }
}