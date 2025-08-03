/**
 * Adapter for logging configuration management
 */

import { LoggingConfig, DEFAULT_LOGGING_CONFIG } from '../schemas/LoggingConfig';

export class LoggingConfigAdapter {
  private config: LoggingConfig = DEFAULT_LOGGING_CONFIG;

  updateConfig(newConfig: Partial<LoggingConfig>): void {
    this.config = {
      ...this.config,
      ...newConfig
    };
  }

  getLoggingConfig(): LoggingConfig {
    return { ...this.config };
  }


  isEnabled(): boolean {
    return this.config.enabled;
  }

  getLevel(): string {
    return this.config.level;
  }

  getConsoleConfig() {
    return this.config.console;
  }

  getFileConfig() {
    return this.config.file;
  }

  setLogLevel(level: 'error' | 'warn' | 'info' | 'debug'): void {
    this.config.level = level;
  }

  enableConsole(enabled: boolean): void {
    this.config.console.enabled = enabled;
  }

  enableFile(enabled: boolean): void {
    this.config.file.enabled = enabled;
  }

  getStats() {
    return {
      enabled: this.config.enabled,
      level: this.config.level,
      console: {
        enabled: this.config.console.enabled
      },
      file: {
        enabled: this.config.file.enabled
      }
    };
  }
}