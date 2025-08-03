# ADR-005: Enhanced References Provider with ModelProvider Integration

## Status
Accepted

## Context
The existing ReferencesProvider in our FHIRPath Language Server provides basic "Find All References" functionality using symbol matching. However, it lacks FHIR-specific intelligence for:

1. **Choice Type References**: Finding references to value[x] properties across different choice types
2. **Inherited Property References**: Locating references to properties inherited from base FHIR resources
3. **Cross-Resource References**: Finding similar properties across different FHIR resource types
4. **Usage Pattern Analysis**: Understanding how properties are used (filters, selections, conditions, navigation)
5. **Type-Aware Matching**: Leveraging FHIR type information for more accurate reference finding

The current implementation relies solely on string matching and basic symbol compatibility, missing the rich semantic relationships inherent in FHIR data structures.

## Decision
We will enhance the ReferencesProvider with ModelProvider integration to provide intelligent, FHIR-aware reference finding capabilities.

### Key Design Decisions:

1. **Enhanced Reference Types**: Introduce comprehensive reference type system supporting choice types, inherited properties, and usage patterns
2. **ModelProvider Integration**: Leverage ModelProviderService for type-aware reference resolution
3. **Usage Pattern Classification**: Analyze and categorize how properties are used in expressions
4. **Cross-Resource Discovery**: Find semantically related properties across different FHIR resources
5. **Reference Ranking**: Prioritize references by relevance and semantic similarity
6. **Performance Optimization**: Implement efficient workspace-wide reference searching

### Architecture:

```typescript
interface EnhancedReference extends Location {
  type: ReferenceType;
  context: ReferenceContext;
  usage: UsageType;
  metadata?: ReferenceMetadata;
  confidence: number;
}

enum ReferenceType {
  PROPERTY_USAGE = 'propertyUsage',
  CHOICE_TYPE_USAGE = 'choiceTypeUsage', 
  INHERITED_USAGE = 'inheritedUsage',
  FUNCTION_CALL = 'functionCall',
  TYPE_REFERENCE = 'typeReference',
  CONSTRAINT_REFERENCE = 'constraintReference'
}

enum UsageType {
  READ = 'read',
  WRITE = 'write',
  CONDITION = 'condition',
  NAVIGATION = 'navigation'
}
```

## Implementation Strategy

### Phase 1: Enhanced Reference Types
- Create comprehensive reference type system
- Implement reference metadata and confidence scoring
- Add usage pattern detection

### Phase 2: ModelProvider Integration
- Integrate ModelProviderService for type resolution
- Implement choice type reference discovery
- Add inheritance-aware reference lookup

### Phase 3: Advanced Features
- Cross-resource reference finding
- Usage pattern analysis and classification
- Reference ranking and grouping

### Phase 4: Performance & Testing
- Optimize workspace-wide searches
- Comprehensive test coverage
- Performance benchmarking

## Consequences

### Positive:
1. **Improved Developer Experience**: More accurate and comprehensive reference finding
2. **FHIR Compliance**: Proper handling of FHIR-specific concepts like choice types and inheritance
3. **Better Code Navigation**: Enhanced understanding of property relationships across resources
4. **Usage Insights**: Understanding of how properties are actually used in expressions
5. **Semantic Awareness**: Leverages FHIR semantics for better reference matching

### Negative:
1. **Increased Complexity**: More sophisticated reference resolution logic
2. **Performance Considerations**: Potential slower reference finding for large workspaces
3. **Dependency on ModelProvider**: Requires robust ModelProvider implementation
4. **Memory Usage**: Additional metadata storage for enhanced references

### Risks & Mitigations:
1. **Performance Risk**: Implement efficient caching and indexing strategies
2. **Accuracy Risk**: Provide confidence scoring and fallback to basic matching
3. **Complexity Risk**: Maintain clear separation of concerns and comprehensive testing

## Reference Discovery Examples

### Choice Type References
```fhirpath
// Finding references to "value" shows all choice types
Observation.value            // Base choice property
Observation.valueString      // Specific choice type  
Observation.valueQuantity    // Specific choice type
component.valueString        // Nested choice type
```

### Inherited Property References
```fhirpath
// Finding references to "id" shows inheritance usage
Patient.id                   // Resource.id in Patient
Observation.id               // Resource.id in Observation  
Medication.id                // Resource.id in Medication
```

### Cross-Resource References
```fhirpath
// Finding references to "status" across resources
Patient.active               // Boolean status in Patient
Observation.status           // Code status in Observation
MedicationRequest.status     // Code status in MedicationRequest
```

## Success Criteria
1. Reference finding accuracy > 95% for FHIR properties
2. Choice type reference discovery for all value[x] properties
3. Cross-resource reference finding for common properties
4. Reference search performance < 500ms for large workspaces
5. Usage pattern classification accuracy > 90%

## Related ADRs
- ADR-001: FHIRPath LSP Architectural Improvements
- ADR-002: Plugin System Architecture (removed)
- ADR-003: Enhanced Type-Aware Diagnostics
- ADR-004: Enhanced Definition Provider

## Implementation Timeline
- Week 1: Enhanced reference types and ModelProvider integration
- Week 2: Choice type and inheritance-aware reference discovery
- Week 3: Cross-resource references and usage pattern analysis
- Week 4: Performance optimization and comprehensive testing

## Approval
- Architecture Team: ✅ Approved
- Performance Team: ✅ Approved with performance monitoring
- QA Team: ✅ Approved with comprehensive test coverage requirement