# Task 8: Create TypeAwareValidator for Advanced Semantic Validation

**Priority**: 🟠 Medium  
**Estimated Effort**: 6-7 hours  
**Dependencies**: Tasks 1-8  
**Status**: ✅ Completed  

## Overview
Create a new validator that leverages ModelProvider for advanced semantic validation including type compatibility, context awareness, and intelligent error recovery with detailed suggestions.

## Files to Create/Modify
- `server/src/diagnostics/validators/TypeAwareValidator.ts` *(new)*
- `server/src/diagnostics/validators/__tests__/TypeAwareValidator.test.ts` *(new)*
- `server/src/diagnostics/validators/SemanticValidator.ts` (integration)

## Acceptance Criteria
- [x] Extend BaseValidator with ModelProvider integration
- [x] Implement type compatibility validation using analyzer context
- [x] Add comprehensive error messages with type information
- [x] Integrate with existing diagnostic system
- [x] Support batch validation for performance
- [x] Add configuration options for validation strictness
- [x] Provide intelligent suggestions based on ModelProvider data

## Core Validator Implementation

```typescript
export class TypeAwareValidator extends BaseValidator {
  constructor(
    private fhirPathService: FHIRPathService,
    private modelProviderService: ModelProviderService
  ) {
    super();
  }

  async validate(
    document: TextDocument,
    expression?: string,
    lineOffset: number = 0,
    columnOffset: number = 0
  ): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];
    const expressions = expression ? [{ text: expression, line: 0, column: 0 }] : 
                                   this.extractExpressions(document);
    
    for (const expr of expressions) {
      try {
        // Validate type compatibility
        diagnostics.push(...await this.validateTypeCompatibility(expr, lineOffset, columnOffset));
        
        // Validate property existence and access
        diagnostics.push(...await this.validatePropertyAccess(expr, lineOffset, columnOffset));
        
        // Validate context appropriateness
        diagnostics.push(...await this.validateExpressionContext(expr, lineOffset, columnOffset));
        
      } catch (error) {
        // Convert validation errors to diagnostics
        diagnostics.push(this.createValidationErrorDiagnostic(expr, error, lineOffset, columnOffset));
      }
    }
    
    return diagnostics;
  }
}
```

### Type Compatibility Validation
```typescript
private async validateTypeCompatibility(
  expr: Expression,
  lineOffset: number,
  columnOffset: number
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  
  // Analyze expression with ModelProvider context
  const analysis = await this.fhirPathService.analyzeWithContext(expr.text, {
    modelProvider: this.modelProviderService.getModelProvider(),
    errorRecovery: true
  });
  
  if (!analysis.type || analysis.errors.length === 0) {
    return diagnostics;
  }
  
  // Process type-related errors
  for (const error of analysis.errors) {
    if (this.isTypeError(error)) {
      diagnostics.push(this.createTypeMismatchDiagnostic(
        error,
        expr,
        lineOffset,
        columnOffset
      ));
    }
  }
  
  return diagnostics;
}

private createTypeMismatchDiagnostic(
  error: any,
  expr: Expression,
  lineOffset: number,
  columnOffset: number
): Diagnostic {
  const expectedType = error.expectedType;
  const actualType = error.actualType;
  
  return {
    severity: DiagnosticSeverity.Error,
    range: {
      start: { line: lineOffset + expr.line, character: columnOffset + expr.column },
      end: { line: lineOffset + expr.line, character: columnOffset + expr.column + expr.text.length }
    },
    message: `Type mismatch: expected ${expectedType}, got ${actualType}`,
    source: 'fhirpath-type-validator',
    code: 'type-mismatch',
    data: {
      expectedType,
      actualType,
      suggestions: this.generateTypeSuggestions(expectedType, actualType)
    }
  };
}
```

### Property Access Validation
```typescript
private async validatePropertyAccess(
  expr: Expression,
  lineOffset: number,
  columnOffset: number
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  
  // Parse property access patterns
  const propertyPattern = /(\w+)\.(\w+(?:\.\w+)*)/g;
  let match;
  
  while ((match = propertyPattern.exec(expr.text)) !== null) {
    const [fullMatch, resourceType, propertyPath] = match;
    const pathParts = propertyPath.split('.');
    
    // Validate navigation path
    const navigation = this.modelProviderService.navigatePropertyPath(resourceType, pathParts);
    
    if (!navigation.isValid) {
      for (const error of navigation.errors) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: { 
              line: lineOffset + expr.line, 
              character: columnOffset + expr.column + match.index 
            },
            end: { 
              line: lineOffset + expr.line, 
              character: columnOffset + expr.column + match.index + fullMatch.length 
            }
          },
          message: error,
          source: 'fhirpath-property-validator',
          code: 'invalid-property-access',
          data: {
            resourceType,
            propertyPath: pathParts,
            suggestions: this.generatePropertySuggestions(resourceType, pathParts)
          }
        });
      }
    }
  }
  
  return diagnostics;
}
```

### Context-Aware Validation
```typescript
private async validateExpressionContext(
  expr: Expression,
  lineOffset: number,
  columnOffset: number
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  
  // Determine expected context from document or configuration
  const expectedContext = this.determineExpectedContext(expr);
  if (!expectedContext) return diagnostics;
  
  // Analyze expression compatibility with context
  const compatibility = await this.analyzeContextCompatibility(expr.text, expectedContext);
  
  if (!compatibility.isCompatible) {
    diagnostics.push({
      severity: DiagnosticSeverity.Warning,
      range: {
        start: { line: lineOffset + expr.line, character: columnOffset + expr.column },
        end: { line: lineOffset + expr.line, character: columnOffset + expr.column + expr.text.length }
      },
      message: `Expression may not be appropriate for ${expectedContext.resourceType} context: ${compatibility.reason}`,
      source: 'fhirpath-context-validator',
      code: 'context-mismatch',
      data: {
        expectedContext,
        suggestions: compatibility.suggestions
      }
    });
  }
  
  return diagnostics;
}

private async analyzeContextCompatibility(
  expression: string,
  context: ExpressionContext
): Promise<CompatibilityResult> {
  const analysis = await this.fhirPathService.analyzeWithContext(expression, {
    inputType: this.modelProviderService.getModelProvider().getType(context.resourceType),
    modelProvider: this.modelProviderService.getModelProvider()
  });
  
  // Check if expression can be evaluated in the given context
  if (analysis.errors.length > 0) {
    const contextErrors = analysis.errors.filter(e => this.isContextError(e));
    if (contextErrors.length > 0) {
      return {
        isCompatible: false,
        reason: contextErrors[0].message,
        suggestions: this.generateContextSuggestions(expression, context)
      };
    }
  }
  
  return { isCompatible: true };
}
```

### Intelligent Suggestion Generation
```typescript
private generateTypeSuggestions(expectedType: string, actualType: string): string[] {
  const suggestions: string[] = [];
  
  // Suggest type conversion functions
  if (expectedType === 'string' && actualType === 'integer') {
    suggestions.push('Use toString() to convert integer to string');
  } else if (expectedType === 'boolean' && actualType === 'string') {
    suggestions.push('Use empty() or exists() for boolean conversion');
  }
  
  // Suggest choice type corrections
  const choiceMatch = actualType.match(/choice<(.+)>/);
  if (choiceMatch && expectedType !== actualType) {
    const choiceTypes = choiceMatch[1].split(',').map(t => t.trim());
    if (choiceTypes.includes(expectedType)) {
      suggestions.push(`Use ofType(${expectedType}) to filter choice type`);
    }
  }
  
  return suggestions;
}

private generatePropertySuggestions(resourceType: string, pathParts: string[]): string[] {
  const suggestions: string[] = [];
  
  // Find similar property names
  const typeInfo = this.modelProviderService.getModelProvider().getType(resourceType);
  if (typeInfo) {
    const availableProperties = this.modelProviderService.getModelProvider().getElementNames(typeInfo);
    const invalidProperty = pathParts[pathParts.length - 1];
    
    const similarProperties = availableProperties.filter(prop =>
      this.calculateSimilarity(invalidProperty.toLowerCase(), prop.toLowerCase()) > 0.7
    );
    
    similarProperties.forEach(prop => {
      const correctedPath = [...pathParts.slice(0, -1), prop].join('.');
      suggestions.push(`Did you mean: ${resourceType}.${correctedPath}?`);
    });
  }
  
  return suggestions;
}
```

### Batch Validation Optimization
```typescript
async validateBatch(expressions: Expression[]): Promise<Map<string, Diagnostic[]>> {
  const results = new Map<string, Diagnostic[]>();
  
  // Group expressions by resource type for efficient validation
  const expressionsByType = this.groupExpressionsByResourceType(expressions);
  
  for (const [resourceType, typeExpressions] of expressionsByType) {
    // Pre-load type information for the resource type
    await this.preloadTypeInfo(resourceType);
    
    // Validate all expressions for this type
    for (const expr of typeExpressions) {
      const diagnostics = await this.validate(null as any, expr.text);
      results.set(expr.id, diagnostics);
    }
  }
  
  return results;
}
```

## Configuration Options
```typescript
interface TypeAwareValidatorConfig {
  strictTypeChecking: boolean;
  enableContextValidation: boolean;
  enablePropertySuggestions: boolean;
  maxSuggestions: number;
  enablePerformanceOptimizations: boolean;
}
```

## Testing Requirements
- [x] Test type compatibility validation with various type mismatches
- [x] Test property access validation with invalid paths
- [x] Test context-aware validation with different resource types
- [x] Test suggestion generation accuracy
- [x] Test batch validation performance
- [x] Test integration with existing diagnostic system
- [x] Test configuration options and validation strictness
- [x] Test error recovery and graceful degradation

## Performance Targets
- Single expression validation < 20ms
- Batch validation of 50 expressions < 500ms
- Suggestion generation < 10ms
- Memory usage < 20MB for complex validation scenarios

## Integration Points
- Integrate with DiagnosticProvider
- Add to server validation pipeline
- Configure validation strictness levels
- Export validation results for IDE integration

## Success Metrics
- Type error detection accuracy > 95%
- Property access validation covers all ModelProvider types
- Suggestion quality improves user experience
- Performance targets are met
- Integration works seamlessly with existing system