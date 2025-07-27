import {
  parse,
  compile,
  analyze
} from '@atomic-ehr/fhirpath';
import type {
  FHIRPathExpression,
  AnalysisResult,
  ASTNode,
  Position,
  ParseResult as FHIRPathParseResult,
  ParseDiagnostic,
  TextRange,
  EvaluationContext,
  CompileOptions,
  AnalyzeOptions,
  CompiledExpression
} from '@atomic-ehr/fhirpath';

// Types for parser integration
export interface ParseResult {
  success: boolean;
  expression?: FHIRPathExpression;
  ast?: ASTNode;
  errors: ParseError[];
}

export interface ParseError {
  message: string;
  line: number;
  column: number;
  offset: number;
  length: number;
  code?: string;
}


// Local token type for LSP semantic highlighting
export interface Token {
  type: string; // Token type for semantic highlighting
  value: string;
  start: number;
  end: number;
  line: number;
  column: number;
}

/**
 * Simple FHIRPathExpression implementation for LSP use
 */
class SimpleFHIRPathExpression implements FHIRPathExpression {
  constructor(public readonly ast: ASTNode, private source: string) {}
  
  evaluate(input?: any, context?: EvaluationContext): any[] {
    // For LSP, we don't need evaluation - delegate to main API
    throw new Error('Evaluation not supported in LSP mode');
  }
  
  compile(options?: CompileOptions): CompiledExpression {
    return compile(this.source, options);
  }
  
  analyze(options?: AnalyzeOptions): AnalysisResult {
    return analyze(this.source, options);
  }
  
  toString(): string {
    return this.source;
  }
}

/**
 * Service for integrating with @atomic-ehr/fhirpath parser
 * Provides abstraction layer for LSP integration
 */
export class FHIRPathService {
  private parseCache = new Map<string, ParseResult>();
  private analysisCache = new Map<string, AnalysisResult>();

  /**
   * Parse FHIRPath expression and extract tokens for syntax highlighting
   */
  parse(expression: string): ParseResult {
    // Check cache first
    const cached = this.parseCache.get(expression);
    if (cached) {
      return cached;
    }

    try {
      // Parse the expression using @atomic-ehr/fhirpath parser
      const parseResult = parse(expression);

      // Check if parse has errors
      if (parseResult.hasErrors) {
        const errors = parseResult.diagnostics.map(diag => this.convertDiagnosticToError(diag, expression));
        const result: ParseResult = {
          success: false,
          errors
        };
        
        // Don't cache failed parses as they might be temporary during editing
        return result;
      }

      // Create successful result
      const result: ParseResult = {
        success: true,
        expression: new SimpleFHIRPathExpression(parseResult.ast, expression),
        ast: parseResult.ast,
        errors: []
      };

      // Cache successful parse
      this.parseCache.set(expression, result);
      return result;

    } catch (error: any) {
      const parseError = this.parseErrorFromException(error, expression);
      const result: ParseResult = {
        success: false,
        errors: [parseError]
      };

      // Don't cache failed parses as they might be temporary during editing
      return result;
    }
  }

  /**
   * Analyze expression for type information and semantic validation
   */
  analyze(expression: string | FHIRPathExpression): AnalysisResult | null {
    try {
      const key = typeof expression === 'string' ? expression : expression.toString();

      // Check cache
      const cached = this.analysisCache.get(key);
      if (cached) {
        return cached;
      }

      const result = analyze(expression);
      this.analysisCache.set(key, result);
      return result;

    } catch (error) {
      console.error('Analysis error:', error);
      return null;
    }
  }

  /**
   * Compile expression for performance (used in evaluation)
   */
  compile(expression: string | FHIRPathExpression) {
    try {
      return compile(expression);
    } catch (error) {
      console.error('Compilation error:', error);
      return null;
    }
  }

  /**
   * Convert ParseDiagnostic to ParseError for LSP compatibility
   */
  private convertDiagnosticToError(diagnostic: ParseDiagnostic, expression: string): ParseError {
    const range = diagnostic.range;
    const startOffset = this.lineColumnToOffset(expression, range.start.line, range.start.character);
    const endOffset = this.lineColumnToOffset(expression, range.end.line, range.end.character);
    
    return {
      message: diagnostic.message,
      line: range.start.line,
      column: range.start.character,
      offset: startOffset,
      length: endOffset - startOffset,
      code: diagnostic.code || 'fhirpath-parse-error'
    };
  }

  /**
   * Convert line/column position to text offset
   */
  private lineColumnToOffset(text: string, line: number, column: number): number {
    const lines = text.split('\n');
    let offset = 0;
    
    for (let i = 0; i < line && i < lines.length; i++) {
      offset += lines[i].length + 1; // +1 for newline character
    }
    
    return offset + column;
  }

  /**
   * Convert exception to structured parse error
   */
  private parseErrorFromException(error: any, expression: string): ParseError {
    let line = 0;
    let column = 0;
    let offset = 0;
    let length = 1;
    let message = error.message || 'Parse error';

    // Try to extract position information from error
    if (error.location) {
      line = error.location.line - 1; // Convert to 0-based
      column = error.location.column - 1; // Convert to 0-based
      offset = error.location.offset || 0;
      if (error.location.end) {
        length = error.location.end.offset - offset;
      }
    } else {
      // Fallback: try to parse position from error message
      const positionMatch = error.message?.match(/at position (\d+)/);
      if (positionMatch) {
        offset = parseInt(positionMatch[1]);
        const position = this.offsetToLineColumn(expression, offset);
        line = position.line;
        column = position.column;
      }
    }

    return {
      message,
      line,
      column,
      offset,
      length,
      code: 'fhirpath-parse-error'
    };
  }

  /**
   * Convert text offset to line/column position
   */
  private offsetToLineColumn(text: string, offset: number): { line: number; column: number } {
    const lines = text.substring(0, offset).split('\n');
    return {
      line: lines.length - 1,
      column: lines[lines.length - 1].length
    };
  }


  /**
   * Clear caches (useful for memory management)
   */
  clearCache(): void {
    this.parseCache.clear();
    this.analysisCache.clear();
  }

  /**
   * Get cache statistics for debugging
   */
  getCacheStats() {
    return {
      parseCache: this.parseCache.size,
      analysisCache: this.analysisCache.size
    };
  }
}
