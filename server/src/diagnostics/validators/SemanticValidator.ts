import { Diagnostic, DiagnosticSeverity, Position } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { BaseExpressionValidator } from './IValidator';
import { FHIRPathService } from '../../parser/FHIRPathService';
import { FHIRPathContextService } from '../../services/FHIRPathContextService';

/**
 * Validator for FHIRPath semantic analysis and context validation
 */
export class SemanticValidator extends BaseExpressionValidator {
  private readonly fhirPathService: FHIRPathService;
  private readonly fhirPathContextService: FHIRPathContextService;
  private readonly maxDiagnostics: number = 50;

  constructor(
    fhirPathService: FHIRPathService,
    fhirPathContextService: FHIRPathContextService
  ) {
    super('SemanticValidator');
    this.fhirPathService = fhirPathService;
    this.fhirPathContextService = fhirPathContextService;
  }

  async validateExpression(
    document: TextDocument,
    expression: string,
    lineOffset: number = 0,
    columnOffset: number = 0
  ): Promise<Diagnostic[]> {
    const expr = { expression, line: lineOffset, column: columnOffset };
    return this.validateSemanticsForExpression(document, null, expr);
  }

  async validate(document: TextDocument): Promise<Diagnostic[]> {
    // For document-level validation, we would need to parse the document
    // and validate each expression. For now, return empty array as this
    // validator is primarily used for expression-level validation.
    return [];
  }

  /**
   * Perform semantic validation on successfully parsed expressions
   */
  async validateSemantics(
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
          // Skip if error is undefined or null
          if (!error) continue;

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
              message: error.message || 'Unknown semantic error',
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

    return diagnostics.slice(0, this.maxDiagnostics);
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
      const analysis = this.fhirPathService.analyze(parseResult?.expression || expr.expression);

      if (analysis && analysis.errors) {
        // Convert analysis errors to diagnostics, adjusting positions
        for (const error of analysis.errors) {
          // Skip if error is undefined or null
          if (!error) continue;

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
              message: error.message || 'Unknown semantic error',
              source: 'fhirpath-lsp',
              code: 'semantic-warning'
            });
          }
        }
      }

      if (analysis && analysis.warnings) {
        // Convert analysis warnings to diagnostics, adjusting positions
        for (const warning of analysis.warnings) {
          // Skip if warning is undefined or null
          if (!warning) continue;

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
                message: warning.message || 'Unknown semantic warning',
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
}
