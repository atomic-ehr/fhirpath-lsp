import { performance } from 'perf_hooks';

export interface PerformanceMark {
  name: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface PerformanceMeasure {
  name: string;
  duration: number;
  startTime: number;
  endTime: number;
  metadata?: Record<string, any>;
}

export interface PerformanceReport {
  measures: PerformanceMeasure[];
  summary: {
    totalDuration: number;
    averageDuration: number;
    minDuration: number;
    maxDuration: number;
    count: number;
  };
  slowOperations: PerformanceMeasure[];
}

export class PerformanceProfiler {
  private marks = new Map<string, PerformanceMark>();
  private measures: PerformanceMeasure[] = [];
  private thresholds = new Map<string, number>();
  private enabled = true;

  constructor(enabled: boolean = true) {
    this.enabled = enabled;
    
    // Set default thresholds (in milliseconds)
    this.thresholds.set('completion', 100);
    this.thresholds.set('diagnostic', 200);
    this.thresholds.set('hover', 50);
    this.thresholds.set('semanticTokens', 300);
    this.thresholds.set('parse', 50);
  }

  mark(name: string, metadata?: Record<string, any>): void {
    if (!this.enabled) return;

    this.marks.set(name, {
      name,
      timestamp: performance.now(),
      metadata
    });
  }

  measure(name: string, startMark: string, endMark?: string, metadata?: Record<string, any>): PerformanceMeasure | null {
    if (!this.enabled) return null;

    const start = this.marks.get(startMark);
    if (!start) {
      // Let the caller handle logging - no console.warn here
      return null;
    }

    const endTime = endMark ? this.marks.get(endMark)?.timestamp : performance.now();
    if (!endTime) {
      // Let the caller handle logging - no console.warn here
      return null;
    }

    const measure: PerformanceMeasure = {
      name,
      duration: endTime - start.timestamp,
      startTime: start.timestamp,
      endTime,
      metadata: { ...start.metadata, ...metadata }
    };

    this.measures.push(measure);

    // Remove console.warn - let the structured logging system handle performance warnings
    // This will be handled by the PerformanceMonitor
    
    return measure;
  }

  async profile<T>(name: string, fn: () => T | Promise<T>, metadata?: Record<string, any>): Promise<T> {
    if (!this.enabled) {
      return await fn();
    }

    const startMark = `${name}_start_${Date.now()}`;
    this.mark(startMark, metadata);

    try {
      const result = await fn();
      this.measure(name, startMark, undefined, { success: true });
      return result;
    } catch (error) {
      this.measure(name, startMark, undefined, { success: false, error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  setThreshold(operation: string, threshold: number): void {
    this.thresholds.set(operation, threshold);
  }

  getReport(operation?: string): PerformanceReport {
    const relevantMeasures = operation 
      ? this.measures.filter(m => m.name === operation)
      : this.measures;

    if (relevantMeasures.length === 0) {
      return {
        measures: [],
        summary: {
          totalDuration: 0,
          averageDuration: 0,
          minDuration: 0,
          maxDuration: 0,
          count: 0
        },
        slowOperations: []
      };
    }

    const durations = relevantMeasures.map(m => m.duration);
    const totalDuration = durations.reduce((sum, d) => sum + d, 0);
    
    const slowOperations = relevantMeasures.filter(m => {
      const threshold = this.thresholds.get(m.name);
      return threshold ? m.duration > threshold : false;
    });

    return {
      measures: relevantMeasures,
      summary: {
        totalDuration,
        averageDuration: totalDuration / relevantMeasures.length,
        minDuration: Math.min(...durations),
        maxDuration: Math.max(...durations),
        count: relevantMeasures.length
      },
      slowOperations
    };
  }

  clear(): void {
    this.marks.clear();
    this.measures = [];
  }

  enable(): void {
    this.enabled = true;
  }

  disable(): void {
    this.enabled = false;
  }

  exportMetrics(): Record<string, any> {
    const operationStats: Record<string, any> = {};

    // Group measures by operation name
    const groupedMeasures = this.measures.reduce((acc, measure) => {
      if (!acc[measure.name]) {
        acc[measure.name] = [];
      }
      acc[measure.name].push(measure);
      return acc;
    }, {} as Record<string, PerformanceMeasure[]>);

    // Calculate stats for each operation
    for (const [operation, measures] of Object.entries(groupedMeasures)) {
      const durations = measures.map(m => m.duration);
      const successCount = measures.filter(m => m.metadata?.success === true).length;
      
      operationStats[operation] = {
        count: measures.length,
        successCount,
        failureCount: measures.length - successCount,
        avgDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
        minDuration: Math.min(...durations),
        maxDuration: Math.max(...durations),
        p50: this.percentile(durations, 0.5),
        p95: this.percentile(durations, 0.95),
        p99: this.percentile(durations, 0.99)
      };
    }

    return operationStats;
  }

  private percentile(values: number[], p: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[index] || 0;
  }
}

// Decorator for profiling methods
export function profile(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;
  const profiler = new PerformanceProfiler();

  descriptor.value = async function (...args: any[]) {
    const className = target.constructor.name;
    const methodName = `${className}.${propertyKey}`;
    
    return profiler.profile(methodName, () => originalMethod.apply(this, args));
  };

  return descriptor;
}

// Singleton instance
let globalProfiler: PerformanceProfiler | null = null;

export function getGlobalProfiler(): PerformanceProfiler {
  if (!globalProfiler) {
    globalProfiler = new PerformanceProfiler();
  }
  return globalProfiler;
}