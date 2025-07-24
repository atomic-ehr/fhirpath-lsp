import {parse, evaluate, compile, analyze, TokenType, NodeType} from '@atomic-ehr/fhirpath';
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
      // Parse the expression using @atomic-ehr/fhirpath
      const parsedExpression = parse(expression);

      // TODO: Implement token extraction for syntax highlighting when needed

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
   * Extract tokens from AST for semantic highlighting
   */
  private extractTokensFromAST(ast: ASTNode, expression: string): Token[] {
    const tokens: Token[] = [];

    const walkAST = (node: ASTNode) => {
      if (!node || !node.position) return;

      let tokenType: TokenType | null = null;
      let value = '';

      // Map AST node types to token types based on @atomic-ehr/fhirpath AST structure
      switch (node.type) {
        case NodeType.Identifier:
          tokenType = TokenType.IDENTIFIER;
          value = this.getTextAtPosition(expression, node.position, 'identifier');
          break;

        case NodeType.TypeOrIdentifier:
          tokenType = TokenType.IDENTIFIER; // Use IDENTIFIER for type references too
          value = this.getTextAtPosition(expression, node.position, 'type');
          break;

        case NodeType.Function:
          tokenType = TokenType.IDENTIFIER; // Functions are identifiers in the lexer
          value = this.getTextAtPosition(expression, node.position, 'function');
          break;

        case NodeType.Literal:
          // Determine the literal type from the node value
          tokenType = TokenType.STRING; // Default, should be refined based on literal type
          value = this.getTextAtPosition(expression, node.position, 'literal');
          break;

        case NodeType.Binary:
        case NodeType.Unary:
          // These are operators, map to appropriate operator tokens
          tokenType = TokenType.PLUS; // Default, should be refined based on actual operator
          value = this.getTextAtPosition(expression, node.position, 'operator');
          break;
      }

      if (tokenType && value) {
        tokens.push({
          type: tokenType.toString(), // Convert TokenType enum to string
          value,
          start: node.position.offset,
          end: node.position.offset + value.length,
          line: node.position.line - 1, // LSP uses 0-based lines
          column: node.position.column - 1 // LSP uses 0-based columns
        });
      }

      // Recursively walk child nodes
      if ('children' in node && Array.isArray(node.children)) {
        for (const child of node.children) {
          if (child) walkAST(child);
        }
      }

      // Handle specific node structures based on the actual ASTNode structure
      const nodeWithStructure = node as any; // Cast to any to access dynamic properties
      if (nodeWithStructure.left) walkAST(nodeWithStructure.left);
      if (nodeWithStructure.right) walkAST(nodeWithStructure.right);
      if (nodeWithStructure.operand) walkAST(nodeWithStructure.operand);
      if (nodeWithStructure.arguments && Array.isArray(nodeWithStructure.arguments)) {
        for (const arg of nodeWithStructure.arguments) {
          if (arg) walkAST(arg);
        }
      }
    };

    walkAST(ast);

    // Sort tokens by position
    return tokens.sort((a, b) => a.start - b.start);
  }

  /**
   * Extract text at a specific position from the expression
   */
  private getTextAtPosition(expression: string, position: Position, nodeType: string): string {
    // This is a simplified implementation
    // In a real implementation, we'd need to track the exact text spans
    const start = position.offset;

    // Try to find word boundaries for the token
    let end = start;
    while (end < expression.length && /\w/.test(expression[end])) {
      end++;
    }

    return expression.substring(start, end) || nodeType;
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
