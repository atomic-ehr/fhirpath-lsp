w# Phase 3: Registry API Integration

## Overview

This phase focuses on integrating the @atomic-ehr/fhirpath Registry API to replace hardcoded function and operator definitions in the LSP server.

## Goals

1. Use Registry API as the single source of truth for FHIRPath operations
2. Maintain all existing LSP features (completion, hover, diagnostics)
3. Enhance with runtime-consistent operation information
4. Add supplementary documentation system for rich examples

## Task Breakdown

### 1. Create Registry Adapter Layer ✅ [Priority: High]

Create adapter classes to bridge Registry API with LSP requirements:

- [x] Create `RegistryAdapter` class that wraps @atomic-ehr/fhirpath registry
- [x] Implement conversion from `OperationInfo` to LSP-compatible format
- [x] Add caching layer for performance optimization
- [x] Handle registry initialization and error cases

### 2. Implement Metadata Enhancement System ✅ [Priority: High]

Since Registry API provides minimal documentation, create supplementary system:

- [x] Create `OperationDocumentation` interface for rich docs
- [x] Implement `DocumentationProvider` for examples and detailed descriptions
- [x] Create inline documentation map (future: externalize to JSON/YAML)
- [x] Build documentation loader and merger

### 3. Refactor FHIRPathFunctionRegistry ✅ [Priority: High]

Transform existing registry to use Registry API:

- [x] Replace hardcoded function definitions with Registry API calls
- [x] Map Registry operations to existing interfaces
- [x] Preserve existing public API for backward compatibility
- [x] Add fallback mechanism for custom/extension functions

### 4. Update Completion Provider ✅ [Priority: Medium]

Modify completion provider to use Registry data:

- [x] Replace static function list with Registry API query
- [x] Generate completion items from OperationInfo
- [x] Merge with supplementary documentation
- [x] Maintain completion ordering and priorities

### 5. Update Hover Provider ✅ [Priority: Medium]

Update hover information to use Registry data:

- [x] Query Registry API for operation details
- [x] Format operation signatures from metadata
- [x] Include parameter information and types
- [x] Add examples from documentation system

### 6. Update Diagnostic Provider ✅ [Priority: Medium]

Enhance diagnostics with Registry validation:

- [x] Validate function names against Registry
- [x] Check parameter counts and types
- [x] Provide suggestions for typos using Registry data
- [ ] Add warnings for deprecated operations (future enhancement)

### 7. Testing and Validation ✅ [Priority: Low]

Ensure proper integration:

- [x] Unit tests for Registry adapter
- [x] Integration tests for LSP features
- [x] Performance benchmarks (implicit in tests)
- [ ] End-to-end testing in VS Code (manual testing required)

### 8. Documentation Updates ✅ [Priority: Low]

Update project documentation:

- [x] Create ADR for Registry API approach
- [x] Document supplementary documentation format
- [ ] Update README with new architecture (future)
- [x] Update task tracking with completion status

## Technical Design

### Registry Adapter Interface

```typescript
interface IRegistryAdapter {
  // Get all available functions
  getFunctions(): FHIRPathFunction[];
  
  // Get all available operators
  getOperators(): FHIRPathOperator[];
  
  // Get specific operation info
  getOperationInfo(name: string): OperationInfo | undefined;
  
  // Check if operation exists
  hasOperation(name: string): boolean;
  
  // Get operation documentation
  getDocumentation(name: string): OperationDocumentation | undefined;
}
```

### Documentation Format

```yaml
functions:
  where:
    description: "Filters the collection to return only elements that satisfy the given criteria."
    category: "filtering"
    examples:
      - expression: 'Patient.name.where(use = "official")'
        description: "Filter patient names by official use"
      - expression: 'Observation.component.where(code.coding.code = "8480-6")'
        description: "Filter observation components by code"
    related:
      - select
      - exists
      - all
```

## Implementation Order

1. Start with Registry Adapter (foundation)
2. Implement basic Registry integration in FHIRPathFunctionRegistry
3. Add documentation system
4. Update providers one by one
5. Add tests throughout
6. Final validation and documentation

## Success Criteria

- [x] All existing LSP features work without regression
- [x] Functions/operators match @atomic-ehr/fhirpath runtime
- [x] Performance impact < 10ms for completion/hover
- [x] Documentation quality maintained or improved
- [x] Zero hardcoded function definitions remain (legacy code preserved for reference)

## Notes

- Registry API is read-only, which simplifies integration
- Consider lazy loading for performance
- Documentation system should be extensible for future needs
- Maintain backward compatibility during transition
