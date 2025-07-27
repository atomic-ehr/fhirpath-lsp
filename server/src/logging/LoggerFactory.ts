/**
 * Factory for creating and managing logger instances
 */

import { 
  LoggerFactory as ILoggerFactory, 
  ILogger, 
  LoggerConfiguration, 
  LogLevel, 
  LogContext 
} from './types';
import { Logger } from './Logger';
import { ConsoleTransport } from './transports/ConsoleTransport';
import { FileTransport } from './transports/FileTransport';
import { RemoteTransport } from './transports/RemoteTransport';
import { LevelFilter } from './filters/LevelFilter';
import { ComponentFilter } from './filters/ComponentFilter';
import { PerformanceFilter } from './filters/PerformanceFilter';
import { JSONFormatter } from './formatters/JSONFormatter';
import { ConsoleFormatter } from './formatters/ConsoleFormatter';
import { StructuredFormatter } from './formatters/StructuredFormatter';
import { correlationContext } from './context/CorrelationContext';

export class LoggerFactory implements ILoggerFactory {
  private static instance: LoggerFactory;
  private loggers = new Map<string, Logger>();
  private defaultConfiguration: LoggerConfiguration;

  constructor(defaultConfiguration?: Partial<LoggerConfiguration>) {
    this.defaultConfiguration = {
      level: LogLevel.INFO,
      transports: [
        {
          type: 'console',
          name: 'default-console',
          level: LogLevel.INFO,
          enabled: true,
          options: {
            colorize: true,
            includeTimestamp: true,
            includeContext: true
          }
        }
      ],
      formatters: [
        {
          type: 'console',
          name: 'default-console-formatter',
          options: {}
        }
      ],
      filters: [],
      correlationId: {
        enabled: true,
        generator: 'uuid'
      },
      context: {
        includeSource: false,
        includePerformance: true,
        defaultTags: []
      },
      performance: {
        enableTimers: true,
        enableMemoryTracking: true,
        enableCpuTracking: true
      },
      ...defaultConfiguration
    };

    // Configure correlation ID generator
    if (this.defaultConfiguration.correlationId.enabled) {
      if (this.defaultConfiguration.correlationId.generator === 'short') {
        correlationContext.setIdGenerator('short');
      } else if (this.defaultConfiguration.correlationId.customGenerator) {
        correlationContext.setIdGenerator(this.defaultConfiguration.correlationId.customGenerator);
      } else {
        correlationContext.setIdGenerator('uuid');
      }
    }
  }

  static getInstance(defaultConfiguration?: Partial<LoggerConfiguration>): LoggerFactory {
    if (!LoggerFactory.instance) {
      LoggerFactory.instance = new LoggerFactory(defaultConfiguration);
    }
    return LoggerFactory.instance;
  }

  createLogger(name: string, context?: Partial<LogContext>): ILogger {
    const loggerContext: Partial<LogContext> = {
      component: name,
      tags: [...this.defaultConfiguration.context.defaultTags],
      ...context
    };

    const logger = new Logger(loggerContext);
    logger.setLevel(this.defaultConfiguration.level);

    // Configure transports
    for (const transportConfig of this.defaultConfiguration.transports) {
      if (!transportConfig.enabled) continue;

      const transport = this.createTransport(transportConfig);
      if (transport) {
        logger.addTransport(transport);
      }
    }

    // Configure filters
    for (const filterConfig of this.defaultConfiguration.filters) {
      if (!filterConfig.enabled) continue;

      const filter = this.createFilter(filterConfig);
      if (filter) {
        logger.addFilter(filter);
      }
    }

    this.loggers.set(name, logger as Logger);
    return logger;
  }

  getLogger(name: string): ILogger | undefined {
    return this.loggers.get(name);
  }

  configureLogger(name: string, config: Partial<LoggerConfiguration>): void {
    const logger = this.loggers.get(name);
    if (!logger) return;

    if (config.level !== undefined) {
      logger.setLevel(config.level);
    }

    // Note: For full transport/filter reconfiguration, we'd need to
    // clear existing ones and recreate them, which is more complex
    // For now, this handles basic level changes
  }

  setGlobalLevel(level: LogLevel): void {
    this.defaultConfiguration.level = level;
    for (const logger of this.loggers.values()) {
      logger.setLevel(level);
    }
  }

  async shutdown(): Promise<void> {
    const shutdownPromises = Array.from(this.loggers.values()).map(logger => 
      logger.shutdown()
    );
    await Promise.all(shutdownPromises);
    this.loggers.clear();
  }

  private createTransport(config: any) {
    try {
      switch (config.type) {
        case 'console':
          return new ConsoleTransport({
            name: config.name,
            level: config.level,
            enabled: config.enabled,
            ...config.options
          });

        case 'file':
          if (!config.options.filePath) {
            console.error('FileTransport requires filePath option');
            return null;
          }
          return new FileTransport({
            name: config.name,
            level: config.level,
            enabled: config.enabled,
            filePath: config.options.filePath,
            ...config.options
          });

        case 'remote':
          if (!config.options.endpoint) {
            console.error('RemoteTransport requires endpoint option');
            return null;
          }
          return new RemoteTransport({
            name: config.name,
            level: config.level,
            enabled: config.enabled,
            endpoint: config.options.endpoint,
            ...config.options
          });

        default:
          console.error(`Unknown transport type: ${config.type}`);
          return null;
      }
    } catch (error) {
      console.error(`Error creating transport ${config.name}:`, error);
      return null;
    }
  }

  private createFilter(config: any) {
    try {
      switch (config.type) {
        case 'level':
          return new LevelFilter({
            minLevel: config.options.minLevel,
            maxLevel: config.options.maxLevel,
            allowedLevels: config.options.allowedLevels
          });

        case 'component':
          return new ComponentFilter({
            allowedComponents: config.options.allowedComponents,
            blockedComponents: config.options.blockedComponents,
            allowedOperations: config.options.allowedOperations,
            blockedOperations: config.options.blockedOperations,
            componentPatterns: config.options.componentPatterns,
            operationPatterns: config.options.operationPatterns
          });

        case 'performance':
          return new PerformanceFilter({
            minDuration: config.options.minDuration,
            maxDuration: config.options.maxDuration,
            minMemoryUsage: config.options.minMemoryUsage,
            maxMemoryUsage: config.options.maxMemoryUsage,
            onlyWithPerformanceData: config.options.onlyWithPerformanceData,
            slowOperationThreshold: config.options.slowOperationThreshold
          });

        default:
          console.error(`Unknown filter type: ${config.type}`);
          return null;
      }
    } catch (error) {
      console.error(`Error creating filter ${config.name}:`, error);
      return null;
    }
  }

  getConfiguration(): LoggerConfiguration {
    return { ...this.defaultConfiguration };
  }

  updateConfiguration(config: Partial<LoggerConfiguration>): void {
    this.defaultConfiguration = {
      ...this.defaultConfiguration,
      ...config
    };

    // Update correlation ID generator if changed
    if (config.correlationId) {
      if (config.correlationId.enabled) {
        if (config.correlationId.generator === 'short') {
          correlationContext.setIdGenerator('short');
        } else if (config.correlationId.customGenerator) {
          correlationContext.setIdGenerator(config.correlationId.customGenerator);
        } else {
          correlationContext.setIdGenerator('uuid');
        }
      }
    }
  }

  getStats() {
    return {
      loggerCount: this.loggers.size,
      loggers: Array.from(this.loggers.keys()),
      configuration: this.defaultConfiguration,
      correlationStats: correlationContext.getStats()
    };
  }
}

// Default singleton instance
export const loggerFactory = LoggerFactory.getInstance();