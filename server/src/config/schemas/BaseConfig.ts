import { DiagnosticSeverity } from 'vscode-languageserver';

/**
 * Base configuration interface that all configurations extend
 */
export interface BaseConfig {
  enabled: boolean;
  version?: string;
  lastModified?: Date;
}

/**
 * Configuration change event
 */
export interface ConfigChangeEvent<T = any> {
  path: string;
  oldValue: T;
  newValue: T;
  timestamp: Date;
}

/**
 * Configuration validation result
 */
export interface ConfigValidationResult {
  isValid: boolean;
  errors: ConfigValidationError[];
  warnings: ConfigValidationWarning[];
}

export interface ConfigValidationError {
  path: string;
  message: string;
  value?: any;
}

export interface ConfigValidationWarning {
  path: string;
  message: string;
  value?: any;
}

/**
 * Configuration source information
 */
export interface ConfigSource {
  type: 'file' | 'environment' | 'runtime' | 'default';
  location?: string;
  priority: number;
}

/**
 * Configuration metadata
 */
export interface ConfigMetadata {
  source: ConfigSource;
  schema: string;
  description?: string;
  tags?: string[];
}

/**
 * Generic configuration entry with metadata
 */
export interface ConfigEntry<T = any> {
  value: T;
  metadata: ConfigMetadata;
  validation?: ConfigValidationResult;
}

/**
 * Configuration change listener
 */
export type ConfigChangeListener<T = any> = (event: ConfigChangeEvent<T>) => void;

/**
 * Configuration provider interface
 */
export interface ConfigProvider<T = any> {
  get(path: string): T | undefined;
  set(path: string, value: T): void;
  has(path: string): boolean;
  delete(path: string): boolean;
  validate(config: Partial<T>): ConfigValidationResult;
  onChange(listener: ConfigChangeListener<T>): () => void;
}
