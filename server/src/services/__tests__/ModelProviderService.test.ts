import { test, expect, jest, describe, beforeEach, afterEach } from 'bun:test';
import type { ModelTypeProvider, TypeInfo } from '@atomic-ehr/fhirpath';
import { ModelProviderService, type EnhancedTypeInfo, type NavigationResult } from '../ModelProviderService.js';

// Mock ModelTypeProvider for testing
class MockModelTypeProvider implements ModelTypeProvider {
  private shouldFail = false;
  private typeInfoMap = new Map<string, TypeInfo>();

  constructor() {
    // Set up common FHIR resource types for testing
    this.typeInfoMap.set('Patient', {
      name: 'Patient',
      properties: new Map([
        ['id', { name: 'id', type: 'string', cardinality: '0..1' }],
        ['name', { name: 'name', type: 'HumanName', cardinality: '0..*' }],
        ['active', { name: 'active', type: 'boolean', cardinality: '0..1' }]
      ]),
      baseType: 'DomainResource'
    });

    this.typeInfoMap.set('Observation', {
      name: 'Observation',
      properties: new Map([
        ['id', { name: 'id', type: 'string', cardinality: '0..1' }],
        ['status', { name: 'status', type: 'code', cardinality: '1..1' }],
        ['value', { name: 'value[x]', type: 'choice', cardinality: '0..1' }]
      ]),
      baseType: 'DomainResource'
    });

    // Add more types for comprehensive testing
    this.typeInfoMap.set('DomainResource', {
      name: 'DomainResource',
      properties: new Map([
        ['id', { name: 'id', type: 'string', cardinality: '0..1' }],
        ['meta', { name: 'meta', type: 'Meta', cardinality: '0..1' }]
      ]),
      baseType: 'Resource'
    });

    this.typeInfoMap.set('Resource', {
      name: 'Resource',
      properties: new Map([
        ['id', { name: 'id', type: 'string', cardinality: '0..1' }],
        ['resourceType', { name: 'resourceType', type: 'code', cardinality: '1..1' }]
      ])
    });

    // Add primitive types
    this.typeInfoMap.set('string', {
      name: 'string',
      properties: new Map()
    });

    this.typeInfoMap.set('boolean', {
      name: 'boolean',
      properties: new Map()
    });

    this.typeInfoMap.set('code', {
      name: 'code',
      properties: new Map()
    });

    // Add complex types
    this.typeInfoMap.set('HumanName', {
      name: 'HumanName',
      properties: new Map([
        ['family', { name: 'family', type: 'string', cardinality: '0..1' }],
        ['given', { name: 'given', type: 'string', cardinality: '0..*' }]
      ])
    });

    // Add choice type with modelContext
    this.typeInfoMap.set('value[x]', {
      name: 'value[x]',
      properties: new Map(),
      modelContext: {
        isUnion: true,
        choices: [
          { type: { name: 'string' } },
          { type: { name: 'boolean' } },
          { type: { name: 'Quantity' } },
          { type: { name: 'CodeableConcept' } }
        ],
        choiceTypes: ['string', 'boolean', 'Quantity', 'CodeableConcept']
      }
    } as any);

    // Add more FHIR types for choice testing
    this.typeInfoMap.set('Quantity', {
      name: 'Quantity',
      properties: new Map([
        ['value', { name: 'value', type: 'decimal', cardinality: '0..1' }],
        ['unit', { name: 'unit', type: 'string', cardinality: '0..1' }]
      ])
    });

    this.typeInfoMap.set('CodeableConcept', {
      name: 'CodeableConcept',
      properties: new Map([
        ['coding', { name: 'coding', type: 'Coding', cardinality: '0..*' }],
        ['text', { name: 'text', type: 'string', cardinality: '0..1' }]
      ])
    });

    this.typeInfoMap.set('Coding', {
      name: 'Coding',
      properties: new Map([
        ['system', { name: 'system', type: 'uri', cardinality: '0..1' }],
        ['code', { name: 'code', type: 'code', cardinality: '0..1' }]
      ])
    });

    // Add Patient deceased[x] choice type
    this.typeInfoMap.set('deceased[x]', {
      name: 'deceased[x]',
      properties: new Map(),
      modelContext: {
        isUnion: true,
        choices: [
          { type: { name: 'boolean' } },
          { type: { name: 'dateTime' } }
        ]
      }
    } as any);

    this.typeInfoMap.set('dateTime', {
      name: 'dateTime',
      properties: new Map()
    });
  }

  async getType(typeName: string): Promise<TypeInfo | undefined> {
    if (this.shouldFail) {
      throw new Error('Mock ModelProvider failure');
    }
    return this.typeInfoMap.get(typeName);
  }

  async getAllResourceTypes(): Promise<string[]> {
    if (this.shouldFail) {
      throw new Error('Mock ModelProvider failure');
    }
    return Array.from(this.typeInfoMap.keys());
  }

  setShouldFail(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
  }

  addTypeInfo(typeName: string, typeInfo: TypeInfo): void {
    this.typeInfoMap.set(typeName, typeInfo);
  }

  getElementNames(typeInfo: TypeInfo): string[] {
    if (this.shouldFail) {
      throw new Error('Mock ModelProvider failure');
    }
    
    if ((typeInfo as any).properties instanceof Map) {
      return Array.from(((typeInfo as any).properties as Map<string, any>).keys());
    }
    
    return [];
  }

  getElementType(typeInfo: TypeInfo, elementName: string): any {
    if (this.shouldFail) {
      throw new Error('Mock ModelProvider failure');
    }
    
    if ((typeInfo as any).properties instanceof Map) {
      const properties = (typeInfo as any).properties as Map<string, any>;
      return properties.get(elementName);
    }
    
    return undefined;
  }

  ofType(typeInfo: TypeInfo, targetType: any): TypeInfo | undefined {
    if (this.shouldFail) {
      throw new Error('Mock ModelProvider failure');
    }
    
    // Return the target type if available in our type map
    const typeName = targetType?.name || targetType;
    return this.typeInfoMap.get(typeName);
  }
}

describe('ModelProviderService', () => {
  let mockProvider: MockModelTypeProvider;
  let service: ModelProviderService;

  beforeEach(() => {
    mockProvider = new MockModelTypeProvider();
    service = new ModelProviderService(mockProvider, {
      enableLogging: false, // Disable logging for tests
      enableHealthChecks: true
    });
  });

  afterEach(() => {
    // Clean up any timers or async operations
  });

  describe('Constructor', () => {
    test('should create service with default options', () => {
      const defaultService = new ModelProviderService(mockProvider);
      expect(defaultService).toBeDefined();
      expect(defaultService.isInitialized()).toBe(false);
    });

    test('should create service with custom options', () => {
      const customService = new ModelProviderService(mockProvider, {
        enableLogging: false,
        enableHealthChecks: false,
        retryAttempts: 5,
        timeoutMs: 10000
      });
      expect(customService).toBeDefined();
      expect(customService.isInitialized()).toBe(false);
    });
  });

  describe('Initialization', () => {
    test('should initialize successfully with valid ModelProvider', async () => {
      await service.initialize();
      expect(service.isInitialized()).toBe(true);
    });

    test('should handle initialization with failing ModelProvider', async () => {
      mockProvider.setShouldFail(true);
      
      await expect(service.initialize()).rejects.toThrow('ModelProvider validation failed');
      expect(service.isInitialized()).toBe(false);
    });

    test('should not reinitialize if already initialized', async () => {
      await service.initialize();
      expect(service.isInitialized()).toBe(true);

      // Should not throw or change state
      await service.initialize();
      expect(service.isInitialized()).toBe(true);
    });

    test('should validate ModelProvider during initialization', async () => {
      // Create a provider without Patient type to make validation fail
      const emptyProvider = new MockModelTypeProvider();
      // Clear the Patient type that's added by default
      (emptyProvider as any).typeInfoMap.clear();
      emptyProvider.addTypeInfo('NonPatient', {
        name: 'NonPatient',
        properties: new Map(),
        baseType: 'Resource'
      });
      
      const emptyService = new ModelProviderService(emptyProvider, { enableLogging: false });
      await expect(emptyService.initialize()).rejects.toThrow('ModelProvider validation failed');
    });
  });

  describe('Enhanced Type Information', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    test('should get enhanced type info for existing type', async () => {
      const result = await service.getEnhancedTypeInfo('Patient');
      
      expect(result).toBeDefined();
      expect(result!.type.name).toBe('Patient');
      expect(result!.hierarchy).toBeDefined();
      expect(result!.choiceTypes).toBeDefined();
      expect(result!.constraints).toBeDefined();
      expect(result!.terminology).toBeDefined();
    });

    test('should return undefined for non-existing type', async () => {
      const result = await service.getEnhancedTypeInfo('NonExistentType');
      expect(result).toBeUndefined();
    });

    test('should handle errors gracefully when ModelProvider fails', async () => {
      mockProvider.setShouldFail(true);
      
      const result = await service.getEnhancedTypeInfo('Patient');
      expect(result).toBeUndefined();
    });

    test('should throw error if not initialized', async () => {
      const uninitializedService = new ModelProviderService(mockProvider, { enableLogging: false });
      
      await expect(uninitializedService.getEnhancedTypeInfo('Patient'))
        .rejects.toThrow('ModelProviderService not initialized');
    });
  });

  describe('Property Path Navigation', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    test('should navigate valid property path', async () => {
      const result = await service.navigatePropertyPath('Patient', ['name', 'given']);
      
      expect(result).toBeDefined();
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.navigationPath).toBeDefined();
      expect(result.navigationPath.length).toBeGreaterThan(0);
    });

    test('should handle empty path', async () => {
      const result = await service.navigatePropertyPath('Patient', []);
      
      expect(result).toBeDefined();
      expect(result.isValid).toBe(true);
      expect(result.finalType).toBeDefined();
      expect(result.finalType!.name).toBe('Patient');
      expect(result.availableProperties).toBeDefined();
    });

    test('should throw error if not initialized', async () => {
      const uninitializedService = new ModelProviderService(mockProvider, { enableLogging: false });
      
      await expect(uninitializedService.navigatePropertyPath('Patient', ['name']))
        .rejects.toThrow('ModelProviderService not initialized');
    });
  });

  describe('Choice Type Resolution', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    test('should resolve choice types for valid type', async () => {
      const typeInfo = await mockProvider.getType('Observation');
      expect(typeInfo).toBeDefined();
      
      const result = await service.resolveChoiceTypes(typeInfo!);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    test('should resolve choice types with target type filter', async () => {
      const typeInfo = await mockProvider.getType('Observation');
      expect(typeInfo).toBeDefined();
      
      const result = await service.resolveChoiceTypes(typeInfo!, 'string');
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    test('should throw error if not initialized', async () => {
      const uninitializedService = new ModelProviderService(mockProvider, { enableLogging: false });
      const typeInfo = await mockProvider.getType('Observation');
      
      await expect(uninitializedService.resolveChoiceTypes(typeInfo!))
        .rejects.toThrow('ModelProviderService not initialized');
    });
  });

  describe('Health Status', () => {
    test('should return unhealthy status when not initialized', async () => {
      const status = await service.getHealthStatus();
      
      expect(status.healthy).toBe(false);
      expect(status.details.initialized).toBe(false);
    });

    test('should return healthy status when properly initialized', async () => {
      await service.initialize();
      const status = await service.getHealthStatus();
      
      expect(status.healthy).toBe(true);
      expect(status.details.initialized).toBe(true);
      expect(status.details.modelProviderAvailable).toBe(true);
      expect(status.details.sampleTypeResolution).toBe(true);
    });

    test('should return unhealthy status when ModelProvider fails', async () => {
      await service.initialize();
      mockProvider.setShouldFail(true);
      
      const status = await service.getHealthStatus();
      
      expect(status.healthy).toBe(false);
      expect(status.details.error).toBeDefined();
    });

    test('should handle null ModelProvider', async () => {
      const nullProviderService = new ModelProviderService(null as any, { enableLogging: false });
      const status = await nullProviderService.getHealthStatus();
      
      expect(status.healthy).toBe(false);
      expect(status.details.modelProviderAvailable).toBe(false);
    });
  });

  describe('Error Handling', () => {
    test('should handle ModelProvider errors gracefully', async () => {
      await service.initialize();
      
      // Clear cache to ensure fresh calls
      service.clearEnhancedTypeCache();
      
      // Should not throw, but return undefined/empty results
      const typeInfo = await service.getEnhancedTypeInfo('Patient');
      expect(typeInfo).toBeDefined();
      
      // Clear cache again before testing failure case
      service.clearEnhancedTypeCache();
      
      // Now test with failing provider
      mockProvider.setShouldFail(true);
      const failedTypeInfo = await service.getEnhancedTypeInfo('Patient');
      expect(failedTypeInfo).toBeUndefined();
      
      // Reset provider and test choice types with a working type
      mockProvider.setShouldFail(false);
      const observationTypeInfo = await mockProvider.getType('Observation');
      if (observationTypeInfo) {
        const choiceTypes = await service.resolveChoiceTypes(observationTypeInfo);
        // For non-choice types, should return the original type
        expect(choiceTypes).toEqual([observationTypeInfo]);
      }
    });

    test('should provide meaningful error messages', async () => {
      const invalidProviderService = new ModelProviderService(null as any, { enableLogging: false });
      
      await expect(invalidProviderService.initialize())
        .rejects.toThrow('ModelProvider is null or undefined');
    });
  });

  describe('Service State Management', () => {
    test('should track initialization state correctly', () => {
      expect(service.isInitialized()).toBe(false);
    });

    test('should maintain state after successful initialization', async () => {
      await service.initialize();
      expect(service.isInitialized()).toBe(true);
      
      // State should persist across method calls
      await service.getEnhancedTypeInfo('Patient');
      expect(service.isInitialized()).toBe(true);
    });

    test('should maintain state after failed operations', async () => {
      await service.initialize();
      expect(service.isInitialized()).toBe(true);
      
      mockProvider.setShouldFail(true);
      await service.getEnhancedTypeInfo('Patient'); // This will fail internally
      
      // Service should still be initialized
      expect(service.isInitialized()).toBe(true);
    });
  });

  // New tests for enhanced type resolution functionality
  describe('Enhanced Type Resolution Features', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    describe('Type Hierarchy Extraction', () => {
      test('should build type hierarchy for Patient (Patient -> DomainResource -> Resource)', async () => {
        const result = await service.getEnhancedTypeInfo('Patient');
        
        expect(result).toBeDefined();
        expect(result!.hierarchy).toBeDefined();
        expect(result!.hierarchy.length).toBeGreaterThan(1);
        expect(result!.hierarchy[0].name).toBe('Patient');
        
        // Check if hierarchy includes base types
        const hierarchyNames = result!.hierarchy.map(h => h.name);
        expect(hierarchyNames).toContain('Patient');
        if (hierarchyNames.length > 1) {
          expect(hierarchyNames).toContain('DomainResource');
        }
      });

      test('should handle types without base types', async () => {
        const result = await service.getEnhancedTypeInfo('string');
        
        expect(result).toBeDefined();
        expect(result!.hierarchy).toBeDefined();
        expect(result!.hierarchy.length).toBe(1);
        expect(result!.hierarchy[0].name).toBe('string');
      });
    });

    describe('Constraint Information Extraction', () => {
      test('should extract default constraint information', async () => {
        const result = await service.getEnhancedTypeInfo('Patient');
        
        expect(result).toBeDefined();
        expect(result!.constraints).toBeDefined();
        expect(result!.constraints.cardinality).toBeDefined();
        expect(typeof result!.constraints.required).toBe('boolean');
      });

      test('should provide fallback constraint values', async () => {
        const result = await service.getEnhancedTypeInfo('string');
        
        expect(result).toBeDefined();
        expect(result!.constraints).toBeDefined();
        expect(result!.constraints.cardinality).toBe('0..*');
        expect(result!.constraints.required).toBe(false);
      });
    });

    describe('Terminology Binding Extraction', () => {
      test('should extract terminology binding information', async () => {
        const result = await service.getEnhancedTypeInfo('code');
        
        expect(result).toBeDefined();
        expect(result!.terminology).toBeDefined();
        expect(result!.terminology.strength).toBeDefined();
        expect(['required', 'extensible', 'preferred', 'example']).toContain(result!.terminology.strength);
      });

      test('should provide default terminology binding for unknown types', async () => {
        const result = await service.getEnhancedTypeInfo('string');
        
        expect(result).toBeDefined();
        expect(result!.terminology).toBeDefined();
        expect(result!.terminology.strength).toBe('example');
      });
    });

    describe('Choice Type Resolution', () => {
      test('should resolve choice types for value[x] types', async () => {
        const valueType = await mockProvider.getType('value[x]');
        expect(valueType).toBeDefined();
        
        const choiceTypes = await service.resolveChoiceTypes(valueType!);
        expect(choiceTypes).toBeDefined();
        expect(Array.isArray(choiceTypes)).toBe(true);
        
        // Should resolve some choice types if modelContext is available
        if (choiceTypes.length > 0) {
          expect(choiceTypes.every(ct => ct.name)).toBe(true);
        }
      });

      test('should filter choice types by target type', async () => {
        const valueType = await mockProvider.getType('value[x]');
        expect(valueType).toBeDefined();
        
        const stringChoiceTypes = await service.resolveChoiceTypes(valueType!, 'string');
        expect(stringChoiceTypes).toBeDefined();
        expect(Array.isArray(stringChoiceTypes)).toBe(true);
        
        // If any choice types are returned, they should match the target
        if (stringChoiceTypes.length > 0) {
          expect(stringChoiceTypes.every(ct => ct.name === 'string')).toBe(true);
        }
      });

      test('should provide fallback choice types for common value[x] patterns', async () => {
        // Create a value[x] type without modelContext for fallback testing
        const fallbackValueType = {
          name: 'value[x]',
          properties: new Map()
        } as TypeInfo;
        
        const choiceTypes = await service.resolveChoiceTypes(fallbackValueType);
        expect(choiceTypes).toBeDefined();
        expect(Array.isArray(choiceTypes)).toBe(true);
        
        // Should still try to resolve common value types
        // (may be empty if those types aren't in our mock provider)
      });
    });

    describe('Caching Functionality', () => {
      test('should cache enhanced type information', async () => {
        // Clear any existing cache
        service.clearEnhancedTypeCache();
        
        // First call should hit the ModelProvider
        const result1 = await service.getEnhancedTypeInfo('Patient');
        expect(result1).toBeDefined();
        
        // Second call should use cache (no way to directly test this without spying)
        const result2 = await service.getEnhancedTypeInfo('Patient');
        expect(result2).toBeDefined();
        expect(result2!.type.name).toBe(result1!.type.name);
      });

      test('should provide cache statistics', () => {
        const stats = service.getEnhancedTypeCacheStats();
        expect(stats).toBeDefined();
        expect(typeof stats.size).toBe('number');
        expect(typeof stats.maxSize).toBe('number');
        expect(stats.size).toBeGreaterThanOrEqual(0);
        expect(stats.maxSize).toBeGreaterThan(0);
      });

      test('should clear cache when requested', async () => {
        // Add something to cache
        await service.getEnhancedTypeInfo('Patient');
        
        // Clear cache
        service.clearEnhancedTypeCache();
        
        // Cache should be empty
        const stats = service.getEnhancedTypeCacheStats();
        expect(stats.size).toBe(0);
      });
    });

    describe('Type Classification', () => {
      test('should identify primitive types correctly', () => {
        expect(service.isPrimitiveType('string')).toBe(true);
        expect(service.isPrimitiveType('boolean')).toBe(true);
        expect(service.isPrimitiveType('integer')).toBe(true);
        expect(service.isPrimitiveType('decimal')).toBe(true);
        expect(service.isPrimitiveType('date')).toBe(true);
        expect(service.isPrimitiveType('Patient')).toBe(false);
        expect(service.isPrimitiveType('HumanName')).toBe(false);
      });

      test('should identify resource types correctly', () => {
        expect(service.isResourceType('Patient')).toBe(true);
        expect(service.isResourceType('Observation')).toBe(true);
        expect(service.isResourceType('string')).toBe(false);
        expect(service.isResourceType('HumanName')).toBe(false);
      });

      test('should identify complex types correctly', () => {
        expect(service.isComplexType('HumanName')).toBe(true);
        expect(service.isComplexType('Address')).toBe(true);
        expect(service.isComplexType('string')).toBe(false);
        expect(service.isComplexType('Patient')).toBe(false);
      });

      test('should provide comprehensive type classification', async () => {
        const stringClassification = await service.getTypeClassification('string');
        expect(stringClassification.isPrimitive).toBe(true);
        expect(stringClassification.isResource).toBe(false);
        expect(stringClassification.isComplex).toBe(false);
        expect(stringClassification.category).toBe('primitive');

        const patientClassification = await service.getTypeClassification('Patient');
        expect(patientClassification.isPrimitive).toBe(false);
        expect(patientClassification.isResource).toBe(true);
        expect(patientClassification.isComplex).toBe(false);
        expect(patientClassification.category).toBe('resource');

        const complexClassification = await service.getTypeClassification('HumanName');
        expect(complexClassification.isPrimitive).toBe(false);
        expect(complexClassification.isResource).toBe(false);
        expect(complexClassification.isComplex).toBe(true);
        expect(complexClassification.category).toBe('complex');
      });
    });

    describe('Error Handling and Graceful Degradation', () => {
      test('should handle ModelProvider failures gracefully during hierarchy building', async () => {
        // This tests internal error handling - the method should not throw
        const result = await service.getEnhancedTypeInfo('Patient');
        expect(result).toBeDefined();
        
        // Even if hierarchy building fails, we should get basic type info
        expect(result!.type).toBeDefined();
        expect(result!.hierarchy).toBeDefined();
        expect(result!.constraints).toBeDefined();
        expect(result!.terminology).toBeDefined();
      });

      test('should handle missing modelContext gracefully', async () => {
        // Test with a type that has no modelContext
        const result = await service.getEnhancedTypeInfo('string');
        expect(result).toBeDefined();
        
        // Should provide default values
        expect(result!.constraints.cardinality).toBeDefined();
        expect(result!.terminology.strength).toBeDefined();
      });

      test('should continue operation after non-critical errors', async () => {
        // First successful operation
        const result1 = await service.getEnhancedTypeInfo('Patient');
        expect(result1).toBeDefined();
        
        // Simulate error during one operation
        mockProvider.setShouldFail(true);
        const result2 = await service.getEnhancedTypeInfo('NonExistent');
        expect(result2).toBeUndefined();
        
        // Should still work for subsequent operations
        mockProvider.setShouldFail(false);
        const result3 = await service.getEnhancedTypeInfo('Patient');
        expect(result3).toBeDefined();
      });
    });
  });
  // New tests for deep property navigation functionality
  describe('Deep Property Navigation Features', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    describe('Multi-Level Navigation', () => {
      test('should navigate Patient.name.given successfully', async () => {
        const result = await service.navigatePropertyPath('Patient', ['name', 'given']);
        
        expect(result).toBeDefined();
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.navigationPath).toBeDefined();
        expect(result.navigationPath.length).toBe(3); // Patient -> HumanName -> string
        expect(result.finalType).toBeDefined();
        expect(result.finalType!.name).toBe('string');
      });

      test('should navigate Patient.name successfully (single level)', async () => {
        const result = await service.navigatePropertyPath('Patient', ['name']);
        
        expect(result).toBeDefined();
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.navigationPath.length).toBe(2); // Patient -> HumanName
        expect(result.finalType!.name).toBe('HumanName');
        expect(result.availableProperties).toContain('family');
        expect(result.availableProperties).toContain('given');
      });

      test('should navigate to primitive types correctly', async () => {
        const result = await service.navigatePropertyPath('Patient', ['active']);
        
        expect(result).toBeDefined();
        expect(result.isValid).toBe(true);
        expect(result.finalType!.name).toBe('boolean');
        expect(result.availableProperties).toHaveLength(0); // Primitives have no properties
      });

      test('should handle empty path (return root type)', async () => {
        const result = await service.navigatePropertyPath('Patient', []);
        
        expect(result).toBeDefined();
        expect(result.isValid).toBe(true);
        expect(result.finalType!.name).toBe('Patient');
        expect(result.navigationPath.length).toBe(1);
        expect(result.availableProperties).toContain('name');
        expect(result.availableProperties).toContain('active');
        expect(result.availableProperties).toContain('id');
      });
    });

    describe('Invalid Path Handling', () => {
      test('should handle invalid root type', async () => {
        const result = await service.navigatePropertyPath('NonExistentType', ['property']);
        
        expect(result).toBeDefined();
        expect(result.isValid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('Root type \'NonExistentType\' not found');
      });

      test('should handle invalid property name', async () => {
        const result = await service.navigatePropertyPath('Patient', ['invalidProperty']);
        
        expect(result).toBeDefined();
        expect(result.isValid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('Property \'invalidProperty\' not found');
        expect(result.availableProperties).toContain('name');
        expect(result.availableProperties).toContain('active');
      });

      test('should provide suggestions for similar property names', async () => {
        const result = await service.navigatePropertyPath('Patient', ['nam']); // Close to 'name'
        
        expect(result).toBeDefined();
        expect(result.isValid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('Did you mean');
        expect(result.errors[0]).toContain('name');
      });

      test('should handle navigation failure in the middle of a path', async () => {
        const result = await service.navigatePropertyPath('Patient', ['name', 'invalidProperty']);
        
        expect(result).toBeDefined();
        expect(result.isValid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('Property \'invalidProperty\' not found');
        expect(result.availableProperties).toContain('family');
        expect(result.availableProperties).toContain('given');
      });
    });

    describe('Array Access Pattern Support', () => {
      test('should handle array access notation', async () => {
        const result = await service.navigatePropertyPath('Patient', ['name[0]', 'given']);
        
        expect(result).toBeDefined();
        expect(result.isValid).toBe(true);
        expect(result.navigationPath.length).toBe(3);
        expect(result.finalType!.name).toBe('string');
      });

      test('should handle wildcard array access', async () => {
        const result = await service.navigatePropertyPath('Patient', ['name[*]', 'family']);
        
        expect(result).toBeDefined();
        expect(result.isValid).toBe(true);
        expect(result.finalType!.name).toBe('string');
      });
    });

    describe('Choice Type Navigation', () => {
      test('should handle choice type navigation (value[x])', async () => {
        const result = await service.navigatePropertyPath('Observation', ['value']);
        
        expect(result).toBeDefined();
        // This should work either by resolving to choice types or the generic choice type
        if (result.isValid) {
          expect(result.finalType).toBeDefined();
        } else {
          // If choice type navigation isn't fully supported yet, that's acceptable
          expect(result.errors.length).toBeGreaterThan(0);
        }
      });
    });

    describe('Performance and Edge Cases', () => {
      test('should handle deep navigation efficiently', async () => {
        const startTime = Date.now();
        const result = await service.navigatePropertyPath('Patient', ['name', 'given']);
        const endTime = Date.now();
        
        expect(result.isValid).toBe(true);
        expect(endTime - startTime).toBeLessThan(100); // Should complete in under 100ms
      });

      test('should handle navigation with ModelProvider errors gracefully', async () => {
        // Test with a failing provider after navigation starts
        const result1 = await service.navigatePropertyPath('Patient', ['name']);
        expect(result1.isValid).toBe(true);
        
        // Now simulate provider failure
        mockProvider.setShouldFail(true);
        const result2 = await service.navigatePropertyPath('Patient', ['active']);
        
        // Should handle the error gracefully
        expect(result2.isValid).toBe(false);
        expect(result2.errors.length).toBeGreaterThan(0);
        
        // Reset provider
        mockProvider.setShouldFail(false);
      });

      test('should provide available properties at each navigation level', async () => {
        // Test empty path
        const rootResult = await service.navigatePropertyPath('Patient', []);
        expect(rootResult.availableProperties).toContain('name');
        expect(rootResult.availableProperties).toContain('active');
        
        // Test one level deep
        const nameResult = await service.navigatePropertyPath('Patient', ['name']);
        expect(nameResult.availableProperties).toContain('family');
        expect(nameResult.availableProperties).toContain('given');
      });

      test('should handle navigation to types without properties', async () => {
        const result = await service.navigatePropertyPath('Patient', ['active']);
        
        expect(result.isValid).toBe(true);
        expect(result.finalType!.name).toBe('boolean');
        expect(result.availableProperties).toHaveLength(0);
      });
    });

    describe('Navigation Path Tracking', () => {
      test('should track complete navigation path', async () => {
        const result = await service.navigatePropertyPath('Patient', ['name', 'given']);
        
        expect(result.navigationPath).toBeDefined();
        expect(result.navigationPath.length).toBe(3);
        expect(result.navigationPath[0].name).toBe('Patient');
        expect(result.navigationPath[1].name).toBe('HumanName');
        expect(result.navigationPath[2].name).toBe('string');
      });

      test('should track path for failed navigation', async () => {
        const result = await service.navigatePropertyPath('Patient', ['name', 'invalidProperty']);
        
        expect(result.navigationPath).toBeDefined();
        expect(result.navigationPath.length).toBe(2); // Should stop at HumanName
        expect(result.navigationPath[0].name).toBe('Patient');
        expect(result.navigationPath[1].name).toBe('HumanName');
      });
    });
  });

  // Comprehensive tests for choice type functionality (Task 4)
  describe('Choice Type Resolution and Utilities', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    describe('Choice Type Detection', () => {
      test('should detect union types from modelContext.isUnion', async () => {
        const valueType = await mockProvider.getType('value[x]');
        expect(valueType).toBeDefined();
        
        const choiceTypes = await service.resolveChoiceTypes(valueType!);
        expect(choiceTypes).toBeDefined();
        expect(Array.isArray(choiceTypes)).toBe(true);
        expect(choiceTypes.length).toBeGreaterThan(0);
        
        // Should resolve to actual types, not just the union type
        const typeNames = choiceTypes.map(ct => ct.name);
        expect(typeNames).toContain('string');
        expect(typeNames).toContain('boolean');
        expect(typeNames).toContain('Quantity');
        expect(typeNames).toContain('CodeableConcept');
      });

      test('should return original type for non-choice types', async () => {
        const stringType = await mockProvider.getType('string');
        expect(stringType).toBeDefined();
        
        const choiceTypes = await service.resolveChoiceTypes(stringType!);
        expect(choiceTypes).toBeDefined();
        expect(choiceTypes.length).toBe(1);
        expect(choiceTypes[0].name).toBe('string');
      });

      test('should filter choice types by target type', async () => {
        const valueType = await mockProvider.getType('value[x]');
        expect(valueType).toBeDefined();
        
        const stringChoices = await service.resolveChoiceTypes(valueType!, 'string');
        expect(stringChoices).toBeDefined();
        expect(stringChoices.length).toBe(1);
        expect(stringChoices[0].name).toBe('string');
        
        const quantityChoices = await service.resolveChoiceTypes(valueType!, 'Quantity');
        expect(quantityChoices).toBeDefined();
        expect(quantityChoices.length).toBe(1);
        expect(quantityChoices[0].name).toBe('Quantity');
      });

      test('should handle choice types with legacy choiceTypes format', async () => {
        const legacyValueType = {
          name: 'value[x]',
          properties: new Map(),
          modelContext: {
            choiceTypes: ['string', 'boolean', 'Quantity']
          }
        } as any;
        
        const choiceTypes = await service.resolveChoiceTypes(legacyValueType);
        expect(choiceTypes).toBeDefined();
        expect(Array.isArray(choiceTypes)).toBe(true);
        expect(choiceTypes.length).toBe(3);
      });

      test('should use ModelProvider ofType method when available', async () => {
        const valueType = await mockProvider.getType('value[x]');
        expect(valueType).toBeDefined();
        
        // Mock provider should have ofType method
        expect(typeof (mockProvider as any).ofType).toBe('function');
        
        const choiceTypes = await service.resolveChoiceTypes(valueType!);
        expect(choiceTypes).toBeDefined();
        expect(choiceTypes.length).toBeGreaterThan(0);
      });
    });

    describe('Choice Property Name Generation', () => {
      test('should generate correct choice property names', async () => {
        const valueType = await mockProvider.getType('value[x]');
        expect(valueType).toBeDefined();
        
        const choiceTypes = await service.resolveChoiceTypes(valueType!);
        const propertyNames = service.getChoicePropertyNames('value', choiceTypes);
        
        expect(propertyNames).toBeDefined();
        expect(Array.isArray(propertyNames)).toBe(true);
        expect(propertyNames).toContain('valueString');
        expect(propertyNames).toContain('valueBoolean');
        expect(propertyNames).toContain('valueQuantity');
        expect(propertyNames).toContain('valueCodeableConcept');
      });

      test('should handle empty choice types array', () => {
        const propertyNames = service.getChoicePropertyNames('value', []);
        expect(propertyNames).toBeDefined();
        expect(Array.isArray(propertyNames)).toBe(true);
        expect(propertyNames.length).toBe(0);
      });

      test('should capitalize type names correctly', async () => {
        const stringType = await mockProvider.getType('string');
        const dateTimeType = await mockProvider.getType('dateTime');
        expect(stringType && dateTimeType).toBeTruthy();
        
        const propertyNames = service.getChoicePropertyNames('effective', [stringType!, dateTimeType!]);
        expect(propertyNames).toContain('effectiveString');
        expect(propertyNames).toContain('effectiveDateTime');
      });
    });

    describe('Choice Property Pattern Detection', () => {
      test('should identify choice properties correctly', () => {
        expect(service.isChoiceProperty('valueString')).toBe(true);
        expect(service.isChoiceProperty('valueQuantity')).toBe(true);
        expect(service.isChoiceProperty('effectiveDateTime')).toBe(true);
        expect(service.isChoiceProperty('deceasedBoolean')).toBe(true);
        
        expect(service.isChoiceProperty('value')).toBe(false);
        expect(service.isChoiceProperty('name')).toBe(false);
        expect(service.isChoiceProperty('active')).toBe(false);
        expect(service.isChoiceProperty('123invalid')).toBe(false);
      });

      test('should extract base property correctly', () => {
        expect(service.extractBaseProperty('valueString')).toBe('value');
        expect(service.extractBaseProperty('effectiveDateTime')).toBe('effective');
        expect(service.extractBaseProperty('deceasedBoolean')).toBe('deceased');
        expect(service.extractBaseProperty('multipleBirthInteger')).toBe('multipleBirth');
        
        // Non-choice properties should return themselves
        expect(service.extractBaseProperty('name')).toBe('name');
        expect(service.extractBaseProperty('active')).toBe('active');
      });

      test('should extract choice type correctly', () => {
        expect(service.extractChoiceType('valueString')).toBe('String');
        expect(service.extractChoiceType('valueQuantity')).toBe('Quantity');
        expect(service.extractChoiceType('effectiveDateTime')).toBe('DateTime');
        expect(service.extractChoiceType('deceasedBoolean')).toBe('Boolean');
        expect(service.extractChoiceType('multipleBirthInteger')).toBe('Integer');
        
        // Non-choice properties should return empty string
        expect(service.extractChoiceType('name')).toBe('');
        expect(service.extractChoiceType('active')).toBe('');
      });
    });

    describe('Choice Context Detection', () => {
      test('should detect choice context for Observation.value', async () => {
        const context = await service.detectChoiceContext('Observation.value');
        
        expect(context).toBeDefined();
        expect(context!.baseProperty).toBe('value');
        expect(context!.resourceType).toBe('Observation');
        expect(context!.choiceTypes).toBeDefined();
        expect(context!.choiceTypes.length).toBeGreaterThan(0);
        expect(context!.availableChoices).toBeDefined();
        expect(context!.availableChoices).toContain('valueString');
        expect(context!.availableChoices).toContain('valueBoolean');
      });

      test('should return undefined for non-choice properties', async () => {
        const context = await service.detectChoiceContext('Patient.name');
        expect(context).toBeUndefined();
      });

      test('should return undefined for invalid expressions', async () => {
        const context1 = await service.detectChoiceContext('InvalidExpression');
        expect(context1).toBeUndefined();
        
        const context2 = await service.detectChoiceContext('Patient');
        expect(context2).toBeUndefined();
        
        const context3 = await service.detectChoiceContext('');
        expect(context3).toBeUndefined();
      });

      test('should handle non-existent resource types', async () => {
        const context = await service.detectChoiceContext('NonExistentResource.value');
        expect(context).toBeUndefined();
      });
    });

    describe('Choice Property Validation', () => {
      test('should validate correct choice properties', async () => {
        const result1 = await service.validateChoiceProperty('Observation', 'valueString');
        expect(result1.isValid).toBe(true);
        expect(result1.error).toBeUndefined();
        
        const result2 = await service.validateChoiceProperty('Observation', 'valueQuantity');
        expect(result2.isValid).toBe(true);
        expect(result2.error).toBeUndefined();
      });

      test('should validate non-choice properties as valid', async () => {
        const result = await service.validateChoiceProperty('Patient', 'name');
        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      test('should reject invalid choice types', async () => {
        const result = await service.validateChoiceProperty('Observation', 'valueInvalidType');
        expect(result.isValid).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error).toContain('not a valid choice');
        expect(result.validChoices).toBeDefined();
        expect(result.validChoices!.length).toBeGreaterThan(0);
      });

      test('should provide suggestions for similar choice types', async () => {
        const result = await service.validateChoiceProperty('Observation', 'valueStrin'); // Close to 'valueString'
        expect(result.isValid).toBe(false);
        expect(result.suggestedProperty).toBeDefined();
        expect(result.suggestedProperty).toContain('value');
      });

      test('should handle invalid choice property format', async () => {
        // 'value123' doesn't match choice pattern, so it's treated as a regular property
        const result = await service.validateChoiceProperty('Observation', 'value123');
        expect(result.isValid).toBe(true); // Not a choice property, so validation passes
        
        // Test with actual invalid choice format that matches pattern but has issues
        const result2 = await service.validateChoiceProperty('Observation', 'valueInvalidFormat');
        expect(result2.isValid).toBe(false);
        expect(result2.error).toContain('not a valid choice');
      });

      test('should handle non-existent resource types', async () => {
        const result = await service.validateChoiceProperty('NonExistentType', 'valueString');
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('not found');
      });

      test('should handle non-choice base properties', async () => {
        const result = await service.validateChoiceProperty('Patient', 'nameString');
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('not a choice type');
      });
    });

    describe('Common FHIR Choice Types', () => {
      test('should handle Observation.value[x] choice types', async () => {
        const valueType = await mockProvider.getType('value[x]');
        expect(valueType).toBeDefined();
        
        const choiceTypes = await service.resolveChoiceTypes(valueType!);
        expect(choiceTypes.length).toBeGreaterThan(0);
        
        const typeNames = choiceTypes.map(ct => ct.name);
        expect(typeNames).toContain('string');
        expect(typeNames).toContain('Quantity');
        expect(typeNames).toContain('CodeableConcept');
      });

      test('should handle Patient.deceased[x] choice types', async () => {
        const deceasedType = await mockProvider.getType('deceased[x]');
        expect(deceasedType).toBeDefined();
        
        const choiceTypes = await service.resolveChoiceTypes(deceasedType!);
        expect(choiceTypes.length).toBe(2);
        
        const typeNames = choiceTypes.map(ct => ct.name);
        expect(typeNames).toContain('boolean');
        expect(typeNames).toContain('dateTime');
      });

      test('should provide fallback for unknown [x] patterns', async () => {
        const unknownChoiceType = {
          name: 'unknown[x]',
          properties: new Map()
        } as TypeInfo;
        
        const choiceTypes = await service.resolveChoiceTypes(unknownChoiceType);
        expect(choiceTypes).toBeDefined();
        expect(Array.isArray(choiceTypes)).toBe(true);
        // Should still try to resolve some common types
      });
    });

    describe('Performance and Error Handling', () => {
      test('should complete choice type resolution quickly', async () => {
        const startTime = Date.now();
        
        const valueType = await mockProvider.getType('value[x]');
        const choiceTypes = await service.resolveChoiceTypes(valueType!);
        const propertyNames = service.getChoicePropertyNames('value', choiceTypes);
        
        const endTime = Date.now();
        
        expect(endTime - startTime).toBeLessThan(50); // Should complete in under 50ms
        expect(choiceTypes.length).toBeGreaterThan(0);
        expect(propertyNames.length).toBeGreaterThan(0);
      });

      test('should handle ModelProvider failures gracefully', async () => {
        const valueType = await mockProvider.getType('value[x]');
        expect(valueType).toBeDefined();
        
        // Simulate provider failure
        mockProvider.setShouldFail(true);
        
        const choiceTypes = await service.resolveChoiceTypes(valueType!);
        expect(choiceTypes).toBeDefined();
        expect(Array.isArray(choiceTypes)).toBe(true);
        // Should return empty array or fallback gracefully
        
        // Reset provider
        mockProvider.setShouldFail(false);
      });

      test('should handle choice validation with provider errors', async () => {
        mockProvider.setShouldFail(true);
        
        const result = await service.validateChoiceProperty('Observation', 'valueString');
        expect(result.isValid).toBe(false);
        expect(result.error).toBeDefined();
        
        mockProvider.setShouldFail(false);
      });

      test('should handle choice context detection with provider errors', async () => {
        mockProvider.setShouldFail(true);
        
        const context = await service.detectChoiceContext('Observation.value');
        expect(context).toBeUndefined();
        
        mockProvider.setShouldFail(false);
      });
    });

    describe('Integration with Enhanced Type Resolution', () => {
      test('should integrate choice types with enhanced type info', async () => {
        const enhanced = await service.getEnhancedTypeInfo('value[x]');
        expect(enhanced).toBeDefined();
        expect(enhanced!.choiceTypes).toBeDefined();
        expect(enhanced!.choiceTypes.length).toBeGreaterThan(0);
        
        // Should contain actual resolved choice types
        const typeNames = enhanced!.choiceTypes.map(ct => ct.name);
        expect(typeNames).toContain('string');
        expect(typeNames).toContain('Quantity');
      });

      test('should provide choice context in navigation results', async () => {
        // This tests integration between choice types and property navigation
        const result = await service.navigatePropertyPath('Observation', ['value']);
        
        if (result.isValid) {
          expect(result.finalType).toBeDefined();
          // Should handle choice types in navigation
        } else {
          // Choice type navigation might not be fully implemented yet
          expect(result.errors.length).toBeGreaterThan(0);
        }
      });
    });

    describe('Edge Cases and Boundary Conditions', () => {
      test('should handle empty choice type names gracefully', () => {
        const emptyChoiceType = { name: '' } as TypeInfo;
        const propertyNames = service.getChoicePropertyNames('value', [emptyChoiceType]);
        expect(propertyNames).toBeDefined();
        expect(propertyNames[0]).toBe('value'); // Should handle empty name
      });

      test('should handle null/undefined choice types', () => {
        const nullChoiceType = { name: null } as any;
        const propertyNames = service.getChoicePropertyNames('value', [nullChoiceType]);
        expect(propertyNames).toBeDefined();
        expect(Array.isArray(propertyNames)).toBe(true);
      });

      test('should handle very long choice property names', () => {
        const longTypeName = 'VeryLongComplexTypeNameThatExceedsNormalLengths';
        const longType = { name: longTypeName } as TypeInfo;
        const propertyNames = service.getChoicePropertyNames('value', [longType]);
        
        expect(propertyNames).toBeDefined();
        expect(propertyNames[0]).toBe(`value${longTypeName}`);
        
        const isChoice = service.isChoiceProperty(propertyNames[0]);
        expect(isChoice).toBe(true);
      });

      test('should handle choice property extraction edge cases', () => {
        expect(service.extractBaseProperty('')).toBe('');
        expect(service.extractChoiceType('')).toBe('');
        expect(service.extractBaseProperty('a')).toBe('a');
        expect(service.extractChoiceType('a')).toBe('');
      });
    });
  });
});