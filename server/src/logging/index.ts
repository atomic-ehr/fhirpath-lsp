/**
 * Structured logging system for FHIRPath LSP
 */

// Core types and interfaces
export * from './types';

// Main logger implementation
export { Logger } from './Logger';
export { LoggerFactory, loggerFactory } from './LoggerFactory';

// Import for internal use in convenience functions
import { loggerFactory as internalLoggerFactory } from './LoggerFactory';

// Performance monitoring
export { PerformanceMonitor, getPerformanceMonitor, setPerformanceMonitor } from './PerformanceMonitor';
export type { PerformanceMonitorConfig, PerformanceThresholds } from './PerformanceMonitor';

// Context management
export * from './context';

// Formatters
export * from './formatters';

// Transports
export * from './transports';

// Filters
export * from './filters';

// Convenience function to get a logger
export function getLogger(name: string, context?: Partial<import('./types').LogContext>) {
  return internalLoggerFactory.createLogger(name, context);
}

// Convenience function to configure logging
export function configureLogging(config: Partial<import('./types').LoggerConfiguration>) {
  internalLoggerFactory.updateConfiguration(config);
}

// Convenience function to create a child logger with correlation ID
export function withCorrelationId(correlationId: string, baseLogger?: import('./types').ILogger) {
  const logger = baseLogger || getLogger('default');
  return logger.withCorrelationId(correlationId);
}