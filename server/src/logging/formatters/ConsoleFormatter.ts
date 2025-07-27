/**
 * Console formatter for human-readable logging
 */

import { ILogFormatter, LogEntry, LogLevel } from '../types';

export class ConsoleFormatter implements ILogFormatter {
  private colorize: boolean;
  private includeTimestamp: boolean;
  private includeContext: boolean;
  private includeSource: boolean;

  constructor(options: ConsoleFormatterOptions = {}) {
    this.colorize = options.colorize ?? true;
    this.includeTimestamp = options.includeTimestamp ?? true;
    this.includeContext = options.includeContext ?? true;
    this.includeSource = options.includeSource ?? false;
  }

  format(entry: LogEntry): string {
    const parts: string[] = [];

    // Timestamp
    if (this.includeTimestamp) {
      const timestamp = entry.timestamp.toISOString().replace('T', ' ').slice(0, -5);
      parts.push(this.colorize ? this.colorText(timestamp, 'gray') : timestamp);
    }

    // Level
    const levelText = LogLevel[entry.level].padEnd(5);
    parts.push(this.colorize ? this.colorizeLevel(levelText, entry.level) : levelText);

    // Correlation ID (shortened)
    if (entry.correlationId) {
      const shortId = entry.correlationId.slice(-8);
      parts.push(this.colorize ? this.colorText(`[${shortId}]`, 'cyan') : `[${shortId}]`);
    }

    // Context
    if (this.includeContext && entry.context) {
      const contextParts: string[] = [];
      
      if (entry.context.component) {
        contextParts.push(entry.context.component);
      }
      
      if (entry.context.operation) {
        contextParts.push(entry.context.operation);
      }

      if (contextParts.length > 0) {
        const contextText = `{${contextParts.join('.')}}`;
        parts.push(this.colorize ? this.colorText(contextText, 'blue') : contextText);
      }
    }

    // Source information
    if (this.includeSource && entry.context?.source) {
      const source = entry.context.source;
      let sourceText = '';
      
      if (source.file) {
        sourceText += source.file;
      }
      
      if (source.function) {
        sourceText += `:${source.function}`;
      }
      
      if (source.line) {
        sourceText += `:${source.line}`;
      }
      
      if (sourceText) {
        parts.push(this.colorize ? this.colorText(`(${sourceText})`, 'magenta') : `(${sourceText})`);
      }
    }

    // Message
    parts.push(entry.message);

    // Error details
    if (entry.error) {
      parts.push('\n  Error:', entry.error.message);
      if (entry.error.stack) {
        parts.push('\n  Stack:', entry.error.stack.split('\n').slice(1, 4).join('\n    '));
      }
    }

    // Performance metrics
    if (entry.performance?.duration) {
      const duration = `${entry.performance.duration}ms`;
      parts.push(this.colorize ? this.colorText(`(${duration})`, 'yellow') : `(${duration})`);
    }

    // Metadata (selective display)
    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      const relevantMetadata = this.filterRelevantMetadata(entry.metadata);
      if (Object.keys(relevantMetadata).length > 0) {
        const metadataText = Object.entries(relevantMetadata)
          .map(([key, value]) => `${key}=${value}`)
          .join(' ');
        parts.push(this.colorize ? this.colorText(`{${metadataText}}`, 'gray') : `{${metadataText}}`);
      }
    }

    return parts.join(' ');
  }

  private colorizeLevel(text: string, level: LogLevel): string {
    if (!this.colorize) return text;

    switch (level) {
      case LogLevel.ERROR:
        return this.colorText(text, 'red');
      case LogLevel.WARN:
        return this.colorText(text, 'yellow');
      case LogLevel.INFO:
        return this.colorText(text, 'green');
      case LogLevel.DEBUG:
        return this.colorText(text, 'blue');
      case LogLevel.TRACE:
        return this.colorText(text, 'gray');
      default:
        return text;
    }
  }

  private colorText(text: string, color: string): string {
    const colors: Record<string, string> = {
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      magenta: '\x1b[35m',
      cyan: '\x1b[36m',
      gray: '\x1b[90m',
      reset: '\x1b[0m'
    };

    return `${colors[color] || ''}${text}${colors.reset}`;
  }

  private filterRelevantMetadata(metadata: Record<string, any>): Record<string, any> {
    const relevant: Record<string, any> = {};
    const maxItems = 3;
    let count = 0;

    // Prioritize certain keys
    const priorityKeys = ['duration', 'count', 'size', 'cached', 'retries'];
    
    for (const key of priorityKeys) {
      if (key in metadata && count < maxItems) {
        relevant[key] = metadata[key];
        count++;
      }
    }

    // Add other simple values
    for (const [key, value] of Object.entries(metadata)) {
      if (count >= maxItems) break;
      if (!(key in relevant) && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')) {
        relevant[key] = value;
        count++;
      }
    }

    return relevant;
  }

  setColorize(colorize: boolean): void {
    this.colorize = colorize;
  }

  setIncludeTimestamp(include: boolean): void {
    this.includeTimestamp = include;
  }

  setIncludeContext(include: boolean): void {
    this.includeContext = include;
  }

  setIncludeSource(include: boolean): void {
    this.includeSource = include;
  }
}

export interface ConsoleFormatterOptions {
  colorize?: boolean;
  includeTimestamp?: boolean;
  includeContext?: boolean;
  includeSource?: boolean;
}