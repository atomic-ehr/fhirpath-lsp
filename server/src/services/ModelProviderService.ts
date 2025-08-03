import type {
  ModelTypeProvider,
  TypeInfo,
  FHIRModelProviderConfig
} from '@atomic-ehr/fhirpath';
import { getLogger } from '../logging/index.js';

const logger = getLogger('ModelProviderService');

/**
 * Enhanced type information with LSP-specific features
 */
export interface EnhancedTypeInfo {
  type: TypeInfo;
  hierarchy: TypeInfo[];
  choiceTypes: TypeInfo[];
  constraints: ConstraintInfo;
  terminology: TerminologyBinding;
}

/**
 * Result of property path navigation
 */
export interface NavigationResult {
  isValid: boolean;
  finalType: TypeInfo | undefined;
  navigationPath: TypeInfo[];
  availableProperties: string[];
  errors: string[];
}

/**
 * FHIR constraint information
 */
export interface ConstraintInfo {
  cardinality: string;
  required: boolean;
  fixed?: any;
  pattern?: any;
  minLength?: number;
  maxLength?: number;
}

/**
 * Terminology binding information
 */
export interface TerminologyBinding {
  strength: 'required' | 'extensible' | 'preferred' | 'example';
  valueSet?: string;
  description?: string;
}

/**
 * Choice type context information
 */
export interface ChoiceContext {
  baseProperty: string;
  resourceType: string;
  choiceTypes: TypeInfo[];
  availableChoices: string[];
}

/**
 * Choice property validation result
 */
export interface ChoiceValidationResult {
  isValid: boolean;
  error?: string;
  validChoices?: string[];
  suggestedProperty?: string;
}

/**
 * Service initialization options
 */
export interface ModelProviderServiceOptions {
  enableLogging?: boolean;
  enableHealthChecks?: boolean;
  retryAttempts?: number;
  timeoutMs?: number;
}

/**
 * Foundation service class that wraps and enhances ModelProvider functionality
 * with LSP-specific features and error handling.
 */
export class ModelProviderService {
  private initialized = false;
  private options: Required<ModelProviderServiceOptions>;
  private typeCache = new Map<string, EnhancedTypeInfo>();
  private readonly cacheExpiryMs = 30 * 60 * 1000; // 30 minutes

  constructor(
    private modelProvider: ModelTypeProvider,
    options: ModelProviderServiceOptions = {}
  ) {
    this.options = {
      enableLogging: true,
      enableHealthChecks: true,
      retryAttempts: 3,
      timeoutMs: 5000,
      ...options
    };

    if (this.options.enableLogging) {
      logger.info('ModelProviderService created', { 
        operation: 'constructor',
        options: this.options 
      });
    }
  }

  /**
   * Initialize the service and validate ModelProvider functionality
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      if (this.options.enableLogging) {
        logger.warn('ModelProviderService already initialized', { operation: 'initialize' });
      }
      return;
    }

    try {
      if (this.options.enableLogging) {
        logger.info('Initializing ModelProviderService...', { operation: 'initialize' });
      }

      // Validate ModelProvider is functional
      const isValid = await this.validateModelProvider();
      if (!isValid) {
        throw new Error('ModelProvider validation failed');
      }

      this.initialized = true;

      if (this.options.enableLogging) {
        logger.info('✅ ModelProviderService initialized successfully', { operation: 'initialize' });
      }
    } catch (error) {
      this.handleError(error as Error, 'initialize');
      throw error;
    }
  }

  /**
   * Get enhanced type information for a given type name
   */
  async getEnhancedTypeInfo(typeName: string): Promise<EnhancedTypeInfo | undefined> {
    if (!this.initialized) {
      throw new Error('ModelProviderService not initialized. Call initialize() first.');
    }

    // Check cache first
    const cached = this.getCachedEnhancedType(typeName);
    if (cached) {
      if (this.options.enableLogging) {
        logger.debug('Retrieved enhanced type info from cache', { 
          operation: 'getEnhancedTypeInfo',
          typeName 
        });
      }
      return cached;
    }

    try {
      if (this.options.enableLogging) {
        logger.debug('Getting enhanced type info', { 
          operation: 'getEnhancedTypeInfo',
          typeName 
        });
      }

      const typeInfo = await this.modelProvider.getType(typeName);
      if (!typeInfo) {
        if (this.options.enableLogging) {
          logger.warn('Type not found', { 
            operation: 'getEnhancedTypeInfo',
            typeName 
          });
        }
        return undefined;
      }

      // Build enhanced type information with comprehensive metadata extraction
      const enhanced: EnhancedTypeInfo = {
        type: typeInfo,
        hierarchy: await this.buildTypeHierarchy(typeInfo),
        choiceTypes: await this.resolveChoiceTypes(typeInfo),
        constraints: this.extractConstraints(typeInfo),
        terminology: this.extractTerminologyBinding(typeInfo)
      };

      // Cache the enhanced type info
      this.setCachedEnhancedType(typeName, enhanced);

      if (this.options.enableLogging) {
        logger.debug('Enhanced type info created with full metadata', { 
          operation: 'getEnhancedTypeInfo',
          typeName,
          hierarchyCount: enhanced.hierarchy.length,
          choiceTypesCount: enhanced.choiceTypes.length,
          hasConstraints: !!enhanced.constraints.cardinality,
          hasTerminology: !!enhanced.terminology.valueSet
        });
      }

      return enhanced;
    } catch (error) {
      this.handleError(error as Error, 'getEnhancedTypeInfo');
      return undefined;
    }
  }

  /**
   * Navigate a property path and return detailed navigation result
   */
  async navigatePropertyPath(rootType: string, path: string[]): Promise<NavigationResult> {
    if (!this.initialized) {
      throw new Error('ModelProviderService not initialized. Call initialize() first.');
    }

    const result: NavigationResult = {
      isValid: false,
      finalType: undefined,
      navigationPath: [],
      availableProperties: [],
      errors: []
    };

    try {
      if (this.options.enableLogging) {
        logger.debug('Navigating property path', { 
          operation: 'navigatePropertyPath',
          rootType,
          path,
          pathLength: path.length
        });
      }

      // Get the root type info
      const rootTypeInfo = await this.modelProvider.getType(rootType);
      if (!rootTypeInfo) {
        result.errors.push(`Root type '${rootType}' not found`);
        return result;
      }

      let currentType = rootTypeInfo;
      result.navigationPath.push(currentType);

      // If path is empty, return root type info
      if (path.length === 0) {
        result.isValid = true;
        result.finalType = currentType;
        result.availableProperties = await this.getAvailableProperties(currentType);
        return result;
      }

      // Navigate through each step in the path
      for (let i = 0; i < path.length; i++) {
        const propertyName = path[i];
        const navigationStep = await this.navigatePropertyStep(
          currentType, 
          propertyName, 
          path.slice(0, i + 1)
        );

        if (!navigationStep.isValid) {
          result.errors.push(...navigationStep.errors);
          // Provide available properties at the current level for suggestions
          result.availableProperties = await this.getAvailableProperties(currentType);
          return result;
        }

        currentType = navigationStep.targetType!;
        result.navigationPath.push(currentType);
      }

      // Navigation successful
      result.isValid = true;
      result.finalType = currentType;
      result.availableProperties = await this.getAvailableProperties(currentType);

      if (this.options.enableLogging) {
        logger.debug('Property path navigation completed', {
          operation: 'navigatePropertyPath',
          rootType,
          path,
          finalType: result.finalType?.name,
          navigationSteps: result.navigationPath.length,
          availablePropertiesCount: result.availableProperties.length
        });
      }

      return result;
    } catch (error) {
      this.handleError(error as Error, 'navigatePropertyPath');
      result.errors.push((error as Error).message);
      return result;
    }
  }

  /**
   * Resolve choice types for union types, with comprehensive FHIR choice handling
   */
  async resolveChoiceTypes(typeInfo: TypeInfo, targetType?: string): Promise<TypeInfo[]> {
    if (!this.initialized) {
      throw new Error('ModelProviderService not initialized. Call initialize() first.');
    }

    try {
      if (this.options.enableLogging) {
        logger.debug('Resolving choice types', { 
          operation: 'resolveChoiceTypes',
          typeName: typeInfo.name,
          targetType,
          isUnion: (typeInfo as any).modelContext?.isUnion
        });
      }

      // If not a union/choice type, return the original type
      const modelContext = (typeInfo as any).modelContext;
      if (!modelContext?.isUnion && !typeInfo.name?.includes('[x]') && !typeInfo.name?.includes('Choice')) {
        return [typeInfo];
      }

      const choiceTypes: TypeInfo[] = [];

      // Use ModelProvider's ofType method for type filtering if available
      if (modelContext?.isUnion && modelContext?.choices) {
        for (const choice of modelContext.choices) {
          if (!targetType || choice.type?.name === targetType) {
            try {
              // Use ofType method if available
              if (typeof (this.modelProvider as any).ofType === 'function') {
                const specificChoice = (this.modelProvider as any).ofType(typeInfo, choice.type);
                if (specificChoice) {
                  choiceTypes.push(specificChoice);
                }
              } else {
                // Fallback: get type directly
                const choiceTypeInfo = await this.modelProvider.getType(choice.type?.name || choice.type);
                if (choiceTypeInfo) {
                  choiceTypes.push(choiceTypeInfo);
                }
              }
            } catch (error) {
              if (this.options.enableLogging) {
                logger.warn('Failed to resolve choice type', {
                  operation: 'resolveChoiceTypes',
                  choiceTypeName: choice.type?.name || choice.type,
                  error: (error as Error).message
                });
              }
            }
          }
        }
      }

      // Handle legacy choice types from modelContext.choiceTypes
      if (choiceTypes.length === 0 && modelContext?.choiceTypes) {
        for (const choiceTypeName of modelContext.choiceTypes) {
          if (!targetType || choiceTypeName === targetType) {
            try {
              const choiceTypeInfo = await this.modelProvider.getType(choiceTypeName);
              if (choiceTypeInfo) {
                choiceTypes.push(choiceTypeInfo);
              }
            } catch (error) {
              if (this.options.enableLogging) {
                logger.warn('Failed to resolve legacy choice type', {
                  operation: 'resolveChoiceTypes',
                  choiceTypeName,
                  error: (error as Error).message
                });
              }
            }
          }
        }
      }

      // Enhanced fallback for common FHIR choice patterns
      if (choiceTypes.length === 0 && typeInfo.name?.includes('[x]')) {
        const choiceTypesMap = this.getCommonChoiceTypes(typeInfo.name);
        
        for (const choiceTypeName of choiceTypesMap) {
          if (!targetType || choiceTypeName === targetType) {
            try {
              const choiceTypeInfo = await this.modelProvider.getType(choiceTypeName);
              if (choiceTypeInfo) {
                choiceTypes.push(choiceTypeInfo);
              }
            } catch (error) {
              // Ignore errors for fallback types
            }
          }
        }
      }

      if (this.options.enableLogging) {
        logger.debug('Resolved choice types', {
          operation: 'resolveChoiceTypes',
          typeName: typeInfo.name,
          choiceTypesCount: choiceTypes.length,
          targetType,
          choiceTypeNames: choiceTypes.map(ct => ct.name)
        });
      }
      
      return choiceTypes;
    } catch (error) {
      this.handleError(error as Error, 'resolveChoiceTypes');
      return [];
    }
  }

  /**
   * Generate choice-specific property names (e.g., value → valueString, valueQuantity)
   */
  getChoicePropertyNames(baseProperty: string, choiceTypes: TypeInfo[]): string[] {
    try {
      return choiceTypes.map(choice => {
        const typeName = choice.name || '';
        const capitalizedType = typeName.charAt(0).toUpperCase() + typeName.slice(1);
        return `${baseProperty}${capitalizedType}`;
      });
    } catch (error) {
      if (this.options.enableLogging) {
        logger.warn('Failed to generate choice property names', {
          operation: 'getChoicePropertyNames',
          baseProperty,
          error: (error as Error).message
        });
      }
      return [];
    }
  }

  /**
   * Check if a property follows choice naming pattern
   */
  isChoiceProperty(property: string): boolean {
    // Pattern: starts with lowercase letter(s), followed by uppercase letter
    // Must have at least one lowercase letter followed by at least one uppercase letter
    return /^[a-z]+[A-Z][a-zA-Z]*$/.test(property);
  }

  /**
   * Extract base property name from choice property (e.g., valueString → value)
   */
  extractBaseProperty(choiceProperty: string): string {
    // Simple approach: find the first uppercase letter that's followed by another uppercase or is at the end
    // Handle common FHIR patterns like valueString, effectiveDateTime, multipleBirthInteger
    
    // Common FHIR choice base properties
    const commonBases = [
      'multipleBirth', 'effective', 'deceased', 'onset', 'abatement', 
      'occurrence', 'performed', 'value', 'bodySite'
    ];
    
    // Check if it starts with any known base
    for (const base of commonBases) {
      if (choiceProperty.startsWith(base) && choiceProperty.length > base.length && 
          /[A-Z]/.test(choiceProperty[base.length])) {
        return base;
      }
    }
    
    // Fallback: basic pattern matching - find sequence before final capital type
    const match = choiceProperty.match(/^([a-z]+(?:[a-z]+[A-Z][a-z]*)*?)[A-Z][a-zA-Z]*$/);
    if (match) {
      return match[1];
    }
    
    // Last resort: split at first capital letter
    const simpleMatch = choiceProperty.match(/^([a-z]+)[A-Z]/);
    return simpleMatch ? simpleMatch[1] : choiceProperty;
  }

  /**
   * Extract choice type from choice property (e.g., valueString → String)
   */
  extractChoiceType(choiceProperty: string): string {
    const baseProperty = this.extractBaseProperty(choiceProperty);
    if (baseProperty && choiceProperty.startsWith(baseProperty) && choiceProperty.length > baseProperty.length) {
      const typePart = choiceProperty.substring(baseProperty.length);
      // Ensure it starts with capital letter
      return typePart.charAt(0) === typePart.charAt(0).toUpperCase() ? typePart : '';
    }
    return '';
  }

  /**
   * Detect choice context from expression (e.g., "Observation.value")
   */
  async detectChoiceContext(expression: string): Promise<ChoiceContext | undefined> {
    if (!this.initialized) {
      throw new Error('ModelProviderService not initialized. Call initialize() first.');
    }

    try {
      // Parse expressions like "Observation.value" to detect choice type context
      const match = expression.match(/(\w+)\.(\w+)$/);
      if (!match) return undefined;

      const [, resourceType, property] = match;
      
      if (this.options.enableLogging) {
        logger.debug('Detecting choice context', {
          operation: 'detectChoiceContext',
          expression,
          resourceType,
          property
        });
      }

      const typeInfo = await this.modelProvider.getType(resourceType);
      if (!typeInfo) return undefined;

      // Get element type using ModelProvider if available
      let propertyType: any;
      if (typeof (this.modelProvider as any).getElementType === 'function') {
        propertyType = (this.modelProvider as any).getElementType(typeInfo, property);
      } else {
        // Fallback to TypeInfo properties
        if ((typeInfo as any).properties instanceof Map) {
          propertyType = ((typeInfo as any).properties as Map<string, any>).get(property);
        }
      }

      if (!propertyType) return undefined;

      // Check if this is a union/choice type
      const modelContext = propertyType.modelContext;
      if (modelContext?.isUnion || propertyType.name?.includes('[x]') || propertyType.name?.includes('Choice')) {
        const choiceTypes = await this.resolveChoiceTypes(propertyType);
        const availableChoices = this.getChoicePropertyNames(property, choiceTypes);

        const context: ChoiceContext = {
          baseProperty: property,
          resourceType,
          choiceTypes,
          availableChoices
        };

        if (this.options.enableLogging) {
          logger.debug('Choice context detected', {
            operation: 'detectChoiceContext',
            context: {
              ...context,
              choiceTypesCount: choiceTypes.length,
              availableChoicesCount: availableChoices.length
            }
          });
        }

        return context;
      }

      return undefined;
    } catch (error) {
      this.handleError(error as Error, 'detectChoiceContext');
      return undefined;
    }
  }

  /**
   * Validate choice property against resource type
   */
  async validateChoiceProperty(resourceType: string, property: string): Promise<ChoiceValidationResult> {
    if (!this.initialized) {
      throw new Error('ModelProviderService not initialized. Call initialize() first.');
    }

    try {
      if (this.options.enableLogging) {
        logger.debug('Validating choice property', {
          operation: 'validateChoiceProperty',
          resourceType,
          property
        });
      }

      if (!this.isChoiceProperty(property)) {
        return { isValid: true };
      }

      // Extract base property and type from choice property
      const baseProperty = this.extractBaseProperty(property);
      const choiceType = this.extractChoiceType(property);

      if (!baseProperty || !choiceType) {
        return {
          isValid: false,
          error: `Invalid choice property format: '${property}'`
        };
      }

      const typeInfo = await this.modelProvider.getType(resourceType);
      if (!typeInfo) {
        return {
          isValid: false,
          error: `Resource type '${resourceType}' not found`
        };
      }

      // Get base property type
      let basePropertyType: any;
      if (typeof (this.modelProvider as any).getElementType === 'function') {
        basePropertyType = (this.modelProvider as any).getElementType(typeInfo, baseProperty);
      } else {
        if ((typeInfo as any).properties instanceof Map) {
          basePropertyType = ((typeInfo as any).properties as Map<string, any>).get(baseProperty);
        }
      }

      if (!basePropertyType) {
        return {
          isValid: false,
          error: `Property '${baseProperty}' not found on '${resourceType}'`
        };
      }

      const modelContext = basePropertyType.modelContext;
      if (!modelContext?.isUnion && !basePropertyType.name?.includes('[x]') && !basePropertyType.name?.includes('Choice')) {
        return {
          isValid: false,
          error: `Property '${baseProperty}' is not a choice type`
        };
      }

      const validChoices = await this.resolveChoiceTypes(basePropertyType);
      const validChoiceNames = validChoices.map(choice => choice.name || '');
      const isValidChoice = validChoiceNames.includes(choiceType) || validChoiceNames.includes(choiceType.toLowerCase());

      if (isValidChoice) {
        return { isValid: true };
      }

      // Find closest match for suggestion
      const suggestion = this.findClosestChoiceMatch(choiceType, validChoiceNames);
      const suggestedProperty = suggestion ? `${baseProperty}${suggestion}` : undefined;

      return {
        isValid: false,
        error: `'${choiceType}' is not a valid choice for '${baseProperty}'`,
        validChoices: validChoiceNames,
        suggestedProperty
      };

    } catch (error) {
      this.handleError(error as Error, 'validateChoiceProperty');
      return {
        isValid: false,
        error: `Validation error: ${(error as Error).message}`
      };
    }
  }

  /**
   * Check if the service is initialized and ready for use
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get service health status
   */
  async getHealthStatus(): Promise<{ healthy: boolean; details: any }> {
    const details: any = {
      initialized: this.initialized,
      modelProviderAvailable: !!this.modelProvider
    };

    if (!this.initialized || !this.modelProvider) {
      return { healthy: false, details };
    }

    try {
      // Basic health check - try to get a common resource type
      const patientType = await this.modelProvider.getType('Patient');
      details.sampleTypeResolution = !!patientType;
      
      return { 
        healthy: !!patientType, 
        details 
      };
    } catch (error) {
      details.error = (error as Error).message;
      return { healthy: false, details };
    }
  }

  /**
   * Private: Validate that ModelProvider is functional
   */
  private async validateModelProvider(): Promise<boolean> {
    if (!this.modelProvider) {
      throw new Error('ModelProvider is null or undefined');
    }

    try {
      // Test basic functionality by trying to get a common resource type
      const patientType = await this.modelProvider.getType('Patient');
      return !!patientType;
    } catch (error) {
      if (this.options.enableLogging) {
        logger.error('ModelProvider validation failed', error as Error, { 
          operation: 'validateModelProvider' 
        });
      }
      return false;
    }
  }

  /**
   * Private: Build type hierarchy for enhanced type information
   */
  private async buildTypeHierarchy(typeInfo: TypeInfo): Promise<TypeInfo[]> {
    const hierarchy: TypeInfo[] = [typeInfo];
    
    try {
      // Extract hierarchy from modelContext.schemaHierarchy if available
      const modelContext = (typeInfo as any).modelContext;
      if (modelContext?.schemaHierarchy) {
        for (const schema of modelContext.schemaHierarchy) {
          if (schema.name !== typeInfo.name) {
            const parentType = await this.modelProvider.getType(schema.name);
            if (parentType) {
              hierarchy.push(parentType);
            }
          }
        }
      }
      
      // Fallback: try to get base type from typeInfo.baseType
      if ((typeInfo as any).baseType && hierarchy.length === 1) {
        const baseTypeName = (typeInfo as any).baseType;
        const baseType = await this.modelProvider.getType(baseTypeName);
        if (baseType) {
          hierarchy.push(baseType);
          
          // Recursively build hierarchy for base type
          const baseHierarchy = await this.buildTypeHierarchy(baseType);
          hierarchy.push(...baseHierarchy.slice(1)); // Skip the base type itself
        }
      }
    } catch (error) {
      if (this.options.enableLogging) {
        logger.warn('Failed to build type hierarchy', {
          operation: 'buildTypeHierarchy',
          typeName: typeInfo.name,
          error: (error as Error).message
        });
      }
    }
    
    return hierarchy;
  }

  /**
   * Private: Extract constraint information from type info
   */
  private extractConstraints(typeInfo: TypeInfo): ConstraintInfo {
    const constraints: ConstraintInfo = {
      cardinality: '0..*',
      required: false
    };
    
    try {
      // Extract from FHIR StructureDefinition if available
      const modelContext = (typeInfo as any).modelContext;
      if (modelContext?.schema?.snapshot?.element) {
        const rootElement = modelContext.schema.snapshot.element.find(
          (e: any) => e.path === typeInfo.name
        );
        
        if (rootElement) {
          constraints.cardinality = rootElement.cardinality || rootElement.base?.cardinality || '0..*';
          constraints.required = (rootElement.min || 0) > 0;
          constraints.fixed = rootElement.fixed;
          constraints.pattern = rootElement.pattern;
          constraints.minLength = rootElement.minLength;
          constraints.maxLength = rootElement.maxLength;
        }
      }
      
      // Fallback: extract from typeInfo properties if available
      if ((typeInfo as any).properties) {
        const properties = (typeInfo as any).properties;
        if (properties instanceof Map) {
          // Look at first property for cardinality info
          const firstProp = Array.from(properties.values())[0];
          if (firstProp?.cardinality) {
            constraints.cardinality = firstProp.cardinality;
          }
        }
      }
    } catch (error) {
      if (this.options.enableLogging) {
        logger.warn('Failed to extract constraints', {
          operation: 'extractConstraints',
          typeName: typeInfo.name,
          error: (error as Error).message
        });
      }
    }
    
    return constraints;
  }

  /**
   * Private: Extract terminology binding information
   */
  private extractTerminologyBinding(typeInfo: TypeInfo): TerminologyBinding {
    const binding: TerminologyBinding = {
      strength: 'example'
    };
    
    try {
      // Extract from FHIR StructureDefinition binding information
      const modelContext = (typeInfo as any).modelContext;
      if (modelContext?.schema?.snapshot?.element) {
        const elements = modelContext.schema.snapshot.element;
        
        // Find elements with binding information
        for (const element of elements) {
          if (element.binding) {
            binding.strength = element.binding.strength || 'example';
            binding.valueSet = element.binding.valueSet;
            binding.description = element.binding.description;
            break; // Use first binding found
          }
        }
      }
      
      // Handle specific FHIR types with known bindings
      const typeName = typeInfo.name?.toLowerCase();
      if (typeName === 'code' || typeName === 'coding' || typeName === 'codeableconcept') {
        binding.strength = 'required';
      }
    } catch (error) {
      if (this.options.enableLogging) {
        logger.warn('Failed to extract terminology binding', {
          operation: 'extractTerminologyBinding',
          typeName: typeInfo.name,
          error: (error as Error).message
        });
      }
    }
    
    return binding;
  }

  /**
   * Private: Handle errors with consistent logging and context
   */
  private handleError(error: Error, context: string): void {
    if (this.options.enableLogging) {
      logger.error(`ModelProviderService error in ${context}`, error, {
        operation: 'handleError',
        context,
        initialized: this.initialized
      });
    }

    // Graceful error handling strategies:
    // - Log error with full context for debugging
    // - Continue execution with fallback values
    // - Cache error states to avoid repeated failures
    
    // For critical initialization errors, re-throw
    if (context === 'initialize' || context === 'validateModelProvider') {
      throw error;
    }
    
    // For other operations, log and continue with degraded functionality
  }

  /**
   * Private: Get cached enhanced type info
   */
  private getCachedEnhancedType(typeName: string): EnhancedTypeInfo | undefined {
    const cached = this.typeCache.get(typeName);
    if (!cached) {
      return undefined;
    }

    // Check if cache entry is still valid
    const now = Date.now();
    const cacheTimestamp = (cached as any).__cacheTimestamp || 0;
    if (now - cacheTimestamp > this.cacheExpiryMs) {
      this.typeCache.delete(typeName);
      return undefined;
    }

    return cached;
  }

  /**
   * Private: Set cached enhanced type info
   */
  private setCachedEnhancedType(typeName: string, enhanced: EnhancedTypeInfo): void {
    // Add timestamp for cache expiry
    (enhanced as any).__cacheTimestamp = Date.now();
    this.typeCache.set(typeName, enhanced);

    // Prevent cache from growing too large
    if (this.typeCache.size > 100) {
      const oldestEntries = Array.from(this.typeCache.entries())
        .sort(([, a], [, b]) => {
          const timestampA = (a as any).__cacheTimestamp || 0;
          const timestampB = (b as any).__cacheTimestamp || 0;
          return timestampA - timestampB;
        })
        .slice(0, 20); // Remove oldest 20 entries
      
      for (const [key] of oldestEntries) {
        this.typeCache.delete(key);
      }
    }
  }

  /**
   * Clear the enhanced type cache
   */
  clearEnhancedTypeCache(): void {
    this.typeCache.clear();
    if (this.options.enableLogging) {
      logger.info('Enhanced type cache cleared', { operation: 'clearEnhancedTypeCache' });
    }
  }

  /**
   * Get enhanced type cache statistics
   */
  getEnhancedTypeCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.typeCache.size,
      maxSize: 100
    };
  }

  /**
   * Check if a type is a primitive FHIR type
   */
  isPrimitiveType(typeName: string): boolean {
    const primitiveTypes = [
      'boolean', 'integer', 'integer64', 'string', 'decimal', 'uri', 'url',
      'canonical', 'base64Binary', 'instant', 'date', 'dateTime', 'time',
      'code', 'oid', 'id', 'markdown', 'unsignedInt', 'positiveInt', 'uuid'
    ];
    return primitiveTypes.includes(typeName.toLowerCase());
  }

  /**
   * Check if a type is a complex FHIR type
   */
  isComplexType(typeName: string): boolean {
    return !this.isPrimitiveType(typeName) && !this.isResourceType(typeName);
  }

  /**
   * Check if a type is a FHIR resource type
   */
  isResourceType(typeName: string): boolean {
    // This would ideally use the ModelProvider to check
    // For now, use common FHIR resource types
    const commonResourceTypes = [
      'Patient', 'Observation', 'Condition', 'Procedure', 'MedicationRequest',
      'DiagnosticReport', 'Encounter', 'Practitioner', 'Organization', 'Location',
      'Device', 'Medication', 'Substance', 'AllergyIntolerance', 'Immunization'
    ];
    return commonResourceTypes.includes(typeName);
  }

  /**
   * Get type classification for a given type name
   */
  async getTypeClassification(typeName: string): Promise<{
    isPrimitive: boolean;
    isComplex: boolean;
    isResource: boolean;
    category: 'primitive' | 'complex' | 'resource' | 'unknown';
  }> {
    const isPrimitive = this.isPrimitiveType(typeName);
    const isResource = this.isResourceType(typeName);
    const isComplex = !isPrimitive && !isResource;
    
    let category: 'primitive' | 'complex' | 'resource' | 'unknown' = 'unknown';
    if (isPrimitive) category = 'primitive';
    else if (isResource) category = 'resource';
    else if (isComplex) category = 'complex';
    
    return {
      isPrimitive,
      isComplex,
      isResource,
      category
    };
  }

  /**
   * Private: Navigate a single property step and validate it
   */
  private async navigatePropertyStep(
    currentType: TypeInfo, 
    propertyName: string, 
    currentPath: string[]
  ): Promise<{
    isValid: boolean;
    targetType?: TypeInfo;
    errors: string[];
    suggestions?: string[];
  }> {
    const errors: string[] = [];
    const suggestions: string[] = [];

    try {
      // Handle array access patterns (e.g., name[0])
      const cleanPropertyName = this.cleanPropertyName(propertyName);
      
      // Check if ModelProvider has methods to get element information
      if (typeof (this.modelProvider as any).getElementNames === 'function') {
        const availableProperties = (this.modelProvider as any).getElementNames(currentType) || [];
        
        // Check if property exists
        if (!availableProperties.includes(cleanPropertyName)) {
          // Check for partial matches for suggestions
          const partialMatches = availableProperties.filter((prop: string) => 
            prop.toLowerCase().includes(cleanPropertyName.toLowerCase())
          );
          
          if (partialMatches.length > 0) {
            suggestions.push(...partialMatches);
            errors.push(`Property '${cleanPropertyName}' not found on type '${currentType.name}'. Did you mean: ${partialMatches.slice(0, 3).join(', ')}?`);
          } else {
            errors.push(`Property '${cleanPropertyName}' not found on type '${currentType.name}'. Available properties: ${availableProperties.slice(0, 5).join(', ')}`);
          }
          
          return { isValid: false, errors, suggestions };
        }

        // Get the target type for this property
        if (typeof (this.modelProvider as any).getElementType === 'function') {
          const elementType = (this.modelProvider as any).getElementType(currentType, cleanPropertyName);
          
          if (!elementType) {
            errors.push(`Could not determine type for property '${cleanPropertyName}' on type '${currentType.name}'`);
            return { isValid: false, errors, suggestions };
          }

          // Handle choice types (e.g., value[x])
          if (elementType.type === 'choice' || cleanPropertyName.includes('[x]')) {
            const choiceTypes = await this.resolveChoiceTypes(elementType);
            if (choiceTypes.length > 0) {
              // For choice types, return the first resolved choice type or a generic choice type
              return { isValid: true, targetType: choiceTypes[0] || elementType, errors, suggestions };
            }
          }

          // Handle backbone elements (inline complex types)
          if (elementType.type === 'BackboneElement' || elementType.type?.startsWith(currentType.name + '.')) {
            // For backbone elements, treat them as the current type but with restricted properties
            const backboneType: TypeInfo = {
              name: elementType.type
            } as TypeInfo;
            
            // If we have model context, try to get the actual backbone element definition
            if (elementType.modelContext) {
              return { isValid: true, targetType: elementType, errors, suggestions };
            }
            
            return { isValid: true, targetType: backboneType, errors, suggestions };
          }

          // Get the target type by name
          const targetType = await this.modelProvider.getType(elementType.type);
          if (!targetType) {
            // For primitive types, create a minimal TypeInfo
            if (this.isPrimitiveType(elementType.type)) {
              const primitiveType: TypeInfo = {
                name: elementType.type
              } as TypeInfo;
              return { isValid: true, targetType: primitiveType, errors, suggestions };
            }
            
            errors.push(`Target type '${elementType.type}' for property '${cleanPropertyName}' not found`);
            return { isValid: false, errors, suggestions };
          }

          return { isValid: true, targetType, errors, suggestions };
        }
      }

      // Fallback: try to use TypeInfo properties if available
      if ((currentType as any).properties instanceof Map) {
        const properties = (currentType as any).properties as Map<string, any>;
        const propertyInfo = properties.get(cleanPropertyName);
        
        if (!propertyInfo) {
          const availableProps = Array.from(properties.keys());
          const partialMatches = availableProps.filter(prop => 
            prop.toLowerCase().includes(cleanPropertyName.toLowerCase())
          );
          
          if (partialMatches.length > 0) {
            suggestions.push(...partialMatches);
            errors.push(`Property '${cleanPropertyName}' not found. Did you mean: ${partialMatches.slice(0, 3).join(', ')}?`);
          } else {
            errors.push(`Property '${cleanPropertyName}' not found. Available: ${availableProps.slice(0, 5).join(', ')}`);
          }
          
          return { isValid: false, errors, suggestions };
        }

        // Try to get target type
        const targetType = await this.modelProvider.getType(propertyInfo.type);
        if (targetType) {
          return { isValid: true, targetType, errors, suggestions };
        }
        
        // Handle primitive types
        if (this.isPrimitiveType(propertyInfo.type)) {
          const primitiveType: TypeInfo = {
            name: propertyInfo.type
          } as TypeInfo;
          return { isValid: true, targetType: primitiveType, errors, suggestions };
        }
      }

      errors.push(`Unable to navigate property '${cleanPropertyName}' on type '${currentType.name}'`);
      return { isValid: false, errors, suggestions };
      
    } catch (error) {
      errors.push(`Error navigating property '${propertyName}': ${(error as Error).message}`);
      return { isValid: false, errors, suggestions };
    }
  }

  /**
   * Private: Clean property name (remove array access notation)
   */
  private cleanPropertyName(propertyName: string): string {
    // Remove array access patterns like [0], [*], etc.
    return propertyName.replace(/\[.*?\]$/, '');
  }

  /**
   * Private: Get available properties for a type
   */
  private async getAvailableProperties(typeInfo: TypeInfo): Promise<string[]> {
    try {
      // Use ModelProvider method if available
      if (typeof (this.modelProvider as any).getElementNames === 'function') {
        return (this.modelProvider as any).getElementNames(typeInfo) || [];
      }
      
      // Fallback to TypeInfo properties
      if ((typeInfo as any).properties instanceof Map) {
        return Array.from(((typeInfo as any).properties as Map<string, any>).keys());
      }
      
      return [];
    } catch (error) {
      if (this.options.enableLogging) {
        logger.warn('Failed to get available properties', {
          operation: 'getAvailableProperties',
          typeName: typeInfo.name,
          error: (error as Error).message
        });
      }
      return [];
    }
  }

  /**
   * Private: Get common choice types for FHIR elements
   */
  private getCommonChoiceTypes(elementName: string): string[] {
    const choiceTypesMap: Record<string, string[]> = {
      'value[x]': [
        'string', 'integer', 'decimal', 'boolean', 'date', 'dateTime', 'time',
        'Quantity', 'CodeableConcept', 'Coding', 'Period', 'Range', 'Ratio',
        'SampledData', 'Attachment', 'time', 'dateTime', 'Period', 'Range'
      ],
      'deceased[x]': ['boolean', 'dateTime'],
      'multipleBirth[x]': ['boolean', 'integer'],
      'onset[x]': ['dateTime', 'Age', 'Period', 'Range', 'string'],
      'abatement[x]': ['dateTime', 'Age', 'Period', 'Range', 'string', 'boolean'],
      'occurrence[x]': ['dateTime', 'Period', 'Timing'],
      'performed[x]': ['dateTime', 'Period', 'string', 'Age', 'Range'],
      'effective[x]': ['dateTime', 'Period', 'Timing', 'instant'],
      'issued[x]': ['instant'],
      'bodySite[x]': ['CodeableConcept', 'Reference']
    };

    // Find matching pattern
    for (const [pattern, types] of Object.entries(choiceTypesMap)) {
      if (elementName.includes(pattern.replace('[x]', ''))) {
        return types;
      }
    }

    // Default fallback for any [x] pattern
    if (elementName.includes('[x]')) {
      return [
        'string', 'integer', 'boolean', 'dateTime', 'Quantity', 'CodeableConcept'
      ];
    }

    return [];
  }

  /**
   * Private: Find closest choice type match for suggestions
   */
  private findClosestChoiceMatch(input: string, validChoices: string[]): string | undefined {
    const inputLower = input.toLowerCase();
    
    // Exact match (case-insensitive)
    for (const choice of validChoices) {
      if (choice.toLowerCase() === inputLower) {
        return choice.charAt(0).toUpperCase() + choice.slice(1);
      }
    }

    // Partial match (contains)
    for (const choice of validChoices) {
      if (choice.toLowerCase().includes(inputLower) || inputLower.includes(choice.toLowerCase())) {
        return choice.charAt(0).toUpperCase() + choice.slice(1);
      }
    }

    // Levenshtein distance based matching
    let closestMatch = validChoices[0];
    let minDistance = this.levenshteinDistance(inputLower, validChoices[0]?.toLowerCase() || '');

    for (const choice of validChoices.slice(1)) {
      const distance = this.levenshteinDistance(inputLower, choice.toLowerCase());
      if (distance < minDistance) {
        minDistance = distance;
        closestMatch = choice;
      }
    }

    // Only suggest if distance is reasonable (less than half the input length)
    if (minDistance <= Math.max(2, input.length / 2)) {
      return closestMatch.charAt(0).toUpperCase() + closestMatch.slice(1);
    }

    return undefined;
  }

  /**
   * Private: Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) {
      matrix[0][i] = i;
    }

    for (let j = 0; j <= str2.length; j++) {
      matrix[j][0] = j;
    }

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,     // deletion
          matrix[j - 1][i] + 1,     // insertion
          matrix[j - 1][i - 1] + indicator  // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }
}