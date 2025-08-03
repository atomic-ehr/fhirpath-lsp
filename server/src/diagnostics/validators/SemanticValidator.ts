import { Diagnostic, DiagnosticSeverity, Position, Range } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { BaseValidator } from './BaseValidator';
import { FHIRPathService } from '../../parser/FHIRPathService';
import type { TypeInfo, AnalysisResult } from '@atomic-ehr/fhirpath';

export class SemanticValidator extends BaseValidator {
  private typeCache = new Map<string, TypeInfo | null>();
  private analysisCache = new Map<string, AnalysisResult | null>();
  
  constructor(private fhirPathService: FHIRPathService) {
    super();
  }

  async validate(
    document: TextDocument,
    expression?: string,
    lineOffset: number = 0,
    columnOffset: number = 0
  ): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];

    try {
      let exprToAnalyze: string;
      
      if (expression) {
        exprToAnalyze = expression;
      } else {
        exprToAnalyze = document.getText();
      }

      // Parse the expression first
      const parseResult = this.fhirPathService.parse(exprToAnalyze);
      
      if (!parseResult.success) {
        // If parse failed, don't attempt semantic analysis
        return diagnostics;
      }

      // Perform semantic analysis with enhanced options
      const analysis = this.fhirPathService.analyze(exprToAnalyze, {
        errorRecovery: true,
        // Add any variables that might be in scope
        variables: {
          '$this': 'any' // Default context variable
        }
      });

      if (analysis && analysis.diagnostics) {
        // Convert all diagnostics from the analyzer
        for (const diagnostic of analysis.diagnostics) {
          if (!diagnostic) continue;

          // Convert severity from fhirpath to LSP
          let severity: DiagnosticSeverity = DiagnosticSeverity.Information;
          switch (diagnostic.severity) {
            case 1: // Error
              severity = DiagnosticSeverity.Error;
              break;
            case 2: // Warning
              severity = DiagnosticSeverity.Warning;
              break;
            case 3: // Information
              severity = DiagnosticSeverity.Information;
              break;
            case 4: // Hint
              severity = DiagnosticSeverity.Hint;
              break;
          }

          let range: Range;
          if (diagnostic.range) {
            // Use the range from the diagnostic directly
            range = {
              start: {
                line: diagnostic.range.start.line + lineOffset,
                character: diagnostic.range.start.character + columnOffset
              },
              end: {
                line: diagnostic.range.end.line + lineOffset,
                character: diagnostic.range.end.character + columnOffset
              }
            };
          } else {
            // Fallback to a single character range at the start
            range = {
              start: { line: lineOffset, character: columnOffset },
              end: { line: lineOffset, character: columnOffset + 1 }
            };
          }

          diagnostics.push({
            severity,
            range,
            message: diagnostic.message,
            source: 'fhirpath-semantic',
            code: diagnostic.code
          });
        }
      }

    } catch (error) {
      // If semantic analysis fails, create a general error diagnostic
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: { line: lineOffset, character: columnOffset },
          end: { line: lineOffset, character: columnOffset + (expression?.length || 1) }
        },
        message: `Semantic analysis failed: ${error instanceof Error ? error.message : String(error)}`,
        source: 'fhirpath-semantic'
      });
    }

    return diagnostics;
  }

  async validateExpression(
    _document: TextDocument,
    expression: string,
    lineOffset: number = 0,
    columnOffset: number = 0
  ): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];

    try {
      // Parse the expression first for validation
      const parseResult = this.fhirPathService.parse(expression);
      
      if (!parseResult.success) {
        // If parse failed, don't attempt semantic analysis
        return diagnostics;
      }

      // Perform semantic analysis with context-aware validation
      const analysis = this.fhirPathService.analyze(expression, {
        errorRecovery: true,
        variables: {
          '$this': 'any'
        }
      });

      if (analysis && analysis.diagnostics) {
        // Convert analysis diagnostics to LSP diagnostics
        for (const diagnostic of analysis.diagnostics) {
          if (!diagnostic) continue;

          // Convert severity
          let severity: DiagnosticSeverity = DiagnosticSeverity.Information;
          switch (diagnostic.severity) {
            case 1: // Error
              severity = DiagnosticSeverity.Error;
              break;
            case 2: // Warning
              severity = DiagnosticSeverity.Warning;
              break;
            case 3: // Information
              severity = DiagnosticSeverity.Information;
              break;
            case 4: // Hint
              severity = DiagnosticSeverity.Hint;
              break;
          }

          let range: Range;
          if (diagnostic.range) {
            // Adjust range to document coordinates
            const startLine = lineOffset + diagnostic.range.start.line;
            const startChar = (diagnostic.range.start.line === 0 ? columnOffset : 0) + diagnostic.range.start.character;
            const endLine = lineOffset + diagnostic.range.end.line;
            const endChar = (diagnostic.range.end.line === 0 ? columnOffset : 0) + diagnostic.range.end.character;

            range = {
              start: { line: startLine, character: startChar },
              end: { line: endLine, character: endChar }
            };
          } else {
            // Fallback to expression range
            range = {
              start: { line: lineOffset, character: columnOffset },
              end: { line: lineOffset, character: columnOffset + expression.length }
            };
          }

          diagnostics.push({
            severity,
            range,
            message: diagnostic.message,
            source: 'fhirpath-semantic',
            code: diagnostic.code
          });
        }
      }

    } catch (error) {
      // If semantic analysis fails, create a general warning
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: { line: lineOffset, character: columnOffset },
          end: { line: lineOffset, character: columnOffset + expression.length }
        },
        message: `Semantic analysis failed: ${error instanceof Error ? error.message : String(error)}`,
        source: 'fhirpath-semantic'
      });
    }

    return diagnostics;
  }

  async validateSemantics(
    document: TextDocument,
    parseResult: any,
    resourceType?: string
  ): Promise<Diagnostic[]> {
    if (!parseResult.success) {
      return [];
    }

    // Use the expression from the parse result
    const expression = parseResult.expression || document.getText();
    
    // If we have a resource type, use context-aware validation
    if (resourceType) {
      return this.validateExpressionWithContext(document, expression, resourceType, 0, 0);
    }
    
    // Otherwise delegate to the main validateExpression method
    return this.validateExpression(document, expression, 0, 0);
  }

  /**
   * Enhanced validation with FHIR resource context
   */
  async validateExpressionWithContext(
    _document: TextDocument,
    expression: string,
    resourceType?: string,
    lineOffset: number = 0,
    columnOffset: number = 0
  ): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];

    try {
      // Parse the expression first
      const parseResult = this.fhirPathService.parse(expression);
      
      if (!parseResult.success) {
        return diagnostics;
      }

      // Perform enhanced type-aware analysis
      const analysis = await this.performEnhancedAnalysis(expression, resourceType);
      
      if (analysis) {
        // Convert analysis diagnostics with enhanced context
        if (analysis.diagnostics) {
          for (const diagnostic of analysis.diagnostics) {
            if (!diagnostic) continue;

            const enhancedDiagnostic = this.createEnhancedDiagnostic(
              diagnostic,
              expression,
              resourceType,
              lineOffset,
              columnOffset
            );
            
            diagnostics.push(enhancedDiagnostic);
          }
        }

        // Add type-specific validations
        const typeValidations = await this.performTypeValidation(
          expression,
          analysis,
          resourceType,
          lineOffset,
          columnOffset
        );
        diagnostics.push(...typeValidations);
      }

      // Add additional context-specific validations
      if (resourceType) {
        const contextDiagnostics = await this.validateResourceContext(
          expression, 
          resourceType, 
          lineOffset, 
          columnOffset
        );
        diagnostics.push(...contextDiagnostics);
      }

    } catch (error) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: { line: lineOffset, character: columnOffset },
          end: { line: lineOffset, character: columnOffset + expression.length }
        },
        message: `Enhanced analysis failed: ${error instanceof Error ? error.message : String(error)}`,
        source: 'fhirpath-semantic-enhanced'
      });
    }

    return diagnostics;
  }

  /**
   * Validate expression against specific resource context
   */
  private async validateResourceContext(
    expression: string,
    resourceType: string,
    lineOffset: number,
    columnOffset: number
  ): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];

    try {
      // Skip validation if expression is just the resource type name
      const trimmedExpression = expression.trim();
      if (trimmedExpression === resourceType) {
        return diagnostics; // Resource type name alone is valid
      }

      // Get available properties for the resource type
      const availableProperties = this.fhirPathService.getResourceProperties(resourceType);
      
      // Check for references to non-existent properties
      const propertyPattern = /(\w+)\.(\w+)/g;
      let match;
      
      while ((match = propertyPattern.exec(expression)) !== null) {
        const [, baseType, property] = match;
        
        // Skip if property name matches a resource type (e.g., Patient.Patient should not error)
        if (property === baseType) {
          continue;
        }
        
        // If base type matches resource type, validate property exists
        if (baseType === resourceType && availableProperties.length > 0) {
          if (!availableProperties.includes(property)) {
            diagnostics.push({
              severity: DiagnosticSeverity.Warning,
              range: {
                start: { line: lineOffset, character: columnOffset + match.index },
                end: { line: lineOffset, character: columnOffset + match.index + match[0].length }
              },
              message: `Property '${property}' may not exist on ${resourceType}`,
              source: 'fhirpath-context-validation',
              code: 'unknown-property'
            });
          }
        }
      }

      // Validate type expectations
      const expressionType = this.fhirPathService.getExpressionType(expression, resourceType);
      if (expressionType) {
        // Add informational diagnostic about inferred type
        diagnostics.push({
          severity: DiagnosticSeverity.Hint,
          range: {
            start: { line: lineOffset, character: columnOffset },
            end: { line: lineOffset, character: columnOffset + expression.length }
          },
          message: `Expression evaluates to: ${expressionType.type}${expressionType.singleton ? '' : '[]'}`,
          source: 'fhirpath-type-info',
          code: 'type-inference'
        });
      }

    } catch (error) {
      // Don't fail validation due to context analysis errors
      console.warn('Resource context validation failed:', error);
    }

    return diagnostics;
  }

  /**
   * Perform enhanced analysis with advanced type checking
   */
  private async performEnhancedAnalysis(
    expression: string,
    resourceType?: string
  ): Promise<AnalysisResult | null> {
    const cacheKey = `${expression}:${resourceType || 'any'}`;
    
    // Check cache first
    if (this.analysisCache.has(cacheKey)) {
      return this.analysisCache.get(cacheKey) || null;
    }

    try {
      // Initialize model provider if available
      await this.fhirPathService.initializeModelProvider();

      // Perform context-aware analysis with enhanced options
      const analysis = this.fhirPathService.analyzeWithContext(
        expression,
        resourceType,
        {
          '$this': resourceType || 'any',
          '$context': resourceType || 'any'
        }
      );

      // Cache result
      this.analysisCache.set(cacheKey, analysis);
      return analysis;

    } catch (error) {
      console.warn('Enhanced analysis failed:', error);
      this.analysisCache.set(cacheKey, null);
      return null;
    }
  }

  /**
   * Create enhanced diagnostic with better context and suggestions
   */
  private createEnhancedDiagnostic(
    originalDiagnostic: any,
    expression: string,
    resourceType?: string,
    lineOffset: number = 0,
    columnOffset: number = 0
  ): Diagnostic {
    let severity: DiagnosticSeverity = DiagnosticSeverity.Information;
    switch (originalDiagnostic.severity) {
      case 1:
        severity = DiagnosticSeverity.Error;
        break;
      case 2:
        severity = DiagnosticSeverity.Warning;
        break;
      case 3:
        severity = DiagnosticSeverity.Information;
        break;
      case 4:
        severity = DiagnosticSeverity.Hint;
        break;
    }

    let range: Range;
    if (originalDiagnostic.range) {
      range = {
        start: {
          line: lineOffset + originalDiagnostic.range.start.line,
          character: (originalDiagnostic.range.start.line === 0 ? columnOffset : 0) + originalDiagnostic.range.start.character
        },
        end: {
          line: lineOffset + originalDiagnostic.range.end.line,
          character: (originalDiagnostic.range.end.line === 0 ? columnOffset : 0) + originalDiagnostic.range.end.character
        }
      };
    } else {
      range = {
        start: { line: lineOffset, character: columnOffset },
        end: { line: lineOffset, character: columnOffset + expression.length }
      };
    }

    // Enhanced message with context and suggestions
    let message = originalDiagnostic.message;
    if (resourceType) {
      message += ` (in ${resourceType} context)`;
    }

    // Add type information if available
    if (originalDiagnostic.expectedType || originalDiagnostic.actualType) {
      const expected = originalDiagnostic.expectedType;
      const actual = originalDiagnostic.actualType;
      if (expected && actual) {
        message += ` - expected ${expected}, got ${actual}`;
      }
    }

    return {
      severity,
      range,
      message,
      source: 'fhirpath-semantic-enhanced',
      code: originalDiagnostic.code || 'semantic-analysis'
    };
  }

  /**
   * Perform advanced type validation
   */
  private async performTypeValidation(
    expression: string,
    analysis: AnalysisResult,
    resourceType?: string,
    lineOffset: number = 0,
    columnOffset: number = 0
  ): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];

    try {
      // Get inferred type for the expression
      const inferredType = this.fhirPathService.getExpressionType(expression, resourceType);
      
      if (inferredType) {
        // Check for type compatibility issues
        const typeIssues = this.validateTypeCompatibility(expression, inferredType, resourceType);
        
        for (const issue of typeIssues) {
          diagnostics.push({
            severity: issue.severity,
            range: {
              start: { line: lineOffset, character: columnOffset },
              end: { line: lineOffset, character: columnOffset + expression.length }
            },
            message: issue.message,
            source: 'fhirpath-type-checker',
            code: issue.code
          });
        }

        // Add type information as hint
        if (inferredType.type && String(inferredType.type) !== 'unknown') {
          diagnostics.push({
            severity: DiagnosticSeverity.Hint,
            range: {
              start: { line: lineOffset, character: columnOffset },
              end: { line: lineOffset, character: columnOffset + expression.length }
            },
            message: `Expression type: ${inferredType.type}${inferredType.singleton ? '' : '[]'}`,
            source: 'fhirpath-type-info',
            code: 'type-inference'
          });
        }
      }

      // Check for cardinality issues
      const cardinalityIssues = this.validateCardinality(expression, analysis, resourceType);
      diagnostics.push(...cardinalityIssues.map(issue => ({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: { line: lineOffset, character: columnOffset },
          end: { line: lineOffset, character: columnOffset + expression.length }
        },
        message: issue,
        source: 'fhirpath-cardinality',
        code: 'cardinality-check'
      })));

    } catch (error) {
      console.warn('Type validation failed:', error);
    }

    return diagnostics;
  }

  /**
   * Validate type compatibility
   */
  private validateTypeCompatibility(
    expression: string,
    inferredType: TypeInfo,
    _resourceType?: string
  ): Array<{
    severity: DiagnosticSeverity;
    message: string;
    code: string;
  }> {
    const issues: Array<{
      severity: DiagnosticSeverity;
      message: string;
      code: string;
    }> = [];

    // Check for common type mismatches
    if (expression.includes('.count()') && !expression.includes('> 0') && !expression.includes('= 0')) {
      // count() returns integer, suggest comparison
      issues.push({
        severity: DiagnosticSeverity.Information,
        message: 'count() returns an integer. Consider comparing with a number (e.g., > 0)',
        code: 'count-usage-hint'
      });
    }

    // Check for boolean context issues
    if (inferredType.type && String(inferredType.type) === 'boolean' && expression.includes('= true')) {
      issues.push({
        severity: DiagnosticSeverity.Information,
        message: 'Redundant boolean comparison. Expression already returns boolean',
        code: 'redundant-boolean-comparison'
      });
    }

    // Check for collection vs single value issues
    if (!inferredType.singleton && expression.includes('.value')) {
      issues.push({
        severity: DiagnosticSeverity.Warning,
        message: 'Accessing .value on a collection may return multiple values. Consider using first() or single()',
        code: 'collection-value-access'
      });
    }

    return issues;
  }

  /**
   * Validate cardinality constraints
   */
  private validateCardinality(
    expression: string,
    _analysis: AnalysisResult,
    resourceType?: string
  ): string[] {
    const issues: string[] = [];

    // Check for .single() on potentially multi-cardinality fields
    if (expression.includes('.single()')) {
      const paths = this.extractFHIRPaths(expression);
      for (const path of paths) {
        if (this.isMultiCardinalityPath(path, resourceType)) {
          issues.push(`Using single() on multi-cardinality path '${path}' may cause runtime errors`);
        }
      }
    }
    
    // Check for missing cardinality handling
    if (expression.includes('.where(') && !expression.includes('.first()') && !expression.includes('.single()')) {
      issues.push('Consider adding .first() or .single() after .where() to handle cardinality');
    }

    return issues;
  }

  /**
   * Extract FHIR paths from expression
   */
  private extractFHIRPaths(expression: string): string[] {
    const pathPattern = /\b[A-Z][a-zA-Z]*(?:\.[a-zA-Z][a-zA-Z0-9]*)+/g;
    return expression.match(pathPattern) || [];
  }

  /**
   * Check if a FHIR path has multi-cardinality
   */
  private isMultiCardinalityPath(path: string, _resourceType?: string): boolean {
    // This would be enhanced with actual FHIR model data
    const multiCardinalityPaths = [
      'Patient.name',
      'Patient.telecom',
      'Patient.address',
      'Patient.identifier',
      'Observation.component',
      'Observation.category',
      'Condition.category'
    ];
    
    return multiCardinalityPaths.some(multiPath => path.includes(multiPath));
  }

  /**
   * Clear caches for memory management
   */
  clearCaches(): void {
    this.typeCache.clear();
    this.analysisCache.clear();
  }
}