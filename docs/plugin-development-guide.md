# FHIRPath LSP Plugin Development Guide

This guide covers everything you need to know to develop plugins for the FHIRPath Language Server Protocol (LSP) implementation.

## Table of Contents

1. [Overview](#overview)
2. [Getting Started](#getting-started)
3. [Plugin Types](#plugin-types)
4. [Plugin Development](#plugin-development)
5. [Configuration](#configuration)
6. [Testing](#testing)
7. [Publishing](#publishing)
8. [API Reference](#api-reference)
9. [Examples](#examples)
10. [Best Practices](#best-practices)

## Overview

The FHIRPath LSP plugin system allows developers to extend the language server with custom functionality. Plugins can provide:

- **Language Features**: Code actions, completion, hover, definition navigation, etc.
- **Code Analysis**: Custom analyzers for performance, security, or style checking
- **Validation Rules**: Custom validation logic for FHIRPath expressions
- **Transformations**: Code refactoring and formatting capabilities

### Plugin Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Your Plugin   │────│  Plugin Manager  │────│   LSP Server    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                               │
                    ┌──────────┼──────────┐
                    │          │          │
            ┌───────▼───┐ ┌────▼────┐ ┌───▼────────┐
            │ Provider  │ │Analyzer │ │ Validator  │
            │ Registry  │ │Registry │ │ Registry   │
            └───────────┘ └─────────┘ └────────────┘
```

## Getting Started

### Prerequisites

- Node.js 20+ or Bun
- TypeScript knowledge
- Understanding of LSP concepts
- Familiarity with FHIRPath syntax

### Development Environment Setup

1. **Clone the FHIRPath LSP repository** (for local development):
   ```bash
   git clone https://github.com/your-org/fhirpath-lsp.git
   cd fhirpath-lsp
   bun install
   ```

2. **Create your plugin directory**:
   ```bash
   mkdir my-fhirpath-plugin
   cd my-fhirpath-plugin
   bun init
   ```

3. **Install dependencies**:
   ```bash
   bun add @fhirpath-lsp/plugin-api @types/vscode-languageserver
   ```

### Plugin Structure

```
my-fhirpath-plugin/
├── package.json          # Plugin manifest
├── src/
│   ├── index.ts          # Main plugin entry point
│   ├── providers/        # Language feature providers
│   ├── analyzers/        # Code analyzers
│   └── validators/       # Custom validators
├── tests/               # Plugin tests
└── README.md           # Plugin documentation
```

## Plugin Types

### 1. Provider Plugins

Provider plugins extend language features like code completion, hover information, and code actions.

```typescript
import { 
  IPlugin, 
  IProviderPlugin, 
  ProviderRegistration,
  PluginCapabilityType 
} from '@fhirpath-lsp/plugin-api';

export class MyProviderPlugin implements IPlugin, IProviderPlugin {
  readonly metadata = {
    id: 'my-provider-plugin',
    name: 'My Provider Plugin',
    version: '1.0.0',
    description: 'Provides custom code actions for FHIRPath'
  };

  readonly capabilities = [
    { type: PluginCapabilityType.CodeAction, version: '1.0.0' }
  ];

  state = PluginState.Loaded;

  async initialize(context: PluginContext): Promise<void> {
    // Initialize plugin resources
    this.state = PluginState.Initialized;
  }

  async activate(): Promise<void> {
    // Activate plugin functionality
    this.state = PluginState.Activated;
  }

  async deactivate(): Promise<void> {
    this.state = PluginState.Deactivated;
  }

  dispose(): void {
    this.state = PluginState.Disposed;
  }

  getProviders(): ProviderRegistration[] {
    return [
      {
        type: PluginCapabilityType.CodeAction,
        provider: new MyCodeActionProvider(),
        priority: 100
      }
    ];
  }
}
```

### 2. Analyzer Plugins

Analyzer plugins perform code analysis and provide suggestions or diagnostics.

```typescript
import { 
  IPlugin, 
  IAnalyzerPlugin, 
  AnalyzerRegistration,
  AnalyzerCategory 
} from '@fhirpath-lsp/plugin-api';

export class MyAnalyzerPlugin implements IPlugin, IAnalyzerPlugin {
  readonly metadata = {
    id: 'my-analyzer-plugin',
    name: 'My Analyzer Plugin',
    version: '1.0.0'
  };

  readonly capabilities = [
    { type: PluginCapabilityType.Analyzer, version: '1.0.0' }
  ];

  // ... lifecycle methods ...

  getAnalyzers(): AnalyzerRegistration[] {
    return [
      {
        id: 'performance-analyzer',
        name: 'Performance Analyzer',
        description: 'Analyzes FHIRPath expressions for performance issues',
        analyzer: new PerformanceAnalyzer(),
        priority: 90,
        enabledByDefault: true,
        categories: [AnalyzerCategory.Performance]
      }
    ];
  }
}
```

### 3. Validator Plugins

Validator plugins implement custom validation rules for FHIRPath expressions.

```typescript
import { 
  IPlugin, 
  IValidatorPlugin, 
  ValidatorRegistration,
  ValidatorCategory 
} from '@fhirpath-lsp/plugin-api';

export class MyValidatorPlugin implements IPlugin, IValidatorPlugin {
  readonly metadata = {
    id: 'my-validator-plugin',
    name: 'My Validator Plugin',
    version: '1.0.0'
  };

  readonly capabilities = [
    { type: PluginCapabilityType.Validator, version: '1.0.0' }
  ];

  // ... lifecycle methods ...

  getValidators(): ValidatorRegistration[] {
    return [
      {
        id: 'custom-validator',
        name: 'Custom Validator',
        description: 'Custom validation rules for FHIRPath',
        validator: new CustomValidator(),
        priority: 100,
        enabledByDefault: true,
        categories: [ValidatorCategory.Custom],
        triggers: [ValidationTrigger.OnType, ValidationTrigger.OnSave]
      }
    ];
  }
}
```

## Plugin Development

### Package.json Configuration

Your `package.json` must include specific fields for FHIRPath LSP plugin discovery:

```json
{
  "name": "my-fhirpath-plugin",
  "version": "1.0.0",
  "description": "My awesome FHIRPath plugin",
  "main": "dist/index.js",
  "keywords": ["fhirpath-lsp-plugin"],
  "author": "Your Name",
  "license": "MIT",
  "engines": {
    "node": ">=16.0.0"
  },
  "fhirpath-lsp": {
    "id": "my-fhirpath-plugin",
    "name": "My FHIRPath Plugin",
    "capabilities": [
      {
        "type": "codeAction",
        "version": "1.0.0"
      }
    ],
    "activationEvents": [
      {
        "type": "onLanguage",
        "value": "fhirpath"
      }
    ],
    "configurationSchema": {
      "type": "object",
      "properties": {
        "enabled": {
          "type": "boolean",
          "default": true,
          "description": "Enable this plugin"
        },
        "customSetting": {
          "type": "string",
          "default": "defaultValue",
          "description": "A custom setting for this plugin"
        }
      }
    }
  },
  "dependencies": {
    "@fhirpath-lsp/plugin-api": "^1.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^18.0.0"
  }
}
```

### Implementation Examples

#### Code Action Provider

```typescript
import { 
  ICodeActionProvider,
  CodeAction,
  CodeActionContext,
  Range,
  TextDocument
} from '@fhirpath-lsp/plugin-api';

export class MyCodeActionProvider implements ICodeActionProvider {
  async provideCodeActions(
    document: TextDocument,
    range: Range,
    context: CodeActionContext
  ): Promise<CodeAction[]> {
    const actions: CodeAction[] = [];
    
    // Get the text in the range
    const text = document.getText(range);
    
    // Example: Provide action to optimize performance
    if (text.includes('.descendants()')) {
      actions.push({
        title: 'Optimize descendants() usage',
        kind: 'quickfix.performance',
        edit: {
          changes: {
            [document.uri]: [
              {
                range,
                newText: text.replace('.descendants()', '.descendant()')
              }
            ]
          }
        },
        isPreferred: true
      });
    }
    
    return actions;
  }
}
```

#### Custom Analyzer

```typescript
import { 
  IAnalyzer,
  AnalysisResult,
  AnalysisContext,
  AnalysisResultBuilder
} from '@fhirpath-lsp/plugin-api';

export class PerformanceAnalyzer implements IAnalyzer {
  async analyze(
    expression: string,
    parseResult: ParseResult,
    document: TextDocument,
    context?: AnalysisContext
  ): Promise<AnalysisResult> {
    const builder = AnalysisResultBuilder.create();
    
    // Check for performance anti-patterns
    if (expression.includes('.descendants().where(')) {
      builder.addSuggestion({
        type: 'performance',
        severity: 'warning',
        message: 'descendants().where() can be slow on large resources',
        range: this.findPatternRange(expression, '.descendants().where(')
      });
    }
    
    // Calculate complexity metrics
    const complexity = this.calculateComplexity(expression);
    builder.addMetric('complexity', complexity);
    
    if (complexity > 10) {
      builder.addDiagnostic({
        severity: DiagnosticSeverity.Warning,
        message: `Expression complexity is high: ${complexity}`,
        code: 'high-complexity',
        source: 'performance-analyzer',
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: expression.length } }
      });
    }
    
    return builder.build();
  }
  
  shouldAnalyze(expression: string, document: TextDocument): boolean {
    // Only analyze expressions longer than 10 characters
    return expression.length > 10;
  }
  
  private calculateComplexity(expression: string): number {
    // Simple complexity calculation
    let score = 0;
    score += (expression.match(/\./g) || []).length; // Path navigation
    score += (expression.match(/where|select|exists/g) || []).length * 2; // Complex operations
    score += (expression.match(/\(.*\(/g) || []).length * 3; // Nested calls
    return score;
  }
}
```

#### Custom Validator

```typescript
import { 
  IValidator,
  ValidationResult,
  ValidationResultBuilder,
  ValidationContext
} from '@fhirpath-lsp/plugin-api';

export class CustomValidator implements IValidator {
  async validate(
    expression: string,
    parseResult: ParseResult,
    document: TextDocument,
    context?: ValidationContext
  ): Promise<ValidationResult> {
    const builder = ValidationResultBuilder.create();
    
    // Custom validation rule: no deprecated functions
    const deprecatedFunctions = ['old_function', 'legacy_method'];
    
    for (const func of deprecatedFunctions) {
      if (expression.includes(func)) {
        builder.addError({
          message: `Function '${func}' is deprecated`,
          code: 'deprecated-function',
          range: this.findFunctionRange(expression, func)
        });
      }
    }
    
    // Business rule validation
    if (context?.resourceType === 'Patient' && expression.includes('confidential')) {
      builder.addWarning({
        message: 'Accessing confidential data requires special permissions',
        code: 'confidential-access'
      });
    }
    
    return builder.build();
  }
  
  shouldValidate(expression: string, document: TextDocument): boolean {
    return true; // Validate all expressions
  }
  
  getConfigurationSchema() {
    return {
      type: 'object',
      properties: {
        strictMode: {
          type: 'boolean',
          default: false,
          description: 'Enable strict validation mode'
        },
        allowedFunctions: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of allowed functions'
        }
      }
    };
  }
}
```

## Configuration

### Plugin Configuration

Plugins can be configured through the LSP settings:

```json
{
  "fhirpath-lsp": {
    "plugins": {
      "enabled": true,
      "plugins": {
        "my-fhirpath-plugin": {
          "enabled": true,
          "customSetting": "myValue",
          "strictMode": false
        }
      }
    }
  }
}
```

### Accessing Configuration

```typescript
export class MyPlugin implements IPlugin {
  private config: any;

  async initialize(context: PluginContext): Promise<void> {
    this.config = context.configuration;
    
    // Access configuration values
    const isEnabled = this.config.enabled ?? true;
    const customSetting = this.config.customSetting ?? 'defaultValue';
  }

  onConfigurationChanged(configuration: any): void {
    this.config = configuration;
    // React to configuration changes
  }
}
```

## Testing

### Unit Tests

```typescript
import { MyCodeActionProvider } from '../src/providers/MyCodeActionProvider';
import { TextDocument } from 'vscode-languageserver-textdocument';

describe('MyCodeActionProvider', () => {
  let provider: MyCodeActionProvider;

  beforeEach(() => {
    provider = new MyCodeActionProvider();
  });

  it('should provide optimization actions for descendants()', async () => {
    const document = TextDocument.create(
      'file:///test.fhirpath',
      'fhirpath',
      1,
      'Patient.descendants().where(active = true)'
    );

    const range = {
      start: { line: 0, character: 0 },
      end: { line: 0, character: document.getText().length }
    };

    const actions = await provider.provideCodeActions(document, range, {
      diagnostics: []
    });

    expect(actions).toHaveLength(1);
    expect(actions[0].title).toContain('Optimize');
  });
});
```

### Integration Tests

```typescript
import { PluginManager } from '@fhirpath-lsp/core';
import { MyPlugin } from '../src/MyPlugin';

describe('MyPlugin Integration', () => {
  let pluginManager: PluginManager;

  beforeEach(async () => {
    pluginManager = new PluginManager(mockConnection, {
      enabled: true,
      sources: ['local'],
      configuration: {}
    });

    // Register test plugin
    await pluginManager.registerPlugin(new MyPlugin());
  });

  it('should integrate with plugin system', async () => {
    await pluginManager.initialize();
    await pluginManager.activatePlugins({ type: 'onLanguage', value: 'fhirpath' });

    const providers = pluginManager.getProviderRegistry().getCodeActionProviders();
    expect(providers.length).toBeGreaterThan(0);
  });
});
```

## Publishing

### NPM Package

1. **Build your plugin**:
   ```bash
   bun run build
   ```

2. **Test your plugin**:
   ```bash
   bun test
   ```

3. **Publish to NPM**:
   ```bash
   npm publish
   ```

### Local Development

1. **Create symlink**:
   ```bash
   cd my-fhirpath-plugin
   npm link
   
   cd ../fhirpath-lsp
   npm link my-fhirpath-plugin
   ```

2. **Configure local plugin path**:
   ```json
   {
     "fhirpath-lsp": {
       "plugins": {
         "local": {
           "paths": ["./local-plugins"]
         }
       }
     }
   }
   ```

## API Reference

### Core Interfaces

- `IPlugin` - Base plugin interface
- `IProviderPlugin` - Language feature providers
- `IAnalyzerPlugin` - Code analyzers
- `IValidatorPlugin` - Custom validators

### Plugin Context

- `PluginContext` - Runtime context provided to plugins
- `PluginConnection` - Limited LSP connection interface
- `PluginLogger` - Logging utilities

### Provider Types

- `ICodeActionProvider` - Code actions and quick fixes
- `ICompletionProvider` - Auto-completion
- `IHoverProvider` - Hover information
- `IDefinitionProvider` - Go-to-definition
- `IReferencesProvider` - Find references

### Utilities

- `AnalysisResultBuilder` - Build analysis results
- `ValidationResultBuilder` - Build validation results
- `ProviderRegistrationFactory` - Create provider registrations

## Examples

### Simple Code Action Plugin

```typescript
// package.json
{
  "name": "fhirpath-quick-fixes",
  "version": "1.0.0",
  "keywords": ["fhirpath-lsp-plugin"],
  "fhirpath-lsp": {
    "id": "fhirpath-quick-fixes",
    "capabilities": [{"type": "codeAction", "version": "1.0.0"}],
    "activationEvents": [{"type": "onLanguage", "value": "fhirpath"}]
  }
}

// src/index.ts
export class QuickFixPlugin implements IPlugin, IProviderPlugin {
  readonly metadata = {
    id: 'fhirpath-quick-fixes',
    name: 'FHIRPath Quick Fixes',
    version: '1.0.0'
  };

  readonly capabilities = [
    { type: PluginCapabilityType.CodeAction, version: '1.0.0' }
  ];

  // ... lifecycle methods ...

  getProviders() {
    return [
      ProviderRegistrationFactory.codeAction(
        new QuickFixProvider(),
        100
      )
    ];
  }
}
```

### Performance Analyzer Plugin

```typescript
export class PerformancePlugin implements IPlugin, IAnalyzerPlugin {
  readonly metadata = {
    id: 'fhirpath-performance',
    name: 'FHIRPath Performance Analyzer',
    version: '1.0.0'
  };

  readonly capabilities = [
    { type: PluginCapabilityType.Analyzer, version: '1.0.0' }
  ];

  getAnalyzers() {
    return [
      {
        id: 'performance-analyzer',
        name: 'Performance Analyzer',
        analyzer: new PerformanceAnalyzer(),
        categories: [AnalyzerCategory.Performance],
        enabledByDefault: true
      }
    ];
  }
}
```

## Best Practices

### 1. Plugin Design

- **Single Responsibility**: Each plugin should have a focused purpose
- **Loose Coupling**: Minimize dependencies between plugins
- **Error Handling**: Always handle errors gracefully
- **Performance**: Optimize for fast loading and execution

### 2. Code Quality

- **TypeScript**: Use TypeScript for type safety
- **Testing**: Write comprehensive tests
- **Documentation**: Document your plugin's API and configuration
- **Versioning**: Follow semantic versioning

### 3. Configuration

- **Sensible Defaults**: Provide good default configurations
- **Validation**: Validate configuration inputs
- **Schema**: Provide JSON schema for configuration
- **Change Handling**: React appropriately to configuration changes

### 4. Security

- **Input Validation**: Validate all inputs
- **Resource Limits**: Respect memory and CPU limits
- **API Access**: Only request necessary API permissions
- **Error Information**: Don't leak sensitive information in errors

### 5. User Experience

- **Clear Messages**: Provide clear, actionable error messages
- **Performance**: Keep operations fast and responsive
- **Consistency**: Follow LSP and plugin system conventions
- **Documentation**: Provide clear usage instructions

## Troubleshooting

### Common Issues

1. **Plugin Not Loading**:
   - Check package.json has correct `fhirpath-lsp` configuration
   - Verify plugin ID is unique
   - Check plugin is in the correct directory

2. **Configuration Not Working**:
   - Verify configuration schema is valid JSON Schema
   - Check configuration path matches schema
   - Ensure `onConfigurationChanged` is implemented

3. **Providers Not Registered**:
   - Check `getProviders()` returns correct registrations
   - Verify plugin implements `IProviderPlugin`
   - Ensure plugin is activated

4. **Performance Issues**:
   - Profile your plugin code
   - Check for memory leaks
   - Optimize expensive operations
   - Use appropriate caching

### Debugging

1. **Enable Debug Logging**:
   ```json
   {
     "fhirpath-lsp": {
       "plugins": {
         "debug": true
       }
     }
   }
   ```

2. **Check Plugin Status**:
   ```typescript
   // In plugin code
   context.logger.info('Plugin activated successfully');
   ```

3. **Validate Plugin Manifest**:
   ```bash
   npx @fhirpath-lsp/plugin-validator package.json
   ```

## Support

- **GitHub Issues**: Report bugs and feature requests
- **Documentation**: Check the official docs
- **Examples**: Look at built-in plugins for reference
- **Community**: Join the FHIRPath LSP community discussions

---

This guide covers the fundamentals of FHIRPath LSP plugin development. For more advanced topics and the latest API changes, refer to the official documentation and examples in the repository.