import { Range } from 'vscode-languageserver';

/**
 * Enhanced token types for FHIR-aware semantic highlighting
 * NOTE: These must be kept in sync with the tokenTypes array in server.ts
 */
export enum EnhancedTokenType {
  // Existing types (maintained for compatibility)
  FUNCTION = 0,
  PARAMETER = 1,
  VARIABLE = 2,
  PROPERTY = 3,
  OPERATOR = 4,
  KEYWORD = 5,
  STRING = 6,
  NUMBER = 7,
  BOOLEAN = 8,
  COMMENT = 9,
  
  // New ModelProvider-aware types
  CHOICE_TYPE = 10,           // value[x] properties like valueString, valueQuantity
  INHERITED_PROPERTY = 11,    // Properties inherited from base resources
  REQUIRED_PROPERTY = 12,     // Properties that are required by FHIR spec
  CONSTRAINT_VIOLATION = 13,  // Properties that violate constraints
  TYPE_CAST = 14,            // Type casting operations like as()
  RESOURCE_REFERENCE = 15,    // References to other resources
  DEPRECATED_ELEMENT = 16,    // Deprecated FHIR elements
  EXTENSION_PROPERTY = 17,    // Extension properties
  BACKBONE_ELEMENT = 18,      // Backbone elements within resources
  PRIMITIVE_TYPE = 19         // Primitive FHIR types
}

/**
 * Enhanced token modifiers for additional semantic information
 * NOTE: These must be kept in sync with the tokenModifiers array in server.ts
 */
export enum EnhancedTokenModifier {
  // Existing modifiers (maintained for compatibility)
  DECLARATION = 0,
  READONLY = 1,
  DEPRECATED = 2,
  MODIFICATION = 3,
  DOCUMENTATION = 4,
  DEFAULT_LIBRARY = 5,
  
  // New FHIR-aware modifiers
  OPTIONAL = 6,              // Optional properties (0..*)
  REQUIRED = 7,              // Required properties (1..*)
  CHOICE_BASE = 8,           // Base choice type property (value)
  CHOICE_SPECIFIC = 9,       // Specific choice type (valueString)
  INHERITED = 10,            // Inherited from base resource
  CONSTRAINT_ERROR = 11,     // Has constraint violations
  BINDING_REQUIRED = 12,     // Has required terminology binding
  BINDING_EXTENSIBLE = 13,   // Has extensible terminology binding
  PROFILED = 14,            // Has profile constraints
  SLICED = 15               // Has slicing constraints
}

/**
 * Enhanced semantic token with additional FHIR context
 */
export interface EnhancedSemanticToken {
  line: number;
  startChar: number;
  length: number;
  tokenType: EnhancedTokenType;
  tokenModifiers: number;
  
  // Enhanced context information
  fhirContext?: {
    resourceType?: string;
    propertyPath?: string[];
    dataType?: string;
    cardinality?: string;
    isChoiceType?: boolean;
    choiceTypes?: string[];
    isInherited?: boolean;
    constraints?: ConstraintInfo[];
    terminologyBinding?: TerminologyBinding;
  };
}

/**
 * Constraint information for enhanced highlighting
 */
export interface ConstraintInfo {
  type: 'cardinality' | 'pattern' | 'fixed' | 'binding' | 'slice';
  severity: 'error' | 'warning' | 'info';
  description: string;
  isViolated?: boolean;
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
 * Token classification result with context
 */
export interface TokenClassification {
  tokenType: EnhancedTokenType;
  modifiers: EnhancedTokenModifier[];
  confidence: number; // 0-1, confidence in the classification
  context?: {
    expectedType?: string;
    actualType?: string;
    suggestions?: string[];
    violatedConstraints?: ConstraintInfo[];
  };
}

/**
 * Context information for token analysis
 */
export interface TokenAnalysisContext {
  resourceType?: string;
  currentPath?: string[];
  parentPath?: string[];
  expressionType?: 'filter' | 'projection' | 'selection' | 'navigation';
  lineNumber: number;
  columnNumber: number;
  documentText: string;
}

/**
 * Result of semantic token analysis
 */
export interface SemanticTokenAnalysisResult {
  tokens: EnhancedSemanticToken[];
  errors: TokenAnalysisError[];
  performance: {
    analysisTimeMs: number;
    tokensAnalyzed: number;
    modelProviderCalls: number;
  };
}

/**
 * Token analysis error
 */
export interface TokenAnalysisError {
  message: string;
  range: Range;
  severity: 'error' | 'warning' | 'info';
  code?: string;
}

/**
 * Choice type context for highlighting
 */
export interface ChoiceTypeContext {
  baseProperty: string;      // e.g., "value"
  choiceProperty: string;    // e.g., "valueString"
  availableChoices: string[]; // e.g., ["valueString", "valueQuantity", "valueBoolean"]
  dataType: string;          // e.g., "string", "Quantity", "boolean"
  isValid: boolean;          // Whether this choice is valid in context
}

/**
 * Property inheritance context
 */
export interface InheritanceContext {
  propertyName: string;
  inheritedFrom: string;     // Base resource or type name
  overriddenIn?: string;     // Resource that overrides this property
  isAbstract: boolean;       // Whether the inherited property is abstract
}

/**
 * Constraint violation context
 */
export interface ConstraintViolationContext {
  constraintType: 'cardinality' | 'type' | 'pattern' | 'fixed' | 'binding';
  expectedValue?: any;
  actualValue?: any;
  severity: 'error' | 'warning';
  suggestedFix?: string;
}

/**
 * Enhanced token builder for creating semantic tokens with FHIR context
 */
export class EnhancedTokenBuilder {
  private tokens: EnhancedSemanticToken[] = [];

  addToken(
    line: number,
    startChar: number,
    length: number,
    tokenType: EnhancedTokenType,
    modifiers: EnhancedTokenModifier[] = []
  ): this {
    const modifierBits = modifiers.reduce((bits, modifier) => bits | (1 << modifier), 0);
    
    this.tokens.push({
      line,
      startChar,
      length,
      tokenType,
      tokenModifiers: modifierBits
    });
    
    return this;
  }

  addEnhancedToken(token: EnhancedSemanticToken): this {
    this.tokens.push(token);
    return this;
  }

  addChoiceTypeToken(
    line: number,
    startChar: number,
    length: number,
    choiceContext: ChoiceTypeContext
  ): this {
    const modifiers: EnhancedTokenModifier[] = [
      choiceContext.isValid ? EnhancedTokenModifier.CHOICE_SPECIFIC : EnhancedTokenModifier.CONSTRAINT_ERROR
    ];

    const token: EnhancedSemanticToken = {
      line,
      startChar,
      length,
      tokenType: EnhancedTokenType.CHOICE_TYPE,
      tokenModifiers: modifiers.reduce((bits, modifier) => bits | (1 << modifier), 0),
      fhirContext: {
        isChoiceType: true,
        choiceTypes: choiceContext.availableChoices,
        dataType: choiceContext.dataType,
        propertyPath: [choiceContext.baseProperty, choiceContext.choiceProperty]
      }
    };

    this.tokens.push(token);
    return this;
  }

  addInheritedPropertyToken(
    line: number,
    startChar: number,
    length: number,
    inheritanceContext: InheritanceContext
  ): this {
    const modifiers: EnhancedTokenModifier[] = [
      EnhancedTokenModifier.INHERITED,
      inheritanceContext.isAbstract ? EnhancedTokenModifier.READONLY : EnhancedTokenModifier.OPTIONAL
    ];

    const token: EnhancedSemanticToken = {
      line,
      startChar,
      length,
      tokenType: EnhancedTokenType.INHERITED_PROPERTY,
      tokenModifiers: modifiers.reduce((bits, modifier) => bits | (1 << modifier), 0),
      fhirContext: {
        isInherited: true,
        propertyPath: [inheritanceContext.inheritedFrom, inheritanceContext.propertyName]
      }
    };

    this.tokens.push(token);
    return this;
  }

  addConstraintViolationToken(
    line: number,
    startChar: number,
    length: number,
    violationContext: ConstraintViolationContext
  ): this {
    const modifiers: EnhancedTokenModifier[] = [EnhancedTokenModifier.CONSTRAINT_ERROR];
    
    const constraint: ConstraintInfo = {
      type: violationContext.constraintType,
      severity: violationContext.severity,
      description: `${violationContext.constraintType} constraint violation`,
      isViolated: true
    };

    const token: EnhancedSemanticToken = {
      line,
      startChar,
      length,
      tokenType: EnhancedTokenType.CONSTRAINT_VIOLATION,
      tokenModifiers: modifiers.reduce((bits, modifier) => bits | (1 << modifier), 0),
      fhirContext: {
        constraints: [constraint]
      }
    };

    this.tokens.push(token);
    return this;
  }

  build(): EnhancedSemanticToken[] {
    const result = [...this.tokens];
    this.tokens = []; // Clear for reuse
    return result;
  }

  clear(): this {
    this.tokens = [];
    return this;
  }

  getTokenCount(): number {
    return this.tokens.length;
  }
}

/**
 * Utility functions for token type detection and classification
 */
export class TokenTypeUtils {
  /**
   * Determine if a property name follows FHIR choice type pattern
   */
  static isChoiceTypeProperty(propertyName: string): boolean {
    return /^value[A-Z]/.test(propertyName) || 
           /^component\w+/.test(propertyName) ||
           /^effective[A-Z]/.test(propertyName);
  }

  /**
   * Extract base property name from choice type property
   */
  static getChoiceBaseProperty(choiceProperty: string): string {
    if (choiceProperty.startsWith('value')) {
      return 'value';
    }
    if (choiceProperty.startsWith('effective')) {
      return 'effective';
    }
    if (choiceProperty.startsWith('component')) {
      return 'component';
    }
    return choiceProperty;
  }

  /**
   * Extract data type from choice type property
   */
  static getChoiceDataType(choiceProperty: string): string {
    const match = choiceProperty.match(/^(?:value|effective|component)([A-Z]\w*)/);
    return match ? match[1].toLowerCase() : 'unknown';
  }

  /**
   * Check if a property is likely inherited from Resource or DomainResource
   */
  static isLikelyInheritedProperty(propertyName: string): boolean {
    const commonInheritedProperties = [
      'id', 'meta', 'implicitRules', 'language', 'text', 'contained', 
      'extension', 'modifierExtension'
    ];
    return commonInheritedProperties.includes(propertyName);
  }

  /**
   * Check if a property name suggests it's required
   */
  static isLikelyRequiredProperty(propertyName: string, resourceType?: string): boolean {
    // Common required properties across FHIR resources
    const commonRequired = ['status', 'code', 'subject', 'identifier'];
    
    // Resource-specific required properties
    const resourceSpecificRequired: Record<string, string[]> = {
      'Patient': ['gender'],
      'Observation': ['status', 'code'],
      'Encounter': ['status', 'class'],
      'Procedure': ['status', 'code', 'subject'],
      'Medication': ['code'],
      'Organization': ['name']
    };

    if (commonRequired.includes(propertyName)) {
      return true;
    }

    if (resourceType && resourceSpecificRequired[resourceType]) {
      return resourceSpecificRequired[resourceType].includes(propertyName);
    }

    return false;
  }
}