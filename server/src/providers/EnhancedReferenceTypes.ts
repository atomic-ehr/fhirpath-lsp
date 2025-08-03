import { Location, Range } from 'vscode-languageserver';

/**
 * Enhanced reference types for FHIR-aware "Find All References" functionality
 */

/**
 * Enhanced reference with additional FHIR context and usage information
 */
export interface EnhancedReference extends Location {
  type: ReferenceType;
  context: ReferenceContext;
  usage: UsageType;
  metadata?: ReferenceMetadata;
  confidence: number; // 0-1, confidence in the reference accuracy
}

/**
 * Types of references that can be found
 */
export enum ReferenceType {
  PROPERTY_USAGE = 'propertyUsage',
  CHOICE_TYPE_USAGE = 'choiceTypeUsage',
  INHERITED_USAGE = 'inheritedUsage',
  FUNCTION_CALL = 'functionCall',
  TYPE_REFERENCE = 'typeReference',
  CONSTRAINT_REFERENCE = 'constraintReference',
  CROSS_RESOURCE_USAGE = 'crossResourceUsage',
  SEMANTIC_EQUIVALENT = 'semanticEquivalent'
}

/**
 * How the property/symbol is being used in the expression
 */
export enum UsageType {
  READ = 'read',           // Reading/accessing the property
  WRITE = 'write',         // Writing/setting the property (rare in FHIRPath)
  CONDITION = 'condition', // Used in where() or conditional expressions
  NAVIGATION = 'navigation', // Navigating through properties
  FILTER = 'filter',       // Used in filtering expressions
  SELECTION = 'selection', // Used in select() expressions
  EXISTS_CHECK = 'existsCheck', // Used in exists() expressions
  AGGREGATION = 'aggregation'   // Used in count(), sum(), etc.
}

/**
 * Context information about the reference
 */
export interface ReferenceContext {
  resourceType: string;
  propertyPath: string[];
  expressionType: 'filter' | 'select' | 'where' | 'exists' | 'navigation' | 'aggregation';
  parentExpression?: string;
  lineText: string;
  surroundingContext?: string;
}

/**
 * Additional metadata about the reference
 */
export interface ReferenceMetadata {
  isExact: boolean;        // Exact property match vs. semantic match
  isInherited: boolean;    // Property is inherited from base resource
  isChoiceType: boolean;   // Property is a choice type (value[x])
  choiceTypeName?: string; // Specific choice type if applicable
  inheritedFrom?: string;  // Base resource/type if inherited
  semanticSimilarity?: number; // 0-1 for semantic matches
  constraintViolations?: string[]; // Any constraint violations detected
}

/**
 * Result of reference finding operation
 */
export interface ReferenceResolutionResult {
  references: EnhancedReference[];
  grouped: ReferenceGroup[];
  summary: ReferenceSummary;
  errors: ReferenceError[];
}

/**
 * Group of related references
 */
export interface ReferenceGroup {
  type: ReferenceGroupType;
  name: string;
  description: string;
  references: EnhancedReference[];
  usagePatterns: UsagePatternStats;
}

/**
 * Types of reference groupings
 */
export enum ReferenceGroupType {
  RESOURCE_TYPE = 'resourceType',
  CHOICE_TYPES = 'choiceTypes',
  INHERITED_PROPERTIES = 'inheritedProperties',
  SEMANTIC_EQUIVALENTS = 'semanticEquivalents',
  USAGE_PATTERNS = 'usagePatterns'
}

/**
 * Statistics about usage patterns
 */
export interface UsagePatternStats {
  total: number;
  reads: number;
  conditions: number;
  navigations: number;
  filters: number;
  selections: number;
  existsChecks: number;
  aggregations: number;
}

/**
 * Summary of reference finding results
 */
export interface ReferenceSummary {
  totalReferences: number;
  exactMatches: number;
  choiceTypeMatches: number;
  inheritedMatches: number;
  crossResourceMatches: number;
  semanticMatches: number;
  resourceTypes: string[];
  mostCommonUsage: UsageType;
}

/**
 * Reference finding error
 */
export interface ReferenceError {
  message: string;
  code: string;
  severity: 'error' | 'warning' | 'info';
  location?: Location;
}

/**
 * Context for choice type reference finding
 */
export interface ChoiceTypeReferenceContext {
  baseProperty: string;     // e.g., "value"
  choiceProperty: string;   // e.g., "valueString"
  availableChoices: string[]; // All possible choice types
  resourceType: string;
  propertyPath: string[];
}

/**
 * Context for inherited property reference finding
 */
export interface InheritedReferenceContext {
  property: string;
  inheritedFrom: string;    // Base resource or type
  resourceType: string;     // Current resource type
  inheritanceChain: string[]; // Full inheritance hierarchy
}

/**
 * Context for cross-resource reference finding
 */
export interface CrossResourceReferenceContext {
  property: string;
  sourceResourceType: string;
  targetResourceTypes: string[];
  semanticRelationship: 'same' | 'similar' | 'related';
}

/**
 * Reference finder configuration
 */
export interface ReferenceFinderConfig {
  includeInherited: boolean;
  includeChoiceTypes: boolean;
  includeCrossResource: boolean;
  includeSemanticMatches: boolean;
  maxResults: number;
  minConfidence: number;
  groupResults: boolean;
  sortBy: 'relevance' | 'location' | 'usage';
}

/**
 * Enhanced reference builder for creating FHIR-aware references
 */
export class EnhancedReferenceBuilder {
  private references: EnhancedReference[] = [];

  addPropertyReference(
    location: Location,
    propertyName: string,
    context: ReferenceContext,
    usage: UsageType,
    confidence: number = 0.9
  ): this {
    this.references.push({
      ...location,
      type: ReferenceType.PROPERTY_USAGE,
      context,
      usage,
      metadata: {
        isExact: true,
        isInherited: false,
        isChoiceType: false
      },
      confidence
    });
    return this;
  }

  addChoiceTypeReference(
    location: Location,
    choiceContext: ChoiceTypeReferenceContext,
    usage: UsageType,
    confidence: number = 0.85
  ): this {
    this.references.push({
      ...location,
      type: ReferenceType.CHOICE_TYPE_USAGE,
      context: {
        resourceType: choiceContext.resourceType,
        propertyPath: choiceContext.propertyPath,
        expressionType: 'navigation',
        lineText: location.uri // Placeholder, should be actual line text
      },
      usage,
      metadata: {
        isExact: choiceContext.baseProperty === choiceContext.choiceProperty,
        isInherited: false,
        isChoiceType: true,
        choiceTypeName: choiceContext.choiceProperty
      },
      confidence
    });
    return this;
  }

  addInheritedReference(
    location: Location,
    inheritedContext: InheritedReferenceContext,
    usage: UsageType,
    confidence: number = 0.8
  ): this {
    this.references.push({
      ...location,
      type: ReferenceType.INHERITED_USAGE,
      context: {
        resourceType: inheritedContext.resourceType,
        propertyPath: [inheritedContext.property],
        expressionType: 'navigation',
        lineText: location.uri // Placeholder
      },
      usage,
      metadata: {
        isExact: true,
        isInherited: true,
        isChoiceType: false,
        inheritedFrom: inheritedContext.inheritedFrom
      },
      confidence
    });
    return this;
  }

  addCrossResourceReference(
    location: Location,
    crossResourceContext: CrossResourceReferenceContext,
    usage: UsageType,
    semanticSimilarity: number,
    confidence: number = 0.7
  ): this {
    this.references.push({
      ...location,
      type: ReferenceType.CROSS_RESOURCE_USAGE,
      context: {
        resourceType: crossResourceContext.sourceResourceType,
        propertyPath: [crossResourceContext.property],
        expressionType: 'navigation',
        lineText: location.uri // Placeholder
      },
      usage,
      metadata: {
        isExact: crossResourceContext.semanticRelationship === 'same',
        isInherited: false,
        isChoiceType: false,
        semanticSimilarity
      },
      confidence
    });
    return this;
  }

  addFunctionCallReference(
    location: Location,
    functionName: string,
    context: ReferenceContext,
    confidence: number = 0.95
  ): this {
    this.references.push({
      ...location,
      type: ReferenceType.FUNCTION_CALL,
      context,
      usage: UsageType.NAVIGATION, // Functions are typically navigation
      metadata: {
        isExact: true,
        isInherited: false,
        isChoiceType: false
      },
      confidence
    });
    return this;
  }

  build(): EnhancedReference[] {
    const result = [...this.references];
    this.references = []; // Clear for reuse
    return result;
  }

  clear(): this {
    this.references = [];
    return this;
  }

  getReferenceCount(): number {
    return this.references.length;
  }
}

/**
 * Utility functions for reference analysis and classification
 */
export class ReferenceAnalysisUtils {
  /**
   * Classify usage type based on expression context
   */
  static classifyUsageType(
    propertyName: string,
    expressionContext: string,
    parentExpression?: string
  ): UsageType {
    // Check parent expression first for more specific context
    if (parentExpression) {
      if (parentExpression.includes('where(')) return UsageType.CONDITION;
      if (parentExpression.includes('select(')) return UsageType.SELECTION;
      if (parentExpression.includes('exists(')) return UsageType.EXISTS_CHECK;
      if (parentExpression.includes('count(') || 
          parentExpression.includes('sum(') || 
          parentExpression.includes('avg(')) return UsageType.AGGREGATION;
    }

    // Check expression context
    if (expressionContext.includes('.where(')) return UsageType.FILTER;
    if (expressionContext.includes('.select(')) return UsageType.SELECTION;
    if (expressionContext.includes('.exists(')) return UsageType.EXISTS_CHECK;
    
    // Pattern-based classification
    if (expressionContext.includes(`${propertyName} =`) ||
        expressionContext.includes(`${propertyName} !=`) ||
        expressionContext.includes(`${propertyName} <`) ||
        expressionContext.includes(`${propertyName} >`)) {
      return UsageType.CONDITION;
    }

    // Default to navigation if accessing properties
    if (expressionContext.includes(`${propertyName}.`)) {
      return UsageType.NAVIGATION;
    }

    return UsageType.READ;
  }

  /**
   * Determine expression type from context
   */
  static getExpressionType(context: string): 'filter' | 'select' | 'where' | 'exists' | 'navigation' | 'aggregation' {
    if (context.includes('.where(')) return 'where';
    if (context.includes('.select(')) return 'select';
    if (context.includes('.exists(')) return 'exists';
    if (context.includes('.count(') || 
        context.includes('.sum(') || 
        context.includes('.avg(')) return 'aggregation';
    if (context.includes('where(')) return 'filter';
    
    return 'navigation';
  }

  /**
   * Calculate confidence score for a reference match
   */
  static calculateConfidence(
    targetProperty: string,
    foundProperty: string,
    targetResourceType: string,
    foundResourceType: string,
    isInherited: boolean,
    isChoiceType: boolean,
    semanticSimilarity?: number
  ): number {
    let confidence = 0.0;

    // Exact property name match
    if (targetProperty === foundProperty) {
      confidence += 0.4;
    } else if (isChoiceType && this.isChoiceTypeMatch(targetProperty, foundProperty)) {
      confidence += 0.3;
    } else if (semanticSimilarity !== undefined) {
      confidence += semanticSimilarity * 0.2;
    }

    // Resource type match
    if (targetResourceType === foundResourceType) {
      confidence += 0.3;
    } else if (this.areRelatedResources(targetResourceType, foundResourceType)) {
      confidence += 0.2;
    }

    // Inheritance considerations
    if (isInherited) {
      confidence += 0.2; // Inherited properties are still highly relevant
    }

    // Choice type considerations
    if (isChoiceType) {
      confidence += 0.1; // Choice types are semantically related
    }

    return Math.min(1.0, confidence);
  }

  /**
   * Check if two properties match as choice types
   */
  private static isChoiceTypeMatch(prop1: string, prop2: string): boolean {
    const choiceBasePattern = /^(value|effective|onset|abatement|component)/;
    const base1 = prop1.match(choiceBasePattern)?.[1];
    const base2 = prop2.match(choiceBasePattern)?.[1];
    
    return base1 === base2 && base1 !== undefined;
  }

  /**
   * Check if two resource types are related through inheritance
   */
  private static areRelatedResources(type1: string, type2: string): boolean {
    const resourceHierarchy: { [key: string]: string[] } = {
      'DomainResource': ['Patient', 'Observation', 'Condition', 'Procedure', 'MedicationRequest'],
      'Resource': ['Patient', 'Observation', 'Condition', 'Procedure', 'MedicationRequest', 'Organization'],
      'Element': ['Patient', 'Observation', 'Condition', 'Procedure', 'MedicationRequest', 'Organization']
    };

    // Check if either type is a parent of the other
    for (const [parent, children] of Object.entries(resourceHierarchy)) {
      if (parent === type1 && children.includes(type2)) return true;
      if (parent === type2 && children.includes(type1)) return true;
    }

    return false;
  }

  /**
   * Group references by type and similarity
   */
  static groupReferences(references: EnhancedReference[]): ReferenceGroup[] {
    const groups: ReferenceGroup[] = [];

    // Group by resource type
    const byResourceType = this.groupByResourceType(references);
    groups.push(...byResourceType);

    // Group choice types
    const choiceTypes = references.filter(ref => ref.metadata?.isChoiceType);
    if (choiceTypes.length > 0) {
      groups.push(this.createChoiceTypeGroup(choiceTypes));
    }

    // Group inherited properties
    const inherited = references.filter(ref => ref.metadata?.isInherited);
    if (inherited.length > 0) {
      groups.push(this.createInheritedGroup(inherited));
    }

    return groups;
  }

  private static groupByResourceType(references: EnhancedReference[]): ReferenceGroup[] {
    const grouped = new Map<string, EnhancedReference[]>();

    for (const ref of references) {
      const resourceType = ref.context.resourceType;
      if (!grouped.has(resourceType)) {
        grouped.set(resourceType, []);
      }
      grouped.get(resourceType)!.push(ref);
    }

    return Array.from(grouped.entries()).map(([resourceType, refs]) => ({
      type: ReferenceGroupType.RESOURCE_TYPE,
      name: resourceType,
      description: `References in ${resourceType} resources`,
      references: refs,
      usagePatterns: this.calculateUsagePatterns(refs)
    }));
  }

  private static createChoiceTypeGroup(references: EnhancedReference[]): ReferenceGroup {
    return {
      type: ReferenceGroupType.CHOICE_TYPES,
      name: 'Choice Types',
      description: 'References to choice type properties (value[x])',
      references,
      usagePatterns: this.calculateUsagePatterns(references)
    };
  }

  private static createInheritedGroup(references: EnhancedReference[]): ReferenceGroup {
    return {
      type: ReferenceGroupType.INHERITED_PROPERTIES,
      name: 'Inherited Properties',
      description: 'References to properties inherited from base resources',
      references,
      usagePatterns: this.calculateUsagePatterns(references)
    };
  }

  private static calculateUsagePatterns(references: EnhancedReference[]): UsagePatternStats {
    const stats: UsagePatternStats = {
      total: references.length,
      reads: 0,
      conditions: 0,
      navigations: 0,
      filters: 0,
      selections: 0,
      existsChecks: 0,
      aggregations: 0
    };

    for (const ref of references) {
      switch (ref.usage) {
        case UsageType.READ:
          stats.reads++;
          break;
        case UsageType.CONDITION:
          stats.conditions++;
          break;
        case UsageType.NAVIGATION:
          stats.navigations++;
          break;
        case UsageType.FILTER:
          stats.filters++;
          break;
        case UsageType.SELECTION:
          stats.selections++;
          break;
        case UsageType.EXISTS_CHECK:
          stats.existsChecks++;
          break;
        case UsageType.AGGREGATION:
          stats.aggregations++;
          break;
      }
    }

    return stats;
  }
}