/**
 * Console transport for logging to stdout/stderr
 */

import { ILogTransport, LogEntry, LogLevel, ILogFormatter } from '../types';
import { ConsoleFormatter } from '../formatters/ConsoleFormatter';

export class ConsoleTransport implements ILogTransport {
  readonly name: string;
  level: LogLevel;
  enabled: boolean;
  private formatter: ILogFormatter;
  private useStderr: boolean;

  constructor(options: ConsoleTransportOptions = {}) {
    this.name = options.name || 'console';
    this.level = options.level ?? LogLevel.INFO;
    this.enabled = options.enabled ?? true;
    this.formatter = options.formatter || new ConsoleFormatter({
      colorize: options.colorize ?? true,
      includeTimestamp: options.includeTimestamp ?? true,
      includeContext: options.includeContext ?? true,
      includeSource: options.includeSource ?? false
    });
    this.useStderr = options.useStderr ?? false;
  }

  log(entry: LogEntry): void {
    if (!this.enabled || entry.level > this.level) {
      return;
    }

    const formatted = this.formatter.format(entry);
    
    if (this.useStderr || entry.level <= LogLevel.WARN) {
      console.error(formatted);
    } else {
      console.log(formatted);
    }
  }

  setFormatter(formatter: ILogFormatter): void {
    this.formatter = formatter;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}

export interface ConsoleTransportOptions {
  name?: string;
  level?: LogLevel;
  enabled?: boolean;
  formatter?: ILogFormatter;
  colorize?: boolean;
  includeTimestamp?: boolean;
  includeContext?: boolean;
  includeSource?: boolean;
  useStderr?: boolean;
}