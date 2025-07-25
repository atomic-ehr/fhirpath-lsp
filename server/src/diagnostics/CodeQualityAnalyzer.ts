import { DiagnosticSeverity, Range, Position } from 'vscode-languageserver';

import {
  IDiagnosticAnalyzer,
  DiagnosticRule,
  EnhancedDiagnostic,
  DiagnosticContext,
  EnhancedDiagnosticCategory,
  DiagnosticImpact,
  EnhancedDiagnosticBuilder,
  CodeQualityMetrics,
  DiagnosticRuleConfig
} from './EnhancedDiagnosticTypes';

/**
 * Analyzer for code quality diagnostics
 */
export class CodeQualityAnalyzer implements IDiagnosticAnalyzer {
  private rules: Map<string, DiagnosticRule> = new Map();
  private ruleConfigs: Map<string, DiagnosticRuleConfig> = new Map();

  constructor() {
    this.initializeRules();
  }

  /**
   * Analyze expression for code quality issues
   */
  analyze(expression: string, context: DiagnosticContext): EnhancedDiagnostic[] {
    if (!context.config.codeQuality.enabled) {
      return [];
    }

    const diagnostics: EnhancedDiagnostic[] = [];

    // Calculate code quality metrics
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
        console.error(`Error in code quality rule ${rule.id}:`, error);
      }
    }

    return diagnostics;
  }

  /**
   * Get all code quality rules
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
   * Calculate code quality metrics
   */
  calculateMetrics(expression: string): CodeQualityMetrics {
    return {
      lineLength: expression.length,
      readabilityScore: this.calculateReadabilityScore(expression),
      maintainabilityIndex: this.calculateMaintainabilityIndex(expression),
      duplicationRisk: this.calculateDuplicationRisk(expression),
      namingConsistency: this.calculateNamingConsistency(expression)
    };
  }

  /**
   * Initialize all code quality rules
   */
  private initializeRules(): void {
    // Rule: Line length limit
    this.rules.set('quality-line-length', {
      id: 'quality-line-length',
      name: 'Line length limit',
      category: EnhancedDiagnosticCategory.CodeQuality,
      description: 'Lines should not exceed the maximum length limit',
      defaultSeverity: DiagnosticSeverity.Information,
      impact: DiagnosticImpact.Low,
      fixable: false,
      check: (expression: string, context: DiagnosticContext): EnhancedDiagnostic[] => {
        return this.checkLineLength(expression, context);
      }
    });

    // Rule: Magic values
    this.rules.set('quality-magic-values', {
      id: 'quality-magic-values',
      name: 'Magic values',
      category: EnhancedDiagnosticCategory.CodeQuality,
      description: 'Avoid using magic strings and numbers without explanation',
      defaultSeverity: DiagnosticSeverity.Information,
      impact: DiagnosticImpact.Medium,
      fixable: false,
      check: (expression: string, context: DiagnosticContext): EnhancedDiagnostic[] => {
        return this.checkMagicValues(expression, context);
      }
    });

    // Rule: Consistent spacing
    this.rules.set('quality-spacing', {
      id: 'quality-spacing',
      name: 'Consistent spacing',
      category: EnhancedDiagnosticCategory.CodeQuality,
      description: 'Use consistent spacing around operators',
      defaultSeverity: DiagnosticSeverity.Information,
      impact: DiagnosticImpact.Low,
      fixable: true,
      check: (expression: string, context: DiagnosticContext): EnhancedDiagnostic[] => {
        return this.checkSpacing(expression, context);
      }
    });

    // Rule: Boolean comparison
    this.rules.set('quality-boolean-comparison', {
      id: 'quality-boolean-comparison',
      name: 'Explicit boolean comparison',
      category: EnhancedDiagnosticCategory.CodeQuality,
      description: 'Use explicit boolean comparisons for clarity',
      defaultSeverity: DiagnosticSeverity.Information,
      impact: DiagnosticImpact.Low,
      fixable: true,
      check: (expression: string, context: DiagnosticContext): EnhancedDiagnostic[] => {
        return this.checkBooleanComparison(expression, context);
      }
    });

    // Rule: Complex conditions
    this.rules.set('quality-complex-conditions', {
      id: 'quality-complex-conditions',
      name: 'Complex conditions',
      category: EnhancedDiagnosticCategory.CodeQuality,
      description: 'Complex conditions should be broken down for readability',
      defaultSeverity: DiagnosticSeverity.Information,
      impact: DiagnosticImpact.Medium,
      fixable: false,
      check: (expression: string, context: DiagnosticContext): EnhancedDiagnostic[] => {
        return this.checkComplexConditions(expression, context);
      }
    });

    // Rule: Naming conventions
    this.rules.set('quality-naming-conventions', {
      id: 'quality-naming-conventions',
      name: 'Naming conventions',
      category: EnhancedDiagnosticCategory.CodeQuality,
      description: 'Follow consistent naming conventions',
      defaultSeverity: DiagnosticSeverity.Information,
      impact: DiagnosticImpact.Low,
      fixable: false,
      check: (expression: string, context: DiagnosticContext): EnhancedDiagnostic[] => {
        return this.checkNamingConventions(expression, context);
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
   * Check line length limit
   */
  private checkLineLength(expression: string, context: DiagnosticContext): EnhancedDiagnostic[] {
    const maxLength = context.config.codeQuality.maxLineLength;
    
    if (expression.length <= maxLength) {
      return [];
    }

    const range = Range.create(
      Position.create(context.line, maxLength),
      Position.create(context.line, expression.length)
    );

    const diagnostic = EnhancedDiagnosticBuilder
      .create('quality-line-length', EnhancedDiagnosticCategory.CodeQuality)
      .withMessage(`Line length (${expression.length}) exceeds limit (${maxLength})`)
      .withRange(range)
      .withSeverity(DiagnosticSeverity.Information)
      .withImpact(DiagnosticImpact.Low)
      .withSuggestion('Consider breaking the expression across multiple lines')
      .withDocumentation('Long lines can be hard to read and review')
      .build();

    return [diagnostic];
  }

  /**
   * Check for magic values
   */
  private checkMagicValues(expression: string, context: DiagnosticContext): EnhancedDiagnostic[] {
    if (!context.config.codeQuality.flagMagicValues) {
      return [];
    }

    const diagnostics: EnhancedDiagnostic[] = [];
    
    // Check for quoted strings that might be magic values
    const stringPattern = /['"]([^'"]+)['"]/g;
    let match;

    while ((match = stringPattern.exec(expression)) !== null) {
      const value = match[1];
      
      // Skip common/obvious values
      if (this.isObviousValue(value)) {
        continue;
      }

      const start = match.index;
      const end = start + match[0].length;
      
      const range = Range.create(
        Position.create(context.line, start),
        Position.create(context.line, end)
      );

      const diagnostic = EnhancedDiagnosticBuilder
        .create('quality-magic-values', EnhancedDiagnosticCategory.CodeQuality)
        .withMessage(`Consider documenting the meaning of '${value}'`)
        .withRange(range)
        .withSeverity(DiagnosticSeverity.Information)
        .withImpact(DiagnosticImpact.Medium)
        .withSuggestion('Add a comment explaining what this value represents')
        .withDocumentation('Magic values can make code harder to understand and maintain')
        .build();

      diagnostics.push(diagnostic);
    }

    // Check for numeric literals
    const numberPattern = /\b\d+\b/g;

    while ((match = numberPattern.exec(expression)) !== null) {
      const value = match[0];
      
      // Skip obvious numbers
      if (['0', '1'].includes(value)) {
        continue;
      }

      const start = match.index;
      const end = start + match[0].length;
      
      const range = Range.create(
        Position.create(context.line, start),
        Position.create(context.line, end)
      );

      const diagnostic = EnhancedDiagnosticBuilder
        .create('quality-magic-values', EnhancedDiagnosticCategory.CodeQuality)
        .withMessage(`Consider documenting the meaning of '${value}'`)
        .withRange(range)
        .withSeverity(DiagnosticSeverity.Information)
        .withImpact(DiagnosticImpact.Medium)
        .withSuggestion('Add a comment explaining what this number represents')
        .build();

      diagnostics.push(diagnostic);
    }

    return diagnostics;
  }

  /**
   * Check spacing around operators
   */
  private checkSpacing(expression: string, context: DiagnosticContext): EnhancedDiagnostic[] {
    const diagnostics: EnhancedDiagnostic[] = [];
    
    // Check for missing spaces around = operator
    const equalsPattern = /\w+=\w+|\w+=\s+\w+|\w+\s+=\w+/g;
    let match;

    while ((match = equalsPattern.exec(expression)) !== null) {
      const text = match[0];
      
      // Check if it already has proper spacing
      if (/ = /.test(text)) {
        continue;
      }

      const start = match.index;
      const end = start + match[0].length;
      
      const range = Range.create(
        Position.create(context.line, start),
        Position.create(context.line, end)
      );

      const properSpacing = text.replace(/\s*=\s*/, ' = ');

      const diagnostic = EnhancedDiagnosticBuilder
        .create('quality-spacing', EnhancedDiagnosticCategory.CodeQuality)
        .withMessage('Use consistent spacing around = operator')
        .withRange(range)
        .withSeverity(DiagnosticSeverity.Information)
        .withImpact(DiagnosticImpact.Low)
        .withSuggestion('Add spaces around = operator')
        .withQuickFix('Fix spacing', properSpacing, range)
        .build();

      diagnostics.push(diagnostic);
    }

    return diagnostics;
  }

  /**
   * Check boolean comparisons
   */
  private checkBooleanComparison(expression: string, context: DiagnosticContext): EnhancedDiagnostic[] {
    const diagnostics: EnhancedDiagnostic[] = [];
    
    // Look for implicit boolean usage that could be explicit
    const implicitBooleanPattern = /\b(\w+)\s+(and|or)\s+/g;
    let match;

    while ((match = implicitBooleanPattern.exec(expression)) !== null) {
      const property = match[1];
      
      // Skip if it's already an explicit comparison
      if (/=|!=|>|</.test(expression.substring(match.index - 10, match.index))) {
        continue;
      }

      const start = match.index;
      const end = start + property.length;
      
      const range = Range.create(
        Position.create(context.line, start),
        Position.create(context.line, end)
      );

      const diagnostic = EnhancedDiagnosticBuilder
        .create('quality-boolean-comparison', EnhancedDiagnosticCategory.CodeQuality)
        .withMessage(`Consider explicit boolean comparison for '${property}'`)
        .withRange(range)
        .withSeverity(DiagnosticSeverity.Information)
        .withImpact(DiagnosticImpact.Low)
        .withSuggestion(`Use '${property} = true' or '${property}.exists()' for clarity`)
        .build();

      diagnostics.push(diagnostic);
    }

    return diagnostics;
  }

  /**
   * Check for complex conditions
   */
  private checkComplexConditions(expression: string, context: DiagnosticContext): EnhancedDiagnostic[] {
    const diagnostics: EnhancedDiagnostic[] = [];
    
    // Count logical operators in where clauses
    const wherePattern = /\.where\s*\(([^)]+)\)/g;
    let match;

    while ((match = wherePattern.exec(expression)) !== null) {
      const condition = match[1];
      const logicalOps = (condition.match(/\b(and|or)\b/g) || []).length;
      
      if (logicalOps >= 3) {
        const start = match.index;
        const end = start + match[0].length;
        
        const range = Range.create(
          Position.create(context.line, start),
          Position.create(context.line, end)
        );

        const diagnostic = EnhancedDiagnosticBuilder
          .create('quality-complex-conditions', EnhancedDiagnosticCategory.CodeQuality)
          .withMessage(`Complex condition with ${logicalOps + 1} parts may be hard to read`)
          .withRange(range)
          .withSeverity(DiagnosticSeverity.Information)
          .withImpact(DiagnosticImpact.Medium)
          .withSuggestion('Consider breaking into multiple where() clauses or using variables')
          .withDocumentation('Complex conditions can be hard to understand and debug')
          .build();

        diagnostics.push(diagnostic);
      }
    }

    return diagnostics;
  }

  /**
   * Check naming conventions
   */
  private checkNamingConventions(expression: string, context: DiagnosticContext): EnhancedDiagnostic[] {
    if (!context.config.codeQuality.enforceNamingConventions) {
      return [];
    }

    const diagnostics: EnhancedDiagnostic[] = [];
    
    // Check for camelCase vs other conventions in property names
    const propertyPattern = /\.([a-zA-Z_][a-zA-Z0-9_]*)/g;
    let match;

    while ((match = propertyPattern.exec(expression)) !== null) {
      const property = match[1];
      
      // Check if it follows camelCase or PascalCase
      if (!/^[a-z][a-zA-Z0-9]*$|^[A-Z][a-zA-Z0-9]*$/.test(property)) {
        const start = match.index + 1; // Skip the dot
        const end = start + property.length;
        
        const range = Range.create(
          Position.create(context.line, start),
          Position.create(context.line, end)
        );

        const diagnostic = EnhancedDiagnosticBuilder
          .create('quality-naming-conventions', EnhancedDiagnosticCategory.CodeQuality)
          .withMessage(`Property '${property}' should follow camelCase convention`)
          .withRange(range)
          .withSeverity(DiagnosticSeverity.Information)
          .withImpact(DiagnosticImpact.Low)
          .withSuggestion('Use camelCase for property names')
          .build();

        diagnostics.push(diagnostic);
      }
    }

    return diagnostics;
  }

  /**
   * Calculate readability score
   */
  private calculateReadabilityScore(expression: string): number {
    let score = 100;
    
    // Deduct points for complexity factors
    const length = expression.length;
    if (length > 50) score -= Math.min(20, (length - 50) / 5);
    
    const nesting = (expression.match(/\(/g) || []).length;
    score -= nesting * 5;
    
    const operators = (expression.match(/\band\b|\bor\b/g) || []).length;
    score -= operators * 3;
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate maintainability index
   */
  private calculateMaintainabilityIndex(expression: string): number {
    // Simplified maintainability calculation
    const complexity = (expression.match(/\b(where|select|and|or)\b/g) || []).length;
    const length = expression.length;
    
    // Higher is better
    return Math.max(0, 100 - complexity * 5 - Math.floor(length / 10));
  }

  /**
   * Calculate duplication risk
   */
  private calculateDuplicationRisk(expression: string): number {
    // Look for repeated patterns
    const patterns = expression.match(/\.\w+/g) || [];
    const unique = new Set(patterns);
    
    if (patterns.length === 0) return 0;
    
    // Higher duplication = higher risk
    return Math.min(100, ((patterns.length - unique.size) / patterns.length) * 100);
  }

  /**
   * Calculate naming consistency
   */
  private calculateNamingConsistency(expression: string): number {
    const properties = expression.match(/\.([a-zA-Z_][a-zA-Z0-9_]*)/g) || [];
    if (properties.length === 0) return 100;
    
    let camelCaseCount = 0;
    let otherCount = 0;
    
    for (const prop of properties) {
      const name = prop.substring(1); // Remove the dot
      if (/^[a-z][a-zA-Z0-9]*$/.test(name)) {
        camelCaseCount++;
      } else {
        otherCount++;
      }
    }
    
    // Return percentage of consistent naming
    return Math.round((Math.max(camelCaseCount, otherCount) / properties.length) * 100);
  }

  /**
   * Check if a value is obviously not magic
   */
  private isObviousValue(value: string): boolean {
    const obvious = [
      'true', 'false', 'null', '',
      'official', 'usual', 'temp', 'old',
      'active', 'inactive', 'draft', 'final',
      'male', 'female', 'other', 'unknown'
    ];
    
    return obvious.includes(value.toLowerCase());
  }
}