import {
  CodeAction,
  CodeActionContext,
  Range,
  Connection,
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

import {
  ICodeActionProvider,
  CodeActionRegistration,
  FHIRPathCodeAction,
  FHIRPathCodeActionContext,
  FHIRPathCodeActionKind,
} from '../types/CodeActionTypes';

import { FHIRPathService } from '../parser/FHIRPathService';
import { FHIRPathFunctionRegistry } from '../services/FHIRPathFunctionRegistry';
import { createQuickFixProviders } from './quickfix';
import { createSourceActionProviders } from './sourceactions';

/**
 * Main code action provider that coordinates all code actions for FHIRPath
 */
export class CodeActionProvider implements ICodeActionProvider {
  private registrations: Map<string, CodeActionRegistration[]> = new Map();
  private connection: Connection;
  private fhirPathService: FHIRPathService;
  private functionRegistry: FHIRPathFunctionRegistry;

  constructor(
    connection: Connection,
    fhirPathService: FHIRPathService,
    functionRegistry: FHIRPathFunctionRegistry
  ) {
    this.connection = connection;
    this.fhirPathService = fhirPathService;
    this.functionRegistry = functionRegistry;
    this.initializeDefaultProviders();
  }

  /**
   * Register a code action provider for specific action kinds
   */
  register(registration: CodeActionRegistration): void {
    for (const kind of registration.kinds) {
      if (!this.registrations.has(kind)) {
        this.registrations.set(kind, []);
      }
      this.registrations.get(kind)!.push(registration);

      // Sort by priority (highest first)
      this.registrations.get(kind)!.sort((a, b) => b.priority - a.priority);
    }

    this.connection.console.log(
      `Registered code action provider for kinds: ${registration.kinds.join(', ')}`
    );
  }

  /**
   * Unregister a code action provider
   */
  unregister(provider: ICodeActionProvider): void {
    for (const [kind, registrations] of this.registrations.entries()) {
      const index = registrations.findIndex(reg => reg.provider === provider);
      if (index !== -1) {
        registrations.splice(index, 1);
        if (registrations.length === 0) {
          this.registrations.delete(kind);
        }
      }
    }
  }

  /**
   * Provide code actions for the given document and range
   */
  async provideCodeActions(
    document: TextDocument,
    range: Range,
    context: CodeActionContext
  ): Promise<CodeAction[]> {
    try {
      this.connection.console.log(`Code actions requested for ${document.uri}, range: ${JSON.stringify(range)}, diagnostics: ${context.diagnostics?.length || 0}`);

      const enhancedContext = await this.enhanceContext(document, range, context);
      const actions: FHIRPathCodeAction[] = [];

      // Get requested action kinds (default to all if none specified)
      const requestedKinds = context.only || [
        FHIRPathCodeActionKind.QuickFix,
        FHIRPathCodeActionKind.Refactor,
        FHIRPathCodeActionKind.Source,
      ];

      // Collect actions from all registered providers
      for (const requestedKind of requestedKinds) {
        const providersForKind = this.getProvidersForKind(requestedKind);

        for (const registration of providersForKind) {
          try {
            const providerActions = await registration.provider.provideCodeActions(
              document,
              range,
              enhancedContext
            );

            if (Array.isArray(providerActions)) {
              actions.push(...providerActions.map(action => ({
                ...action,
                priority: (action as FHIRPathCodeAction).priority ?? registration.priority,
              }) as FHIRPathCodeAction));
            }
          } catch (error) {
            this.connection.console.error(
              `Error from code action provider: ${error}`
            );
          }
        }
      }

      // Sort actions by priority and filter
      return this.sortAndFilterActions(actions, context);
    } catch (error) {
      this.connection.console.error(`Error providing code actions: ${error}`);
      return [];
    }
  }

  /**
   * Resolve additional information for a code action
   */
  async resolveCodeAction(action: CodeAction): Promise<CodeAction> {
    // Find the provider that created this action
    const kind = action.kind || '';
    const providers = this.getProvidersForKind(kind);

    for (const registration of providers) {
      if (registration.provider.resolveCodeAction) {
        try {
          const resolved = await registration.provider.resolveCodeAction(action);
          if (resolved) {
            return resolved;
          }
        } catch (error) {
          this.connection.console.error(
            `Error resolving code action: ${error}`
          );
        }
      }
    }

    return action;
  }

  /**
   * Get all supported code action kinds
   */
  getSupportedKinds(): string[] {
    const kinds = Array.from(this.registrations.keys());

    // Add base kinds that VS Code expects
    const baseKinds = [
      FHIRPathCodeActionKind.QuickFix,
      FHIRPathCodeActionKind.Refactor,
      FHIRPathCodeActionKind.Source
    ];

    const allKinds = [...new Set([...baseKinds, ...kinds])];

    this.connection.console.log(`Supported code action kinds: ${allKinds.join(', ')}`);
    return allKinds;
  }

  /**
   * Get providers for a specific action kind (including parent kinds)
   */
  private getProvidersForKind(kind: string): CodeActionRegistration[] {
    const providers: CodeActionRegistration[] = [];
    const seenProviders = new Set<any>(); // Track providers to avoid duplicates

    // Get exact matches
    const exactMatch = this.registrations.get(kind);
    if (exactMatch) {
      for (const registration of exactMatch) {
        if (!seenProviders.has(registration.provider)) {
          providers.push(registration);
          seenProviders.add(registration.provider);
        }
      }
    }

    // Get parent kind matches (e.g., "quickfix" matches "quickfix.function")
    for (const [registeredKind, registrations] of this.registrations.entries()) {
      if (kind.startsWith(registeredKind + '.') || registeredKind.startsWith(kind + '.')) {
        for (const registration of registrations) {
          if (!seenProviders.has(registration.provider)) {
            providers.push(registration);
            seenProviders.add(registration.provider);
          }
        }
      }
    }

    return providers;
  }

  /**
   * Enhance the code action context with FHIRPath-specific information
   */
  private async enhanceContext(
    document: TextDocument,
    range: Range,
    context: CodeActionContext
  ): Promise<FHIRPathCodeActionContext> {
    const enhancedContext: FHIRPathCodeActionContext = {
      ...context,
    };

    try {
      // Get the text in the range or current line
      const text = document.getText(range);
      enhancedContext.expression = text;

      // Try to parse the expression for AST information
      try {
        const parseResult = this.fhirPathService.parse(text);
        enhancedContext.parseInfo = parseResult;
      } catch (parseError) {
        // Parse error is expected for invalid expressions
        this.connection.console.log(`Parse error for context (expected): ${parseError}`);
      }

      // Extract FHIR context from document
      const documentText = document.getText();
      enhancedContext.fhirContext = this.extractFHIRContext(documentText);

    } catch (error) {
      this.connection.console.error(`Error enhancing context: ${error}`);
    }

    return enhancedContext;
  }

  /**
   * Extract FHIR context information from document
   */
  private extractFHIRContext(documentText: string): { resourceType?: string; version?: string } {
    const context: { resourceType?: string; version?: string } = {};

    // Look for context comments like: // @context Patient test/data.json
    const contextMatch = documentText.match(/\/\/\s*@context\s+(\w+)/);
    if (contextMatch) {
      context.resourceType = contextMatch[1];
    }

    // Look for FHIR version hints
    const versionMatch = documentText.match(/\/\/\s*@fhir\s+(R[45]|[45]\.\d+)/i);
    if (versionMatch) {
      context.version = versionMatch[1];
    }

    return context;
  }

  /**
   * Sort and filter actions based on context
   */
  private sortAndFilterActions(
    actions: FHIRPathCodeAction[],
    context: CodeActionContext
  ): FHIRPathCodeAction[] {
    // Filter out actions that don't apply to the diagnostics
    let filteredActions = actions;

    if (context.diagnostics && context.diagnostics.length > 0) {
      const diagnosticCodes = new Set(
        context.diagnostics.map(d => d.code?.toString())
      );

      filteredActions = actions.filter(action => {
        if (!action.diagnostics || action.diagnostics.length === 0) {
          return true; // Source actions without specific diagnostics
        }

        return action.diagnostics.some(d =>
          diagnosticCodes.has(d.code?.toString() || '')
        );
      });
    }

    // Remove duplicates based on title and kind
    const seenActions = new Map<string, FHIRPathCodeAction>();
    const deduplicatedActions: FHIRPathCodeAction[] = [];
    
    for (const action of filteredActions) {
      const key = `${action.kind}_${action.title}`;
      const existing = seenActions.get(key);
      
      if (!existing) {
        // First time seeing this action
        seenActions.set(key, action);
        deduplicatedActions.push(action);
      } else {
        // Keep the action with higher priority
        const actionPriority = action.priority || 0;
        const existingPriority = existing.priority || 0;
        
        if (actionPriority > existingPriority) {
          // Replace with higher priority action
          const index = deduplicatedActions.indexOf(existing);
          if (index >= 0) {
            deduplicatedActions[index] = action;
            seenActions.set(key, action);
          }
        }
      }
    }

    // Sort by priority (highest first), then by preference, then alphabetically
    deduplicatedActions.sort((a, b) => {
      // Priority
      const priorityA = a.priority || 0;
      const priorityB = b.priority || 0;
      if (priorityA !== priorityB) {
        return priorityB - priorityA;
      }

      // Preference
      const preferredA = a.isPreferred ? 1 : 0;
      const preferredB = b.isPreferred ? 1 : 0;
      if (preferredA !== preferredB) {
        return preferredB - preferredA;
      }

      // Alphabetical
      return a.title.localeCompare(b.title);
    });

    return deduplicatedActions;
  }

  /**
   * Initialize default code action providers
   */
  private initializeDefaultProviders(): void {
    try {
      // Register quick fix providers
      const quickFixProviders = createQuickFixProviders(this.functionRegistry);

      this.connection.console.log(`Creating ${quickFixProviders.length} quick fix providers`);

      for (const registration of quickFixProviders) {
        this.connection.console.log(`Registering provider with kinds: ${registration.kinds.join(', ')}`);
        this.register(registration);
      }

      // Register source action providers
      const sourceActionProviders = createSourceActionProviders(this.connection, this.fhirPathService);

      this.connection.console.log(`Creating ${sourceActionProviders.length} source action providers`);

      for (const registration of sourceActionProviders) {
        this.connection.console.log(`Registering source provider with kinds: ${registration.kinds.join(', ')}`);
        this.register(registration);
      }

      const supportedKinds = this.getSupportedKinds();
      this.connection.console.log(`Code action provider initialized with ${quickFixProviders.length + sourceActionProviders.length} providers (${quickFixProviders.length} quick fix + ${sourceActionProviders.length} source actions)`);
      this.connection.console.log(`Supported kinds: ${supportedKinds.join(', ')}`);
    } catch (error) {
      this.connection.console.error(`Error initializing code action providers: ${error}`);
    }
  }
}
