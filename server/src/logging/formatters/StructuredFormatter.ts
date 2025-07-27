/**
 * Structured formatter for machine-readable logging with flexible output
 */

import { ILogFormatter, LogEntry, LogLevel } from '../types';

export class StructuredFormatter implements ILogFormatter {
  private outputFormat: 'logfmt' | 'csv' | 'tsv' | 'custom';
  private customTemplate?: string;
  private delimiter: string;

  constructor(options: StructuredFormatterOptions = {}) {
    this.outputFormat = options.format || 'logfmt';
    this.customTemplate = options.customTemplate;
    this.delimiter = options.delimiter || '\t';
  }

  format(entry: LogEntry): string {
    switch (this.outputFormat) {
      case 'logfmt':
        return this.formatLogfmt(entry);
      case 'csv':
        return this.formatCSV(entry);
      case 'tsv':
        return this.formatTSV(entry);
      case 'custom':
        return this.formatCustom(entry);
      default:
        return this.formatLogfmt(entry);
    }
  }

  private formatLogfmt(entry: LogEntry): string {
    const pairs: string[] = [];

    pairs.push(`timestamp="${entry.timestamp.toISOString()}"`);
    pairs.push(`level=${LogLevel[entry.level]}`);
    pairs.push(`message="${this.escapeLogfmt(entry.message)}"`);

    if (entry.correlationId) {
      pairs.push(`correlation_id="${entry.correlationId}"`);
    }

    if (entry.context) {
      pairs.push(`component="${entry.context.component}"`);
      
      if (entry.context.operation) {
        pairs.push(`operation="${entry.context.operation}"`);
      }
      
      if (entry.context.documentUri) {
        pairs.push(`document_uri="${this.escapeLogfmt(entry.context.documentUri)}"`);
      }
      
      if (entry.context.requestId) {
        pairs.push(`request_id="${entry.context.requestId}"`);
      }
      
      if (entry.context.sessionId) {
        pairs.push(`session_id="${entry.context.sessionId}"`);
      }

      if (entry.context.source) {
        if (entry.context.source.file) {
          pairs.push(`source_file="${entry.context.source.file}"`);
        }
        if (entry.context.source.function) {
          pairs.push(`source_function="${entry.context.source.function}"`);
        }
        if (entry.context.source.line) {
          pairs.push(`source_line=${entry.context.source.line}`);
        }
      }
    }

    if (entry.performance?.duration) {
      pairs.push(`duration_ms=${entry.performance.duration}`);
    }

    if (entry.performance?.memoryUsage) {
      pairs.push(`memory_heap_used=${entry.performance.memoryUsage.heapUsed}`);
      pairs.push(`memory_heap_total=${entry.performance.memoryUsage.heapTotal}`);
    }

    if (entry.error) {
      pairs.push(`error_name="${this.escapeLogfmt(entry.error.name)}"`);
      pairs.push(`error_message="${this.escapeLogfmt(entry.error.message)}"`);
    }

    if (entry.metadata) {
      for (const [key, value] of Object.entries(entry.metadata)) {
        if (typeof value === 'string') {
          pairs.push(`meta_${key}="${this.escapeLogfmt(value)}"`);
        } else if (typeof value === 'number' || typeof value === 'boolean') {
          pairs.push(`meta_${key}=${value}`);
        }
      }
    }

    return pairs.join(' ');
  }

  private formatCSV(entry: LogEntry): string {
    const values: string[] = [
      this.escapeCSV(entry.timestamp.toISOString()),
      this.escapeCSV(LogLevel[entry.level]),
      this.escapeCSV(entry.message),
      this.escapeCSV(entry.correlationId || ''),
      this.escapeCSV(entry.context?.component || ''),
      this.escapeCSV(entry.context?.operation || ''),
      this.escapeCSV(entry.context?.documentUri || ''),
      entry.performance?.duration?.toString() || '',
      entry.error ? this.escapeCSV(entry.error.message) : ''
    ];

    return values.join(',');
  }

  private formatTSV(entry: LogEntry): string {
    const values: string[] = [
      entry.timestamp.toISOString(),
      LogLevel[entry.level],
      this.escapeTSV(entry.message),
      entry.correlationId || '',
      entry.context?.component || '',
      entry.context?.operation || '',
      entry.context?.documentUri || '',
      entry.performance?.duration?.toString() || '',
      entry.error ? this.escapeTSV(entry.error.message) : ''
    ];

    return values.join(this.delimiter);
  }

  private formatCustom(entry: LogEntry): string {
    if (!this.customTemplate) {
      return this.formatLogfmt(entry);
    }

    let output = this.customTemplate;

    // Replace template variables
    output = output.replace(/\${timestamp}/g, entry.timestamp.toISOString());
    output = output.replace(/\${level}/g, LogLevel[entry.level]);
    output = output.replace(/\${message}/g, entry.message);
    output = output.replace(/\${correlationId}/g, entry.correlationId || '');
    output = output.replace(/\${component}/g, entry.context?.component || '');
    output = output.replace(/\${operation}/g, entry.context?.operation || '');
    output = output.replace(/\${documentUri}/g, entry.context?.documentUri || '');
    output = output.replace(/\${duration}/g, entry.performance?.duration?.toString() || '');
    output = output.replace(/\${error}/g, entry.error?.message || '');

    // Replace metadata variables
    if (entry.metadata) {
      for (const [key, value] of Object.entries(entry.metadata)) {
        const pattern = new RegExp(`\\$\\{meta\\.${key}\\}`, 'g');
        output = output.replace(pattern, String(value));
      }
    }

    return output;
  }

  private escapeLogfmt(value: string): string {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\t/g, '\\t');
  }

  private escapeCSV(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  private escapeTSV(value: string): string {
    return value
      .replace(/\t/g, '\\t')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r');
  }

  getCSVHeader(): string {
    return 'timestamp,level,message,correlationId,component,operation,documentUri,duration,error';
  }

  getTSVHeader(): string {
    return ['timestamp', 'level', 'message', 'correlationId', 'component', 'operation', 'documentUri', 'duration', 'error']
      .join(this.delimiter);
  }

  setFormat(format: 'logfmt' | 'csv' | 'tsv' | 'custom'): void {
    this.outputFormat = format;
  }

  setCustomTemplate(template: string): void {
    this.customTemplate = template;
    this.outputFormat = 'custom';
  }

  setDelimiter(delimiter: string): void {
    this.delimiter = delimiter;
  }
}

export interface StructuredFormatterOptions {
  format?: 'logfmt' | 'csv' | 'tsv' | 'custom';
  customTemplate?: string;
  delimiter?: string;
}