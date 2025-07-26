import { Connection } from 'vscode-languageserver/node';
import { MemoryInfo } from './ServerManager';

export interface ResourceStatus {
  memoryOk: boolean;
  cpuOk: boolean;
  fileHandlesOk: boolean;
  connectionsOk: boolean;
  warnings: string[];
}

export interface ResourceMonitor {
  getMemoryUsage(): MemoryInfo;
  getCpuUsage(): number;
  getFileHandleCount(): number;
  getConnectionCount(): number;
  checkResourceLimits(): ResourceStatus;
  cleanup(): Promise<void>;
  initialize?(): Promise<void>;
}

export class ProductionResourceMonitor implements ResourceMonitor {
  private connection: Connection;
  private memoryThreshold = 100 * 1024 * 1024; // 100MB
  private cpuThreshold = 80; // 80%
  private fileHandleThreshold = 1000;
  private connectionThreshold = 100;
  
  private cpuUsageHistory: number[] = [];
  private memoryLeakDetection: MemoryInfo[] = [];
  private fileHandleCount = 0;
  private connectionCount = 0;
  private cleanupTasks: (() => Promise<void>)[] = [];
  
  private monitoringInterval?: NodeJS.Timeout;
  private readonly MONITORING_INTERVAL = 10000; // 10 seconds
  private readonly HISTORY_SIZE = 60; // Keep 10 minutes of history
  private readonly MEMORY_LEAK_THRESHOLD = 1.5; // 50% increase indicates potential leak

  constructor(connection: Connection) {
    this.connection = connection;
  }

  async initialize(): Promise<void> {
    this.connection.console.log('Initializing resource monitor...');
    
    // Start continuous monitoring
    this.startMonitoring();
    
    // Setup periodic cleanup
    this.setupPeriodicCleanup();
  }

  getMemoryUsage(): MemoryInfo {
    const usage = process.memoryUsage();
    return {
      rss: usage.rss,
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external
    };
  }

  getCpuUsage(): number {
    // Return average CPU usage from history
    if (this.cpuUsageHistory.length === 0) {
      return 0;
    }
    
    const sum = this.cpuUsageHistory.reduce((a, b) => a + b, 0);
    return sum / this.cpuUsageHistory.length;
  }

  getFileHandleCount(): number {
    // In a real implementation, this would query the OS
    // For now, we'll track it manually
    return this.fileHandleCount;
  }

  getConnectionCount(): number {
    return this.connectionCount;
  }

  checkResourceLimits(): ResourceStatus {
    const memory = this.getMemoryUsage();
    const cpu = this.getCpuUsage();
    const fileHandles = this.getFileHandleCount();
    const connections = this.getConnectionCount();
    
    const warnings: string[] = [];
    
    const memoryOk = memory.heapUsed < this.memoryThreshold;
    const cpuOk = cpu < this.cpuThreshold;
    const fileHandlesOk = fileHandles < this.fileHandleThreshold;
    const connectionsOk = connections < this.connectionThreshold;
    
    // Generate warnings
    if (!memoryOk) {
      warnings.push(`Memory usage high: ${Math.round(memory.heapUsed / 1024 / 1024)}MB (threshold: ${Math.round(this.memoryThreshold / 1024 / 1024)}MB)`);
    }
    
    if (!cpuOk) {
      warnings.push(`CPU usage high: ${cpu.toFixed(1)}% (threshold: ${this.cpuThreshold}%)`);
    }
    
    if (!fileHandlesOk) {
      warnings.push(`File handle count high: ${fileHandles} (threshold: ${this.fileHandleThreshold})`);
    }
    
    if (!connectionsOk) {
      warnings.push(`Connection count high: ${connections} (threshold: ${this.connectionThreshold})`);
    }
    
    // Check for memory leaks
    const memoryLeakWarning = this.checkMemoryLeak();
    if (memoryLeakWarning) {
      warnings.push(memoryLeakWarning);
    }

    return {
      memoryOk,
      cpuOk,
      fileHandlesOk,
      connectionsOk,
      warnings
    };
  }

  async cleanup(): Promise<void> {
    this.connection.console.log('Performing resource cleanup...');
    
    try {
      // Stop monitoring
      if (this.monitoringInterval) {
        clearInterval(this.monitoringInterval);
        this.monitoringInterval = undefined;
      }
      
      // Execute all cleanup tasks
      const cleanupPromises = this.cleanupTasks.map(async (task) => {
        try {
          await task();
        } catch (error) {
          this.connection.console.error(`Cleanup task failed: ${error}`);
        }
      });
      
      await Promise.allSettled(cleanupPromises);
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        this.connection.console.log('Forced garbage collection');
      }
      
      this.connection.console.log('Resource cleanup completed');
      
    } catch (error) {
      this.connection.console.error(`Error during cleanup: ${error}`);
      throw error;
    }
  }

  addCleanupTask(task: () => Promise<void>): void {
    this.cleanupTasks.push(task);
  }

  trackFileHandle(operation: 'open' | 'close'): void {
    if (operation === 'open') {
      this.fileHandleCount++;
    } else {
      this.fileHandleCount = Math.max(0, this.fileHandleCount - 1);
    }
  }

  trackConnection(operation: 'connect' | 'disconnect'): void {
    if (operation === 'connect') {
      this.connectionCount++;
    } else {
      this.connectionCount = Math.max(0, this.connectionCount - 1);
    }
  }

  setThresholds(thresholds: {
    memory?: number;
    cpu?: number;
    fileHandles?: number;
    connections?: number;
  }): void {
    if (thresholds.memory !== undefined) {
      this.memoryThreshold = thresholds.memory;
    }
    if (thresholds.cpu !== undefined) {
      this.cpuThreshold = thresholds.cpu;
    }
    if (thresholds.fileHandles !== undefined) {
      this.fileHandleThreshold = thresholds.fileHandles;
    }
    if (thresholds.connections !== undefined) {
      this.connectionThreshold = thresholds.connections;
    }
  }

  getResourceStats() {
    return {
      memory: this.getMemoryUsage(),
      cpuHistory: [...this.cpuUsageHistory],
      memoryHistory: [...this.memoryLeakDetection],
      fileHandles: this.fileHandleCount,
      connections: this.connectionCount,
      thresholds: {
        memory: this.memoryThreshold,
        cpu: this.cpuThreshold,
        fileHandles: this.fileHandleThreshold,
        connections: this.connectionThreshold
      }
    };
  }

  private startMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      try {
        this.collectMetrics();
      } catch (error) {
        this.connection.console.error(`Error collecting metrics: ${error}`);
      }
    }, this.MONITORING_INTERVAL);
  }

  private collectMetrics(): void {
    // Collect CPU usage (simplified - in real implementation would use pidusage or similar)
    const cpuUsage = this.calculateCpuUsage();
    this.cpuUsageHistory.push(cpuUsage);
    
    // Keep history size limited
    if (this.cpuUsageHistory.length > this.HISTORY_SIZE) {
      this.cpuUsageHistory.shift();
    }
    
    // Collect memory usage for leak detection
    const memoryUsage = this.getMemoryUsage();
    this.memoryLeakDetection.push(memoryUsage);
    
    if (this.memoryLeakDetection.length > this.HISTORY_SIZE) {
      this.memoryLeakDetection.shift();
    }
  }

  private calculateCpuUsage(): number {
    // Simplified CPU usage calculation
    // In production, would use proper CPU monitoring
    const usage = process.cpuUsage();
    const totalTime = usage.user + usage.system;
    
    // Convert to percentage (this is a simplified calculation)
    return Math.min(100, totalTime / 1000000); // Convert microseconds to percentage
  }

  private checkMemoryLeak(): string | null {
    if (this.memoryLeakDetection.length < 10) {
      return null; // Not enough data
    }
    
    const recent = this.memoryLeakDetection.slice(-5);
    const older = this.memoryLeakDetection.slice(-15, -10);
    
    const recentAvg = recent.reduce((sum, mem) => sum + mem.heapUsed, 0) / recent.length;
    const olderAvg = older.reduce((sum, mem) => sum + mem.heapUsed, 0) / older.length;
    
    const increase = recentAvg / olderAvg;
    
    if (increase > this.MEMORY_LEAK_THRESHOLD) {
      return `Potential memory leak detected: ${((increase - 1) * 100).toFixed(1)}% increase in heap usage`;
    }
    
    return null;
  }

  private setupPeriodicCleanup(): void {
    // Run cleanup every 5 minutes
    setInterval(() => {
      this.performPeriodicCleanup();
    }, 5 * 60 * 1000);
  }

  private async performPeriodicCleanup(): Promise<void> {
    try {
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      // Clean up old metric history if it gets too large
      if (this.cpuUsageHistory.length > this.HISTORY_SIZE * 2) {
        this.cpuUsageHistory = this.cpuUsageHistory.slice(-this.HISTORY_SIZE);
      }
      
      if (this.memoryLeakDetection.length > this.HISTORY_SIZE * 2) {
        this.memoryLeakDetection = this.memoryLeakDetection.slice(-this.HISTORY_SIZE);
      }
      
    } catch (error) {
      this.connection.console.error(`Periodic cleanup error: ${error}`);
    }
  }
}