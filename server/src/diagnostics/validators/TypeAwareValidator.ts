import { Diagnostic, DiagnosticSeverity, Range, Position } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { BaseValidator } from './BaseValidator';
import { FHIRPathService } from '../../parser/FHIRPathService';
import { ModelProviderService, EnhancedTypeInfo } from '../../services/ModelProviderService';
import type { TypeInfo, AnalysisResult } from '@atomic-ehr/fhirpath';

/**
 * Expression metadata for validation
 */
export interface Expression {
  text: string;
  line: number;
  column: number;
  length: number;
  id?: string;
}

/**
 * Expression context for type-aware validation
 */
export interface ExpressionContext {
  resourceType?: string;
  inputType?: TypeInfo;
  variables?: Record<string, string>;
  expectedOutputType?: string;
}

/**
 * Type compatibility result
 */
export interface CompatibilityResult {
  isCompatible: boolean;
  reason?: string;
  suggestions?: string[];
  expectedType?: string;
  actualType?: string;
}

/**
 * Validation suggestion
 */
export interface ValidationSuggestion {
  type: 'fix' | 'improvement' | 'alternative';
  message: string;
  replacement?: string;
}

/**
 * Configuration options for TypeAwareValidator
 */
export interface TypeAwareValidatorConfig {
  strictTypeChecking: boolean;
  enableContextValidation: boolean;
  enablePropertySuggestions: boolean;
  maxSuggestions: number;
  enablePerformanceOptimizations: boolean;
  similarityThreshold: number;
}

/**
 * Advanced semantic validator that leverages ModelProvider for enhanced type checking,
 * property validation, and intelligent error recovery with suggestions.
 */
export class TypeAwareValidator extends BaseValidator {
  private config: TypeAwareValidatorConfig;
  private validationCache = new Map<string, Diagnostic[]>();
  private readonly cacheExpiryMs = 300000; // 5 minutes

  constructor(
    private fhirPathService: FHIRPathService,
    private modelProviderService: ModelProviderService,
    config: Partial<TypeAwareValidatorConfig> = {}
  ) {
    super();
    
    this.config = {
      strictTypeChecking: true,
      enableContextValidation: true,
      enablePropertySuggestions: true,
      maxSuggestions: 5,
      enablePerformanceOptimizations: true,
      similarityThreshold: 0.7,
      ...config
    };
  }

  async validate(
    document: TextDocument,
    expression?: string,
    lineOffset: number = 0,
    columnOffset: number = 0
  ): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];
    
    // Extract expressions from document or use provided expression
    const expressions = expression 
      ? [{ text: expression, line: 0, column: 0, length: expression.length }] 
      : this.extractExpressions(document);
    
    // Process each expression
    for (const expr of expressions) {
      try {
        // Check cache first if performance optimizations are enabled
        if (this.config.enablePerformanceOptimizations) {
          const cached = this.getCachedValidation(expr.text);
          if (cached) {
            diagnostics.push(...this.adjustDiagnosticRanges(cached, lineOffset, columnOffset));
            continue;
          }
        }
        
        const expressionDiagnostics: Diagnostic[] = [];
        
        // Validate type compatibility
        if (this.config.strictTypeChecking) {
          expressionDiagnostics.push(...await this.validateTypeCompatibility(expr, lineOffset, columnOffset));
        }
        
        // Validate property existence and access
        expressionDiagnostics.push(...await this.validatePropertyAccess(expr, lineOffset, columnOffset));
        
        // Validate context appropriateness
        if (this.config.enableContextValidation) {
          expressionDiagnostics.push(...await this.validateExpressionContext(expr, lineOffset, columnOffset));
        }
        
        // Cache results if performance optimizations are enabled
        if (this.config.enablePerformanceOptimizations) {
          this.cacheValidation(expr.text, expressionDiagnostics);
        }
        
        diagnostics.push(...expressionDiagnostics);
        
      } catch (error) {
        // Convert validation errors to diagnostics
        diagnostics.push(this.createValidationErrorDiagnostic(expr, error, lineOffset, columnOffset));
      }
    }
    
    return this.limitDiagnostics(diagnostics);
  }

  /**
   * Extract expressions from document text
   */
  private extractExpressions(document: TextDocument): Expression[] {
    const text = document.getText();
    const lines = text.split('\n');
    const expressions: Expression[] = [];
    
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex].trim();
      if (line && !line.startsWith('//') && !line.startsWith('#')) {
        expressions.push({
          text: line,
          line: lineIndex,
          column: 0,
          length: line.length,
          id: `${lineIndex}:${line}`
        });
      }
    }
    
    return expressions;
  }

  /**
   * Create diagnostic for validation errors
   */
  private createValidationErrorDiagnostic(
    expr: Expression,
    error: any,
    lineOffset: number,
    columnOffset: number
  ): Diagnostic {
    const range = this.createRange(
      lineOffset + expr.line,
      columnOffset + expr.column,
      lineOffset + expr.line,
      columnOffset + expr.column + expr.length
    );
    
    return this.createDiagnostic(
      DiagnosticSeverity.Error,
      range,
      `Validation error: ${error instanceof Error ? error.message : String(error)}`,
      'validation-error',
      'fhirpath-type-validator'
    );
  }

  /**
   * Get cached validation results
   */
  private getCachedValidation(expression: string): Diagnostic[] | undefined {
    const cached = this.validationCache.get(expression);
    if (cached) {
      // Check if cache is still valid (simple timestamp-based approach)
      const now = Date.now();
      const cacheKey = `${expression}_timestamp`;
      const timestamp = this.validationCache.get(cacheKey)?.[0]?.data?.timestamp;
      
      if (timestamp && (now - timestamp) < this.cacheExpiryMs) {
        return cached;
      } else {
        this.validationCache.delete(expression);
        this.validationCache.delete(cacheKey);
      }
    }
    return undefined;
  }

  /**
   * Cache validation results
   */
  private cacheValidation(expression: string, diagnostics: Diagnostic[]): void {
    this.validationCache.set(expression, diagnostics);
    
    // Store timestamp for cache expiry
    const timestampDiagnostic = this.createDiagnostic(
      DiagnosticSeverity.Information,
      this.createRange(0, 0, 0, 0),
      '',
      '',
      ''
    );
    timestampDiagnostic.data = { timestamp: Date.now() };
    this.validationCache.set(`${expression}_timestamp`, [timestampDiagnostic]);
    
    // Prevent cache from growing too large
    if (this.validationCache.size > 200) {
      const oldestEntries = Array.from(this.validationCache.keys()).slice(0, 50);
      for (const key of oldestEntries) {
        this.validationCache.delete(key);
      }
    }
  }

  /**
   * Adjust diagnostic ranges for line/column offsets
   */
  private adjustDiagnosticRanges(
    diagnostics: Diagnostic[],
    lineOffset: number,
    columnOffset: number
  ): Diagnostic[] {
    return diagnostics.map(diagnostic => ({
      ...diagnostic,
      range: this.adjustRange(diagnostic.range, lineOffset, columnOffset)
    }));
  }

  /**
   * Calculate string similarity for suggestions
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) {
      return 1.0;
    }
    
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
    
    for (let i = 0; i <= str1.length; i++) {
      matrix[0][i] = i;
    }
    
    for (let j = 0; j <= str2.length; j++) {
      matrix[j][0] = j;
    }
    
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,     // deletion
          matrix[j - 1][i] + 1,     // insertion
          matrix[j - 1][i - 1] + cost // substitution
        );
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  /**
   * Clear validation caches for memory management
   */
  public clearCaches(): void {
    this.validationCache.clear();
  }

  /**
   * Update validator configuration
   */
  public updateConfig(newConfig: Partial<TypeAwareValidatorConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current validator configuration
   */
  public getConfig(): TypeAwareValidatorConfig {
    return { ...this.config };
  }

  /**
   * Validate type compatibility using ModelProvider context
   */
  private async validateTypeCompatibility(
    expr: Expression,
    lineOffset: number,
    columnOffset: number
  ): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];
    
    if (!this.modelProviderService || !this.modelProviderService.isInitialized()) {
      return diagnostics;
    }
    
    try {
      // Analyze expression with ModelProvider context
      const analysis = await this.fhirPathService.analyzeWithContext(expr.text, {
        errorRecovery: true
      });
      
      if (!analysis || !analysis.diagnostics) {
        return diagnostics;
      }
      
      // Process type-related errors from analysis
      for (const error of analysis.diagnostics) {
        if (this.isTypeError(error)) {
          diagnostics.push(this.createTypeMismatchDiagnostic(
            error,
            expr,
            lineOffset,
            columnOffset
          ));
        }
      }
      
      // Additional type validation using ModelProvider
      const typeValidations = await this.performModelProviderTypeValidation(expr, lineOffset, columnOffset);
      diagnostics.push(...typeValidations);
      
    } catch (error) {
      // Don't fail completely on type validation errors
      console.warn('Type compatibility validation failed:', error);
    }
    
    return diagnostics;
  }

  /**
   * Perform additional type validation using ModelProvider
   */
  private async performModelProviderTypeValidation(
    expr: Expression,
    lineOffset: number,
    columnOffset: number
  ): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];
    
    try {
      // Extract resource type and property path from expression
      const pathMatch = expr.text.match(/^([A-Z]\w+)(?:\.(\w+(?:\.\w+)*))?/);
      if (!pathMatch) {
        return diagnostics;
      }
      
      const [, resourceType, propertyPath] = pathMatch;
      const pathParts = propertyPath ? propertyPath.split('.') : [];
      
      // Validate navigation path using ModelProvider
      const navigation = await this.modelProviderService.navigatePropertyPath(resourceType, pathParts);
      
      if (navigation.isValid && navigation.finalType) {
        // Check for type-specific issues
        const typeIssues = await this.checkTypeSpecificIssues(expr, navigation.finalType, pathParts);
        
        for (const issue of typeIssues) {
          const range = this.createRange(
            lineOffset + expr.line,
            columnOffset + expr.column,
            lineOffset + expr.line,
            columnOffset + expr.column + expr.length
          );
          
          diagnostics.push(this.createDiagnostic(
            issue.severity,
            range,
            issue.message,
            issue.code,
            'fhirpath-type-checker'
          ));
        }
      }
      
    } catch (error) {
      console.warn('ModelProvider type validation failed:', error);
    }
    
    return diagnostics;
  }

  /**
   * Check for type-specific validation issues
   */
  private async checkTypeSpecificIssues(
    expr: Expression,
    finalType: TypeInfo,
    pathParts: string[]
  ): Promise<Array<{ severity: DiagnosticSeverity; message: string; code: string }>> {
    const issues: Array<{ severity: DiagnosticSeverity; message: string; code: string }> = [];
    
    // Check for collection vs single value misuse
    if (expr.text.includes('.single()') && !finalType.singleton) {
      issues.push({
        severity: DiagnosticSeverity.Warning,
        message: `Using single() on collection type '${finalType.type}' may cause runtime errors`,
        code: 'single-on-collection'
      });
    }
    
    // Check for choice type access without type filtering
    if (pathParts.length > 0) {
      try {
        const enhanced = await this.modelProviderService.getEnhancedTypeInfo(finalType.type);
        if (enhanced?.choiceTypes && enhanced.choiceTypes.length > 1) {
          const lastProperty = pathParts[pathParts.length - 1];
          if (!this.isChoiceTypeProperty(lastProperty)) {
            issues.push({
              severity: DiagnosticSeverity.Information,
              message: `Property '${lastProperty}' is a choice type with ${enhanced.choiceTypes.length} options. Consider using specific choice properties or ofType().`,
              code: 'choice-type-access'
            });
          }
        }
      } catch (error) {
        // Ignore enhanced type info errors
      }
    }
    
    // Check for boolean context misuse
    if (String(finalType.type) === 'boolean' && expr.text.includes('= true')) {
      issues.push({
        severity: DiagnosticSeverity.Information,
        message: 'Redundant boolean comparison. Expression already evaluates to boolean',
        code: 'redundant-boolean-comparison'
      });
    }
    
    // Check for string functions on non-string types
    if (String(finalType.type) !== 'string' && this.hasStringFunctions(expr.text)) {
      issues.push({
        severity: DiagnosticSeverity.Warning,
        message: `String functions used on non-string type '${finalType.type}'`,
        code: 'string-function-type-mismatch'
      });
    }
    
    return issues;
  }

  /**
   * Check if property name represents a choice type expansion
   */
  private isChoiceTypeProperty(propertyName: string): boolean {
    return /^[a-z]+[A-Z]\w+$/.test(propertyName);
  }

  /**
   * Check if expression contains string functions
   */
  private hasStringFunctions(expression: string): boolean {
    const stringFunctions = ['contains(', 'startsWith(', 'endsWith(', 'matches(', 'length('];
    return stringFunctions.some(func => expression.includes(func));
  }

  /**
   * Check if an error is type-related
   */
  private isTypeError(error: any): boolean {
    if (!error || !error.message) {
      return false;
    }
    
    const typeErrorPatterns = [
      /type mismatch/i,
      /expected.*got/i,
      /incompatible types/i,
      /cannot convert/i,
      /type error/i
    ];
    
    return typeErrorPatterns.some(pattern => pattern.test(error.message));
  }

  /**
   * Create type mismatch diagnostic with enhanced information
   */
  private createTypeMismatchDiagnostic(
    error: any,
    expr: Expression,
    lineOffset: number,
    columnOffset: number
  ): Diagnostic {
    const expectedType = error.expectedType || 'unknown';
    const actualType = error.actualType || 'unknown';
    
    const range = this.createRange(
      lineOffset + expr.line,
      columnOffset + expr.column,
      lineOffset + expr.line,
      columnOffset + expr.column + expr.length
    );
    
    let message = error.message;
    if (expectedType !== 'unknown' && actualType !== 'unknown') {
      message = `Type mismatch: expected ${expectedType}, got ${actualType}`;
    }
    
    const diagnostic = this.createDiagnostic(
      DiagnosticSeverity.Error,
      range,
      message,
      'type-mismatch',
      'fhirpath-type-validator'
    );
    
    // Add suggestion data
    diagnostic.data = {
      expectedType,
      actualType,
      suggestions: this.generateTypeSuggestions(expectedType, actualType)
    };
    
    return diagnostic;
  }

  /**
   * Generate intelligent type conversion suggestions
   */
  private generateTypeSuggestions(expectedType: string, actualType: string): string[] {
    const suggestions: string[] = [];
    
    // Suggest type conversion functions
    if (expectedType === 'string' && actualType === 'integer') {
      suggestions.push('Use toString() to convert integer to string');
    } else if (expectedType === 'boolean' && actualType === 'string') {
      suggestions.push('Use empty() or exists() for boolean conversion');
      suggestions.push('Use length() > 0 to check if string has content');
    } else if (expectedType === 'integer' && actualType === 'string') {
      suggestions.push('Use toInteger() to convert string to integer');
    } else if (expectedType === 'decimal' && actualType === 'integer') {
      suggestions.push('Integer can be used as decimal directly');
    }
    
    // Suggest choice type handling
    const choiceMatch = actualType.match(/choice<(.+)>/);
    if (choiceMatch && expectedType !== actualType) {
      const choiceTypes = choiceMatch[1].split(',').map(t => t.trim());
      if (choiceTypes.includes(expectedType)) {
        suggestions.push(`Use ofType(${expectedType}) to filter choice type`);
        suggestions.push(`Use 'as ${expectedType}' to cast choice type`);
      }
    }
    
    // Suggest collection handling
    if (actualType.endsWith('[]') && !expectedType.endsWith('[]')) {
      suggestions.push('Use first() to get the first element from collection');
      suggestions.push('Use single() if expecting exactly one element');
      suggestions.push('Use last() to get the last element from collection');
    } else if (!actualType.endsWith('[]') && expectedType.endsWith('[]')) {
      suggestions.push('Expression returns single value, expected collection');
    }
    
    return suggestions.slice(0, this.config.maxSuggestions);
  }

  /**
   * Validate property access paths using ModelProvider
   */
  private async validatePropertyAccess(
    expr: Expression,
    lineOffset: number,
    columnOffset: number
  ): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];
    
    if (!this.modelProviderService || !this.modelProviderService.isInitialized()) {
      return diagnostics;
    }
    
    try {
      // Parse property access patterns
      const propertyPattern = /(\w+)\.(\w+(?:\.\w+)*)/g;
      let match;
      
      while ((match = propertyPattern.exec(expr.text)) !== null) {
        const [fullMatch, resourceType, propertyPath] = match;
        const pathParts = propertyPath.split('.');
        
        // Validate navigation path
        const navigation = await this.modelProviderService.navigatePropertyPath(resourceType, pathParts);
        
        if (!navigation.isValid) {
          for (const error of navigation.errors) {
            const range = this.createRange(
              lineOffset + expr.line,
              columnOffset + expr.column + match.index,
              lineOffset + expr.line,
              columnOffset + expr.column + match.index + fullMatch.length
            );
            
            const diagnostic = this.createDiagnostic(
              DiagnosticSeverity.Error,
              range,
              error,
              'invalid-property-access',
              'fhirpath-property-validator'
            );
            
            // Add suggestion data
            diagnostic.data = {
              resourceType,
              propertyPath: pathParts,
              suggestions: await this.generatePropertySuggestions(resourceType, pathParts)
            };
            
            diagnostics.push(diagnostic);
          }
        }
        
        // Additional property-specific validations
        if (navigation.isValid && navigation.finalType) {
          const propertyDiagnostics = await this.validatePropertySpecificIssues(
            expr,
            resourceType,
            pathParts,
            navigation.finalType,
            lineOffset,
            columnOffset,
            match.index
          );
          diagnostics.push(...propertyDiagnostics);
        }
      }
      
    } catch (error) {
      console.warn('Property access validation failed:', error);
    }
    
    return diagnostics;
  }

  /**
   * Validate property-specific issues
   */
  private async validatePropertySpecificIssues(
    expr: Expression,
    resourceType: string,
    pathParts: string[],
    finalType: TypeInfo,
    lineOffset: number,
    columnOffset: number,
    matchIndex: number
  ): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];
    
    try {
      // Check for deprecated properties
      const deprecatedProperties = await this.checkDeprecatedProperties(resourceType, pathParts);
      for (const warning of deprecatedProperties) {
        const range = this.createRange(
          lineOffset + expr.line,
          columnOffset + expr.column + matchIndex,
          lineOffset + expr.line,
          columnOffset + expr.column + matchIndex + pathParts.join('.').length
        );
        
        diagnostics.push(this.createDiagnostic(
          DiagnosticSeverity.Warning,
          range,
          warning,
          'deprecated-property',
          'fhirpath-property-validator'
        ));
      }
      
      // Check for cardinality constraints
      const cardinalityIssues = await this.checkCardinalityConstraints(expr, pathParts, finalType);
      for (const issue of cardinalityIssues) {
        const range = this.createRange(
          lineOffset + expr.line,
          columnOffset + expr.column,
          lineOffset + expr.line,
          columnOffset + expr.column + expr.length
        );
        
        diagnostics.push(this.createDiagnostic(
          DiagnosticSeverity.Warning,
          range,
          issue,
          'cardinality-constraint',
          'fhirpath-property-validator'
        ));
      }
      
      // Check for missing required properties in complex expressions
      const requiredPropertyIssues = await this.checkRequiredProperties(expr, resourceType, pathParts);
      diagnostics.push(...requiredPropertyIssues.map(issue => {
        const range = this.createRange(
          lineOffset + expr.line,
          columnOffset + expr.column,
          lineOffset + expr.line,
          columnOffset + expr.column + expr.length
        );
        
        return this.createDiagnostic(
          DiagnosticSeverity.Information,
          range,
          issue,
          'required-property-info',
          'fhirpath-property-validator'
        );
      }));
      
    } catch (error) {
      console.warn('Property-specific validation failed:', error);
    }
    
    return diagnostics;
  }

  /**
   * Check for deprecated properties
   */
  private async checkDeprecatedProperties(resourceType: string, pathParts: string[]): Promise<string[]> {
    const warnings: string[] = [];
    
    // This would be enhanced with actual FHIR deprecation data from ModelProvider
    const deprecatedProperties: Record<string, string[]> = {
      'Patient': ['animal', 'contact.organization'], // Example deprecated properties
      'Observation': ['related'], // Example deprecated property
    };
    
    const resourceDeprecated = deprecatedProperties[resourceType] || [];
    const currentPath = pathParts.join('.');
    
    for (const deprecatedPath of resourceDeprecated) {
      if (currentPath === deprecatedPath || currentPath.startsWith(deprecatedPath + '.')) {
        warnings.push(`Property '${deprecatedPath}' is deprecated in FHIR R4`);
      }
    }
    
    return warnings;
  }

  /**
   * Check cardinality constraints
   */
  private async checkCardinalityConstraints(expr: Expression, pathParts: string[], finalType: TypeInfo): Promise<string[]> {
    const issues: string[] = [];
    
    // Check for .single() on multi-cardinality properties
    if (expr.text.includes('.single()') && !finalType.singleton) {
      const propertyPath = pathParts.join('.');
      issues.push(`Using single() on multi-cardinality property '${propertyPath}' may cause runtime errors`);
    }
    
    // Check for missing cardinality handling on collections
    if (!finalType.singleton && !this.hasCardinalityHandling(expr.text)) {
      const propertyPath = pathParts.join('.');
      issues.push(`Property '${propertyPath}' is a collection. Consider using first(), single(), or exists() to handle cardinality`);
    }
    
    return issues;
  }

  /**
   * Check if expression has cardinality handling
   */
  private hasCardinalityHandling(expression: string): boolean {
    const cardinalityFunctions = ['.first()', '.single()', '.last()', '.exists()', '.count()', '.where('];
    return cardinalityFunctions.some(func => expression.includes(func));
  }

  /**
   * Check for missing required properties
   */
  private async checkRequiredProperties(expr: Expression, resourceType: string, pathParts: string[]): Promise<string[]> {
    const suggestions: string[] = [];
    
    // This would be enhanced with actual FHIR required property data
    const requiredProperties: Record<string, string[]> = {
      'Patient': ['identifier'],
      'Observation': ['status', 'code'],
      'Condition': ['subject', 'code'],
    };
    
    const required = requiredProperties[resourceType] || [];
    
    // If we're accessing a resource but not checking required properties, suggest them
    if (pathParts.length === 1 && required.length > 0) {
      const accessedProperty = pathParts[0];
      const unmentionedRequired = required.filter(prop => prop !== accessedProperty && !expr.text.includes(prop));
      
      if (unmentionedRequired.length > 0) {
        suggestions.push(`Consider validating required properties: ${unmentionedRequired.join(', ')}`);
      }
    }
    
    return suggestions;
  }

  /**
   * Generate intelligent property suggestions
   */
  private async generatePropertySuggestions(resourceType: string, pathParts: string[]): Promise<string[]> {
    const suggestions: string[] = [];
    
    if (!this.config.enablePropertySuggestions) {
      return suggestions;
    }
    
    try {
      // Get available properties for the resource type
      const typeInfo = await this.modelProviderService.getModelProvider()?.getType(resourceType);
      if (!typeInfo) {
        return suggestions;
      }
      
      const availableProperties = await this.modelProviderService.getModelProvider()?.getElementNames(typeInfo) || [];
      const invalidProperty = pathParts[pathParts.length - 1];
      
      // Find similar property names using string similarity
      const similarProperties = availableProperties
        .filter(prop => this.calculateSimilarity(invalidProperty.toLowerCase(), prop.toLowerCase()) > this.config.similarityThreshold)
        .sort((a, b) => {
          const similarityA = this.calculateSimilarity(invalidProperty.toLowerCase(), a.toLowerCase());
          const similarityB = this.calculateSimilarity(invalidProperty.toLowerCase(), b.toLowerCase());
          return similarityB - similarityA;
        })
        .slice(0, this.config.maxSuggestions);
      
      similarProperties.forEach(prop => {
        const correctedPath = [...pathParts.slice(0, -1), prop].join('.');
        const fullPath = correctedPath ? `${resourceType}.${correctedPath}` : `${resourceType}.${prop}`;
        suggestions.push(`Did you mean: ${fullPath}?`);
      });
      
      // Add context-specific suggestions
      if (suggestions.length === 0) {
        // Suggest commonly used properties if no similar ones found
        const commonProperties = this.getCommonProperties(resourceType);
        commonProperties.slice(0, 3).forEach(prop => {
          suggestions.push(`Common property: ${resourceType}.${prop}`);
        });
      }
      
    } catch (error) {
      console.warn('Property suggestion generation failed:', error);
    }
    
    return suggestions;
  }

  /**
   * Get commonly used properties for a resource type
   */
  private getCommonProperties(resourceType: string): string[] {
    const commonPropertiesMap: Record<string, string[]> = {
      'Patient': ['id', 'identifier', 'name', 'birthDate', 'gender', 'active'],
      'Observation': ['id', 'status', 'code', 'subject', 'value', 'effectiveDateTime'],
      'Condition': ['id', 'subject', 'code', 'clinicalStatus', 'verificationStatus'],
      'Medication': ['id', 'code', 'form', 'ingredient'],
      'Practitioner': ['id', 'identifier', 'name', 'qualification'],
    };
    
    return commonPropertiesMap[resourceType] || ['id'];
  }

  /**
   * Validate expression context appropriateness
   */
  private async validateExpressionContext(
    expr: Expression,
    lineOffset: number,
    columnOffset: number
  ): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];
    
    if (!this.config.enableContextValidation) {
      return diagnostics;
    }
    
    try {
      // Determine expected context from document or configuration
      const expectedContext = this.determineExpectedContext(expr);
      if (!expectedContext) {
        return diagnostics;
      }
      
      // Analyze expression compatibility with context
      const compatibility = await this.analyzeContextCompatibility(expr.text, expectedContext);
      
      if (!compatibility.isCompatible) {
        const range = this.createRange(
          lineOffset + expr.line,
          columnOffset + expr.column,
          lineOffset + expr.line,
          columnOffset + expr.column + expr.length
        );
        
        const diagnostic = this.createDiagnostic(
          DiagnosticSeverity.Warning,
          range,
          `Expression may not be appropriate for ${expectedContext.resourceType} context: ${compatibility.reason}`,
          'context-mismatch',
          'fhirpath-context-validator'
        );
        
        diagnostic.data = {
          expectedContext,
          suggestions: compatibility.suggestions
        };
        
        diagnostics.push(diagnostic);
      }
      
    } catch (error) {
      console.warn('Context validation failed:', error);
    }
    
    return diagnostics;
  }

  /**
   * Determine expected context for expression
   */
  private determineExpectedContext(expr: Expression): ExpressionContext | undefined {
    // Extract resource type from expression pattern
    const resourceMatch = expr.text.match(/^([A-Z]\w+)\b/);
    if (resourceMatch) {
      return {
        resourceType: resourceMatch[1]
      };
    }
    
    // Could be enhanced to use document context, configuration, etc.
    return undefined;
  }

  /**
   * Analyze context compatibility
   */
  private async analyzeContextCompatibility(
    expression: string,
    context: ExpressionContext
  ): Promise<CompatibilityResult> {
    try {
      if (!context.resourceType || !this.modelProviderService?.isInitialized()) {
        return { isCompatible: true };
      }
      
      // Get type information for context
      const resourceTypeInfo = await this.modelProviderService.getModelProvider()?.getType(context.resourceType);
      if (!resourceTypeInfo) {
        return { isCompatible: true };
      }
      
      // Analyze expression with context
      const analysis = await this.fhirPathService.analyzeWithContext(expression, {
        inputType: resourceTypeInfo,
        errorRecovery: true
      });
      
      // Check if expression can be evaluated in the given context
      if (analysis?.diagnostics) {
        const contextErrors = analysis.diagnostics.filter(d => this.isContextError(d));
        if (contextErrors.length > 0) {
          return {
            isCompatible: false,
            reason: contextErrors[0].message,
            suggestions: this.generateContextSuggestions(expression, context)
          };
        }
      }
      
      // Additional context-specific validations
      const contextIssues = await this.checkContextSpecificIssues(expression, context);
      if (contextIssues.length > 0) {
        return {
          isCompatible: false,
          reason: contextIssues[0],
          suggestions: this.generateContextSuggestions(expression, context)
        };
      }
      
      return { isCompatible: true };
      
    } catch (error) {
      console.warn('Context compatibility analysis failed:', error);
      return { isCompatible: true };
    }
  }

  /**
   * Check if an error is context-related
   */
  private isContextError(error: any): boolean {
    if (!error?.message) {
      return false;
    }
    
    const contextErrorPatterns = [
      /not found in context/i,
      /invalid context/i,
      /context mismatch/i,
      /unknown property/i
    ];
    
    return contextErrorPatterns.some(pattern => pattern.test(error.message));
  }

  /**
   * Check for context-specific issues
   */
  private async checkContextSpecificIssues(expression: string, context: ExpressionContext): Promise<string[]> {
    const issues: string[] = [];
    
    if (!context.resourceType) {
      return issues;
    }
    
    // Check for resource type mismatches
    const resourceMatch = expression.match(/^([A-Z]\w+)\b/);
    if (resourceMatch && resourceMatch[1] !== context.resourceType) {
      issues.push(`Expression starts with '${resourceMatch[1]}' but context expects '${context.resourceType}'`);
    }
    
    // Check for inappropriate function usage in specific contexts
    if (context.resourceType === 'Patient') {
      if (expression.includes('component.') && !expression.includes('Observation')) {
        issues.push('component property is not available on Patient resources');
      }
    }
    
    return issues;
  }

  /**
   * Generate context-specific suggestions
   */
  private generateContextSuggestions(expression: string, context: ExpressionContext): string[] {
    const suggestions: string[] = [];
    
    if (!context.resourceType) {
      return suggestions;
    }
    
    // Suggest correct resource type if mismatch
    const resourceMatch = expression.match(/^([A-Z]\w+)\b/);
    if (resourceMatch && resourceMatch[1] !== context.resourceType) {
      const correctedExpression = expression.replace(resourceMatch[1], context.resourceType);
      suggestions.push(`Use '${correctedExpression}' for ${context.resourceType} context`);
    }
    
    // Suggest common patterns for the resource type
    const commonPatterns = this.getCommonPatternsForResource(context.resourceType);
    commonPatterns.slice(0, 2).forEach(pattern => {
      suggestions.push(`Common pattern: ${pattern}`);
    });
    
    return suggestions.slice(0, this.config.maxSuggestions);
  }

  /**
   * Get common expression patterns for a resource type
   */
  private getCommonPatternsForResource(resourceType: string): string[] {
    const patterns: Record<string, string[]> = {
      'Patient': [
        'Patient.active = true',
        'Patient.name.exists()',
        'Patient.identifier.where(system = "MRN")'
      ],
      'Observation': [
        'Observation.status = "final"',
        'Observation.value.exists()',
        'Observation.code.coding.exists()'
      ],
      'Condition': [
        'Condition.clinicalStatus.coding.code = "active"',
        'Condition.verificationStatus.exists()',
        'Condition.onset.exists()'
      ]
    };
    
    return patterns[resourceType] || [];
  }

  /**
   * Batch validation for performance optimization
   */
  public async validateBatch(expressions: Expression[]): Promise<Map<string, Diagnostic[]>> {
    const results = new Map<string, Diagnostic[]>();
    
    if (!this.config.enablePerformanceOptimizations) {
      // Fall back to individual validation
      for (const expr of expressions) {
        const diagnostics = await this.validate(null as any, expr.text);
        results.set(expr.id || expr.text, diagnostics);
      }
      return results;
    }
    
    try {
      // Group expressions by resource type for efficient validation
      const expressionsByType = this.groupExpressionsByResourceType(expressions);
      
      for (const [resourceType, typeExpressions] of expressionsByType) {
        // Pre-load type information for the resource type
        await this.preloadTypeInfo(resourceType);
        
        // Validate all expressions for this type
        for (const expr of typeExpressions) {
          // Check cache first
          const cached = this.getCachedValidation(expr.text);
          if (cached) {
            results.set(expr.id || expr.text, cached);
            continue;
          }
          
          // Validate and cache
          const diagnostics = await this.validate(null as any, expr.text);
          results.set(expr.id || expr.text, diagnostics);
          this.cacheValidation(expr.text, diagnostics);
        }
      }
      
    } catch (error) {
      console.warn('Batch validation failed:', error);
      // Fall back to individual validation
      for (const expr of expressions) {
        const diagnostics = await this.validate(null as any, expr.text);
        results.set(expr.id || expr.text, diagnostics);
      }
    }
    
    return results;
  }

  /**
   * Group expressions by resource type for batch processing
   */
  private groupExpressionsByResourceType(expressions: Expression[]): Map<string, Expression[]> {
    const grouped = new Map<string, Expression[]>();
    
    for (const expr of expressions) {
      const resourceMatch = expr.text.match(/^([A-Z]\w+)\b/);
      const resourceType = resourceMatch ? resourceMatch[1] : 'unknown';
      
      if (!grouped.has(resourceType)) {
        grouped.set(resourceType, []);
      }
      grouped.get(resourceType)!.push(expr);
    }
    
    return grouped;
  }

  /**
   * Pre-load type information for a resource type
   */
  private async preloadTypeInfo(resourceType: string): Promise<void> {
    if (!this.modelProviderService?.isInitialized()) {
      return;
    }
    
    try {
      // Pre-load type information to improve batch performance
      await this.modelProviderService.getModelProvider()?.getType(resourceType);
      
      // Pre-load common enhanced type info
      await this.modelProviderService.getEnhancedTypeInfo(resourceType);
      
    } catch (error) {
      console.warn(`Failed to preload type info for ${resourceType}:`, error);
    }
  }
}