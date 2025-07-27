/**
 * JSON formatter for structured logging
 */

import { ILogFormatter, LogEntry, LogLevel } from '../types';

export class JSONFormatter implements ILogFormatter {
  private includeSource: boolean;
  private includePerformance: boolean;
  private prettyPrint: boolean;

  constructor(options: JSONFormatterOptions = {}) {
    this.includeSource = options.includeSource ?? true;
    this.includePerformance = options.includePerformance ?? true;
    this.prettyPrint = options.prettyPrint ?? false;
  }

  format(entry: LogEntry): string {
    const formatted: any = {
      timestamp: entry.timestamp.toISOString(),
      level: LogLevel[entry.level],
      message: entry.message
    };

    if (entry.correlationId) {
      formatted.correlationId = entry.correlationId;
    }

    if (entry.context) {
      formatted.context = {
        component: entry.context.component,
        operation: entry.context.operation
      };

      if (entry.context.documentUri) {
        formatted.context.documentUri = entry.context.documentUri;
      }

      if (entry.context.userId) {
        formatted.context.userId = entry.context.userId;
      }

      if (entry.context.sessionId) {
        formatted.context.sessionId = entry.context.sessionId;
      }

      if (entry.context.requestId) {
        formatted.context.requestId = entry.context.requestId;
      }

      if (entry.context.tags && entry.context.tags.length > 0) {
        formatted.context.tags = entry.context.tags;
      }

      if (this.includeSource && entry.context.source) {
        formatted.context.source = entry.context.source;
      }
    }

    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      formatted.metadata = entry.metadata;
    }

    if (entry.error) {
      formatted.error = {
        name: entry.error.name,
        message: entry.error.message,
        stack: entry.error.stack
      };
    }

    if (this.includePerformance && entry.performance) {
      formatted.performance = entry.performance;
    }

    return this.prettyPrint 
      ? JSON.stringify(formatted, null, 2)
      : JSON.stringify(formatted);
  }

  setIncludeSource(include: boolean): void {
    this.includeSource = include;
  }

  setIncludePerformance(include: boolean): void {
    this.includePerformance = include;
  }

  setPrettyPrint(pretty: boolean): void {
    this.prettyPrint = pretty;
  }
}

export interface JSONFormatterOptions {
  includeSource?: boolean;
  includePerformance?: boolean;
  prettyPrint?: boolean;
}