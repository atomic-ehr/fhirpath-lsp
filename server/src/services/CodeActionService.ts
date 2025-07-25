import {
  Range,
  Position,
  WorkspaceEdit,
  TextEdit,
  Diagnostic,
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

import {
  FHIRPathCodeAction,
  CodeActionBuilder,
  FHIRPathCodeActionKind,
} from '../types/CodeActionTypes';

/**
 * Service for generating and managing code actions
 */
export class CodeActionService {
  /**
   * Create a simple text replacement action
   */
  static createTextReplacement(
    title: string,
    kind: string,
    document: TextDocument,
    range: Range,
    newText: string,
    diagnostics?: Diagnostic[]
  ): FHIRPathCodeAction {
    const edit: WorkspaceEdit = {
      changes: {
        [document.uri]: [
          TextEdit.replace(range, newText)
        ]
      }
    };

    const builder = CodeActionBuilder.create(title, kind).withEdit(edit);
    
    if (diagnostics) {
      builder.withDiagnostics(diagnostics);
    }

    return builder.build();
  }

  /**
   * Create an insertion action at a specific position
   */
  static createInsertion(
    title: string,
    kind: string,
    document: TextDocument,
    position: Position,
    text: string,
    diagnostics?: Diagnostic[]
  ): FHIRPathCodeAction {
    const edit: WorkspaceEdit = {
      changes: {
        [document.uri]: [
          TextEdit.insert(position, text)
        ]
      }
    };

    const builder = CodeActionBuilder.create(title, kind).withEdit(edit);
    
    if (diagnostics) {
      builder.withDiagnostics(diagnostics);
    }

    return builder.build();
  }

  /**
   * Create a deletion action for a specific range
   */
  static createDeletion(
    title: string,
    kind: string,
    document: TextDocument,
    range: Range,
    diagnostics?: Diagnostic[]
  ): FHIRPathCodeAction {
    return this.createTextReplacement(title, kind, document, range, '', diagnostics);
  }

  /**
   * Create multiple text edits in a single action
   */
  static createMultipleEdits(
    title: string,
    kind: string,
    document: TextDocument,
    edits: { range: Range; newText: string }[],
    diagnostics?: Diagnostic[]
  ): FHIRPathCodeAction {
    const textEdits = edits.map(edit => TextEdit.replace(edit.range, edit.newText));
    
    const workspaceEdit: WorkspaceEdit = {
      changes: {
        [document.uri]: textEdits
      }
    };

    const builder = CodeActionBuilder.create(title, kind)
      .withEdit(workspaceEdit);
    
    if (diagnostics) {
      builder.withDiagnostics(diagnostics);
    }

    return builder.build();
  }

  /**
   * Get the word at a specific position
   */
  static getWordAtPosition(document: TextDocument, position: Position): {
    word: string;
    range: Range;
  } {
    const text = document.getText();
    const offset = document.offsetAt(position);
    
    // Find word boundaries
    let start = offset;
    let end = offset;
    
    // Move start backwards to find word start
    while (start > 0 && this.isWordCharacter(text.charAt(start - 1))) {
      start--;
    }
    
    // Move end forwards to find word end
    while (end < text.length && this.isWordCharacter(text.charAt(end))) {
      end++;
    }
    
    const word = text.substring(start, end);
    const range = Range.create(
      document.positionAt(start),
      document.positionAt(end)
    );
    
    return { word, range };
  }

  /**
   * Get the line text at a specific position
   */
  static getLineAtPosition(document: TextDocument, position: Position): {
    text: string;
    range: Range;
  } {
    const lineStart = Position.create(position.line, 0);
    const lineEnd = Position.create(position.line + 1, 0);
    const range = Range.create(lineStart, lineEnd);
    const text = document.getText(range);
    
    return { text, range };
  }

  /**
   * Check if a character is a word character (alphanumeric or underscore)
   */
  private static isWordCharacter(char: string): boolean {
    return /[a-zA-Z0-9_]/.test(char);
  }

  /**
   * Find the closest token to a position
   */
  static findTokenAtPosition(
    document: TextDocument,
    position: Position,
    tokens?: string[]
  ): { token: string; range: Range } | null {
    const line = document.getText(Range.create(
      Position.create(position.line, 0),
      Position.create(position.line + 1, 0)
    ));
    
    if (!tokens) {
      // Default FHIRPath tokens
      tokens = [
        'where', 'select', 'exists', 'all', 'empty', 'first', 'last',
        'count', 'distinct', 'union', 'intersect', 'exclude',
        'and', 'or', 'xor', 'implies',
        'as', 'is', 'div', 'mod'
      ];
    }
    
    for (const token of tokens) {
      const regex = new RegExp(`\\b${token}\\b`, 'gi');
      let match;
      
      while ((match = regex.exec(line)) !== null) {
        const start = Position.create(position.line, match.index);
        const end = Position.create(position.line, match.index + token.length);
        const range = Range.create(start, end);
        
        // Check if position is within this token
        if (this.isPositionInRange(position, range)) {
          return { token, range };
        }
      }
    }
    
    return null;
  }

  /**
   * Check if a position is within a range
   */
  private static isPositionInRange(position: Position, range: Range): boolean {
    if (position.line < range.start.line || position.line > range.end.line) {
      return false;
    }
    
    if (position.line === range.start.line && position.character < range.start.character) {
      return false;
    }
    
    if (position.line === range.end.line && position.character > range.end.character) {
      return false;
    }
    
    return true;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  static calculateEditDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() =>
      Array(str1.length + 1).fill(null)
    );

    for (let i = 0; i <= str1.length; i++) {
      matrix[0][i] = i;
    }

    for (let j = 0; j <= str2.length; j++) {
      matrix[j][0] = j;
    }

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Find similar strings from a list of candidates
   */
  static findSimilarStrings(
    target: string,
    candidates: string[],
    maxDistance: number = 2,
    maxResults: number = 3
  ): string[] {
    const similarities = candidates
      .map(candidate => ({
        candidate,
        distance: this.calculateEditDistance(target.toLowerCase(), candidate.toLowerCase())
      }))
      .filter(item => item.distance <= maxDistance)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, maxResults)
      .map(item => item.candidate);

    return similarities;
  }
}