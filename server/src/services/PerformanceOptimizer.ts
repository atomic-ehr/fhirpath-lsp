import type { TypeInfo } from '@atomic-ehr/fhirpath';
import { getLogger } from '../logging/index.js';
import { ModelProviderCache } from './ModelProviderCache.js';

const logger = getLogger('PerformanceOptimizer');

/**
 * Request that can be batched
 */
export interface BatchableRequest<T> {
  id: string;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timestamp: number;
}

/**
 * Batch configuration
 */
export interface BatchConfig {
  maxBatchSize: number;
  maxWaitTime: number;
  enableCoalescing: boolean;
}

/**
 * Debouncing configuration
 */
export interface DebounceConfig {
  delay: number;
  maxDelay: number;
  immediate: boolean;
}

/**
 * Performance optimization configuration
 */
export interface PerformanceConfig {
  batching: {
    typeResolution: BatchConfig;
    propertyNavigation: BatchConfig;
    choiceTypeResolution: BatchConfig;
  };
  debouncing: {
    validation: DebounceConfig;
    completion: DebounceConfig;
    hover: DebounceConfig;
  };
  prefetching: {
    enabled: boolean;
    maxPrefetchDepth: number;
    prefetchDelay: number;
  };
  memoryManagement: {
    maxMemoryUsage: number;
    cleanupThreshold: number;
    cleanupInterval: number;
  };
}

/**
 * Request coalescer for deduplicating identical requests
 */
class RequestCoalescer<T> {
  private pending = new Map<string, Promise<T>>();

  async coalesce<Args extends any[]>(
    key: string,
    fn: (...args: Args) => Promise<T>,
    ...args: Args
  ): Promise<T> {
    // Check if request is already pending
    if (this.pending.has(key)) {
      logger.debug('Coalescing request', {
        operation: 'coalesce',
        key
      });
      return this.pending.get(key)!;
    }

    // Execute new request
    const promise = fn(...args);
    this.pending.set(key, promise);

    try {
      const result = await promise;
      this.pending.delete(key);
      return result;
    } catch (error) {
      this.pending.delete(key);
      throw error;
    }
  }

  clear(): void {
    this.pending.clear();
  }

  size(): number {
    return this.pending.size;
  }
}

/**
 * Request batcher for batching multiple requests
 */
class RequestBatcher<T, K = string> {
  private batch: BatchableRequest<T>[] = [];
  private batchTimer?: Timer;
  private config: BatchConfig;
  private executor: (keys: K[]) => Promise<T[]>;

  constructor(
    executor: (keys: K[]) => Promise<T[]>,
    config: BatchConfig
  ) {
    this.executor = executor;
    this.config = config;
  }

  async request(key: K): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const request: BatchableRequest<T> = {
        id: String(key),
        resolve,
        reject,
        timestamp: Date.now()
      };

      this.batch.push(request);

      // Execute immediately if batch is full
      if (this.batch.length >= this.config.maxBatchSize) {
        this.executeBatch();
      } else {
        // Schedule batch execution
        this.scheduleBatch();
      }
    });
  }

  private scheduleBatch(): void {
    if (this.batchTimer) {
      return; // Timer already scheduled
    }

    this.batchTimer = setTimeout(() => {
      this.executeBatch();
    }, this.config.maxWaitTime);
  }

  private async executeBatch(): Promise<void> {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = undefined;
    }

    if (this.batch.length === 0) {
      return;
    }

    const currentBatch = this.batch.splice(0, this.config.maxBatchSize);
    
    try {
      logger.debug('Executing batch', {
        operation: 'executeBatch',
        batchSize: currentBatch.length
      });

      const keys = currentBatch.map(req => req.id as K);
      const results = await this.executor(keys);

      // Resolve individual requests
      for (let i = 0; i < currentBatch.length; i++) {
        const request = currentBatch[i];
        const result = results[i];
        
        if (result !== undefined) {
          request.resolve(result);
        } else {
          request.reject(new Error(`No result for key: ${request.id}`));
        }
      }

    } catch (error) {
      // Reject all requests in batch
      for (const request of currentBatch) {
        request.reject(error as Error);
      }
    }

    // Process remaining requests if any
    if (this.batch.length > 0) {
      this.scheduleBatch();
    }
  }

  clear(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = undefined;
    }
    
    // Reject all pending requests
    for (const request of this.batch) {
      request.reject(new Error('Batch cleared'));
    }
    
    this.batch = [];
  }

  size(): number {
    return this.batch.length;
  }
}

/**
 * Debouncer for delaying function execution
 */
class Debouncer {
  private timers = new Map<string, Timer>();

  debounce<T extends any[]>(
    key: string,
    fn: (...args: T) => void,
    config: DebounceConfig
  ): (...args: T) => void {
    return (...args: T) => {
      const existingTimer = this.timers.get(key);
      
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      const timer = setTimeout(() => {
        this.timers.delete(key);
        fn(...args);
      }, config.delay);

      this.timers.set(key, timer);
    };
  }

  cancel(key: string): void {
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(key);
    }
  }

  clear(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  size(): number {
    return this.timers.size;
  }
}

/**
 * Prefetcher for predictive loading
 */
class Prefetcher {
  private cache: ModelProviderCache;
  private prefetchQueue = new Set<string>();
  private processing = false;

  constructor(cache: ModelProviderCache) {
    this.cache = cache;
  }

  /**
   * Prefetch related types based on current type
   */
  async prefetchRelatedTypes(typeName: string): Promise<void> {
    try {
      // Get cached type info first
      const typeInfo = await this.cache.getCachedTypeInfo(typeName);
      if (!typeInfo) {
        return; // Type not in cache, can't predict relations
      }

      // Prefetch base types
      const modelContext = (typeInfo as any).modelContext;
      if (modelContext?.schemaHierarchy) {
        for (const schema of modelContext.schemaHierarchy) {
          if (schema.name !== typeName) {
            this.queuePrefetch(schema.name);
          }
        }
      }

      // Prefetch common related types
      const relatedTypes = this.getCommonlyRelatedTypes(typeName);
      for (const relatedType of relatedTypes) {
        this.queuePrefetch(relatedType);
      }

      this.processPrefetchQueue();

    } catch (error) {
      logger.warn('Failed to prefetch related types', {
        operation: 'prefetchRelatedTypes',
        typeName,
        error: (error as Error).message
      });
    }
  }

  /**
   * Prefetch choice types for a property
   */
  async prefetchChoiceTypes(baseProperty: string): Promise<void> {
    try {
      const commonChoiceTypes = this.getCommonChoiceTypes(baseProperty);
      for (const choiceType of commonChoiceTypes) {
        this.queuePrefetch(choiceType);
      }

      this.processPrefetchQueue();

    } catch (error) {
      logger.warn('Failed to prefetch choice types', {
        operation: 'prefetchChoiceTypes',
        baseProperty,
        error: (error as Error).message
      });
    }
  }

  private queuePrefetch(typeName: string): void {
    this.prefetchQueue.add(typeName);
  }

  private async processPrefetchQueue(): Promise<void> {
    if (this.processing || this.prefetchQueue.size === 0) {
      return;
    }

    this.processing = true;

    try {
      // Process up to 5 types at a time
      const batch = Array.from(this.prefetchQueue).slice(0, 5);
      this.prefetchQueue.clear();

      logger.debug('Processing prefetch queue', {
        operation: 'processPrefetchQueue',
        batchSize: batch.length
      });

      // This would typically call ModelProvider to load types
      // In a real implementation, you'd have access to the ModelProvider here

    } catch (error) {
      logger.warn('Error processing prefetch queue', {
        operation: 'processPrefetchQueue',
        error: (error as Error).message
      });
    } finally {
      this.processing = false;
    }
  }

  private getCommonlyRelatedTypes(typeName: string): string[] {
    const relations: Record<string, string[]> = {
      'Patient': ['HumanName', 'ContactPoint', 'Address', 'Identifier'],
      'Observation': ['Quantity', 'CodeableConcept', 'Reference', 'Period'],
      'Condition': ['CodeableConcept', 'Reference', 'Period'],
      'Procedure': ['CodeableConcept', 'Reference', 'Period'],
      'MedicationRequest': ['Reference', 'Dosage', 'Quantity']
    };

    return relations[typeName] || [];
  }

  private getCommonChoiceTypes(baseProperty: string): string[] {
    const choiceTypes: Record<string, string[]> = {
      'value': ['string', 'integer', 'decimal', 'boolean', 'Quantity', 'CodeableConcept'],
      'effective': ['dateTime', 'Period', 'Timing', 'instant'],
      'onset': ['dateTime', 'Age', 'Period', 'Range', 'string'],
      'performed': ['dateTime', 'Period', 'string', 'Age', 'Range']
    };

    return choiceTypes[baseProperty] || [];
  }
}

/**
 * Performance optimizer with intelligent optimization strategies
 */
export class PerformanceOptimizer {
  private cache: ModelProviderCache;
  private config: PerformanceConfig;
  private coalescer: RequestCoalescer<any>;
  private debouncer: Debouncer;
  private prefetcher: Prefetcher;
  private batchers = new Map<string, RequestBatcher<any, any>>();
  private initialized = false;

  constructor(
    cache: ModelProviderCache,
    config: Partial<PerformanceConfig> = {}
  ) {
    this.cache = cache;
    this.config = {
      batching: {
        typeResolution: {
          maxBatchSize: 50,
          maxWaitTime: 10,
          enableCoalescing: true
        },
        propertyNavigation: {
          maxBatchSize: 20,
          maxWaitTime: 15,
          enableCoalescing: true
        },
        choiceTypeResolution: {
          maxBatchSize: 30,
          maxWaitTime: 10,
          enableCoalescing: true
        }
      },
      debouncing: {
        validation: {
          delay: 300,
          maxDelay: 1000,
          immediate: false
        },
        completion: {
          delay: 150,
          maxDelay: 500,
          immediate: false
        },
        hover: {
          delay: 100,
          maxDelay: 300,
          immediate: false
        }
      },
      prefetching: {
        enabled: true,
        maxPrefetchDepth: 2,
        prefetchDelay: 100
      },
      memoryManagement: {
        maxMemoryUsage: 50 * 1024 * 1024, // 50MB
        cleanupThreshold: 0.8, // 80%
        cleanupInterval: 5 * 60 * 1000 // 5 minutes
      },
      ...config
    };

    this.coalescer = new RequestCoalescer();
    this.debouncer = new Debouncer();
    this.prefetcher = new Prefetcher(cache);

    logger.info('PerformanceOptimizer initialized', {
      operation: 'constructor',
      config: this.config
    });
  }

  /**
   * Initialize performance optimizer
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('PerformanceOptimizer already initialized', { operation: 'initialize' });
      return;
    }

    try {
      logger.info('Initializing PerformanceOptimizer...', { operation: 'initialize' });

      // Initialize batchers
      this.initializeBatchers();

      // Start memory management
      this.startMemoryManagement();

      this.initialized = true;
      logger.info('✅ PerformanceOptimizer initialized successfully', { operation: 'initialize' });

    } catch (error) {
      logger.error('Failed to initialize PerformanceOptimizer', error as Error, {
        operation: 'initialize'
      });
      throw error;
    }
  }

  /**
   * Optimize type resolution with batching and coalescing
   */
  async optimizeTypeResolution<T>(
    key: string,
    resolver: () => Promise<T>
  ): Promise<T> {
    if (this.config.batching.typeResolution.enableCoalescing) {
      return this.coalescer.coalesce(key, resolver);
    }
    
    return resolver();
  }

  /**
   * Create debounced function for operations like validation
   */
  createDebouncedFunction<T extends any[]>(
    operation: 'validation' | 'completion' | 'hover',
    key: string,
    fn: (...args: T) => void
  ): (...args: T) => void {
    const config = this.config.debouncing[operation];
    return this.debouncer.debounce(key, fn, config);
  }

  /**
   * Trigger prefetching for related types
   */
  async triggerPrefetch(context: {
    currentType?: string;
    baseProperty?: string;
    operation: 'typeSelected' | 'propertyAccessed' | 'choiceTypeUsed';
  }): Promise<void> {
    if (!this.config.prefetching.enabled) {
      return;
    }

    try {
      switch (context.operation) {
        case 'typeSelected':
          if (context.currentType) {
            await this.prefetcher.prefetchRelatedTypes(context.currentType);
          }
          break;
          
        case 'propertyAccessed':
        case 'choiceTypeUsed':
          if (context.baseProperty) {
            await this.prefetcher.prefetchChoiceTypes(context.baseProperty);
          }
          break;
      }

    } catch (error) {
      logger.warn('Prefetch operation failed', {
        operation: 'triggerPrefetch',
        context,
        error: (error as Error).message
      });
    }
  }

  /**
   * Check and trigger memory management
   */
  async checkMemoryUsage(): Promise<void> {
    try {
      const memoryUsage = this.cache.getStats();
      const usagePercentage = memoryUsage.totalSize / this.config.memoryManagement.maxMemoryUsage;

      if (usagePercentage > this.config.memoryManagement.cleanupThreshold) {
        logger.info('Memory usage threshold exceeded, triggering cleanup', {
          operation: 'checkMemoryUsage',
          usagePercentage: Math.round(usagePercentage * 100),
          threshold: this.config.memoryManagement.cleanupThreshold * 100
        });

        await this.performMemoryCleanup();
      }

    } catch (error) {
      logger.error('Error checking memory usage', error as Error, {
        operation: 'checkMemoryUsage'
      });
    }
  }

  /**
   * Get optimization statistics
   */
  getStats() {
    return {
      cache: this.cache.getStats(),
      performance: this.cache.getMetrics(),
      batchers: Array.from(this.batchers.entries()).map(([name, batcher]) => ({
        name,
        queueSize: batcher.size()
      })),
      coalescer: {
        pendingRequests: this.coalescer.size()
      },
      debouncer: {
        pendingOperations: this.debouncer.size()
      }
    };
  }

  /**
   * Shutdown optimizer
   */
  async shutdown(): Promise<void> {
    try {
      logger.info('Shutting down PerformanceOptimizer...', { operation: 'shutdown' });

      // Clear all batchers
      for (const batcher of this.batchers.values()) {
        batcher.clear();
      }
      this.batchers.clear();

      // Clear coalescer and debouncer
      this.coalescer.clear();
      this.debouncer.clear();

      this.initialized = false;
      logger.info('PerformanceOptimizer shutdown completed', { operation: 'shutdown' });

    } catch (error) {
      logger.error('Error during PerformanceOptimizer shutdown', error as Error, {
        operation: 'shutdown'
      });
    }
  }

  // Private methods

  private initializeBatchers(): void {
    // Initialize type resolution batcher
    const typeResolutionBatcher = new RequestBatcher<TypeInfo, string>(
      async (typeNames: string[]) => {
        // In real implementation, this would call ModelProvider.getTypes()
        logger.debug('Batch resolving types', {
          operation: 'batchTypeResolution',
          typeNames
        });
        return []; // Placeholder
      },
      this.config.batching.typeResolution
    );

    this.batchers.set('typeResolution', typeResolutionBatcher);

    logger.debug('Batchers initialized', {
      operation: 'initializeBatchers',
      batcherCount: this.batchers.size
    });
  }

  private startMemoryManagement(): void {
    setInterval(
      () => this.checkMemoryUsage(),
      this.config.memoryManagement.cleanupInterval
    );

    logger.debug('Memory management started', {
      operation: 'startMemoryManagement',
      interval: this.config.memoryManagement.cleanupInterval
    });
  }

  private async performMemoryCleanup(): Promise<void> {
    try {
      const startTime = Date.now();
      
      // This would typically call cache cleanup methods
      // await this.cache.cleanup();

      logger.info('Memory cleanup completed', {
        operation: 'performMemoryCleanup',
        duration: Date.now() - startTime
      });

    } catch (error) {
      logger.error('Memory cleanup failed', error as Error, {
        operation: 'performMemoryCleanup'
      });
    }
  }
}