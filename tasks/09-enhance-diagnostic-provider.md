# Task 9: Enhance DiagnosticProvider with ModelProvider

**Priority**: 🟡 High  
**Estimated Effort**: 4-5 hours  
**Dependencies**: Tasks 1-4, 8  
**Status**: ✅ Completed  

## Overview
Upgrade the DiagnosticProvider to leverage ModelProvider for enhanced type-aware validation, choice type checking, and semantic error reporting.

## Files to Modify
- `server/src/providers/DiagnosticProvider.ts`
- `server/src/providers/__tests__/DiagnosticProvider.test.ts`

## Acceptance Criteria
- [x] Integrate ModelProviderService for type validation
- [x] Add choice type validation (e.g., value[x] fields)
- [x] Implement inheritance-aware property checking
- [x] Enhance error messages with type information
- [x] Add constraint validation from FHIR profiles
- [x] Implement deep property path validation
- [x] Add cardinality and required field checking

## Enhanced Diagnostic Features

### Type-Aware Validation
```typescript
interface TypeAwareDiagnostic {
  code: string;
  message: string;
  severity: DiagnosticSeverity;
  typeInfo?: TypeInfo;
  suggestedFix?: string;
  choiceTypes?: string[];
}
```

### Implementation Plan
```typescript
class EnhancedDiagnosticProvider {
  constructor(
    private modelProviderService: ModelProviderService,
    private typeAwareValidator: TypeAwareValidator
  ) {}

  async validateWithTypeInfo(
    document: TextDocument, 
    context: ResourceContext
  ): Promise<TypeAwareDiagnostic[]>
  
  private validateChoiceTypes(path: string, value: any): Diagnostic[]
  private validateConstraints(typeInfo: TypeInfo, path: string): Diagnostic[]
  private generateTypeSuggestions(expectedType: TypeInfo, actualPath: string): string[]
}
```

## Enhanced Error Messages
- **Before**: "Property 'valueInteger' not found"
- **After**: "Property 'valueInteger' not found. Did you mean 'valueQuantity' or 'valueString'? Available choice types: valueBoolean, valueQuantity, valueString, valueDateTime"

## Testing Requirements
- [ ] Test type-aware validation with various FHIR resources
- [ ] Test choice type validation and suggestions
- [ ] Test inheritance validation (base resource properties)
- [ ] Test constraint validation (cardinality, required fields)
- [ ] Test error message quality and suggestions
- [ ] Performance tests for large documents

## Success Metrics
- 90% reduction in false positive validation errors
- Enhanced error messages with actionable suggestions
- Choice type validation coverage for all FHIR resources
- Maintains validation performance < 200ms per document