# ADR-003: Use Registry API from @atomic-ehr/fhirpath for Functions and Operators

## Status

Proposed

## Context

The FHIRPath LSP server currently hardcodes all FHIRPath functions, operators, and keywords in the `FHIRPathFunctionRegistry` class. This approach has several limitations:

1. **Duplication of Knowledge**: The same function and operator definitions exist in both the @atomic-ehr/fhirpath package and the LSP server
2. **Maintenance Burden**: Any changes to FHIRPath functions/operators require updates in multiple places
3. **Potential Inconsistencies**: The LSP might provide completions or hover information that doesn't match the actual runtime behavior
4. **Missing Features**: The hardcoded registry doesn't include all operations available in the FHIRPath engine

The @atomic-ehr/fhirpath package provides a Registry API that exposes:
- Complete list of functions and operators
- Operation metadata including syntax, parameters, and types
- Runtime-consistent information about available operations

## Decision

We will refactor the LSP server to use the Registry API from @atomic-ehr/fhirpath instead of maintaining a hardcoded list of functions and operators.

### Implementation Strategy

1. **Replace FHIRPathFunctionRegistry**: Transform it from a hardcoded registry to an adapter that uses the @atomic-ehr/fhirpath Registry API
2. **Map Registry Data**: Convert OperationInfo/OperationMetadata to the format expected by LSP providers
3. **Enhance Metadata**: Add LSP-specific information (documentation, examples) through a supplementary metadata system
4. **Maintain Backward Compatibility**: Ensure all existing LSP features continue to work

## Consequences

### Positive

- **Single Source of Truth**: Function and operator definitions come from the actual FHIRPath engine
- **Automatic Updates**: New functions/operators in @atomic-ehr/fhirpath are automatically available in the LSP
- **Consistency**: LSP suggestions match runtime behavior exactly
- **Reduced Maintenance**: No need to manually update function definitions in the LSP
- **Better Coverage**: Access to all operations registered in the FHIRPath engine

### Negative

- **Runtime Dependency**: LSP server must load the @atomic-ehr/fhirpath registry at startup
- **Performance Impact**: Small overhead for querying the registry API
- **Limited Customization**: LSP-specific metadata (examples, detailed docs) needs a separate mechanism
- **API Changes**: Future changes to the Registry API might require LSP updates

### Neutral

- **Documentation Strategy**: We'll need a supplementary system for rich documentation and examples
- **Testing Requirements**: Need to ensure Registry API data maps correctly to LSP features

## Implementation Plan

1. Create adapter classes to convert Registry API data to LSP formats
2. Implement metadata enhancement system for documentation and examples
3. Update CompletionProvider to use Registry API
4. Update HoverProvider to use Registry API
5. Update DiagnosticProvider to validate against Registry API
6. Add tests to ensure proper integration
7. Remove hardcoded function/operator definitions