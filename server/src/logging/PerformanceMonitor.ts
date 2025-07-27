/**
 * Performance monitoring integration with structured logging
 */

import { performance } from 'perf_hooks';
import { getLogger, LogLevel } from './index';
import { PerformanceProfiler, PerformanceMeasure } from '../utils/PerformanceProfiler';

export interface PerformanceThresholds {
  warn: number;
  error: number;
}

export interface PerformanceMonitorConfig {
  enabled: boolean;
  defaultThresholds: PerformanceThresholds;
  operationThresholds: Record<string, PerformanceThresholds>;
  logLevel: LogLevel;
  memoryTracking: boolean;
  cpuTracking: boolean;
}

export class PerformanceMonitor {
  private logger = getLogger('performance-monitor');
  private profiler: PerformanceProfiler;
  private config: PerformanceMonitorConfig;
  private operationCounts = new Map<string, number>();
  private recentMeasures = new Map<string, PerformanceMeasure[]>();
  private readonly maxRecentMeasures = 100;

  constructor(config: Partial<PerformanceMonitorConfig> = {}) {
    this.config = {
      enabled: true,
      defaultThresholds: { warn: 100, error: 1000 },
      operationThresholds: {
        'completion': { warn: 100, error: 500 },
        'diagnostic': { warn: 200, error: 1000 },
        'hover': { warn: 50, error: 200 },
        'semanticTokens': { warn: 300, error: 1000 },
        'parse': { warn: 50, error: 200 },
        'codeAction': { warn: 150, error: 500 },
        'definition': { warn: 100, error: 300 },
        'references': { warn: 200, error: 800 }
      },
      logLevel: LogLevel.INFO,
      memoryTracking: true,
      cpuTracking: false,
      ...config
    };

    this.profiler = new PerformanceProfiler(this.config.enabled);
    this.setupProfilerLogging();
  }

  private setupProfilerLogging(): void {
    // Override the profiler's measure method to add logging
    const originalMeasure = this.profiler.measure.bind(this.profiler);
    this.profiler.measure = (name: string, startMark: string, endMark?: string, metadata?: Record<string, any>) => {
      const measure = originalMeasure(name, startMark, endMark, metadata);
      if (measure) {
        this.logPerformanceMeasure(measure);
      }
      return measure;
    };
  }

  private logPerformanceMeasure(measure: PerformanceMeasure): void {
    if (!this.config.enabled) return;

    const thresholds = this.config.operationThresholds[measure.name] || this.config.defaultThresholds;
    const context = {
      operation: measure.name,
      duration: measure.duration,
      metadata: measure.metadata
    };

    // Track operation statistics
    this.updateOperationStats(measure);

    // Add memory information if tracking is enabled
    if (this.config.memoryTracking) {
      const memoryUsage = process.memoryUsage();
      context.metadata = {
        ...context.metadata,
        memoryUsage: {
          heapUsed: memoryUsage.heapUsed,
          heapTotal: memoryUsage.heapTotal,
          external: memoryUsage.external,
          rss: memoryUsage.rss
        }
      };
    }

    // Add CPU information if tracking is enabled
    if (this.config.cpuTracking) {
      const cpuUsage = process.cpuUsage();
      context.metadata = {
        ...context.metadata,
        cpuUsage: {
          user: cpuUsage.user,
          system: cpuUsage.system
        }
      };
    }

    // Log based on performance thresholds
    if (measure.duration > thresholds.error) {
      this.logger.error(`Slow operation detected: ${measure.name}`, undefined, context);
    } else if (measure.duration > thresholds.warn) {
      this.logger.warn(`Performance warning: ${measure.name}`, context);
    } else if (this.config.logLevel >= LogLevel.DEBUG) {
      this.logger.debug(`Performance measure: ${measure.name}`, context);
    }

    // Log operation statistics periodically
    const count = this.operationCounts.get(measure.name) || 0;
    if (count > 0 && count % 50 === 0) {
      this.logOperationStatistics(measure.name);
    }
  }

  private updateOperationStats(measure: PerformanceMeasure): void {
    // Update operation count
    const currentCount = this.operationCounts.get(measure.name) || 0;
    this.operationCounts.set(measure.name, currentCount + 1);

    // Update recent measures for statistical analysis
    const recentMeasures = this.recentMeasures.get(measure.name) || [];
    recentMeasures.push(measure);
    
    // Keep only the most recent measures
    if (recentMeasures.length > this.maxRecentMeasures) {
      recentMeasures.shift();
    }
    
    this.recentMeasures.set(measure.name, recentMeasures);
  }

  private logOperationStatistics(operationName: string): void {
    const measures = this.recentMeasures.get(operationName) || [];
    if (measures.length === 0) return;

    const durations = measures.map(m => m.duration);
    const stats = {
      operation: operationName,
      count: measures.length,
      totalCount: this.operationCounts.get(operationName) || 0,
      averageDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      p50: this.calculatePercentile(durations, 50),
      p90: this.calculatePercentile(durations, 90),
      p95: this.calculatePercentile(durations, 95),
      p99: this.calculatePercentile(durations, 99)
    };

    this.logger.info(`Performance statistics for ${operationName}`, stats);
  }

  private calculatePercentile(values: number[], percentile: number): number {
    const sorted = values.slice().sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index] || 0;
  }

  // Proxy methods to the underlying profiler
  mark(name: string, metadata?: Record<string, any>): void {
    return this.profiler.mark(name, metadata);
  }

  measure(name: string, startMark: string, endMark?: string, metadata?: Record<string, any>): PerformanceMeasure | null {
    return this.profiler.measure(name, startMark, endMark, metadata);
  }

  async profile<T>(name: string, fn: () => T | Promise<T>, metadata?: Record<string, any>): Promise<T> {
    return this.profiler.profile(name, fn, metadata);
  }

  setThreshold(operation: string, thresholds: PerformanceThresholds): void {
    this.config.operationThresholds[operation] = thresholds;
    this.profiler.setThreshold(operation, thresholds.warn);
  }

  getStatistics(operationName?: string) {
    if (operationName) {
      const measures = this.recentMeasures.get(operationName) || [];
      if (measures.length === 0) return null;

      const durations = measures.map(m => m.duration);
      return {
        operation: operationName,
        count: measures.length,
        totalCount: this.operationCounts.get(operationName) || 0,
        averageDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
        minDuration: Math.min(...durations),
        maxDuration: Math.max(...durations),
        p50: this.calculatePercentile(durations, 50),
        p90: this.calculatePercentile(durations, 90),
        p95: this.calculatePercentile(durations, 95),
        p99: this.calculatePercentile(durations, 99)
      };
    }

    // Return overall statistics
    const allOperations = Array.from(this.operationCounts.keys());
    return allOperations.map(op => this.getStatistics(op)).filter(Boolean);
  }

  getReport() {
    return this.profiler.getReport();
  }

  reset(): void {
    this.operationCounts.clear();
    this.recentMeasures.clear();
  }

  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  updateConfig(config: Partial<PerformanceMonitorConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// Singleton instance
let globalPerformanceMonitor: PerformanceMonitor;

export function getPerformanceMonitor(config?: Partial<PerformanceMonitorConfig>): PerformanceMonitor {
  if (!globalPerformanceMonitor) {
    globalPerformanceMonitor = new PerformanceMonitor(config);
  }
  return globalPerformanceMonitor;
}

export function setPerformanceMonitor(monitor: PerformanceMonitor): void {
  globalPerformanceMonitor = monitor;
}