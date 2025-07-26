import {
  parseLegacy,
  compile,
  analyze
} from '@atomic-ehr/fhirpath';
import type {
  FHIRPathExpression,
  AnalysisResult,
  ASTNode,
  Position
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
      // Parse the expression using @atomic-ehr/fhirpath legacy parser
      const parsedExpression = parseLegacy(expression);

      const result: ParseResult = {
        success: true,
        expression: parsedExpression,
        ast: parsedExpression.ast,
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
