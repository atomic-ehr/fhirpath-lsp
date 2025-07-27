import { PluginManifest, PluginCapabilityType } from '../interfaces/IPlugin';

/**
 * Plugin validator for ensuring plugin safety and correctness
 */
export class PluginValidator {
  private requiredCapabilityVersions: Map<PluginCapabilityType, string> = new Map([
    [PluginCapabilityType.CodeAction, '1.0.0'],
    [PluginCapabilityType.Completion, '1.0.0'],
    [PluginCapabilityType.Diagnostic, '1.0.0'],
    [PluginCapabilityType.Hover, '1.0.0'],
    [PluginCapabilityType.Definition, '1.0.0'],
    [PluginCapabilityType.References, '1.0.0'],
    [PluginCapabilityType.DocumentSymbol, '1.0.0'],
    [PluginCapabilityType.WorkspaceSymbol, '1.0.0'],
    [PluginCapabilityType.SemanticTokens, '1.0.0'],
    [PluginCapabilityType.InlayHint, '1.0.0'],
    [PluginCapabilityType.Analyzer, '1.0.0'],
    [PluginCapabilityType.Validator, '1.0.0'],
    [PluginCapabilityType.Formatter, '1.0.0'],
    [PluginCapabilityType.Refactoring, '1.0.0']
  ]);

  /**
   * Validate a plugin manifest
   */
  async validate(manifest: PluginManifest): Promise<boolean> {
    try {
      // Validate required fields
      if (!this.validateRequiredFields(manifest)) {
        return false;
      }

      // Validate version format
      if (!this.validateVersion(manifest.version)) {
        return false;
      }

      // Validate capabilities
      if (!this.validateCapabilities(manifest)) {
        return false;
      }

      // Validate main entry point
      if (!this.validateMainEntry(manifest)) {
        return false;
      }

      // Validate dependencies
      if (!this.validateDependencies(manifest)) {
        return false;
      }

      // Validate activation events
      if (!this.validateActivationEvents(manifest)) {
        return false;
      }

      // Validate configuration schema
      if (!this.validateConfigurationSchema(manifest)) {
        return false;
      }

      return true;
    } catch (error) {
      console.error(`Plugin validation failed: ${error}`);
      return false;
    }
  }

  /**
   * Validate required fields
   */
  private validateRequiredFields(manifest: PluginManifest): boolean {
    if (!manifest.id || typeof manifest.id !== 'string') {
      console.error('Plugin manifest missing required field: id');
      return false;
    }

    if (!manifest.name || typeof manifest.name !== 'string') {
      console.error('Plugin manifest missing required field: name');
      return false;
    }

    if (!manifest.version || typeof manifest.version !== 'string') {
      console.error('Plugin manifest missing required field: version');
      return false;
    }

    if (!manifest.main || typeof manifest.main !== 'string') {
      console.error('Plugin manifest missing required field: main');
      return false;
    }

    if (!manifest.capabilities || !Array.isArray(manifest.capabilities)) {
      console.error('Plugin manifest missing required field: capabilities');
      return false;
    }

    // Validate plugin ID format (alphanumeric with hyphens)
    if (!/^[a-zA-Z0-9-]+$/.test(manifest.id)) {
      console.error('Plugin ID must be alphanumeric with hyphens only');
      return false;
    }

    return true;
  }

  /**
   * Validate version format (simple semver check)
   */
  private validateVersion(version: string): boolean {
    const semverRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/;
    if (!semverRegex.test(version)) {
      console.error(`Invalid version format: ${version}`);
      return false;
    }
    return true;
  }

  /**
   * Validate capabilities
   */
  private validateCapabilities(manifest: PluginManifest): boolean {
    if (manifest.capabilities.length === 0) {
      console.error('Plugin must declare at least one capability');
      return false;
    }

    for (const capability of manifest.capabilities) {
      // Validate capability type
      if (!Object.values(PluginCapabilityType).includes(capability.type)) {
        console.error(`Invalid capability type: ${capability.type}`);
        return false;
      }

      // Validate capability version
      if (!capability.version || !this.validateVersion(capability.version)) {
        console.error(`Invalid capability version for ${capability.type}`);
        return false;
      }

      // Check version compatibility
      const requiredVersion = this.requiredCapabilityVersions.get(capability.type);
      if (requiredVersion && !this.isVersionCompatible(capability.version, requiredVersion)) {
        console.error(`Capability ${capability.type} version ${capability.version} is not compatible with required version ${requiredVersion}`);
        return false;
      }
    }

    return true;
  }

  /**
   * Validate main entry point
   */
  private validateMainEntry(manifest: PluginManifest): boolean {
    // Check if main file has valid extension
    const validExtensions = ['.js', '.ts', '.mjs', '.cjs'];
    const ext = manifest.main.substring(manifest.main.lastIndexOf('.'));
    
    if (!validExtensions.includes(ext)) {
      console.error(`Invalid main entry extension: ${ext}`);
      return false;
    }

    return true;
  }

  /**
   * Validate dependencies
   */
  private validateDependencies(manifest: PluginManifest): boolean {
    if (!manifest.dependencies) {
      return true;
    }

    for (const dep of manifest.dependencies) {
      if (!dep.id || typeof dep.id !== 'string') {
        console.error('Dependency missing required field: id');
        return false;
      }

      if (!dep.version || !this.validateVersion(dep.version)) {
        console.error(`Invalid dependency version for ${dep.id}`);
        return false;
      }
    }

    return true;
  }

  /**
   * Validate activation events
   */
  private validateActivationEvents(manifest: PluginManifest): boolean {
    if (!manifest.activationEvents || manifest.activationEvents.length === 0) {
      // Default to * if not specified
      return true;
    }

    const validEventTypes = ['onLanguage', 'onCommand', 'onStartup', 'onFilePattern', '*'];

    for (const event of manifest.activationEvents) {
      if (!validEventTypes.includes(event.type)) {
        console.error(`Invalid activation event type: ${event.type}`);
        return false;
      }

      // Validate event value based on type
      switch (event.type) {
        case 'onLanguage':
        case 'onCommand':
        case 'onFilePattern':
          if (!event.value) {
            console.error(`Activation event ${event.type} requires a value`);
            return false;
          }
          break;
      }
    }

    return true;
  }

  /**
   * Validate configuration schema
   */
  private validateConfigurationSchema(manifest: PluginManifest): boolean {
    if (!manifest.configurationSchema) {
      return true;
    }

    // Basic JSON Schema validation
    if (manifest.configurationSchema.type !== 'object') {
      console.error('Configuration schema must be of type object');
      return false;
    }

    if (!manifest.configurationSchema.properties || 
        typeof manifest.configurationSchema.properties !== 'object') {
      console.error('Configuration schema must have properties');
      return false;
    }

    return true;
  }

  /**
   * Check if a version is compatible with required version
   */
  private isVersionCompatible(provided: string, required: string): boolean {
    // Simple major version compatibility check
    const providedMajor = parseInt(provided.split('.')[0]);
    const requiredMajor = parseInt(required.split('.')[0]);
    
    return providedMajor === requiredMajor;
  }

  /**
   * Validate plugin runtime safety
   */
  async validateRuntime(pluginPath: string): Promise<boolean> {
    // TODO: Implement runtime validation
    // - Check for dangerous operations
    // - Validate file system access patterns
    // - Check for network access
    // - Validate resource usage
    return true;
  }
}