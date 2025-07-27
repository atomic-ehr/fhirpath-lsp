# FHIRPath LSP Plugin API Reference

Quick reference for the FHIRPath LSP Plugin API.

## Core Interfaces

### IPlugin

Base interface that all plugins must implement.

```typescript
interface IPlugin {
  readonly metadata: PluginMetadata;
  readonly capabilities: PluginCapability[];
  readonly dependencies?: PluginDependency[];
  readonly configurationSchema?: PluginConfigurationSchema;
  readonly state: PluginState;

  initialize(context: PluginContext): Promise<void>;
  activate(): Promise<void>;
  deactivate(): Promise<void>;
  dispose(): void;
  onConfigurationChanged?(configuration: any): void;
  getAPI?(): any;
}
```

### Plugin Types

```typescript
// Provider Plugin
interface IProviderPlugin extends IPlugin {
  getProviders(): ProviderRegistration[];
}

// Analyzer Plugin  
interface IAnalyzerPlugin extends IPlugin {
  getAnalyzers(): AnalyzerRegistration[];
}

// Validator Plugin
interface IValidatorPlugin extends IPlugin {
  getValidators(): ValidatorRegistration[];
}
```

## Plugin Metadata

```typescript
interface PluginMetadata {
  id: string;                    // Unique plugin identifier
  name: string;                  // Human-readable name
  version: string;               // Semantic version
  description?: string;          // Plugin description
  author?: string | AuthorInfo;  // Plugin author
  homepage?: string;             // Plugin homepage URL
  repository?: string;           // Repository URL
  license?: string;              // License identifier
  keywords?: string[];           // Search keywords
  engines?: {                    // Engine requirements
    'fhirpath-lsp'?: string;
    node?: string;
  };
}
```

## Plugin Capabilities

```typescript
enum PluginCapabilityType {
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

interface PluginCapability {
  type: PluginCapabilityType;
  version: string;
  priority?: number;
}
```

## Plugin Context

```typescript
interface PluginContext {
  metadata: PluginMetadata;
  connection: PluginConnection;
  storagePath: string;
  configuration: any;
  logger: PluginLogger;
  extensionContext: PluginExtensionContext;
}

interface PluginConnection {
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

interface PluginLogger {
  log(level: 'error' | 'warn' | 'info' | 'debug', message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  debug(message: string, ...args: any[]): void;
}
```

## Provider Interfaces

### Code Action Provider

```typescript
interface ICodeActionProvider {
  provideCodeActions(
    document: TextDocument,
    range: Range,
    context: CodeActionContext
  ): CodeAction[] | Promise<CodeAction[]>;
  
  resolveCodeAction?(action: CodeAction): CodeAction | Promise<CodeAction>;
}
```

### Completion Provider

```typescript
interface ICompletionProvider {
  provideCompletionItems(
    params: CompletionParams
  ): Promise<CompletionItem[] | CompletionList | null>;
  
  resolveCompletionItem?(item: CompletionItem): Promise<CompletionItem>;
}
```

### Hover Provider

```typescript
interface IHoverProvider {
  provideHover(params: TextDocumentPositionParams): Promise<Hover | null>;
}
```

### Definition Provider

```typescript
interface IDefinitionProvider {
  provideDefinition(
    params: DefinitionParams
  ): Promise<Location | Location[] | LocationLink[] | null>;
}
```

## Analyzer Interface

```typescript
interface IAnalyzer {
  analyze(
    expression: string,
    parseResult: ParseResult,
    document: TextDocument,
    context?: AnalysisContext
  ): Promise<AnalysisResult>;
  
  shouldAnalyze?(
    expression: string,
    document: TextDocument,
    context?: AnalysisContext
  ): boolean;
  
  getConfigurationSchema?(): any;
}

interface AnalysisResult {
  diagnostics?: Diagnostic[];
  metrics?: Record<string, number>;
  suggestions?: AnalysisSuggestion[];
  metadata?: Record<string, any>;
}

enum AnalyzerCategory {
  Performance = 'performance',
  Security = 'security',
  Style = 'style',
  Complexity = 'complexity',
  Correctness = 'correctness',
  Compatibility = 'compatibility',
  BestPractices = 'bestPractices'
}
```

## Validator Interface

```typescript
interface IValidator {
  validate(
    expression: string,
    parseResult: ParseResult,
    document: TextDocument,
    context?: ValidationContext
  ): Promise<ValidationResult>;
  
  shouldValidate?(
    expression: string,
    document: TextDocument,
    context?: ValidationContext
  ): boolean;
  
  getConfigurationSchema?(): any;
  toDiagnostics?(result: ValidationResult, document: TextDocument): Diagnostic[];
}

interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];
  warnings?: ValidationWarning[];
  info?: ValidationInfo[];
  metadata?: Record<string, any>;
}

enum ValidatorCategory {
  Syntax = 'syntax',
  Semantic = 'semantic',
  FHIR = 'fhir',
  Custom = 'custom',
  Security = 'security',
  Performance = 'performance'
}
```

## Factory Functions

### Provider Registration Factory

```typescript
class ProviderRegistrationFactory {
  static codeAction(
    provider: ICodeActionProvider,
    priority: number = 0,
    selector?: DocumentSelector
  ): ProviderRegistration;
  
  static completion(
    provider: ICompletionProvider,
    priority: number = 0,
    selector?: DocumentSelector
  ): ProviderRegistration;
  
  static hover(
    provider: IHoverProvider,
    priority: number = 0,
    selector?: DocumentSelector
  ): ProviderRegistration;
  
  // ... other provider types
}
```

### Builder Classes

```typescript
class AnalysisResultBuilder {
  static create(): AnalysisResultBuilder;
  
  addDiagnostic(diagnostic: Diagnostic): AnalysisResultBuilder;
  addMetric(name: string, value: number): AnalysisResultBuilder;
  addSuggestion(suggestion: AnalysisSuggestion): AnalysisResultBuilder;
  addMetadata(key: string, value: any): AnalysisResultBuilder;
  
  build(): AnalysisResult;
}

class ValidationResultBuilder {
  static create(): ValidationResultBuilder;
  
  addError(error: Omit<ValidationError, 'severity'>): ValidationResultBuilder;
  addWarning(warning: Omit<ValidationWarning, 'severity'>): ValidationResultBuilder;
  addInfo(info: Omit<ValidationInfo, 'severity'>): ValidationResultBuilder;
  addMetadata(key: string, value: any): ValidationResultBuilder;
  setValid(valid: boolean): ValidationResultBuilder;
  
  build(): ValidationResult;
}
```

## Plugin Manifest (package.json)

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "main": "dist/index.js",
  "keywords": ["fhirpath-lsp-plugin"],
  "fhirpath-lsp": {
    "id": "my-plugin",
    "name": "My Plugin",
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
          "default": true
        }
      }
    }
  }
}
```

## Plugin States

```typescript
enum PluginState {
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
```

## Activation Events

```typescript
interface PluginActivationEvent {
  type: 'onLanguage' | 'onCommand' | 'onStartup' | 'onFilePattern' | '*';
  value?: string | string[];
}
```

## Configuration Schema

```typescript
interface PluginConfigurationSchema {
  type: 'object';
  properties: Record<string, any>;
  required?: string[];
  additionalProperties?: boolean;
}
```

## Quick Start Template

```typescript
import { 
  IPlugin, 
  IProviderPlugin, 
  PluginMetadata, 
  PluginCapability,
  PluginCapabilityType,
  PluginState,
  PluginContext,
  ProviderRegistration,
  ProviderRegistrationFactory
} from '@fhirpath-lsp/plugin-api';

export class MyPlugin implements IPlugin, IProviderPlugin {
  readonly metadata: PluginMetadata = {
    id: 'my-plugin',
    name: 'My Plugin',
    version: '1.0.0',
    description: 'My awesome FHIRPath plugin'
  };

  readonly capabilities: PluginCapability[] = [
    { type: PluginCapabilityType.CodeAction, version: '1.0.0' }
  ];

  state: PluginState = PluginState.Loaded;
  private context!: PluginContext;

  async initialize(context: PluginContext): Promise<void> {
    this.context = context;
    this.state = PluginState.Initialized;
    context.logger.info('Plugin initialized');
  }

  async activate(): Promise<void> {
    this.state = PluginState.Activated;
    this.context.logger.info('Plugin activated');
  }

  async deactivate(): Promise<void> {
    this.state = PluginState.Deactivated;
  }

  dispose(): void {
    this.state = PluginState.Disposed;
  }

  getProviders(): ProviderRegistration[] {
    return [
      ProviderRegistrationFactory.codeAction(
        new MyCodeActionProvider(),
        100 // priority
      )
    ];
  }

  onConfigurationChanged(configuration: any): void {
    // React to configuration changes
  }

  getAPI() {
    return {
      version: this.metadata.version,
      // Expose public API
    };
  }
}

// Export plugin instance
export default new MyPlugin();
```

## Error Handling

```typescript
// In provider methods
try {
  // Provider logic
  return result;
} catch (error) {
  this.context.logger.error('Provider error:', error);
  return []; // Return empty result on error
}

// In lifecycle methods  
async activate(): Promise<void> {
  try {
    // Activation logic
    this.state = PluginState.Activated;
  } catch (error) {
    this.state = PluginState.Failed;
    throw error; // Let plugin manager handle the error
  }
}
```

## Best Practices

1. **Always implement error handling**
2. **Use the provided logger for debugging**
3. **Respect the plugin lifecycle**
4. **Validate configuration inputs**
5. **Keep operations fast and async where possible**
6. **Use TypeScript for better development experience**
7. **Provide meaningful error messages**
8. **Test your plugin thoroughly**

For complete examples and advanced usage, see the [Plugin Development Guide](./plugin-development-guide.md).