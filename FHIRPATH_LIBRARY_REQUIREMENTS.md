# FHIRPath Library Enhancement Requirements

## Overview
This document outlines specific enhancements needed in the `@atomic-ehr/fhirpath` library's ModelProvider to support robust nested path navigation and property resolution in LSP environments.

## Core ModelProvider API Enhancements

### 1. Enhanced Navigation API
**Location**: `@atomic-ehr/fhirpath` ModelProvider interface
**Priority**: High

```typescript
interface ModelTypeProvider {
  // Existing methods...
  
  /**
   * Navigate a property path and return complete navigation result
   * Should handle multi-level navigation with proper error reporting
   */
  navigatePropertyPath(rootType: string, path: string[]): Promise<NavigationResult>;
  
  /**
   * Get all available property names for any TypeInfo
   * Should work for primitive, complex, resource, and backbone element types
   */
  getElementNames(typeInfo: TypeInfo): string[];
  
  /**
   * Get the target type for a specific property on a given type
   * Should handle choice types, references, and backbone elements
   */
  getElementType(typeInfo: TypeInfo, propertyName: string): TypeInfo | null;
  
  /**
   * Resolve choice types with comprehensive error handling
   * Should return all possible choice types for union/choice elements
   */
  resolveChoiceTypes(typeInfo: TypeInfo): TypeInfo[];
}

interface NavigationResult {
  isValid: boolean;
  finalType: TypeInfo | undefined;
  navigationPath: TypeInfo[];
  errors: string[];
  suggestions?: string[]; // For typos/invalid paths
}
```

### 2. Improved Type Resolution
**Location**: `@atomic-ehr/fhirpath` core type system
**Priority**: High

- **BackboneElement Support**: Proper navigation through inline complex types
- **Choice Type Resolution**: Complete support for `value[x]` patterns
- **Reference Target Types**: Understanding what resource types a Reference points to
- **Primitive Type Handling**: Consistent behavior for primitive type navigation

### 3. Error Handling and Validation
**Location**: `@atomic-ehr/fhirpath` ModelProvider implementation
**Priority**: High

```typescript
interface PropertyValidationResult {
  isValid: boolean;
  error?: string;
  suggestions?: string[];
  availableProperties?: string[];
}

interface ModelTypeProvider {
  /**
   * Validate if a property exists on a type with suggestions for typos
   */
  validatePropertyPath(rootType: string, path: string[]): PropertyValidationResult;
  
  /**
   * Get property suggestions based on partial input
   */
  suggestProperties(typeInfo: TypeInfo, partialInput: string): string[];
}
```

### 4. Performance Optimizations
**Location**: `@atomic-ehr/fhirpath` internal caching
**Priority**: Medium

- **Type Information Caching**: Cache TypeInfo objects and property mappings
- **Navigation Path Caching**: Cache successful navigation results
- **Bulk Property Resolution**: Resolve multiple properties in single call
- **Lazy Loading**: Load type information on-demand

### 5. FHIR Model Completeness
**Location**: `@atomic-ehr/fhirpath` FHIR model loading
**Priority**: Medium

```typescript
interface ModelTypeProvider {
  /**
   * Check if the model provider has complete FHIR model data
   */
  isModelComplete(): boolean;
  
  /**
   * Get model coverage information
   */
  getModelCoverage(): {
    loadedResourceTypes: string[];
    missingResourceTypes: string[];
    loadedComplexTypes: string[];
    completionPercentage: number;
  };
  
  /**
   * Preload essential types for LSP functionality
   */
  preloadCoreTypes(): Promise<void>;
}
```

## Specific Implementation Requirements

### 1. Navigation Path Resolution
The library should handle these navigation patterns correctly:

```typescript
// Basic resource property access
Patient.name → HumanName
Patient.name.family → string

// Backbone element navigation  
Patient.contact → BackboneElement
Patient.contact.relationship → CodeableConcept
Patient.contact.relationship.coding → Coding[]

// Choice type navigation
Observation.value → Union[Quantity|CodeableConcept|string|...]
Observation.valueQuantity → Quantity
Observation.valueString → string

// Reference navigation
Patient.generalPractitioner → Reference
Patient.generalPractitioner.reference → string
Patient.generalPractitioner.identifier → Identifier
```

### 2. Error Scenarios to Handle
```typescript
// Unknown resource type
getType("UnknownResource") → null + clear error

// Invalid property name
getElementType(PatientType, "invalidProperty") → null + suggestions

// Incomplete navigation path
navigatePropertyPath("Patient", ["name", "invalidProp"]) → 
  { isValid: false, errors: ["Property 'invalidProp' not found on HumanName"], suggestions: ["family", "given"] }

// Choice type without specification
navigatePropertyPath("Observation", ["value", "unit"]) → 
  { isValid: false, errors: ["'value' is a choice type, specify type like 'valueQuantity'"] }
```

### 3. TypeInfo Enhancement
The TypeInfo interface should provide:

```typescript
interface TypeInfo {
  name: string;
  // Existing properties...
  
  // Enhanced metadata
  isChoice?: boolean;
  choiceTypes?: string[];
  isBackbone?: boolean;
  isPrimitive?: boolean;
  isResource?: boolean;
  cardinality?: string;
  
  // Navigation helpers
  properties?: Map<string, PropertyInfo>;
}

interface PropertyInfo {
  name: string;
  type: string;
  cardinality: string;
  isChoice: boolean;
  choiceTypes?: string[];
  description?: string;
}
```

## Integration Points with LSP

### 1. Initialization
```typescript
// The library should provide clear initialization status
const modelProvider = new FHIRModelProvider();
await modelProvider.initialize();

if (!modelProvider.isReady()) {
  throw new Error("ModelProvider failed to initialize");
}
```

### 2. Async Operations
All navigation and type resolution should be async to support:
- Lazy loading of FHIR definitions
- Network-based model loading
- Progressive model enhancement

### 3. Memory Management
```typescript
interface ModelTypeProvider {
  /**
   * Clear internal caches to free memory
   */
  clearCache(): void;
  
  /**
   * Get memory usage statistics
   */
  getMemoryStats(): {
    cachedTypes: number;
    cachedNavigations: number;
    estimatedMemoryMB: number;
  };
}
```

## Backward Compatibility

All enhancements should maintain backward compatibility with existing FHIRPath evaluation functionality. The ModelProvider enhancements are specifically for LSP/tooling support and should not affect runtime expression evaluation.

## Testing Requirements

The library should include comprehensive tests for:
- Navigation through all FHIR resource types
- Choice type resolution for all choice patterns
- Error handling for invalid paths
- Performance with large FHIR models
- Memory usage under sustained operations

## Success Criteria

1. **Complete Navigation**: Support navigation through any valid FHIR path
2. **Helpful Errors**: Provide actionable error messages with suggestions
3. **Performance**: Handle navigation requests within 10ms average
4. **Memory Efficiency**: Limit memory growth under sustained use
5. **Robustness**: Graceful handling of incomplete or invalid model data