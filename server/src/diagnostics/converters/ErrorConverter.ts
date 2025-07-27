import { Diagnostic, DiagnosticSeverity, Position } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ParseError } from '../../parser/FHIRPathService';
import { DiagnosticBuilder, DiagnosticCode, DiagnosticUtils } from '../DiagnosticBuilder';

/**
 * Interface for diagnostic mapping functionality
 */
export interface IDiagnosticMapper {
  mapErrorToDiagnosticCode(error: ParseError): DiagnosticCode;
  addSuggestionsForError(
    builder: DiagnosticBuilder,
    error: ParseError,
    expression: string,
    startColumn: number,
    endColumn: number
  ): DiagnosticBuilder;
}

/**
 * Converter for transforming parse errors into LSP diagnostics
 */
export class ErrorConverter {
  private readonly maxDiagnostics: number = 50;
  private readonly diagnosticMapper?: IDiagnosticMapper;

  constructor(diagnosticMapper?: IDiagnosticMapper) {
    this.diagnosticMapper = diagnosticMapper;
  }

  /**
   * Convert parse errors for individual expressions to enhanced LSP diagnostics
   */
  convertExpressionParseErrorsToDiagnostics(
    errors: ParseError[],
    document: TextDocument,
    expr: {expression: string; line: number; column: number}
  ): Diagnostic[] {
    return errors.slice(0, this.maxDiagnostics).map(error => {
      // Adjust the error position to be relative to the document, not the expression
      let line = expr.line;
      let startColumn = expr.column + error.column;
      let endColumn = startColumn + Math.max(1, error.length);

      // Ensure positions are within document bounds
      const lineCount = document.lineCount;
      line = Math.min(Math.max(0, line), lineCount - 1);

      const lineText = document.getText({
        start: Position.create(line, 0),
        end: Position.create(line + 1, 0)
      }).replace(/\n$/, ''); // Remove trailing newline

      const maxColumn = lineText.length;
      startColumn = Math.min(Math.max(0, startColumn), maxColumn);
      endColumn = Math.min(Math.max(startColumn + 1, endColumn), maxColumn);

      // Create enhanced diagnostic using DiagnosticBuilder if mapper is available
      if (this.diagnosticMapper) {
        const span = DiagnosticUtils.spanFromCoords(line, startColumn, line, endColumn);
        const diagnosticCode = this.diagnosticMapper.mapErrorToDiagnosticCode(error);

        let builder = DiagnosticBuilder.error(diagnosticCode)
          .withMessage(this.formatErrorMessage(error.message))
          .withSpan(span)
          .withSourceText(expr.expression);

        // Add intelligent suggestions based on error type and content
        builder = this.diagnosticMapper.addSuggestionsForError(builder, error, expr.expression, startColumn, endColumn);

        return builder.buildLSP();
      } else {
        // Fallback to basic diagnostic creation
        return {
          severity: DiagnosticSeverity.Error,
          range: {
            start: Position.create(line, startColumn),
            end: Position.create(line, endColumn)
          },
          message: this.formatErrorMessage(error.message),
          source: 'fhirpath-lsp',
          code: error.code || 'syntax-error'
        };
      }
    });
  }

  /**
   * Convert parse errors to LSP diagnostics
   */
  convertParseErrorsToDiagnostics(errors: ParseError[], document: TextDocument): Diagnostic[] {
    return errors.slice(0, this.maxDiagnostics).map(error => {
      // Use offset to get accurate position if available
      let line = error.line;
      let startColumn = error.column;
      let endColumn = startColumn + Math.max(1, error.length);

      // If we have offset information, use it for more accurate positioning
      if (error.offset !== undefined) {
        try {
          const startPos = document.positionAt(error.offset);
          const endPos = document.positionAt(error.offset + Math.max(1, error.length));
          line = startPos.line;
          startColumn = startPos.character;
          endColumn = endPos.character;
        } catch (offsetError) {
          // Fallback to line/column
          console.warn('Error using offset for positioning:', offsetError);
        }
      }

      // Ensure positions are within document bounds
      const lineCount = document.lineCount;
      line = Math.min(Math.max(0, line), lineCount - 1);

      const lineText = document.getText({
        start: Position.create(line, 0),
        end: Position.create(line + 1, 0)
      }).replace(/\n$/, ''); // Remove trailing newline

      const maxColumn = lineText.length;
      startColumn = Math.min(Math.max(0, startColumn), maxColumn);
      endColumn = Math.min(Math.max(startColumn + 1, endColumn), maxColumn);

      return {
        severity: DiagnosticSeverity.Error,
        range: {
          start: Position.create(line, startColumn),
          end: Position.create(line, endColumn)
        },
        message: this.formatErrorMessage(error.message),
        source: 'fhirpath-lsp',
        code: error.code || 'syntax-error'
      };
    });
  }

  /**
   * Format error messages for better user experience
   */
  private formatErrorMessage(message: string): string {
    // Clean up technical error messages
    return message
      .replace(/at position \d+/g, '') // Remove position info as it's shown in the range
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Create a basic error diagnostic for internal errors
   */
  createInternalErrorDiagnostic(document: TextDocument, error: Error | unknown): Diagnostic {
    const text = document.getText();
    return {
      severity: DiagnosticSeverity.Error,
      range: {
        start: Position.create(0, 0),
        end: Position.create(0, text.length)
      },
      message: `Internal error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      source: 'fhirpath-lsp',
      code: 'internal-error'
    };
  }

  /**
   * Ensure diagnostic positions are within document bounds
   */
  private ensureBounds(
    document: TextDocument,
    line: number,
    startColumn: number,
    endColumn: number
  ): { line: number; startColumn: number; endColumn: number } {
    const lineCount = document.lineCount;
    const boundedLine = Math.min(Math.max(0, line), lineCount - 1);

    const lineText = document.getText({
      start: Position.create(boundedLine, 0),
      end: Position.create(boundedLine + 1, 0)
    }).replace(/\n$/, '');

    const maxColumn = lineText.length;
    const boundedStartColumn = Math.min(Math.max(0, startColumn), maxColumn);
    const boundedEndColumn = Math.min(Math.max(boundedStartColumn + 1, endColumn), maxColumn);

    return {
      line: boundedLine,
      startColumn: boundedStartColumn,
      endColumn: boundedEndColumn
    };
  }
}
