import {
  Diagnostic,
  DiagnosticSeverity,
  Range,
  Position
} from 'vscode-languageserver';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { FHIRPathService, ParseResult } from '../../parser/FHIRPathService';
import { ModelProviderService, EnhancedTypeInfo, ChoiceValidationResult } from '../../services/ModelProviderService';
import {
  EnhancedDiagnostic,
  EnhancedDiagnosticCategory,
  DiagnosticImpact,
  EnhancedDiagnosticBuilder,
  TypeAwareDiagnosticInfo,
  ChoiceTypeDiagnostic,
  ConstraintViolation
} from '../EnhancedDiagnosticTypes';

/**
 * Type-aware diagnostic validator that leverages ModelProvider
 * for enhanced FHIR-specific validation
 */
export class TypeAwareDiagnosticValidator {
  constructor(
    private fhirPathService: FHIRPathService,
    private modelProviderService: ModelProviderService
  ) {}

  /**
   * Validate a FHIRPath expression with type awareness
   */
  async validateWithTypeInfo(
    expression: string,
    document: TextDocument,
    resourceType?: string,
    line: number = 0
  ): Promise<EnhancedDiagnostic[]> {
    const diagnostics: EnhancedDiagnostic[] = [];

    try {
      // Parse the expression to get AST
      const parseResult = this.fhirPathService.parse(expression);
      
      if (!parseResult.success) {
        // Return syntax errors as type-aware diagnostics
        return this.convertSyntaxErrors(parseResult, line);
      }

      // Validate choice types
      const choiceDiagnostics = await this.validateChoiceTypes(expression, resourceType, line);
      diagnostics.push(...choiceDiagnostics);

      // Validate property paths
      const pathDiagnostics = await this.validatePropertyPaths(expression, resourceType, line);
      diagnostics.push(...pathDiagnostics);

      // Validate inheritance and constraints
      const constraintDiagnostics = await this.validateConstraints(expression, resourceType, line);
      diagnostics.push(...constraintDiagnostics);

      // Validate cardinality
      const cardinalityDiagnostics = await this.validateCardinality(expression, resourceType, line);
      diagnostics.push(...cardinalityDiagnostics);

    } catch (error) {
      console.error('Type-aware validation error:', error);
    }

    return diagnostics;
  }

  /**
   * Validate choice type properties (value[x] fields)
   */
  private async validateChoiceTypes(
    expression: string,
    resourceType?: string,
    line: number = 0
  ): Promise<ChoiceTypeDiagnostic[]> {
    const diagnostics: ChoiceTypeDiagnostic[] = [];

    if (!resourceType || !this.modelProviderService) {
      return diagnostics;
    }

    // Pattern to match potential choice type properties
    const choicePattern = /(\w+)\.(\w*value\w*)/g;
    let match;

    while ((match = choicePattern.exec(expression)) !== null) {
      const [fullMatch, parentProperty, property] = match;
      const start = match.index;
      const end = start + fullMatch.length;

      try {
        // Check if this is a valid choice type
        const validationResult = await this.modelProviderService.validateChoiceProperty(
          resourceType,
          parentProperty,
          property
        );

        if (!validationResult.isValid && validationResult.validChoices?.length) {
          const range = Range.create(
            Position.create(line, start),
            Position.create(line, end)
          );

          const suggestedChoice = this.findBestChoiceMatch(property, validationResult.validChoices);
          
          const diagnostic: ChoiceTypeDiagnostic = {
            ...EnhancedDiagnosticBuilder
              .create('choice-type-invalid', EnhancedDiagnosticCategory.ChoiceTypes)
              .withMessage(this.createChoiceTypeErrorMessage(property, validationResult.validChoices, suggestedChoice))
              .withRange(range)
              .withSeverity(DiagnosticSeverity.Error)
              .withImpact(DiagnosticImpact.High)
              .withSuggestion(`Use one of the valid choice types: ${validationResult.validChoices.join(', ')}`)
              .build(),
            choiceInfo: {
              baseProperty: parentProperty,
              availableChoices: validationResult.validChoices,
              suggestedChoice,
              actualProperty: property
            }
          };

          if (suggestedChoice) {
            diagnostic.quickFix = {
              title: `Change to '${suggestedChoice}'`,
              newText: fullMatch.replace(property, suggestedChoice),
              range
            };
          }

          diagnostics.push(diagnostic);
        }
      } catch (error) {
        console.error('Choice type validation error:', error);
      }
    }

    return diagnostics;
  }

  /**
   * Validate property paths for existence and type correctness
   */
  private async validatePropertyPaths(
    expression: string,
    resourceType?: string,
    line: number = 0
  ): Promise<EnhancedDiagnostic[]> {
    const diagnostics: EnhancedDiagnostic[] = [];

    if (!resourceType || !this.modelProviderService) {
      return diagnostics;
    }

    // Extract property paths from the expression
    const propertyPaths = this.extractPropertyPaths(expression);

    for (const pathInfo of propertyPaths) {
      try {
        const navigationResult = await this.modelProviderService.navigatePropertyPath(
          resourceType,
          pathInfo.path
        );

        if (!navigationResult.isValid) {
          const range = Range.create(
            Position.create(line, pathInfo.start),
            Position.create(line, pathInfo.end)
          );

          const suggestedProperty = this.findBestPropertyMatch(
            pathInfo.path[pathInfo.path.length - 1],
            navigationResult.availableProperties
          );

          const typeInfo: TypeAwareDiagnosticInfo = {
            resourceType,
            propertyPath: pathInfo.path,
            suggestedProperty,
            availableChoices: navigationResult.availableProperties
          };

          const diagnostic = EnhancedDiagnosticBuilder
            .create('property-not-found', EnhancedDiagnosticCategory.TypeSafety)
            .withMessage(this.createPropertyNotFoundMessage(pathInfo.path, navigationResult.availableProperties, suggestedProperty))
            .withRange(range)
            .withSeverity(DiagnosticSeverity.Error)
            .withImpact(DiagnosticImpact.High)
            .withSuggestion(suggestedProperty ? `Did you mean '${suggestedProperty}'?` : 'Check available properties')
            .build();

          diagnostic.typeInfo = typeInfo;

          if (suggestedProperty) {
            diagnostic.quickFix = {
              title: `Change to '${suggestedProperty}'`,
              newText: pathInfo.original.replace(pathInfo.path[pathInfo.path.length - 1], suggestedProperty),
              range
            };
            diagnostic.fixable = true;
          }

          diagnostics.push(diagnostic);
        }
      } catch (error) {
        console.error('Property path validation error:', error);
      }
    }

    return diagnostics;
  }

  /**
   * Validate constraints from FHIR profiles
   */
  private async validateConstraints(
    expression: string,
    resourceType?: string,
    line: number = 0
  ): Promise<EnhancedDiagnostic[]> {
    const diagnostics: EnhancedDiagnostic[] = [];

    if (!resourceType || !this.modelProviderService) {
      return diagnostics;
    }

    // This would integrate with profile validation
    // For now, we'll implement basic constraint checking
    const propertyPaths = this.extractPropertyPaths(expression);

    for (const pathInfo of propertyPaths) {
      try {
        const typeInfo = await this.modelProviderService.getEnhancedTypeInfo(
          resourceType,
          pathInfo.path.join('.')
        );

        if (typeInfo?.constraints) {
          const violations = this.checkConstraintViolations(typeInfo, pathInfo);
          
          for (const violation of violations) {
            const range = Range.create(
              Position.create(line, pathInfo.start),
              Position.create(line, pathInfo.end)
            );

            const diagnostic = EnhancedDiagnosticBuilder
              .create('constraint-violation', EnhancedDiagnosticCategory.ConstraintViolation)
              .withMessage(`Constraint violation: ${violation.description}`)
              .withRange(range)
              .withSeverity(DiagnosticSeverity.Warning)
              .withImpact(DiagnosticImpact.Medium)
              .withSuggestion(`Ensure the property meets the constraint: ${violation.description}`)
              .build();

            diagnostic.typeInfo = {
              resourceType,
              propertyPath: pathInfo.path,
              constraints: [violation]
            };

            diagnostics.push(diagnostic);
          }
        }
      } catch (error) {
        console.error('Constraint validation error:', error);
      }
    }

    return diagnostics;
  }

  /**
   * Validate cardinality and required fields
   */
  private async validateCardinality(
    expression: string,
    resourceType?: string,
    line: number = 0
  ): Promise<EnhancedDiagnostic[]> {
    const diagnostics: EnhancedDiagnostic[] = [];

    if (!resourceType || !this.modelProviderService) {
      return diagnostics;
    }

    // Check for required field access patterns
    const requiredFieldPattern = /(\w+)\.(\w+)/g;
    let match;

    while ((match = requiredFieldPattern.exec(expression)) !== null) {
      const [fullMatch, parentProperty, property] = match;
      const start = match.index;
      const end = start + fullMatch.length;

      try {
        const typeInfo = await this.modelProviderService.getEnhancedTypeInfo(
          resourceType,
          `${parentProperty}.${property}`
        );

        if (typeInfo?.constraints.required && this.isOptionalAccess(expression, start)) {
          const range = Range.create(
            Position.create(line, start),
            Position.create(line, end)
          );

          const diagnostic = EnhancedDiagnosticBuilder
            .create('required-field-optional-access', EnhancedDiagnosticCategory.TypeSafety)
            .withMessage(`Property '${property}' is required but accessed optionally`)
            .withRange(range)
            .withSeverity(DiagnosticSeverity.Warning)
            .withImpact(DiagnosticImpact.Medium)
            .withSuggestion(`Property '${property}' is required and should always be present`)
            .build();

          diagnostics.push(diagnostic);
        }
      } catch (error) {
        console.error('Cardinality validation error:', error);
      }
    }

    return diagnostics;
  }

  /**
   * Convert syntax errors to type-aware diagnostics
   */
  private convertSyntaxErrors(parseResult: ParseResult, line: number): EnhancedDiagnostic[] {
    const diagnostics: EnhancedDiagnostic[] = [];

    if (parseResult.errors) {
      for (const error of parseResult.errors) {
        const range = Range.create(
          Position.create(line, error.column || 0),
          Position.create(line, (error.column || 0) + (error.length || 1))
        );

        const diagnostic = EnhancedDiagnosticBuilder
          .create('syntax-error', EnhancedDiagnosticCategory.TypeSafety)
          .withMessage(error.message)
          .withRange(range)
          .withSeverity(DiagnosticSeverity.Error)
          .withImpact(DiagnosticImpact.High)
          .build();

        diagnostics.push(diagnostic);
      }
    }

    return diagnostics;
  }

  /**
   * Extract property paths from expression
   */
  private extractPropertyPaths(expression: string): Array<{
    path: string[];
    original: string;
    start: number;
    end: number;
  }> {
    const paths: Array<{
      path: string[];
      original: string;
      start: number;
      end: number;
    }> = [];

    // Pattern to match property paths like "patient.name.family"
    const pathPattern = /\b(\w+(?:\.\w+)*)\b/g;
    let match;

    while ((match = pathPattern.exec(expression)) !== null) {
      const [fullMatch] = match;
      const start = match.index;
      const end = start + fullMatch.length;
      const path = fullMatch.split('.');

      // Skip single properties and function calls
      if (path.length > 1 && !fullMatch.includes('(')) {
        paths.push({
          path,
          original: fullMatch,
          start,
          end
        });
      }
    }

    return paths;
  }

  /**
   * Find the best matching choice type
   */
  private findBestChoiceMatch(property: string, validChoices: string[]): string | undefined {
    // Simple fuzzy matching - could be enhanced with more sophisticated algorithms
    const lowerProperty = property.toLowerCase();
    
    // Look for exact substring matches first
    const exactMatch = validChoices.find(choice => 
      choice.toLowerCase().includes(lowerProperty.replace('value', ''))
    );
    
    if (exactMatch) return exactMatch;

    // Look for similar patterns
    const similarMatch = validChoices.find(choice => {
      const choiceLower = choice.toLowerCase();
      const similarity = this.calculateSimilarity(lowerProperty, choiceLower);
      return similarity > 0.6;
    });

    return similarMatch;
  }

  /**
   * Find the best matching property name
   */
  private findBestPropertyMatch(property: string, availableProperties: string[]): string | undefined {
    const lowerProperty = property.toLowerCase();
    
    // Look for exact matches first
    const exactMatch = availableProperties.find(prop => 
      prop.toLowerCase() === lowerProperty
    );
    
    if (exactMatch) return exactMatch;

    // Look for similar properties
    const similarMatch = availableProperties.find(prop => {
      const similarity = this.calculateSimilarity(lowerProperty, prop.toLowerCase());
      return similarity > 0.7;
    });

    return similarMatch;
  }

  /**
   * Calculate string similarity using Levenshtein distance
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => 
      Array(str1.length + 1).fill(null)
    );

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Create error message for choice type violations
   */
  private createChoiceTypeErrorMessage(
    property: string,
    validChoices: string[],
    suggestedChoice?: string
  ): string {
    const baseMessage = `Property '${property}' is not a valid choice type.`;
    const suggestionMessage = suggestedChoice 
      ? ` Did you mean '${suggestedChoice}'?`
      : '';
    const availableMessage = ` Available choice types: ${validChoices.join(', ')}`;
    
    return baseMessage + suggestionMessage + availableMessage;
  }

  /**
   * Create error message for property not found
   */
  private createPropertyNotFoundMessage(
    path: string[],
    availableProperties: string[],
    suggestedProperty?: string
  ): string {
    const property = path[path.length - 1];
    const baseMessage = `Property '${property}' not found.`;
    const suggestionMessage = suggestedProperty 
      ? ` Did you mean '${suggestedProperty}'?`
      : '';
    const availableMessage = availableProperties.length > 0
      ? ` Available properties: ${availableProperties.slice(0, 5).join(', ')}${availableProperties.length > 5 ? '...' : ''}`
      : '';
    
    return baseMessage + suggestionMessage + availableMessage;
  }

  /**
   * Check for constraint violations
   */
  private checkConstraintViolations(typeInfo: EnhancedTypeInfo, pathInfo: any): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];

    // Check cardinality constraints
    if (typeInfo.constraints.cardinality && typeInfo.constraints.cardinality !== '0..*') {
      // This would need actual runtime data to validate properly
      // For now, we'll just flag patterns that might violate cardinality
    }

    // Check required field constraints
    if (typeInfo.constraints.required) {
      violations.push({
        type: 'required',
        description: 'This property is required and must be present'
      });
    }

    return violations;
  }

  /**
   * Check if property access is optional (using ? operator or exists())
   */
  private isOptionalAccess(expression: string, position: number): boolean {
    // Look for optional access patterns around the position
    const beforeContext = expression.substring(Math.max(0, position - 20), position);
    const afterContext = expression.substring(position, Math.min(expression.length, position + 20));
    
    return beforeContext.includes('?') || afterContext.includes('exists(') || beforeContext.includes('exists(');
  }
}