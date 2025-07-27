import { Connection } from 'vscode-languageserver';
import { 
  IAnalyzerPlugin, 
  AnalyzerRegistration,
  IAnalyzer,
  AnalysisContext,
  AnalysisResult,
  AnalyzerCategory
} from '../interfaces/IAnalyzerPlugin';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ParseResult } from '../../parser/FHIRPathService';

/**
 * Analyzer info with plugin metadata
 */
interface AnalyzerInfo {
  pluginId: string;
  registration: AnalyzerRegistration;
}

/**
 * Registry for managing analyzers from plugins
 */
export class AnalyzerRegistry {
  private connection: Connection;
  private analyzers: Map<string, AnalyzerInfo> = new Map();
  private analyzersByCategory: Map<AnalyzerCategory, string[]> = new Map();
  private pluginAnalyzers: Map<string, string[]> = new Map();

  constructor(connection: Connection) {
    this.connection = connection;
    this.initializeCategories();
  }

  /**
   * Register an analyzer plugin
   */
  registerPlugin(plugin: IAnalyzerPlugin): void {
    const pluginId = plugin.metadata.id;
    const analyzers = plugin.getAnalyzers();

    this.connection.console.log(`Registering ${analyzers.length} analyzers from plugin: ${pluginId}`);

    const analyzerIds: string[] = [];

    // Register each analyzer
    for (const registration of analyzers) {
      this.registerAnalyzer(pluginId, registration);
      analyzerIds.push(registration.id);
    }

    // Store analyzer IDs by plugin
    this.pluginAnalyzers.set(pluginId, analyzerIds);
  }

  /**
   * Unregister all analyzers from a plugin
   */
  unregisterPlugin(pluginId: string): void {
    const analyzerIds = this.pluginAnalyzers.get(pluginId);
    if (!analyzerIds) {
      return;
    }

    this.connection.console.log(`Unregistering analyzers from plugin: ${pluginId}`);

    // Remove each analyzer
    for (const analyzerId of analyzerIds) {
      this.unregisterAnalyzer(analyzerId);
    }

    // Remove from plugin map
    this.pluginAnalyzers.delete(pluginId);
  }

  /**
   * Get an analyzer by ID
   */
  getAnalyzer(analyzerId: string): IAnalyzer | undefined {
    return this.analyzers.get(analyzerId)?.registration.analyzer;
  }

  /**
   * Get all analyzers
   */
  getAllAnalyzers(): AnalyzerRegistration[] {
    return Array.from(this.analyzers.values())
      .map(info => info.registration)
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  /**
   * Get enabled analyzers
   */
  getEnabledAnalyzers(configuration?: any): AnalyzerRegistration[] {
    return this.getAllAnalyzers().filter(registration => {
      // Check if analyzer is explicitly disabled in configuration
      if (configuration?.analyzers?.disabled?.includes(registration.id)) {
        return false;
      }

      // Check if analyzer is enabled by default
      if (registration.enabledByDefault === false && 
          !configuration?.analyzers?.enabled?.includes(registration.id)) {
        return false;
      }

      return true;
    });
  }

  /**
   * Get analyzers by category
   */
  getAnalyzersByCategory(category: AnalyzerCategory): AnalyzerRegistration[] {
    const analyzerIds = this.analyzersByCategory.get(category) || [];
    return analyzerIds
      .map(id => this.analyzers.get(id)?.registration)
      .filter((reg): reg is AnalyzerRegistration => reg !== undefined)
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  /**
   * Run all enabled analyzers
   */
  async analyze(
    expression: string,
    parseResult: ParseResult,
    document: TextDocument,
    context?: AnalysisContext,
    configuration?: any
  ): Promise<Map<string, AnalysisResult>> {
    const results = new Map<string, AnalysisResult>();
    const analyzers = this.getEnabledAnalyzers(configuration);

    // Filter by enabled categories if specified
    const enabledCategories = context?.options?.enabledCategories;
    const filteredAnalyzers = enabledCategories
      ? analyzers.filter(a => 
          a.categories?.some(c => enabledCategories.includes(c)) ?? false
        )
      : analyzers;

    // Run analyzers in parallel
    const promises = filteredAnalyzers.map(async registration => {
      try {
        // Check if analyzer should run
        if (registration.analyzer.shouldAnalyze && 
            !registration.analyzer.shouldAnalyze(expression, document, context)) {
          return null;
        }

        // Apply timeout if specified
        const timeout = context?.options?.timeout;
        const analysisPromise = registration.analyzer.analyze(
          expression,
          parseResult,
          document,
          context
        );

        const result = timeout
          ? await this.withTimeout(analysisPromise, timeout)
          : await analysisPromise;

        return { id: registration.id, result };
      } catch (error) {
        this.connection.console.error(
          `Analyzer ${registration.id} failed: ${error}`
        );
        return null;
      }
    });

    const completedResults = await Promise.all(promises);

    // Collect results
    for (const item of completedResults) {
      if (item) {
        results.set(item.id, item.result);
      }
    }

    return results;
  }

  /**
   * Get analyzer configuration schemas
   */
  getConfigurationSchemas(): Map<string, any> {
    const schemas = new Map<string, any>();

    for (const [analyzerId, info] of this.analyzers) {
      const schema = info.registration.analyzer.getConfigurationSchema?.();
      if (schema) {
        schemas.set(analyzerId, schema);
      }
    }

    return schemas;
  }

  /**
   * Get analyzer metadata
   */
  getAnalyzerMetadata(): Array<{
    id: string;
    name: string;
    description?: string;
    categories?: AnalyzerCategory[];
    enabledByDefault?: boolean;
    pluginId: string;
  }> {
    return Array.from(this.analyzers.values()).map(info => ({
      id: info.registration.id,
      name: info.registration.name,
      description: info.registration.description,
      categories: info.registration.categories,
      enabledByDefault: info.registration.enabledByDefault,
      pluginId: info.pluginId
    }));
  }

  /**
   * Register a single analyzer
   */
  private registerAnalyzer(pluginId: string, registration: AnalyzerRegistration): void {
    // Check for duplicate ID
    if (this.analyzers.has(registration.id)) {
      this.connection.console.warn(
        `Analyzer ${registration.id} already registered, replacing with new registration from plugin ${pluginId}`
      );
    }

    // Store analyzer
    this.analyzers.set(registration.id, {
      pluginId,
      registration
    });

    // Update category index
    if (registration.categories) {
      for (const category of registration.categories) {
        const analyzerIds = this.analyzersByCategory.get(category) || [];
        if (!analyzerIds.includes(registration.id)) {
          analyzerIds.push(registration.id);
          this.analyzersByCategory.set(category, analyzerIds);
        }
      }
    }

    this.connection.console.log(
      `Registered analyzer ${registration.id} from plugin ${pluginId} with priority ${registration.priority || 0}`
    );
  }

  /**
   * Unregister an analyzer
   */
  private unregisterAnalyzer(analyzerId: string): void {
    const info = this.analyzers.get(analyzerId);
    if (!info) {
      return;
    }

    // Remove from main map
    this.analyzers.delete(analyzerId);

    // Remove from category index
    if (info.registration.categories) {
      for (const category of info.registration.categories) {
        const analyzerIds = this.analyzersByCategory.get(category);
        if (analyzerIds) {
          const index = analyzerIds.indexOf(analyzerId);
          if (index >= 0) {
            analyzerIds.splice(index, 1);
            if (analyzerIds.length === 0) {
              this.analyzersByCategory.delete(category);
            }
          }
        }
      }
    }
  }

  /**
   * Initialize category map
   */
  private initializeCategories(): void {
    for (const category of Object.values(AnalyzerCategory)) {
      this.analyzersByCategory.set(category as AnalyzerCategory, []);
    }
  }

  /**
   * Apply timeout to a promise
   */
  private async withTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error('Analysis timeout')), timeout)
      )
    ]);
  }
}