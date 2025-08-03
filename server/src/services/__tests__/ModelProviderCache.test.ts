import { expect, test, describe, beforeEach, afterEach, mock } from 'bun:test';
import { ModelProviderCache } from '../ModelProviderCache';
import { CacheManager, CacheCategory } from '../../utils/CacheManager';
import type { TypeInfo } from '@atomic-ehr/fhirpath';

describe('ModelProviderCache', () => {
  let cache: ModelProviderCache;
  let mockCacheManager: any;

  beforeEach(() => {
    mockCacheManager = {
      get: mock(() => Promise.resolve(undefined)),
      set: mock(() => Promise.resolve()),
      invalidate: mock(() => Promise.resolve(0)),
      clear: mock(() => Promise.resolve()),
      getStats: mock(() => ({
        totalEntries: 0,
        totalSize: 0,
        hitRate: 0,
        missRate: 0,
        evictionCount: 0,
        categories: {}
      }))
    };

    cache = new ModelProviderCache(mockCacheManager, {
      enabled: true,
      warmCommonTypes: false,
      warmOnStartup: false
    });
  });

  afterEach(() => {
    cache.clear();
  });

  describe('Initialization', () => {
    test('should initialize without cache warming', async () => {
      await cache.initialize();
      expect(mockCacheManager.get).not.toHaveBeenCalled();
    });

    test('should handle double initialization gracefully', async () => {
      await cache.initialize();
      await cache.initialize(); // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('TypeInfo Caching', () => {
    test('should cache TypeInfo correctly', async () => {
      const mockTypeInfo: TypeInfo = { name: 'Patient' } as TypeInfo;
      
      await cache.cacheTypeInfo('Patient', mockTypeInfo);
      
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        'type:Patient',
        mockTypeInfo,
        CacheCategory.TYPE_INFO,
        undefined,
        expect.any(Array)
      );
    });

    test('should retrieve cached TypeInfo', async () => {
      const mockTypeInfo: TypeInfo = { name: 'Patient' } as TypeInfo;
      mockCacheManager.get.mockResolvedValueOnce(mockTypeInfo);
      
      const result = await cache.getCachedTypeInfo('Patient');
      
      expect(mockCacheManager.get).toHaveBeenCalledWith('type:Patient', CacheCategory.TYPE_INFO);
      expect(result).toEqual(mockTypeInfo);
    });

    test('should handle cache miss gracefully', async () => {
      mockCacheManager.get.mockResolvedValueOnce(undefined);
      
      const result = await cache.getCachedTypeInfo('Unknown');
      
      expect(result).toBeUndefined();
    });

    test('should track cache metrics', async () => {
      await cache.initialize();
      
      // Cache hit
      mockCacheManager.get.mockResolvedValueOnce({ name: 'Patient' });
      await cache.getCachedTypeInfo('Patient');
      
      // Cache miss
      mockCacheManager.get.mockResolvedValueOnce(undefined);
      await cache.getCachedTypeInfo('Unknown');
      
      const metrics = cache.getMetrics();
      expect(metrics.typeInfoHits).toBe(1);
      expect(metrics.typeInfoMisses).toBe(1);
    });
  });

  describe('Enhanced TypeInfo Caching', () => {
    test('should cache enhanced TypeInfo with dependencies', async () => {
      const mockEnhancedInfo = {
        type: { name: 'Patient' } as TypeInfo,
        hierarchy: [{ name: 'Resource' } as TypeInfo],
        choiceTypes: [],
        constraints: { cardinality: '1..1', required: true },
        terminology: { strength: 'required' as const }
      };
      
      await cache.cacheEnhancedTypeInfo('Patient', mockEnhancedInfo);
      
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        'enhanced:Patient',
        mockEnhancedInfo,
        CacheCategory.TYPE_INFO,
        undefined,
        expect.arrayContaining(['type:Patient'])
      );
    });

    test('should retrieve cached enhanced TypeInfo', async () => {
      const mockEnhancedInfo = {
        type: { name: 'Patient' } as TypeInfo,
        hierarchy: [],
        choiceTypes: [],
        constraints: { cardinality: '1..1', required: true },
        terminology: { strength: 'required' as const }
      };
      
      mockCacheManager.get.mockResolvedValueOnce(mockEnhancedInfo);
      
      const result = await cache.getCachedEnhancedTypeInfo('Patient');
      
      expect(result).toEqual(mockEnhancedInfo);
    });
  });

  describe('Property Path Caching', () => {
    test('should cache property path navigation results', async () => {
      const mockResult = {
        isValid: true,
        finalType: { name: 'HumanName' } as TypeInfo,
        navigationPath: [{ name: 'Patient' } as TypeInfo],
        availableProperties: ['given', 'family'],
        errors: []
      };
      
      await cache.cachePropertyPath('Patient', ['name'], mockResult);
      
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        'path:Patient:name',
        mockResult,
        CacheCategory.PROPERTY_PATHS,
        undefined,
        expect.any(Array)
      );
    });

    test('should retrieve cached property path results', async () => {
      const mockResult = {
        isValid: true,
        finalType: { name: 'HumanName' } as TypeInfo,
        navigationPath: [],
        availableProperties: [],
        errors: []
      };
      
      mockCacheManager.get.mockResolvedValueOnce(mockResult);
      
      const result = await cache.getCachedPropertyPath('Patient', ['name']);
      
      expect(mockCacheManager.get).toHaveBeenCalledWith('path:Patient:name', CacheCategory.PROPERTY_PATHS);
      expect(result).toEqual(mockResult);
    });

    test('should track property path metrics', async () => {
      await cache.initialize();
      
      // Cache hit
      mockCacheManager.get.mockResolvedValueOnce({ isValid: true });
      await cache.getCachedPropertyPath('Patient', ['name']);
      
      // Cache miss
      mockCacheManager.get.mockResolvedValueOnce(undefined);
      await cache.getCachedPropertyPath('Patient', ['unknown']);
      
      const metrics = cache.getMetrics();
      expect(metrics.propertyPathHits).toBe(1);
      expect(metrics.propertyPathMisses).toBe(1);
    });
  });

  describe('Choice Type Caching', () => {
    test('should cache choice type resolutions', async () => {
      const mockBaseType: TypeInfo = { name: 'value[x]' } as TypeInfo;
      const mockChoiceTypes: TypeInfo[] = [
        { name: 'string' } as TypeInfo,
        { name: 'Quantity' } as TypeInfo
      ];
      
      await cache.cacheChoiceTypes(mockBaseType, mockChoiceTypes);
      
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        'choice:value[x]:all',
        mockChoiceTypes,
        CacheCategory.CHOICE_TYPES,
        undefined,
        expect.any(Array)
      );
    });

    test('should cache choice types with target type', async () => {
      const mockBaseType: TypeInfo = { name: 'value[x]' } as TypeInfo;
      const mockChoiceTypes: TypeInfo[] = [{ name: 'string' } as TypeInfo];
      
      await cache.cacheChoiceTypes(mockBaseType, mockChoiceTypes, 'string');
      
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        'choice:value[x]:string',
        mockChoiceTypes,
        CacheCategory.CHOICE_TYPES,
        undefined,
        expect.any(Array)
      );
    });

    test('should retrieve cached choice types', async () => {
      const mockChoiceTypes: TypeInfo[] = [{ name: 'string' } as TypeInfo];
      mockCacheManager.get.mockResolvedValueOnce(mockChoiceTypes);
      
      const mockBaseType: TypeInfo = { name: 'value[x]' } as TypeInfo;
      const result = await cache.getCachedChoiceTypes(mockBaseType);
      
      expect(result).toEqual(mockChoiceTypes);
    });

    test('should track choice type metrics', async () => {
      await cache.initialize();
      
      const mockBaseType: TypeInfo = { name: 'value[x]' } as TypeInfo;
      
      // Cache hit
      mockCacheManager.get.mockResolvedValueOnce([{ name: 'string' }]);
      await cache.getCachedChoiceTypes(mockBaseType);
      
      // Cache miss
      mockCacheManager.get.mockResolvedValueOnce(undefined);
      await cache.getCachedChoiceTypes(mockBaseType, 'unknown');
      
      const metrics = cache.getMetrics();
      expect(metrics.choiceTypeHits).toBe(1);
      expect(metrics.choiceTypeMisses).toBe(1);
    });
  });

  describe('Choice Context and Validation Caching', () => {
    test('should cache choice context', async () => {
      const mockContext = {
        baseProperty: 'value',
        resourceType: 'Observation',
        choiceTypes: [{ name: 'string' } as TypeInfo],
        availableChoices: ['valueString', 'valueQuantity']
      };
      
      await cache.cacheChoiceContext('Observation.value', mockContext);
      
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        'context:Observation.value',
        mockContext,
        CacheCategory.CHOICE_TYPES,
        5 * 60 * 1000, // 5 minutes TTL
        expect.any(Array)
      );
    });

    test('should cache choice validation results', async () => {
      const mockValidation = {
        isValid: true
      };
      
      await cache.cacheChoiceValidation('Observation', 'valueString', mockValidation);
      
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        'validation:Observation:valueString',
        mockValidation,
        CacheCategory.VALIDATIONS,
        undefined,
        ['type:Observation']
      );
    });

    test('should retrieve cached validation results', async () => {
      const mockValidation = {
        isValid: false,
        error: 'Invalid choice type',
        validChoices: ['valueString', 'valueQuantity']
      };
      
      mockCacheManager.get.mockResolvedValueOnce(mockValidation);
      
      const result = await cache.getCachedChoiceValidation('Observation', 'valueInvalid');
      
      expect(result).toEqual(mockValidation);
    });
  });

  describe('Cache Invalidation', () => {
    test('should invalidate type-related caches', async () => {
      mockCacheManager.invalidate.mockResolvedValue(5);
      
      await cache.invalidateType('Patient');
      
      expect(mockCacheManager.invalidate).toHaveBeenCalledTimes(6);
      // Should call invalidate for each pattern
      expect(mockCacheManager.invalidate).toHaveBeenCalledWith(expect.any(RegExp));
    });

    test('should invalidate property-related caches', async () => {
      mockCacheManager.invalidate.mockResolvedValue(2);
      
      await cache.invalidateProperty('Patient', 'name');
      
      expect(mockCacheManager.invalidate).toHaveBeenCalledTimes(2);
    });

    test('should handle invalidation errors gracefully', async () => {
      mockCacheManager.invalidate.mockRejectedValue(new Error('Invalidation failed'));
      
      await expect(cache.invalidateType('Patient')).resolves.not.toThrow();
    });
  });

  describe('Performance Metrics', () => {
    test('should track average hit and miss times', async () => {
      await cache.initialize();
      
      // Simulate some cache operations
      mockCacheManager.get.mockResolvedValueOnce({ name: 'Patient' });
      await cache.getCachedTypeInfo('Patient');
      
      mockCacheManager.get.mockResolvedValueOnce(undefined);
      await cache.getCachedTypeInfo('Unknown');
      
      const metrics = cache.getMetrics();
      expect(metrics.averageHitTime).toBeNumber();
      expect(metrics.averageMissTime).toBeNumber();
    });

    test('should provide cache statistics', async () => {
      const stats = cache.getStats();
      
      expect(stats).toHaveProperty('totalEntries');
      expect(stats).toHaveProperty('hitRate');
      expect(stats).toHaveProperty('categories');
    });
  });

  describe('Error Handling', () => {
    test('should handle cache operation errors gracefully', async () => {
      mockCacheManager.get.mockRejectedValue(new Error('Cache error'));
      
      const result = await cache.getCachedTypeInfo('Patient');
      
      expect(result).toBeUndefined();
    });

    test('should handle cache set errors gracefully', async () => {
      mockCacheManager.set.mockRejectedValue(new Error('Set error'));
      
      const mockTypeInfo: TypeInfo = { name: 'Patient' } as TypeInfo;
      
      await expect(cache.cacheTypeInfo('Patient', mockTypeInfo)).resolves.not.toThrow();
    });

    test('should handle clear errors gracefully', async () => {
      mockCacheManager.clear.mockRejectedValue(new Error('Clear error'));
      
      await expect(cache.clear()).resolves.not.toThrow();
    });
  });

  describe('Cache Warming', () => {
    test('should support cache warming on initialization', async () => {
      const warmingCache = new ModelProviderCache(mockCacheManager, {
        enabled: true,
        warmCommonTypes: true,
        warmOnStartup: true,
        commonTypes: ['Patient', 'Observation']
      });
      
      await warmingCache.initialize();
      
      // Warming should complete without errors
      expect(true).toBe(true);
    });

    test('should skip warming when disabled', async () => {
      const nonWarmingCache = new ModelProviderCache(mockCacheManager, {
        enabled: false
      });
      
      await nonWarmingCache.initialize();
      
      // Should initialize without warming
      expect(true).toBe(true);
    });
  });

  describe('Memory Management', () => {
    test('should provide memory usage information through stats', async () => {
      const stats = cache.getStats();
      
      expect(stats).toHaveProperty('totalSize');
      expect(stats.totalSize).toBeNumber();
    });

    test('should handle cache cleanup', async () => {
      await cache.clear();
      
      expect(mockCacheManager.clear).toHaveBeenCalled();
      
      const metrics = cache.getMetrics();
      expect(metrics.typeInfoHits).toBe(0);
      expect(metrics.typeInfoMisses).toBe(0);
    });
  });

  describe('Integration', () => {
    test('should work with real CacheManager instance', async () => {
      const realCacheManager = new CacheManager({
        memoryLimit: 1024 * 1024, // 1MB
        enablePersistence: false,
        enableMetrics: true
      });
      
      const realCache = new ModelProviderCache(realCacheManager, {
        enabled: true,
        warmOnStartup: false
      });
      
      await realCache.initialize();
      
      // Test basic operations
      const mockTypeInfo: TypeInfo = { name: 'Patient' } as TypeInfo;
      await realCache.cacheTypeInfo('Patient', mockTypeInfo);
      
      const cached = await realCache.getCachedTypeInfo('Patient');
      expect(cached).toEqual(mockTypeInfo);
      
      await realCache.clear();
      await realCacheManager.shutdown();
    });

    test('should handle concurrent access safely', async () => {
      await cache.initialize();
      
      const mockTypeInfo: TypeInfo = { name: 'Patient' } as TypeInfo;
      
      // Simulate concurrent operations
      const operations = [
        cache.cacheTypeInfo('Patient', mockTypeInfo),
        cache.getCachedTypeInfo('Patient'),
        cache.invalidateType('Patient'),
        cache.getCachedTypeInfo('Patient')
      ];
      
      await Promise.all(operations);
      
      // Should complete without errors
      expect(true).toBe(true);
    });
  });
});