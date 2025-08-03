# ADR-008: Integrate Model Provider with Diagnostic Validation

## Status
Accepted

## Context
The FunctionValidator currently shows "Unknown property" diagnostic errors (E004) for properties that are provided by the model provider but don't match hardcoded common properties. This creates false positives where valid FHIR properties appear as errors, even though they're available in autocomplete.

## Decision
Integrate the FHIRPathService's model provider with the diagnostic validation system to:

1. Check property validity against the FHIR model before flagging as unknown
2. Only show diagnostic errors for truly unknown properties
3. Maintain performance by utilizing existing caching mechanisms
4. Support navigation through complex property paths

## Implementation
- Modify `FunctionValidator` to accept `FHIRPathService` as dependency
- Add model-aware property validation that checks the FHIR model
- Fall back to existing hardcoded validation when model provider is unavailable
- Preserve existing error reporting for non-FHIR properties

## Consequences
**Positive:**
- Eliminates false positive diagnostic errors
- Provides consistent experience between completion and validation
- Leverages existing model provider infrastructure
- Maintains backward compatibility

**Negative:**
- Requires model provider to be initialized for full validation
- Adds dependency between diagnostic and parser layers
- Slight performance impact for model provider calls

## Alternatives Considered
1. Expanding hardcoded property lists - rejected due to maintenance burden
2. Disabling property validation entirely - rejected as it removes valuable error detection
3. Creating separate model-aware validator - rejected as it duplicates existing infrastructure