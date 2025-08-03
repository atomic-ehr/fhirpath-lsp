import { expect, test, describe, beforeEach, afterEach, mock } from 'bun:test';
import { ModelProviderService } from '../../services/ModelProviderService';
import { MockModelProvider } from '../helpers/MockModelProvider';
import type { TypeInfo } from '@atomic-ehr/fhirpath';

describe('ModelProviderService Unit Tests', () => {
  let service: ModelProviderService;
  let mockModelProvider: MockModelProvider;

  beforeEach(async () => {
    mockModelProvider = new MockModelProvider();
    service = new ModelProviderService(mockModelProvider);
    await service.initialize();
  });

  afterEach(async () => {
    // Clean up any resources if needed
  });

  describe('Initialization', () => {
    test('should initialize successfully', async () => {
      const newService = new ModelProviderService(mockModelProvider);
      await newService.initialize();
      
      expect(newService.isInitialized()).toBe(true);
    });

    test('should handle double initialization gracefully', async () => {
      await service.initialize(); // Already initialized in beforeEach
      
      expect(service.isInitialized()).toBe(true);
    });

    test('should validate ModelProvider on initialization', async () => {
      const healthStatus = await service.getHealthStatus();
      
      expect(healthStatus.healthy).toBe(true);
      expect(healthStatus.details.initialized).toBe(true);
      expect(healthStatus.details.sampleTypeResolution).toBe(true);
    });
  });

  describe('getEnhancedTypeInfo', () => {
    test('should extract complete metadata for Patient type', async () => {
      const enhanced = await service.getEnhancedTypeInfo('Patient');
      
      expect(enhanced).toBeDefined();
      expect(enhanced!.type.name).toBe('Patient');
      expect(enhanced!.hierarchy).toHaveLength(4); // Patient → DomainResource → Resource → Element
      expect(enhanced!.constraints.cardinality).toBeDefined();
      expect(enhanced!.terminology).toBeDefined();
    });

    test('should extract metadata for Observation with choice types', async () => {
      const enhanced = await service.getEnhancedTypeInfo('Observation');
      
      expect(enhanced).toBeDefined();
      expect(enhanced!.type.name).toBe('Observation');
      expect(enhanced!.choiceTypes.length).toBeGreaterThan(0);
    });

    test('should build correct type hierarchy', async () => {
      const enhanced = await service.getEnhancedTypeInfo('Patient');
      
      expect(enhanced!.hierarchy.map(h => h.name)).toEqual([
        'Patient',
        'DomainResource', 
        'Resource',
        'Element'
      ]);
    });

    test('should handle unknown types gracefully', async () => {
      const enhanced = await service.getEnhancedTypeInfo('UnknownType');
      
      expect(enhanced).toBeUndefined();
    });

    test('should cache results for performance', async () => {
      // First call - should take some time
      const start1 = Date.now();
      await service.getEnhancedTypeInfo('Patient');
      const duration1 = Date.now() - start1;
      
      // Second call - should be much faster (cached)
      const start2 = Date.now();
      await service.getEnhancedTypeInfo('Patient');
      const duration2 = Date.now() - start2;
      
      expect(duration2).toBeLessThan(duration1);
      expect(duration2).toBeLessThan(10); // Cached result should be < 10ms
    });

    test('should extract constraints correctly', async () => {
      const enhanced = await service.getEnhancedTypeInfo('Patient');
      
      expect(enhanced!.constraints).toBeDefined();
      expect(enhanced!.constraints.cardinality).toMatch(/^\d+\.\.\*|\d+\.\.\d+$/);
    });

    test('should extract terminology bindings', async () => {
      const enhanced = await service.getEnhancedTypeInfo('Patient');
      
      expect(enhanced!.terminology).toBeDefined();
      expect(['required', 'extensible', 'preferred', 'example']).toContain(enhanced!.terminology.strength);
    });
  });

  describe('navigatePropertyPath', () => {
    test('should navigate valid single-level paths', async () => {
      const result = await service.navigatePropertyPath('Patient', ['name']);
      
      expect(result.isValid).toBe(true);
      expect(result.finalType?.name).toBe('HumanName');
      expect(result.navigationPath).toHaveLength(2); // Patient + HumanName
      expect(result.errors).toHaveLength(0);
    });

    test('should navigate valid multi-level paths', async () => {
      const result = await service.navigatePropertyPath('Patient', ['name', 'given']);
      
      expect(result.isValid).toBe(true);
      expect(result.finalType?.name).toBe('string');
      expect(result.navigationPath).toHaveLength(3); // Patient + HumanName + string
      expect(result.availableProperties).toHaveLength(0); // string is primitive
    });

    test('should handle choice type navigation', async () => {
      const result = await service.navigatePropertyPath('Observation', ['value']);
      
      expect(result.isValid).toBe(true);
      expect(result.finalType?.name).toBe('value[x]');
      expect(result.availableProperties.length).toBeGreaterThan(0); // Should suggest choice types
    });

    test('should provide helpful errors for invalid paths', async () => {
      const result = await service.navigatePropertyPath('Patient', ['invalidProperty']);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Property \'invalidProperty\' not found');
    });

    test('should suggest similar properties for typos', async () => {
      const result = await service.navigatePropertyPath('Patient', ['nam']); // typo: 'name'
      
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('name');
    });

    test('should handle empty paths', async () => {
      const result = await service.navigatePropertyPath('Patient', []);
      
      expect(result.isValid).toBe(true);
      expect(result.finalType?.name).toBe('Patient');
      expect(result.availableProperties.length).toBeGreaterThan(0);
    });

    test('should provide available properties at each level', async () => {
      const result = await service.navigatePropertyPath('Patient', ['name']);
      
      expect(result.isValid).toBe(true);
      expect(result.availableProperties).toContain('given');
      expect(result.availableProperties).toContain('family');
      expect(result.availableProperties).toContain('use');
    });

    test('should handle inherited properties correctly', async () => {
      const result = await service.navigatePropertyPath('Patient', ['id']);
      
      expect(result.isValid).toBe(true);
      expect(result.finalType?.name).toBe('id');
    });
  });

  describe('resolveChoiceTypes', () => {
    test('should return all choice types for value[x]', async () => {
      const observationType = mockModelProvider.getType('Observation')!;
      const valueType = mockModelProvider.getElementType(observationType, 'value')!;
      
      const choices = await service.resolveChoiceTypes(valueType);
      
      expect(choices.length).toBeGreaterThan(5); // Observation.value[x] has many types
      expect(choices.map(c => c.name)).toContain('string');
      expect(choices.map(c => c.name)).toContain('Quantity');
      expect(choices.map(c => c.name)).toContain('CodeableConcept');
    });

    test('should filter to specific choice type when requested', async () => {
      const observationType = mockModelProvider.getType('Observation')!;
      const valueType = mockModelProvider.getElementType(observationType, 'value')!;
      
      const stringChoice = await service.resolveChoiceTypes(valueType, 'string');
      
      expect(stringChoice).toHaveLength(1);
      expect(stringChoice[0].name).toBe('string');
    });

    test('should handle non-choice types', async () => {
      const patientType = mockModelProvider.getType('Patient')!;
      
      const nonChoices = await service.resolveChoiceTypes(patientType);
      
      expect(nonChoices).toEqual([patientType]);
    });

    test('should resolve effective[x] choice types', async () => {
      const observationType = mockModelProvider.getType('Observation')!;
      const effectiveType = mockModelProvider.getElementType(observationType, 'effective')!;
      
      const choices = await service.resolveChoiceTypes(effectiveType);
      
      expect(choices.length).toBeGreaterThan(1);
      expect(choices.map(c => c.name)).toContain('dateTime');
      expect(choices.map(c => c.name)).toContain('Period');
    });

    test('should handle malformed choice types gracefully', async () => {
      const malformedType = {
        name: 'malformed[x]',
        modelContext: {
          isUnion: true,
          choices: null // Malformed
        }
      } as TypeInfo;
      
      const choices = await service.resolveChoiceTypes(malformedType);
      
      expect(choices).toBeArray();
      expect(choices.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getChoicePropertyNames', () => {
    test('should generate correct choice property names', () => {
      const observationType = mockModelProvider.getType('Observation')!;
      const valueType = mockModelProvider.getElementType(observationType, 'value')!;
      
      // Mock choice types for testing
      const mockChoiceTypes = [
        { name: 'string' } as TypeInfo,
        { name: 'Quantity' } as TypeInfo,
        { name: 'boolean' } as TypeInfo
      ];
      
      const propertyNames = service.getChoicePropertyNames('value', mockChoiceTypes);
      
      expect(propertyNames).toContain('valueString');
      expect(propertyNames).toContain('valueQuantity');
      expect(propertyNames).toContain('valueBoolean');
    });

    test('should handle empty choice types', () => {
      const propertyNames = service.getChoicePropertyNames('value', []);
      
      expect(propertyNames).toEqual([]);
    });
  });

  describe('Choice Property Methods', () => {
    test('should correctly identify choice properties', () => {
      expect(service.isChoiceProperty('valueString')).toBe(true);
      expect(service.isChoiceProperty('effectiveDateTime')).toBe(true);
      expect(service.isChoiceProperty('onsetAge')).toBe(true);
      expect(service.isChoiceProperty('name')).toBe(false);
      expect(service.isChoiceProperty('id')).toBe(false);
    });

    test('should extract base property correctly', () => {
      expect(service.extractBaseProperty('valueString')).toBe('value');
      expect(service.extractBaseProperty('effectiveDateTime')).toBe('effective');
      expect(service.extractBaseProperty('onsetAge')).toBe('onset');
      expect(service.extractBaseProperty('multipleBirthBoolean')).toBe('multipleBirth');
      expect(service.extractBaseProperty('name')).toBe('name'); // Non-choice property
    });

    test('should extract choice type correctly', () => {
      expect(service.extractChoiceType('valueString')).toBe('String');
      expect(service.extractChoiceType('valueQuantity')).toBe('Quantity');
      expect(service.extractChoiceType('effectiveDateTime')).toBe('DateTime');
      expect(service.extractChoiceType('onsetAge')).toBe('Age');
      expect(service.extractChoiceType('name')).toBe(''); // Non-choice property
    });
  });

  describe('detectChoiceContext', () => {
    test('should detect choice context for value property', async () => {
      const context = await service.detectChoiceContext('Observation.value');
      
      expect(context).toBeDefined();
      expect(context!.baseProperty).toBe('value');
      expect(context!.resourceType).toBe('Observation');
      expect(context!.choiceTypes.length).toBeGreaterThan(0);
      expect(context!.availableChoices.length).toBeGreaterThan(0);
    });

    test('should detect choice context for effective property', async () => {
      const context = await service.detectChoiceContext('Observation.effective');
      
      expect(context).toBeDefined();
      expect(context!.baseProperty).toBe('effective');
      expect(context!.resourceType).toBe('Observation');
    });

    test('should return undefined for non-choice properties', async () => {
      const context = await service.detectChoiceContext('Patient.name');
      
      expect(context).toBeUndefined();
    });

    test('should handle malformed expressions', async () => {
      const context = await service.detectChoiceContext('InvalidExpression');
      
      expect(context).toBeUndefined();
    });
  });

  describe('validateChoiceProperty', () => {
    test('should validate correct choice properties', async () => {
      const result = await service.validateChoiceProperty('Observation', 'valueString');
      
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    test('should invalidate incorrect choice properties', async () => {
      const result = await service.validateChoiceProperty('Observation', 'valueInvalidType');
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.validChoices).toBeDefined();
      expect(result.validChoices!.length).toBeGreaterThan(0);
    });

    test('should validate non-choice properties as valid', async () => {
      const result = await service.validateChoiceProperty('Patient', 'name');
      
      expect(result.isValid).toBe(true);
    });

    test('should handle invalid resource types', async () => {
      const result = await service.validateChoiceProperty('InvalidResource', 'valueString');
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('not found');
    });

    test('should suggest close matches for typos', async () => {
      const result = await service.validateChoiceProperty('Observation', 'valueStrin'); // typo
      
      expect(result.isValid).toBe(false);
      expect(result.suggestedProperty).toBeDefined();
      expect(result.suggestedProperty).toBe('valueString');
    });
  });

  describe('Type Classification', () => {
    test('should classify primitive types correctly', async () => {
      const classification = await service.getTypeClassification('string');
      
      expect(classification.isPrimitive).toBe(true);
      expect(classification.isComplex).toBe(false);
      expect(classification.isResource).toBe(false);
      expect(classification.category).toBe('primitive');
    });

    test('should classify resource types correctly', async () => {
      const classification = await service.getTypeClassification('Patient');
      
      expect(classification.isPrimitive).toBe(false);
      expect(classification.isComplex).toBe(false);
      expect(classification.isResource).toBe(true);
      expect(classification.category).toBe('resource');
    });

    test('should classify complex types correctly', async () => {
      const classification = await service.getTypeClassification('HumanName');
      
      expect(classification.isPrimitive).toBe(false);
      expect(classification.isComplex).toBe(true);
      expect(classification.isResource).toBe(false);
      expect(classification.category).toBe('complex');
    });
  });

  describe('Caching', () => {
    test('should cache enhanced type info', async () => {
      // First call
      const start1 = Date.now();
      const result1 = await service.getEnhancedTypeInfo('Patient');
      const duration1 = Date.now() - start1;
      
      // Second call (should be cached)
      const start2 = Date.now();
      const result2 = await service.getEnhancedTypeInfo('Patient');
      const duration2 = Date.now() - start2;
      
      expect(result1).toEqual(result2);
      expect(duration2).toBeLessThan(duration1);
    });

    test('should provide cache statistics', async () => {
      await service.getEnhancedTypeInfo('Patient');
      await service.getEnhancedTypeInfo('Observation');
      
      const stats = service.getEnhancedTypeCacheStats();
      
      expect(stats.size).toBeGreaterThan(0);
      expect(stats.maxSize).toBeNumber();
    });

    test('should allow cache clearing', async () => {
      await service.getEnhancedTypeInfo('Patient');
      
      let stats = service.getEnhancedTypeCacheStats();
      expect(stats.size).toBeGreaterThan(0);
      
      service.clearEnhancedTypeCache();
      
      stats = service.getEnhancedTypeCacheStats();
      expect(stats.size).toBe(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle ModelProvider errors gracefully', async () => {
      // Create a failing ModelProvider
      const failingProvider = {
        getType: () => { throw new Error('ModelProvider error'); }
      } as any;
      
      const failingService = new ModelProviderService(failingProvider);
      
      const result = await failingService.getEnhancedTypeInfo('Patient');
      
      expect(result).toBeUndefined();
    });

    test('should handle navigation errors gracefully', async () => {
      const result = await service.navigatePropertyPath('Patient', ['nonexistent', 'deeply', 'nested']);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.finalType).toBeUndefined();
    });

    test('should handle choice type resolution errors', async () => {
      const malformedType = {
        name: 'malformed',
        modelContext: {
          isUnion: true,
          choices: undefined
        }
      } as TypeInfo;
      
      const choices = await service.resolveChoiceTypes(malformedType);
      
      expect(choices).toBeArray();
    });
  });

  describe('Performance', () => {
    test('should resolve types within performance targets', async () => {
      const start = Date.now();
      await service.getEnhancedTypeInfo('Patient');
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(200); // < 200ms for uncached resolution
    });

    test('should handle concurrent requests efficiently', async () => {
      const promises = Array(10).fill(0).map((_, i) => 
        service.getEnhancedTypeInfo(i % 2 === 0 ? 'Patient' : 'Observation')
      );
      
      const start = Date.now();
      const results = await Promise.all(promises);
      const duration = Date.now() - start;
      
      expect(results).toHaveLength(10);
      expect(results.every(r => r !== undefined)).toBe(true);
      expect(duration).toBeLessThan(500); // < 500ms for 10 concurrent requests
    });

    test('should navigate properties efficiently', async () => {
      const start = Date.now();
      await service.navigatePropertyPath('Patient', ['name', 'given']);
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(50); // < 50ms for simple navigation
    });
  });

  describe('Health Monitoring', () => {
    test('should provide health status', async () => {
      const health = await service.getHealthStatus();
      
      expect(health.healthy).toBe(true);
      expect(health.details.initialized).toBe(true);
      expect(health.details.modelProviderAvailable).toBe(true);
      expect(health.details.sampleTypeResolution).toBe(true);
    });

    test('should detect unhealthy state', async () => {
      const failingProvider = {
        getType: () => undefined // Always return undefined
      } as any;
      
      const unhealthyService = new ModelProviderService(failingProvider);
      await unhealthyService.initialize();
      
      const health = await unhealthyService.getHealthStatus();
      
      expect(health.healthy).toBe(false);
    });
  });
});