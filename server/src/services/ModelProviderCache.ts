import type { TypeInfo } from '@atomic-ehr/fhirpath';
import { getLogger } from '../logging/index.js';
import { CacheManager, CacheCategory } from '../utils/CacheManager.js';
import type {
  EnhancedTypeInfo,
  NavigationResult,
  ChoiceContext,
  ChoiceValidationResult
} from './ModelProviderService.js';

const logger = getLogger('ModelProviderCache');

/**
 * Cache keys for different ModelProvider operations
 */
interface CacheKeys {
  typeInfo: (typeName: string) => string;
  enhancedTypeInfo: (typeName: string) => string;
  propertyPath: (rootType: string, path: string[]) => string;
  choiceTypes: (typeInfo: TypeInfo, targetType?: string) => string;
  choiceContext: (expression: string) => string;
  choiceValidation: (resourceType: string, property: string) => string;
  typeHierarchy: (typeName: string) => string;
  availableProperties: (typeName: string) => string;
}

/**
 * Performance metrics for cache operations
 */
interface CachePerformanceMetrics {
  typeInfoHits: number;
  typeInfoMisses: number;
  propertyPathHits: number;
  propertyPathMisses: number;
  choiceTypeHits: number;
  choiceTypeMisses: number;
  averageHitTime: number;
  averageMissTime: number;
}

/**
 * Cache warming strategy configuration
 */
interface CacheWarmingConfig {
  enabled: boolean;
  warmCommonTypes: boolean;
  warmWorkspaceTypes: boolean;
  warmOnStartup: boolean;
  commonTypes: string[];
  maxWarmingTime: number;
}

/**
 * ModelProvider cache with intelligent caching strategies
 */
export class ModelProviderCache {
  private cacheManager: CacheManager;
  private metrics: CachePerformanceMetrics;
  private warmingConfig: CacheWarmingConfig;
  private initialized = false;

  // Cache key generators
  private keys: CacheKeys = {
    typeInfo: (typeName: string) => `type:${typeName}`,
    enhancedTypeInfo: (typeName: string) => `enhanced:${typeName}`,
    propertyPath: (rootType: string, path: string[]) => `path:${rootType}:${path.join('.')}`,
    choiceTypes: (typeInfo: TypeInfo, targetType?: string) => 
      `choice:${typeInfo.name}:${targetType || 'all'}`,
    choiceContext: (expression: string) => `context:${expression}`,
    choiceValidation: (resourceType: string, property: string) => 
      `validation:${resourceType}:${property}`,
    typeHierarchy: (typeName: string) => `hierarchy:${typeName}`,
    availableProperties: (typeName: string) => `properties:${typeName}`
  };

  constructor(
    cacheManager: CacheManager,
    warmingConfig: Partial<CacheWarmingConfig> = {}
  ) {
    this.cacheManager = cacheManager;
    this.metrics = {
      typeInfoHits: 0,
      typeInfoMisses: 0,
      propertyPathHits: 0,
      propertyPathMisses: 0,
      choiceTypeHits: 0,
      choiceTypeMisses: 0,
      averageHitTime: 0,
      averageMissTime: 0
    };

    this.warmingConfig = {
      enabled: true,
      warmCommonTypes: true,
      warmWorkspaceTypes: false,
      warmOnStartup: true,
      commonTypes: [
        'Patient', 'Observation', 'Condition', 'Procedure', 'MedicationRequest',
        'DiagnosticReport', 'Encounter', 'Practitioner', 'Organization',
        'Resource', 'DomainResource', 'Element'
      ],
      maxWarmingTime: 5000, // 5 seconds
      ...warmingConfig
    };

    logger.info('ModelProviderCache initialized', {
      operation: 'constructor',
      warmingConfig: this.warmingConfig
    });
  }

  /**
   * Initialize cache and perform warming if configured
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('ModelProviderCache already initialized', { operation: 'initialize' });
      return;
    }

    try {
      logger.info('Initializing ModelProviderCache...', { operation: 'initialize' });

      if (this.warmingConfig.enabled && this.warmingConfig.warmOnStartup) {
        await this.warmCache();
      }

      this.initialized = true;
      logger.info('✅ ModelProviderCache initialized successfully', { operation: 'initialize' });

    } catch (error) {
      logger.error('Failed to initialize ModelProviderCache', error as Error, {
        operation: 'initialize'
      });
      throw error;
    }
  }

  /**
   * Cache TypeInfo with intelligent dependencies
   */
  async cacheTypeInfo(typeName: string, typeInfo: TypeInfo): Promise<void> {
    try {
      const key = this.keys.typeInfo(typeName);
      const dependencies = this.extractTypeInfoDependencies(typeInfo);
      
      await this.cacheManager.set(
        key,
        typeInfo,
        CacheCategory.TYPE_INFO,
        undefined, // Use default TTL
        dependencies
      );

      logger.debug('Cached TypeInfo', {
        operation: 'cacheTypeInfo',
        typeName,
        dependencies: dependencies.length
      });

    } catch (error) {
      logger.error('Failed to cache TypeInfo', error as Error, {
        operation: 'cacheTypeInfo',
        typeName
      });
    }
  }

  /**
   * Get cached TypeInfo
   */
  async getCachedTypeInfo(typeName: string): Promise<TypeInfo | undefined> {
    const startTime = Date.now();

    try {
      const key = this.keys.typeInfo(typeName);
      const result = await this.cacheManager.get<TypeInfo>(key, CacheCategory.TYPE_INFO);

      if (result) {
        this.metrics.typeInfoHits++;
        this.updateAverageHitTime(Date.now() - startTime);
        
        logger.debug('TypeInfo cache hit', {
          operation: 'getCachedTypeInfo',
          typeName,
          duration: Date.now() - startTime
        });
      } else {
        this.metrics.typeInfoMisses++;
        this.updateAverageMissTime(Date.now() - startTime);
        
        logger.debug('TypeInfo cache miss', {
          operation: 'getCachedTypeInfo',
          typeName,
          duration: Date.now() - startTime
        });
      }

      return result;

    } catch (error) {
      this.metrics.typeInfoMisses++;
      logger.error('Error getting cached TypeInfo', error as Error, {
        operation: 'getCachedTypeInfo',
        typeName
      });
      return undefined;
    }
  }

  /**
   * Cache enhanced type information
   */
  async cacheEnhancedTypeInfo(typeName: string, enhancedInfo: EnhancedTypeInfo): Promise<void> {
    try {
      const key = this.keys.enhancedTypeInfo(typeName);
      const dependencies = [
        this.keys.typeInfo(typeName),
        ...this.extractEnhancedTypeInfoDependencies(enhancedInfo)
      ];

      await this.cacheManager.set(
        key,
        enhancedInfo,
        CacheCategory.TYPE_INFO,
        undefined,
        dependencies
      );

      logger.debug('Cached enhanced TypeInfo', {
        operation: 'cacheEnhancedTypeInfo',
        typeName,
        dependencies: dependencies.length
      });

    } catch (error) {
      logger.error('Failed to cache enhanced TypeInfo', error as Error, {
        operation: 'cacheEnhancedTypeInfo',
        typeName
      });
    }
  }

  /**
   * Get cached enhanced type information
   */
  async getCachedEnhancedTypeInfo(typeName: string): Promise<EnhancedTypeInfo | undefined> {
    try {
      const key = this.keys.enhancedTypeInfo(typeName);
      return await this.cacheManager.get<EnhancedTypeInfo>(key, CacheCategory.TYPE_INFO);
    } catch (error) {
      logger.error('Error getting cached enhanced TypeInfo', error as Error, {
        operation: 'getCachedEnhancedTypeInfo',
        typeName
      });
      return undefined;
    }
  }

  /**
   * Cache property path navigation result
   */
  async cachePropertyPath(
    rootType: string,
    path: string[],
    result: NavigationResult
  ): Promise<void> {
    try {
      const key = this.keys.propertyPath(rootType, path);
      const dependencies = this.extractNavigationDependencies(rootType, path, result);

      await this.cacheManager.set(
        key,
        result,
        CacheCategory.PROPERTY_PATHS,
        undefined,
        dependencies
      );

      logger.debug('Cached property path', {
        operation: 'cachePropertyPath',
        rootType,
        path: path.join('.'),
        isValid: result.isValid
      });

    } catch (error) {
      logger.error('Failed to cache property path', error as Error, {
        operation: 'cachePropertyPath',
        rootType,
        path: path.join('.')
      });
    }
  }

  /**
   * Get cached property path navigation result
   */
  async getCachedPropertyPath(
    rootType: string,
    path: string[]
  ): Promise<NavigationResult | undefined> {
    const startTime = Date.now();

    try {
      const key = this.keys.propertyPath(rootType, path);
      const result = await this.cacheManager.get<NavigationResult>(key, CacheCategory.PROPERTY_PATHS);

      if (result) {
        this.metrics.propertyPathHits++;
        logger.debug('Property path cache hit', {
          operation: 'getCachedPropertyPath',
          rootType,
          path: path.join('.'),
          duration: Date.now() - startTime
        });
      } else {
        this.metrics.propertyPathMisses++;
        logger.debug('Property path cache miss', {
          operation: 'getCachedPropertyPath',
          rootType,
          path: path.join('.'),
          duration: Date.now() - startTime
        });
      }

      return result;

    } catch (error) {
      this.metrics.propertyPathMisses++;
      logger.error('Error getting cached property path', error as Error, {
        operation: 'getCachedPropertyPath',
        rootType,
        path: path.join('.')
      });
      return undefined;
    }
  }

  /**
   * Cache choice type resolution
   */
  async cacheChoiceTypes(
    typeInfo: TypeInfo,
    choiceTypes: TypeInfo[],
    targetType?: string
  ): Promise<void> {
    try {
      const key = this.keys.choiceTypes(typeInfo, targetType);
      const dependencies = this.extractChoiceTypeDependencies(typeInfo, choiceTypes);

      await this.cacheManager.set(
        key,
        choiceTypes,
        CacheCategory.CHOICE_TYPES,
        undefined,
        dependencies
      );

      logger.debug('Cached choice types', {
        operation: 'cacheChoiceTypes',
        baseType: typeInfo.name,
        targetType,
        choiceCount: choiceTypes.length
      });

    } catch (error) {
      logger.error('Failed to cache choice types', error as Error, {
        operation: 'cacheChoiceTypes',
        baseType: typeInfo.name,
        targetType
      });
    }
  }

  /**
   * Get cached choice type resolution
   */
  async getCachedChoiceTypes(
    typeInfo: TypeInfo,
    targetType?: string
  ): Promise<TypeInfo[] | undefined> {
    const startTime = Date.now();

    try {
      const key = this.keys.choiceTypes(typeInfo, targetType);
      const result = await this.cacheManager.get<TypeInfo[]>(key, CacheCategory.CHOICE_TYPES);

      if (result) {
        this.metrics.choiceTypeHits++;
        logger.debug('Choice types cache hit', {
          operation: 'getCachedChoiceTypes',
          baseType: typeInfo.name,
          targetType,
          duration: Date.now() - startTime
        });
      } else {
        this.metrics.choiceTypeMisses++;
        logger.debug('Choice types cache miss', {
          operation: 'getCachedChoiceTypes',
          baseType: typeInfo.name,
          targetType,
          duration: Date.now() - startTime
        });
      }

      return result;

    } catch (error) {
      this.metrics.choiceTypeMisses++;
      logger.error('Error getting cached choice types', error as Error, {
        operation: 'getCachedChoiceTypes',
        baseType: typeInfo.name,
        targetType
      });
      return undefined;
    }
  }

  /**
   * Cache choice context detection
   */
  async cacheChoiceContext(expression: string, context: ChoiceContext): Promise<void> {
    try {
      const key = this.keys.choiceContext(expression);
      const dependencies = [
        this.keys.typeInfo(context.resourceType),
        ...context.choiceTypes.map(type => this.keys.typeInfo(type.name || ''))
      ];

      await this.cacheManager.set(
        key,
        context,
        CacheCategory.CHOICE_TYPES,
        5 * 60 * 1000, // 5 minutes TTL (context-sensitive)
        dependencies
      );

    } catch (error) {
      logger.error('Failed to cache choice context', error as Error, {
        operation: 'cacheChoiceContext',
        expression
      });
    }
  }

  /**
   * Get cached choice context
   */
  async getCachedChoiceContext(expression: string): Promise<ChoiceContext | undefined> {
    try {
      const key = this.keys.choiceContext(expression);
      return await this.cacheManager.get<ChoiceContext>(key, CacheCategory.CHOICE_TYPES);
    } catch (error) {
      logger.error('Error getting cached choice context', error as Error, {
        operation: 'getCachedChoiceContext',
        expression
      });
      return undefined;
    }
  }

  /**
   * Cache choice property validation
   */
  async cacheChoiceValidation(
    resourceType: string,
    property: string,
    result: ChoiceValidationResult
  ): Promise<void> {
    try {
      const key = this.keys.choiceValidation(resourceType, property);
      const dependencies = [this.keys.typeInfo(resourceType)];

      await this.cacheManager.set(
        key,
        result,
        CacheCategory.VALIDATIONS,
        undefined,
        dependencies
      );

    } catch (error) {
      logger.error('Failed to cache choice validation', error as Error, {
        operation: 'cacheChoiceValidation',
        resourceType,
        property
      });
    }
  }

  /**
   * Get cached choice property validation
   */
  async getCachedChoiceValidation(
    resourceType: string,
    property: string
  ): Promise<ChoiceValidationResult | undefined> {
    try {
      const key = this.keys.choiceValidation(resourceType, property);
      return await this.cacheManager.get<ChoiceValidationResult>(key, CacheCategory.VALIDATIONS);
    } catch (error) {
      logger.error('Error getting cached choice validation', error as Error, {
        operation: 'getCachedChoiceValidation',
        resourceType,
        property
      });
      return undefined;
    }
  }

  /**
   * Invalidate caches related to a specific type
   */
  async invalidateType(typeName: string): Promise<void> {
    try {
      const patterns = [
        new RegExp(`^type:${typeName}$`),
        new RegExp(`^enhanced:${typeName}$`),
        new RegExp(`^path:${typeName}:`),
        new RegExp(`^choice:${typeName}:`),
        new RegExp(`^hierarchy:${typeName}$`),
        new RegExp(`^properties:${typeName}$`)
      ];

      let totalInvalidated = 0;
      for (const pattern of patterns) {
        totalInvalidated += await this.cacheManager.invalidate(pattern);
      }

      logger.info('Invalidated type-related caches', {
        operation: 'invalidateType',
        typeName,
        invalidatedCount: totalInvalidated
      });

    } catch (error) {
      logger.error('Error invalidating type caches', error as Error, {
        operation: 'invalidateType',
        typeName
      });
    }
  }

  /**
   * Invalidate caches related to a specific property
   */
  async invalidateProperty(typeName: string, propertyName: string): Promise<void> {
    try {
      const patterns = [
        new RegExp(`^path:${typeName}:.*${propertyName}`),
        new RegExp(`^validation:${typeName}:${propertyName}$`)
      ];

      let totalInvalidated = 0;
      for (const pattern of patterns) {
        totalInvalidated += await this.cacheManager.invalidate(pattern);
      }

      logger.info('Invalidated property-related caches', {
        operation: 'invalidateProperty',
        typeName,
        propertyName,
        invalidatedCount: totalInvalidated
      });

    } catch (error) {
      logger.error('Error invalidating property caches', error as Error, {
        operation: 'invalidateProperty',
        typeName,
        propertyName
      });
    }
  }

  /**
   * Warm cache with commonly used types
   */
  async warmCache(): Promise<void> {
    if (!this.warmingConfig.enabled) {
      return;
    }

    const startTime = Date.now();
    
    try {
      logger.info('Starting cache warming...', {
        operation: 'warmCache',
        commonTypesCount: this.warmingConfig.commonTypes.length
      });

      // This would typically involve pre-loading common types
      // In a real implementation, you'd call the ModelProvider here
      
      const duration = Date.now() - startTime;
      logger.info('Cache warming completed', {
        operation: 'warmCache',
        duration,
        typesWarmed: this.warmingConfig.commonTypes.length
      });

    } catch (error) {
      logger.error('Cache warming failed', error as Error, {
        operation: 'warmCache'
      });
    }
  }

  /**
   * Get cache performance metrics
   */
  getMetrics(): CachePerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return this.cacheManager.getStats();
  }

  /**
   * Clear all caches
   */
  async clear(): Promise<void> {
    try {
      await this.cacheManager.clear();
      
      // Reset metrics
      this.metrics = {
        typeInfoHits: 0,
        typeInfoMisses: 0,
        propertyPathHits: 0,
        propertyPathMisses: 0,
        choiceTypeHits: 0,
        choiceTypeMisses: 0,
        averageHitTime: 0,
        averageMissTime: 0
      };

      logger.info('ModelProviderCache cleared', { operation: 'clear' });

    } catch (error) {
      logger.error('Error clearing ModelProviderCache', error as Error, {
        operation: 'clear'
      });
    }
  }

  // Private helper methods

  private extractTypeInfoDependencies(typeInfo: TypeInfo): string[] {
    const dependencies: string[] = [];
    
    // Add base type dependency
    if ((typeInfo as any).baseType) {
      dependencies.push(this.keys.typeInfo((typeInfo as any).baseType));
    }

    // Add hierarchy dependencies
    const modelContext = (typeInfo as any).modelContext;
    if (modelContext?.schemaHierarchy) {
      for (const schema of modelContext.schemaHierarchy) {
        if (schema.name !== typeInfo.name) {
          dependencies.push(this.keys.typeInfo(schema.name));
        }
      }
    }

    return dependencies;
  }

  private extractEnhancedTypeInfoDependencies(enhancedInfo: EnhancedTypeInfo): string[] {
    const dependencies: string[] = [];

    // Add hierarchy dependencies
    for (const hierarchyType of enhancedInfo.hierarchy) {
      dependencies.push(this.keys.typeInfo(hierarchyType.name || ''));
    }

    // Add choice type dependencies
    for (const choiceType of enhancedInfo.choiceTypes) {
      dependencies.push(this.keys.typeInfo(choiceType.name || ''));
    }

    return dependencies;
  }

  private extractNavigationDependencies(
    rootType: string,
    path: string[],
    result: NavigationResult
  ): string[] {
    const dependencies = [this.keys.typeInfo(rootType)];

    // Add dependencies for each type in the navigation path
    for (const typeInfo of result.navigationPath) {
      dependencies.push(this.keys.typeInfo(typeInfo.name || ''));
    }

    // Add final type dependency
    if (result.finalType) {
      dependencies.push(this.keys.typeInfo(result.finalType.name || ''));
    }

    return dependencies;
  }

  private extractChoiceTypeDependencies(baseType: TypeInfo, choiceTypes: TypeInfo[]): string[] {
    const dependencies = [this.keys.typeInfo(baseType.name || '')];

    for (const choiceType of choiceTypes) {
      dependencies.push(this.keys.typeInfo(choiceType.name || ''));
    }

    return dependencies;
  }

  private updateAverageHitTime(duration: number): void {
    const totalHits = this.metrics.typeInfoHits + this.metrics.propertyPathHits + this.metrics.choiceTypeHits;
    this.metrics.averageHitTime = ((this.metrics.averageHitTime * (totalHits - 1)) + duration) / totalHits;
  }

  private updateAverageMissTime(duration: number): void {
    const totalMisses = this.metrics.typeInfoMisses + this.metrics.propertyPathMisses + this.metrics.choiceTypeMisses;
    this.metrics.averageMissTime = ((this.metrics.averageMissTime * (totalMisses - 1)) + duration) / totalMisses;
  }
}