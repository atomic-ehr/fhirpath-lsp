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
  FHIRComplianceMetrics,
  DiagnosticRuleConfig
} from './EnhancedDiagnosticTypes';

/**
 * Analyzer for FHIR best practices diagnostics
 */
export class FHIRBestPracticesAnalyzer implements IDiagnosticAnalyzer {
  private rules: Map<string, DiagnosticRule> = new Map();
  private ruleConfigs: Map<string, DiagnosticRuleConfig> = new Map();

  // FHIR resource types for validation
  private readonly fhirResources = new Set([
    'Patient', 'Practitioner', 'Organization', 'Observation', 'Condition',
    'Procedure', 'MedicationRequest', 'DiagnosticReport', 'Encounter',
    'Bundle', 'OperationOutcome', 'Device', 'Location', 'AllergyIntolerance',
    'CarePlan', 'CareTeam', 'Claim', 'Coverage', 'ImagingStudy',
    'Immunization', 'Media', 'Medication', 'Person', 'Questionnaire',
    'QuestionnaireResponse', 'RelatedPerson', 'Schedule', 'ServiceRequest',
    'Specimen', 'StructureDefinition', 'ValueSet'
  ]);

  // Deprecated FHIR elements (example data)
  private readonly deprecatedElements = new Map([
    ['Patient.animal', 'Use extensions for animal-specific information'],
    ['Practitioner.practitionerRole', 'Use PractitionerRole resource instead'],
    ['Observation.valueQuantity.comparator', 'Use Quantity datatype comparator']
  ]);

  constructor() {
    this.initializeRules();
  }

  /**
   * Analyze expression for FHIR best practices
   */
  analyze(expression: string, context: DiagnosticContext): EnhancedDiagnostic[] {
    if (!context.config.fhirBestPractices.enabled) {
      return [];
    }

    const diagnostics: EnhancedDiagnostic[] = [];

    // Calculate FHIR compliance metrics
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
        console.error(`Error in FHIR best practices rule ${rule.id}:`, error);
      }
    }

    return diagnostics;
  }

  /**
   * Get all FHIR best practices rules
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
   * Calculate FHIR compliance metrics
   */
  calculateMetrics(expression: string): FHIRComplianceMetrics {
    return {
      pathEfficiency: this.calculatePathEfficiency(expression),
      typeCorrectness: this.calculateTypeCorrectness(expression),
      versionCompatibility: this.calculateVersionCompatibility(expression),
      bestPracticeScore: this.calculateBestPracticeScore(expression),
      deprecationWarnings: this.countDeprecationWarnings(expression)
    };
  }

  /**
   * Initialize all FHIR best practices rules
   */
  private initializeRules(): void {
    // Rule: Use ofType() instead of type checking
    this.rules.set('fhir-use-oftype', {
      id: 'fhir-use-oftype',
      name: 'Use ofType() for type filtering',
      category: EnhancedDiagnosticCategory.FHIRBestPractices,
      description: 'Use ofType() instead of where($this is Type) for better performance',
      defaultSeverity: DiagnosticSeverity.Warning,
      impact: DiagnosticImpact.Medium,
      fixable: true,
      check: (expression: string, context: DiagnosticContext): EnhancedDiagnostic[] => {
        return this.checkUseOfType(expression, context);
      }
    });

    // Rule: Deprecated FHIR elements
    this.rules.set('fhir-deprecated-elements', {
      id: 'fhir-deprecated-elements',
      name: 'Deprecated FHIR elements',
      category: EnhancedDiagnosticCategory.FHIRBestPractices,
      description: 'Avoid using deprecated FHIR elements',
      defaultSeverity: DiagnosticSeverity.Warning,
      impact: DiagnosticImpact.High,
      fixable: false,
      check: (expression: string, context: DiagnosticContext): EnhancedDiagnostic[] => {
        return this.checkDeprecatedElements(expression, context);
      }
    });

    // Rule: Efficient path navigation
    this.rules.set('fhir-efficient-paths', {
      id: 'fhir-efficient-paths',
      name: 'Efficient path navigation',
      category: EnhancedDiagnosticCategory.FHIRBestPractices,
      description: 'Use efficient FHIR path navigation patterns',
      defaultSeverity: DiagnosticSeverity.Information,
      impact: DiagnosticImpact.Medium,
      fixable: false,
      check: (expression: string, context: DiagnosticContext): EnhancedDiagnostic[] => {
        return this.checkEfficientPaths(expression, context);
      }
    });

    // Rule: Type safety
    this.rules.set('fhir-type-safety', {
      id: 'fhir-type-safety',
      name: 'Type safety',
      category: EnhancedDiagnosticCategory.FHIRBestPractices,
      description: 'Ensure type-safe FHIR path navigation',
      defaultSeverity: DiagnosticSeverity.Warning,
      impact: DiagnosticImpact.Medium,
      fixable: false,
      check: (expression: string, context: DiagnosticContext): EnhancedDiagnostic[] => {
        return this.checkTypeSafety(expression, context);
      }
    });

    // Rule: Resource context validation
    this.rules.set('fhir-resource-context', {
      id: 'fhir-resource-context',
      name: 'Resource context validation',
      category: EnhancedDiagnosticCategory.FHIRBestPractices,
      description: 'Validate FHIR resource context usage',
      defaultSeverity: DiagnosticSeverity.Warning,
      impact: DiagnosticImpact.Medium,
      fixable: false,
      check: (expression: string, context: DiagnosticContext): EnhancedDiagnostic[] => {
        return this.checkResourceContext(expression, context);
      }
    });

    // Rule: Cardinality awareness
    this.rules.set('fhir-cardinality', {
      id: 'fhir-cardinality',
      name: 'Cardinality awareness',
      category: EnhancedDiagnosticCategory.FHIRBestPractices,
      description: 'Be aware of FHIR element cardinality',
      defaultSeverity: DiagnosticSeverity.Information,
      impact: DiagnosticImpact.Low,
      fixable: false,
      check: (expression: string, context: DiagnosticContext): EnhancedDiagnostic[] => {
        return this.checkCardinality(expression, context);
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
   * Check for inefficient type checking patterns
   */
  private checkUseOfType(expression: string, context: DiagnosticContext): EnhancedDiagnostic[] {
    const diagnostics: EnhancedDiagnostic[] = [];
    
    // Look for where($this is Type) patterns
    const typeCheckPattern = /\.where\s*\(\s*\$this\s+is\s+(\w+)\s*\)/g;
    let match;

    while ((match = typeCheckPattern.exec(expression)) !== null) {
      const resourceType = match[1];
      const start = match.index;
      const end = start + match[0].length;
      
      const range = Range.create(
        Position.create(context.line, start),
        Position.create(context.line, end)
      );

      const suggestion = `.ofType(${resourceType})`;

      const diagnostic = EnhancedDiagnosticBuilder
        .create('fhir-use-oftype', EnhancedDiagnosticCategory.FHIRBestPractices)
        .withMessage(`Use ofType(${resourceType}) instead of where($this is ${resourceType})`)
        .withRange(range)
        .withSeverity(DiagnosticSeverity.Warning)
        .withImpact(DiagnosticImpact.Medium)
        .withSuggestion(`Replace with ${suggestion} for better performance`)
        .withQuickFix(`Use ofType(${resourceType})`, suggestion, range)
        .withDocumentation('ofType() is more efficient than type checking with where()')
        .build();

      diagnostics.push(diagnostic);
    }

    return diagnostics;
  }

  /**
   * Check for deprecated FHIR elements
   */
  private checkDeprecatedElements(expression: string, context: DiagnosticContext): EnhancedDiagnostic[] {
    if (!context.config.fhirBestPractices.flagDeprecatedElements) {
      return [];
    }

    const diagnostics: EnhancedDiagnostic[] = [];
    const fhirPaths = DiagnosticUtils.extractFHIRPaths(expression);

    for (const path of fhirPaths) {
      for (const [deprecatedPath, suggestion] of this.deprecatedElements.entries()) {
        if (path.includes(deprecatedPath)) {
          const start = expression.indexOf(path);
          const end = start + path.length;
          
          const range = Range.create(
            Position.create(context.line, start),
            Position.create(context.line, end)
          );

          const diagnostic = EnhancedDiagnosticBuilder
            .create('fhir-deprecated-elements', EnhancedDiagnosticCategory.FHIRBestPractices)
            .withMessage(`'${deprecatedPath}' is deprecated`)
            .withRange(range)
            .withSeverity(DiagnosticSeverity.Warning)
            .withImpact(DiagnosticImpact.High)
            .withSuggestion(suggestion)
            .withDocumentation(`${deprecatedPath} has been deprecated in newer FHIR versions`)
            .build();

          diagnostics.push(diagnostic);
        }
      }
    }

    return diagnostics;
  }

  /**
   * Check for efficient path navigation
   */
  private checkEfficientPaths(expression: string, context: DiagnosticContext): EnhancedDiagnostic[] {
    const diagnostics: EnhancedDiagnostic[] = [];
    
    // Check for inefficient Bundle navigation
    const bundlePattern = /Bundle\.entry\.resource\.where\s*\(\s*\$this\s+is\s+(\w+)\s*\)/g;
    let match;

    while ((match = bundlePattern.exec(expression)) !== null) {
      const resourceType = match[1];
      const start = match.index;
      const end = start + match[0].length;
      
      const range = Range.create(
        Position.create(context.line, start),
        Position.create(context.line, end)
      );

      const suggestion = `Bundle.entry.resource.ofType(${resourceType})`;

      const diagnostic = EnhancedDiagnosticBuilder
        .create('fhir-efficient-paths', EnhancedDiagnosticCategory.FHIRBestPractices)
        .withMessage('Use more efficient Bundle navigation')
        .withRange(range)
        .withSeverity(DiagnosticSeverity.Information)
        .withImpact(DiagnosticImpact.Medium)
        .withSuggestion(`Use ${suggestion} for better performance`)
        .withDocumentation('ofType() is more efficient for Bundle resource filtering')
        .build();

      diagnostics.push(diagnostic);
    }

    return diagnostics;
  }

  /**
   * Check type safety issues
   */
  private checkTypeSafety(expression: string, context: DiagnosticContext): EnhancedDiagnostic[] {
    if (!context.config.fhirBestPractices.enforceTypeSafety) {
      return [];
    }

    const diagnostics: EnhancedDiagnostic[] = [];
    
    // Check for potentially unsafe property access
    const fhirPaths = DiagnosticUtils.extractFHIRPaths(expression);
    
    for (const path of fhirPaths) {
      const parts = path.split('.');
      if (parts.length > 1) {
        const resourceType = parts[0];
        
        // Check if first part is a valid FHIR resource
        if (!this.fhirResources.has(resourceType)) {
          const start = expression.indexOf(path);
          const end = start + resourceType.length;
          
          const range = Range.create(
            Position.create(context.line, start),
            Position.create(context.line, end)
          );

          const diagnostic = EnhancedDiagnosticBuilder
            .create('fhir-type-safety', EnhancedDiagnosticCategory.FHIRBestPractices)
            .withMessage(`'${resourceType}' is not a recognized FHIR resource type`)
            .withRange(range)
            .withSeverity(DiagnosticSeverity.Warning)
            .withImpact(DiagnosticImpact.Medium)
            .withSuggestion('Verify the resource type name')
            .withDocumentation('Using correct FHIR resource types ensures compatibility')
            .build();

          diagnostics.push(diagnostic);
        }
      }
    }

    return diagnostics;
  }

  /**
   * Check resource context usage
   */
  private checkResourceContext(expression: string, context: DiagnosticContext): EnhancedDiagnostic[] {
    const diagnostics: EnhancedDiagnostic[] = [];
    
    // If we have resource context from the document
    if (context.resourceType) {
      const fhirPaths = DiagnosticUtils.extractFHIRPaths(expression);
      
      for (const path of fhirPaths) {
        const parts = path.split('.');
        const resourceInPath = parts[0];
        
        // Check if the path uses a different resource than the context
        if (resourceInPath !== context.resourceType && this.fhirResources.has(resourceInPath)) {
          const start = expression.indexOf(path);
          const end = start + resourceInPath.length;
          
          const range = Range.create(
            Position.create(context.line, start),
            Position.create(context.line, end)
          );

          const diagnostic = EnhancedDiagnosticBuilder
            .create('fhir-resource-context', EnhancedDiagnosticCategory.FHIRBestPractices)
            .withMessage(`Path uses '${resourceInPath}' but context is '${context.resourceType}'`)
            .withRange(range)
            .withSeverity(DiagnosticSeverity.Information)
            .withImpact(DiagnosticImpact.Medium)
            .withSuggestion('Verify the resource context is correct')
            .withDocumentation('Ensure FHIR paths match the expected resource context')
            .build();

          diagnostics.push(diagnostic);
        }
      }
    }

    return diagnostics;
  }

  /**
   * Check cardinality considerations
   */
  private checkCardinality(expression: string, context: DiagnosticContext): EnhancedDiagnostic[] {
    if (!context.config.fhirBestPractices.checkCardinality) {
      return [];
    }

    const diagnostics: EnhancedDiagnostic[] = [];
    
    // Examples of cardinality-specific checks
    // This would be expanded with actual FHIR specification data
    
    // Check for single() usage on potentially multiple elements
    const singlePattern = /(\w+\.\w+)\.single\(\)/g;
    let match;

    while ((match = singlePattern.exec(expression)) !== null) {
      const path = match[1];
      
      // Check if this is a known multi-cardinality element
      const multiCardinalityElements = ['Patient.name', 'Patient.telecom', 'Patient.address'];
      
      if (multiCardinalityElements.some(elem => path.includes(elem))) {
        const start = match.index;
        const end = start + match[0].length;
        
        const range = Range.create(
          Position.create(context.line, start),
          Position.create(context.line, end)
        );

        const diagnostic = EnhancedDiagnosticBuilder
          .create('fhir-cardinality', EnhancedDiagnosticCategory.FHIRBestPractices)
          .withMessage(`Be careful using single() on '${path}' which may have multiple values`)
          .withRange(range)
          .withSeverity(DiagnosticSeverity.Information)
          .withImpact(DiagnosticImpact.Low)
          .withSuggestion('Consider using first() or add a where() clause to ensure uniqueness')
          .withDocumentation('single() will fail if there are multiple elements')
          .build();

        diagnostics.push(diagnostic);
      }
    }

    return diagnostics;
  }

  /**
   * Calculate path efficiency score
   */
  private calculatePathEfficiency(expression: string): number {
    let score = 100;
    
    // Deduct for inefficient patterns
    if (expression.includes('where($this is')) score -= 20;
    if (expression.includes('Bundle.entry.resource.where')) score -= 15;
    
    const optimizations = DiagnosticUtils.suggestOptimizations(expression);
    score -= optimizations.length * 10;
    
    return Math.max(0, score);
  }

  /**
   * Calculate type correctness score
   */
  private calculateTypeCorrectness(expression: string): number {
    const fhirPaths = DiagnosticUtils.extractFHIRPaths(expression);
    if (fhirPaths.length === 0) return 100;
    
    let validPaths = 0;
    for (const path of fhirPaths) {
      const resourceType = path.split('.')[0];
      if (this.fhirResources.has(resourceType)) {
        validPaths++;
      }
    }
    
    return Math.round((validPaths / fhirPaths.length) * 100);
  }

  /**
   * Calculate version compatibility score
   */
  private calculateVersionCompatibility(expression: string): number {
    const deprecatedCount = this.countDeprecationWarnings(expression);
    const fhirPaths = DiagnosticUtils.extractFHIRPaths(expression);
    
    if (fhirPaths.length === 0) return 100;
    
    const compatibilityRatio = Math.max(0, fhirPaths.length - deprecatedCount) / fhirPaths.length;
    return Math.round(compatibilityRatio * 100);
  }

  /**
   * Calculate best practice score
   */
  private calculateBestPracticeScore(expression: string): number {
    let score = 100;
    
    // Check for best practice violations
    if (expression.includes('where($this is')) score -= 15;
    if (expression.includes('.count() > 0')) score -= 10;
    if (expression.includes('.count() = 0')) score -= 10;
    
    const complexity = DiagnosticUtils.calculateComplexity(expression);
    if (complexity > 15) score -= 20;
    
    return Math.max(0, score);
  }

  /**
   * Count deprecation warnings
   */
  private countDeprecationWarnings(expression: string): number {
    let count = 0;
    
    for (const deprecatedPath of this.deprecatedElements.keys()) {
      if (expression.includes(deprecatedPath)) {
        count++;
      }
    }
    
    return count;
  }
}