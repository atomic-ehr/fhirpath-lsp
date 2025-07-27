/**
 * Core types and interfaces for the structured logging system
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4
}

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  correlationId?: string;
  context?: LogContext;
  metadata?: Record<string, any>;
  error?: Error;
  performance?: PerformanceMetrics;
}

export interface LogContext {
  component: string;
  operation?: string;
  documentUri?: string;
  userId?: string;
  sessionId?: string;
  requestId?: string;
  source?: LogSource;
  tags?: string[];
}

export interface LogSource {
  file?: string;
  function?: string;
  line?: number;
  class?: string;
}

export interface PerformanceMetrics {
  duration?: number;
  memoryUsage?: {
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
  cpuUsage?: {
    user: number;
    system: number;
  };
}

export interface ILogger {
  error(message: string, error?: Error, context?: Partial<LogContext>, metadata?: Record<string, any>): void;
  warn(message: string, context?: Partial<LogContext>, metadata?: Record<string, any>): void;
  info(message: string, context?: Partial<LogContext>, metadata?: Record<string, any>): void;
  debug(message: string, context?: Partial<LogContext>, metadata?: Record<string, any>): void;
  trace(message: string, context?: Partial<LogContext>, metadata?: Record<string, any>): void;
  
  log(level: LogLevel, message: string, context?: Partial<LogContext>, error?: Error, metadata?: Record<string, any>): void;
  
  createChild(context: Partial<LogContext>): ILogger;
  withCorrelationId(correlationId: string): ILogger;
  withContext(context: Partial<LogContext>): ILogger;
  
  startPerformanceTimer(operation: string): PerformanceTimer;
  
  setLevel(level: LogLevel): void;
  getLevel(): LogLevel;
  
  addTransport(transport: ILogTransport): void;
  removeTransport(transport: ILogTransport): void;
}

export interface PerformanceTimer {
  end(message?: string, context?: Partial<LogContext>): void;
  mark(label: string): void;
  measure(measureName: string, startMark?: string, endMark?: string): void;
}

export interface ILogTransport {
  name: string;
  level: LogLevel;
  enabled: boolean;
  
  log(entry: LogEntry): Promise<void> | void;
  flush?(): Promise<void> | void;
  close?(): Promise<void> | void;
}

export interface ILogFormatter {
  format(entry: LogEntry): string;
}

export interface ILogFilter {
  shouldLog(entry: LogEntry): boolean;
}

export interface LoggerConfiguration {
  level: LogLevel;
  transports: LogTransportConfiguration[];
  formatters: LogFormatterConfiguration[];
  filters: LogFilterConfiguration[];
  correlationId: {
    enabled: boolean;
    generator?: 'uuid' | 'short' | 'custom';
    customGenerator?: () => string;
  };
  context: {
    includeSource: boolean;
    includePerformance: boolean;
    defaultTags: string[];
  };
  performance: {
    enableTimers: boolean;
    enableMemoryTracking: boolean;
    enableCpuTracking: boolean;
  };
}

export interface LogTransportConfiguration {
  type: 'console' | 'file' | 'remote' | string;
  name: string;
  level: LogLevel;
  enabled: boolean;
  options: Record<string, any>;
}

export interface LogFormatterConfiguration {
  type: 'json' | 'console' | 'structured' | string;
  name: string;
  options: Record<string, any>;
}

export interface LogFilterConfiguration {
  type: 'level' | 'component' | 'performance' | string;
  name: string;
  enabled: boolean;
  options: Record<string, any>;
}

export interface LoggerFactory {
  createLogger(name: string, context?: Partial<LogContext>): ILogger;
  getLogger(name: string): ILogger | undefined;
  configureLogger(name: string, config: Partial<LoggerConfiguration>): void;
  setGlobalLevel(level: LogLevel): void;
  shutdown(): Promise<void>;
}

export interface CorrelationContext {
  correlationId: string;
  parentId?: string;
  startTime: Date;
  metadata: Record<string, any>;
}

export interface DiagnosticLogContext extends LogContext {
  expression?: string;
  parsePhase?: 'lexing' | 'parsing' | 'validation' | 'analysis';
  diagnosticType?: 'syntax' | 'semantic' | 'performance' | 'best-practices';
  resourceType?: string;
  lineNumber?: number;
  columnNumber?: number;
}

export interface ProviderLogContext extends LogContext {
  provider: string;
  method: string;
  params?: Record<string, any>;
  resultCount?: number;
  cached?: boolean;
}

export interface ServiceLogContext extends LogContext {
  service: string;
  method: string;
  resourceId?: string;
  cacheHit?: boolean;
  backgroundTask?: boolean;
}

export interface PluginLogContext extends LogContext {
  pluginId: string;
  pluginVersion: string;
  lifecycle?: 'discovery' | 'validation' | 'loading' | 'initialization' | 'activation' | 'deactivation' | 'disposal';
  capability?: string;
}

// Type guards
export function isDiagnosticContext(context: LogContext): context is DiagnosticLogContext {
  return 'expression' in context || 'parsePhase' in context;
}

export function isProviderContext(context: LogContext): context is ProviderLogContext {
  return 'provider' in context && 'method' in context;
}

export function isServiceContext(context: LogContext): context is ServiceLogContext {
  return 'service' in context && 'method' in context;
}

export function isPluginContext(context: LogContext): context is PluginLogContext {
  return 'pluginId' in context;
}

// Utility types
export type LogLevelName = keyof typeof LogLevel;

export interface LogEntryWithId extends LogEntry {
  id: string;
}

export interface LogSearch {
  level?: LogLevel;
  component?: string;
  correlationId?: string;
  timeRange?: {
    start: Date;
    end: Date;
  };
  textSearch?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
}

export interface LogAnalytics {
  errorRate: number;
  averageResponseTime: number;
  totalRequests: number;
  topErrors: Array<{
    message: string;
    count: number;
    lastOccurrence: Date;
  }>;
  performanceMetrics: {
    p50: number;
    p95: number;
    p99: number;
  };
  componentStats: Array<{
    component: string;
    logCount: number;
    errorCount: number;
    avgDuration: number;
  }>;
}