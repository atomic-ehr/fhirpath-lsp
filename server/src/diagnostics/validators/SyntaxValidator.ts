import { Diagnostic, DiagnosticSeverity, Range, Position } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { BaseValidator } from './BaseValidator';
import { DiagnosticBuilder, DiagnosticCode } from '../DiagnosticBuilder';

/**
 * Validates syntax patterns in FHIRPath expressions
 * Handles string issues, bracket mismatches, and operator problems
 */
export class SyntaxValidator extends BaseValidator {

  /**
   * Validates syntax patterns that might not be caught by the parser
   */
  validate(
    document: TextDocument,
    expression?: string,
    lineOffset: number = 0,
    columnOffset: number = 0
  ): Diagnostic[] {
    const text = this.getTextContent(document, expression);
    if (this.isEmpty(document, expression)) {
      return [];
    }

    const diagnostics: Diagnostic[] = [];

    try {
      // Check for unterminated strings
      const stringIssues = this.findStringIssues(text);
      for (const issue of stringIssues) {
        const range = Range.create(
          Position.create(lineOffset, columnOffset + issue.start),
          Position.create(lineOffset, columnOffset + issue.end)
        );

        const diagnostic = DiagnosticBuilder.error(DiagnosticCode.UnterminatedString)
          .withMessage(issue.message)
          .withRange(range)
          .withSourceText(text)
          .buildLSP();

        diagnostics.push(diagnostic);
      }

      // Check for bracket mismatches
      const bracketIssues = this.findBracketIssues(text);
      for (const issue of bracketIssues) {
        const range = Range.create(
          Position.create(lineOffset, columnOffset + issue.start),
          Position.create(lineOffset, columnOffset + issue.end)
        );

        const diagnostic = DiagnosticBuilder.error(DiagnosticCode.SyntaxError)
          .withMessage(issue.message)
          .withRange(range)
          .withSourceText(text)
          .buildLSP();

        diagnostics.push(diagnostic);
      }

      // Check for missing operators (simple patterns)
      const operatorIssues = this.findOperatorIssues(text);
      for (const issue of operatorIssues) {
        const range = Range.create(
          Position.create(lineOffset, columnOffset + issue.start),
          Position.create(lineOffset, columnOffset + issue.end)
        );

        const diagnostic = DiagnosticBuilder.warning(DiagnosticCode.InvalidOperator)
          .withMessage(issue.message)
          .withRange(range)
          .withSourceText(text)
          .buildLSP();

        diagnostics.push(diagnostic);
      }

    } catch (error) {
      console.error('Error in syntax validation:', error);
    }

    return this.limitDiagnostics(diagnostics);
  }

  /**
   * Find string-related issues including unterminated strings and quote mismatches
   */
  private findStringIssues(expression: string): Array<{start: number, end: number, message: string}> {
    const issues: Array<{start: number, end: number, message: string}> = [];

    // Parse the expression character by character to find string issues
    let i = 0;
    while (i < expression.length) {
      const char = expression[i];

      // Check for string start (single or double quote)
      if (char === '"' || char === "'") {
        const quoteChar = char;
        const stringStart = i;
        i++; // Move past opening quote

        let stringEnd = -1;
        let escaped = false;

        // Look for closing quote
        while (i < expression.length) {
          const currentChar = expression[i];

          if (escaped) {
            escaped = false;
          } else if (currentChar === '\\') {
            escaped = true;
          } else if (currentChar === quoteChar) {
            stringEnd = i;
            break;
          }
          i++;
        }

        // Check if string was properly terminated
        if (stringEnd === -1) {
          // Unterminated string
          const quoteType = quoteChar === '"' ? 'double' : 'single';
          issues.push({
            start: stringStart,
            end: expression.length,
            message: `Unterminated string (missing closing ${quoteType} quote '${quoteChar}')`
          });
        } else {
          // String was properly terminated, check for common issues
          const stringContent = expression.substring(stringStart + 1, stringEnd);

          // Check for mixed quotes within string (potential escaping issue)
          const oppositeQuote = quoteChar === '"' ? "'" : '"';
          if (stringContent.includes(oppositeQuote) && !stringContent.includes('\\' + oppositeQuote)) {
            // This might be okay, but could indicate a potential issue
            // Only warn if there are unescaped quotes of the same type
            const unescapedSameQuotes = this.findUnescapedQuotes(stringContent, quoteChar);
            if (unescapedSameQuotes.length > 0) {
              issues.push({
                start: stringStart,
                end: stringEnd + 1,
                message: `String contains unescaped ${quoteChar === '"' ? 'double' : 'single'} quotes. Consider escaping with \\${quoteChar}`
              });
            }
          }
        }
      } else {
        i++;
      }
    }

    // Additional check for common quote mixing patterns
    this.checkForQuoteMixingIssues(expression, issues);

    return issues;
  }

  /**
   * Find unescaped quotes within a string content
   */
  private findUnescapedQuotes(content: string, quoteChar: string): number[] {
    const positions: number[] = [];
    let i = 0;
    let escaped = false;

    while (i < content.length) {
      const char = content[i];

      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quoteChar) {
        positions.push(i);
      }
      i++;
    }

    return positions;
  }

  /**
   * Check for common quote mixing patterns that might indicate errors
   */
  private checkForQuoteMixingIssues(expression: string, issues: Array<{start: number, end: number, message: string}>): void {
    // Look for patterns like 'some text" or "some text' (mismatched quotes)
    const mismatchPatterns = [
      { regex: /'[^']*"/g, message: "Mismatched quotes: string starts with single quote but ends with double quote" },
      { regex: /"[^"]*'/g, message: "Mismatched quotes: string starts with double quote but ends with single quote" }
    ];

    for (const pattern of mismatchPatterns) {
      let match;
      while ((match = pattern.regex.exec(expression)) !== null) {
        // Check if this is actually a mismatched quote or just quotes within a string
        const beforeMatch = expression.substring(0, match.index);
        const afterMatch = expression.substring(match.index + match[0].length);

        // Simple heuristic: if there's no proper string termination after this, it's likely an error
        const hasProperTermination = this.hasStringTermination(afterMatch, match[0][0]);

        if (!hasProperTermination) {
          issues.push({
            start: match.index,
            end: match.index + match[0].length,
            message: pattern.message
          });
        }
      }
    }
  }

  /**
   * Check if a string has proper termination
   */
  private hasStringTermination(remainingText: string, expectedQuote: string): boolean {
    // Look for the expected closing quote not preceded by backslash
    let i = 0;
    let escaped = false;

    while (i < remainingText.length) {
      const char = remainingText[i];

      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === expectedQuote) {
        return true;
      }
      i++;
    }

    return false;
  }

  /**
   * Find bracket-related issues
   */
  private findBracketIssues(expression: string): Array<{start: number, end: number, message: string}> {
    const issues: Array<{start: number, end: number, message: string}> = [];

    // Simple bracket balance check
    let parenCount = 0;
    let squareCount = 0;
    let inString = false;
    let stringChar = '';

    for (let i = 0; i < expression.length; i++) {
      const char = expression[i];

      // Handle string state
      if ((char === '"' || char === "'") && (i === 0 || expression[i-1] !== '\\')) {
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

      // Count brackets
      if (char === '(') parenCount++;
      else if (char === ')') parenCount--;
      else if (char === '[') squareCount++;
      else if (char === ']') squareCount--;

      // Check for immediate issues
      if (parenCount < 0) {
        issues.push({
          start: i,
          end: i + 1,
          message: "Unexpected closing parenthesis ')'"
        });
        parenCount = 0; // Reset to avoid cascading errors
      }

      if (squareCount < 0) {
        issues.push({
          start: i,
          end: i + 1,
          message: "Unexpected closing bracket ']'"
        });
        squareCount = 0; // Reset to avoid cascading errors
      }
    }

    // Check for unclosed brackets at the end
    if (parenCount > 0) {
      issues.push({
        start: expression.length - 1,
        end: expression.length,
        message: `Missing ${parenCount} closing parenthesis${parenCount > 1 ? 'es' : ''} ')'`
      });
    }

    if (squareCount > 0) {
      issues.push({
        start: expression.length - 1,
        end: expression.length,
        message: `Missing ${squareCount} closing bracket${squareCount > 1 ? 's' : ''} ']'`
      });
    }

    return issues;
  }

  /**
   * Find operator-related issues
   */
  private findOperatorIssues(expression: string): Array<{start: number, end: number, message: string}> {
    const issues: Array<{start: number, end: number, message: string}> = [];

    // Look for patterns that might be missing operators
    // Pattern: identifier followed by literal without operator
    const missingOpPattern = /\b([a-zA-Z][a-zA-Z0-9_]*)\s+(true|false|\d+|'[^']*'|"[^"]*")/g;
    let match;

    while ((match = missingOpPattern.exec(expression)) !== null) {
      const identifier = match[1];
      const literal = match[2];
      const identifierEnd = match.index + identifier.length;

      // Find the start of the literal to position the diagnostic correctly
      const literalStart = match.index + match[0].length - literal.length;

      // Position the diagnostic in the whitespace between identifier and literal
      // This is where the missing operator should be inserted
      issues.push({
        start: literalStart,
        end: literalStart + literal.length,
        message: `Missing operator before '${literal}' (did you mean '= ${literal}'?)`
      });
    }

    return issues;
  }
}
