import { ProviderRegistry } from '../registry/ProviderRegistry';
import { 
  IProviderPlugin, 
  ProviderRegistration,
  ProviderRegistrationFactory,
  ICodeActionProvider
} from '../interfaces/IProviderPlugin';
import { PluginCapabilityType, PluginMetadata, PluginCapability } from '../interfaces/IPlugin';
import { Connection } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

// Mock connection
const mockConnection = {
  console: {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn()
  }
} as unknown as Connection;

// Mock code action provider
const mockCodeActionProvider: ICodeActionProvider = {
  provideCodeActions: jest.fn().mockResolvedValue([]),
  resolveCodeAction: jest.fn().mockResolvedValue(undefined)
};

// Mock provider plugin
class MockProviderPlugin implements IProviderPlugin {
  readonly metadata: PluginMetadata = {
    id: 'test-provider-plugin',
    name: 'Test Provider Plugin',
    version: '1.0.0'
  };

  readonly capabilities: PluginCapability[] = [
    { type: PluginCapabilityType.CodeAction, version: '1.0.0' }
  ];

  state = 'activated' as any;

  async initialize(): Promise<void> {}
  async activate(): Promise<void> {}
  async deactivate(): Promise<void> {}
  dispose(): void {}

  getProviders(): ProviderRegistration[] {
    return [
      ProviderRegistrationFactory.codeAction(mockCodeActionProvider, 100, {
        language: 'fhirpath'
      })
    ];
  }
}

describe('ProviderRegistry', () => {
  let registry: ProviderRegistry;
  let mockPlugin: MockProviderPlugin;

  beforeEach(() => {
    jest.clearAllMocks();
    registry = new ProviderRegistry(mockConnection);
    mockPlugin = new MockProviderPlugin();
  });

  describe('Plugin Registration', () => {
    it('should register provider plugin successfully', () => {
      registry.registerPlugin(mockPlugin);

      const codeActionProviders = registry.getCodeActionProviders();
      expect(codeActionProviders).toHaveLength(1);
      expect(codeActionProviders[0]).toBe(mockCodeActionProvider);
    });

    it('should handle multiple plugins', () => {
      const plugin2 = new MockProviderPlugin();
      plugin2.metadata.id = 'test-provider-plugin-2';

      registry.registerPlugin(mockPlugin);
      registry.registerPlugin(plugin2);

      const codeActionProviders = registry.getCodeActionProviders();
      expect(codeActionProviders).toHaveLength(2);
    });

    it('should sort providers by priority', () => {
      const highPriorityProvider = {
        provideCodeActions: jest.fn().mockResolvedValue([])
      };

      const lowPriorityProvider = {
        provideCodeActions: jest.fn().mockResolvedValue([])
      };

      // Register low priority first
      const plugin1 = new MockProviderPlugin();
      plugin1.getProviders = () => [
        ProviderRegistrationFactory.codeAction(lowPriorityProvider, 50)
      ];

      // Register high priority second
      const plugin2 = new MockProviderPlugin();
      plugin2.metadata.id = 'high-priority-plugin';
      plugin2.getProviders = () => [
        ProviderRegistrationFactory.codeAction(highPriorityProvider, 150)
      ];

      registry.registerPlugin(plugin1);
      registry.registerPlugin(plugin2);

      const providers = registry.getCodeActionProviders();
      expect(providers[0]).toBe(highPriorityProvider); // Higher priority first
      expect(providers[1]).toBe(lowPriorityProvider);
    });
  });

  describe('Plugin Unregistration', () => {
    it('should unregister plugin successfully', () => {
      registry.registerPlugin(mockPlugin);
      expect(registry.getCodeActionProviders()).toHaveLength(1);

      registry.unregisterPlugin(mockPlugin.metadata.id);
      expect(registry.getCodeActionProviders()).toHaveLength(0);
    });

    it('should handle unregistering non-existent plugin', () => {
      registry.unregisterPlugin('non-existent-plugin');
      // Should not throw
      expect(registry.getCodeActionProviders()).toHaveLength(0);
    });
  });

  describe('Document Selector Matching', () => {
    let mockDocument: TextDocument;

    beforeEach(() => {
      mockDocument = {
        uri: 'file:///test.fhirpath',
        languageId: 'fhirpath',
        version: 1,
        getText: jest.fn().mockReturnValue('test content'),
        lineCount: 1
      } as any;
    });

    it('should match providers by language', () => {
      registry.registerPlugin(mockPlugin);

      const providers = registry.getProvidersForDocument(
        PluginCapabilityType.CodeAction,
        mockDocument
      );

      expect(providers).toHaveLength(1);
    });

    it('should filter out non-matching providers', () => {
      const plugin = new MockProviderPlugin();
      plugin.getProviders = () => [
        ProviderRegistrationFactory.codeAction(mockCodeActionProvider, 100, {
          language: 'typescript' // Different language
        })
      ];

      registry.registerPlugin(plugin);

      const providers = registry.getProvidersForDocument(
        PluginCapabilityType.CodeAction,
        mockDocument
      );

      expect(providers).toHaveLength(0);
    });

    it('should match providers with no selector (matches all)', () => {
      const plugin = new MockProviderPlugin();
      plugin.getProviders = () => [
        ProviderRegistrationFactory.codeAction(mockCodeActionProvider, 100)
        // No selector = matches all
      ];

      registry.registerPlugin(plugin);

      const providers = registry.getProvidersForDocument(
        PluginCapabilityType.CodeAction,
        mockDocument
      );

      expect(providers).toHaveLength(1);
    });

    it('should match providers by URI scheme', () => {
      const plugin = new MockProviderPlugin();
      plugin.getProviders = () => [
        ProviderRegistrationFactory.codeAction(mockCodeActionProvider, 100, {
          scheme: 'file'
        })
      ];

      registry.registerPlugin(plugin);

      const providers = registry.getProvidersForDocument(
        PluginCapabilityType.CodeAction,
        mockDocument
      );

      expect(providers).toHaveLength(1);
    });

    it('should match providers by pattern', () => {
      const plugin = new MockProviderPlugin();
      plugin.getProviders = () => [
        ProviderRegistrationFactory.codeAction(mockCodeActionProvider, 100, {
          pattern: '**/*.fhirpath'
        })
      ];

      registry.registerPlugin(plugin);

      const providers = registry.getProvidersForDocument(
        PluginCapabilityType.CodeAction,
        mockDocument
      );

      expect(providers).toHaveLength(1);
    });
  });

  describe('Provider Type Support', () => {
    it('should support all provider types', () => {
      const mockProviders = {
        codeAction: { provideCodeActions: jest.fn() },
        completion: { provideCompletionItems: jest.fn() },
        hover: { provideHover: jest.fn() },
        definition: { provideDefinition: jest.fn() },
        references: { provideReferences: jest.fn() },
        documentSymbol: { provideDocumentSymbols: jest.fn() },
        workspaceSymbol: { provideWorkspaceSymbols: jest.fn() },
        semanticTokens: { provideSemanticTokens: jest.fn() },
        inlayHint: { provideInlayHints: jest.fn() }
      };

      const plugin = new MockProviderPlugin();
      plugin.getProviders = () => [
        ProviderRegistrationFactory.codeAction(mockProviders.codeAction, 100),
        ProviderRegistrationFactory.completion(mockProviders.completion, 100),
        ProviderRegistrationFactory.hover(mockProviders.hover, 100),
        ProviderRegistrationFactory.definition(mockProviders.definition, 100),
        ProviderRegistrationFactory.references(mockProviders.references, 100),
        ProviderRegistrationFactory.documentSymbol(mockProviders.documentSymbol, 100),
        ProviderRegistrationFactory.workspaceSymbol(mockProviders.workspaceSymbol, 100),
        ProviderRegistrationFactory.semanticTokens(mockProviders.semanticTokens, 100),
        ProviderRegistrationFactory.inlayHint(mockProviders.inlayHint, 100)
      ];

      registry.registerPlugin(plugin);

      expect(registry.getCodeActionProviders()).toHaveLength(1);
      expect(registry.getCompletionProviders()).toHaveLength(1);
      expect(registry.getHoverProviders()).toHaveLength(1);
      expect(registry.getDefinitionProviders()).toHaveLength(1);
      expect(registry.getReferencesProviders()).toHaveLength(1);
      expect(registry.getDocumentSymbolProviders()).toHaveLength(1);
      expect(registry.getWorkspaceSymbolProviders()).toHaveLength(1);
      expect(registry.getSemanticTokensProviders()).toHaveLength(1);
      expect(registry.getInlayHintProviders()).toHaveLength(1);
    });
  });

  describe('Registry Statistics', () => {
    it('should provide accurate provider counts', () => {
      expect(registry.getTotalProviderCount()).toBe(0);

      registry.registerPlugin(mockPlugin);
      expect(registry.getTotalProviderCount()).toBe(1);
      expect(registry.getProviderCount(PluginCapabilityType.CodeAction)).toBe(1);
      expect(registry.getProviderCount(PluginCapabilityType.Completion)).toBe(0);
    });

    it('should track registered types', () => {
      registry.registerPlugin(mockPlugin);

      const registeredTypes = registry.getRegisteredTypes();
      expect(registeredTypes).toContain(PluginCapabilityType.CodeAction);
      expect(registeredTypes).not.toContain(PluginCapabilityType.Completion);
    });
  });

  describe('Error Handling', () => {
    it('should handle plugin with no providers gracefully', () => {
      const emptyPlugin = new MockProviderPlugin();
      emptyPlugin.getProviders = () => [];

      registry.registerPlugin(emptyPlugin);
      expect(registry.getCodeActionProviders()).toHaveLength(0);
    });

    it('should handle plugin with invalid providers gracefully', () => {
      const invalidPlugin = new MockProviderPlugin();
      invalidPlugin.getProviders = () => [
        {
          type: 'invalid-type' as any,
          provider: {},
          priority: 100
        }
      ];

      // Should not throw
      registry.registerPlugin(invalidPlugin);
    });
  });
});