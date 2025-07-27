import { Diagnostic, DiagnosticSeverity, Range, Position } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { IValidator, ValidationContext } from './IValidator';
import { DiagnosticBuilder, DiagnosticCode } from '../DiagnosticBuilder';

/**
 * Base abstract class for all validators providing common functionality
 */
export abstract class BaseValidator implements IValidator {
  protected readonly maxDiagnostics = 100;

  /**
   * Abstract method that concrete validators must implement
   */
  abstract validate(
    document: TextDocument,
    expression?: string,
    lineOffset?: number,
    columnOffset?: number
  ): Promise<Diagnostic[]> | Diagnostic[];

  /**
   * Creates a validation context from the provided parameters
   */
  protected createContext(
    document: TextDocument,
    expression?: string,
    lineOffset?: number,
    columnOffset?: number,
    resourceType?: string
  ): ValidationContext {
    return {
      document,
      expression,
      lineOffset: lineOffset || 0,
      columnOffset: columnOffset || 0,
      resourceType
    };
  }

  /**
   * Creates a diagnostic with the specified parameters
   */
  protected createDiagnostic(
    severity: DiagnosticSeverity,
    range: Range,
    message: string,
    code?: DiagnosticCode | string,
    source: string = 'fhirpath-lsp'
  ): Diagnostic {
    return {
      severity,
      range,
      message,
      source,
      code
    };
  }

  /**
   * Creates a range from line and character positions
   */
  protected createRange(
    startLine: number,
    startChar: number,
    endLine: number,
    endChar: number
  ): Range {
    return {
      start: Position.create(startLine, startChar),
      end: Position.create(endLine, endChar)
    };
  }

  /**
   * Adjusts a range by adding line and column offsets
   */
  protected adjustRange(range: Range, lineOffset: number, columnOffset: number): Range {
    return {
      start: Position.create(
        range.start.line + lineOffset,
        range.start.character + (range.start.line === 0 ? columnOffset : 0)
      ),
      end: Position.create(
        range.end.line + lineOffset,
        range.end.character + (range.end.line === 0 ? columnOffset : 0)
      )
    };
  }

  /**
   * Limits the number of diagnostics to prevent overwhelming the editor
   */
  protected limitDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
    if (diagnostics.length > this.maxDiagnostics) {
      const limited = diagnostics.slice(0, this.maxDiagnostics);
      limited.push(this.createDiagnostic(
        DiagnosticSeverity.Information,
        this.createRange(0, 0, 0, 0),
        `Too many diagnostics (${diagnostics.length}). Showing first ${this.maxDiagnostics}.`,
        'too-many-diagnostics'
      ));
      return limited;
    }
    return diagnostics;
  }

  /**
   * Extracts the text content from a document or expression
   */
  protected getTextContent(document: TextDocument, expression?: string): string {
    return expression || document.getText().trim();
  }

  /**
   * Checks if the document or expression is empty
   */
  protected isEmpty(document: TextDocument, expression?: string): boolean {
    const text = this.getTextContent(document, expression);
    return !text || text.length === 0;
  }
}
