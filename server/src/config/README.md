# Centralized Configuration Management System

This document describes the centralized configuration management system implemented for the FHIRPath LSP server. The system provides unified configuration management to replace scattered configuration across multiple services and improve maintainability.

## Overview

The centralized configuration system consists of several key components:

- **ConfigManager**: Central coordinator for all configuration management
- **Configuration Schemas**: Type-safe configuration interfaces for all services
- **Configuration Loaders**: Support for file, environment, and runtime configuration sources
- **Configuration Validators**: Validation system with helpful error messages
- **Configuration Notifications**: Change notification system for services
- **Configuration Adapters**: Bridge between new system and existing service interfaces

## Architecture

```
config/
├── ConfigManager.ts              # Central configuration manager
├── ConfigNotificationService.ts  # Change notification system
├── schemas/                      # Configuration schemas
│   ├── BaseConfig.ts            # Base interfaces and types
│   ├── DiagnosticConfig.ts      # Diagnostic analyzer configuration
│   └── ProviderConfig.ts        # Language server provider configuration
├── loaders/                     # Configuration loaders
│   ├── FileConfigLoader.ts      # JSON file configuration
│   ├── EnvironmentConfigLoader.ts # Environment variable configuration
│   └── RuntimeConfigLoader.ts   # Runtime configuration updates
├── validators/                  # Configuration validation
│   ├── ConfigValidator.ts       # Base validation framework
│   ├── DiagnosticConfigValidator.ts # Diagnostic configuration validation
│   └── ProviderConfigValidator.ts   # Provider configuration validation
└── adapters/                    # Migration adapters
    └── DiagnosticConfigAdapter.ts # Adapter for DiagnosticProvider
```

## Quick Start

### Basic Usage

```typescript
import { ConfigManager, DEFAULT_APP_CONFIG } from './config/ConfigManager';
import { FileConfigLoader } from './config/loaders/FileConfigLoader';
import { DiagnosticConfigValidator } from './config/validators/DiagnosticConfigValidator';

// Create configuration manager
const configManager = new ConfigManager();

// Register file loader
const fileLoader = new FileConfigLoader('./config.json');
configManager.registerLoader('file', fileLoader);

// Register validator
const validator = new DiagnosticConfigValidator();
configManager.registerValidator('diagnostic', validator);

// Load configuration
await configManager.loadConfiguration();

// Get configuration values
const maxComplexity = configManager.get('diagnostics.performance.maxComplexity');
const isEnabled = configManager.get('diagnostics.enabled');

// Set configuration values
configManager.set('diagnostics.performance.maxComplexity', 15);

// Listen for changes
const unsubscribe = configManager.onChange((event) => {
  console.log(`Configuration changed: ${event.path} = ${event.newValue}`);
});
```

### Using Configuration Notifications

```typescript
import { ConfigNotificationService } from './config/ConfigNotificationService';

// Create notification service
const notificationService = new ConfigNotificationService(configManager);

// Subscribe to diagnostic configuration changes
const subscriptionId = notificationService.subscribeToDiagnostics((event) => {
  if (event.type === 'config-changed') {
    console.log('Diagnostic configuration updated:', event.path);
    // Update your service accordingly
  }
});

// Subscribe to specific paths
const perfSubscription = notificationService.subscribeToPaths(
  ['diagnostics.performance'],
  (event) => {
    console.log('Performance configuration changed');
  },
  { debounceMs: 500 } // Debounce rapid changes
);

// Unsubscribe when done
notificationService.unsubscribe(subscriptionId);
```

### Using Configuration Adapters

```typescript
import { DiagnosticConfigAdapter } from './config/adapters/DiagnosticConfigAdapter';

// Create adapter for existing DiagnosticProvider
const configAdapter = new DiagnosticConfigAdapter(
  configManager,
  notificationService
);

// Use existing DiagnosticProvider API
const enhancedConfig = configAdapter.getEnhancedDiagnosticConfig();
configAdapter.updateEnhancedDiagnosticConfig({
  performance: { maxComplexity: 20 }
});

// Configure specific analyzer rules
configAdapter.configureAnalyzerRule('performance', 'complexity-check', {
  enabled: true,
  severity: DiagnosticSeverity.Warning,
  parameters: { threshold: 15 }
});
```

## Configuration Schema

### Diagnostic Configuration

```typescript
interface DiagnosticConfig {
  enabled: boolean;
  performance: {
    enabled: boolean;
    maxComplexity: number;        // 1-50
    maxNestingDepth: number;      // 1-20
    flagRedundantOperations: boolean;
    flagExpensiveOperations: boolean;
    rules?: Record<string, DiagnosticRuleConfig>;
  };
  codeQuality: {
    enabled: boolean;
    maxLineLength: number;        // 50-200
    enforceNamingConventions: boolean;
    flagMagicValues: boolean;
    requireDocumentation: boolean;
    rules?: Record<string, DiagnosticRuleConfig>;
  };
  fhirBestPractices: {
    enabled: boolean;
    enforceTypeSafety: boolean;
    flagDeprecatedElements: boolean;
    suggestOptimizations: boolean;
    checkCardinality: boolean;
    rules?: Record<string, DiagnosticRuleConfig>;
  };
  maintainability: {
    enabled: boolean;
    maxFunctionComplexity: number; // 1-30
    flagDuplication: boolean;
    enforceConsistency: boolean;
    rules?: Record<string, DiagnosticRuleConfig>;
  };
  severity: {
    performance: DiagnosticSeverity;
    codeQuality: DiagnosticSeverity;
    fhirBestPractices: DiagnosticSeverity;
    maintainability: DiagnosticSeverity;
  };
  globalRules?: Record<string, DiagnosticRuleConfig>;
}
```

### Provider Configuration

```typescript
interface ProviderConfig {
  enabled: boolean;
  refactoring: {
    enabled: boolean;
    autoSuggestNames: boolean;
    confirmDestructive: boolean;
    maxPreviewChanges: number;    // 1-1000
    safetyChecks: {
      semanticValidation: boolean;
      syntaxCheck: boolean;
      referenceIntegrity: boolean;
    };
  };
  performance: {
    enabled: boolean;
    requestThrottling: {
      enabled: boolean;
      configs: ThrottleConfig[];
      adaptiveEnabled: boolean;
      defaultWindowMs: number;    // 100-10000
    };
    caching: {
      enabled: boolean;
      maxCacheSize: number;       // 10-10000
      ttlMs: number;              // 1000-3600000
    };
    timeouts: {
      completionTimeoutMs: number;  // 1000-60000
      diagnosticTimeoutMs: number;  // 1000-60000
      hoverTimeoutMs: number;       // 1000-60000
    };
  };
  // ... other provider configurations
}
```

## Configuration Sources

### File Configuration

Create a JSON configuration file:

```json
{
  "diagnostics": {
    "enabled": true,
    "performance": {
      "maxComplexity": 15,
      "maxNestingDepth": 6
    },
    "codeQuality": {
      "maxLineLength": 120,
      "flagMagicValues": true
    }
  },
  "providers": {
    "refactoring": {
      "enabled": true,
      "confirmDestructive": true
    },
    "performance": {
      "requestThrottling": {
        "enabled": true,
        "configs": [
          {
            "requestType": "completion",
            "limit": 15,
            "windowMs": 1000
          }
        ]
      }
    }
  }
}
```

### Environment Configuration

Set environment variables with the `FHIRPATH_LSP_` prefix:

```bash
# Diagnostic configuration
export FHIRPATH_LSP_DIAGNOSTICS_ENABLED=true
export FHIRPATH_LSP_DIAGNOSTICS_PERFORMANCE_MAX_COMPLEXITY=20
export FHIRPATH_LSP_DIAGNOSTICS_CODE_QUALITY_MAX_LINE_LENGTH=120

# Provider configuration
export FHIRPATH_LSP_PROVIDERS_REFACTORING_ENABLED=true
export FHIRPATH_LSP_PROVIDERS_PERFORMANCE_THROTTLING_ENABLED=true

# JSON configuration for complex objects
export FHIRPATH_LSP_THROTTLE_CONFIGS='[{"requestType":"completion","limit":20,"windowMs":1000}]'
```

### Runtime Configuration

Update configuration at runtime:

```typescript
// Direct updates
configManager.set('diagnostics.performance.maxComplexity', 25);

// Batch updates
configManager.updateConfig({
  diagnostics: {
    performance: {
      maxComplexity: 25,
      flagRedundantOperations: false
    }
  }
});

// Using runtime loader
const runtimeLoader = new RuntimeConfigLoader();
runtimeLoader.updatePath('diagnostics.enabled', false);
```

## Configuration Validation

The system includes comprehensive validation:

```typescript
// Automatic validation on set
try {
  configManager.set('diagnostics.performance.maxComplexity', 'invalid');
} catch (error) {
  console.error('Invalid configuration:', error.message);
}

// Manual validation
const result = configManager.validate({
  diagnostics: {
    performance: {
      maxComplexity: 100 // Too high
    }
  }
});

if (!result.isValid) {
  console.error('Validation errors:', result.errors);
  console.warn('Validation warnings:', result.warnings);
}
```

## Migration Guide

### Migrating Existing Services

1. **Update Service Constructor**:

```typescript
// Before
class DiagnosticProvider {
  constructor(enhancedConfig?: Partial<EnhancedDiagnosticConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...enhancedConfig };
  }
}

// After
class DiagnosticProvider {
  constructor(
    configAdapter: DiagnosticConfigAdapter,
    enhancedConfig?: Partial<EnhancedDiagnosticConfig>
  ) {
    this.configAdapter = configAdapter;
    // Backward compatibility
    if (enhancedConfig) {
      this.configAdapter.updateEnhancedDiagnosticConfig(enhancedConfig);
    }
  }
}
```

2. **Replace Direct Configuration Access**:

```typescript
// Before
updateEnhancedDiagnosticConfig(config: Partial<EnhancedDiagnosticConfig>): void {
  this.enhancedDiagnosticConfig = { ...this.enhancedDiagnosticConfig, ...config };
}

// After
updateEnhancedDiagnosticConfig(config: Partial<EnhancedDiagnosticConfig>): void {
  this.configAdapter.updateEnhancedDiagnosticConfig(config);
}
```

3. **Add Configuration Change Handling**:

```typescript
// Subscribe to configuration changes
this.configSubscription = this.configAdapter.onConfigChange((config) => {
  this.handleConfigurationChange(config);
});

private handleConfigurationChange(config: EnhancedDiagnosticConfig): void {
  // Update internal state
  this.updateAnalyzers(config);
  
  // Notify dependent services
  this.emit('configChanged', config);
}
```

### Backward Compatibility

The system maintains backward compatibility through adapters:

- Existing service APIs remain unchanged
- Configuration formats are automatically converted
- Default values are preserved
- Migration can be done incrementally

## Best Practices

### 1. Use Type-Safe Configuration Access

```typescript
// Good: Type-safe access
const maxComplexity = configManager.get<number>('diagnostics.performance.maxComplexity');

// Better: Use configuration adapters
const performanceConfig = diagnosticAdapter.getPerformanceConfig();
const maxComplexity = performanceConfig.maxComplexity;
```

### 2. Handle Configuration Changes

```typescript
// Subscribe to relevant configuration changes
const subscription = notificationService.subscribeToPaths(
  ['diagnostics.performance'],
  (event) => {
    if (event.type === 'config-changed') {
      this.updatePerformanceSettings();
    }
  },
  { debounceMs: 200 } // Debounce rapid changes
);

// Clean up subscriptions
onDestroy() {
  notificationService.unsubscribe(subscription);
}
```

### 3. Validate Configuration Early

```typescript
// Register validators during initialization
const diagnosticValidator = new DiagnosticConfigValidator();
const providerValidator = new ProviderConfigValidator();
const compositeValidator = new CompositeConfigValidator();

compositeValidator.addValidator(diagnosticValidator);
compositeValidator.addValidator(providerValidator);

configManager.registerValidator('main', compositeValidator);
```

### 4. Use Environment-Specific Configuration

```typescript
// Development
const configManager = new ConfigManager();
const fileLoader = FileConfigLoaderFactory.createWorkspaceLoader(workspaceRoot);
const envLoader = EnvironmentConfigLoaderFactory.createDevelopment();

// Production
const configManager = new ConfigManager();
const fileLoader = FileConfigLoaderFactory.createSystemLoader();
const envLoader = EnvironmentConfigLoaderFactory.createProduction();
```

### 5. Monitor Configuration Performance

```typescript
// Monitor configuration access patterns
const stats = notificationService.getStats();
console.log('Configuration stats:', stats);

// Use scoped services for better performance
const diagnosticNotifications = notificationService.createScopedService('diagnostics');
```

## Troubleshooting

### Common Issues

1. **Configuration Not Loading**:
   - Check file paths and permissions
   - Verify JSON syntax in configuration files
   - Check environment variable names and values

2. **Validation Errors**:
   - Review validation error messages
   - Check value ranges and types
   - Ensure required fields are present

3. **Performance Issues**:
   - Use debouncing for rapid configuration changes
   - Consider using scoped notification services
   - Monitor configuration access patterns

4. **Migration Issues**:
   - Use configuration adapters for backward compatibility
   - Test existing functionality after migration
   - Update tests to use new configuration system

### Debug Mode

Enable debug logging:

```typescript
const configManager = new ConfigManager();
const notificationService = ConfigNotificationServiceFactory.createDevelopment(configManager);

// This will log all configuration changes
```

## API Reference

See the individual component documentation:

- [ConfigManager API](./ConfigManager.ts)
- [Configuration Schemas](./schemas/)
- [Configuration Loaders](./loaders/)
- [Configuration Validators](./validators/)
- [Configuration Notifications](./ConfigNotificationService.ts)
- [Configuration Adapters](./adapters/)

## Testing

Run the configuration system tests:

```bash
npm test -- --testPathPattern=config
```

The test suite covers:
- Basic configuration management
- Configuration loading and validation
- Configuration change notifications
- Adapter functionality
- Error handling and edge cases
- Performance characteristics
