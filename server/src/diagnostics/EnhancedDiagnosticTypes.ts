import {
  Diagnostic,
  DiagnosticSeverity,
  Range,
} from 'vscode-languageserver';

/**
 * Categories for enhanced diagnostics
 */
export enum EnhancedDiagnosticCategory {
  Performance = 'performance',
  CodeQuality = 'code-quality',
  FHIRBestPractices = 'fhir-best-practices',
  Maintainability = 'maintainability',
  Security = 'security',
  Compatibility = 'compatibility',
  TypeSafety = 'type-safety',
  ChoiceTypes = 'choice-types',
  ConstraintViolation = 'constraint-violation'
}

/**
 * Impact levels for diagnostic issues
 */
export enum DiagnosticImpact {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
  Critical = 'critical'
}

/**
 * Enhanced diagnostic with additional metadata
 */
export interface EnhancedDiagnostic extends Diagnostic {
  category: EnhancedDiagnosticCategory;
  rule: string;
  suggestion?: string;
  fixable: boolean;
  impact: DiagnosticImpact;
  documentation?: string;
  quickFix?: {
    title: string;
    newText: string;
    range?: Range;
  };
  typeInfo?: TypeAwareDiagnosticInfo;
}

/**
 * Type-aware diagnostic information
 */
export interface TypeAwareDiagnosticInfo {
  expectedType?: string;
  actualType?: string;
  resourceType?: string;
  propertyPath?: string[];
  availableChoices?: string[];
  suggestedProperty?: string;
  constraints?: ConstraintViolation[];
}

/**
 * Choice type validation result
 */
export interface ChoiceTypeDiagnostic extends EnhancedDiagnostic {
  choiceInfo: {
    baseProperty: string;
    availableChoices: string[];
    suggestedChoice?: string;
    actualProperty: string;
  };
}

/**
 * Constraint violation information
 */
export interface ConstraintViolation {
  type: 'cardinality' | 'required' | 'datatype' | 'pattern' | 'fixed';
  description: string;
  expectedValue?: any;
  actualValue?: any;
}

/**
 * Configuration for diagnostic rules
 */
export interface DiagnosticRuleConfig {
  enabled: boolean;
  severity: DiagnosticSeverity;
  parameters?: Record<string, any>;
}

/**
 * Configuration for all enhanced diagnostics
 */
export interface EnhancedDiagnosticConfig {
  performance: {
    enabled: boolean;
    maxComplexity: number;
    maxNestingDepth: number;
    flagRedundantOperations: boolean;
    flagExpensiveOperations: boolean;
  };
  codeQuality: {
    enabled: boolean;
    maxLineLength: number;
    enforceNamingConventions: boolean;
    flagMagicValues: boolean;
    requireDocumentation: boolean;
  };
  fhirBestPractices: {
    enabled: boolean;
    enforceTypeSafety: boolean;
    flagDeprecatedElements: boolean;
    suggestOptimizations: boolean;
    checkCardinality: boolean;
  };
  maintainability: {
    enabled: boolean;
    maxFunctionComplexity: number;
    flagDuplication: boolean;
    enforceConsistency: boolean;
  };
  severity: {
    performance: DiagnosticSeverity;
    codeQuality: DiagnosticSeverity;
    fhirBestPractices: DiagnosticSeverity;
    maintainability: DiagnosticSeverity;
  };
}

/**
 * Default configuration values
 */
export const DEFAULT_ENHANCED_DIAGNOSTIC_CONFIG: EnhancedDiagnosticConfig = {
  performance: {
    enabled: true,
    maxComplexity: 10,
    maxNestingDepth: 5,
    flagRedundantOperations: true,
    flagExpensiveOperations: true
  },
  codeQuality: {
    enabled: true,
    maxLineLength: 100,
    enforceNamingConventions: false,
    flagMagicValues: true,
    requireDocumentation: false
  },
  fhirBestPractices: {
    enabled: true,
    enforceTypeSafety: true,
    flagDeprecatedElements: true,
    suggestOptimizations: true,
    checkCardinality: false
  },
  maintainability: {
    enabled: true,
    maxFunctionComplexity: 8,
    flagDuplication: true,
    enforceConsistency: true
  },
  severity: {
    performance: DiagnosticSeverity.Warning,
    codeQuality: DiagnosticSeverity.Information,
    fhirBestPractices: DiagnosticSeverity.Warning,
    maintainability: DiagnosticSeverity.Information
  }
};

/**
 * Diagnostic rule interface
 */
export interface DiagnosticRule {
  id: string;
  name: string;
  category: EnhancedDiagnosticCategory;
  description: string;
  documentation?: string;
  defaultSeverity: DiagnosticSeverity;
  impact: DiagnosticImpact;
  fixable: boolean;
  
  /**
   * Check if this rule applies to the given expression
   */
  check(expression: string, context: DiagnosticContext): EnhancedDiagnostic[];
}

/**
 * Context provided to diagnostic rules
 */
export interface DiagnosticContext {
  expression: string;
  ast?: any; // Parsed AST if available
  line: number;
  document: {
    uri: string;
    version: number;
    getText(): string;
  };
  fhirVersion?: string;
  resourceType?: string;
  config: EnhancedDiagnosticConfig;
}

/**
 * Result from diagnostic analysis
 */
export interface DiagnosticAnalysisResult {
  diagnostics: EnhancedDiagnostic[];
  performance: {
    analysisTime: number;
    rulesExecuted: number;
    issuesFound: number;
  };
  categories: {
    [key in EnhancedDiagnosticCategory]: number;
  };
}

/**
 * Interface for diagnostic analyzers
 */
export interface IDiagnosticAnalyzer {
  /**
   * Analyze an expression and return diagnostics
   */
  analyze(expression: string, context: DiagnosticContext): EnhancedDiagnostic[];
  
  /**
   * Get all rules managed by this analyzer
   */
  getRules(): DiagnosticRule[];
  
  /**
   * Enable or disable specific rules
   */
  configureRule(ruleId: string, config: DiagnosticRuleConfig): void;
}

/**
 * Performance metrics for expressions
 */
export interface ExpressionMetrics {
  complexity: number;
  nestingDepth: number;
  functionCalls: number;
  propertyAccesses: number;
  operations: {
    type: string;
    count: number;
    expensive: boolean;
  }[];
}

/**
 * Code quality metrics
 */
export interface CodeQualityMetrics {
  lineLength: number;
  readabilityScore: number;
  maintainabilityIndex: number;
  duplicationRisk: number;
  namingConsistency: number;
}

/**
 * FHIR compliance metrics
 */
export interface FHIRComplianceMetrics {
  pathEfficiency: number;
  typeCorrectness: number;
  versionCompatibility: number;
  bestPracticeScore: number;
  deprecationWarnings: number;
}

/**
 * Diagnostic builder utility
 */
export class EnhancedDiagnosticBuilder {
  private diagnostic: Partial<EnhancedDiagnostic>;

  constructor(rule: string, category: EnhancedDiagnosticCategory) {
    this.diagnostic = {
      rule,
      category,
      fixable: false,
      impact: DiagnosticImpact.Low,
      severity: DiagnosticSeverity.Information
    };
  }

  static create(rule: string, category: EnhancedDiagnosticCategory): EnhancedDiagnosticBuilder {
    return new EnhancedDiagnosticBuilder(rule, category);
  }

  withMessage(message: string): this {
    this.diagnostic.message = message;
    return this;
  }

  withRange(range: Range): this {
    this.diagnostic.range = range;
    return this;
  }

  withSeverity(severity: DiagnosticSeverity): this {
    this.diagnostic.severity = severity;
    return this;
  }

  withImpact(impact: DiagnosticImpact): this {
    this.diagnostic.impact = impact;
    return this;
  }

  withSuggestion(suggestion: string): this {
    this.diagnostic.suggestion = suggestion;
    return this;
  }

  withQuickFix(title: string, newText: string, range?: Range): this {
    this.diagnostic.fixable = true;
    this.diagnostic.quickFix = { title, newText, range };
    return this;
  }

  withDocumentation(documentation: string): this {
    this.diagnostic.documentation = documentation;
    return this;
  }

  withCode(code: string | number): this {
    this.diagnostic.code = code;
    return this;
  }

  build(): EnhancedDiagnostic {
    if (!this.diagnostic.message || !this.diagnostic.range) {
      throw new Error('Message and range are required for diagnostics');
    }

    return this.diagnostic as EnhancedDiagnostic;
  }
}

/**
 * Utility functions for diagnostic analysis
 */
export class DiagnosticUtils {
  /**
   * Calculate complexity score for an expression
   */
  static calculateComplexity(expression: string): number {
    // Simple complexity calculation based on operators and nesting
    const operators = (expression.match(/\band\b|\bor\b|\bwhere\b|\bselect\b/g) || []).length;
    const nesting = (expression.match(/\(/g) || []).length;
    const dots = (expression.match(/\./g) || []).length;
    
    return operators * 2 + nesting * 3 + dots;
  }

  /**
   * Calculate nesting depth
   */
  static calculateNestingDepth(expression: string): number {
    let maxDepth = 0;
    let currentDepth = 0;
    
    for (const char of expression) {
      if (char === '(') {
        currentDepth++;
        maxDepth = Math.max(maxDepth, currentDepth);
      } else if (char === ')') {
        currentDepth--;
      }
    }
    
    return maxDepth;
  }

  /**
   * Check if expression contains patterns indicating performance issues
   */
  static hasPerformanceIssues(expression: string): string[] {
    const issues: string[] = [];
    
    // Check for redundant where clauses
    if (/\.where\s*\(\s*true\s*\)/.test(expression)) {
      issues.push('redundant-where-true');
    }
    
    // Check for multiple consecutive where clauses
    if (/\.where\s*\([^)]+\)\s*\.where\s*\([^)]+\)/.test(expression)) {
      issues.push('multiple-where-clauses');
    }
    
    // Check for inefficient count usage
    if (/\.count\s*\(\s*\)\s*>\s*0/.test(expression)) {
      issues.push('inefficient-count-check');
    }
    
    return issues;
  }

  /**
   * Extract FHIR paths from expression
   */
  static extractFHIRPaths(expression: string): string[] {
    const pathPattern = /\b[A-Z][a-zA-Z]*(?:\.[a-zA-Z][a-zA-Z0-9]*)+/g;
    return expression.match(pathPattern) || [];
  }

  /**
   * Check if expression uses deprecated FHIR elements
   */
  static hasDeprecatedElements(expression: string, fhirVersion?: string): string[] {
    // This would be expanded with actual FHIR deprecation data
    const deprecated: string[] = [];
    
    // Example deprecations (would be loaded from FHIR spec)
    const deprecatedElements = ['Patient.animal', 'Practitioner.practitionerRole'];
    
    for (const element of deprecatedElements) {
      if (expression.includes(element)) {
        deprecated.push(element);
      }
    }
    
    return deprecated;
  }

  /**
   * Suggest optimizations for common patterns
   */
  static suggestOptimizations(expression: string): Array<{
    pattern: string;
    suggestion: string;
    improvement: string;
  }> {
    const suggestions: Array<{
      pattern: string;
      suggestion: string;
      improvement: string;
    }> = [];

    // Optimize count() > 0 to exists()
    if (expression.includes('.count() > 0')) {
      suggestions.push({
        pattern: '.count() > 0',
        suggestion: '.exists()',
        improvement: 'More efficient existence check'
      });
    }

    // Optimize count() = 0 to empty()
    if (expression.includes('.count() = 0')) {
      suggestions.push({
        pattern: '.count() = 0',
        suggestion: '.empty()',
        improvement: 'More efficient emptiness check'
      });
    }

    // Suggest ofType() instead of type checking
    const typeCheckPattern = /\.where\s*\(\s*\$this\s+is\s+(\w+)\s*\)/;
    const typeMatch = expression.match(typeCheckPattern);
    if (typeMatch) {
      suggestions.push({
        pattern: typeMatch[0],
        suggestion: `.ofType(${typeMatch[1]})`,
        improvement: 'More efficient type filtering'
      });
    }

    return suggestions;
  }
}