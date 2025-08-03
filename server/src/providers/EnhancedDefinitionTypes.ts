import { Location, LocationLink, Range } from 'vscode-languageserver';

/**
 * Enhanced definition types for FHIR-aware "Go to Definition" functionality
 */

/**
 * Enhanced definition with additional FHIR context
 */
export interface EnhancedDefinition extends LocationLink {
  type: DefinitionType;
  targetInfo: DefinitionTarget;
  metadata?: DefinitionMetadata;
  confidence: number; // 0-1, confidence in the definition accuracy
}

/**
 * Types of definitions that can be navigated to
 */
export enum DefinitionType {
  RESOURCE_TYPE = 'resourceType',
  PROPERTY = 'property',
  CHOICE_TYPE = 'choiceType',
  INHERITED_PROPERTY = 'inheritedProperty',
  FUNCTION = 'function',
  CONSTRAINT = 'constraint',
  VALUE_SET = 'valueSet',
  EXTENSION = 'extension',
  PRIMITIVE_TYPE = 'primitiveType',
  COMPLEX_TYPE = 'complexType'
}

/**
 * Target information for the definition
 */
export interface DefinitionTarget {
  name: string;
  fhirPath: string;
  resourceType?: string;
  choiceTypes?: string[];
  constraints?: ConstraintInfo[];
  description?: string;
  url?: string; // External documentation URL
}

/**
 * Additional metadata about the definition
 */
export interface DefinitionMetadata {
  version?: string;
  status?: 'active' | 'draft' | 'retired';
  experimental?: boolean;
  publisher?: string;
  copyright?: string;
  lastModified?: string;
}

/**
 * FHIR constraint information for definitions
 */
export interface ConstraintInfo {
  key: string;
  severity: 'error' | 'warning';
  human: string;
  expression: string;
  xpath?: string;
}

/**
 * Context information for definition resolution
 */
export interface DefinitionContext {
  resourceType?: string;
  currentPath?: string[];
  parentPath?: string[];
  expressionType?: 'filter' | 'projection' | 'selection' | 'navigation';
  position: { line: number; character: number };
}

/**
 * Result of definition resolution
 */
export interface DefinitionResolutionResult {
  definitions: EnhancedDefinition[];
  ambiguous: boolean; // True if multiple definitions possible
  errors: DefinitionError[];
}

/**
 * Definition resolution error
 */
export interface DefinitionError {
  message: string;
  code: string;
  severity: 'error' | 'warning' | 'info';
}

/**
 * Choice type definition context
 */
export interface ChoiceTypeDefinitionContext {
  baseProperty: string; // e.g., "value"
  choiceProperty: string; // e.g., "valueString"
  availableChoices: ChoiceDefinition[];
  currentChoice: ChoiceDefinition;
}

/**
 * Individual choice definition
 */
export interface ChoiceDefinition {
  name: string; // e.g., "valueString"
  dataType: string; // e.g., "string"
  description: string;
  constraints?: ConstraintInfo[];
  examples?: any[];
}

/**
 * Inheritance definition context
 */
export interface InheritanceDefinitionContext {
  property: string;
  inheritedFrom: string; // Base resource or type
  overriddenIn?: string; // Resource that overrides
  isAbstract: boolean;
  hierarchy: string[]; // Full inheritance chain
}

/**
 * Function definition context
 */
export interface FunctionDefinitionContext {
  name: string;
  signature: string;
  parameters: FunctionParameter[];
  returnType: string;
  description: string;
  examples: FunctionExample[];
  category: 'collection' | 'filtering' | 'projection' | 'math' | 'string' | 'date' | 'utility' | 'navigation' | 'existence' | 'manipulation' | 'conversion';
}

/**
 * Function parameter definition
 */
export interface FunctionParameter {
  name: string;
  type: string;
  optional: boolean;
  description: string;
  defaultValue?: any;
}

/**
 * Function usage example
 */
export interface FunctionExample {
  expression: string;
  context: string;
  result: string;
  description: string;
}

/**
 * Enhanced definition builder for creating FHIR-aware definitions
 */
export class EnhancedDefinitionBuilder {
  private definitions: EnhancedDefinition[] = [];

  addResourceDefinition(
    resourceName: string,
    targetUri: string,
    originRange: Range,
    metadata?: DefinitionMetadata
  ): this {
    this.definitions.push({
      targetUri,
      targetRange: Range.create(0, 0, 0, 0),
      targetSelectionRange: Range.create(0, 0, 0, 0),
      originSelectionRange: originRange,
      type: DefinitionType.RESOURCE_TYPE,
      targetInfo: {
        name: resourceName,
        fhirPath: resourceName,
        resourceType: resourceName,
        description: `FHIR ${resourceName} resource`,
        url: targetUri
      },
      metadata,
      confidence: 0.95
    });
    return this;
  }

  addPropertyDefinition(
    property: string,
    resourceType: string,
    targetUri: string,
    originRange: Range,
    constraints?: ConstraintInfo[]
  ): this {
    this.definitions.push({
      targetUri,
      targetRange: Range.create(0, 0, 0, 0),
      targetSelectionRange: Range.create(0, 0, 0, 0),
      originSelectionRange: originRange,
      type: DefinitionType.PROPERTY,
      targetInfo: {
        name: property,
        fhirPath: `${resourceType}.${property}`,
        resourceType,
        constraints,
        description: `${property} property of ${resourceType}`,
        url: targetUri
      },
      confidence: 0.9
    });
    return this;
  }

  addChoiceTypeDefinition(
    choiceContext: ChoiceTypeDefinitionContext,
    targetUri: string,
    originRange: Range
  ): this {
    // Add definition for the specific choice type
    this.definitions.push({
      targetUri,
      targetRange: Range.create(0, 0, 0, 0),
      targetSelectionRange: Range.create(0, 0, 0, 0),
      originSelectionRange: originRange,
      type: DefinitionType.CHOICE_TYPE,
      targetInfo: {
        name: choiceContext.choiceProperty,
        fhirPath: choiceContext.choiceProperty,
        choiceTypes: choiceContext.availableChoices.map(c => c.name),
        description: `Choice type: ${choiceContext.currentChoice.description}`,
        url: targetUri
      },
      confidence: 0.85
    });

    return this;
  }

  addInheritedPropertyDefinition(
    inheritanceContext: InheritanceDefinitionContext,
    targetUri: string,
    originRange: Range
  ): this {
    this.definitions.push({
      targetUri,
      targetRange: Range.create(0, 0, 0, 0),
      targetSelectionRange: Range.create(0, 0, 0, 0),
      originSelectionRange: originRange,
      type: DefinitionType.INHERITED_PROPERTY,
      targetInfo: {
        name: inheritanceContext.property,
        fhirPath: `${inheritanceContext.inheritedFrom}.${inheritanceContext.property}`,
        description: `Inherited from ${inheritanceContext.inheritedFrom}`,
        url: targetUri
      },
      confidence: 0.8
    });
    return this;
  }

  addFunctionDefinition(
    functionContext: FunctionDefinitionContext,
    targetUri: string,
    originRange: Range
  ): this {
    this.definitions.push({
      targetUri,
      targetRange: Range.create(0, 0, 0, 0),
      targetSelectionRange: Range.create(0, 0, 0, 0),
      originSelectionRange: originRange,
      type: DefinitionType.FUNCTION,
      targetInfo: {
        name: functionContext.name,
        fhirPath: functionContext.signature,
        description: functionContext.description,
        url: targetUri
      },
      confidence: 0.95
    });
    return this;
  }

  build(): EnhancedDefinition[] {
    const result = [...this.definitions];
    this.definitions = []; // Clear for reuse
    return result;
  }

  clear(): this {
    this.definitions = [];
    return this;
  }

  getDefinitionCount(): number {
    return this.definitions.length;
  }
}

/**
 * Utility functions for definition type detection and URL generation
 */
export class DefinitionUtils {
  /**
   * Generate FHIR specification URL for a resource
   */
  static getFhirResourceUrl(resourceName: string): string {
    return `https://hl7.org/fhir/R4/${resourceName.toLowerCase()}.html`;
  }

  /**
   * Generate FHIR specification URL for a property
   */
  static getFhirPropertyUrl(resourceName: string, propertyName: string): string {
    return `https://hl7.org/fhir/R4/${resourceName.toLowerCase()}-definitions.html#${resourceName}.${propertyName}`;
  }

  /**
   * Generate FHIR specification URL for a data type
   */
  static getFhirDataTypeUrl(dataType: string): string {
    return `https://hl7.org/fhir/R4/datatypes.html#${dataType.toLowerCase()}`;
  }

  /**
   * Generate FHIRPath specification URL for a function
   */
  static getFhirPathFunctionUrl(functionName: string): string {
    const functionUrls: { [key: string]: string } = {
      'where': 'https://hl7.org/fhirpath/#where',
      'select': 'https://hl7.org/fhirpath/#select',
      'exists': 'https://hl7.org/fhirpath/#exists',
      'all': 'https://hl7.org/fhirpath/#all',
      'empty': 'https://hl7.org/fhirpath/#empty',
      'first': 'https://hl7.org/fhirpath/#first',
      'last': 'https://hl7.org/fhirpath/#last',
      'count': 'https://hl7.org/fhirpath/#count',
      'distinct': 'https://hl7.org/fhirpath/#distinct',
      'union': 'https://hl7.org/fhirpath/#union',
      'intersect': 'https://hl7.org/fhirpath/#intersect',
      'exclude': 'https://hl7.org/fhirpath/#exclude',
      'as': 'https://hl7.org/fhirpath/#as',
      'is': 'https://hl7.org/fhirpath/#is',
      'single': 'https://hl7.org/fhirpath/#single',
      'trace': 'https://hl7.org/fhirpath/#trace'
    };

    return functionUrls[functionName.toLowerCase()] || 'https://hl7.org/fhirpath/#functions';
  }

  /**
   * Determine if a property name is likely a choice type
   */
  static isChoiceTypeProperty(propertyName: string): boolean {
    return /^value[A-Z]/.test(propertyName) || 
           /^component\w+/.test(propertyName) ||
           /^effective[A-Z]/.test(propertyName) ||
           /^onset[A-Z]/.test(propertyName) ||
           /^abatement[A-Z]/.test(propertyName);
  }

  /**
   * Extract base property from choice type
   */
  static getChoiceBaseProperty(choiceProperty: string): string {
    if (choiceProperty.startsWith('value')) return 'value';
    if (choiceProperty.startsWith('effective')) return 'effective';
    if (choiceProperty.startsWith('onset')) return 'onset';
    if (choiceProperty.startsWith('abatement')) return 'abatement';
    if (choiceProperty.startsWith('component')) return 'component';
    return choiceProperty;
  }

  /**
   * Extract data type from choice property
   */
  static getChoiceDataType(choiceProperty: string): string {
    const match = choiceProperty.match(/^(?:value|effective|onset|abatement|component)([A-Z]\w*)$/);
    return match ? match[1] : 'unknown';
  }

  /**
   * Check if property is commonly inherited
   */
  static isInheritedProperty(propertyName: string): boolean {
    const inheritedProperties = [
      'id', 'meta', 'implicitRules', 'language', 'text', 
      'contained', 'extension', 'modifierExtension'
    ];
    return inheritedProperties.includes(propertyName);
  }

  /**
   * Get inheritance hierarchy for a property
   */
  static getInheritanceHierarchy(propertyName: string): string[] {
    const hierarchyMap: { [key: string]: string[] } = {
      'id': ['Element', 'Resource'],
      'meta': ['Element', 'Resource'],
      'implicitRules': ['Element', 'Resource'],
      'language': ['Element', 'Resource'],
      'text': ['Element', 'DomainResource', 'Resource'],
      'contained': ['Element', 'DomainResource', 'Resource'],
      'extension': ['Element', 'DomainResource', 'Resource'],
      'modifierExtension': ['Element', 'DomainResource', 'Resource']
    };

    return hierarchyMap[propertyName] || [];
  }
}