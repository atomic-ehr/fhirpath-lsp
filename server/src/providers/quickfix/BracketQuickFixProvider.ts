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
 * Provides quick fixes for bracket and parentheses mismatches
 */
export class BracketQuickFixProvider implements ICodeActionProvider {

  /**
   * Check if this provider can fix the given diagnostic
   */
  canFix(diagnostic: Diagnostic): boolean {
    const code = diagnostic.code?.toString() || '';
    
    // Handle syntax errors that might be bracket-related
    return code === 'E001' && this.isBracketError(diagnostic.message);
  }

  /**
   * Check if the diagnostic message indicates a bracket error
   */
  private isBracketError(message: string): boolean {
    const bracketKeywords = [
      'bracket',
      'parenthesis', 
      'parentheses',
      'missing',
      'expected',
      'unclosed',
      'unmatched',
      ']',
      ')',
      '[',
      '(',
    ];

    const messageLower = message.toLowerCase();
    return bracketKeywords.some(keyword => messageLower.includes(keyword));
  }

  /**
   * Provide code actions for bracket fixes
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
      const fixActions = await this.createBracketFixes(document, diagnostic, range);
      actions.push(...fixActions);
    }

    return actions;
  }

  /**
   * Create bracket fix actions for a diagnostic
   */
  private async createBracketFixes(
    document: TextDocument,
    diagnostic: Diagnostic,
    range: Range
  ): Promise<FHIRPathCodeAction[]> {
    const actions: FHIRPathCodeAction[] = [];

    try {
      // Get the line where the error occurred
      const line = document.getText(Range.create(
        Position.create(diagnostic.range.start.line, 0),
        Position.create(diagnostic.range.end.line + 1, 0)
      ));

      // Analyze bracket issues
      const bracketAnalysis = this.analyzeBrackets(line);
      const errorPosition = diagnostic.range.end;

      // Create fixes based on the analysis
      if (bracketAnalysis.missingClosingSquare > 0) {
        const action = this.createClosingBracketFix(
          document,
          errorPosition,
          ']',
          'Add missing closing bracket',
          diagnostic
        );
        actions.push(action);
      }

      if (bracketAnalysis.missingClosingParen > 0) {
        const action = this.createClosingBracketFix(
          document,
          errorPosition,
          ')',
          'Add missing closing parenthesis',
          diagnostic
        );
        actions.push(action);
      }

      if (bracketAnalysis.missingOpeningSquare > 0) {
        const insertPos = this.findOpeningBracketPosition(document, diagnostic.range, '[');
        if (insertPos) {
          const action = this.createOpeningBracketFix(
            document,
            insertPos,
            '[',
            'Add missing opening bracket',
            diagnostic
          );
          actions.push(action);
        }
      }

      if (bracketAnalysis.missingOpeningParen > 0) {
        const insertPos = this.findOpeningBracketPosition(document, diagnostic.range, '(');
        if (insertPos) {
          const action = this.createOpeningBracketFix(
            document,
            insertPos,
            '(',
            'Add missing opening parenthesis',
            diagnostic
          );
          actions.push(action);
        }
      }

      // Handle specific bracket replacement scenarios
      const mismatchedBrackets = this.findMismatchedBrackets(line);
      for (const mismatch of mismatchedBrackets) {
        const action = this.createBracketReplacementFix(
          document,
          diagnostic.range.start.line,
          mismatch,
          diagnostic
        );
        if (action) {
          actions.push(action);
        }
      }

    } catch (error) {
      console.error('Error creating bracket fixes:', error);
    }

    return actions;
  }

  /**
   * Analyze bracket balance in a line
   */
  private analyzeBrackets(line: string): {
    missingClosingSquare: number;
    missingClosingParen: number;
    missingOpeningSquare: number;
    missingOpeningParen: number;
  } {
    let squareCount = 0;
    let parenCount = 0;
    let inString = false;
    let stringChar = '';

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      // Handle string literals
      if ((char === '"' || char === "'") && (i === 0 || line[i-1] !== '\\')) {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
          stringChar = '';
        }
        continue;
      }

      // Skip characters inside strings
      if (inString) {
        continue;
      }

      // Count brackets
      switch (char) {
        case '[':
          squareCount++;
          break;
        case ']':
          squareCount--;
          break;
        case '(':
          parenCount++;
          break;
        case ')':
          parenCount--;
          break;
      }
    }

    return {
      missingClosingSquare: Math.max(0, squareCount),
      missingClosingParen: Math.max(0, parenCount),
      missingOpeningSquare: Math.max(0, -squareCount),
      missingOpeningParen: Math.max(0, -parenCount),
    };
  }

  /**
   * Find mismatched bracket pairs (e.g., [ followed by ) instead of ])
   */
  private findMismatchedBrackets(line: string): Array<{
    position: number;
    found: string;
    expected: string;
    type: 'closing' | 'opening';
  }> {
    const mismatches: Array<{
      position: number;
      found: string;
      expected: string;
      type: 'closing' | 'opening';
    }> = [];

    const stack: Array<{ char: string; pos: number }> = [];
    let inString = false;
    let stringChar = '';

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      // Handle string literals
      if ((char === '"' || char === "'") && (i === 0 || line[i-1] !== '\\')) {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
          stringChar = '';
        }
        continue;
      }

      if (inString) continue;

      if (char === '[' || char === '(') {
        stack.push({ char, pos: i });
      } else if (char === ']' || char === ')') {
        if (stack.length === 0) {
          // Closing bracket without opening
          const expected = char === ']' ? '[' : '(';
          mismatches.push({
            position: i,
            found: char,
            expected,
            type: 'closing'
          });
        } else {
          const last = stack.pop()!;
          const expectedClosing = last.char === '[' ? ']' : ')';
          
          if (char !== expectedClosing) {
            // Mismatched bracket pair
            mismatches.push({
              position: i,
              found: char,
              expected: expectedClosing,
              type: 'closing'
            });
          }
        }
      }
    }

    return mismatches;
  }

  /**
   * Find the appropriate position to insert an opening bracket
   */
  private findOpeningBracketPosition(
    document: TextDocument,
    range: Range,
    bracketType: '[' | '('
  ): Position | null {
    const line = document.getText(Range.create(
      Position.create(range.start.line, 0),
      Position.create(range.start.line + 1, 0)
    ));

    // Look for patterns that suggest where the opening bracket should go
    if (bracketType === '[') {
      // For array access: look for patterns like "name" that should be "name["
      const match = line.match(/(\w+)\s*(?:=|>|<|!=)/);
      if (match) {
        const pos = line.indexOf(match[1]) + match[1].length;
        return Position.create(range.start.line, pos);
      }
    } else if (bracketType === '(') {
      // For function calls: look for function names that should have opening paren
      const match = line.match(/(\w+)\s*$/);
      if (match) {
        const pos = line.indexOf(match[1]) + match[1].length;
        return Position.create(range.start.line, pos);
      }
    }

    return null;
  }

  /**
   * Create a closing bracket fix
   */
  private createClosingBracketFix(
    document: TextDocument,
    position: Position,
    bracket: string,
    title: string,
    diagnostic: Diagnostic
  ): FHIRPathCodeAction {
    const action = CodeActionService.createInsertion(
      title,
      FHIRPathCodeActionKind.QuickFixBrackets,
      document,
      position,
      bracket,
      [diagnostic]
    );

    return CodeActionBuilder.create(action.title, action.kind!)
      .withEdit(action.edit!)
      .withDiagnostics([diagnostic])
      .withPriority(95)
      .withPreferred(true)
      .withCategory('Brackets')
      .withMetadata({
        description: `Insert '${bracket}' to close bracket`,
        tags: ['bracket-fix', 'syntax-fix'],
        confidence: 0.9
      })
      .build();
  }

  /**
   * Create an opening bracket fix
   */
  private createOpeningBracketFix(
    document: TextDocument,
    position: Position,
    bracket: string,
    title: string,
    diagnostic: Diagnostic
  ): FHIRPathCodeAction {
    const action = CodeActionService.createInsertion(
      title,
      FHIRPathCodeActionKind.QuickFixBrackets,
      document,
      position,
      bracket,
      [diagnostic]
    );

    return CodeActionBuilder.create(action.title, action.kind!)
      .withEdit(action.edit!)
      .withDiagnostics([diagnostic])
      .withPriority(90)
      .withCategory('Brackets')
      .withMetadata({
        description: `Insert '${bracket}' to open bracket`,
        tags: ['bracket-fix', 'syntax-fix'],
        confidence: 0.8
      })
      .build();
  }

  /**
   * Create a bracket replacement fix for mismatched brackets
   */
  private createBracketReplacementFix(
    document: TextDocument,
    line: number,
    mismatch: {
      position: number;
      found: string;
      expected: string;
      type: 'closing' | 'opening';
    },
    diagnostic: Diagnostic
  ): FHIRPathCodeAction | null {
    const range = Range.create(
      Position.create(line, mismatch.position),
      Position.create(line, mismatch.position + 1)
    );

    const title = `Replace '${mismatch.found}' with '${mismatch.expected}'`;
    
    const action = CodeActionService.createTextReplacement(
      title,
      FHIRPathCodeActionKind.QuickFixBrackets,
      document,
      range,
      mismatch.expected,
      [diagnostic]
    );

    return CodeActionBuilder.create(action.title, action.kind!)
      .withEdit(action.edit!)
      .withDiagnostics([diagnostic])
      .withPriority(85)
      .withCategory('Brackets')
      .withMetadata({
        description: `Replace mismatched bracket '${mismatch.found}' with '${mismatch.expected}'`,
        tags: ['bracket-fix', 'mismatch-fix'],
        confidence: 0.85
      })
      .build();
  }
}