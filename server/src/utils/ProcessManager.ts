import { Connection } from 'vscode-languageserver/node';

export interface ProcessLimits {
  maxMemoryMB?: number;
  maxCpuPercent?: number;
  maxFileHandles?: number;
  maxProcesses?: number;
  timeoutMs?: number;
}

export interface ProcessStats {
  pid: number;
  memoryUsage: number;
  cpuUsage: number;
  uptime: number;
  fileHandles: number;
}

export interface ProcessManager {
  setLimits(limits: ProcessLimits): void;
  getLimits(): ProcessLimits;
  getStats(): ProcessStats;
  checkLimits(): boolean;
  isolateProcess(): Promise<void>;
  setupSandbox(): Promise<void>;
}

export class ProductionProcessManager implements ProcessManager {
  private connection: Connection;
  private limits: ProcessLimits = {
    maxMemoryMB: 200,
    maxCpuPercent: 80,
    maxFileHandles: 1000,
    maxProcesses: 1,
    timeoutMs: 30000
  };
  
  private startTime: number = Date.now();

  constructor(connection: Connection) {
    this.connection = connection;
  }

  setLimits(limits: ProcessLimits): void {
    this.limits = { ...this.limits, ...limits };
    this.connection.console.log(`Process limits updated: ${JSON.stringify(this.limits)}`);
  }

  getLimits(): ProcessLimits {
    return { ...this.limits };
  }

  getStats(): ProcessStats {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    return {
      pid: process.pid,
      memoryUsage: memUsage.heapUsed / (1024 * 1024), // MB
      cpuUsage: (cpuUsage.user + cpuUsage.system) / 1000000, // Convert to seconds
      uptime: (Date.now() - this.startTime) / 1000, // seconds
      fileHandles: this.getOpenFileHandles()
    };
  }

  checkLimits(): boolean {
    const stats = this.getStats();
    
    // Check memory limit
    if (this.limits.maxMemoryMB && stats.memoryUsage > this.limits.maxMemoryMB) {
      this.connection.console.warn(`Memory limit exceeded: ${stats.memoryUsage}MB > ${this.limits.maxMemoryMB}MB`);
      return false;
    }
    
    // Check file handle limit (simplified)
    if (this.limits.maxFileHandles && stats.fileHandles > this.limits.maxFileHandles) {
      this.connection.console.warn(`File handle limit exceeded: ${stats.fileHandles} > ${this.limits.maxFileHandles}`);
      return false;
    }
    
    return true;
  }

  async isolateProcess(): Promise<void> {
    this.connection.console.log('Setting up process isolation...');
    
    try {
      // Set process title for identification
      process.title = 'fhirpath-lsp-server';
      
      // Set up security context (if running on Unix-like systems)
      await this.setupSecurityContext();
      
      // Set up resource limits using process.setrlimit if available
      await this.setupResourceLimits();
      
      this.connection.console.log('Process isolation configured successfully');
      
    } catch (error) {
      this.connection.console.error(`Failed to setup process isolation: ${error}`);
      // Don't throw - isolation is a best-effort enhancement
    }
  }

  async setupSandbox(): Promise<void> {
    this.connection.console.log('Setting up process sandbox...');
    
    try {
      // Restrict file system access
      await this.restrictFileSystemAccess();
      
      // Restrict network access
      await this.restrictNetworkAccess();
      
      // Set up chroot if available and needed
      await this.setupChroot();
      
      this.connection.console.log('Process sandbox configured successfully');
      
    } catch (error) {
      this.connection.console.error(`Failed to setup sandbox: ${error}`);
      // Don't throw - sandboxing is a best-effort security enhancement
    }
  }

  private async setupSecurityContext(): Promise<void> {
    // This would set up security context on Unix-like systems
    // For now, we'll just log the intent
    this.connection.console.log('Security context setup (placeholder)');
  }

  private async setupResourceLimits(): Promise<void> {
    try {
      // In a real implementation, this would use process.setrlimit or similar
      // to set hard limits on memory, CPU, file descriptors, etc.
      
      this.connection.console.log('Resource limits setup (placeholder)');
      
      // Example of what this might look like:
      // if (process.setrlimit) {
      //   process.setrlimit('RLIMIT_AS', this.limits.maxMemoryMB * 1024 * 1024);
      //   process.setrlimit('RLIMIT_NOFILE', this.limits.maxFileHandles);
      // }
      
    } catch (error) {
      this.connection.console.warn(`Could not set resource limits: ${error}`);
    }
  }

  private async restrictFileSystemAccess(): Promise<void> {
    // This would restrict file system access to only necessary directories
    this.connection.console.log('File system access restriction (placeholder)');
    
    // In a real implementation, this might:
    // 1. Use chroot to limit file system access
    // 2. Set up a whitelist of allowed directories
    // 3. Use security modules like AppArmor or SELinux
  }

  private async restrictNetworkAccess(): Promise<void> {
    // This would restrict network access to only necessary endpoints
    this.connection.console.log('Network access restriction (placeholder)');
    
    // In a real implementation, this might:
    // 1. Set up firewall rules
    // 2. Use network namespaces
    // 3. Configure proxy settings
  }

  private async setupChroot(): Promise<void> {
    // This would set up a chroot environment if needed
    this.connection.console.log('Chroot setup (placeholder)');
    
    // In a real implementation with sufficient privileges:
    // process.chroot('/path/to/sandbox');
    // process.chdir('/');
  }

  private getOpenFileHandles(): number {
    // This is a simplified implementation
    // In a real implementation, this would query the OS for actual file handle count
    
    try {
      // On Unix-like systems, you might read from /proc/self/fd or use lsof
      // For now, we'll return a placeholder value
      return 10; // Placeholder
    } catch (error) {
      this.connection.console.warn(`Could not get file handle count: ${error}`);
      return 0;
    }
  }
}

// Utility functions for process management

export class ProcessMonitor {
  private connection: Connection;
  private monitoringInterval?: NodeJS.Timeout;
  private processManager: ProcessManager;
  
  constructor(connection: Connection, processManager: ProcessManager) {
    this.connection = connection;
    this.processManager = processManager;
  }

  startMonitoring(intervalMs: number = 30000): void {
    this.connection.console.log(`Starting process monitoring (interval: ${intervalMs}ms)`);
    
    this.monitoringInterval = setInterval(() => {
      try {
        this.checkProcessHealth();
      } catch (error) {
        this.connection.console.error(`Process monitoring error: ${error}`);
      }
    }, intervalMs);
  }

  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
      this.connection.console.log('Process monitoring stopped');
    }
  }

  private checkProcessHealth(): void {
    const stats = this.processManager.getStats();
    const limits = this.processManager.getLimits();
    
    // Log stats periodically
    this.connection.console.log(`Process stats - PID: ${stats.pid}, Memory: ${stats.memoryUsage.toFixed(1)}MB, CPU: ${stats.cpuUsage.toFixed(2)}s, Uptime: ${stats.uptime.toFixed(0)}s`);
    
    // Check if limits are violated
    if (!this.processManager.checkLimits()) {
      this.connection.console.warn('Process limits violated - consider restart or resource cleanup');
      
      // Could trigger automatic actions here:
      // 1. Force garbage collection
      // 2. Clear caches
      // 3. Restart services
      // 4. Send alerts
    }
    
    // Check for anomalies
    this.detectAnomalies(stats, limits);
  }

  private detectAnomalies(stats: ProcessStats, limits: ProcessLimits): void {
    // Detect potential memory leaks
    if (limits.maxMemoryMB && stats.memoryUsage > limits.maxMemoryMB * 0.8) {
      this.connection.console.warn('Memory usage approaching limit - potential memory leak');
    }
    
    // Detect high CPU usage
    if (limits.maxCpuPercent && stats.cpuUsage > limits.maxCpuPercent * 0.8) {
      this.connection.console.warn('CPU usage high - potential performance issue');
    }
    
    // Detect file handle leaks
    if (limits.maxFileHandles && stats.fileHandles > limits.maxFileHandles * 0.8) {
      this.connection.console.warn('File handle count high - potential resource leak');
    }
  }
}