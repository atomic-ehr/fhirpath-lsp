import { Connection } from 'vscode-languageserver';
import * as path from 'path';
import * as fs from 'fs/promises';
import { IPlugin, PluginManifest, PluginState } from '../interfaces/IPlugin';

/**
 * Plugin loader responsible for discovering and loading plugins
 */
export class PluginLoader {
  private connection: Connection;
  private cache: Map<string, IPlugin> = new Map();

  constructor(connection: Connection) {
    this.connection = connection;
  }

  /**
   * Discover plugins in a directory
   */
  async discoverPlugins(directory: string): Promise<PluginManifest[]> {
    const manifests: PluginManifest[] = [];

    try {
      // Check if directory exists first
      try {
        await fs.access(directory);
      } catch (error) {
        this.connection.console.log(`Plugin directory ${directory} does not exist, skipping discovery`);
        return manifests;
      }

      const entries = await fs.readdir(directory, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const pluginDir = path.join(directory, entry.name);
          const manifestPath = path.join(pluginDir, 'package.json');

          try {
            const manifestContent = await fs.readFile(manifestPath, 'utf-8');
            const packageJson = JSON.parse(manifestContent);

            // Check if it's a FHIRPath LSP plugin
            if (this.isValidPluginManifest(packageJson)) {
              const manifest = this.extractManifest(packageJson, pluginDir);
              manifests.push(manifest);
              this.connection.console.log(`Discovered plugin: ${manifest.id} v${manifest.version}`);
            }
          } catch (error) {
            // Not a valid plugin directory, skip
          }
        } else if (entry.name === 'package.json') {
          // Check if the directory itself is a plugin
          const manifestPath = path.join(directory, entry.name);

          try {
            const manifestContent = await fs.readFile(manifestPath, 'utf-8');
            const packageJson = JSON.parse(manifestContent);

            if (this.isValidPluginManifest(packageJson)) {
              const manifest = this.extractManifest(packageJson, directory);
              manifests.push(manifest);
              this.connection.console.log(`Discovered plugin: ${manifest.id} v${manifest.version}`);
            }
          } catch (error) {
            this.connection.console.error(`Failed to read manifest: ${error}`);
          }
        }
      }
    } catch (error) {
      this.connection.console.error(`Failed to discover plugins in ${directory}: ${error}`);
    }

    return manifests;
  }

  /**
   * Load a plugin from path
   */
  async load(pluginPath: string): Promise<IPlugin> {
    // Check cache first
    if (this.cache.has(pluginPath)) {
      return this.cache.get(pluginPath)!;
    }

    try {
      this.connection.console.log(`Loading plugin from: ${pluginPath}`);

      // Clear require cache for hot-reloading support
      delete require.cache[require.resolve(pluginPath)];

      // Load the plugin module
      const module = require(pluginPath);

      // Get the plugin instance
      let plugin: IPlugin;

      if (module.default) {
        // ES6 default export
        if (typeof module.default === 'function') {
          plugin = new module.default();
        } else {
          plugin = module.default;
        }
      } else if (module.Plugin) {
        // Named export
        if (typeof module.Plugin === 'function') {
          plugin = new module.Plugin();
        } else {
          plugin = module.Plugin;
        }
      } else if (typeof module === 'function') {
        // Direct function export
        plugin = new module();
      } else {
        throw new Error('Invalid plugin module: no valid export found');
      }

      // Validate plugin interface
      if (!this.isValidPlugin(plugin)) {
        throw new Error('Invalid plugin: missing required methods');
      }

      // Set initial state
      (plugin as any).state = PluginState.Loaded;

      // Cache the plugin
      this.cache.set(pluginPath, plugin);

      return plugin;
    } catch (error) {
      this.connection.console.error(`Failed to load plugin from ${pluginPath}: ${error}`);
      throw error;
    }
  }

  /**
   * Unload a plugin
   */
  unload(pluginPath: string): void {
    this.cache.delete(pluginPath);
    delete require.cache[require.resolve(pluginPath)];
  }

  /**
   * Clear all cached plugins
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Check if package.json represents a valid plugin manifest
   */
  private isValidPluginManifest(packageJson: any): boolean {
    // Check for required fields
    if (!packageJson.name || !packageJson.version) {
      return false;
    }

    // Check for FHIRPath LSP plugin marker
    if (packageJson.keywords?.includes('fhirpath-lsp-plugin')) {
      return true;
    }

    // Check for plugin capabilities in package.json
    if (packageJson['fhirpath-lsp']) {
      return true;
    }

    // Check for contribution points
    if (packageJson.contributes?.['fhirpath-lsp']) {
      return true;
    }

    return false;
  }

  /**
   * Extract plugin manifest from package.json
   */
  private extractManifest(packageJson: any, directory: string): PluginManifest {
    const pluginConfig = packageJson['fhirpath-lsp'] || {};

    return {
      id: pluginConfig.id || packageJson.name,
      name: pluginConfig.name || packageJson.displayName || packageJson.name,
      version: packageJson.version,
      description: packageJson.description,
      author: packageJson.author,
      homepage: packageJson.homepage,
      repository: typeof packageJson.repository === 'string' 
        ? packageJson.repository 
        : packageJson.repository?.url,
      license: packageJson.license,
      keywords: packageJson.keywords,
      engines: {
        'fhirpath-lsp': pluginConfig.minVersion,
        node: packageJson.engines?.node
      },
      main: this.resolveMain(packageJson.main || 'index.js', directory),
      dependencies: pluginConfig.dependencies || [],
      capabilities: pluginConfig.capabilities || [],
      activationEvents: pluginConfig.activationEvents || [{ type: '*' }],
      configurationSchema: pluginConfig.configurationSchema,
      contributes: {
        ...packageJson.contributes,
        ...pluginConfig.contributes
      }
    };
  }

  /**
   * Resolve main entry point
   */
  private resolveMain(main: string, directory: string): string {
    // If main is already an absolute path, return it
    if (path.isAbsolute(main)) {
      return main;
    }

    // Otherwise, resolve relative to plugin directory
    return path.resolve(directory, main);
  }

  /**
   * Validate plugin interface
   */
  private isValidPlugin(plugin: any): plugin is IPlugin {
    return (
      plugin &&
      typeof plugin === 'object' &&
      'metadata' in plugin &&
      'capabilities' in plugin &&
      typeof plugin.initialize === 'function' &&
      typeof plugin.activate === 'function' &&
      typeof plugin.deactivate === 'function' &&
      typeof plugin.dispose === 'function'
    );
  }
}