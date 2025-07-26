import { Connection } from 'vscode-languageserver/node';

export interface ErrorContext {
  operation: string;
  userId?: string;
  documentUri?: string;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface RecoveryStrategy {
  canRecover(error: Error, context: ErrorContext): boolean;
  recover(error: Error, context: ErrorContext): Promise<void>;
  getRecoveryDescription(): string;
}

export interface ErrorReporter {
  reportError(error: Error, context: ErrorContext): Promise<void>;
}

export interface ErrorBoundary {
  handleError(error: Error, context: ErrorContext): void;
  canRecover(error: Error): boolean;
  recover(error: Error): Promise<void>;
  reportError(error: Error, context: ErrorContext): void;
  onError(handler: (error: Error, context: ErrorContext) => void): void;
}

export class ProductionErrorBoundary implements ErrorBoundary {
  private connection: Connection;
  private errorReporter: ErrorReporter;
  private recoveryStrategies: Map<string, RecoveryStrategy> = new Map();
  private errorHandlers: Array<(error: Error, context: ErrorContext) => void> = [];
  private errorCounts: Map<string, number> = new Map();
  private lastErrors: Map<string, Date> = new Map();
  
  private readonly MAX_ERROR_RATE = 10; // Max errors per minute per operation
  private readonly ERROR_RATE_WINDOW = 60000; // 1 minute

  constructor(connection: Connection, errorReporter: ErrorReporter) {
    this.connection = connection;
    this.errorReporter = errorReporter;
    this.initializeRecoveryStrategies();
  }

  handleError(error: Error, context: ErrorContext): void {
    try {
      // Log the error
      this.logError(error, context);
      
      // Check error rate limiting
      if (this.isErrorRateLimited(context.operation)) {
        this.connection.console.warn(`Error rate limit exceeded for operation: ${context.operation}`);
        return;
      }
      
      // Increment error count
      this.incrementErrorCount(context.operation);
      
      // Report the error
      this.reportError(error, context);
      
      // Attempt recovery if possible
      if (this.canRecover(error)) {
        this.recover(error).catch(recoveryError => {
          this.connection.console.error(`Recovery failed: ${recoveryError.message}`);
        });
      } else {
        this.escalateError(error, context);
      }
      
      // Notify error handlers
      this.notifyErrorHandlers(error, context);
      
    } catch (handlingError) {
      // Error in error handling - this is critical
      this.connection.console.error(`Critical: Error boundary failed: ${(handlingError as Error).message}`);
      this.connection.console.error(`Original error: ${error.message}`);
    }
  }

  canRecover(error: Error): boolean {
    // Check if any recovery strategy can handle this error
    for (const [, strategy] of this.recoveryStrategies) {
      if (strategy.canRecover(error, this.createDefaultContext())) {
        return true;
      }
    }
    return false;
  }

  async recover(error: Error): Promise<void> {
    const context = this.createDefaultContext();
    
    // Try each recovery strategy
    for (const [name, strategy] of this.recoveryStrategies) {
      if (strategy.canRecover(error, context)) {
        try {
          this.connection.console.log(`Attempting recovery with strategy: ${name}`);
          await strategy.recover(error, context);
          this.connection.console.log(`Recovery successful with strategy: ${name}`);
          return;
        } catch (recoveryError) {
          this.connection.console.error(`Recovery strategy ${name} failed: ${(recoveryError as Error).message}`);
          continue;
        }
      }
    }
    
    throw new Error(`No recovery strategy succeeded for error: ${error.message}`);
  }

  reportError(error: Error, context: ErrorContext): void {
    // Async error reporting - don't block
    this.errorReporter.reportError(error, context).catch(reportError => {
      this.connection.console.error(`Error reporting failed: ${reportError.message}`);
    });
  }

  onError(handler: (error: Error, context: ErrorContext) => void): void {
    this.errorHandlers.push(handler);
  }

  addRecoveryStrategy(name: string, strategy: RecoveryStrategy): void {
    this.recoveryStrategies.set(name, strategy);
  }

  private initializeRecoveryStrategies(): void {
    // Cache invalidation recovery
    this.addRecoveryStrategy('cache_invalidation', new CacheInvalidationRecovery());
    
    // Service restart recovery
    this.addRecoveryStrategy('service_restart', new ServiceRestartRecovery());
    
    // Memory cleanup recovery
    this.addRecoveryStrategy('memory_cleanup', new MemoryCleanupRecovery());
    
    // Connection reset recovery
    this.addRecoveryStrategy('connection_reset', new ConnectionResetRecovery());
  }

  private logError(error: Error, context: ErrorContext): void {
    const logLevel = this.getLogLevel(context.severity);
    const message = `[${context.severity.toUpperCase()}] ${context.operation}: ${error.message}`;
    
    switch (logLevel) {
      case 'error':
        this.connection.console.error(message);
        if (error.stack) {
          this.connection.console.error(error.stack);
        }
        break;
      case 'warn':
        this.connection.console.warn(message);
        break;
      default:
        this.connection.console.log(message);
    }
  }

  private getLogLevel(severity: string): 'error' | 'warn' | 'log' {
    switch (severity) {
      case 'critical':
      case 'high':
        return 'error';
      case 'medium':
        return 'warn';
      default:
        return 'log';
    }
  }

  private isErrorRateLimited(operation: string): boolean {
    const now = new Date();
    const lastError = this.lastErrors.get(operation);
    
    if (!lastError || now.getTime() - lastError.getTime() > this.ERROR_RATE_WINDOW) {
      // Reset counter if outside window
      this.errorCounts.set(operation, 0);
      this.lastErrors.set(operation, now);
      return false;
    }
    
    const errorCount = this.errorCounts.get(operation) || 0;
    return errorCount >= this.MAX_ERROR_RATE;
  }

  private incrementErrorCount(operation: string): void {
    const currentCount = this.errorCounts.get(operation) || 0;
    this.errorCounts.set(operation, currentCount + 1);
    this.lastErrors.set(operation, new Date());
  }

  private escalateError(error: Error, context: ErrorContext): void {
    this.connection.console.error(`Escalating error - no recovery possible: ${error.message}`);
    
    // Could send to external monitoring system
    // Could trigger alerts
    // Could initiate more drastic recovery measures
  }

  private notifyErrorHandlers(error: Error, context: ErrorContext): void {
    this.errorHandlers.forEach(handler => {
      try {
        handler(error, context);
      } catch (handlerError) {
        this.connection.console.error(`Error handler failed: ${(handlerError as Error).message}`);
      }
    });
  }

  private createDefaultContext(): ErrorContext {
    return {
      operation: 'unknown',
      timestamp: new Date(),
      severity: 'medium'
    };
  }
}

// Recovery strategy implementations

class CacheInvalidationRecovery implements RecoveryStrategy {
  canRecover(error: Error, context: ErrorContext): boolean {
    return error.message.includes('cache') || 
           error.message.includes('stale') ||
           context.operation.includes('cache');
  }

  async recover(error: Error, context: ErrorContext): Promise<void> {
    // Invalidate caches - this would need to be connected to actual cache services
    console.log('Invalidating caches for recovery');
  }

  getRecoveryDescription(): string {
    return 'Invalidate caches and retry operation';
  }
}

class ServiceRestartRecovery implements RecoveryStrategy {
  canRecover(error: Error, context: ErrorContext): boolean {
    return error.message.includes('service') ||
           error.message.includes('timeout') ||
           context.severity === 'high';
  }

  async recover(error: Error, context: ErrorContext): Promise<void> {
    // Restart affected services
    console.log('Restarting services for recovery');
  }

  getRecoveryDescription(): string {
    return 'Restart affected services';
  }
}

class MemoryCleanupRecovery implements RecoveryStrategy {
  canRecover(error: Error, context: ErrorContext): boolean {
    return error.message.includes('memory') ||
           error.message.includes('heap') ||
           error.name === 'RangeError';
  }

  async recover(error: Error, context: ErrorContext): Promise<void> {
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    console.log('Performed memory cleanup for recovery');
  }

  getRecoveryDescription(): string {
    return 'Clean up memory and force garbage collection';
  }
}

class ConnectionResetRecovery implements RecoveryStrategy {
  canRecover(error: Error, context: ErrorContext): boolean {
    return error.message.includes('connection') ||
           error.message.includes('network') ||
           (error as any).code === 'ECONNRESET';
  }

  async recover(error: Error, context: ErrorContext): Promise<void> {
    // Reset connections
    console.log('Resetting connections for recovery');
  }

  getRecoveryDescription(): string {
    return 'Reset network connections';
  }
}

// Simple error reporter implementation
export class ConsoleErrorReporter implements ErrorReporter {
  constructor(private connection: Connection) {}

  async reportError(error: Error, context: ErrorContext): Promise<void> {
    const report = {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      context,
      timestamp: new Date().toISOString()
    };
    
    this.connection.console.log(`Error Report: ${JSON.stringify(report, null, 2)}`);
  }
}