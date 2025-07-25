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

/**
 * Provider for go-to-definition functionality in FHIRPath expressions
 */
export class DefinitionProvider implements IDefinitionProvider {
  constructor(
    private connection: Connection,
    private symbolService: SymbolService,
    private functionRegistry: FHIRPathFunctionRegistry
  ) {}

  /**
   * Provide definition for symbol at the given position
   */
  async provideDefinition(
    document: TextDocument,
    position: Position
  ): Promise<Location[] | LocationLink[] | null> {
    try {
      this.connection.console.log(`Providing definition for ${document.uri} at ${JSON.stringify(position)}`);

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
   * Find definitions for a symbol
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