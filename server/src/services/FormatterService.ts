import { TextDocument, Range, TextEdit } from 'vscode-languageserver';
import { FHIRPathService } from '../parser/FHIRPathService';

/**
 * Configuration options for FHIRPath expression formatting
 */
export interface FormattingOptions {
  /** Number of spaces for indentation */
  indentSize: number;
  /** Maximum line length before wrapping */
  maxLineLength: number;
  /** Add spaces around operators */
  operatorSpacing: boolean;
  /** Align function parameters */
  functionAlignment: boolean;
  /** Add spaces inside brackets */
  bracketSpacing: boolean;
  /** Add trailing commas in function calls */
  trailingCommas: boolean;
  /** Number of blank lines between multi-expressions */
  multiExpressionSpacing: number;
}

/**
 * Default formatting options
 */
export const DEFAULT_FORMATTING_OPTIONS: FormattingOptions = {
  indentSize: 2,
  maxLineLength: 100,
  operatorSpacing: true,
  functionAlignment: true,
  bracketSpacing: false,
  trailingCommas: false,
  multiExpressionSpacing: 1,
};

/**
 * Service for formatting FHIRPath expressions
 */
export class FormatterService {
  private fhirPathService: FHIRPathService;

  constructor(fhirPathService: FHIRPathService) {
    this.fhirPathService = fhirPathService;
  }

  /**
   * Format the entire document
   */
  formatDocument(document: TextDocument, options: FormattingOptions = DEFAULT_FORMATTING_OPTIONS): TextEdit[] {
    const text = document.getText();
    const lines = text.split('\n');
    const edits: TextEdit[] = [];

    let currentLine = 0;
    let inMultiLineExpression = false;
    let expressionBuffer: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      // Skip empty lines and comments
      if (!trimmedLine || trimmedLine.startsWith('//')) {
        if (inMultiLineExpression) {
          expressionBuffer.push(line);
        }
        continue;
      }

      // Check if this line continues an expression
      if (this.isExpressionContinuation(trimmedLine) || inMultiLineExpression) {
        expressionBuffer.push(line);
        inMultiLineExpression = !this.isExpressionComplete(expressionBuffer.join('\n'));
      } else {
        // Process previous multi-line expression if any
        if (expressionBuffer.length > 0) {
          const formatted = this.formatExpression(expressionBuffer.join('\n'), options);
          const startLine = currentLine;
          const endLine = i - 1;
          
          edits.push({
            range: {
              start: { line: startLine, character: 0 },
              end: { line: endLine, character: lines[endLine].length }
            },
            newText: formatted
          });
          
          expressionBuffer = [];
          currentLine = i;
        }

        // Start new expression
        expressionBuffer = [line];
        inMultiLineExpression = !this.isExpressionComplete(trimmedLine);
        
        if (!inMultiLineExpression) {
          // Single line expression
          const formatted = this.formatExpression(trimmedLine, options);
          if (formatted !== trimmedLine) {
            edits.push({
              range: {
                start: { line: i, character: 0 },
                end: { line: i, character: line.length }
              },
              newText: formatted
            });
          }
          expressionBuffer = [];
          currentLine = i + 1;
        }
      }
    }

    // Process any remaining expression
    if (expressionBuffer.length > 0) {
      const formatted = this.formatExpression(expressionBuffer.join('\n'), options);
      const startLine = currentLine;
      const endLine = lines.length - 1;
      
      edits.push({
        range: {
          start: { line: startLine, character: 0 },
          end: { line: endLine, character: lines[endLine].length }
        },
        newText: formatted
      });
    }

    return edits;
  }

  /**
   * Format a range within the document
   */
  formatRange(document: TextDocument, range: Range, options: FormattingOptions = DEFAULT_FORMATTING_OPTIONS): TextEdit[] {
    const text = document.getText(range);
    const formatted = this.formatExpression(text, options);
    
    if (formatted === text) {
      return [];
    }

    return [{
      range,
      newText: formatted
    }];
  }

  /**
   * Format a single FHIRPath expression
   */
  formatExpression(expression: string, options: FormattingOptions = DEFAULT_FORMATTING_OPTIONS): string {
    try {
      // Handle empty or whitespace-only expressions
      const trimmed = expression.trim();
      if (!trimmed) {
        return trimmed;
      }

      // Try to parse the expression for AST-based formatting
      try {
        const parseResult = this.fhirPathService.parse(trimmed);
        return this.formatFromAST(parseResult, options);
      } catch (parseError) {
        // Fall back to text-based formatting for invalid expressions
        return this.formatText(trimmed, options);
      }
    } catch (error) {
      // Return original if formatting fails
      return expression;
    }
  }

  /**
   * Check if a line is a continuation of an expression
   */
  private isExpressionContinuation(line: string): boolean {
    const trimmed = line.trim();
    // Starts with logical operators or has unclosed brackets/parentheses
    return /^(and|or|\.|union|intersect|\||&)/.test(trimmed) ||
           /^[\)\]]/.test(trimmed) ||
           this.hasUnclosedDelimiters(line);
  }

  /**
   * Check if an expression appears complete
   */
  private isExpressionComplete(expression: string): boolean {
    try {
      // Try to parse - if it parses successfully, it's likely complete
      this.fhirPathService.parse(expression.trim());
      return true;
    } catch {
      // Check for obvious incompleteness
      const trimmed = expression.trim();
      if (this.hasUnclosedDelimiters(trimmed)) {
        return false;
      }
      
      // Ends with operators that suggest continuation
      if (/(\.|and|or|union|intersect|\||&)\s*$/.test(trimmed)) {
        return false;
      }
      
      return true; // Assume complete if we can't determine otherwise
    }
  }

  /**
   * Check for unclosed delimiters
   */
  private hasUnclosedDelimiters(text: string): boolean {
    let parenCount = 0;
    let bracketCount = 0;
    let inString = false;
    let stringChar = '';

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const prevChar = i > 0 ? text[i - 1] : '';

      if (!inString) {
        if (char === '"' || char === "'") {
          inString = true;
          stringChar = char;
        } else if (char === '(') {
          parenCount++;
        } else if (char === ')') {
          parenCount--;
        } else if (char === '[') {
          bracketCount++;
        } else if (char === ']') {
          bracketCount--;
        }
      } else {
        if (char === stringChar && prevChar !== '\\') {
          inString = false;
          stringChar = '';
        }
      }
    }

    return parenCount !== 0 || bracketCount !== 0 || inString;
  }

  /**
   * Format expression using AST information
   */
  private formatFromAST(parseResult: any, options: FormattingOptions): string {
    // For now, fall back to text formatting
    // TODO: Implement AST-based formatting when parser provides structured AST
    return this.formatText(parseResult.expression || parseResult, options);
  }

  /**
   * Format expression using text-based rules
   */
  private formatText(expression: string, options: FormattingOptions): string {
    let formatted = expression;

    // Normalize whitespace
    formatted = formatted.replace(/\s+/g, ' ').trim();

    if (options.operatorSpacing) {
      // Add spaces around operators
      formatted = formatted
        .replace(/([^=!<>])(=|!=|<=|>=|<|>)([^=])/g, '$1 $2 $3')
        .replace(/\b(and|or|union|intersect)\b/g, ' $1 ')
        .replace(/\s+/g, ' '); // Clean up multiple spaces
    }

    // Handle function formatting
    formatted = this.formatFunctionCalls(formatted, options);

    // Handle bracket spacing
    if (options.bracketSpacing) {
      formatted = formatted
        .replace(/\[([^\]]+)\]/g, '[ $1 ]')
        .replace(/\(\s*([^)]+)\s*\)/g, '( $1 )');
    } else {
      formatted = formatted
        .replace(/\[\s+([^\]]+)\s+\]/g, '[$1]')
        .replace(/\(\s+([^)]+)\s+\)/g, '($1)');
    }

    // Clean up excessive whitespace
    formatted = formatted.replace(/\s+/g, ' ').trim();

    // Handle line length
    if (formatted.length > options.maxLineLength) {
      formatted = this.wrapLongExpression(formatted, options);
    }

    return formatted;
  }

  /**
   * Format function calls with proper spacing and alignment
   */
  private formatFunctionCalls(expression: string, options: FormattingOptions): string {
    // Handle function calls: function(params)
    return expression.replace(
      /(\w+)\s*\(\s*([^)]*)\s*\)/g,
      (match, funcName, params) => {
        if (!params.trim()) {
          return `${funcName}()`;
        }

        const formattedParams = params
          .split(',')
          .map((p: string) => p.trim())
          .join(', ');

        return `${funcName}(${formattedParams})`;
      }
    );
  }

  /**
   * Wrap long expressions across multiple lines
   */
  private wrapLongExpression(expression: string, options: FormattingOptions): string {
    const indent = ' '.repeat(options.indentSize);
    
    // Split on logical operators for wrapping
    const parts = expression.split(/\b(and|or|union|intersect)\b/);
    if (parts.length === 1) {
      return expression; // Can't wrap effectively
    }

    let wrapped = parts[0].trim();
    for (let i = 1; i < parts.length; i += 2) {
      const operator = parts[i];
      const nextPart = parts[i + 1]?.trim() || '';
      
      if (wrapped.length + operator.length + nextPart.length + 2 > options.maxLineLength) {
        wrapped += '\n' + indent + operator + ' ' + nextPart;
      } else {
        wrapped += ' ' + operator + ' ' + nextPart;
      }
    }

    return wrapped;
  }
}