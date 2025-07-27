import { Connection } from 'vscode-languageserver';

/**
 * Plugin capability types that a plugin can provide
 */
export enum PluginCapabilityType {
  CodeAction = 'codeAction',
  Completion = 'completion',
  Diagnostic = 'diagnostic',
  Hover = 'hover',
  Definition = 'definition',
  References = 'references',
  DocumentSymbol = 'documentSymbol',
  WorkspaceSymbol = 'workspaceSymbol',
  SemanticTokens = 'semanticTokens',
  InlayHint = 'inlayHint',
  Analyzer = 'analyzer',
  Validator = 'validator',
  Formatter = 'formatter',
  Refactoring = 'refactoring'
}

/**
 * Plugin capability declaration
 */
export interface PluginCapability {
  type: PluginCapabilityType;
  version: string;
  priority?: number;
}

/**
 * Plugin dependency specification
 */
export interface PluginDependency {
  id: string;
  version: string;
  optional?: boolean;
}

/**
 * Plugin metadata
 */
export interface PluginMetadata {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string | { name: string; email?: string };
  homepage?: string;
  repository?: string;
  license?: string;
  keywords?: string[];
  engines?: {
    'fhirpath-lsp'?: string;
    node?: string;
  };
}

/**
 * Plugin configuration schema
 */
export interface PluginConfigurationSchema {
  type: 'object';
  properties: Record<string, any>;
  required?: string[];
  additionalProperties?: boolean;
}

/**
 * Plugin context provided to plugins during initialization
 */
export interface PluginContext {
  /**
   * Plugin's own metadata
   */
  metadata: PluginMetadata;

  /**
   * LSP connection (limited API)
   */
  connection: PluginConnection;

  /**
   * Plugin's isolated storage path
   */
  storagePath: string;

  /**
   * Plugin's configuration
   */
  configuration: any;

  /**
   * Logger for the plugin
   */
  logger: PluginLogger;

  /**
   * Extension context for accessing other plugins
   */
  extensionContext: PluginExtensionContext;
}

/**
 * Limited connection interface for plugins
 */
export interface PluginConnection {
  console: {
    log(message: string): void;
    error(message: string): void;
    warn(message: string): void;
    info(message: string): void;
  };
  window: {
    showErrorMessage(message: string): void;
    showWarningMessage(message: string): void;
    showInformationMessage(message: string): void;
  };
}

/**
 * Plugin logger interface
 */
export interface PluginLogger {
  log(level: 'error' | 'warn' | 'info' | 'debug', message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  debug(message: string, ...args: any[]): void;
}

/**
 * Extension context for inter-plugin communication
 */
export interface PluginExtensionContext {
  /**
   * Get a plugin by ID
   */
  getPlugin(id: string): IPlugin | undefined;

  /**
   * Subscribe to plugin lifecycle events
   */
  onPluginActivated(listener: (plugin: IPlugin) => void): Disposable;
  onPluginDeactivated(listener: (plugin: IPlugin) => void): Disposable;

  /**
   * Inter-plugin communication
   */
  sendMessage(targetPluginId: string, message: any): Promise<any>;
  onMessage(listener: (message: any, sender: string) => any): Disposable;
}

/**
 * Disposable interface for cleanup
 */
export interface Disposable {
  dispose(): void;
}

/**
 * Plugin lifecycle state
 */
export enum PluginState {
  Discovered = 'discovered',
  Validated = 'validated',
  Resolved = 'resolved',
  Loaded = 'loaded',
  Initialized = 'initialized',
  Activated = 'activated',
  Deactivated = 'deactivated',
  Failed = 'failed',
  Disposed = 'disposed'
}

/**
 * Base plugin interface
 */
export interface IPlugin {
  /**
   * Plugin metadata
   */
  readonly metadata: PluginMetadata;

  /**
   * Plugin dependencies
   */
  readonly dependencies?: PluginDependency[];

  /**
   * Plugin capabilities
   */
  readonly capabilities: PluginCapability[];

  /**
   * Configuration schema for the plugin
   */
  readonly configurationSchema?: PluginConfigurationSchema;

  /**
   * Current plugin state
   */
  readonly state: PluginState;

  /**
   * Initialize the plugin with context
   * Called once when plugin is loaded
   */
  initialize(context: PluginContext): Promise<void>;

  /**
   * Activate the plugin
   * Called when plugin should start providing functionality
   */
  activate(): Promise<void>;

  /**
   * Deactivate the plugin
   * Called when plugin should stop providing functionality
   */
  deactivate(): Promise<void>;

  /**
   * Dispose the plugin
   * Called when plugin is being unloaded
   */
  dispose(): void;

  /**
   * Handle configuration changes
   */
  onConfigurationChanged?(configuration: any): void;

  /**
   * Export API for other plugins
   */
  getAPI?(): any;
}

/**
 * Plugin activation event
 */
export interface PluginActivationEvent {
  type: 'onLanguage' | 'onCommand' | 'onStartup' | 'onFilePattern' | '*';
  value?: string | string[];
}

/**
 * Plugin manifest (package.json extension)
 */
export interface PluginManifest extends PluginMetadata {
  main: string;
  dependencies?: PluginDependency[];
  capabilities: PluginCapability[];
  activationEvents?: PluginActivationEvent[];
  configurationSchema?: PluginConfigurationSchema;
  contributes?: {
    commands?: Array<{
      command: string;
      title: string;
      category?: string;
    }>;
    configuration?: any;
    languages?: Array<{
      id: string;
      extensions?: string[];
      aliases?: string[];
    }>;
  };
}