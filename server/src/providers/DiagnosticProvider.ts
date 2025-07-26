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
import { FHIRPathFunctionRegistry } from '../services/FHIRPathFunctionRegistry';
import { CodeActionService } from '../services/CodeActionService';
import {
  DiagnosticBuilder,
  DiagnosticCode,
  DiagnosticUtils
} from '../diagnostics/DiagnosticBuilder';

// Enhanced diagnostics
import {
  EnhancedDiagnosticConfig,
  DEFAULT_ENHANCED_DIAGNOSTIC_CONFIG,
  DiagnosticContext,
  DiagnosticAnalysisResult,
  EnhancedDiagnosticCategory,
  EnhancedDiagnostic
} from '../diagnostics/EnhancedDiagnosticTypes';
import { PerformanceAnalyzer } from '../diagnostics/PerformanceAnalyzer';
import { CodeQualityAnalyzer } from '../diagnostics/CodeQualityAnalyzer';
import { FHIRBestPracticesAnalyzer } from '../diagnostics/FHIRBestPracticesAnalyzer';
import { createDebouncedMethod } from '../services/RequestThrottler';
import { getGlobalProfiler } from '../utils/PerformanceProfiler';
import { cacheService } from '../services/CacheService';

/**
 * Provides diagnostic information for FHIRPath expressions
 * Focuses on syntax errors and basic semantic validation
 */
export class DiagnosticProvider {
  private readonly maxDiagnostics = 100; // Prevent overwhelming the editor
  private readonly debounceTime = 300; // ms to debounce validation
  private validationTimeouts = new Map<string, NodeJS.Timeout>();
  private functionRegistry: FHIRPathFunctionRegistry;
  private profiler = getGlobalProfiler();
  private debouncedValidate: (document: TextDocument) => Promise<Diagnostic[]>;

  // Enhanced diagnostic analyzers
  private performanceAnalyzer: PerformanceAnalyzer;
  private codeQualityAnalyzer: CodeQualityAnalyzer;
  private fhirBestPracticesAnalyzer: FHIRBestPracticesAnalyzer;
  private enhancedDiagnosticConfig: EnhancedDiagnosticConfig;

  constructor(
    private fhirPathService: FHIRPathService,
    private fhirPathContextService: FHIRPathContextService,
    private fhirValidationProvider?: FHIRValidationProvider,
    enhancedConfig?: Partial<EnhancedDiagnosticConfig>
  ) {
    this.functionRegistry = new FHIRPathFunctionRegistry();

    // Initialize enhanced diagnostic configuration
    this.enhancedDiagnosticConfig = {
      ...DEFAULT_ENHANCED_DIAGNOSTIC_CONFIG,
      ...enhancedConfig
    };

    // Initialize enhanced diagnostic analyzers
    this.performanceAnalyzer = new PerformanceAnalyzer();
    this.codeQualityAnalyzer = new CodeQualityAnalyzer();
    this.fhirBestPracticesAnalyzer = new FHIRBestPracticesAnalyzer();

    // Setup debounced validation
    this.debouncedValidate = this.validateDocumentInternal.bind(this);
  }

  /**
   * Validate directive usage in the document
   */
  private validateDirectives(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();
    const lines = text.split('\n');

    const directiveOccurrences: {
      inputfile: Array<{ line: number; position: Position; value?: string; valuePosition?: Position }>;
      input: Array<{ line: number; position: Position; value?: string; valuePosition?: Position }>;
      resource: Array<{ line: number; position: Position; value?: string; valuePosition?: Position }>;
    } = {
      inputfile: [],
      input: [],
      resource: []
    };

    // Find all directive occurrences and validate their values
    for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
      const line = lines[lineNumber];
      const trimmed = line.trim();

      if (trimmed.startsWith('//')) {
        const directiveMatch = trimmed.match(/\/\/\s*@(inputfile|input|resource)(\s+(.+))?$/);
        if (directiveMatch) {
          const directiveType = directiveMatch[1] as 'inputfile' | 'input' | 'resource';
          const value = directiveMatch[3]?.trim();
          const atIndex = line.indexOf('@');
          const position: Position = {
            line: lineNumber,
            character: atIndex
          };

          let valuePosition: Position | undefined;
          if (value) {
            const valueStartIndex = line.indexOf(value, atIndex);
            valuePosition = {
              line: lineNumber,
              character: valueStartIndex
            };
          }

          directiveOccurrences[directiveType].push({
            line: lineNumber,
            position,
            value,
            valuePosition
          });

          // Validate directive values
          if (directiveType === 'resource' && value) {
            this.validateResourceDirectiveValue(value, valuePosition!, diagnostics);
          } else if (directiveType === 'inputfile' && value) {
            this.validateInputFileDirectiveValue(value, valuePosition!, diagnostics);
          } else if (directiveType === 'input' && value) {
            this.validateInputDirectiveValue(value, valuePosition!, diagnostics);
          } else if (!value) {
            // Missing value
            diagnostics.push({
              severity: DiagnosticSeverity.Error,
              range: {
                start: { line: lineNumber, character: line.length },
                end: { line: lineNumber, character: line.length }
              },
              message: `@${directiveType} directive requires a value`,
              source: 'fhirpath-directives',
              code: `missing-${directiveType}-value`
            });
          }
        }
      }
    }

    // Check for duplicate resource directives
    if (directiveOccurrences.resource.length > 1) {
      for (let i = 0; i < directiveOccurrences.resource.length - 1; i++) {
        const occurrence = directiveOccurrences.resource[i];
        const lastIndex = directiveOccurrences.resource.length - 1;
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: {
            start: occurrence.position,
            end: {
              line: occurrence.position.line,
              character: occurrence.position.character + '@resource'.length
            }
          },
          message: `Duplicate @resource directive. The last one (line ${directiveOccurrences.resource[lastIndex].line + 1}) will be used.`,
          source: 'fhirpath-directives',
          code: 'duplicate-resource-directive'
        });
      }
    }

    // Check for conflicting inputfile and input directives
    if (directiveOccurrences.inputfile.length > 0 && directiveOccurrences.input.length > 0) {
      // Find which type appears last
      const lastInputfile = directiveOccurrences.inputfile[directiveOccurrences.inputfile.length - 1];
      const lastInput = directiveOccurrences.input[directiveOccurrences.input.length - 1];

      if (lastInputfile.line > lastInput.line) {
        // inputfile appears last, mark input directives as warnings
        for (const occurrence of directiveOccurrences.input) {
          diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: {
              start: occurrence.position,
              end: {
                line: occurrence.position.line,
                character: occurrence.position.character + '@input'.length
              }
            },
            message: `@input and @inputfile are mutually exclusive. The last directive (@inputfile on line ${lastInputfile.line + 1}) will be used.`,
            source: 'fhirpath-directives',
            code: 'conflicting-input-directives'
          });
        }
      } else {
        // input appears last, mark inputfile directives as warnings
        for (const occurrence of directiveOccurrences.inputfile) {
          diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: {
              start: occurrence.position,
              end: {
                line: occurrence.position.line,
                character: occurrence.position.character + '@inputfile'.length
              }
            },
            message: `@input and @inputfile are mutually exclusive. The last directive (@input on line ${lastInput.line + 1}) will be used.`,
            source: 'fhirpath-directives',
            code: 'conflicting-input-directives'
          });
        }
      }
    }

    // Check for duplicate inputfile directives
    if (directiveOccurrences.inputfile.length > 1) {
      for (let i = 0; i < directiveOccurrences.inputfile.length - 1; i++) {
        const occurrence = directiveOccurrences.inputfile[i];
        const lastIndex = directiveOccurrences.inputfile.length - 1;
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: {
            start: occurrence.position,
            end: {
              line: occurrence.position.line,
              character: occurrence.position.character + '@inputfile'.length
            }
          },
          message: `Multiple @inputfile directives found. The last one (line ${directiveOccurrences.inputfile[lastIndex].line + 1}) will be used.`,
          source: 'fhirpath-directives',
          code: 'duplicate-inputfile-directive'
        });
      }
    }

    // Check for duplicate input directives
    if (directiveOccurrences.input.length > 1) {
      for (let i = 0; i < directiveOccurrences.input.length - 1; i++) {
        const occurrence = directiveOccurrences.input[i];
        const lastIndex = directiveOccurrences.input.length - 1;
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: {
            start: occurrence.position,
            end: {
              line: occurrence.position.line,
              character: occurrence.position.character + '@input'.length
            }
          },
          message: `Multiple @input directives found. The last one (line ${directiveOccurrences.input[lastIndex].line + 1}) will be used.`,
          source: 'fhirpath-directives',
          code: 'duplicate-input-directive'
        });
      }
    }

    return diagnostics;
  }

  private validateResourceDirectiveValue(value: string, valuePosition: Position, diagnostics: Diagnostic[]): void {
    // Known FHIR resource types
    const validResourceTypes = [
      'Patient', 'Observation', 'Condition', 'Procedure', 'MedicationRequest',
      'DiagnosticReport', 'Encounter', 'Organization', 'Practitioner', 'Location',
      'Device', 'Medication', 'Substance', 'AllergyIntolerance', 'Immunization',
      'Bundle', 'Composition', 'DocumentReference', 'Binary', 'HealthcareService',
      'Appointment', 'AppointmentResponse', 'Schedule', 'Slot', 'Coverage',
      'Claim', 'ClaimResponse', 'ExplanationOfBenefit', 'Goal', 'CarePlan',
      'CareTeam', 'ServiceRequest', 'ActivityDefinition', 'PlanDefinition',
      'Questionnaire', 'QuestionnaireResponse', 'ValueSet', 'CodeSystem',
      'ConceptMap', 'StructureDefinition', 'CapabilityStatement', 'OperationDefinition'
    ];

    if (!validResourceTypes.includes(value)) {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: valuePosition,
          end: {
            line: valuePosition.line,
            character: valuePosition.character + value.length
          }
        },
        message: `Unknown FHIR resource type: '${value}'. Expected one of: ${validResourceTypes.slice(0, 5).join(', ')}, ...`,
        source: 'fhirpath-directives',
        code: 'invalid-resource-type'
      });
    }
  }

  private validateInputFileDirectiveValue(value: string, valuePosition: Position, diagnostics: Diagnostic[]): void {
    // Basic file validation
    if (!value.match(/\.(json|xml)$/i)) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: valuePosition,
          end: {
            line: valuePosition.line,
            character: valuePosition.character + value.length
          }
        },
        message: `Input file should have .json or .xml extension: '${value}'`,
        source: 'fhirpath-directives',
        code: 'invalid-file-extension'
      });
    }

    // Check for potentially problematic characters
    if (value.includes(' ') && !value.startsWith('"') && !value.endsWith('"')) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: valuePosition,
          end: {
            line: valuePosition.line,
            character: valuePosition.character + value.length
          }
        },
        message: `File path contains spaces and should be quoted: '${value}'`,
        source: 'fhirpath-directives',
        code: 'unquoted-file-path'
      });
    }
  }

  private validateInputDirectiveValue(value: string, valuePosition: Position, diagnostics: Diagnostic[]): void {
    try {
      const parsedData = JSON.parse(value);

      // Check if it's a valid FHIR resource
      if (typeof parsedData === 'object' && parsedData !== null) {
        if (!parsedData.resourceType) {
          diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: {
              start: valuePosition,
              end: {
                line: valuePosition.line,
                character: valuePosition.character + value.length
              }
            },
            message: 'Input data should include a resourceType property for FHIR resources',
            source: 'fhirpath-directives',
            code: 'missing-resource-type'
          });
        } else {
          // Validate the resource type if present
          this.validateResourceDirectiveValue(parsedData.resourceType, {
            line: valuePosition.line,
            character: valuePosition.character + value.indexOf(`"${parsedData.resourceType}"`) + 1
          }, diagnostics);
        }
      }
    } catch (error) {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: valuePosition,
          end: {
            line: valuePosition.line,
            character: valuePosition.character + value.length
          }
        },
        message: `Invalid JSON syntax: ${(error as Error).message}`,
        source: 'fhirpath-directives',
        code: 'invalid-json'
      });
    }
  }

  /**
   * Run enhanced diagnostics on an expression
   */
  private runEnhancedDiagnostics(
    expression: string,
    line: number,
    document: TextDocument,
    resourceType?: string
  ): EnhancedDiagnostic[] {
    try {
      const context: DiagnosticContext = {
        expression,
        line,
        document: {
          uri: document.uri,
          version: document.version,
          getText: () => document.getText()
        },
        resourceType,
        config: this.enhancedDiagnosticConfig
      };

      const diagnostics: EnhancedDiagnostic[] = [];

      // Run all analyzers
      diagnostics.push(...this.performanceAnalyzer.analyze(expression, context));
      diagnostics.push(...this.codeQualityAnalyzer.analyze(expression, context));
      diagnostics.push(...this.fhirBestPracticesAnalyzer.analyze(expression, context));

      return diagnostics;
    } catch (error) {
      console.error('Enhanced diagnostics error:', error);
      return [];
    }
  }

  /**
   * Provide diagnostics for a text document
   */
  async provideDiagnostics(document: TextDocument): Promise<Diagnostic[]> {
    return this.profiler.profile('diagnostic', async () => {
      // Check cache first
      const cacheKey = `diagnostic_${document.uri}_${document.version}`;
      const cached = cacheService.getValidation(cacheKey);
      if (cached) {
        return cached;
      }

      const result = await this.debouncedValidate(document);
      cacheService.setValidation(cacheKey, result);
      return result;
    });
  }

  private async validateDocumentInternal(document: TextDocument): Promise<Diagnostic[]> {
    const text = document.getText().trim();

    // Skip empty documents
    if (!text) {
      return [];
    }

    try {
      const diagnostics: Diagnostic[] = [];

      // Validate directives first
      const directiveDiagnostics = this.validateDirectives(document);
      diagnostics.push(...directiveDiagnostics);

      // Extract individual FHIRPath expressions from the document
      const expressions = this.fhirPathContextService.extractFHIRPathExpressions(document);

      // If no expressions found, try parsing the whole document as a single expression (fallback)
      if (expressions.length === 0) {
        const parseResult = this.fhirPathService.parse(text);

        if (parseResult.success) {
          // For successful parses, run semantic validation
          const semanticDiagnostics = await this.validateSemantics(document, parseResult);
          diagnostics.push(...semanticDiagnostics);

          // Also run custom function validation
          const functionDiagnostics = this.validateFunctions(document, text);
          diagnostics.push(...functionDiagnostics);

          // Run additional syntax validations
          const syntaxDiagnostics = this.validateSyntax(document, text);
          diagnostics.push(...syntaxDiagnostics);

          // Run enhanced diagnostics
          const resourceType = this.extractResourceTypeFromExpression(text);
          const enhancedDiagnostics = this.runEnhancedDiagnostics(text, 0, document, resourceType);
          diagnostics.push(...enhancedDiagnostics);
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

              // Also run custom function validation for this expression
              const exprText = expr.expression;
              const functionDiagnostics = this.validateFunctions(document, exprText, expr.line, expr.column);
              diagnostics.push(...functionDiagnostics);

              // Run additional syntax validations for this expression
              const syntaxDiagnostics = this.validateSyntax(document, exprText, expr.line, expr.column);
              diagnostics.push(...syntaxDiagnostics);

              // Run enhanced diagnostics for this expression
              const resourceType = this.extractResourceTypeFromExpression(exprText);
              const enhancedDiagnostics = this.runEnhancedDiagnostics(exprText, expr.line, document, resourceType);
              diagnostics.push(...enhancedDiagnostics);
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
   * Convert parse errors for individual expressions to enhanced LSP diagnostics
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

      // Create enhanced diagnostic using DiagnosticBuilder
      const span = DiagnosticUtils.spanFromCoords(line, startColumn, line, endColumn);
      const diagnosticCode = this.mapErrorToDiagnosticCode(error);

      let builder = DiagnosticBuilder.error(diagnosticCode)
        .withMessage(this.formatErrorMessage(error.message))
        .withSpan(span)
        .withSourceText(expr.expression);

      // Add intelligent suggestions based on error type and content
      builder = this.addSuggestionsForError(builder, error, expr.expression, startColumn, endColumn);

      return builder.buildLSP();
    });
  }

  /**
   * Validate function calls in the expression
   */
  private validateFunctions(
    document: TextDocument,
    expression: string,
    lineOffset: number = 0,
    columnOffset: number = 0
  ): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    try {
      // Get all known functions from the registry
      const knownFunctions = this.functionRegistry.getFunctions();
      const knownFunctionNames = new Set(knownFunctions.map(f => f.name));

      // Get all operators and keywords from registry
      const knownOperators = new Set(this.functionRegistry.getOperators().map(op => op.name).filter(name => name));
      const knownKeywords = new Set(this.functionRegistry.getKeywords().map(kw => kw.keyword));

      // Combine all known function/operator/keyword names from registry
      const allKnownNames = new Set([...knownFunctionNames, ...knownOperators, ...knownKeywords]);

      // Pattern to match potential function calls: word followed by optional parentheses
      const functionPattern = /\b([a-zA-Z][a-zA-Z0-9_]*)\s*(?=\()/g;
      let match;

      while ((match = functionPattern.exec(expression)) !== null) {
        const functionName = match[1];
        const startPos = match.index;
        const endPos = match.index + functionName.length;

        // Check if this is an unknown function
        if (!allKnownNames.has(functionName)) {
          // Calculate the exact position within the expression
          // Need to account for newlines in multi-line expressions
          const beforeMatch = expression.substring(0, startPos);
          const newlineCount = (beforeMatch.match(/\n/g) || []).length;
          const lastNewlineIndex = beforeMatch.lastIndexOf('\n');

          // Calculate line and column positions
          const diagnosticLine = lineOffset + newlineCount;
          const columnInExpression = lastNewlineIndex === -1 ? startPos : startPos - lastNewlineIndex - 1;
          const startColumn = (newlineCount === 0 ? columnOffset : 0) + columnInExpression;
          const endColumn = startColumn + functionName.length;

          const range = Range.create(
            Position.create(diagnosticLine, startColumn),
            Position.create(diagnosticLine, endColumn)
          );

          // Get suggestions for this unknown function
          const suggestions = this.getFunctionSuggestions(functionName);

          // Create diagnostic with enhanced builder
          const diagnostic = DiagnosticBuilder.error(DiagnosticCode.UnknownFunction)
            .withMessage(`Unknown function '${functionName}'`)
            .withRange(range)
            .withSourceText(expression);

          // Add suggestions if we found any
          if (suggestions.length > 0) {
            const topSuggestion = suggestions[0];
            diagnostic.withMessage(`Unknown function '${functionName}'. Did you mean '${topSuggestion}'?`);

            // Add all suggestions as quick fix options
            suggestions.forEach((suggestion, index) => {
              if (index === 0) {
                diagnostic.suggest(`Change to '${suggestion}'`, suggestion);
              } else {
                diagnostic.suggest(`Or change to '${suggestion}'`, suggestion);
              }
            });
          } else {
            diagnostic.withMessage(`Unknown function '${functionName}'. Check FHIRPath documentation for available functions.`);
          }

          diagnostics.push(diagnostic.buildLSP());
        }
      }

      // Also check for potential typos in property access (simpler pattern)
      const propertyPattern = /\.([a-zA-Z][a-zA-Z0-9_]*)/g;
      match = null;

      while ((match = propertyPattern.exec(expression)) !== null) {
        const propertyName = match[1];

        // Skip if this is a known function name (already checked above)
        if (allKnownNames.has(propertyName)) {
          continue;
        }

        // Check for common FHIR property typos
        const commonProperties = ['name', 'given', 'family', 'use', 'value', 'code', 'system', 'display',
                                 'active', 'gender', 'birthDate', 'address', 'telecom', 'identifier'];

        const propertySuggestions = this.getPropertySuggestions(propertyName);

        // Only create diagnostics for likely typos (edit distance <= 2)
        if (propertySuggestions.length > 0) {
          const startPos = match.index + 1; // +1 to skip the dot
          const endPos = startPos + propertyName.length;

          const lineNumber = lineOffset;
          const startColumn = columnOffset + startPos;
          const endColumn = columnOffset + endPos;

          const range = Range.create(
            Position.create(lineNumber, startColumn),
            Position.create(lineNumber, endColumn)
          );

          const diagnostic = DiagnosticBuilder.warning(DiagnosticCode.UnknownProperty)
            .withMessage(`Unknown property '${propertyName}'`)
            .withRange(range)
            .withSourceText(expression)
            .suggest(`Did you mean '${propertySuggestions[0]}'?`, propertySuggestions[0])
            .buildLSP();

          diagnostics.push(diagnostic);
        }
      }

    } catch (error) {
      console.error('Error in function validation:', error);
    }

    return diagnostics;
  }

  /**
   * Validate syntax patterns that might not be caught by the parser
   */
  private validateSyntax(
    document: TextDocument,
    expression: string,
    lineOffset: number = 0,
    columnOffset: number = 0
  ): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    try {
      // Check for unterminated strings
      const stringIssues = this.findStringIssues(expression);
      for (const issue of stringIssues) {
        const range = Range.create(
          Position.create(lineOffset, columnOffset + issue.start),
          Position.create(lineOffset, columnOffset + issue.end)
        );

        const diagnostic = DiagnosticBuilder.error(DiagnosticCode.UnterminatedString)
          .withMessage(issue.message)
          .withRange(range)
          .withSourceText(expression)
          .buildLSP();

        diagnostics.push(diagnostic);
      }

      // Check for bracket mismatches
      const bracketIssues = this.findBracketIssues(expression);
      for (const issue of bracketIssues) {
        const range = Range.create(
          Position.create(lineOffset, columnOffset + issue.start),
          Position.create(lineOffset, columnOffset + issue.end)
        );

        const diagnostic = DiagnosticBuilder.error(DiagnosticCode.SyntaxError)
          .withMessage(issue.message)
          .withRange(range)
          .withSourceText(expression)
          .buildLSP();

        diagnostics.push(diagnostic);
      }

      // Check for missing operators (simple patterns)
      const operatorIssues = this.findOperatorIssues(expression);
      for (const issue of operatorIssues) {
        const range = Range.create(
          Position.create(lineOffset, columnOffset + issue.start),
          Position.create(lineOffset, columnOffset + issue.end)
        );

        const diagnostic = DiagnosticBuilder.warning(DiagnosticCode.InvalidOperator)
          .withMessage(issue.message)
          .withRange(range)
          .withSourceText(expression)
          .buildLSP();

        diagnostics.push(diagnostic);
      }

    } catch (error) {
      console.error('Error in syntax validation:', error);
    }

    return diagnostics;
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

  /**
   * Map parse error to appropriate diagnostic code
   */
  private mapErrorToDiagnosticCode(error: ParseError): DiagnosticCode {
    const message = error.message.toLowerCase();

    if (message.includes('unknown function') || message.includes('undefined function')) {
      return DiagnosticCode.UnknownFunction;
    } else if (message.includes('unterminated string') || message.includes('string')) {
      return DiagnosticCode.UnterminatedString;
    } else if (message.includes('unexpected token') || message.includes('syntax')) {
      return DiagnosticCode.SyntaxError;
    } else if (message.includes('type') || message.includes('cannot convert')) {
      return DiagnosticCode.TypeError;
    } else if (message.includes('property') || message.includes('field')) {
      return DiagnosticCode.UnknownProperty;
    } else if (message.includes('operator')) {
      return DiagnosticCode.InvalidOperator;
    } else if (message.includes('literal') || message.includes('number') || message.includes('boolean')) {
      return DiagnosticCode.InvalidLiteral;
    } else if (message.includes('argument')) {
      return DiagnosticCode.MissingArgument;
    }

    return DiagnosticCode.SyntaxError; // Default fallback
  }

  /**
   * Add intelligent suggestions based on error type and context
   */
  private addSuggestionsForError(
    builder: DiagnosticBuilder,
    error: ParseError,
    expression: string,
    startColumn: number,
    endColumn: number
  ): DiagnosticBuilder {
    const message = error.message.toLowerCase();
    const errorText = expression.substring(startColumn, endColumn);

    // Suggest corrections for common typos in function names
    if (message.includes('unknown function')) {
      const suggestions = this.getFunctionSuggestions(errorText);
      for (const suggestion of suggestions) {
        builder = builder.suggest(`Did you mean '${suggestion}'?`, suggestion);
      }
    }

    // Suggest fixes for unterminated strings
    else if (message.includes('unterminated string')) {
      builder = builder.suggest("Add closing quote", errorText + "'");
    }

    // Suggest fixes for common syntax errors
    else if (message.includes('unexpected token')) {
      if (errorText === '(') {
        builder = builder.suggest("Missing closing parenthesis", undefined);
      } else if (errorText === '[') {
        builder = builder.suggest("Missing closing bracket", undefined);
      } else if (errorText === '{') {
        builder = builder.suggest("Missing closing brace", undefined);
      }
    }

    // Suggest property name corrections
    else if (message.includes('unknown property')) {
      const suggestions = this.getPropertySuggestions(errorText);
      for (const suggestion of suggestions) {
        builder = builder.suggest(`Did you mean '${suggestion}'?`, suggestion);
      }
    }

    return builder;
  }

  /**
   * Get function name suggestions for typos
   */
  private getFunctionSuggestions(errorText: string): string[] {
    // Get all available functions, operators, and keywords from the registry
    const allFunctions = this.functionRegistry.getFunctions();
    const allOperators = this.functionRegistry.getOperators();
    const allKeywords = this.functionRegistry.getKeywords();

    // Create a comprehensive list of all available names
    const functionNames = allFunctions.map(f => f.name);
    const operatorNames = allOperators.map(op => op.name).filter(name => name); // Some operators might not have names
    const keywordNames = allKeywords.map(kw => kw.keyword);

    // Combine all available names from the registry
    const allAvailableNames = [...functionNames, ...operatorNames, ...keywordNames];

    // Use CodeActionService to find similar strings with edit distance
    return CodeActionService.findSimilarStrings(
      errorText,
      allAvailableNames,
      2,  // Max edit distance
      3   // Max suggestions
    );
  }

  /**
   * Get property name suggestions for typos
   */
  private getPropertySuggestions(errorText: string): string[] {
    // Get all available functions, operators, and keywords from the registry for property suggestions
    // This includes functions that can be used in property access context
    const allFunctions = this.functionRegistry.getFunctions();
    const allKeywords = this.functionRegistry.getKeywords();

    // Create a comprehensive list of common FHIR properties and registry items
    const commonProperties = [
      'name', 'given', 'family', 'use', 'value', 'code', 'system', 'display',
      'active', 'gender', 'birthDate', 'address', 'telecom', 'identifier',
      'status', 'category', 'subject', 'effective', 'issued', 'performer'
    ];

    const functionNames = allFunctions.map(f => f.name);
    const keywordNames = allKeywords.map(kw => kw.keyword);

    // Combine properties with registry items for comprehensive suggestions
    const allPropertyCandidates = [...commonProperties, ...functionNames, ...keywordNames];

    // Use CodeActionService to find similar strings
    return CodeActionService.findSimilarStrings(
      errorText,
      allPropertyCandidates,
      2,  // Max edit distance
      3   // Max suggestions
    );
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

  /**
   * Extract resource type from FHIRPath expression
   */
  private extractResourceTypeFromExpression(expression: string): string | undefined {
    // Match patterns like "Patient.name" or "Bundle.entry.resource.ofType(Patient)"
    const resourceTypePattern = /^([A-Z][a-zA-Z0-9]*)\./;
    const match = expression.match(resourceTypePattern);

    if (match) {
      return match[1];
    }

    // Check for ofType() patterns
    const ofTypePattern = /\.ofType\s*\(\s*([A-Z][a-zA-Z0-9]*)\s*\)/;
    const ofTypeMatch = expression.match(ofTypePattern);

    if (ofTypeMatch) {
      return ofTypeMatch[1];
    }

    return undefined;
  }

  /**
   * Update enhanced diagnostic configuration
   */
  updateEnhancedDiagnosticConfig(config: Partial<EnhancedDiagnosticConfig>): void {
    this.enhancedDiagnosticConfig = {
      ...this.enhancedDiagnosticConfig,
      ...config
    };
  }

  /**
   * Get current enhanced diagnostic configuration
   */
  getEnhancedDiagnosticConfig(): EnhancedDiagnosticConfig {
    return { ...this.enhancedDiagnosticConfig };
  }

  /**
   * Configure a specific analyzer rule
   */
  configureAnalyzerRule(analyzer: 'performance' | 'codeQuality' | 'fhirBestPractices', ruleId: string, config: any): void {
    switch (analyzer) {
      case 'performance':
        this.performanceAnalyzer.configureRule(ruleId, config);
        break;
      case 'codeQuality':
        this.codeQualityAnalyzer.configureRule(ruleId, config);
        break;
      case 'fhirBestPractices':
        this.fhirBestPracticesAnalyzer.configureRule(ruleId, config);
        break;
    }
  }

  /**
   * Get metrics for an expression
   */
  getExpressionMetrics(expression: string): {
    performance: any;
    codeQuality: any;
    fhirCompliance: any;
  } {
    return {
      performance: this.performanceAnalyzer.calculateMetrics(expression),
      codeQuality: this.codeQualityAnalyzer.calculateMetrics(expression),
      fhirCompliance: this.fhirBestPracticesAnalyzer.calculateMetrics(expression)
    };
  }
}
