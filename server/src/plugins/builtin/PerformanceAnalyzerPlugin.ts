import {
  IPlugin,
  PluginMetadata,
  PluginCapability,
  PluginCapabilityType,
  PluginContext,
  PluginState
} from '../interfaces/IPlugin';
import {
  IAnalyzerPlugin,
  AnalyzerRegistration,
  IAnalyzer,
  AnalysisResult,
  AnalysisResultBuilder,
  AnalyzerCategory,
  AnalysisContext
} from '../interfaces/IAnalyzerPlugin';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ParseResult } from '../../parser/FHIRPathService';
import { DiagnosticSeverity } from 'vscode-languageserver';

/**
 * Performance analyzer that identifies potential performance issues in FHIRPath expressions
 */
class PerformanceAnalyzer implements IAnalyzer {
  async analyze(
    expression: string,
    parseResult: ParseResult,
    document: TextDocument,
    context?: AnalysisContext
  ): Promise<AnalysisResult> {
    const builder = AnalysisResultBuilder.create();

    // Check for expensive operations
    if (expression.includes('.descendants()')) {
      builder.addSuggestion({
        type: 'performance',
        severity: 'warning',
        message: 'descendants() can be expensive on large resources. Consider using a more specific path.',
        range: this.findRange(expression, '.descendants()', document)
      });
      builder.addMetric('descendants_usage', 1);
    }

    // Check for multiple where() calls
    const whereCount = (expression.match(/\.where\(/g) || []).length;
    if (whereCount > 2) {
      builder.addSuggestion({
        type: 'performance',
        severity: 'warning',
        message: `Multiple where() calls (${whereCount}) can impact performance. Consider combining conditions.`,
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: expression.length } }
      });
      builder.addMetric('where_count', whereCount);
    }

    // Check for nested exists()
    if (expression.match(/exists\(.*exists\(/)) {
      builder.addSuggestion({
        type: 'performance',
        severity: 'warning',
        message: 'Nested exists() calls can be inefficient. Consider restructuring the expression.'
      });
      builder.addMetric('nested_exists', 1);
    }

    // Calculate complexity score
    const complexityScore = this.calculateComplexity(expression);
    builder.addMetric('complexity_score', complexityScore);

    if (complexityScore > 10) {
      builder.addDiagnostic({
        severity: DiagnosticSeverity.Warning,
        message: `Expression complexity is high (score: ${complexityScore}). Consider breaking it down.`,
        code: 'performance-complexity',
        source: 'performance-analyzer',
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: expression.length } }
      });
    }

    return builder.build();
  }

  shouldAnalyze(expression: string, document: TextDocument, context?: AnalysisContext): boolean {
    // Skip very short expressions
    return expression.length > 10;
  }

  getConfigurationSchema() {
    return {
      type: 'object',
      properties: {
        complexityThreshold: {
          type: 'number',
          default: 10,
          description: 'Threshold for expression complexity warnings'
        },
        checkDescendants: {
          type: 'boolean',
          default: true,
          description: 'Check for descendants() usage'
        }
      }
    };
  }

  private findRange(
    expression: string, 
    substring: string, 
    document: TextDocument
  ): { start: { line: number; character: number }; end: { line: number; character: number } } {
    const index = expression.indexOf(substring);
    if (index === -1) {
      return { start: { line: 0, character: 0 }, end: { line: 0, character: expression.length } };
    }
    return {
      start: { line: 0, character: index },
      end: { line: 0, character: index + substring.length }
    };
  }

  private calculateComplexity(expression: string): number {
    let score = 0;
    
    // Count operations
    score += (expression.match(/\./g) || []).length; // Path navigation
    score += (expression.match(/where|select|exists|all|any/g) || []).length * 2; // Complex operations
    score += (expression.match(/\band\b|\bor\b/g) || []).length; // Boolean operations
    score += (expression.match(/\+|-|\*|\/|mod/g) || []).length; // Math operations
    
    // Penalize nesting
    const maxNesting = this.calculateMaxNesting(expression);
    score += maxNesting * 3;
    
    return score;
  }

  private calculateMaxNesting(expression: string): number {
    let maxDepth = 0;
    let currentDepth = 0;
    
    for (const char of expression) {
      if (char === '(' || char === '[') {
        currentDepth++;
        maxDepth = Math.max(maxDepth, currentDepth);
      } else if (char === ')' || char === ']') {
        currentDepth--;
      }
    }
    
    return maxDepth;
  }
}

/**
 * Performance analyzer plugin
 */
export class PerformanceAnalyzerPlugin implements IPlugin, IAnalyzerPlugin {
  readonly metadata: PluginMetadata = {
    id: 'fhirpath-lsp-performance-analyzer',
    name: 'FHIRPath Performance Analyzer',
    version: '1.0.0',
    description: 'Analyzes FHIRPath expressions for potential performance issues',
    author: 'FHIRPath LSP Team',
    license: 'MIT'
  };

  readonly capabilities: PluginCapability[] = [
    {
      type: PluginCapabilityType.Analyzer,
      version: '1.0.0',
      priority: 90
    }
  ];

  state: PluginState = PluginState.Loaded;

  private context!: PluginContext;
  private analyzers: AnalyzerRegistration[] = [];

  async initialize(context: PluginContext): Promise<void> {
    this.context = context;
    this.state = PluginState.Initialized;
    
    context.logger.info('Performance analyzer plugin initialized');
  }

  async activate(): Promise<void> {
    // Create analyzer registration
    this.analyzers = [
      {
        id: 'performance-analyzer',
        name: 'Performance Analyzer',
        description: 'Identifies potential performance issues in FHIRPath expressions',
        analyzer: new PerformanceAnalyzer(),
        priority: 90,
        enabledByDefault: true,
        categories: [AnalyzerCategory.Performance]
      }
    ];

    this.state = PluginState.Activated;
    this.context.logger.info('Performance analyzer activated');
  }

  async deactivate(): Promise<void> {
    this.analyzers = [];
    this.state = PluginState.Deactivated;
    this.context.logger.info('Performance analyzer deactivated');
  }

  dispose(): void {
    this.analyzers = [];
    this.state = PluginState.Disposed;
  }

  getAnalyzers(): AnalyzerRegistration[] {
    return this.analyzers;
  }

  getAPI() {
    return {
      version: this.metadata.version,
      analyzeExpression: (expression: string) => {
        if (this.analyzers.length > 0) {
          return this.analyzers[0].analyzer.analyze(
            expression,
            {} as ParseResult,
            { getText: () => expression } as any,
            undefined
          );
        }
        return null;
      }
    };
  }
}