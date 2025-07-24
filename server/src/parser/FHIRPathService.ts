import * as fhirpath from '@atomic-ehr/fhirpath';

export interface ParseResult {
  success: boolean;
  ast?: any; // FHIRPath AST type
  errors: ParseError[];
  tokens?: Token[];
}

export interface ParseError {
  message: string;
  line: number;
  column: number;
  offset: number;
  length: number;
}

export interface Token {
  type: TokenType;
  value: string;
  start: number;
  end: number;
  line: number;
  column: number;
}

export enum TokenType {
  Identifier = 'identifier',
  Function = 'function',
  Operator = 'operator',
  Keyword = 'keyword',
  String = 'string',
  Number = 'number',
  Boolean = 'boolean',
  Punctuation = 'punctuation'
}

export class FHIRPathService {
  private compiledCache = new Map<string, any>();
  
  parse(expression: string): ParseResult {
    try {
      const ast = fhirpath.parse(expression);
      
      const compiled = fhirpath.compile(ast);
      this.compiledCache.set(expression, compiled);
      
      const tokens = this.extractTokensFromAST(ast, expression);
      
      return {
        success: true,
        ast,
        tokens,
        errors: []
      };
    } catch (error: any) {
      return {
        success: false,
        errors: [this.parseErrorFromException(error, expression)]
      };
    }
  }
  
  analyze(expression: string | any): any {
    return fhirpath.analyze(expression);
  }
  
  validate(expression: string, resourceType?: string): ParseError[] {
    const errors: ParseError[] = [];
    
    try {
      const ast = fhirpath.parse(expression);
      const analysis = this.analyze(ast);
      
      if (resourceType && analysis.errors) {
        errors.push(...analysis.errors.map((err: any) => this.convertAnalysisError(err, expression)));
      }
    } catch (error: any) {
      errors.push(this.parseErrorFromException(error, expression));
    }
    
    return errors;
  }
  
  private extractTokensFromAST(ast: any, expression: string): Token[] {
    const tokens: Token[] = [];
    
    const walkAST = (node: any, parent?: any) => {
      if (!node) return;
      
      let tokenType: TokenType | null = null;
      let value: string | null = null;
      
      switch (node.type) {
        case 'Identifier':
          tokenType = TokenType.Identifier;
          value = node.name;
          break;
        case 'FunctionCall':
          tokenType = TokenType.Function;
          value = node.name;
          break;
        case 'StringLiteral':
          tokenType = TokenType.String;
          value = node.value;
          break;
        case 'NumberLiteral':
          tokenType = TokenType.Number;
          value = node.value.toString();
          break;
        case 'BooleanLiteral':
          tokenType = TokenType.Boolean;
          value = node.value.toString();
          break;
        case 'BinaryOperator':
          tokenType = TokenType.Operator;
          value = node.operator;
          break;
      }
      
      if (tokenType && value && node.location) {
        tokens.push({
          type: tokenType,
          value,
          start: node.location.start.offset,
          end: node.location.end.offset,
          line: node.location.start.line - 1,
          column: node.location.start.column - 1
        });
      }
      
      if (node.children) {
        for (const child of node.children) {
          walkAST(child, node);
        }
      }
    };
    
    walkAST(ast);
    return tokens.sort((a, b) => a.start - b.start);
  }
  
  private parseErrorFromException(error: any, expression: string): ParseError {
    if (error.location) {
      return {
        message: error.message || 'Parse error',
        line: error.location.start.line - 1,
        column: error.location.start.column - 1,
        offset: error.location.start.offset,
        length: error.location.end.offset - error.location.start.offset
      };
    }
    
    const match = error.message?.match(/at position (\d+)/);
    const offset = match ? parseInt(match[1]) : 0;
    
    return {
      message: error.message || 'Parse error',
      line: this.offsetToLine(expression, offset),
      column: this.offsetToColumn(expression, offset),
      offset,
      length: 1
    };
  }
  
  private convertAnalysisError(error: any, expression: string): ParseError {
    return {
      message: error.message || 'Validation error',
      line: error.line || 0,
      column: error.column || 0,
      offset: error.offset || 0,
      length: error.length || 1
    };
  }
  
  private offsetToLine(text: string, offset: number): number {
    return text.substring(0, offset).split('\n').length - 1;
  }
  
  private offsetToColumn(text: string, offset: number): number {
    const lines = text.substring(0, offset).split('\n');
    return lines[lines.length - 1].length;
  }
}