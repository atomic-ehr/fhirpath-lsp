import { Connection } from 'vscode-languageserver/node';
import { ErrorBoundary } from './ErrorBoundary';
import { ResourceMonitor } from './ResourceMonitor';
import { HealthChecker } from './HealthChecker';

export interface ServerHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  memoryUsage: MemoryInfo;
  cpuUsage: number;
  activeConnections: number;
  lastError?: Error;
  services: ServiceHealth[];
}

export interface ServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: Date;
  errorCount: number;
  responseTime: number;
}

export interface MemoryInfo {
  rss: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
}

export type ErrorHandler = (error: Error) => void;
export type StateChangeHandler = (state: ServerState) => void;

export enum ServerState {
  STARTING = 'starting',
  RUNNING = 'running',
  DEGRADED = 'degraded',
  SHUTTING_DOWN = 'shutting_down',
  STOPPED = 'stopped',
  ERROR = 'error'
}

export interface ServerManager {
  start(): Promise<void>;
  stop(): Promise<void>;
  restart(): Promise<void>;
  getHealth(): ServerHealth;
  getState(): ServerState;
  onError(handler: ErrorHandler): void;
  onStateChange(handler: StateChangeHandler): void;
}

export class ProductionServerManager implements ServerManager {
  private connection: Connection;
  private errorBoundary: ErrorBoundary;
  private resourceMonitor: ResourceMonitor;
  private healthChecker: HealthChecker;
  
  private state: ServerState = ServerState.STOPPED;
  private startTime: Date = new Date();
  private errorHandlers: ErrorHandler[] = [];
  private stateChangeHandlers: StateChangeHandler[] = [];
  private shutdownHandlers: (() => Promise<void>)[] = [];
  private healthCheckInterval?: NodeJS.Timeout;
  
  private readonly HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
  private readonly SHUTDOWN_TIMEOUT = 5000; // 5 seconds

  constructor(
    connection: Connection,
    errorBoundary: ErrorBoundary,
    resourceMonitor: ResourceMonitor,
    healthChecker: HealthChecker
  ) {
    this.connection = connection;
    this.errorBoundary = errorBoundary;
    this.resourceMonitor = resourceMonitor;
    this.healthChecker = healthChecker;
    
    this.setupSignalHandlers();
    this.setupErrorHandling();
  }

  async start(): Promise<void> {
    try {
      this.setState(ServerState.STARTING);
      this.connection.console.log('Starting FHIRPath Language Server...');
      
      this.startTime = new Date();
      
      // Initialize all services
      await this.initializeServices();
      
      // Start health monitoring
      this.startHealthMonitoring();
      
      this.setState(ServerState.RUNNING);
      this.connection.console.log('FHIRPath Language Server started successfully');
      
    } catch (error) {
      this.setState(ServerState.ERROR);
      this.handleError(error as Error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.connection.console.log('Stopping FHIRPath Language Server...');
    this.setState(ServerState.SHUTTING_DOWN);
    
    try {
      // Stop health monitoring
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = undefined;
      }
      
      // Execute all shutdown handlers
      await this.executeShutdownHandlers();
      
      // Cleanup resources
      await this.resourceMonitor.cleanup();
      
      this.setState(ServerState.STOPPED);
      this.connection.console.log('FHIRPath Language Server stopped successfully');
      
    } catch (error) {
      this.connection.console.error(`Error during shutdown: ${error}`);
      this.setState(ServerState.ERROR);
      throw error;
    }
  }

  async restart(): Promise<void> {
    this.connection.console.log('Restarting FHIRPath Language Server...');
    
    try {
      await this.stop();
      // Small delay to ensure cleanup is complete
      await new Promise(resolve => setTimeout(resolve, 100));
      await this.start();
    } catch (error) {
      this.setState(ServerState.ERROR);
      this.handleError(error as Error);
      throw error;
    }
  }

  getHealth(): ServerHealth {
    const uptime = Date.now() - this.startTime.getTime();
    const memoryUsage = this.resourceMonitor.getMemoryUsage();
    const resourceStatus = this.resourceMonitor.checkResourceLimits();
    
    // Determine overall health status
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    if (this.state === ServerState.ERROR) {
      status = 'unhealthy';
    } else if (this.state === ServerState.DEGRADED || !resourceStatus.memoryOk || !resourceStatus.cpuOk) {
      status = 'degraded';
    }

    return {
      status,
      uptime,
      memoryUsage,
      cpuUsage: this.resourceMonitor.getCpuUsage(),
      activeConnections: this.resourceMonitor.getConnectionCount(),
      services: this.healthChecker.getServicesHealth()
    };
  }

  getState(): ServerState {
    return this.state;
  }

  onError(handler: ErrorHandler): void {
    this.errorHandlers.push(handler);
  }

  onStateChange(handler: StateChangeHandler): void {
    this.stateChangeHandlers.push(handler);
  }

  addShutdownHandler(handler: () => Promise<void>): void {
    this.shutdownHandlers.push(handler);
  }

  private async initializeServices(): Promise<void> {
    // Initialize health checker
    await this.healthChecker.initialize();
    
    // Initialize resource monitor
    await this.resourceMonitor.initialize?.();
    
    // Validate startup conditions
    await this.validateStartupConditions();
  }

  private async validateStartupConditions(): Promise<void> {
    const resourceStatus = this.resourceMonitor.checkResourceLimits();
    
    if (!resourceStatus.memoryOk) {
      throw new Error('Insufficient memory available for startup');
    }
    
    // Check if all critical services are healthy
    const servicesHealth = this.healthChecker.getServicesHealth();
    const criticalServices = servicesHealth.filter(s => s.name.includes('critical'));
    const unhealthyCriticalServices = criticalServices.filter(s => s.status === 'unhealthy');
    
    if (unhealthyCriticalServices.length > 0) {
      throw new Error(`Critical services unhealthy: ${unhealthyCriticalServices.map(s => s.name).join(', ')}`);
    }
  }

  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        this.connection.console.error(`Health check failed: ${error}`);
        this.handleError(error as Error);
      }
    }, this.HEALTH_CHECK_INTERVAL);
  }

  private async performHealthCheck(): Promise<void> {
    const resourceStatus = this.resourceMonitor.checkResourceLimits();
    
    // Check for resource issues
    if (!resourceStatus.memoryOk || !resourceStatus.cpuOk) {
      if (this.state === ServerState.RUNNING) {
        this.setState(ServerState.DEGRADED);
        this.connection.console.warn('Server entering degraded mode due to resource constraints');
      }
    } else if (this.state === ServerState.DEGRADED) {
      // Resources recovered, back to normal
      this.setState(ServerState.RUNNING);
      this.connection.console.log('Server recovered from degraded mode');
    }
    
    // Perform service health checks
    await this.healthChecker.checkAllServices();
    
    // Log warnings if any
    if (resourceStatus.warnings.length > 0) {
      resourceStatus.warnings.forEach(warning => {
        this.connection.console.warn(`Resource warning: ${warning}`);
      });
    }
  }

  private setupSignalHandlers(): void {
    // Graceful shutdown on SIGTERM
    process.on('SIGTERM', async () => {
      this.connection.console.log('Received SIGTERM, initiating graceful shutdown...');
      try {
        await this.stop();
        process.exit(0);
      } catch (error) {
        this.connection.console.error(`Error during SIGTERM shutdown: ${error}`);
        process.exit(1);
      }
    });

    // Graceful shutdown on SIGINT (Ctrl+C)
    process.on('SIGINT', async () => {
      this.connection.console.log('Received SIGINT, initiating graceful shutdown...');
      try {
        await this.stop();
        process.exit(0);
      } catch (error) {
        this.connection.console.error(`Error during SIGINT shutdown: ${error}`);
        process.exit(1);
      }
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.connection.console.error(`Uncaught exception: ${error.stack}`);
      this.handleError(error);
      
      // Give some time for cleanup then exit
      setTimeout(() => {
        process.exit(1);
      }, 1000);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      this.connection.console.error(`Unhandled rejection at: ${promise}, reason: ${reason}`);
      
      const error = reason instanceof Error ? reason : new Error(String(reason));
      this.handleError(error);
    });
  }

  private setupErrorHandling(): void {
    this.errorBoundary.onError((error, context) => {
      this.handleError(error);
    });
  }

  private async executeShutdownHandlers(): Promise<void> {
    const shutdownPromises = this.shutdownHandlers.map(async (handler) => {
      try {
        await Promise.race([
          handler(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Shutdown handler timeout')), this.SHUTDOWN_TIMEOUT)
          )
        ]);
      } catch (error) {
        this.connection.console.error(`Shutdown handler failed: ${error}`);
      }
    });

    await Promise.allSettled(shutdownPromises);
  }

  private setState(newState: ServerState): void {
    if (this.state !== newState) {
      const oldState = this.state;
      this.state = newState;
      
      this.connection.console.log(`Server state changed: ${oldState} -> ${newState}`);
      
      // Notify state change handlers
      this.stateChangeHandlers.forEach(handler => {
        try {
          handler(newState);
        } catch (error) {
          this.connection.console.error(`State change handler error: ${error}`);
        }
      });
    }
  }

  private handleError(error: Error): void {
    this.connection.console.error(`Server error: ${error.stack}`);
    
    // Notify error handlers
    this.errorHandlers.forEach(handler => {
      try {
        handler(error);
      } catch (handlerError) {
        this.connection.console.error(`Error handler failed: ${handlerError}`);
      }
    });
    
    // Let error boundary handle the error
    this.errorBoundary.handleError(error, {
      operation: 'server_operation',
      timestamp: new Date(),
      severity: 'high'
    });
  }
}