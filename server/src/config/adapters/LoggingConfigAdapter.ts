/**
 * Adapter for logging configuration management
 */

import { LoggingConfig, DEFAULT_LOGGING_CONFIG, LogFilterConfig } from '../schemas/LoggingConfig';
import { LogLevel, LoggerConfiguration } from '../../logging/types';
import { getLogger } from '../../logging';

export class LoggingConfigAdapter {
  private config: LoggingConfig = DEFAULT_LOGGING_CONFIG;
  private logger = getLogger('logging-config-adapter');

  updateConfig(newConfig: Partial<LoggingConfig>): void {
    this.logger.debug('Updating logging configuration', { 
      operation: 'updateConfig'
    }, {
      hasChanges: Object.keys(newConfig).length > 0
    });

    this.config = {
      ...this.config,
      ...newConfig
    };

    this.logger.info('Logging configuration updated', {
      operation: 'updateConfig',
      enabled: this.config.enabled,
      level: this.config.level,
      transportCount: this.config.transports.length,
      filterCount: this.config.filters.length
    });
  }

  getLoggingConfig(): LoggingConfig {
    return { ...this.config };
  }

  /**
   * Convert to internal LoggerConfiguration format
   */
  toLoggerConfiguration(): LoggerConfiguration {
    const levelMap: Record<string, LogLevel> = {
      'error': LogLevel.ERROR,
      'warn': LogLevel.WARN,
      'info': LogLevel.INFO,
      'debug': LogLevel.DEBUG,
      'trace': LogLevel.TRACE
    };

    return {
      level: levelMap[this.config.level] || LogLevel.INFO,
      transports: this.config.transports.map(transport => ({
        type: transport.type,
        name: transport.name,
        level: levelMap[transport.level] || LogLevel.INFO,
        enabled: transport.enabled,
        options: transport.options
      })),
      formatters: [
        {
          type: 'console',
          name: 'console-formatter',
          options: {}
        },
        {
          type: 'json',
          name: 'json-formatter',
          options: {}
        }
      ],
      filters: this.config.filters,
      correlationId: {
        enabled: this.config.correlationId.enabled,
        generator: this.config.correlationId.generator === 'custom' ? 'uuid' : this.config.correlationId.generator,
        customGenerator: undefined
      },
      context: {
        includeSource: this.config.context.includeSource,
        includePerformance: this.config.context.includePerformance,
        defaultTags: this.config.context.defaultTags
      },
      performance: {
        enableTimers: this.config.performance.enableTimers,
        enableMemoryTracking: this.config.performance.enableMemoryTracking,
        enableCpuTracking: this.config.performance.enableCpuTracking
      }
    };
  }

  /**
   * Get performance thresholds for the PerformanceMonitor
   */
  getPerformanceThresholds() {
    return this.config.performance.thresholds;
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  getLevel(): LogLevel {
    const levelMap: Record<string, LogLevel> = {
      'error': LogLevel.ERROR,
      'warn': LogLevel.WARN,
      'info': LogLevel.INFO,
      'debug': LogLevel.DEBUG,
      'trace': LogLevel.TRACE
    };

    return levelMap[this.config.level] || LogLevel.INFO;
  }

  getTransportConfigs() {
    return this.config.transports.filter(t => t.enabled);
  }

  getFilterConfigs() {
    return this.config.filters.filter(f => f.enabled);
  }

  enableTransport(name: string): void {
    const transport = this.config.transports.find(t => t.name === name);
    if (transport) {
      transport.enabled = true;
      this.logger.debug('Transport enabled', { 
        operation: 'enableTransport',
        transportName: name 
      });
    }
  }

  disableTransport(name: string): void {
    const transport = this.config.transports.find(t => t.name === name);
    if (transport) {
      transport.enabled = false;
      this.logger.debug('Transport disabled', { 
        operation: 'disableTransport',
        transportName: name 
      });
    }
  }

  updateTransportOptions(name: string, options: Record<string, any>): void {
    const transport = this.config.transports.find(t => t.name === name);
    if (transport) {
      transport.options = { ...transport.options, ...options };
      this.logger.debug('Transport options updated', { 
        operation: 'updateTransportOptions',
        transportName: name,
        optionKeys: Object.keys(options)
      });
    }
  }

  setLogLevel(level: 'error' | 'warn' | 'info' | 'debug' | 'trace'): void {
    this.config.level = level;
    this.logger.info('Log level changed', { 
      operation: 'setLogLevel',
      newLevel: level 
    });
  }

  addFilter(filter: LogFilterConfig): void {
    this.config.filters.push(filter);
    this.logger.debug('Filter added', { 
      operation: 'addFilter',
      filterType: filter.type,
      filterName: filter.name
    });
  }

  removeFilter(name: string): void {
    const index = this.config.filters.findIndex(f => f.name === name);
    if (index > -1) {
      this.config.filters.splice(index, 1);
      this.logger.debug('Filter removed', { 
        operation: 'removeFilter',
        filterName: name
      });
    }
  }

  getStats() {
    return {
      enabled: this.config.enabled,
      level: this.config.level,
      transports: {
        total: this.config.transports.length,
        enabled: this.config.transports.filter(t => t.enabled).length
      },
      filters: {
        total: this.config.filters.length,
        enabled: this.config.filters.filter(f => f.enabled).length
      },
      correlationIdEnabled: this.config.correlationId.enabled,
      performanceTracking: {
        timers: this.config.performance.enableTimers,
        memory: this.config.performance.enableMemoryTracking,
        cpu: this.config.performance.enableCpuTracking
      }
    };
  }
}