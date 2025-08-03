import { EventEmitter } from 'events';
import { getLogger } from '../logging/index.js';

export interface MemoryUsage {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  arrayBuffers: number;
}

export interface ServiceMemoryUsage {
  serviceName: string;
  estimatedUsage: number;
  details: Record<string, number>;
}

export interface CacheMemoryUsage {
  cacheName: string;
  size: number;
  itemCount: number;
  estimatedMemory: number;
}

export interface MemoryReport {
  services: ServiceMemoryUsage[];
  caches: CacheMemoryUsage[];
  totalUsage: MemoryUsage;
  recommendations: string[];
  timestamp: number;
}

export interface MemoryThresholds {
  warning: number;    // 80MB
  critical: number;   // 150MB
  emergency: number;  // 200MB
}

export type MemoryPressureLevel = 'normal' | 'warning' | 'critical' | 'emergency';

export interface MemoryPressureHandler {
  (usage: MemoryUsage, level: MemoryPressureLevel): Promise<void> | void;
}

export interface IMemoryManager {
  getCurrentUsage(): MemoryUsage;
  setMemoryThresholds(thresholds: Partial<MemoryThresholds>): void;
  onMemoryPressure(handler: MemoryPressureHandler): void;
  startMonitoring(): void;
  stopMonitoring(): void;
  cleanup(): Promise<void>;
  getMemoryReport(): MemoryReport;
  forceGarbageCollection(): void;
  registerService(name: string, estimateUsage: () => number): void;
  registerCache(name: string, getStats: () => CacheMemoryUsage): void;
}

export class MemoryManager extends EventEmitter implements IMemoryManager {
  private thresholds: MemoryThresholds = {
    warning: 80 * 1024 * 1024,   // 80MB
    critical: 150 * 1024 * 1024, // 150MB
    emergency: 200 * 1024 * 1024 // 200MB
  };

  private pressureHandlers: MemoryPressureHandler[] = [];
  private monitoringInterval?: NodeJS.Timeout;
  private lastPressureLevel: MemoryPressureLevel = 'normal';
  private monitoringIntervalMs = 5000; // 5 seconds
  
  private services = new Map<string, () => number>();
  private caches = new Map<string, () => CacheMemoryUsage>();
  
  private pressureHistory: Array<{ timestamp: number; level: MemoryPressureLevel; usage: MemoryUsage }> = [];
  private maxHistorySize = 100;
  private logger = getLogger('MemoryManager');

  getCurrentUsage(): MemoryUsage {
    return process.memoryUsage();
  }

  setMemoryThresholds(thresholds: Partial<MemoryThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
    this.emit('thresholdsChanged', this.thresholds);
  }

  onMemoryPressure(handler: MemoryPressureHandler): void {
    this.pressureHandlers.push(handler);
  }

  startMonitoring(): void {
    if (this.monitoringInterval) {
      return; // Already monitoring
    }

    this.monitoringInterval = setInterval(() => {
      this.checkMemoryPressure();
    }, this.monitoringIntervalMs);

    this.emit('monitoringStarted');
  }

  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    this.emit('monitoringStopped');
  }

  async cleanup(): Promise<void> {
    this.stopMonitoring();
    this.pressureHandlers = [];
    this.services.clear();
    this.caches.clear();
    this.pressureHistory = [];
    
    // Force garbage collection if available
    this.forceGarbageCollection();
    
    this.emit('cleanup');
  }

  forceGarbageCollection(): void {
    if (global.gc) {
      global.gc();
    } else {
      // If gc is not exposed, we can suggest running with --expose-gc
      this.logger.warn('Garbage collection not available. Run with --expose-gc flag for manual GC control.');
    }
  }

  registerService(name: string, estimateUsage: () => number): void {
    this.services.set(name, estimateUsage);
  }

  registerCache(name: string, getStats: () => CacheMemoryUsage): void {
    this.caches.set(name, getStats);
  }

  getMemoryReport(): MemoryReport {
    const currentUsage = this.getCurrentUsage();
    
    const services: ServiceMemoryUsage[] = [];
    for (const [serviceName, estimateUsage] of this.services) {
      try {
        const usage = estimateUsage();
        services.push({
          serviceName,
          estimatedUsage: usage,
          details: { estimated: usage }
        });
      } catch (error) {
        services.push({
          serviceName,
          estimatedUsage: 0,
          details: { errorCount: 1 }
        });
      }
    }

    const caches: CacheMemoryUsage[] = [];
    for (const [cacheName, getStats] of this.caches) {
      try {
        caches.push(getStats());
      } catch (error) {
        caches.push({
          cacheName,
          size: 0,
          itemCount: 0,
          estimatedMemory: 0
        });
      }
    }

    const recommendations = this.generateRecommendations(currentUsage, services, caches);

    return {
      services,
      caches,
      totalUsage: currentUsage,
      recommendations,
      timestamp: Date.now()
    };
  }

  private checkMemoryPressure(): void {
    const usage = this.getCurrentUsage();
    const level = this.calculatePressureLevel(usage);
    
    // Add to history
    this.pressureHistory.push({ timestamp: Date.now(), level, usage });
    if (this.pressureHistory.length > this.maxHistorySize) {
      this.pressureHistory.shift();
    }

    // Only trigger handlers if pressure level changed or is critical/emergency
    if (level !== this.lastPressureLevel || level === 'critical' || level === 'emergency') {
      this.lastPressureLevel = level;
      this.triggerPressureHandlers(usage, level);
      this.emit('memoryPressureChanged', { usage, level });
    }

    // Emit periodic memory stats
    this.emit('memoryStats', { usage, level });
  }

  private calculatePressureLevel(usage: MemoryUsage): MemoryPressureLevel {
    const heapUsed = usage.heapUsed;
    
    if (heapUsed >= this.thresholds.emergency) {
      return 'emergency';
    } else if (heapUsed >= this.thresholds.critical) {
      return 'critical';
    } else if (heapUsed >= this.thresholds.warning) {
      return 'warning';
    } else {
      return 'normal';
    }
  }

  private async triggerPressureHandlers(usage: MemoryUsage, level: MemoryPressureLevel): Promise<void> {
    const promises = this.pressureHandlers.map(async handler => {
      try {
        await handler(usage, level);
      } catch (error) {
        this.logger.error('Memory pressure handler failed:', error);
        this.emit('handlerError', { error, usage, level });
      }
    });

    await Promise.all(promises);
  }

  private generateRecommendations(
    usage: MemoryUsage,
    services: ServiceMemoryUsage[],
    caches: CacheMemoryUsage[]
  ): string[] {
    const recommendations: string[] = [];
    const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
    
    // General memory recommendations
    if (usage.heapUsed > this.thresholds.warning) {
      recommendations.push(`High memory usage detected: ${heapUsedMB}MB. Consider reducing cache sizes or clearing unused data.`);
    }

    // Cache-specific recommendations
    const totalCacheMemory = caches.reduce((sum, cache) => sum + cache.estimatedMemory, 0);
    const cachePercentage = totalCacheMemory / usage.heapUsed * 100;
    
    if (cachePercentage > 50) {
      recommendations.push(`Caches are using ${Math.round(cachePercentage)}% of memory. Consider reducing cache sizes.`);
    }

    // Find largest caches
    const largeCaches = caches
      .filter(cache => cache.estimatedMemory > 10 * 1024 * 1024) // > 10MB
      .sort((a, b) => b.estimatedMemory - a.estimatedMemory);
    
    if (largeCaches.length > 0) {
      const largestCache = largeCaches[0];
      const sizeMB = Math.round(largestCache.estimatedMemory / 1024 / 1024);
      recommendations.push(`Largest cache "${largestCache.cacheName}" is using ${sizeMB}MB. Consider clearing or reducing size.`);
    }

    // Service-specific recommendations
    const largeServices = services
      .filter(service => service.estimatedUsage > 20 * 1024 * 1024) // > 20MB
      .sort((a, b) => b.estimatedUsage - a.estimatedUsage);
    
    if (largeServices.length > 0) {
      const largestService = largeServices[0];
      const sizeMB = Math.round(largestService.estimatedUsage / 1024 / 1024);
      recommendations.push(`Service "${largestService.serviceName}" is using ${sizeMB}MB. Review for optimization opportunities.`);
    }

    // Heap fragmentation check
    const heapFragmentation = (usage.heapTotal - usage.heapUsed) / usage.heapTotal;
    if (heapFragmentation > 0.5) {
      recommendations.push('High heap fragmentation detected. Consider forcing garbage collection.');
    }

    // External memory check
    if (usage.external > 50 * 1024 * 1024) { // > 50MB
      const externalMB = Math.round(usage.external / 1024 / 1024);
      recommendations.push(`High external memory usage: ${externalMB}MB. Check for large buffers or external resources.`);
    }

    return recommendations;
  }

  // Utility methods for getting memory statistics
  getPressureHistory(): Array<{ timestamp: number; level: MemoryPressureLevel; usage: MemoryUsage }> {
    return [...this.pressureHistory];
  }

  getCurrentPressureLevel(): MemoryPressureLevel {
    return this.lastPressureLevel;
  }

  getThresholds(): MemoryThresholds {
    return { ...this.thresholds };
  }

  // Helper method to format memory sizes
  static formatMemorySize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${Math.round(size * 100) / 100} ${units[unitIndex]}`;
  }
}

// Singleton instance for global use
export const memoryManager = new MemoryManager();

// Factory function
export function getMemoryManager(): MemoryManager {
  return memoryManager;
}