import { DiagnosticSeverity, Range, Position } from 'vscode-languageserver';

import {
  IDiagnosticAnalyzer,
  DiagnosticRule,
  EnhancedDiagnostic,
  DiagnosticContext,
  EnhancedDiagnosticCategory,
  DiagnosticImpact,
  EnhancedDiagnosticBuilder,
  DiagnosticUtils,
  ExpressionMetrics,
  DiagnosticRuleConfig
} from './EnhancedDiagnosticTypes';

/**
 * Analyzer for performance-related diagnostics
 */
export class PerformanceAnalyzer implements IDiagnosticAnalyzer {
  private rules: Map<string, DiagnosticRule> = new Map();
  private ruleConfigs: Map<string, DiagnosticRuleConfig> = new Map();

  constructor() {
    this.initializeRules();
  }

  /**
   * Analyze expression for performance issues
   */
  analyze(expression: string, context: DiagnosticContext): EnhancedDiagnostic[] {
    if (!context.config.performance.enabled) {
      return [];
    }

    const diagnostics: EnhancedDiagnostic[] = [];

    // Calculate expression metrics
    const metrics = this.calculateMetrics(expression);

    // Apply each rule
    for (const rule of this.rules.values()) {
      const ruleConfig = this.ruleConfigs.get(rule.id);
      if (ruleConfig && !ruleConfig.enabled) {
        continue;
      }

      try {
        const ruleDiagnostics = rule.check(expression, context);
        diagnostics.push(...ruleDiagnostics);
      } catch (error) {
        console.error(`Error in performance rule ${rule.id}:`, error);
      }
    }

    return diagnostics;
  }

  /**
   * Get all performance rules
   */
  getRules(): DiagnosticRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Configure a specific rule
   */
  configureRule(ruleId: string, config: DiagnosticRuleConfig): void {
    this.ruleConfigs.set(ruleId, config);
  }

  /**
   * Calculate performance metrics for an expression
   */
  calculateMetrics(expression: string): ExpressionMetrics {
    return {
      complexity: DiagnosticUtils.calculateComplexity(expression),
      nestingDepth: DiagnosticUtils.calculateNestingDepth(expression),
      functionCalls: this.countFunctionCalls(expression),
      propertyAccesses: this.countPropertyAccesses(expression),
      operations: this.analyzeOperations(expression)
    };
  }

  /**
   * Initialize all performance rules
   */
  private initializeRules(): void {
    // Rule: Redundant where(true) clauses
    this.rules.set('performance-redundant-where-true', {
      id: 'performance-redundant-where-true',
      name: 'Redundant where(true)',
      category: EnhancedDiagnosticCategory.Performance,
      description: 'where(true) clauses are redundant and should be removed',
      defaultSeverity: DiagnosticSeverity.Warning,
      impact: DiagnosticImpact.Low,
      fixable: true,
      check: (expression: string, context: DiagnosticContext): EnhancedDiagnostic[] => {
        return this.checkRedundantWhereTrue(expression, context);
      }
    });

    // Rule: Multiple consecutive where clauses
    this.rules.set('performance-multiple-where', {
      id: 'performance-multiple-where',
      name: 'Multiple where clauses',
      category: EnhancedDiagnosticCategory.Performance,
      description: 'Multiple consecutive where() clauses can be combined',
      defaultSeverity: DiagnosticSeverity.Information,
      impact: DiagnosticImpact.Medium,
      fixable: true,
      check: (expression: string, context: DiagnosticContext): EnhancedDiagnostic[] => {
        return this.checkMultipleWhereClauses(expression, context);
      }
    });

    // Rule: Inefficient count usage
    this.rules.set('performance-inefficient-count', {
      id: 'performance-inefficient-count',
      name: 'Inefficient count usage',
      category: EnhancedDiagnosticCategory.Performance,
      description: 'Use exists() instead of count() > 0 for better performance',
      defaultSeverity: DiagnosticSeverity.Warning,
      impact: DiagnosticImpact.Medium,
      fixable: true,
      check: (expression: string, context: DiagnosticContext): EnhancedDiagnostic[] => {
        return this.checkInefficientCountUsage(expression, context);
      }
    });

    // Rule: High complexity warning
    this.rules.set('performance-high-complexity', {
      id: 'performance-high-complexity',
      name: 'High expression complexity',
      category: EnhancedDiagnosticCategory.Performance,
      description: 'Expression complexity is too high and may impact performance',
      defaultSeverity: DiagnosticSeverity.Warning,
      impact: DiagnosticImpact.High,
      fixable: false,
      check: (expression: string, context: DiagnosticContext): EnhancedDiagnostic[] => {
        return this.checkHighComplexity(expression, context);
      }
    });

    // Rule: Deep nesting warning
    this.rules.set('performance-deep-nesting', {
      id: 'performance-deep-nesting',
      name: 'Deep expression nesting',
      category: EnhancedDiagnosticCategory.Performance,
      description: 'Deeply nested expressions can be hard to understand and optimize',
      defaultSeverity: DiagnosticSeverity.Information,
      impact: DiagnosticImpact.Medium,
      fixable: false,
      check: (expression: string, context: DiagnosticContext): EnhancedDiagnostic[] => {
        return this.checkDeepNesting(expression, context);
      }
    });

    // Rule: Expensive string operations
    this.rules.set('performance-expensive-string-ops', {
      id: 'performance-expensive-string-ops',
      name: 'Expensive string operations',
      category: EnhancedDiagnosticCategory.Performance,
      description: 'Some string operations can be expensive in large datasets',
      defaultSeverity: DiagnosticSeverity.Information,
      impact: DiagnosticImpact.Medium,
      fixable: false,
      check: (expression: string, context: DiagnosticContext): EnhancedDiagnostic[] => {
        return this.checkExpensiveStringOperations(expression, context);
      }
    });

    // Enable all rules by default
    for (const rule of this.rules.values()) {
      this.ruleConfigs.set(rule.id, {
        enabled: true,
        severity: rule.defaultSeverity
      });
    }
  }

  /**
   * Check for redundant where(true) clauses
   */
  private checkRedundantWhereTrue(expression: string, context: DiagnosticContext): EnhancedDiagnostic[] {
    const diagnostics: EnhancedDiagnostic[] = [];
    const pattern = /\.where\s*\(\s*true\s*\)/g;
    let match;

    while ((match = pattern.exec(expression)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      
      const range = Range.create(
        Position.create(context.line, start),
        Position.create(context.line, end)
      );

      const diagnostic = EnhancedDiagnosticBuilder
        .create('performance-redundant-where-true', EnhancedDiagnosticCategory.Performance)
        .withMessage('Redundant where(true) clause')
        .withRange(range)
        .withSeverity(DiagnosticSeverity.Warning)
        .withImpact(DiagnosticImpact.Low)
        .withSuggestion('Remove the where(true) clause as it has no effect')
        .withQuickFix('Remove where(true)', '', range)
        .withDocumentation('where(true) clauses are always true and can be safely removed')
        .build();

      diagnostics.push(diagnostic);
    }

    return diagnostics;
  }

  /**
   * Check for multiple consecutive where clauses
   */
  private checkMultipleWhereClauses(expression: string, context: DiagnosticContext): EnhancedDiagnostic[] {
    const diagnostics: EnhancedDiagnostic[] = [];
    const pattern = /\.where\s*\([^)]+\)\s*\.where\s*\([^)]+\)/g;
    let match;

    while ((match = pattern.exec(expression)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      
      const range = Range.create(
        Position.create(context.line, start),
        Position.create(context.line, end)
      );

      const diagnostic = EnhancedDiagnosticBuilder
        .create('performance-multiple-where', EnhancedDiagnosticCategory.Performance)
        .withMessage('Multiple consecutive where() clauses can be combined')
        .withRange(range)
        .withSeverity(DiagnosticSeverity.Information)
        .withImpact(DiagnosticImpact.Medium)
        .withSuggestion('Combine multiple where() clauses using "and" operator')
        .withDocumentation('Multiple where() clauses create unnecessary intermediate collections')
        .build();

      diagnostics.push(diagnostic);
    }

    return diagnostics;
  }

  /**
   * Check for inefficient count usage
   */
  private checkInefficientCountUsage(expression: string, context: DiagnosticContext): EnhancedDiagnostic[] {
    const diagnostics: EnhancedDiagnostic[] = [];
    
    // Check for count() > 0
    const countGreaterPattern = /\.count\s*\(\s*\)\s*>\s*0/g;
    let match;

    while ((match = countGreaterPattern.exec(expression)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      
      const range = Range.create(
        Position.create(context.line, start),
        Position.create(context.line, end)
      );

      const diagnostic = EnhancedDiagnosticBuilder
        .create('performance-inefficient-count', EnhancedDiagnosticCategory.Performance)
        .withMessage('Use exists() instead of count() > 0')
        .withRange(range)
        .withSeverity(DiagnosticSeverity.Warning)
        .withImpact(DiagnosticImpact.Medium)
        .withSuggestion('Replace with .exists() for better performance')
        .withQuickFix('Replace with exists()', '.exists()', range)
        .withDocumentation('exists() is more efficient than count() > 0 as it stops at the first match')
        .build();

      diagnostics.push(diagnostic);
    }

    // Check for count() = 0
    const countZeroPattern = /\.count\s*\(\s*\)\s*=\s*0/g;

    while ((match = countZeroPattern.exec(expression)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      
      const range = Range.create(
        Position.create(context.line, start),
        Position.create(context.line, end)
      );

      const diagnostic = EnhancedDiagnosticBuilder
        .create('performance-inefficient-count', EnhancedDiagnosticCategory.Performance)
        .withMessage('Use empty() instead of count() = 0')
        .withRange(range)
        .withSeverity(DiagnosticSeverity.Warning)
        .withImpact(DiagnosticImpact.Medium)
        .withSuggestion('Replace with .empty() for better performance')
        .withQuickFix('Replace with empty()', '.empty()', range)
        .withDocumentation('empty() is more efficient than count() = 0')
        .build();

      diagnostics.push(diagnostic);
    }

    return diagnostics;
  }

  /**
   * Check for high complexity expressions
   */
  private checkHighComplexity(expression: string, context: DiagnosticContext): EnhancedDiagnostic[] {
    const complexity = DiagnosticUtils.calculateComplexity(expression);
    const maxComplexity = context.config.performance.maxComplexity;

    if (complexity <= maxComplexity) {
      return [];
    }

    const range = Range.create(
      Position.create(context.line, 0),
      Position.create(context.line, expression.length)
    );

    const diagnostic = EnhancedDiagnosticBuilder
      .create('performance-high-complexity', EnhancedDiagnosticCategory.Performance)
      .withMessage(`Expression complexity (${complexity}) exceeds recommended limit (${maxComplexity})`)
      .withRange(range)
      .withSeverity(DiagnosticSeverity.Warning)
      .withImpact(DiagnosticImpact.High)
      .withSuggestion('Consider breaking the expression into smaller parts or using variables')
      .withDocumentation('High complexity expressions can be hard to understand and may have performance implications')
      .build();

    return [diagnostic];
  }

  /**
   * Check for deep nesting
   */
  private checkDeepNesting(expression: string, context: DiagnosticContext): EnhancedDiagnostic[] {
    const nestingDepth = DiagnosticUtils.calculateNestingDepth(expression);
    const maxDepth = context.config.performance.maxNestingDepth;

    if (nestingDepth <= maxDepth) {
      return [];
    }

    const range = Range.create(
      Position.create(context.line, 0),
      Position.create(context.line, expression.length)
    );

    const diagnostic = EnhancedDiagnosticBuilder
      .create('performance-deep-nesting', EnhancedDiagnosticCategory.Performance)
      .withMessage(`Expression nesting depth (${nestingDepth}) exceeds recommended limit (${maxDepth})`)
      .withRange(range)
      .withSeverity(DiagnosticSeverity.Information)
      .withImpact(DiagnosticImpact.Medium)
      .withSuggestion('Consider flattening the expression or using intermediate variables')
      .withDocumentation('Deeply nested expressions can be hard to read and debug')
      .build();

    return [diagnostic];
  }

  /**
   * Check for expensive string operations
   */
  private checkExpensiveStringOperations(expression: string, context: DiagnosticContext): EnhancedDiagnostic[] {
    const diagnostics: EnhancedDiagnostic[] = [];
    
    // Check for contains() that could be startsWith()
    const containsPattern = /\.contains\s*\(\s*['"][^'"]*['"]\s*\)/g;
    let match;

    while ((match = containsPattern.exec(expression)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      
      const range = Range.create(
        Position.create(context.line, start),
        Position.create(context.line, end)
      );

      const diagnostic = EnhancedDiagnosticBuilder
        .create('performance-expensive-string-ops', EnhancedDiagnosticCategory.Performance)
        .withMessage('Consider using startsWith() for prefix matching')
        .withRange(range)
        .withSeverity(DiagnosticSeverity.Information)
        .withImpact(DiagnosticImpact.Medium)
        .withSuggestion('If checking for a prefix, startsWith() may be more efficient')
        .withDocumentation('startsWith() can be optimized better than contains() for prefix matching')
        .build();

      diagnostics.push(diagnostic);
    }

    return diagnostics;
  }

  /**
   * Count function calls in expression
   */
  private countFunctionCalls(expression: string): number {
    const functionPattern = /\b\w+\s*\(/g;
    return (expression.match(functionPattern) || []).length;
  }

  /**
   * Count property accesses in expression
   */
  private countPropertyAccesses(expression: string): number {
    const propertyPattern = /\.\w+/g;
    return (expression.match(propertyPattern) || []).length;
  }

  /**
   * Analyze operations in expression
   */
  private analyzeOperations(expression: string): Array<{
    type: string;
    count: number;
    expensive: boolean;
  }> {
    const operations = [
      { type: 'where', pattern: /\bwhere\b/g, expensive: false },
      { type: 'select', pattern: /\bselect\b/g, expensive: false },
      { type: 'contains', pattern: /\bcontains\b/g, expensive: true },
      { type: 'matches', pattern: /\bmatches\b/g, expensive: true },
      { type: 'count', pattern: /\bcount\b/g, expensive: true },
      { type: 'distinct', pattern: /\bdistinct\b/g, expensive: true }
    ];

    return operations.map(op => ({
      type: op.type,
      count: (expression.match(op.pattern) || []).length,
      expensive: op.expensive
    })).filter(op => op.count > 0);
  }
}