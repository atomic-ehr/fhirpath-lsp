import { ConfigManager } from '../ConfigManager';
import { ConfigNotificationService } from '../ConfigNotificationService';
import { DiagnosticConfig } from '../schemas/DiagnosticConfig';
import {
  EnhancedDiagnosticConfig,
  DEFAULT_ENHANCED_DIAGNOSTIC_CONFIG,
  DiagnosticRuleConfig
} from '../../diagnostics/EnhancedDiagnosticTypes';

/**
 * Adapter to bridge between the new centralized configuration system
 * and the existing DiagnosticProvider configuration interface
 */
export class DiagnosticConfigAdapter {
  private configManager: ConfigManager;
  private notificationService: ConfigNotificationService;
  private subscriptionId?: string;
  private currentConfig: EnhancedDiagnosticConfig;

  constructor(
    configManager: ConfigManager,
    notificationService: ConfigNotificationService,
    initialConfig?: Partial<EnhancedDiagnosticConfig>
  ) {
    this.configManager = configManager;
    this.notificationService = notificationService;

    // Initialize with current configuration
    this.currentConfig = this.buildEnhancedConfig(initialConfig);

    // Subscribe to diagnostic configuration changes
    this.subscriptionId = this.notificationService.subscribeToDiagnostics(
      (event) => this.handleConfigChange(event),
      { debounceMs: 200 }
    );

    console.log('DiagnosticConfigAdapter initialized');
  }

  /**
   * Get the current enhanced diagnostic configuration
   */
  getEnhancedDiagnosticConfig(): EnhancedDiagnosticConfig {
    return { ...this.currentConfig };
  }

  /**
   * Update enhanced diagnostic configuration
   */
  updateEnhancedDiagnosticConfig(config: Partial<EnhancedDiagnosticConfig>): void {
    // Convert to new configuration format and update
    const diagnosticConfig = this.convertToNewFormat(config);

    // Update the centralized configuration
    for (const [path, value] of Object.entries(this.flattenConfig(diagnosticConfig, 'diagnostics'))) {
      this.configManager.set(path, value);
    }
  }

  /**
   * Configure a specific analyzer rule
   */
  configureAnalyzerRule(
    analyzer: 'performance' | 'codeQuality' | 'fhirBestPractices' | 'maintainability',
    ruleId: string,
    config: DiagnosticRuleConfig
  ): void {
    const path = `diagnostics.${analyzer}.rules.${ruleId}`;
    this.configManager.set(path, config);
  }

  /**
   * Get rule configuration for a specific analyzer
   */
  getRuleConfig(
    analyzer: 'performance' | 'codeQuality' | 'fhirBestPractices' | 'maintainability',
    ruleId: string
  ): DiagnosticRuleConfig | undefined {
    const path = `diagnostics.${analyzer}.rules.${ruleId}`;
    return this.configManager.get(path);
  }

  /**
   * Check if the adapter is enabled
   */
  isEnabled(): boolean {
    return this.configManager.get('diagnostics.enabled') ?? true;
  }

  /**
   * Enable or disable diagnostics
   */
  setEnabled(enabled: boolean): void {
    this.configManager.set('diagnostics.enabled', enabled);
  }

  /**
   * Get performance configuration
   */
  getPerformanceConfig() {
    return {
      enabled: this.configManager.get('diagnostics.performance.enabled') ?? true,
      maxComplexity: this.configManager.get('diagnostics.performance.maxComplexity') ?? 10,
      maxNestingDepth: this.configManager.get('diagnostics.performance.maxNestingDepth') ?? 5,
      flagRedundantOperations: this.configManager.get('diagnostics.performance.flagRedundantOperations') ?? true,
      flagExpensiveOperations: this.configManager.get('diagnostics.performance.flagExpensiveOperations') ?? true
    };
  }

  /**
   * Get code quality configuration
   */
  getCodeQualityConfig() {
    return {
      enabled: this.configManager.get('diagnostics.codeQuality.enabled') ?? true,
      maxLineLength: this.configManager.get('diagnostics.codeQuality.maxLineLength') ?? 100,
      enforceNamingConventions: this.configManager.get('diagnostics.codeQuality.enforceNamingConventions') ?? false,
      flagMagicValues: this.configManager.get('diagnostics.codeQuality.flagMagicValues') ?? true,
      requireDocumentation: this.configManager.get('diagnostics.codeQuality.requireDocumentation') ?? false
    };
  }

  /**
   * Get FHIR best practices configuration
   */
  getFHIRBestPracticesConfig() {
    return {
      enabled: this.configManager.get('diagnostics.fhirBestPractices.enabled') ?? true,
      enforceTypeSafety: this.configManager.get('diagnostics.fhirBestPractices.enforceTypeSafety') ?? true,
      flagDeprecatedElements: this.configManager.get('diagnostics.fhirBestPractices.flagDeprecatedElements') ?? true,
      suggestOptimizations: this.configManager.get('diagnostics.fhirBestPractices.suggestOptimizations') ?? true,
      checkCardinality: this.configManager.get('diagnostics.fhirBestPractices.checkCardinality') ?? false
    };
  }

  /**
   * Get maintainability configuration
   */
  getMaintainabilityConfig() {
    return {
      enabled: this.configManager.get('diagnostics.maintainability.enabled') ?? true,
      maxFunctionComplexity: this.configManager.get('diagnostics.maintainability.maxFunctionComplexity') ?? 8,
      flagDuplication: this.configManager.get('diagnostics.maintainability.flagDuplication') ?? true,
      enforceConsistency: this.configManager.get('diagnostics.maintainability.enforceConsistency') ?? true
    };
  }

  /**
   * Get severity configuration
   */
  getSeverityConfig() {
    return {
      performance: this.configManager.get('diagnostics.severity.performance') ?? 2,
      codeQuality: this.configManager.get('diagnostics.severity.codeQuality') ?? 3,
      fhirBestPractices: this.configManager.get('diagnostics.severity.fhirBestPractices') ?? 2,
      maintainability: this.configManager.get('diagnostics.severity.maintainability') ?? 3
    };
  }

  /**
   * Register a configuration change callback
   */
  onConfigChange(callback: (config: EnhancedDiagnosticConfig) => void): () => void {
    const subscriptionId = this.notificationService.subscribeToDiagnostics(
      (event) => {
        if (event.type === 'config-changed') {
          callback(this.currentConfig);
        }
      }
    );

    return () => this.notificationService.unsubscribe(subscriptionId);
  }

  /**
   * Dispose of the adapter
   */
  dispose(): void {
    if (this.subscriptionId) {
      this.notificationService.unsubscribe(this.subscriptionId);
      this.subscriptionId = undefined;
    }
    console.log('DiagnosticConfigAdapter disposed');
  }

  private handleConfigChange(event: any): void {
    // Rebuild the enhanced configuration from the centralized config
    this.currentConfig = this.buildEnhancedConfig();
    console.log('DiagnosticConfigAdapter: Configuration updated');
  }

  private buildEnhancedConfig(override?: Partial<EnhancedDiagnosticConfig>): EnhancedDiagnosticConfig {
    const diagnosticConfig = this.configManager.get<DiagnosticConfig>('diagnostics');

    if (!diagnosticConfig) {
      return { ...DEFAULT_ENHANCED_DIAGNOSTIC_CONFIG, ...override };
    }

    // Convert new format to legacy format
    const enhancedConfig: EnhancedDiagnosticConfig = {
      performance: {
        enabled: diagnosticConfig.performance?.enabled ?? true,
        maxComplexity: diagnosticConfig.performance?.maxComplexity ?? 10,
        maxNestingDepth: diagnosticConfig.performance?.maxNestingDepth ?? 5,
        flagRedundantOperations: diagnosticConfig.performance?.flagRedundantOperations ?? true,
        flagExpensiveOperations: diagnosticConfig.performance?.flagExpensiveOperations ?? true
      },
      codeQuality: {
        enabled: diagnosticConfig.codeQuality?.enabled ?? true,
        maxLineLength: diagnosticConfig.codeQuality?.maxLineLength ?? 100,
        enforceNamingConventions: diagnosticConfig.codeQuality?.enforceNamingConventions ?? false,
        flagMagicValues: diagnosticConfig.codeQuality?.flagMagicValues ?? true,
        requireDocumentation: diagnosticConfig.codeQuality?.requireDocumentation ?? false
      },
      fhirBestPractices: {
        enabled: diagnosticConfig.fhirBestPractices?.enabled ?? true,
        enforceTypeSafety: diagnosticConfig.fhirBestPractices?.enforceTypeSafety ?? true,
        flagDeprecatedElements: diagnosticConfig.fhirBestPractices?.flagDeprecatedElements ?? true,
        suggestOptimizations: diagnosticConfig.fhirBestPractices?.suggestOptimizations ?? true,
        checkCardinality: diagnosticConfig.fhirBestPractices?.checkCardinality ?? false
      },
      maintainability: {
        enabled: diagnosticConfig.maintainability?.enabled ?? true,
        maxFunctionComplexity: diagnosticConfig.maintainability?.maxFunctionComplexity ?? 8,
        flagDuplication: diagnosticConfig.maintainability?.flagDuplication ?? true,
        enforceConsistency: diagnosticConfig.maintainability?.enforceConsistency ?? true
      },
      severity: {
        performance: diagnosticConfig.severity?.performance ?? 2,
        codeQuality: diagnosticConfig.severity?.codeQuality ?? 3,
        fhirBestPractices: diagnosticConfig.severity?.fhirBestPractices ?? 2,
        maintainability: diagnosticConfig.severity?.maintainability ?? 3
      }
    };

    return { ...enhancedConfig, ...override };
  }

  private convertToNewFormat(config: Partial<EnhancedDiagnosticConfig>): Partial<DiagnosticConfig> {
    const newConfig: Partial<DiagnosticConfig> = {};

    if (config.performance) {
      newConfig.performance = {
        enabled: config.performance.enabled ?? true,
        maxComplexity: config.performance.maxComplexity ?? 10,
        maxNestingDepth: config.performance.maxNestingDepth ?? 5,
        flagRedundantOperations: config.performance.flagRedundantOperations ?? true,
        flagExpensiveOperations: config.performance.flagExpensiveOperations ?? true
      };
    }

    if (config.codeQuality) {
      newConfig.codeQuality = {
        enabled: config.codeQuality.enabled ?? true,
        maxLineLength: config.codeQuality.maxLineLength ?? 100,
        enforceNamingConventions: config.codeQuality.enforceNamingConventions ?? false,
        flagMagicValues: config.codeQuality.flagMagicValues ?? true,
        requireDocumentation: config.codeQuality.requireDocumentation ?? false
      };
    }

    if (config.fhirBestPractices) {
      newConfig.fhirBestPractices = {
        enabled: config.fhirBestPractices.enabled ?? true,
        enforceTypeSafety: config.fhirBestPractices.enforceTypeSafety ?? true,
        flagDeprecatedElements: config.fhirBestPractices.flagDeprecatedElements ?? true,
        suggestOptimizations: config.fhirBestPractices.suggestOptimizations ?? true,
        checkCardinality: config.fhirBestPractices.checkCardinality ?? false
      };
    }

    if (config.maintainability) {
      newConfig.maintainability = {
        enabled: config.maintainability.enabled ?? true,
        maxFunctionComplexity: config.maintainability.maxFunctionComplexity ?? 8,
        flagDuplication: config.maintainability.flagDuplication ?? true,
        enforceConsistency: config.maintainability.enforceConsistency ?? true
      };
    }

    if (config.severity) {
      newConfig.severity = {
        performance: config.severity.performance ?? 2,
        codeQuality: config.severity.codeQuality ?? 3,
        fhirBestPractices: config.severity.fhirBestPractices ?? 2,
        maintainability: config.severity.maintainability ?? 3
      };
    }

    return newConfig;
  }

  private flattenConfig(obj: any, prefix: string = ''): Record<string, any> {
    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;

      if (this.isObject(value)) {
        Object.assign(result, this.flattenConfig(value, path));
      } else {
        result[path] = value;
      }
    }

    return result;
  }

  private isObject(value: any): value is Record<string, any> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
}

/**
 * Factory for creating diagnostic configuration adapters
 */
export class DiagnosticConfigAdapterFactory {
  /**
   * Create adapter with config manager and notification service
   */
  static create(
    configManager: ConfigManager,
    notificationService: ConfigNotificationService,
    initialConfig?: Partial<EnhancedDiagnosticConfig>
  ): DiagnosticConfigAdapter {
    return new DiagnosticConfigAdapter(configManager, notificationService, initialConfig);
  }

  /**
   * Create adapter for development with additional logging
   */
  static createDevelopment(
    configManager: ConfigManager,
    notificationService: ConfigNotificationService,
    initialConfig?: Partial<EnhancedDiagnosticConfig>
  ): DiagnosticConfigAdapter {
    const adapter = new DiagnosticConfigAdapter(configManager, notificationService, initialConfig);

    // Add development logging
    adapter.onConfigChange((config) => {
      console.log('[DEV] Diagnostic configuration changed:', config);
    });

    return adapter;
  }

  /**
   * Create adapter for production with minimal logging
   */
  static createProduction(
    configManager: ConfigManager,
    notificationService: ConfigNotificationService,
    initialConfig?: Partial<EnhancedDiagnosticConfig>
  ): DiagnosticConfigAdapter {
    return new DiagnosticConfigAdapter(configManager, notificationService, initialConfig);
  }
}
