/**
 * Simplified configuration schema for basic logging
 */

export interface LoggingConfig {
  enabled: boolean;
  level: 'error' | 'warn' | 'info' | 'debug';
  console: {
    enabled: boolean;
    colorize: boolean;
    includeTimestamp: boolean;
  };
  file: {
    enabled: boolean;
    path?: string;
    maxSize?: number;
    maxFiles?: number;
  };
}


export const DEFAULT_LOGGING_CONFIG: LoggingConfig = {
  enabled: true,
  level: 'info',
  console: {
    enabled: true,
    colorize: false,
    includeTimestamp: true
  },
  file: {
    enabled: false,
    path: './logs/fhirpath-lsp.log',
    maxSize: 10485760, // 10MB
    maxFiles: 5
  }
};