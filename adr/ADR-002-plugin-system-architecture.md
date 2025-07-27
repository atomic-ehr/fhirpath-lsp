# ADR-002: Plugin System Architecture

## Status
**Accepted** - *2024-07-27*

## Context

The FHIRPath LSP requires extensibility to support custom functionality, specialized analyzers, and domain-specific validation rules. We need a plugin system that allows:

1. **Provider Extensions**: Custom LSP providers (completion, hover, diagnostics)
2. **Analyzer Extensions**: Custom code analysis and quality checks
3. **Validator Extensions**: Custom validation rules
4. **Configuration**: Plugin-specific configuration options
5. **Lifecycle Management**: Loading, dependency resolution, and error handling

## Decision

We will implement a plugin system based on TypeScript interfaces with runtime registration and lifecycle management.

### Plugin Types

#### 1. Provider Plugins
```typescript
interface IProviderPlugin extends IPlugin {
  providers: ProviderRegistration[];
}

interface ProviderRegistration {
  type: 'completion' | 'hover' | 'diagnostic' | 'codeAction' | 'inlayHint';
  provider: any; // Specific provider interface
  priority?: number;
}
```

#### 2. Analyzer Plugins
```typescript
interface IAnalyzerPlugin extends IPlugin {
  analyzers: AnalyzerRegistration[];
}

interface AnalyzerRegistration {
  type: 'performance' | 'codeQuality' | 'fhirBestPractices' | 'custom';
  analyzer: IAnalyzer;
  priority?: number;
}
```

#### 3. Validator Plugins
```typescript
interface IValidatorPlugin extends IPlugin {
  validators: ValidatorRegistration[];
}

interface ValidatorRegistration {
  type: 'syntax' | 'semantic' | 'fhir' | 'custom';
  validator: IValidator;
  priority?: number;
}
```

### Plugin Discovery and Loading

1. **Built-in Plugins**: Automatically loaded from `server/src/plugins/builtin/`
2. **External Plugins**: Loaded from configured plugin sources
3. **Configuration-based**: Plugins can be enabled/disabled via configuration

### Registry Pattern

Each plugin type has its own registry:
- `ProviderRegistry`: Manages LSP providers
- `AnalyzerRegistry`: Manages code analyzers
- `ValidatorRegistry`: Manages validators

### Lifecycle Management

1. **Discovery**: Find available plugins
2. **Validation**: Validate plugin structure and dependencies
3. **Loading**: Initialize plugins with configuration
4. **Registration**: Register plugin components
5. **Activation**: Enable plugin functionality
6. **Deactivation**: Clean up plugin resources

### Error Handling

- **Graceful Degradation**: Failed plugins don't crash the server
- **Error Isolation**: Plugin errors are contained and logged
- **Fallback Mechanisms**: Built-in functionality continues to work

## Implementation

### Core Interfaces
```typescript
interface IPlugin {
  name: string;
  version: string;
  description?: string;
  dependencies?: string[];
  activate?(context: PluginContext): Promise<void>;
  deactivate?(): Promise<void>;
}

interface PluginContext {
  configuration: any;
  logger: Logger;
  services: ServiceContainer;
}
```

### Plugin Manager
```typescript
class PluginManager {
  private plugins: Map<string, IPlugin> = new Map();
  private registries: {
    provider: ProviderRegistry;
    analyzer: AnalyzerRegistry;
    validator: ValidatorRegistry;
  };

  async loadPlugins(sources: PluginSource[]): Promise<void>;
  async activatePlugin(name: string): Promise<void>;
  async deactivatePlugin(name: string): Promise<void>;
  getPlugin(name: string): IPlugin | undefined;
}
```

### Built-in Plugins

1. **Core Providers Plugin**: Default LSP providers
2. **Performance Analyzer Plugin**: Performance analysis
3. **FHIR Validator Plugin**: FHIR-specific validation

### Configuration Integration

```json
{
  "plugins": {
    "enabled": true,
    "sources": ["builtin"],
    "disabled": ["pluginName"],
    "configuration": {
      "pluginName": {
        "option1": "value1"
      }
    }
  }
}
```

## Consequences

### Positive
- **Extensibility**: Easy to add new functionality
- **Modularity**: Clear separation of concerns
- **Testability**: Plugins can be tested independently
- **Configuration**: Fine-grained control over functionality
- **Performance**: Only load needed functionality

### Negative
- **Complexity**: Additional layer of abstraction
- **Debugging**: Harder to debug across plugin boundaries
- **Performance Overhead**: Plugin system adds minimal overhead

### Risks and Mitigation
- **Plugin Conflicts**: Mitigated by priority system and validation
- **Security Concerns**: Mitigated by validation and sandboxing
- **Performance Impact**: Mitigated by lazy loading and caching

## Migration Strategy

1. **Phase 1**: Implement core plugin infrastructure
2. **Phase 2**: Convert existing providers to built-in plugins
3. **Phase 3**: Add external plugin support
4. **Phase 4**: Documentation and examples

## Success Criteria

- Existing functionality continues to work
- New plugins can be easily added
- Plugin configuration is intuitive
- Performance impact is minimal
- Error handling is robust

## References

- [VS Code Extension API](https://code.visualstudio.com/api)
- [TypeScript Module System](https://www.typescriptlang.org/docs/handbook/modules.html)
- [Plugin Architecture Patterns](https://martinfowler.com/articles/injection.html)
EOF < /dev/null