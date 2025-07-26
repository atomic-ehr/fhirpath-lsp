export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  size: number;
  maxSize: number;
  evictions: number;
}

export interface CacheEntry<V> {
  value: V;
  lastAccessed: number;
  size?: number;
}

export interface PerformanceCache<K, V> {
  get(key: K): V | undefined;
  set(key: K, value: V, size?: number): void;
  delete(key: K): boolean;
  clear(): void;
  size(): number;
  getStats(): CacheStats;
  has(key: K): boolean;
}

export class LRUCache<K, V> implements PerformanceCache<K, V> {
  private cache = new Map<K, CacheEntry<V>>();
  private maxSize: number;
  private maxEntries: number;
  private currentSize = 0;
  private stats: CacheStats;

  constructor(options: { maxSize?: number; maxEntries?: number } = {}) {
    this.maxSize = options.maxSize || 50 * 1024 * 1024; // 50MB default
    this.maxEntries = options.maxEntries || 1000;
    this.stats = {
      hits: 0,
      misses: 0,
      hitRate: 0,
      size: 0,
      maxSize: this.maxSize,
      evictions: 0
    };
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (entry) {
      entry.lastAccessed = Date.now();
      this.stats.hits++;
      this.updateHitRate();
      
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, entry);
      
      return entry.value;
    }

    this.stats.misses++;
    this.updateHitRate();
    return undefined;
  }

  set(key: K, value: V, size?: number): void {
    const entrySize = size || this.estimateSize(value);
    
    // Remove existing entry if present
    const existing = this.cache.get(key);
    if (existing) {
      this.currentSize -= existing.size || 0;
      this.cache.delete(key);
    }

    // Check if we need to evict entries
    while (
      (this.cache.size >= this.maxEntries || 
       this.currentSize + entrySize > this.maxSize) && 
      this.cache.size > 0
    ) {
      this.evictLRU();
    }

    // Add new entry
    const entry: CacheEntry<V> = {
      value,
      lastAccessed: Date.now(),
      size: entrySize
    };
    
    this.cache.set(key, entry);
    this.currentSize += entrySize;
    this.stats.size = this.cache.size;
  }

  delete(key: K): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.currentSize -= entry.size || 0;
      this.stats.size = this.cache.size - 1;
      return this.cache.delete(key);
    }
    return false;
  }

  clear(): void {
    this.cache.clear();
    this.currentSize = 0;
    this.stats.size = 0;
    this.stats.evictions = 0;
  }

  size(): number {
    return this.cache.size;
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  getStats(): CacheStats {
    return {
      ...this.stats,
      size: this.cache.size
    };
  }

  private evictLRU(): void {
    // Find the least recently used entry
    let oldestKey: K | undefined;
    let oldestTime = Date.now();

    // Get first entry (oldest in insertion order if not accessed)
    const firstKey = this.cache.keys().next().value;
    if (firstKey !== undefined) {
      oldestKey = firstKey;
      const entry = this.cache.get(firstKey);
      if (entry) {
        oldestTime = entry.lastAccessed;
      }
    }

    // Check if there are older entries
    for (const [key, entry] of this.cache) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey !== undefined) {
      const entry = this.cache.get(oldestKey);
      if (entry) {
        this.currentSize -= entry.size || 0;
      }
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  private estimateSize(value: V): number {
    // Simple size estimation - can be improved
    if (typeof value === 'string') {
      return value.length * 2; // 2 bytes per character
    } else if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value).length * 2;
    } else {
      return 8; // Default size for primitives
    }
  }
}

export class TTLCache<K, V> implements PerformanceCache<K, V> {
  private cache = new Map<K, CacheEntry<V> & { expiry: number }>();
  private ttl: number;
  private stats: CacheStats;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(ttl: number = 60000) { // 1 minute default
    this.ttl = ttl;
    this.stats = {
      hits: 0,
      misses: 0,
      hitRate: 0,
      size: 0,
      maxSize: Infinity,
      evictions: 0
    };
    
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => this.cleanup(), ttl / 2);
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (entry) {
      if (Date.now() < entry.expiry) {
        entry.lastAccessed = Date.now();
        this.stats.hits++;
        this.updateHitRate();
        return entry.value;
      } else {
        // Expired entry
        this.cache.delete(key);
        this.stats.evictions++;
      }
    }

    this.stats.misses++;
    this.updateHitRate();
    return undefined;
  }

  set(key: K, value: V, size?: number): void {
    const entry = {
      value,
      lastAccessed: Date.now(),
      expiry: Date.now() + this.ttl,
      size
    };
    
    this.cache.set(key, entry);
    this.stats.size = this.cache.size;
  }

  delete(key: K): boolean {
    const result = this.cache.delete(key);
    this.stats.size = this.cache.size;
    return result;
  }

  clear(): void {
    this.cache.clear();
    this.stats.size = 0;
  }

  size(): number {
    return this.cache.size;
  }

  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (entry && Date.now() < entry.expiry) {
      return true;
    }
    this.cache.delete(key);
    return false;
  }

  getStats(): CacheStats {
    return {
      ...this.stats,
      size: this.cache.size
    };
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now >= entry.expiry) {
        this.cache.delete(key);
        this.stats.evictions++;
      }
    }
    this.stats.size = this.cache.size;
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }
}

// Composite cache that combines LRU and TTL strategies
export class HybridCache<K, V> implements PerformanceCache<K, V> {
  private lruCache: LRUCache<K, V>;
  private ttlCache: TTLCache<K, V>;

  constructor(options: {
    maxSize?: number;
    maxEntries?: number;
    ttl?: number;
  } = {}) {
    this.lruCache = new LRUCache(options);
    this.ttlCache = new TTLCache(options.ttl);
  }

  get(key: K): V | undefined {
    // Check TTL first
    const ttlValue = this.ttlCache.get(key);
    if (ttlValue !== undefined) {
      return ttlValue;
    }

    // Fall back to LRU
    return this.lruCache.get(key);
  }

  set(key: K, value: V, size?: number): void {
    this.ttlCache.set(key, value, size);
    this.lruCache.set(key, value, size);
  }

  delete(key: K): boolean {
    const ttlResult = this.ttlCache.delete(key);
    const lruResult = this.lruCache.delete(key);
    return ttlResult || lruResult;
  }

  clear(): void {
    this.ttlCache.clear();
    this.lruCache.clear();
  }

  size(): number {
    return Math.max(this.ttlCache.size(), this.lruCache.size());
  }

  has(key: K): boolean {
    return this.ttlCache.has(key) || this.lruCache.has(key);
  }

  getStats(): CacheStats {
    const ttlStats = this.ttlCache.getStats();
    const lruStats = this.lruCache.getStats();
    
    return {
      hits: ttlStats.hits + lruStats.hits,
      misses: Math.max(ttlStats.misses, lruStats.misses),
      hitRate: (ttlStats.hits + lruStats.hits) / (ttlStats.hits + lruStats.hits + Math.max(ttlStats.misses, lruStats.misses)),
      size: this.size(),
      maxSize: lruStats.maxSize,
      evictions: ttlStats.evictions + lruStats.evictions
    };
  }
}