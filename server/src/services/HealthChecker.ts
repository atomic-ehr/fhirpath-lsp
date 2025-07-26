import { Connection } from 'vscode-languageserver/node';
import { ServiceHealth } from './ServerManager';

export interface HealthCheckResult {
  healthy: boolean;
  responseTime: number;
  error?: Error;
}

export interface HealthCheckService {
  name: string;
  check(): Promise<HealthCheckResult>;
  isCritical(): boolean;
}

export interface HealthChecker {
  initialize(): Promise<void>;
  addService(service: HealthCheckService): void;
  removeService(name: string): void;
  checkService(name: string): Promise<ServiceHealth>;
  checkAllServices(): Promise<ServiceHealth[]>;
  getServicesHealth(): ServiceHealth[];
}

export class ProductionHealthChecker implements HealthChecker {
  private connection: Connection;
  private services: Map<string, HealthCheckService> = new Map();
  private serviceHealth: Map<string, ServiceHealth> = new Map();
  
  private readonly DEFAULT_TIMEOUT = 5000; // 5 seconds
  private readonly MAX_ERROR_COUNT = 5;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  async initialize(): Promise<void> {
    this.connection.console.log('Initializing health checker...');
    
    // Add core services
    this.addCoreServices();
    
    // Perform initial health check
    await this.checkAllServices();
  }

  addService(service: HealthCheckService): void {
    this.services.set(service.name, service);
    
    // Initialize health record
    this.serviceHealth.set(service.name, {
      name: service.name,
      status: 'healthy',
      lastCheck: new Date(),
      errorCount: 0,
      responseTime: 0
    });
    
    this.connection.console.log(`Added health check service: ${service.name}`);
  }

  removeService(name: string): void {
    this.services.delete(name);
    this.serviceHealth.delete(name);
    this.connection.console.log(`Removed health check service: ${name}`);
  }

  async checkService(name: string): Promise<ServiceHealth> {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Health check service not found: ${name}`);
    }

    const startTime = Date.now();
    
    try {
      const result = await Promise.race([
        service.check(),
        new Promise<HealthCheckResult>((_, reject) =>
          setTimeout(() => reject(new Error('Health check timeout')), this.DEFAULT_TIMEOUT)
        )
      ]);

      const responseTime = Date.now() - startTime;
      
      const health: ServiceHealth = {
        name,
        status: result.healthy ? 'healthy' : 'unhealthy',
        lastCheck: new Date(),
        errorCount: result.healthy ? 0 : this.incrementErrorCount(name),
        responseTime
      };
      
      // Check if service should be marked as degraded
      if (!result.healthy && health.errorCount < this.MAX_ERROR_COUNT) {
        health.status = 'degraded';
      }
      
      this.serviceHealth.set(name, health);
      
      if (!result.healthy) {
        this.connection.console.warn(`Health check failed for ${name}: ${result.error?.message}`);
      }
      
      return health;
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorCount = this.incrementErrorCount(name);
      
      const health: ServiceHealth = {
        name,
        status: errorCount >= this.MAX_ERROR_COUNT ? 'unhealthy' : 'degraded',
        lastCheck: new Date(),
        errorCount,
        responseTime
      };
      
      this.serviceHealth.set(name, health);
      this.connection.console.error(`Health check error for ${name}: ${error}`);
      
      return health;
    }
  }

  async checkAllServices(): Promise<ServiceHealth[]> {
    const healthPromises = Array.from(this.services.keys()).map(name =>
      this.checkService(name)
    );
    
    const results = await Promise.allSettled(healthPromises);
    
    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        const serviceName = Array.from(this.services.keys())[index];
        this.connection.console.error(`Failed to check service ${serviceName}: ${result.reason}`);
        
        return {
          name: serviceName,
          status: 'unhealthy' as const,
          lastCheck: new Date(),
          errorCount: this.MAX_ERROR_COUNT,
          responseTime: this.DEFAULT_TIMEOUT
        };
      }
    });
  }

  getServicesHealth(): ServiceHealth[] {
    return Array.from(this.serviceHealth.values());
  }

  private addCoreServices(): void {
    // Parser service health check
    this.addService(new ParserHealthCheck());
    
    // Memory health check
    this.addService(new MemoryHealthCheck());
    
    // Connection health check
    this.addService(new ConnectionHealthCheck(this.connection));
    
    // File system health check
    this.addService(new FileSystemHealthCheck());
  }

  private incrementErrorCount(serviceName: string): number {
    const current = this.serviceHealth.get(serviceName);
    const newCount = (current?.errorCount || 0) + 1;
    
    if (current) {
      current.errorCount = newCount;
    }
    
    return newCount;
  }
}

// Core health check implementations

class ParserHealthCheck implements HealthCheckService {
  name = 'fhirpath-parser';

  async check(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      // Try to parse a simple FHIRPath expression
      // This would use the actual FHIRPath service
      const testExpression = 'Patient.name.family';
      
      // In a real implementation, this would use the FHIRPathService
      // For now, we'll simulate a successful parse
      await new Promise(resolve => setTimeout(resolve, 10)); // Simulate work
      
      return {
        healthy: true,
        responseTime: Date.now() - startTime
      };
    } catch (error) {
      return {
        healthy: false,
        responseTime: Date.now() - startTime,
        error: error as Error
      };
    }
  }

  isCritical(): boolean {
    return true; // Parser is critical for LSP functionality
  }
}

class MemoryHealthCheck implements HealthCheckService {
  name = 'memory';
  private readonly MEMORY_THRESHOLD = 200 * 1024 * 1024; // 200MB

  async check(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const memoryUsage = process.memoryUsage();
      const healthy = memoryUsage.heapUsed < this.MEMORY_THRESHOLD;
      
      return {
        healthy,
        responseTime: Date.now() - startTime,
        error: healthy ? undefined : new Error(`Memory usage too high: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`)
      };
    } catch (error) {
      return {
        healthy: false,
        responseTime: Date.now() - startTime,
        error: error as Error
      };
    }
  }

  isCritical(): boolean {
    return true;
  }
}

class ConnectionHealthCheck implements HealthCheckService {
  name = 'connection';

  constructor(private connection: Connection) {}

  async check(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      // Check if connection is still alive
      // In a real implementation, this might send a ping or check connection state
      const healthy = !!this.connection;
      
      return {
        healthy,
        responseTime: Date.now() - startTime,
        error: healthy ? undefined : new Error('Connection not available')
      };
    } catch (error) {
      return {
        healthy: false,
        responseTime: Date.now() - startTime,
        error: error as Error
      };
    }
  }

  isCritical(): boolean {
    return true;
  }
}

class FileSystemHealthCheck implements HealthCheckService {
  name = 'filesystem';

  async check(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      // Test file system access
      const fs = await import('fs/promises');
      const testPath = '/tmp/fhirpath-lsp-health-check';
      
      // Write test file
      await fs.writeFile(testPath, 'health check');
      
      // Read test file
      const content = await fs.readFile(testPath, 'utf8');
      
      // Clean up
      await fs.unlink(testPath);
      
      const healthy = content === 'health check';
      
      return {
        healthy,
        responseTime: Date.now() - startTime,
        error: healthy ? undefined : new Error('File system test failed')
      };
    } catch (error) {
      return {
        healthy: false,
        responseTime: Date.now() - startTime,
        error: error as Error
      };
    }
  }

  isCritical(): boolean {
    return false; // File system access is not critical for basic LSP functionality
  }
}

// Utility health checks for specific services

export class ServiceHealthCheck implements HealthCheckService {
  constructor(
    public name: string,
    private checkFunction: () => Promise<boolean>,
    private critical: boolean = false
  ) {}

  async check(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const healthy = await this.checkFunction();
      return {
        healthy,
        responseTime: Date.now() - startTime
      };
    } catch (error) {
      return {
        healthy: false,
        responseTime: Date.now() - startTime,
        error: error as Error
      };
    }
  }

  isCritical(): boolean {
    return this.critical;
  }
}

export class URLHealthCheck implements HealthCheckService {
  constructor(
    public name: string,
    private url: string,
    private critical: boolean = false
  ) {}

  async check(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      // In a real implementation, this would make an HTTP request
      // For now, we'll simulate a check
      const healthy = true; // Simulate success
      
      return {
        healthy,
        responseTime: Date.now() - startTime
      };
    } catch (error) {
      return {
        healthy: false,
        responseTime: Date.now() - startTime,
        error: error as Error
      };
    }
  }

  isCritical(): boolean {
    return this.critical;
  }
}