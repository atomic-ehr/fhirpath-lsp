import {
  IPlugin,
  PluginMetadata,
  PluginCapability,
  PluginCapabilityType,
  PluginContext,
  PluginState
} from '../interfaces/IPlugin';
import {
  IProviderPlugin,
  ProviderRegistration,
  ProviderRegistrationFactory
} from '../interfaces/IProviderPlugin';
import { FHIRPathFunctionRegistry } from '../../services/FHIRPathFunctionRegistry';
import { FHIRPathService } from '../../parser/FHIRPathService';
import { Connection } from 'vscode-languageserver';

// Import existing providers
import { createQuickFixProviders } from '../../providers/quickfix';
import { createSourceActionProviders } from '../../providers/sourceactions';

/**
 * Core providers plugin that wraps existing built-in providers
 */
export class CoreProvidersPlugin implements IPlugin, IProviderPlugin {
  readonly metadata: PluginMetadata = {
    id: 'fhirpath-lsp-core-providers',
    name: 'FHIRPath LSP Core Providers',
    version: '1.0.0',
    description: 'Built-in code action providers for FHIRPath LSP',
    author: 'FHIRPath LSP Team',
    license: 'MIT'
  };

  readonly capabilities: PluginCapability[] = [
    {
      type: PluginCapabilityType.CodeAction,
      version: '1.0.0',
      priority: 100
    }
  ];

  state: PluginState = PluginState.Loaded;

  private context!: PluginContext;
  private providers: ProviderRegistration[] = [];
  private functionRegistry!: FHIRPathFunctionRegistry;
  private fhirPathService!: FHIRPathService;
  private connection!: Connection;

  async initialize(context: PluginContext): Promise<void> {
    this.context = context;
    this.state = PluginState.Initialized;
    
    // TODO: Get dependencies from plugin context instead of constructor injection
    // For now, this plugin needs to be manually constructed with dependencies
    
    context.logger.info('Core providers plugin initialized');
  }

  async activate(): Promise<void> {
    try {
      // Create quick fix providers
      const quickFixProviders = createQuickFixProviders(this.functionRegistry);
      
      // Create source action providers
      const sourceActionProviders = createSourceActionProviders(
        this.connection,
        this.fhirPathService
      );

      // Convert to plugin provider registrations
      this.providers = [
        ...quickFixProviders.map(reg => 
          ProviderRegistrationFactory.codeAction(reg.provider, reg.priority)
        ),
        ...sourceActionProviders.map(reg => 
          ProviderRegistrationFactory.codeAction(reg.provider, reg.priority)
        )
      ];

      this.state = PluginState.Activated;
      this.context.logger.info(`Activated with ${this.providers.length} providers`);
    } catch (error) {
      this.state = PluginState.Failed;
      throw error;
    }
  }

  async deactivate(): Promise<void> {
    this.providers = [];
    this.state = PluginState.Deactivated;
    this.context.logger.info('Deactivated');
  }

  dispose(): void {
    this.providers = [];
    this.state = PluginState.Disposed;
  }

  getProviders(): ProviderRegistration[] {
    return this.providers;
  }

  getAPI() {
    return {
      version: this.metadata.version,
      providerCount: this.providers.length
    };
  }
}