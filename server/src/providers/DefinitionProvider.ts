import {
  Location,
  LocationLink,
  Position,
  Range,
  Connection,
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

import {
  IDefinitionProvider,
  FHIRPathDefinition,
  FHIRPathSymbolKind,
} from '../types/SymbolTypes';

import { SymbolService } from '../services/SymbolService';
import { FHIRPathFunctionRegistry } from '../services/FHIRPathFunctionRegistry';
import { ModelProviderService, EnhancedTypeInfo, NavigationResult } from '../services/ModelProviderService';
import {
  EnhancedDefinition,
  DefinitionType,
  DefinitionContext,
  DefinitionResolutionResult,
  EnhancedDefinitionBuilder,
  DefinitionUtils,
  ChoiceTypeDefinitionContext,
  InheritanceDefinitionContext,
  FunctionDefinitionContext,
  FunctionParameter,
  FunctionExample
} from './EnhancedDefinitionTypes';

/**
 * Enhanced provider for go-to-definition functionality in FHIRPath expressions
 * with FHIR-aware ModelProvider integration
 */
export class DefinitionProvider implements IDefinitionProvider {
  private enhancedDefinitionBuilder: EnhancedDefinitionBuilder;

  constructor(
    private connection: Connection,
    private symbolService: SymbolService,
    private functionRegistry: FHIRPathFunctionRegistry,
    private modelProviderService?: ModelProviderService
  ) {
    this.enhancedDefinitionBuilder = new EnhancedDefinitionBuilder();
  }

  /**
   * Provide definition for symbol at the given position
   */
  async provideDefinition(
    document: TextDocument,
    position: Position
  ): Promise<Location[] | LocationLink[] | null> {
    try {
      this.connection.console.log(`Providing definition for ${document.uri} at ${JSON.stringify(position)}`);

      // Use enhanced definition resolution if ModelProvider is available
      if (this.modelProviderService) {
        const enhancedResult = await this.provideEnhancedDefinition(document, position);
        if (enhancedResult.definitions.length > 0) {
          return enhancedResult.definitions;
        }
      }

      // Fallback to basic definition resolution
      const symbol = this.symbolService.findSymbolAtPosition(document, position);
      if (!symbol) {
        this.connection.console.log('No symbol found at position');
        return null;
      }

      this.connection.console.log(`Found symbol: ${symbol.name} (${symbol.kind})`);

      const definitions = await this.findDefinitions(symbol, document);
      
      if (definitions.length === 0) {
        this.connection.console.log(`No definitions found for symbol: ${symbol.name}`);
        return null;
      }

      this.connection.console.log(`Found ${definitions.length} definitions`);
      return definitions;

    } catch (error) {
      this.connection.console.error(`Error providing definition: ${error}`);
      return null;
    }
  }

  /**
   * Provide enhanced FHIR-aware definition resolution
   */
  async provideEnhancedDefinition(
    document: TextDocument,
    position: Position
  ): Promise<DefinitionResolutionResult> {
    const startTime = Date.now();
    this.enhancedDefinitionBuilder.clear();

    try {
      // Extract context from document and position
      const context = this.extractDefinitionContext(document, position);
      
      // Get word at position
      const wordRange = this.getWordRangeAtPosition(document, position);
      if (!wordRange) {
        return { definitions: [], ambiguous: false, errors: [] };
      }

      const word = document.getText(wordRange);
      this.connection.console.log(`Resolving enhanced definition for: "${word}"`);

      // Resolve definitions based on context
      const definitions = await this.resolveEnhancedDefinitions(word, context, wordRange);

      const resolutionTime = Date.now() - startTime;
      this.connection.console.log(`Enhanced definition resolution completed in ${resolutionTime}ms for "${word}"`);

      return {
        definitions,
        ambiguous: definitions.length > 1,
        errors: []
      };

    } catch (error) {
      this.connection.console.error(`Error in enhanced definition resolution: ${error}`);
      return {
        definitions: [],
        ambiguous: false,
        errors: [{
          message: `Definition resolution failed: ${error}`,
          code: 'DEFINITION_ERROR',
          severity: 'error'
        }]
      };
    }
  }

  /**
   * Resolve enhanced definitions with FHIR context awareness
   */
  async resolveEnhancedDefinitions(
    word: string,
    context: DefinitionContext,
    wordRange: Range
  ): Promise<EnhancedDefinition[]> {
    const definitions: EnhancedDefinition[] = [];

    if (!this.modelProviderService) {
      return definitions;
    }

    try {
      // Check if it's a choice type property
      if (DefinitionUtils.isChoiceTypeProperty(word)) {
        const choiceDefinitions = await this.resolveChoiceTypeDefinition(word, context, wordRange);
        definitions.push(...choiceDefinitions);
      }

      // Check if it's an inherited property
      if (DefinitionUtils.isInheritedProperty(word)) {
        const inheritedDefinition = await this.resolveInheritedPropertyDefinition(word, context, wordRange);
        if (inheritedDefinition) {
          definitions.push(inheritedDefinition);
        }
      }

      // Check if it's a function
      if (this.functionRegistry.getFunction(word)) {
        const functionDefinition = await this.resolveFunctionDefinition(word, context, wordRange);
        if (functionDefinition) {
          definitions.push(functionDefinition);
        }
      }

      // Check if it's a resource type
      if (context.resourceType && word === context.resourceType) {
        const resourceDefinition = this.resolveResourceDefinition(word, wordRange);
        if (resourceDefinition) {
          definitions.push(resourceDefinition);
        }
      }

      // Check if it's a regular property with type information
      if (context.resourceType && context.currentPath) {
        const propertyDefinition = await this.resolvePropertyDefinition(word, context, wordRange);
        if (propertyDefinition) {
          definitions.push(propertyDefinition);
        }
      }

    } catch (error) {
      this.connection.console.error(`Error resolving enhanced definitions: ${error}`);
    }

    return definitions;
  }

  /**
   * Resolve choice type definitions (e.g., valueString, valueQuantity)
   */
  async resolveChoiceTypeDefinition(
    choiceProperty: string,
    context: DefinitionContext,
    wordRange: Range
  ): Promise<EnhancedDefinition[]> {
    if (!this.modelProviderService || !context.resourceType) {
      return [];
    }

    const baseProperty = DefinitionUtils.getChoiceBaseProperty(choiceProperty);
    const dataType = DefinitionUtils.getChoiceDataType(choiceProperty);

    try {
      const validationResult = await this.modelProviderService.validateChoiceProperty(
        context.resourceType,
        baseProperty
      );

      if (validationResult.isValid) {
        const choiceContext: ChoiceTypeDefinitionContext = {
          baseProperty,
          choiceProperty,
          availableChoices: validationResult.validChoices?.map(choice => ({
            name: choice,
            dataType: DefinitionUtils.getChoiceDataType(choice),
            description: `${choice} choice for ${baseProperty}`
          })) || [],
          currentChoice: {
            name: choiceProperty,
            dataType,
            description: `${dataType} value for ${baseProperty}`
          }
        };

        const targetUri = DefinitionUtils.getFhirDataTypeUrl(dataType);
        this.enhancedDefinitionBuilder.addChoiceTypeDefinition(choiceContext, targetUri, wordRange);
        
        return this.enhancedDefinitionBuilder.build();
      }
    } catch (error) {
      this.connection.console.error(`Error resolving choice type definition: ${error}`);
    }

    return [];
  }

  /**
   * Resolve inherited property definitions
   */
  async resolveInheritedPropertyDefinition(
    property: string,
    context: DefinitionContext,
    wordRange: Range
  ): Promise<EnhancedDefinition | null> {
    const hierarchy = DefinitionUtils.getInheritanceHierarchy(property);
    if (hierarchy.length === 0) {
      return null;
    }

    const inheritedFrom = hierarchy[hierarchy.length - 1]; // Most specific base class
    const inheritanceContext: InheritanceDefinitionContext = {
      property,
      inheritedFrom,
      isAbstract: false,
      hierarchy
    };

    const targetUri = DefinitionUtils.getFhirPropertyUrl(inheritedFrom, property);
    this.enhancedDefinitionBuilder.addInheritedPropertyDefinition(inheritanceContext, targetUri, wordRange);
    
    const definitions = this.enhancedDefinitionBuilder.build();
    return definitions.length > 0 ? definitions[0] : null;
  }

  /**
   * Resolve function definitions with enhanced context
   */
  async resolveFunctionDefinition(
    functionName: string,
    context: DefinitionContext,
    wordRange: Range
  ): Promise<EnhancedDefinition | null> {
    const func = this.functionRegistry.getFunction(functionName);
    if (!func) {
      return null;
    }

    const functionContext: FunctionDefinitionContext = {
      name: functionName,
      signature: func.signature || `${functionName}()`,
      parameters: func.parameters?.map((param: any) => ({
        name: param.name || 'parameter',
        type: param.type || 'any',
        optional: param.optional || false,
        description: param.description || 'Function parameter'
      })) || [],
      returnType: func.returnType || 'any',
      description: func.description || `${functionName} function`,
      examples: func.examples?.map((example: any) => ({
        expression: example.expression || `${functionName}()`,
        context: example.context || 'Patient',
        result: example.result || 'Result',
        description: example.description || 'Usage example'
      })) || [],
      category: func.category || 'utility'
    };

    const targetUri = DefinitionUtils.getFhirPathFunctionUrl(functionName);
    this.enhancedDefinitionBuilder.addFunctionDefinition(functionContext, targetUri, wordRange);
    
    const definitions = this.enhancedDefinitionBuilder.build();
    return definitions.length > 0 ? definitions[0] : null;
  }

  /**
   * Resolve resource type definitions
   */
  resolveResourceDefinition(
    resourceName: string,
    wordRange: Range
  ): EnhancedDefinition | null {
    const targetUri = DefinitionUtils.getFhirResourceUrl(resourceName);
    this.enhancedDefinitionBuilder.addResourceDefinition(resourceName, targetUri, wordRange);
    
    const definitions = this.enhancedDefinitionBuilder.build();
    return definitions.length > 0 ? definitions[0] : null;
  }

  /**
   * Resolve property definitions with type information
   */
  async resolvePropertyDefinition(
    property: string,
    context: DefinitionContext,
    wordRange: Range
  ): Promise<EnhancedDefinition | null> {
    if (!this.modelProviderService || !context.resourceType) {
      return null;
    }

    try {
      const propertyPath = [...(context.currentPath || []), property];
      const navigationResult = await this.modelProviderService.navigatePropertyPath(
        context.resourceType,
        propertyPath
      );

      if (navigationResult.isValid && navigationResult.finalType) {
        const targetUri = DefinitionUtils.getFhirPropertyUrl(context.resourceType, property);
        this.enhancedDefinitionBuilder.addPropertyDefinition(
          property,
          context.resourceType,
          targetUri,
          wordRange
        );
        
        const definitions = this.enhancedDefinitionBuilder.build();
        return definitions.length > 0 ? definitions[0] : null;
      }
    } catch (error) {
      this.connection.console.error(`Error resolving property definition: ${error}`);
    }

    return null;
  }

  /**
   * Extract definition context from document and position
   */
  extractDefinitionContext(document: TextDocument, position: Position): DefinitionContext {
    const text = document.getText();
    const line = document.getText({
      start: { line: position.line, character: 0 },
      end: { line: position.line + 1, character: 0 }
    });

    // Extract resource type from document context
    const resourceType = this.extractResourceTypeFromDocument(text);
    
    // Extract current property path
    const currentPath = this.extractPropertyPath(line, position.character);

    return {
      resourceType,
      currentPath,
      position: { line: position.line, character: position.character }
    };
  }

  /**
   * Get word range at position
   */
  getWordRangeAtPosition(document: TextDocument, position: Position): Range | null {
    const text = document.getText();
    const offset = document.offsetAt(position);
    
    // Find word boundaries
    let start = offset;
    let end = offset;
    
    const wordPattern = /[a-zA-Z_$][a-zA-Z0-9_$]*/;
    
    // Move start backwards to find word start
    while (start > 0 && wordPattern.test(text.charAt(start - 1))) {
      start--;
    }
    
    // Move end forwards to find word end
    while (end < text.length && wordPattern.test(text.charAt(end))) {
      end++;
    }
    
    if (start === end) {
      return null;
    }
    
    return {
      start: document.positionAt(start),
      end: document.positionAt(end)
    };
  }

  /**
   * Extract resource type from document text
   */
  extractResourceTypeFromDocument(text: string): string | undefined {
    // Look for patterns like "Patient.name" or "@Patient" 
    const resourceTypeMatch = text.match(/\b([A-Z]\w*)\./);
    if (resourceTypeMatch) {
      return resourceTypeMatch[1];
    }

    // Look for explicit resource type declarations
    const declarationMatch = text.match(/@([A-Z]\w*)/);
    if (declarationMatch) {
      return declarationMatch[1];
    }

    return undefined;
  }

  /**
   * Extract property path from line text
   */
  extractPropertyPath(lineText: string, position: number): string[] {
    // Extract the property path up to the current position
    const textUpToPosition = lineText.substring(0, position);
    const pathMatch = textUpToPosition.match(/([A-Z]\w*(?:\.\w+)*)/);
    
    if (pathMatch) {
      const path = pathMatch[1];
      const parts = path.split('.');
      // Remove the resource type (first part) and return property path
      return parts.length > 1 ? parts.slice(1) : [];
    }
    
    return [];
  }

  /**
   * Find definitions for a symbol (fallback method)
   */
  private async findDefinitions(
    symbol: any,
    document: TextDocument
  ): Promise<LocationLink[]> {
    const definitions: LocationLink[] = [];

    switch (symbol.kind) {
      case FHIRPathSymbolKind.Function:
        const functionDefinition = await this.findFunctionDefinition(symbol.name);
        if (functionDefinition) {
          definitions.push(functionDefinition);
        }
        break;

      case FHIRPathSymbolKind.Property:
        const propertyDefinition = await this.findPropertyDefinition(symbol);
        if (propertyDefinition) {
          definitions.push(propertyDefinition);
        }
        break;

      case FHIRPathSymbolKind.Resource:
        const resourceDefinition = await this.findResourceDefinition(symbol.name);
        if (resourceDefinition) {
          definitions.push(resourceDefinition);
        }
        break;

      default:
        this.connection.console.log(`No definition support for symbol kind: ${symbol.kind}`);
        break;
    }

    return definitions;
  }

  /**
   * Find definition for a function
   */
  private async findFunctionDefinition(functionName: string): Promise<LocationLink | null> {
    try {
      // Check if it's a built-in function
      const functions = this.functionRegistry.getFunctions();
      const func = functions.find(f => f.name === functionName);
      
      if (func) {
        // Create a virtual location pointing to FHIRPath specification
        const specUrl = this.getFHIRPathSpecUrl(functionName);
        
        // For now, create a LocationLink with a comment about the specification
        // In a real implementation, this could point to local documentation files
        return {
          targetUri: specUrl || 'https://hl7.org/fhirpath/',
          targetRange: Range.create(0, 0, 0, 0),
          targetSelectionRange: Range.create(0, 0, 0, 0),
          originSelectionRange: Range.create(0, 0, 0, 0) // Will be filled by caller
        };
      }

      return null;
    } catch (error) {
      this.connection.console.error(`Error finding function definition: ${error}`);
      return null;
    }
  }

  /**
   * Find definition for a FHIR property
   */
  private async findPropertyDefinition(symbol: any): Promise<LocationLink | null> {
    try {
      const resourceType = symbol.context || this.extractResourceFromPath(symbol.fhirPath);
      
      if (resourceType && this.isFHIRResource(resourceType)) {
        // Create a link to FHIR specification for the property
        const specUrl = this.getFHIRPropertySpecUrl(resourceType, symbol.name);
        
        return {
          targetUri: specUrl || `https://hl7.org/fhir/${resourceType.toLowerCase()}.html`,
          targetRange: Range.create(0, 0, 0, 0),
          targetSelectionRange: Range.create(0, 0, 0, 0),
          originSelectionRange: Range.create(0, 0, 0, 0)
        };
      }

      return null;
    } catch (error) {
      this.connection.console.error(`Error finding property definition: ${error}`);
      return null;
    }
  }

  /**
   * Find definition for a FHIR resource
   */
  private async findResourceDefinition(resourceName: string): Promise<LocationLink | null> {
    try {
      if (this.isFHIRResource(resourceName)) {
        const specUrl = this.getFHIRResourceSpecUrl(resourceName);
        
        return {
          targetUri: specUrl || `https://hl7.org/fhir/${resourceName.toLowerCase()}.html`,
          targetRange: Range.create(0, 0, 0, 0),
          targetSelectionRange: Range.create(0, 0, 0, 0),
          originSelectionRange: Range.create(0, 0, 0, 0)
        };
      }

      return null;
    } catch (error) {
      this.connection.console.error(`Error finding resource definition: ${error}`);
      return null;
    }
  }

  /**
   * Get FHIRPath specification URL for a function
   */
  private getFHIRPathSpecUrl(functionName: string): string | null {
    // Map common functions to their specification sections
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
      'exclude': 'https://hl7.org/fhirpath/#exclude'
    };

    return functionUrls[functionName.toLowerCase()] || null;
  }

  /**
   * Get FHIR specification URL for a resource
   */
  private getFHIRResourceSpecUrl(resourceName: string): string | null {
    // All FHIR resources follow the same URL pattern
    return `https://hl7.org/fhir/${resourceName.toLowerCase()}.html`;
  }

  /**
   * Get FHIR specification URL for a property
   */
  private getFHIRPropertySpecUrl(resourceName: string, propertyName: string): string | null {
    // Property definitions are typically on the resource page with anchors
    return `https://hl7.org/fhir/${resourceName.toLowerCase()}.html#${propertyName}`;
  }

  /**
   * Extract resource type from FHIR path
   */
  private extractResourceFromPath(fhirPath?: string): string | null {
    if (!fhirPath) return null;
    
    const parts = fhirPath.split('.');
    return parts.length > 0 ? parts[0] : null;
  }

  /**
   * Check if a name is a FHIR resource
   */
  private isFHIRResource(name: string): boolean {
    const commonResources = [
      'Patient', 'Practitioner', 'Organization', 'Observation',
      'Condition', 'Procedure', 'MedicationRequest', 'DiagnosticReport',
      'Encounter', 'Bundle', 'OperationOutcome', 'Device', 'Location',
      'AllergyIntolerance', 'CarePlan', 'CareTeam', 'Claim', 'Coverage',
      'ImagingStudy', 'Immunization', 'Media', 'Medication', 'Person',
      'Questionnaire', 'QuestionnaireResponse', 'RelatedPerson', 'Schedule',
      'ServiceRequest', 'Specimen', 'StructureDefinition', 'ValueSet'
    ];
    return commonResources.includes(name);
  }

  /**
   * Create a simple Location for local definitions
   */
  private createLocation(uri: string, range: Range): Location {
    return {
      uri,
      range
    };
  }

  /**
   * Create a LocationLink with additional context
   */
  private createLocationLink(
    targetUri: string,
    targetRange: Range,
    originRange: Range
  ): LocationLink {
    return {
      targetUri,
      targetRange,
      targetSelectionRange: targetRange,
      originSelectionRange: originRange
    };
  }
}