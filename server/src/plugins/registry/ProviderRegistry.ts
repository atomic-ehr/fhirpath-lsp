import { Connection } from 'vscode-languageserver';
import { 
  IProviderPlugin, 
  ProviderRegistration, 
  DocumentSelector,
  ICompletionProvider,
  IHoverProvider,
  IDefinitionProvider,
  IReferencesProvider,
  IDocumentSymbolProvider,
  IWorkspaceSymbolProvider,
  ISemanticTokensProvider,
  IInlayHintProvider
} from '../interfaces/IProviderPlugin';
import { PluginCapabilityType } from '../interfaces/IPlugin';
import { ICodeActionProvider } from '../../types/CodeActionTypes';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Provider info with plugin metadata
 */
interface ProviderInfo {
  pluginId: string;
  registration: ProviderRegistration;
}

/**
 * Registry for managing language feature providers from plugins
 */
export class ProviderRegistry {
  private connection: Connection;
  private providers: Map<PluginCapabilityType, ProviderInfo[]> = new Map();
  private pluginProviders: Map<string, ProviderRegistration[]> = new Map();

  constructor(connection: Connection) {
    this.connection = connection;
    this.initializeProviderTypes();
  }

  /**
   * Register a provider plugin
   */
  registerPlugin(plugin: IProviderPlugin): void {
    const pluginId = plugin.metadata.id;
    const providers = plugin.getProviders();

    this.connection.console.log(`Registering ${providers.length} providers from plugin: ${pluginId}`);

    // Store providers by plugin ID
    this.pluginProviders.set(pluginId, providers);

    // Register each provider
    for (const registration of providers) {
      this.registerProvider(pluginId, registration);
    }
  }

  /**
   * Unregister all providers from a plugin
   */
  unregisterPlugin(pluginId: string): void {
    const providers = this.pluginProviders.get(pluginId);
    if (!providers) {
      return;
    }

    this.connection.console.log(`Unregistering providers from plugin: ${pluginId}`);

    // Remove each provider
    for (const registration of providers) {
      this.unregisterProvider(pluginId, registration.type);
    }

    // Remove from plugin map
    this.pluginProviders.delete(pluginId);
  }

  /**
   * Get providers of a specific type
   */
  getProviders<T>(type: PluginCapabilityType): T[] {
    const providerInfos = this.providers.get(type) || [];
    return providerInfos
      .sort((a, b) => (b.registration.priority || 0) - (a.registration.priority || 0))
      .map(info => info.registration.provider as T);
  }

  /**
   * Get providers that match a document
   */
  getProvidersForDocument<T>(
    type: PluginCapabilityType,
    document: TextDocument
  ): T[] {
    const providerInfos = this.providers.get(type) || [];
    
    return providerInfos
      .filter(info => this.matchesDocument(info.registration.selector, document))
      .sort((a, b) => (b.registration.priority || 0) - (a.registration.priority || 0))
      .map(info => info.registration.provider as T);
  }

  /**
   * Get code action providers
   */
  getCodeActionProviders(document?: TextDocument): ICodeActionProvider[] {
    return document
      ? this.getProvidersForDocument(PluginCapabilityType.CodeAction, document)
      : this.getProviders(PluginCapabilityType.CodeAction);
  }

  /**
   * Get completion providers
   */
  getCompletionProviders(document?: TextDocument): ICompletionProvider[] {
    return document
      ? this.getProvidersForDocument(PluginCapabilityType.Completion, document)
      : this.getProviders(PluginCapabilityType.Completion);
  }

  /**
   * Get hover providers
   */
  getHoverProviders(document?: TextDocument): IHoverProvider[] {
    return document
      ? this.getProvidersForDocument(PluginCapabilityType.Hover, document)
      : this.getProviders(PluginCapabilityType.Hover);
  }

  /**
   * Get definition providers
   */
  getDefinitionProviders(document?: TextDocument): IDefinitionProvider[] {
    return document
      ? this.getProvidersForDocument(PluginCapabilityType.Definition, document)
      : this.getProviders(PluginCapabilityType.Definition);
  }

  /**
   * Get references providers
   */
  getReferencesProviders(document?: TextDocument): IReferencesProvider[] {
    return document
      ? this.getProvidersForDocument(PluginCapabilityType.References, document)
      : this.getProviders(PluginCapabilityType.References);
  }

  /**
   * Get document symbol providers
   */
  getDocumentSymbolProviders(document?: TextDocument): IDocumentSymbolProvider[] {
    return document
      ? this.getProvidersForDocument(PluginCapabilityType.DocumentSymbol, document)
      : this.getProviders(PluginCapabilityType.DocumentSymbol);
  }

  /**
   * Get workspace symbol providers
   */
  getWorkspaceSymbolProviders(): IWorkspaceSymbolProvider[] {
    return this.getProviders(PluginCapabilityType.WorkspaceSymbol);
  }

  /**
   * Get semantic tokens providers
   */
  getSemanticTokensProviders(document?: TextDocument): ISemanticTokensProvider[] {
    return document
      ? this.getProvidersForDocument(PluginCapabilityType.SemanticTokens, document)
      : this.getProviders(PluginCapabilityType.SemanticTokens);
  }

  /**
   * Get inlay hint providers
   */
  getInlayHintProviders(document?: TextDocument): IInlayHintProvider[] {
    return document
      ? this.getProvidersForDocument(PluginCapabilityType.InlayHint, document)
      : this.getProviders(PluginCapabilityType.InlayHint);
  }

  /**
   * Get all registered provider types
   */
  getRegisteredTypes(): PluginCapabilityType[] {
    const types: PluginCapabilityType[] = [];
    for (const [type, providers] of this.providers) {
      if (providers.length > 0) {
        types.push(type);
      }
    }
    return types;
  }

  /**
   * Get provider count by type
   */
  getProviderCount(type: PluginCapabilityType): number {
    return (this.providers.get(type) || []).length;
  }

  /**
   * Get total provider count
   */
  getTotalProviderCount(): number {
    let count = 0;
    for (const providers of this.providers.values()) {
      count += providers.length;
    }
    return count;
  }

  /**
   * Register a single provider
   */
  private registerProvider(pluginId: string, registration: ProviderRegistration): void {
    const providers = this.providers.get(registration.type) || [];
    
    providers.push({
      pluginId,
      registration
    });

    this.providers.set(registration.type, providers);

    this.connection.console.log(
      `Registered ${registration.type} provider from plugin ${pluginId} with priority ${registration.priority || 0}`
    );
  }

  /**
   * Unregister a provider
   */
  private unregisterProvider(pluginId: string, type: PluginCapabilityType): void {
    const providers = this.providers.get(type);
    if (!providers) {
      return;
    }

    const filtered = providers.filter(info => info.pluginId !== pluginId);
    if (filtered.length === 0) {
      this.providers.delete(type);
    } else {
      this.providers.set(type, filtered);
    }
  }

  /**
   * Check if a document matches a selector
   */
  private matchesDocument(selector: DocumentSelector | undefined, document: TextDocument): boolean {
    if (!selector) {
      return true; // No selector means matches all
    }

    // Check language ID
    if (selector.language && document.languageId !== selector.language) {
      return false;
    }

    // Check URI scheme
    if (selector.scheme && !document.uri.startsWith(selector.scheme + ':')) {
      return false;
    }

    // Check pattern
    if (selector.pattern) {
      // Simple glob pattern matching
      const pattern = new RegExp(
        selector.pattern
          .replace(/\*\*/g, '.*')
          .replace(/\*/g, '[^/]*')
          .replace(/\?/g, '.')
      );
      if (!pattern.test(document.uri)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Initialize provider type map
   */
  private initializeProviderTypes(): void {
    // Initialize empty arrays for each provider type
    for (const type of Object.values(PluginCapabilityType)) {
      if (this.isProviderType(type)) {
        this.providers.set(type, []);
      }
    }
  }

  /**
   * Check if a capability type is a provider type
   */
  private isProviderType(type: PluginCapabilityType): boolean {
    const providerTypes = [
      PluginCapabilityType.CodeAction,
      PluginCapabilityType.Completion,
      PluginCapabilityType.Hover,
      PluginCapabilityType.Definition,
      PluginCapabilityType.References,
      PluginCapabilityType.DocumentSymbol,
      PluginCapabilityType.WorkspaceSymbol,
      PluginCapabilityType.SemanticTokens,
      PluginCapabilityType.InlayHint,
      PluginCapabilityType.Formatter,
      PluginCapabilityType.Refactoring
    ];
    return providerTypes.includes(type);
  }
}