import { IPlugin, PluginCapabilityType } from './IPlugin';
import { ICodeActionProvider } from '../../types/CodeActionTypes';
import { 
  CompletionItem, 
  CompletionList,
  CompletionParams,
  TextDocumentPositionParams,
  DefinitionParams,
  Location,
  LocationLink,
  ReferenceParams,
  DocumentSymbolParams,
  DocumentSymbol,
  SymbolInformation,
  WorkspaceSymbolParams,
  SemanticTokensParams,
  SemanticTokens,
  SemanticTokensDeltaParams,
  SemanticTokensDelta,
  InlayHintParams,
  InlayHint,
  Hover,
  TextDocument,
  Range,
  CodeActionContext
} from 'vscode-languageserver';

/**
 * Provider registration with metadata
 */
export interface ProviderRegistration {
  type: PluginCapabilityType;
  provider: any; // Specific provider interface
  priority?: number;
  selector?: DocumentSelector;
}

/**
 * Document selector for providers
 */
export interface DocumentSelector {
  language?: string;
  scheme?: string;
  pattern?: string;
}

/**
 * Completion provider interface
 */
export interface ICompletionProvider {
  provideCompletionItems(params: CompletionParams): Promise<CompletionItem[] | CompletionList | null>;
  resolveCompletionItem?(item: CompletionItem): Promise<CompletionItem>;
}

/**
 * Hover provider interface
 */
export interface IHoverProvider {
  provideHover(params: TextDocumentPositionParams): Promise<Hover | null>;
}

/**
 * Definition provider interface
 */
export interface IDefinitionProvider {
  provideDefinition(params: DefinitionParams): Promise<Location | Location[] | LocationLink[] | null>;
}

/**
 * References provider interface
 */
export interface IReferencesProvider {
  provideReferences(params: ReferenceParams): Promise<Location[] | null>;
}

/**
 * Document symbol provider interface
 */
export interface IDocumentSymbolProvider {
  provideDocumentSymbols(params: DocumentSymbolParams): Promise<DocumentSymbol[] | SymbolInformation[] | null>;
}

/**
 * Workspace symbol provider interface
 */
export interface IWorkspaceSymbolProvider {
  provideWorkspaceSymbols(params: WorkspaceSymbolParams): Promise<SymbolInformation[] | null>;
}

/**
 * Semantic tokens provider interface
 */
export interface ISemanticTokensProvider {
  provideSemanticTokens(params: SemanticTokensParams): Promise<SemanticTokens | null>;
  provideSemanticTokensDelta?(params: SemanticTokensDeltaParams): Promise<SemanticTokens | SemanticTokensDelta | null>;
}

/**
 * Inlay hint provider interface
 */
export interface IInlayHintProvider {
  provideInlayHints(params: InlayHintParams): Promise<InlayHint[] | null>;
  resolveInlayHint?(hint: InlayHint): Promise<InlayHint>;
}

/**
 * Plugin that provides language features
 */
export interface IProviderPlugin extends IPlugin {
  /**
   * Register providers when plugin is activated
   */
  getProviders(): ProviderRegistration[];
}

/**
 * Type guards for provider plugins
 */
export function isProviderPlugin(plugin: IPlugin): plugin is IProviderPlugin {
  return 'getProviders' in plugin;
}

/**
 * Factory functions for creating provider registrations
 */
export class ProviderRegistrationFactory {
  static codeAction(
    provider: ICodeActionProvider,
    priority: number = 0,
    selector?: DocumentSelector
  ): ProviderRegistration {
    return {
      type: PluginCapabilityType.CodeAction,
      provider,
      priority,
      selector
    };
  }

  static completion(
    provider: ICompletionProvider,
    priority: number = 0,
    selector?: DocumentSelector
  ): ProviderRegistration {
    return {
      type: PluginCapabilityType.Completion,
      provider,
      priority,
      selector
    };
  }

  static hover(
    provider: IHoverProvider,
    priority: number = 0,
    selector?: DocumentSelector
  ): ProviderRegistration {
    return {
      type: PluginCapabilityType.Hover,
      provider,
      priority,
      selector
    };
  }

  static definition(
    provider: IDefinitionProvider,
    priority: number = 0,
    selector?: DocumentSelector
  ): ProviderRegistration {
    return {
      type: PluginCapabilityType.Definition,
      provider,
      priority,
      selector
    };
  }

  static references(
    provider: IReferencesProvider,
    priority: number = 0,
    selector?: DocumentSelector
  ): ProviderRegistration {
    return {
      type: PluginCapabilityType.References,
      provider,
      priority,
      selector
    };
  }

  static documentSymbol(
    provider: IDocumentSymbolProvider,
    priority: number = 0,
    selector?: DocumentSelector
  ): ProviderRegistration {
    return {
      type: PluginCapabilityType.DocumentSymbol,
      provider,
      priority,
      selector
    };
  }

  static workspaceSymbol(
    provider: IWorkspaceSymbolProvider,
    priority: number = 0,
    selector?: DocumentSelector
  ): ProviderRegistration {
    return {
      type: PluginCapabilityType.WorkspaceSymbol,
      provider,
      priority,
      selector
    };
  }

  static semanticTokens(
    provider: ISemanticTokensProvider,
    priority: number = 0,
    selector?: DocumentSelector
  ): ProviderRegistration {
    return {
      type: PluginCapabilityType.SemanticTokens,
      provider,
      priority,
      selector
    };
  }

  static inlayHint(
    provider: IInlayHintProvider,
    priority: number = 0,
    selector?: DocumentSelector
  ): ProviderRegistration {
    return {
      type: PluginCapabilityType.InlayHint,
      provider,
      priority,
      selector
    };
  }
}