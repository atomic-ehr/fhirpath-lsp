/**
 * Main Logger implementation with structured logging capabilities
 */

import { randomUUID } from 'crypto';
import { 
  ILogger, 
  ILogTransport, 
  ILogFilter, 
  LogEntry, 
  LogLevel, 
  LogContext, 
  PerformanceTimer,
  PerformanceMetrics 
} from './types';
import { correlationContext } from './context/CorrelationContext';

export class Logger implements ILogger {
  private transports: ILogTransport[] = [];
  private filters: ILogFilter[] = [];
  private level: LogLevel = LogLevel.INFO;
  private context: Partial<LogContext>;
  private correlationId?: string;

  constructor(context: Partial<LogContext> = {}) {
    this.context = { ...context };
  }

  error(message: string, error?: Error, context?: Partial<LogContext>, metadata?: Record<string, any>): void {
    this.log(LogLevel.ERROR, message, context, error, metadata);
  }

  warn(message: string, context?: Partial<LogContext>, metadata?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, context, undefined, metadata);
  }

  info(message: string, context?: Partial<LogContext>, metadata?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, context, undefined, metadata);
  }

  debug(message: string, context?: Partial<LogContext>, metadata?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, context, undefined, metadata);
  }

  trace(message: string, context?: Partial<LogContext>, metadata?: Record<string, any>): void {
    this.log(LogLevel.TRACE, message, context, undefined, metadata);
  }

  log(level: LogLevel, message: string, context?: Partial<LogContext>, error?: Error, metadata?: Record<string, any>): void {
    // Early return if level is too low
    if (level > this.level) {
      return;
    }

    const timestamp = new Date();
    const activeCorrelation = correlationContext.getActiveContext();
    
    const entry: LogEntry = {
      timestamp,
      level,
      message,
      correlationId: this.correlationId || activeCorrelation?.correlationId,
      context: this.mergeContext(context),
      error,
      metadata: metadata || {}
    };

    // Apply filters
    for (const filter of this.filters) {
      if (!filter.shouldLog(entry)) {
        return;
      }
    }

    // Send to transports
    for (const transport of this.transports) {
      try {
        const result = transport.log(entry);
        if (result instanceof Promise) {
          result.catch(err => {
            console.error('Transport error:', err);
          });
        }
      } catch (err) {
        console.error('Transport error:', err);
      }
    }
  }

  createChild(context: Partial<LogContext>): ILogger {
    const childLogger = new Logger(this.mergeContext(context));
    childLogger.transports = this.transports;
    childLogger.filters = this.filters;
    childLogger.level = this.level;
    childLogger.correlationId = this.correlationId;
    return childLogger;
  }

  withCorrelationId(correlationId: string): ILogger {
    const childLogger = this.createChild({});
    (childLogger as Logger).correlationId = correlationId;
    return childLogger;
  }

  withContext(context: Partial<LogContext>): ILogger {
    return this.createChild(context);
  }

  startPerformanceTimer(operation: string): PerformanceTimer {
    const startTime = process.hrtime.bigint();
    const startMemory = process.memoryUsage();
    const startCpu = process.cpuUsage();
    const marks = new Map<string, bigint>();

    return {
      end: (message?: string, context?: Partial<LogContext>) => {
        const endTime = process.hrtime.bigint();
        const endMemory = process.memoryUsage();
        const endCpu = process.cpuUsage(startCpu);
        
        const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds
        
        const performance: PerformanceMetrics = {
          duration: Math.round(duration * 100) / 100, // Round to 2 decimal places
          memoryUsage: {
            heapUsed: endMemory.heapUsed - startMemory.heapUsed,
            heapTotal: endMemory.heapTotal,
            external: endMemory.external
          },
          cpuUsage: {
            user: endCpu.user,
            system: endCpu.system
          }
        };

        const logMessage = message || `Operation '${operation}' completed`;
        const logContext = this.mergeContext(context);
        logContext.operation = operation;

        const entry: LogEntry = {
          timestamp: new Date(),
          level: LogLevel.INFO,
          message: logMessage,
          correlationId: this.correlationId || correlationContext.getActiveContext()?.correlationId,
          context: logContext,
          performance,
          metadata: {}
        };

        // Apply filters and send to transports
        for (const filter of this.filters) {
          if (!filter.shouldLog(entry)) {
            return;
          }
        }

        for (const transport of this.transports) {
          try {
            const result = transport.log(entry);
            if (result instanceof Promise) {
              result.catch(err => {
                console.error('Transport error:', err);
              });
            }
          } catch (err) {
            console.error('Transport error:', err);
          }
        }
      },

      mark: (label: string) => {
        marks.set(label, process.hrtime.bigint());
      },

      measure: (measureName: string, startMark?: string, endMark?: string) => {
        const now = process.hrtime.bigint();
        const startTime = startMark ? marks.get(startMark) || now : now;
        const endTime = endMark ? marks.get(endMark) || now : now;
        
        const duration = Number(endTime - startTime) / 1000000;
        
        this.debug(`Performance measure '${measureName}': ${duration.toFixed(2)}ms`, {
          operation: `${operation}.${measureName}`,
          ...context
        });
      }
    };
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  getLevel(): LogLevel {
    return this.level;
  }

  addTransport(transport: ILogTransport): void {
    this.transports.push(transport);
  }

  removeTransport(transport: ILogTransport): void {
    const index = this.transports.indexOf(transport);
    if (index > -1) {
      this.transports.splice(index, 1);
    }
  }

  addFilter(filter: ILogFilter): void {
    this.filters.push(filter);
  }

  removeFilter(filter: ILogFilter): void {
    const index = this.filters.indexOf(filter);
    if (index > -1) {
      this.filters.splice(index, 1);
    }
  }

  getTransports(): ILogTransport[] {
    return [...this.transports];
  }

  getFilters(): ILogFilter[] {
    return [...this.filters];
  }

  getContext(): Partial<LogContext> {
    return { ...this.context };
  }

  private mergeContext(additionalContext?: Partial<LogContext>): LogContext {
    const merged: LogContext = {
      component: 'unknown',
      ...this.context,
      ...additionalContext
    };

    // Merge tags
    const baseTags = this.context.tags || [];
    const additionalTags = additionalContext?.tags || [];
    if (baseTags.length > 0 || additionalTags.length > 0) {
      merged.tags = [...new Set([...baseTags, ...additionalTags])];
    }

    return merged;
  }

  async flush(): Promise<void> {
    const flushPromises = this.transports
      .filter(transport => transport.flush)
      .map(transport => transport.flush!());
    
    await Promise.all(flushPromises);
  }

  async shutdown(): Promise<void> {
    await this.flush();
    
    const closePromises = this.transports
      .filter(transport => transport.close)
      .map(transport => transport.close!());
    
    await Promise.all(closePromises);
  }

  getStats() {
    return {
      level: LogLevel[this.level],
      transports: this.transports.map(t => ({
        name: t.name,
        level: LogLevel[t.level],
        enabled: t.enabled
      })),
      filters: this.filters.length,
      context: this.context,
      correlationId: this.correlationId
    };
  }
}