import {
  Diagnostic,
  DiagnosticSeverity,
  Range,
  Position
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { FHIRPathService, ParseError } from '../parser/FHIRPathService';
import { FHIRValidationProvider } from './FHIRValidationProvider';
import { FHIRPathContextService } from '../services/FHIRPathContextService';

/**
 * Provides diagnostic information for FHIRPath expressions
 * Focuses on syntax errors and basic semantic validation
 */
export class DiagnosticProvider {
  private readonly maxDiagnostics = 100; // Prevent overwhelming the editor
  private readonly debounceTime = 300; // ms to debounce validation
  private validationTimeouts = new Map<string, NodeJS.Timeout>();

  constructor(
    private fhirPathService: FHIRPathService,
    private fhirPathContextService: FHIRPathContextService,
    private fhirValidationProvider?: FHIRValidationProvider
  ) {}

  /**
   * Provide diagnostics for a text document
   */
  async provideDiagnostics(document: TextDocument): Promise<Diagnostic[]> {
    const text = document.getText().trim();
    
    // Skip empty documents
    if (!text) {
      return [];
    }

    try {
      const diagnostics: Diagnostic[] = [];
      
      // Extract individual FHIRPath expressions from the document
      const expressions = this.fhirPathContextService.extractFHIRPathExpressions(document);
      
      // If no expressions found, try parsing the whole document as a single expression (fallback)
      if (expressions.length === 0) {
        const parseResult = this.fhirPathService.parse(text);
        
        if (parseResult.success) {
          // For successful parses, run semantic validation
          const semanticDiagnostics = await this.validateSemantics(document, parseResult);
          diagnostics.push(...semanticDiagnostics);
        } else {
          // For failed parses, return syntax errors
          diagnostics.push(...this.convertParseErrorsToDiagnostics(parseResult.errors, document));
        }
      } else {
        // Parse each expression individually
        for (const expr of expressions) {
          try {
            const parseResult = this.fhirPathService.parse(expr.expression);
            
            if (parseResult.success) {
              // For successful parses, run semantic validation
              const semanticDiagnostics = await this.validateSemanticsForExpression(document, parseResult, expr);
              diagnostics.push(...semanticDiagnostics);
            } else {
              // For failed parses, convert errors and adjust their positions
              const expressionErrors = this.convertExpressionParseErrorsToDiagnostics(parseResult.errors, document, expr);
              diagnostics.push(...expressionErrors);
            }
          } catch (exprError) {
            // Handle errors in individual expressions
            console.warn(`Error parsing expression "${expr.expression}":`, exprError);
            diagnostics.push({
              severity: DiagnosticSeverity.Error,
              range: {
                start: Position.create(expr.line, expr.column),
                end: Position.create(expr.line, expr.column + expr.expression.length)
              },
              message: `Parse error: ${exprError instanceof Error ? exprError.message : 'Unknown error'}`,
              source: 'fhirpath-lsp',
              code: 'expression-parse-error'
            });
          }
        }
      }
      
      // Add FHIR validation if provider is available
      if (this.fhirValidationProvider) {
        const fhirDiagnostics = await this.fhirValidationProvider.validateDocument(document);
        diagnostics.push(...fhirDiagnostics);
      }
      
      return diagnostics.slice(0, this.maxDiagnostics);
      
    } catch (error) {
      // Handle unexpected errors gracefully
      console.error('Diagnostic provider error:', error);
      return [{
        severity: DiagnosticSeverity.Error,
        range: {
          start: Position.create(0, 0),
          end: Position.create(0, text.length)
        },
        message: `Internal error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        source: 'fhirpath-lsp',
        code: 'internal-error'
      }];
    }
  }

  /**
   * Convert parse errors for individual expressions to LSP diagnostics
   */
  private convertExpressionParseErrorsToDiagnostics(
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
   * Perform semantic validation on a successfully parsed expression
   */
  private async validateSemanticsForExpression(
    document: TextDocument, 
    parseResult: any,
    expr: {expression: string; line: number; column: number}
  ): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];
    
    try {
      // Use the analyzer from @atomic-ehr/fhirpath for semantic validation
      const analysis = this.fhirPathService.analyze(parseResult.expression);
      
      if (analysis && analysis.errors) {
        // Convert analysis errors to diagnostics, adjusting positions
        for (const error of analysis.errors) {
          let range;
          
          if (error.location) {
            // Adjust position to be relative to the document
            const adjustedLine = expr.line;
            const adjustedColumn = expr.column + (error.location.column - 1 || 0);
            
            range = {
              start: Position.create(adjustedLine, Math.max(0, adjustedColumn)),
              end: Position.create(adjustedLine, Math.max(0, adjustedColumn + (error.location.length || 1)))
            };
          } else {
            // Default to highlighting the entire expression
            range = {
              start: Position.create(expr.line, expr.column),
              end: Position.create(expr.line, expr.column + expr.expression.length)
            };
          }

          // Ensure range is within document bounds
          const lineCount = document.lineCount;
          if (range.start.line < lineCount) {
            const lineText = document.getText({
              start: Position.create(range.start.line, 0),
              end: Position.create(range.start.line + 1, 0)
            }).replace(/\n$/, '');
            
            const maxColumn = lineText.length;
            range.start.character = Math.min(range.start.character, maxColumn);
            range.end.character = Math.min(Math.max(range.start.character + 1, range.end.character), maxColumn);

            diagnostics.push({
              severity: DiagnosticSeverity.Warning,
              range,
              message: error.message,
              source: 'fhirpath-lsp',
              code: 'semantic-warning'
            });
          }
        }
      }

      if (analysis && analysis.warnings) {
        // Convert analysis warnings to diagnostics, adjusting positions
        for (const warning of analysis.warnings) {
          if (warning.location) {
            const adjustedLine = expr.line;
            const adjustedColumn = expr.column + (warning.location.column - 1 || 0);
            
            const range = {
              start: Position.create(adjustedLine, Math.max(0, adjustedColumn)),
              end: Position.create(adjustedLine, Math.max(0, adjustedColumn + (warning.location.length || 1)))
            };

            // Ensure range is within document bounds
            const lineCount = document.lineCount;
            if (range.start.line < lineCount) {
              const lineText = document.getText({
                start: Position.create(range.start.line, 0),
                end: Position.create(range.start.line + 1, 0)
              }).replace(/\n$/, '');
              
              const maxColumn = lineText.length;
              range.start.character = Math.min(range.start.character, maxColumn);
              range.end.character = Math.min(Math.max(range.start.character + 1, range.end.character), maxColumn);

              diagnostics.push({
                severity: DiagnosticSeverity.Information,
                range,
                message: warning.message,
                source: 'fhirpath-lsp',
                code: 'semantic-info'
              });
            }
          }
        }
      }

      // Custom semantic validation for property navigation without context
      const customValidation = await this.performCustomSemanticValidation(document, expr);
      diagnostics.push(...customValidation);
      
    } catch (error) {
      console.warn('Semantic validation error for expression:', expr.expression, error);
      // Don't fail the entire diagnostic process for semantic validation errors
    }

    return diagnostics;
  }

  /**
   * Perform custom semantic validation for FHIRPath expressions
   */
  private async performCustomSemanticValidation(
    document: TextDocument,
    expr: {expression: string; line: number; column: number}
  ): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];
    
    try {
      // Check if document has context declarations
      const hasContext = this.fhirPathContextService.hasContextDeclarations(document);
      
      // Check for property navigation without context
      // Skip expressions that start with resource types - they provide their own context
      if (!hasContext && this.isPropertyNavigation(expr.expression)) {
        const resourcePropertyMatch = expr.expression.match(/^([A-Z][a-zA-Z0-9]*)\.(\w+)/);
        
        // If the expression starts with a known resource type, it provides its own context
        // so we don't need to warn about empty input
        if (resourcePropertyMatch) {
          const [, resourceType] = resourcePropertyMatch;
          const knownResourceTypes = [
            'Patient', 'Observation', 'Condition', 'Procedure', 'MedicationRequest',
            'DiagnosticReport', 'Encounter', 'Organization', 'Practitioner', 'Location',
            'Device', 'Medication', 'Substance', 'AllergyIntolerance', 'Immunization'
          ];
          
          // If it starts with a known resource type, it's valid - no warning needed
          if (knownResourceTypes.includes(resourceType)) {
            // This is a valid resource-prefixed expression, no warning needed
            return diagnostics;
          }
        }
      }
      
      // Check for standalone property navigation (without resource type)
      if (!hasContext && this.isStandalonePropertyNavigation(expr.expression)) {
        const propertyName = expr.expression.trim();
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: {
            start: Position.create(expr.line, expr.column),
            end: Position.create(expr.line, expr.column + expr.expression.length)
          },
          message: `Cannot navigate property '${propertyName}' on empty input. Add context declaration like: // @resource Patient`,
          source: 'fhirpath-lsp',
          code: 'semantic-warning'
        });
      }
      
    } catch (error) {
      console.warn('Custom semantic validation error:', error);
    }
    
    return diagnostics;
  }

  /**
   * Check if expression is property navigation (e.g., "Patient.name")
   */
  private isPropertyNavigation(expression: string): boolean {
    return /^[A-Z][a-zA-Z0-9]*\.\w+/.test(expression.trim());
  }

  /**
   * Check if expression is standalone property navigation (e.g., "name", "active")
   */
  private isStandalonePropertyNavigation(expression: string): boolean {
    const trimmed = expression.trim();
    // Match lowercase property names that are valid FHIR properties
    const commonProperties = ['name', 'active', 'id', 'status', 'code', 'value', 'text', 'address', 'telecom', 'gender', 'birthDate'];
    return /^[a-z][a-zA-Z0-9]*$/.test(trimmed) && commonProperties.includes(trimmed);
  }

  /**
   * Convert parse errors to LSP diagnostics
   */
  private convertParseErrorsToDiagnostics(errors: ParseError[], document: TextDocument): Diagnostic[] {
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
   * Perform semantic validation on successfully parsed expressions
   */
  private async validateSemantics(
    document: TextDocument, 
    parseResult: any
  ): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];
    
    try {
      // Use the analyzer from @atomic-ehr/fhirpath for semantic validation
      const analysis = this.fhirPathService.analyze(parseResult.expression);
      
      if (analysis && analysis.errors) {
        // Convert analysis errors to diagnostics
        for (const error of analysis.errors) {
          let range;
          
          if (error.location) {
            // Use offset for accurate positioning if available
            if (error.location.offset !== undefined) {
              try {
                const startPos = document.positionAt(error.location.offset);
                const endPos = document.positionAt(error.location.offset + (error.location.length || 1));
                range = { start: startPos, end: endPos };
              } catch (offsetError) {
                // Fallback to line/column
                range = {
                  start: Position.create(
                    Math.max(0, error.location.line - 1), 
                    Math.max(0, error.location.column - 1)
                  ),
                  end: Position.create(
                    Math.max(0, error.location.line - 1), 
                    Math.max(0, error.location.column - 1 + (error.location.length || 1))
                  )
                };
              }
            } else {
              // Use line/column
              range = {
                start: Position.create(
                  Math.max(0, error.location.line - 1), 
                  Math.max(0, error.location.column - 1)
                ),
                end: Position.create(
                  Math.max(0, error.location.line - 1), 
                  Math.max(0, error.location.column - 1 + (error.location.length || 1))
                )
              };
            }

            diagnostics.push({
              severity: DiagnosticSeverity.Warning,
              range,
              message: error.message,
              source: 'fhirpath-lsp',
              code: 'semantic-warning'
            });
          }
        }
      }

      if (analysis && analysis.warnings) {
        // Convert analysis warnings to diagnostics
        for (const warning of analysis.warnings) {
          if (warning.location) {
            diagnostics.push({
              severity: DiagnosticSeverity.Information,
              range: {
                start: Position.create(
                  Math.max(0, warning.location.line - 1), 
                  Math.max(0, warning.location.column - 1)
                ),
                end: Position.create(
                  Math.max(0, warning.location.line - 1), 
                  Math.max(0, warning.location.column - 1 + (warning.location.length || 1))
                )
              },
              message: warning.message,
              source: 'fhirpath-lsp',
              code: 'semantic-info'
            });
          }
        }
      }
      
    } catch (error) {
      console.warn('Semantic validation error:', error);
      // Don't fail the entire diagnostic process for semantic validation errors
    }

    // Add custom validation rules
    diagnostics.push(...this.performCustomValidation(document, parseResult));
    
    return diagnostics.slice(0, this.maxDiagnostics);
  }

  /**
   * Perform custom validation rules specific to our use cases
   */
  private performCustomValidation(document: TextDocument, parseResult: any): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();
    
    // Check for common patterns that might be problematic
    
    // 1. Check for unclosed strings
    const stringMatches = text.matchAll(/'[^']*$/gm);
    for (const match of stringMatches) {
      if (match.index !== undefined) {
        const position = document.positionAt(match.index);
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: position,
            end: Position.create(position.line, position.character + match[0].length)
          },
          message: 'Unterminated string literal',
          source: 'fhirpath-lsp',
          code: 'unterminated-string'
        });
      }
    }

    // 2. Check for unmatched brackets
    let bracketBalance = 0;
    let parenBalance = 0;
    let lastUnmatchedBracket: { pos: number; char: string } | null = null;
    let lastUnmatchedParen: { pos: number; char: string } | null = null;
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      switch (char) {
        case '[':
          bracketBalance++;
          break;
        case ']':
          bracketBalance--;
          if (bracketBalance < 0) {
            lastUnmatchedBracket = { pos: i, char };
          }
          break;
        case '(':
          parenBalance++;
          break;
        case ')':
          parenBalance--;
          if (parenBalance < 0) {
            lastUnmatchedParen = { pos: i, char };
          }
          break;
      }
    }

    // Report unmatched brackets
    if (bracketBalance > 0) {
      const position = document.positionAt(text.length);
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: position,
          end: position
        },
        message: 'Missing closing bracket "]"',
        source: 'fhirpath-lsp',
        code: 'missing-bracket'
      });
    } else if (lastUnmatchedBracket) {
      const position = document.positionAt(lastUnmatchedBracket.pos);
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: position,
          end: Position.create(position.line, position.character + 1)
        },
        message: 'Unexpected closing bracket "]"',
        source: 'fhirpath-lsp',
        code: 'unexpected-bracket'
      });
    }

    // Report unmatched parentheses
    if (parenBalance > 0) {
      const position = document.positionAt(text.length);
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: position,
          end: position
        },
        message: 'Missing closing parenthesis ")"',
        source: 'fhirpath-lsp',
        code: 'missing-paren'
      });
    } else if (lastUnmatchedParen) {
      const position = document.positionAt(lastUnmatchedParen.pos);
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: position,
          end: Position.create(position.line, position.character + 1)
        },
        message: 'Unexpected closing parenthesis ")"',
        source: 'fhirpath-lsp',
        code: 'unexpected-paren'
      });
    }

    return diagnostics;
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
   * Debounced validation to avoid excessive validation during typing
   */
  validateWithDebounce(document: TextDocument, callback: (diagnostics: Diagnostic[]) => void): void {
    const uri = document.uri;
    
    // Clear existing timeout
    const existingTimeout = this.validationTimeouts.get(uri);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Set new timeout
    const timeout = setTimeout(async () => {
      try {
        const diagnostics = await this.provideDiagnostics(document);
        callback(diagnostics);
      } catch (error) {
        console.error('Debounced validation error:', error);
      } finally {
        this.validationTimeouts.delete(uri);
      }
    }, this.debounceTime);

    this.validationTimeouts.set(uri, timeout);
  }

  /**
   * Clear validation timeout for a document (useful when document is closed)
   */
  clearValidationTimeout(uri: string): void {
    const timeout = this.validationTimeouts.get(uri);
    if (timeout) {
      clearTimeout(timeout);
      this.validationTimeouts.delete(uri);
    }
  }
}