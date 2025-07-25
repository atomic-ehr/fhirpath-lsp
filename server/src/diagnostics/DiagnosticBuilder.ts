import { Diagnostic, DiagnosticSeverity, Range, Position as LSPPosition } from 'vscode-languageserver/node';

/**
 * Diagnostic codes for FHIRPath expressions
 */
export enum DiagnosticCode {
  UnknownFunction = 'E007',
  SyntaxError = 'E001',
  TypeError = 'E002',
  InvalidPath = 'E003',
  UnknownProperty = 'E004',
  InvalidOperator = 'E005',
  InvalidLiteral = 'E006',
  UnterminatedString = 'E008',
  MissingArgument = 'E009',
  TooManyArguments = 'E010',
  InvalidContext = 'E011',
  CircularReference = 'E012'
}

/**
 * Position in source text (0-based)
 */
export interface Position {
  line: number;
  column: number;
}

/**
 * Span representing a range in source text
 */
export interface Span {
  start: Position;
  end: Position;
}

/**
 * Suggestion for fixing a diagnostic issue
 */
export interface Suggestion {
  message: string;
  replacement?: string;
  span?: Span;
}

/**
 * Enhanced diagnostic with rich information
 */
export interface EnhancedDiagnostic {
  code: DiagnosticCode;
  severity: 'error' | 'warning' | 'info' | 'hint';
  message: string;
  span?: Span;
  sourceText?: string;
  suggestions: Suggestion[];
  relatedInformation?: Array<{
    message: string;
    span: Span;
  }>;
}

/**
 * Builder for creating enhanced diagnostics with rich information
 */
export class DiagnosticBuilder {
  private diagnostic: Partial<EnhancedDiagnostic> = {
    suggestions: []
  };

  private constructor(code: DiagnosticCode, severity: 'error' | 'warning' | 'info' | 'hint') {
    this.diagnostic.code = code;
    this.diagnostic.severity = severity;
  }

  /**
   * Create an error diagnostic
   */
  static error(code: DiagnosticCode): DiagnosticBuilder {
    return new DiagnosticBuilder(code, 'error');
  }

  /**
   * Create a warning diagnostic
   */
  static warning(code: DiagnosticCode): DiagnosticBuilder {
    return new DiagnosticBuilder(code, 'warning');
  }

  /**
   * Create an info diagnostic
   */
  static info(code: DiagnosticCode): DiagnosticBuilder {
    return new DiagnosticBuilder(code, 'info');
  }

  /**
   * Create a hint diagnostic
   */
  static hint(code: DiagnosticCode): DiagnosticBuilder {
    return new DiagnosticBuilder(code, 'hint');
  }

  /**
   * Set the diagnostic message
   */
  withMessage(message: string): DiagnosticBuilder {
    this.diagnostic.message = message;
    return this;
  }

  /**
   * Set the span (location) of the diagnostic
   */
  withSpan(span: Span): DiagnosticBuilder {
    this.diagnostic.span = span;
    return this;
  }

  /**
   * Set the source text for context
   */
  withSourceText(sourceText: string): DiagnosticBuilder {
    this.diagnostic.sourceText = sourceText;
    return this;
  }

  /**
   * Add a suggestion for fixing the issue
   */
  suggest(message: string, replacement?: string, span?: Span): DiagnosticBuilder {
    this.diagnostic.suggestions!.push({
      message,
      replacement,
      span: span || this.diagnostic.span
    });
    return this;
  }

  /**
   * Add related information
   */
  withRelatedInformation(message: string, span: Span): DiagnosticBuilder {
    if (!this.diagnostic.relatedInformation) {
      this.diagnostic.relatedInformation = [];
    }
    this.diagnostic.relatedInformation.push({ message, span });
    return this;
  }

  /**
   * Build the enhanced diagnostic
   */
  build(): EnhancedDiagnostic {
    if (!this.diagnostic.message) {
      throw new Error('Diagnostic message is required');
    }
    return this.diagnostic as EnhancedDiagnostic;
  }

  /**
   * Build and convert to LSP diagnostic
   */
  buildLSP(): Diagnostic {
    const enhanced = this.build();

    // Convert severity
    let severity: DiagnosticSeverity;
    switch (enhanced.severity) {
      case 'error':
        severity = DiagnosticSeverity.Error;
        break;
      case 'warning':
        severity = DiagnosticSeverity.Warning;
        break;
      case 'info':
        severity = DiagnosticSeverity.Information;
        break;
      case 'hint':
        severity = DiagnosticSeverity.Hint;
        break;
    }

    // Convert span to LSP range
    let range: Range;
    if (enhanced.span) {
      range = {
        start: LSPPosition.create(enhanced.span.start.line, enhanced.span.start.column),
        end: LSPPosition.create(enhanced.span.end.line, enhanced.span.end.column)
      };
    } else {
      // Default range if no span provided
      range = {
        start: LSPPosition.create(0, 0),
        end: LSPPosition.create(0, 1)
      };
    }

    return {
      severity,
      range,
      message: enhanced.message,
      source: 'fhirpath-lsp',
      code: enhanced.code,
      data: {
        suggestions: enhanced.suggestions,
        sourceText: enhanced.sourceText,
        relatedInformation: enhanced.relatedInformation
      }
    };
  }
}

/**
 * Utility functions for creating common diagnostics
 */
export class DiagnosticUtils {
  /**
   * Create a new Position
   */
  static position(line: number, column: number): Position {
    return { line, column };
  }

  /**
   * Create a new Span
   */
  static span(start: Position, end: Position): Span {
    return { start, end };
  }

  /**
   * Create a span from line/column coordinates
   */
  static spanFromCoords(startLine: number, startColumn: number, endLine: number, endColumn: number): Span {
    return {
      start: { line: startLine, column: startColumn },
      end: { line: endLine, column: endColumn }
    };
  }

  /**
   * Format diagnostic for text display (similar to the Rust example)
   */
  static formatDiagnosticText(diagnostic: EnhancedDiagnostic): string {
    const severityText = diagnostic.severity;
    const codeText = `[${diagnostic.code}]`;

    let output = `${severityText}: ${diagnostic.message} ${codeText}\n`;

    if (diagnostic.span && diagnostic.sourceText) {
      const span = diagnostic.span;
      const lineNum = span.start.line + 1; // Convert to 1-based for display
      const startCol = span.start.column + 1;
      const endCol = span.end.column + 1;

      output += ` --> ${lineNum}:${startCol}-${endCol}\n`;
      output += `   ${lineNum} | ${diagnostic.sourceText}\n`;

      // Add underline for the error span
      const padding = ' '.repeat(String(lineNum).length + 3 + span.start.column);
      const underline = '^'.repeat(Math.max(1, span.end.column - span.start.column));
      output += `${padding}${underline}\n`;
    }

    if (diagnostic.suggestions.length > 0) {
      output += '\nsuggestions:\n';
      for (const suggestion of diagnostic.suggestions) {
        if (suggestion.replacement) {
          output += `  - ${suggestion.message} (replace with '${suggestion.replacement}')\n`;
        } else {
          output += `  - ${suggestion.message}\n`;
        }
      }
    }

    return output;
  }
}
