import { IPlugin } from './IPlugin';
import { Diagnostic } from 'vscode-languageserver';
import { ParseResult } from '../../parser/FHIRPathService';
import { TextDocument } from 'vscode-languageserver-textdocument'

/**
 * Analysis result from an analyzer
 */
export interface AnalysisResult {
  /**
   * Diagnostics found during analysis
   */
  diagnostics?: Diagnostic[];

  /**
   * Metrics collected during analysis
   */
  metrics?: Record<string, number>;

  /**
   * Suggestions for improvement
   */
  suggestions?: AnalysisSuggestion[];

  /**
   * Additional metadata
   */
  metadata?: Record<string, any>;
}

/**
 * Analysis suggestion
 */
export interface AnalysisSuggestion {
  type: 'performance' | 'security' | 'style' | 'complexity' | 'other';
  severity: 'error' | 'warning' | 'info' | 'hint';
  message: string;
  range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  fix?: {
    description: string;
    replacement: string;
  };
}

/**
 * Analyzer registration
 */
export interface AnalyzerRegistration {
  /**
   * Unique analyzer ID
   */
  id: string;

  /**
   * Analyzer name
   */
  name: string;

  /**
   * Analyzer description
   */
  description?: string;

  /**
   * Analyzer instance
   */
  analyzer: IAnalyzer;

  /**
   * Priority for ordering (higher = runs first)
   */
  priority?: number;

  /**
   * Whether analyzer is enabled by default
   */
  enabledByDefault?: boolean;

  /**
   * Analyzer categories
   */
  categories?: AnalyzerCategory[];
}

/**
 * Analyzer categories
 */
export enum AnalyzerCategory {
  Performance = 'performance',
  Security = 'security',
  Style = 'style',
  Complexity = 'complexity',
  Correctness = 'correctness',
  Compatibility = 'compatibility',
  BestPractices = 'bestPractices'
}

/**
 * Analyzer interface
 */
export interface IAnalyzer {
  /**
   * Analyze a FHIRPath expression
   */
  analyze(
    expression: string,
    parseResult: ParseResult,
    document: TextDocument,
    context?: AnalysisContext
  ): Promise<AnalysisResult>;

  /**
   * Check if analyzer should run for given context
   */
  shouldAnalyze?(
    expression: string,
    document: TextDocument,
    context?: AnalysisContext
  ): boolean;

  /**
   * Get analyzer configuration schema
   */
  getConfigurationSchema?(): any;
}

/**
 * Analysis context
 */
export interface AnalysisContext {
  /**
   * FHIR resource type context
   */
  resourceType?: string;

  /**
   * FHIR version
   */
  fhirVersion?: string;

  /**
   * Custom context data
   */
  customData?: Record<string, any>;

  /**
   * Analysis options
   */
  options?: {
    /**
     * Maximum analysis time in milliseconds
     */
    timeout?: number;

    /**
     * Severity threshold
     */
    severityThreshold?: 'error' | 'warning' | 'info' | 'hint';

    /**
     * Enabled categories
     */
    enabledCategories?: AnalyzerCategory[];
  };
}

/**
 * Plugin that provides analyzers
 */
export interface IAnalyzerPlugin extends IPlugin {
  /**
   * Get analyzers provided by this plugin
   */
  getAnalyzers(): AnalyzerRegistration[];
}

/**
 * Type guard for analyzer plugins
 */
export function isAnalyzerPlugin(plugin: IPlugin): plugin is IAnalyzerPlugin {
  return 'getAnalyzers' in plugin;
}

/**
 * Built-in analyzer types
 */
export enum BuiltinAnalyzerType {
  PerformanceAnalyzer = 'performance',
  SecurityAnalyzer = 'security',
  ComplexityAnalyzer = 'complexity',
  CompatibilityAnalyzer = 'compatibility',
  StyleAnalyzer = 'style'
}

/**
 * Analyzer result builder
 */
export class AnalysisResultBuilder {
  private result: AnalysisResult = {};

  static create(): AnalysisResultBuilder {
    return new AnalysisResultBuilder();
  }

  addDiagnostic(diagnostic: Diagnostic): AnalysisResultBuilder {
    if (!this.result.diagnostics) {
      this.result.diagnostics = [];
    }
    this.result.diagnostics.push(diagnostic);
    return this;
  }

  addMetric(name: string, value: number): AnalysisResultBuilder {
    if (!this.result.metrics) {
      this.result.metrics = {};
    }
    this.result.metrics[name] = value;
    return this;
  }

  addSuggestion(suggestion: AnalysisSuggestion): AnalysisResultBuilder {
    if (!this.result.suggestions) {
      this.result.suggestions = [];
    }
    this.result.suggestions.push(suggestion);
    return this;
  }

  addMetadata(key: string, value: any): AnalysisResultBuilder {
    if (!this.result.metadata) {
      this.result.metadata = {};
    }
    this.result.metadata[key] = value;
    return this;
  }

  build(): AnalysisResult {
    return { ...this.result };
  }
}