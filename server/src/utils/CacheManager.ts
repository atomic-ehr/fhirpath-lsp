import { getLogger } from '../logging/index.js';

const logger = getLogger('CacheManager');

/**
 * Cache levels for multi-tier caching strategy
 */
export enum CacheLevel {
  L1_MEMORY = 'memory',
  L2_DISK = 'disk',
  L3_REMOTE = 'remote'
}

/**
 * Cache categories for different data types
 */
export enum CacheCategory {
  TYPE_INFO = 'typeInfo',
  PROPERTY_PATHS = 'propertyPaths',
  CHOICE_TYPES = 'choiceTypes',
  COMPLETIONS = 'completions',
  VALIDATIONS = 'validations',
  HOVER_INFO = 'hoverInfo',
  DEFINITIONS = 'definitions',
  REFERENCES = 'references'
}

/**
 * Cache entry with metadata
 */
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  accessCount: number;
  ttl: number;
  level: CacheLevel;
  dependencies: string[];
  size: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  totalEntries: number;
  totalSize: number;
  hitRate: number;
  missRate: number;
  evictionCount: number;
  categories: Record<CacheCategory, {
    entries: number;
    size: number;
    hitRate: number;
  }>;
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  memoryLimit: number;
  diskLimit: number;
  defaultTtl: number;
  cleanupInterval: number;
  categoryTtl: Record<CacheCategory, number>;
  enablePersistence: boolean;
  enableMetrics: boolean;
}

/**
 * Memory usage information
 */
export interface MemoryUsage {
  used: number;
  limit: number;
  percentage: number;
  available: number;
}

/**
 * LRU Cache implementation for memory layer
 */
class LRUCache<K, V> {
  private cache = new Map<K, CacheEntry<V>>();
  private maxSize: number;
  private hits = 0;
  private misses = 0;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: K): CacheEntry<V> | undefined {
    const entry = this.cache.get(key);
    
    if (entry) {
      this.hits++;
      entry.accessCount++;
      
      // Move to end (mark as recently used)
      this.cache.delete(key);
      this.cache.set(key, entry);
      
      return entry;
    }
    
    this.misses++;
    return undefined;
  }

  set(key: K, entry: CacheEntry<V>): void {
    // Remove existing entry if present
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    
    // Check if we need to evict
    while (this.cache.size >= this.maxSize && this.maxSize > 0) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, entry);
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  size(): number {
    return this.cache.size;
  }

  getStats(): { hits: number; misses: number; hitRate: number } {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0
    };
  }

  entries(): IterableIterator<[K, CacheEntry<V>]> {
    return this.cache.entries();
  }

  keys(): IterableIterator<K> {
    return this.cache.keys();
  }

  values(): IterableIterator<CacheEntry<V>> {
    return this.cache.values();
  }
}

/**
 * Disk-based cache for persistent storage
 */
class DiskCache {
  private basePath: string;
  private enabled: boolean;

  constructor(basePath: string, enabled: boolean = true) {
    this.basePath = basePath;
    this.enabled = enabled;
  }

  async get<T>(key: string): Promise<CacheEntry<T> | undefined> {
    if (!this.enabled) return undefined;

    try {
      const filePath = this.getFilePath(key);
      const file = Bun.file(filePath);
      
      if (!(await file.exists())) {
        return undefined;
      }

      const content = await file.text();
      const entry = JSON.parse(content) as CacheEntry<T>;
      
      // Check if entry has expired
      if (Date.now() > entry.timestamp + entry.ttl) {
        await this.delete(key);
        return undefined;
      }

      // Update access count and timestamp
      entry.accessCount++;
      entry.timestamp = Date.now();
      
      return entry;
    } catch (error) {
      logger.warn('Failed to read from disk cache', {
        operation: 'DiskCache.get',
        key,
        error: (error as Error).message
      });
      return undefined;
    }
  }

  async set<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    if (!this.enabled) return;

    try {
      const filePath = this.getFilePath(key);
      const content = JSON.stringify(entry, null, 2);
      
      // Ensure directory exists
      await this.ensureDirectory(filePath);
      
      await Bun.write(filePath, content);
    } catch (error) {
      logger.warn('Failed to write to disk cache', {
        operation: 'DiskCache.set',
        key,
        error: (error as Error).message
      });
    }
  }

  async delete(key: string): Promise<boolean> {
    if (!this.enabled) return false;

    try {
      const filePath = this.getFilePath(key);
      const file = Bun.file(filePath);
      
      if (await file.exists()) {
        await Bun.$`rm -f ${filePath}`;
        return true;
      }
      
      return false;
    } catch (error) {
      logger.warn('Failed to delete from disk cache', {
        operation: 'DiskCache.delete',
        key,
        error: (error as Error).message
      });
      return false;
    }
  }

  async clear(): Promise<void> {
    if (!this.enabled) return;

    try {
      await Bun.$`rm -rf ${this.basePath}/*`;
    } catch (error) {
      logger.warn('Failed to clear disk cache', {
        operation: 'DiskCache.clear',
        error: (error as Error).message
      });
    }
  }

  private getFilePath(key: string): string {
    // Create safe filename from key
    const safeKey = key.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${this.basePath}/${safeKey}.json`;
  }

  private async ensureDirectory(filePath: string): Promise<void> {
    const dir = filePath.substring(0, filePath.lastIndexOf('/'));
    await Bun.$`mkdir -p ${dir}`;
  }
}

/**
 * Multi-level cache manager
 */
export class CacheManager {
  private memoryCache: LRUCache<string, any>;
  private diskCache: DiskCache;
  private config: CacheConfig;
  private categoryStats = new Map<CacheCategory, {
    hits: number;
    misses: number;
    evictions: number;
  }>();
  private dependencies = new Map<string, Set<string>>();
  private cleanupTimer?: Timer;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      memoryLimit: 50 * 1024 * 1024, // 50MB
      diskLimit: 100 * 1024 * 1024, // 100MB
      defaultTtl: 30 * 60 * 1000, // 30 minutes
      cleanupInterval: 5 * 60 * 1000, // 5 minutes
      categoryTtl: {
        [CacheCategory.TYPE_INFO]: 30 * 60 * 1000, // 30 minutes
        [CacheCategory.PROPERTY_PATHS]: 15 * 60 * 1000, // 15 minutes
        [CacheCategory.CHOICE_TYPES]: 30 * 60 * 1000, // 30 minutes
        [CacheCategory.COMPLETIONS]: 5 * 60 * 1000, // 5 minutes
        [CacheCategory.VALIDATIONS]: 10 * 60 * 1000, // 10 minutes
        [CacheCategory.HOVER_INFO]: 10 * 60 * 1000, // 10 minutes
        [CacheCategory.DEFINITIONS]: 20 * 60 * 1000, // 20 minutes
        [CacheCategory.REFERENCES]: 15 * 60 * 1000, // 15 minutes
      },
      enablePersistence: true,
      enableMetrics: true,
      ...config
    };

    // Initialize caches
    const maxMemoryEntries = Math.floor(this.config.memoryLimit / 1024); // Rough estimate
    this.memoryCache = new LRUCache(maxMemoryEntries);
    this.diskCache = new DiskCache('/tmp/fhirpath-lsp-cache', this.config.enablePersistence);

    // Initialize category stats
    for (const category of Object.values(CacheCategory)) {
      this.categoryStats.set(category, { hits: 0, misses: 0, evictions: 0 });
    }

    // Start cleanup timer
    this.startCleanupTimer();

    logger.info('CacheManager initialized', {
      operation: 'constructor',
      config: this.config
    });
  }

  /**
   * Get value from cache, checking all levels
   */
  async get<T>(key: string, category: CacheCategory): Promise<T | undefined> {
    const startTime = Date.now();
    
    try {
      // Try L1 (memory) cache first
      const memoryEntry = this.memoryCache.get(key);
      if (memoryEntry && !this.isExpired(memoryEntry)) {
        this.recordHit(category);
        logger.debug('Cache hit (L1)', {
          operation: 'get',
          key,
          category,
          level: CacheLevel.L1_MEMORY,
          duration: Date.now() - startTime
        });
        return memoryEntry.data as T;
      }

      // Try L2 (disk) cache
      const diskEntry = await this.diskCache.get<T>(key);
      if (diskEntry && !this.isExpired(diskEntry)) {
        // Promote to memory cache
        this.memoryCache.set(key, diskEntry);
        this.recordHit(category);
        logger.debug('Cache hit (L2)', {
          operation: 'get',
          key,
          category,
          level: CacheLevel.L2_DISK,
          duration: Date.now() - startTime
        });
        return diskEntry.data;
      }

      // Cache miss
      this.recordMiss(category);
      logger.debug('Cache miss', {
        operation: 'get',
        key,
        category,
        duration: Date.now() - startTime
      });
      return undefined;

    } catch (error) {
      logger.error('Cache get error', error as Error, {
        operation: 'get',
        key,
        category
      });
      this.recordMiss(category);
      return undefined;
    }
  }

  /**
   * Set value in cache at appropriate level
   */
  async set<T>(
    key: string,
    data: T,
    category: CacheCategory,
    ttl?: number,
    dependencies: string[] = []
  ): Promise<void> {
    const finalTtl = ttl || this.config.categoryTtl[category] || this.config.defaultTtl;
    const size = this.estimateSize(data);
    
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      accessCount: 1,
      ttl: finalTtl,
      level: CacheLevel.L1_MEMORY,
      dependencies,
      size
    };

    try {
      // Always set in memory cache (L1)
      this.memoryCache.set(key, entry);

      // Set in disk cache (L2) for important categories
      if (this.shouldPersist(category)) {
        const diskEntry = { ...entry, level: CacheLevel.L2_DISK };
        await this.diskCache.set(key, diskEntry);
      }

      // Track dependencies
      this.addDependencies(key, dependencies);

      logger.debug('Cache set', {
        operation: 'set',
        key,
        category,
        ttl: finalTtl,
        dependencies: dependencies.length,
        size
      });

    } catch (error) {
      logger.error('Cache set error', error as Error, {
        operation: 'set',
        key,
        category
      });
    }
  }

  /**
   * Invalidate cache entries by pattern or exact key
   */
  async invalidate(pattern: string | RegExp): Promise<number> {
    let invalidatedCount = 0;

    try {
      if (typeof pattern === 'string') {
        // Exact key match
        if (this.memoryCache.delete(pattern)) {
          invalidatedCount++;
        }
        if (await this.diskCache.delete(pattern)) {
          invalidatedCount++;
        }
        this.removeDependencies(pattern);
      } else {
        // Pattern matching
        for (const key of this.memoryCache.keys()) {
          if (pattern.test(key)) {
            this.memoryCache.delete(key);
            await this.diskCache.delete(key);
            this.removeDependencies(key);
            invalidatedCount++;
          }
        }
      }

      logger.info('Cache invalidated', {
        operation: 'invalidate',
        pattern: pattern.toString(),
        invalidatedCount
      });

      return invalidatedCount;

    } catch (error) {
      logger.error('Cache invalidation error', error as Error, {
        operation: 'invalidate',
        pattern: pattern.toString()
      });
      return 0;
    }
  }

  /**
   * Invalidate cache entries by dependencies
   */
  async invalidateByDependency(dependency: string): Promise<number> {
    let invalidatedCount = 0;

    try {
      for (const [key, deps] of this.dependencies.entries()) {
        if (deps.has(dependency)) {
          if (this.memoryCache.delete(key)) {
            invalidatedCount++;
          }
          await this.diskCache.delete(key);
          this.removeDependencies(key);
        }
      }

      logger.info('Cache invalidated by dependency', {
        operation: 'invalidateByDependency',
        dependency,
        invalidatedCount
      });

      return invalidatedCount;

    } catch (error) {
      logger.error('Cache dependency invalidation error', error as Error, {
        operation: 'invalidateByDependency',
        dependency
      });
      return 0;
    }
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    try {
      this.memoryCache.clear();
      await this.diskCache.clear();
      this.dependencies.clear();
      
      // Reset category stats
      for (const stats of this.categoryStats.values()) {
        stats.hits = 0;
        stats.misses = 0;
        stats.evictions = 0;
      }

      logger.info('Cache cleared', { operation: 'clear' });

    } catch (error) {
      logger.error('Cache clear error', error as Error, {
        operation: 'clear'
      });
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const memoryStats = this.memoryCache.getStats();
    const categories: Record<CacheCategory, any> = {} as any;

    for (const [category, stats] of this.categoryStats.entries()) {
      const total = stats.hits + stats.misses;
      categories[category] = {
        entries: 0, // Would need to track per category
        size: 0,    // Would need to track per category
        hitRate: total > 0 ? stats.hits / total : 0
      };
    }

    return {
      totalEntries: this.memoryCache.size(),
      totalSize: this.calculateTotalSize(),
      hitRate: memoryStats.hitRate,
      missRate: 1 - memoryStats.hitRate,
      evictionCount: 0, // Would need to track
      categories
    };
  }

  /**
   * Get current memory usage
   */
  getMemoryUsage(): MemoryUsage {
    const used = this.calculateTotalSize();
    const limit = this.config.memoryLimit;
    
    return {
      used,
      limit,
      percentage: (used / limit) * 100,
      available: limit - used
    };
  }

  /**
   * Perform cache cleanup
   */
  async cleanup(): Promise<void> {
    try {
      const startTime = Date.now();
      let cleanedCount = 0;

      // Clean expired entries from memory
      for (const [key, entry] of this.memoryCache.entries()) {
        if (this.isExpired(entry)) {
          this.memoryCache.delete(key);
          cleanedCount++;
        }
      }

      // Check memory usage and evict if necessary
      const memoryUsage = this.getMemoryUsage();
      if (memoryUsage.percentage > 80) {
        cleanedCount += await this.evictLeastRecentlyUsed();
      }

      logger.debug('Cache cleanup completed', {
        operation: 'cleanup',
        cleanedCount,
        memoryUsage: memoryUsage.percentage,
        duration: Date.now() - startTime
      });

    } catch (error) {
      logger.error('Cache cleanup error', error as Error, {
        operation: 'cleanup'
      });
    }
  }

  /**
   * Shutdown cache manager
   */
  async shutdown(): Promise<void> {
    try {
      if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
        this.cleanupTimer = undefined;
      }

      await this.cleanup();
      
      logger.info('CacheManager shutdown', { operation: 'shutdown' });

    } catch (error) {
      logger.error('Cache shutdown error', error as Error, {
        operation: 'shutdown'
      });
    }
  }

  // Private methods

  private isExpired(entry: CacheEntry<any>): boolean {
    return Date.now() > entry.timestamp + entry.ttl;
  }

  private shouldPersist(category: CacheCategory): boolean {
    return this.config.enablePersistence && [
      CacheCategory.TYPE_INFO,
      CacheCategory.CHOICE_TYPES,
      CacheCategory.DEFINITIONS
    ].includes(category);
  }

  private estimateSize(data: any): number {
    try {
      return JSON.stringify(data).length * 2; // Rough UTF-16 estimate
    } catch {
      return 1024; // Fallback estimate
    }
  }

  private calculateTotalSize(): number {
    let totalSize = 0;
    for (const entry of this.memoryCache.values()) {
      totalSize += entry.size;
    }
    return totalSize;
  }

  private recordHit(category: CacheCategory): void {
    if (this.config.enableMetrics) {
      const stats = this.categoryStats.get(category);
      if (stats) {
        stats.hits++;
      }
    }
  }

  private recordMiss(category: CacheCategory): void {
    if (this.config.enableMetrics) {
      const stats = this.categoryStats.get(category);
      if (stats) {
        stats.misses++;
      }
    }
  }

  private addDependencies(key: string, dependencies: string[]): void {
    if (dependencies.length > 0) {
      this.dependencies.set(key, new Set(dependencies));
    }
  }

  private removeDependencies(key: string): void {
    this.dependencies.delete(key);
  }

  private async evictLeastRecentlyUsed(): Promise<number> {
    const entries = Array.from(this.memoryCache.entries());
    
    // Sort by access count and timestamp (LRU)
    entries.sort(([, a], [, b]) => {
      if (a.accessCount !== b.accessCount) {
        return a.accessCount - b.accessCount;
      }
      return a.timestamp - b.timestamp;
    });

    const evictCount = Math.floor(entries.length * 0.2); // Evict 20%
    let evicted = 0;

    for (let i = 0; i < evictCount && i < entries.length; i++) {
      const [key] = entries[i];
      this.memoryCache.delete(key);
      evicted++;
    }

    return evicted;
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(
      () => this.cleanup(),
      this.config.cleanupInterval
    );
  }
}