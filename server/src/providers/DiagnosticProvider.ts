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

// Modular validators and converters
import { DirectiveValidator } from '../diagnostics/validators/DirectiveValidator';
import { FunctionValidator } from '../diagnostics/validators/FunctionValidator';
import { SemanticValidator } from '../diagnostics/validators/SemanticValidator';
import { ErrorConverter } from '../diagnostics/converters/ErrorConverter';
import { DiagnosticMapper } from '../diagnostics/converters/DiagnosticMapper';

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
import { getLogger, diagnosticContext } from '../logging';

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
  private logger = getLogger('diagnostic-provider');

  // Enhanced diagnostic analyzers
  private performanceAnalyzer: PerformanceAnalyzer;
  private codeQualityAnalyzer: CodeQualityAnalyzer;
  private fhirBestPracticesAnalyzer: FHIRBestPracticesAnalyzer;
  private enhancedDiagnosticConfig: EnhancedDiagnosticConfig;

  // Modular validators and converters
  private directiveValidator: DirectiveValidator;
  private functionValidator: FunctionValidator;
  private semanticValidator: SemanticValidator;
  private errorConverter: ErrorConverter;
  private diagnosticMapper: DiagnosticMapper;

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

    // Initialize modular validators and converters
    this.directiveValidator = new DirectiveValidator();
    this.functionValidator = new FunctionValidator(this.functionRegistry);
    this.semanticValidator = new SemanticValidator(this.fhirPathService, this.fhirPathContextService);
    this.diagnosticMapper = new DiagnosticMapper(this.functionRegistry);
    this.errorConverter = new ErrorConverter(this.diagnosticMapper);

    // Setup debounced validation
    this.debouncedValidate = this.validateDocumentInternal.bind(this);
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
    // Start a diagnostic session for this document
    const session = diagnosticContext.startDiagnosticSession(
      document.uri,
      document.getText().substring(0, 100), // First 100 chars for context
      this.extractResourceTypeFromExpression(document.getText())
    );

    const sessionLogger = this.logger.withContext(session.context);
    const timer = sessionLogger.startPerformanceTimer('provideDiagnostics');

    return this.profiler.profile('diagnostic', async () => {
      try {
        sessionLogger.debug('Starting diagnostic analysis', {
          contentLength: document.getText().length,
          version: document.version
        });

        // Check cache first
        const cacheKey = `diagnostic_${document.uri}_${document.version}`;
        const cached = cacheService.getValidation(cacheKey);
        if (cached) {
          sessionLogger.debug('Using cached diagnostics', {
            cached: true,
            resultCount: cached.length
          });
          timer.end('Diagnostics retrieved from cache');
          return cached;
        }

        session.startPhase('validation');
        const result = await this.debouncedValidate(document, sessionLogger);
        session.endPhase('validation');

        cacheService.setValidation(cacheKey, result);
        
        sessionLogger.info('Diagnostic analysis completed', {
          resultCount: result.length,
          errorCount: result.filter(d => d.severity === DiagnosticSeverity.Error).length,
          warningCount: result.filter(d => d.severity === DiagnosticSeverity.Warning).length
        });

        timer.end(`Diagnostics completed with ${result.length} items`);
        return result;
      } catch (error) {
        sessionLogger.error('Diagnostic analysis failed', error);
        timer.end('Diagnostics failed');
        throw error;
      } finally {
        const summary = session.end();
        diagnosticContext.endDiagnosticSession(session.context.requestId!);
        
        sessionLogger.debug('Diagnostic session completed', {
          totalDuration: summary.totalDuration,
          phases: summary.phases.length
        });
      }
    });
  }

  private async validateDocumentInternal(document: TextDocument, sessionLogger = this.logger): Promise<Diagnostic[]> {
    const text = document.getText().trim();

    // Skip empty documents
    if (!text) {
      return [];
    }

    try {
      const diagnostics: Diagnostic[] = [];

      // Validate directives first
      sessionLogger.debug('Starting directive validation', { 
        parsePhase: 'directive' 
      });
      const directiveDiagnostics = await this.directiveValidator.validate(document);
      diagnostics.push(...directiveDiagnostics);
      sessionLogger.debug('Directive validation completed', { 
        parsePhase: 'directive',
        diagnosticCount: directiveDiagnostics.length 
      });

      // Extract individual FHIRPath expressions from the document
      sessionLogger.debug('Extracting FHIRPath expressions', { 
        parsePhase: 'extraction' 
      });
      const expressions = this.fhirPathContextService.extractFHIRPathExpressions(document);
      sessionLogger.debug('Expression extraction completed', { 
        parsePhase: 'extraction',
        expressionCount: expressions.length 
      });

      // If no expressions found, try parsing the whole document as a single expression (fallback)
      if (expressions.length === 0) {
        sessionLogger.debug('Parsing document as single expression', { 
          parsePhase: 'parsing',
          fallbackMode: true 
        });
        const parseResult = this.fhirPathService.parse(text);

        if (parseResult.success) {
          sessionLogger.debug('Parse successful, running validations', { 
            parsePhase: 'parsing',
            success: true 
          });

          // For successful parses, run semantic validation
          sessionLogger.debug('Starting semantic validation', { 
            parsePhase: 'semantic' 
          });
          const semanticDiagnostics = await this.semanticValidator.validateSemantics(document, parseResult);
          diagnostics.push(...semanticDiagnostics);
          sessionLogger.debug('Semantic validation completed', { 
            parsePhase: 'semantic',
            diagnosticCount: semanticDiagnostics.length 
          });

          // Also run custom function validation
          sessionLogger.debug('Starting function validation', { 
            parsePhase: 'function' 
          });
          const functionDiagnostics = await this.functionValidator.validateExpression(document, text);
          diagnostics.push(...functionDiagnostics);
          sessionLogger.debug('Function validation completed', { 
            parsePhase: 'function',
            diagnosticCount: functionDiagnostics.length 
          });

          // Run enhanced diagnostics
          sessionLogger.debug('Starting enhanced diagnostics', { 
            parsePhase: 'enhanced' 
          });
          const resourceType = this.extractResourceTypeFromExpression(text);
          const enhancedDiagnostics = this.runEnhancedDiagnostics(text, 0, document, resourceType);
          diagnostics.push(...enhancedDiagnostics);
          sessionLogger.debug('Enhanced diagnostics completed', { 
            parsePhase: 'enhanced',
            diagnosticCount: enhancedDiagnostics.length,
            resourceType 
          });
        } else {
          sessionLogger.debug('Parse failed, converting syntax errors', { 
            parsePhase: 'parsing',
            success: false,
            errorCount: parseResult.errors.length 
          });
          // For failed parses, return syntax errors
          diagnostics.push(...this.errorConverter.convertParseErrorsToDiagnostics(parseResult.errors, document));
        }
      } else {
        // Parse each expression individually
        for (const expr of expressions) {
          try {
            const parseResult = this.fhirPathService.parse(expr.expression);

            if (parseResult.success) {
              // For successful parses, run semantic validation
              const semanticDiagnostics = await this.semanticValidator.validateExpression(document, expr.expression, expr.line, expr.column);
              diagnostics.push(...semanticDiagnostics);

              // Also run custom function validation for this expression
              const exprText = expr.expression;
              const functionDiagnostics = await this.functionValidator.validateExpression(document, exprText, expr.line, expr.column);
              diagnostics.push(...functionDiagnostics);

              // Run enhanced diagnostics for this expression
              const resourceType = this.extractResourceTypeFromExpression(exprText);
              const enhancedDiagnostics = this.runEnhancedDiagnostics(exprText, expr.line, document, resourceType);
              diagnostics.push(...enhancedDiagnostics);
            } else {
              // For failed parses, convert errors and adjust their positions
              const expressionErrors = this.errorConverter.convertExpressionParseErrorsToDiagnostics(parseResult.errors, document, expr);
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
