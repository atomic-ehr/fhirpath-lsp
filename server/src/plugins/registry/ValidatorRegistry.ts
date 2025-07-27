import { Connection, Diagnostic } from 'vscode-languageserver';
import { 
  IValidatorPlugin, 
  ValidatorRegistration,
  IValidator,
  ValidationContext,
  ValidationResult,
  ValidatorCategory,
  ValidationTrigger,
  validationResultToDiagnostics
} from '../interfaces/IValidatorPlugin';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ParseResult } from '../../parser/FHIRPathService';

/**
 * Validator info with plugin metadata
 */
interface ValidatorInfo {
  pluginId: string;
  registration: ValidatorRegistration;
}

/**
 * Registry for managing validators from plugins
 */
export class ValidatorRegistry {
  private connection: Connection;
  private validators: Map<string, ValidatorInfo> = new Map();
  private validatorsByCategory: Map<ValidatorCategory, string[]> = new Map();
  private validatorsByTrigger: Map<ValidationTrigger, string[]> = new Map();
  private pluginValidators: Map<string, string[]> = new Map();

  constructor(connection: Connection) {
    this.connection = connection;
    this.initializeMaps();
  }

  /**
   * Register a validator plugin
   */
  registerPlugin(plugin: IValidatorPlugin): void {
    const pluginId = plugin.metadata.id;
    const validators = plugin.getValidators();

    this.connection.console.log(`Registering ${validators.length} validators from plugin: ${pluginId}`);

    const validatorIds: string[] = [];

    // Register each validator
    for (const registration of validators) {
      this.registerValidator(pluginId, registration);
      validatorIds.push(registration.id);
    }

    // Store validator IDs by plugin
    this.pluginValidators.set(pluginId, validatorIds);
  }

  /**
   * Unregister all validators from a plugin
   */
  unregisterPlugin(pluginId: string): void {
    const validatorIds = this.pluginValidators.get(pluginId);
    if (!validatorIds) {
      return;
    }

    this.connection.console.log(`Unregistering validators from plugin: ${pluginId}`);

    // Remove each validator
    for (const validatorId of validatorIds) {
      this.unregisterValidator(validatorId);
    }

    // Remove from plugin map
    this.pluginValidators.delete(pluginId);
  }

  /**
   * Get a validator by ID
   */
  getValidator(validatorId: string): IValidator | undefined {
    return this.validators.get(validatorId)?.registration.validator;
  }

  /**
   * Get all validators
   */
  getAllValidators(): ValidatorRegistration[] {
    return Array.from(this.validators.values())
      .map(info => info.registration)
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  /**
   * Get enabled validators
   */
  getEnabledValidators(configuration?: any): ValidatorRegistration[] {
    return this.getAllValidators().filter(registration => {
      // Check if validator is explicitly disabled in configuration
      if (configuration?.validators?.disabled?.includes(registration.id)) {
        return false;
      }

      // Check if validator is enabled by default
      if (registration.enabledByDefault === false && 
          !configuration?.validators?.enabled?.includes(registration.id)) {
        return false;
      }

      return true;
    });
  }

  /**
   * Get validators by category
   */
  getValidatorsByCategory(category: ValidatorCategory): ValidatorRegistration[] {
    const validatorIds = this.validatorsByCategory.get(category) || [];
    return validatorIds
      .map(id => this.validators.get(id)?.registration)
      .filter((reg): reg is ValidatorRegistration => reg !== undefined)
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  /**
   * Get validators by trigger
   */
  getValidatorsByTrigger(trigger: ValidationTrigger): ValidatorRegistration[] {
    const validatorIds = this.validatorsByTrigger.get(trigger) || [];
    return validatorIds
      .map(id => this.validators.get(id)?.registration)
      .filter((reg): reg is ValidatorRegistration => reg !== undefined)
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  /**
   * Validate expression using all enabled validators
   */
  async validate(
    expression: string,
    parseResult: ParseResult,
    document: TextDocument,
    trigger: ValidationTrigger,
    context?: ValidationContext,
    configuration?: any
  ): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];
    
    // Get validators for this trigger
    const triggeredValidators = this.getValidatorsByTrigger(trigger);
    const enabledValidators = this.getEnabledValidators(configuration);
    
    // Filter to only enabled validators that match the trigger
    const validators = triggeredValidators.filter(v => 
      enabledValidators.some(e => e.id === v.id)
    );

    // Filter by enabled categories if specified
    const enabledCategories = context?.options?.enabledCategories;
    const filteredValidators = enabledCategories
      ? validators.filter(v => 
          v.categories?.some(c => enabledCategories.includes(c)) ?? false
        )
      : validators;

    // Run validators in parallel
    const promises = filteredValidators.map(async registration => {
      try {
        // Check if validator should run
        if (registration.validator.shouldValidate && 
            !registration.validator.shouldValidate(expression, document, context)) {
          return null;
        }

        // Apply timeout if specified
        const timeout = context?.options?.timeout;
        const validationPromise = registration.validator.validate(
          expression,
          parseResult,
          document,
          context
        );

        const result = timeout
          ? await this.withTimeout(validationPromise, timeout)
          : await validationPromise;

        // Convert to diagnostics
        if (registration.validator.toDiagnostics) {
          return registration.validator.toDiagnostics(result, document);
        } else {
          return validationResultToDiagnostics(result, document, registration.id);
        }
      } catch (error) {
        this.connection.console.error(
          `Validator ${registration.id} failed: ${error}`
        );
        return null;
      }
    });

    const results = await Promise.all(promises);

    // Collect diagnostics
    for (const result of results) {
      if (result) {
        diagnostics.push(...result);
      }
    }

    return diagnostics;
  }

  /**
   * Validate with specific validators
   */
  async validateWithValidators(
    validatorIds: string[],
    expression: string,
    parseResult: ParseResult,
    document: TextDocument,
    context?: ValidationContext
  ): Promise<Map<string, ValidationResult>> {
    const results = new Map<string, ValidationResult>();

    const promises = validatorIds.map(async validatorId => {
      const info = this.validators.get(validatorId);
      if (!info) {
        return null;
      }

      try {
        const result = await info.registration.validator.validate(
          expression,
          parseResult,
          document,
          context
        );
        return { id: validatorId, result };
      } catch (error) {
        this.connection.console.error(
          `Validator ${validatorId} failed: ${error}`
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
   * Get validator configuration schemas
   */
  getConfigurationSchemas(): Map<string, any> {
    const schemas = new Map<string, any>();

    for (const [validatorId, info] of this.validators) {
      const schema = info.registration.validator.getConfigurationSchema?.();
      if (schema) {
        schemas.set(validatorId, schema);
      }
    }

    return schemas;
  }

  /**
   * Get validator metadata
   */
  getValidatorMetadata(): Array<{
    id: string;
    name: string;
    description?: string;
    categories?: ValidatorCategory[];
    triggers?: ValidationTrigger[];
    enabledByDefault?: boolean;
    pluginId: string;
  }> {
    return Array.from(this.validators.values()).map(info => ({
      id: info.registration.id,
      name: info.registration.name,
      description: info.registration.description,
      categories: info.registration.categories,
      triggers: info.registration.triggers,
      enabledByDefault: info.registration.enabledByDefault,
      pluginId: info.pluginId
    }));
  }

  /**
   * Register a single validator
   */
  private registerValidator(pluginId: string, registration: ValidatorRegistration): void {
    // Check for duplicate ID
    if (this.validators.has(registration.id)) {
      this.connection.console.warn(
        `Validator ${registration.id} already registered, replacing with new registration from plugin ${pluginId}`
      );
    }

    // Store validator
    this.validators.set(registration.id, {
      pluginId,
      registration
    });

    // Update category index
    if (registration.categories) {
      for (const category of registration.categories) {
        const validatorIds = this.validatorsByCategory.get(category) || [];
        if (!validatorIds.includes(registration.id)) {
          validatorIds.push(registration.id);
          this.validatorsByCategory.set(category, validatorIds);
        }
      }
    }

    // Update trigger index
    const triggers = registration.triggers || [ValidationTrigger.OnType];
    for (const trigger of triggers) {
      const validatorIds = this.validatorsByTrigger.get(trigger) || [];
      if (!validatorIds.includes(registration.id)) {
        validatorIds.push(registration.id);
        this.validatorsByTrigger.set(trigger, validatorIds);
      }
    }

    this.connection.console.log(
      `Registered validator ${registration.id} from plugin ${pluginId} with priority ${registration.priority || 0}`
    );
  }

  /**
   * Unregister a validator
   */
  private unregisterValidator(validatorId: string): void {
    const info = this.validators.get(validatorId);
    if (!info) {
      return;
    }

    // Remove from main map
    this.validators.delete(validatorId);

    // Remove from category index
    if (info.registration.categories) {
      for (const category of info.registration.categories) {
        const validatorIds = this.validatorsByCategory.get(category);
        if (validatorIds) {
          const index = validatorIds.indexOf(validatorId);
          if (index >= 0) {
            validatorIds.splice(index, 1);
            if (validatorIds.length === 0) {
              this.validatorsByCategory.delete(category);
            }
          }
        }
      }
    }

    // Remove from trigger index
    const triggers = info.registration.triggers || [ValidationTrigger.OnType];
    for (const trigger of triggers) {
      const validatorIds = this.validatorsByTrigger.get(trigger);
      if (validatorIds) {
        const index = validatorIds.indexOf(validatorId);
        if (index >= 0) {
          validatorIds.splice(index, 1);
          if (validatorIds.length === 0) {
            this.validatorsByTrigger.delete(trigger);
          }
        }
      }
    }
  }

  /**
   * Initialize maps
   */
  private initializeMaps(): void {
    // Initialize category map
    for (const category of Object.values(ValidatorCategory)) {
      this.validatorsByCategory.set(category as ValidatorCategory, []);
    }

    // Initialize trigger map
    for (const trigger of Object.values(ValidationTrigger)) {
      this.validatorsByTrigger.set(trigger as ValidationTrigger, []);
    }
  }

  /**
   * Apply timeout to a promise
   */
  private async withTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error('Validation timeout')), timeout)
      )
    ]);
  }
}