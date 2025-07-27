/**
 * Performance-based log filtering
 */

import { ILogFilter, LogEntry } from '../types';

export class PerformanceFilter implements ILogFilter {
  private minDuration?: number;
  private maxDuration?: number;
  private minMemoryUsage?: number;
  private maxMemoryUsage?: number;
  private onlyWithPerformanceData: boolean;
  private slowOperationThreshold: number;

  constructor(options: PerformanceFilterOptions = {}) {
    this.minDuration = options.minDuration;
    this.maxDuration = options.maxDuration;
    this.minMemoryUsage = options.minMemoryUsage;
    this.maxMemoryUsage = options.maxMemoryUsage;
    this.onlyWithPerformanceData = options.onlyWithPerformanceData ?? false;
    this.slowOperationThreshold = options.slowOperationThreshold ?? 1000; // 1 second default
  }

  shouldLog(entry: LogEntry): boolean {
    const performance = entry.performance;

    // If we only want entries with performance data and this entry doesn't have it
    if (this.onlyWithPerformanceData && !performance) {
      return false;
    }

    // If no performance data and no strict requirement, allow it
    if (!performance) {
      return !this.onlyWithPerformanceData;
    }

    // Check duration filters
    if (performance.duration !== undefined) {
      if (this.minDuration !== undefined && performance.duration < this.minDuration) {
        return false;
      }
      
      if (this.maxDuration !== undefined && performance.duration > this.maxDuration) {
        return false;
      }
    }

    // Check memory usage filters
    if (performance.memoryUsage?.heapUsed !== undefined) {
      const memoryUsed = performance.memoryUsage.heapUsed;
      
      if (this.minMemoryUsage !== undefined && memoryUsed < this.minMemoryUsage) {
        return false;
      }
      
      if (this.maxMemoryUsage !== undefined && memoryUsed > this.maxMemoryUsage) {
        return false;
      }
    }

    return true;
  }

  isSlowOperation(entry: LogEntry): boolean {
    return entry.performance?.duration !== undefined && 
           entry.performance.duration > this.slowOperationThreshold;
  }

  isHighMemoryOperation(entry: LogEntry): boolean {
    if (!entry.performance?.memoryUsage) {
      return false;
    }
    
    const memoryUsed = entry.performance.memoryUsage.heapUsed;
    return this.maxMemoryUsage !== undefined && memoryUsed > this.maxMemoryUsage;
  }

  setMinDuration(duration: number): void {
    this.minDuration = duration;
  }

  setMaxDuration(duration: number): void {
    this.maxDuration = duration;
  }

  setMinMemoryUsage(usage: number): void {
    this.minMemoryUsage = usage;
  }

  setMaxMemoryUsage(usage: number): void {
    this.maxMemoryUsage = usage;
  }

  setSlowOperationThreshold(threshold: number): void {
    this.slowOperationThreshold = threshold;
  }

  setOnlyWithPerformanceData(only: boolean): void {
    this.onlyWithPerformanceData = only;
  }

  getStats() {
    return {
      minDuration: this.minDuration,
      maxDuration: this.maxDuration,
      minMemoryUsage: this.minMemoryUsage,
      maxMemoryUsage: this.maxMemoryUsage,
      onlyWithPerformanceData: this.onlyWithPerformanceData,
      slowOperationThreshold: this.slowOperationThreshold
    };
  }
}

export interface PerformanceFilterOptions {
  minDuration?: number;
  maxDuration?: number;
  minMemoryUsage?: number;
  maxMemoryUsage?: number;
  onlyWithPerformanceData?: boolean;
  slowOperationThreshold?: number;
}