/**
 * Configuration schema for structured logging system
 */

export interface LoggingConfig {
  enabled: boolean;
  level: 'error' | 'warn' | 'info' | 'debug' | 'trace';
  transports: LogTransportConfig[];
  correlationId: {
    enabled: boolean;
    generator: 'uuid' | 'short' | 'custom';
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
    thresholds: {
      [operation: string]: {
        warn: number;
        error: number;
      };
    };
  };
  filters: LogFilterConfig[];
}

export interface LogTransportConfig {
  type: 'console' | 'file' | 'remote';
  name: string;
  level: 'error' | 'warn' | 'info' | 'debug' | 'trace';
  enabled: boolean;
  options: Record<string, any>;
}

export interface LogFilterConfig {
  type: 'level' | 'component' | 'performance';
  name: string;
  enabled: boolean;
  options: Record<string, any>;
}

export const DEFAULT_LOGGING_CONFIG: LoggingConfig = {
  enabled: true,
  level: 'info',
  transports: [
    {
      type: 'console',
      name: 'default-console',
      level: 'info',
      enabled: true,
      options: {
        colorize: false,
        includeTimestamp: true,
        includeContext: true,
        includeSource: false
      }
    },
    {
      type: 'file',
      name: 'default-file',
      level: 'debug',
      enabled: true,
      options: {
        filePath: './logs/fhirpath-lsp.log',
        maxSize: 10485760, // 10MB
        maxFiles: 5
      }
    }
  ],
  correlationId: {
    enabled: true,
    generator: 'short'
  },
  context: {
    includeSource: false,
    includePerformance: true,
    defaultTags: ['fhirpath-lsp']
  },
  performance: {
    enableTimers: true,
    enableMemoryTracking: true,
    enableCpuTracking: false,
    thresholds: {
      completion: { warn: 100, error: 500 },
      diagnostic: { warn: 200, error: 1000 },
      hover: { warn: 50, error: 200 },
      semanticTokens: { warn: 300, error: 1000 },
      parse: { warn: 50, error: 200 },
      codeAction: { warn: 150, error: 500 },
      definition: { warn: 100, error: 300 },
      references: { warn: 200, error: 800 }
    }
  },
  filters: []
};