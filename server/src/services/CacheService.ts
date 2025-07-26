import { LRUCache } from 'lru-cache';
import { PerformanceCache } from './PerformanceCache';
import { getMemoryManager } from './MemoryManager';

export interface CacheOptions {
  maxSize: number;
  ttl?: number; // Time to live in milliseconds
}

export interface PerformanceMetrics {
  cacheHits: number;
  cacheMisses: number;
  totalRequests: number;
  hitRate: number;
}

export class CacheService {
  private parseCache: LRUCache<string, any>;
  private completionCache: LRUCache<string, any>;
  private validationCache: LRUCache<string, any>;
  private semanticTokensCache: LRUCache<string, any>;
  private hoverCache: LRUCache<string, any>;
  
  // New performance caches
  private performanceParseCache: PerformanceCache<string, any>;
  private performanceCompletionCache: PerformanceCache<string, any>;
  
  private metrics: Map<string, PerformanceMetrics> = new Map();
  private memoryManager = getMemoryManager();

  constructor() {
    // Initialize caches with different sizes based on expected usage
    this.parseCache = new LRUCache({
      max: 500, // Parse results cache
      ttl: 5 * 60 * 1000, // 5 minutes
      allowStale: true
    });

    this.completionCache = new LRUCache({
      max: 200, // Completion cache
      ttl: 2 * 60 * 1000, // 2 minutes
      allowStale: true
    });

    this.validationCache = new LRUCache({
      max: 300, // Validation cache
      ttl: 3 * 60 * 1000, // 3 minutes
      allowStale: true
    });

    this.semanticTokensCache = new LRUCache({
      max: 400, // Semantic tokens cache
      ttl: 5 * 60 * 1000, // 5 minutes
      allowStale: true
    });

    this.hoverCache = new LRUCache({
      max: 150, // Hover cache
      ttl: 10 * 60 * 1000, // 10 minutes
      allowStale: true
    });

    // Initialize performance caches
    const { LRUCache: PerformanceLRUCache } = require('./PerformanceCache');
    this.performanceParseCache = new PerformanceLRUCache({ maxSize: 50 * 1024 * 1024, maxEntries: 500 });
    this.performanceCompletionCache = new PerformanceLRUCache({ maxSize: 20 * 1024 * 1024, maxEntries: 200 });

    // Initialize metrics
    this.initializeMetrics();

    // Setup memory pressure handling
    this.setupMemoryHandling();
  }

  private initializeMetrics(): void {
    const cacheTypes = ['parse', 'completion', 'validation', 'semanticTokens', 'hover'];
    cacheTypes.forEach(type => {
      this.metrics.set(type, {
        cacheHits: 0,
        cacheMisses: 0,
        totalRequests: 0,
        hitRate: 0
      });
    });
  }

  private setupMemoryHandling(): void {
    // Register with memory manager
    this.memoryManager.registerCache('parseCache', () => ({
      cacheName: 'parseCache',
      size: this.parseCache.calculatedSize,
      entries: this.parseCache.size,
      hitRate: this.metrics.get('parse')?.hitRate || 0,
      itemCount: this.parseCache.size,
      estimatedMemory: this.parseCache.calculatedSize
    }));

    this.memoryManager.registerCache('performanceParseCache', () => ({
      cacheName: 'performanceParseCache',
      size: this.performanceParseCache.getStats().size,
      entries: this.performanceParseCache.size(),
      hitRate: this.performanceParseCache.getStats().hitRate,
      itemCount: this.performanceParseCache.size(),
      estimatedMemory: this.performanceParseCache.getStats().size
    }));

    // Handle memory pressure
    this.memoryManager.onMemoryPressure(() => {
      this.handleMemoryPressure();
    });

    // Start monitoring
    this.memoryManager.startMonitoring();
  }

  private handleMemoryPressure(): void {
    // Clear least important caches first
    this.hoverCache.clear();
    this.completionCache.clear();
    
    // Trim other caches
    this.trimCache();
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  }

  // Parse cache methods
  getParsed(expression: string): any | null {
    const result = this.parseCache.get(expression);
    this.updateMetrics('parse', result !== undefined);
    return result || null;
  }

  setParsed(expression: string, result: any): void {
    this.parseCache.set(expression, result);
  }

  // Completion cache methods
  getCompletion(key: string): any | null {
    const result = this.completionCache.get(key);
    this.updateMetrics('completion', result !== undefined);
    return result || null;
  }

  setCompletion(key: string, result: any): void {
    this.completionCache.set(key, result);
  }

  // Validation cache methods
  getValidation(expression: string): any | null {
    const result = this.validationCache.get(expression);
    this.updateMetrics('validation', result !== undefined);
    return result || null;
  }

  setValidation(expression: string, result: any): void {
    this.validationCache.set(expression, result);
  }

  // Semantic tokens cache methods
  getSemanticTokens(key: string): any | null {
    const result = this.semanticTokensCache.get(key);
    this.updateMetrics('semanticTokens', result !== undefined);
    return result || null;
  }

  setSemanticTokens(key: string, result: any): void {
    this.semanticTokensCache.set(key, result);
  }

  // Hover cache methods
  getHover(key: string): any | null {
    const result = this.hoverCache.get(key);
    this.updateMetrics('hover', result !== undefined);
    return result || null;
  }

  setHover(key: string, result: any): void {
    this.hoverCache.set(key, result);
  }

  // Utility methods
  private updateMetrics(cacheType: string, isHit: boolean): void {
    const metrics = this.metrics.get(cacheType);
    if (metrics) {
      metrics.totalRequests++;
      if (isHit) {
        metrics.cacheHits++;
      } else {
        metrics.cacheMisses++;
      }
      metrics.hitRate = metrics.totalRequests > 0 ? 
        (metrics.cacheHits / metrics.totalRequests) * 100 : 0;
    }
  }

  // Generate cache keys
  generateCompletionKey(uri: string, position: { line: number; character: number }, triggerCharacter?: string): string {
    return `${uri}:${position.line}:${position.character}:${triggerCharacter || ''}`;
  }

  generateSemanticTokensKey(uri: string, version: number): string {
    return `${uri}:${version}`;
  }

  generateHoverKey(uri: string, position: { line: number; character: number }): string {
    return `${uri}:${position.line}:${position.character}`;
  }

  // Performance and maintenance methods
  getMetrics(): Record<string, PerformanceMetrics> {
    const result: Record<string, PerformanceMetrics> = {};
    this.metrics.forEach((metrics, key) => {
      result[key] = { ...metrics };
    });
    return result;
  }

  getCacheStats(): Record<string, { size: number; maxSize: number }> {
    return {
      parse: {
        size: this.parseCache.size,
        maxSize: this.parseCache.max
      },
      completion: {
        size: this.completionCache.size,
        maxSize: this.completionCache.max
      },
      validation: {
        size: this.validationCache.size,
        maxSize: this.validationCache.max
      },
      semanticTokens: {
        size: this.semanticTokensCache.size,
        maxSize: this.semanticTokensCache.max
      },
      hover: {
        size: this.hoverCache.size,
        maxSize: this.hoverCache.max
      }
    };
  }

  clearCache(cacheType?: string): void {
    if (cacheType) {
      switch (cacheType) {
        case 'parse':
          this.parseCache.clear();
          break;
        case 'completion':
          this.completionCache.clear();
          break;
        case 'validation':
          this.validationCache.clear();
          break;
        case 'semanticTokens':
          this.semanticTokensCache.clear();
          break;
        case 'hover':
          this.hoverCache.clear();
          break;
      }
    } else {
      // Clear all caches
      this.parseCache.clear();
      this.completionCache.clear();
      this.validationCache.clear();
      this.semanticTokensCache.clear();
      this.hoverCache.clear();
    }
  }

  resetMetrics(): void {
    this.initializeMetrics();
  }

  // Memory management
  trimCache(): void {
    // Force cleanup of expired entries
    this.parseCache.purgeStale();
    this.completionCache.purgeStale();
    this.validationCache.purgeStale();
    this.semanticTokensCache.purgeStale();
    this.hoverCache.purgeStale();
  }

  getMemoryUsage(): number {
    // Estimate memory usage (this is approximate)
    return (
      this.parseCache.calculatedSize +
      this.completionCache.calculatedSize +
      this.validationCache.calculatedSize +
      this.semanticTokensCache.calculatedSize +
      this.hoverCache.calculatedSize
    );
  }
}

// Debounce utility for frequent operations
export class DebounceManager {
  private timeouts: Map<string, NodeJS.Timeout> = new Map();

  debounce<T extends (...args: any[]) => any>(
    key: string,
    fn: T,
    delay: number
  ): (...args: Parameters<T>) => void {
    return (...args: Parameters<T>) => {
      // Clear existing timeout
      const existingTimeout = this.timeouts.get(key);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }

      // Set new timeout
      const timeout = setTimeout(() => {
        fn(...args);
        this.timeouts.delete(key);
      }, delay);

      this.timeouts.set(key, timeout);
    };
  }

  cancel(key: string): void {
    const timeout = this.timeouts.get(key);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(key);
    }
  }

  cancelAll(): void {
    this.timeouts.forEach((timeout) => clearTimeout(timeout));
    this.timeouts.clear();
  }
}

// Singleton instances
export const cacheService = new CacheService();
export const debounceManager = new DebounceManager();