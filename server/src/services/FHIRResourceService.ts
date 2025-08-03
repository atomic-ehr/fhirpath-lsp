export interface FHIRResourceProperty {
  name: string;
  type: string;
  cardinality: string;
  description: string;
  binding?: {
    strength: 'required' | 'extensible' | 'preferred' | 'example';
    valueSet?: string;
  };
  choices?: string[];
  isBackboneElement?: boolean;
  properties?: FHIRResourceProperty[];
}

export interface FHIRResourceDefinition {
  name: string;
  description: string;
  baseType?: string;
  properties: FHIRResourceProperty[];
  constraints?: string[];
}

export class FHIRResourceService {
  private fhirPathService?: any; // FHIRPathService injection

  constructor(fhirPathService?: any) {
    this.fhirPathService = fhirPathService;
    
    if (!this.fhirPathService) {
      console.warn('FHIRResourceService: No FHIRPathService provided. ModelProvider features will not be available.');
    }
  }


  getResourceDefinition(resourceType: string): FHIRResourceDefinition | undefined {
    if (!this.fhirPathService) {
      console.warn(`FHIRResourceService: Cannot get resource definition for ${resourceType} - no FHIRPathService available`);
      return undefined;
    }

    try {
      const properties = this.fhirPathService.getResourcePropertyDetails(resourceType);
      if (properties.length > 0) {
        return {
          name: resourceType,
          description: `FHIR ${resourceType} resource (from model provider)`,
          baseType: 'DomainResource',
          properties: properties.map((prop: any) => ({
            name: prop.name,
            type: prop.type,
            cardinality: prop.cardinality || '0..1',
            description: prop.description || `Property ${prop.name} of ${resourceType}`,
            binding: prop.binding,
            choices: prop.choices,
            isBackboneElement: prop.isBackboneElement,
            properties: prop.properties
          }))
        };
      }
    } catch (error) {
      console.warn(`Failed to get resource definition for ${resourceType} from model provider:`, error);
    }
    
    return undefined;
  }

  getResourceProperty(resourceType: string, propertyName: string): FHIRResourceProperty | undefined {
    if (!this.fhirPathService) {
      console.warn(`FHIRResourceService: Cannot get property ${propertyName} for ${resourceType} - no FHIRPathService available`);
      return undefined;
    }

    try {
      const properties = this.fhirPathService.getResourcePropertyDetails(resourceType);
      const property = properties.find((prop: any) => prop.name === propertyName);
      
      if (property) {
        return {
          name: property.name,
          type: property.type,
          cardinality: property.cardinality || '0..1',
          description: property.description || `Property ${property.name} of ${resourceType}`,
          binding: property.binding,
          choices: property.choices,
          isBackboneElement: property.isBackboneElement,
          properties: property.properties
        };
      }
    } catch (error) {
      console.warn(`Failed to get property ${propertyName} for ${resourceType} from model provider:`, error);
    }

    return undefined;
  }


  validatePropertyPath(resourceType: string, propertyPath: string): {
    isValid: boolean;
    errors: string[];
    suggestions: string[];
  } {
    if (!this.fhirPathService) {
      return {
        isValid: false,
        errors: ['FHIRResourceService: Cannot validate property path - no FHIRPathService available'],
        suggestions: []
      };
    }

    try {
      // Use FHIRPathService validation if available
      if (this.fhirPathService.validateExpressionType) {
        const validation = this.fhirPathService.validateExpressionType(propertyPath, undefined, resourceType);
        return {
          isValid: validation.isValid,
          errors: validation.errors || [],
          suggestions: validation.suggestions || []
        };
      }

      // Basic validation using model provider
      const resourceProperties = this.fhirPathService.getResourcePropertyDetails(resourceType);
      if (resourceProperties.length === 0) {
        return {
          isValid: false,
          errors: [`Unknown FHIR resource type: ${resourceType}`],
          suggestions: []
        };
      }

      const pathParts = propertyPath.split('.');
      const firstProperty = resourceProperties.find((prop: any) => prop.name === pathParts[0]);
      
      if (!firstProperty) {
        const availableProperties = resourceProperties.map((prop: any) => prop.name);
        const similarProperties = availableProperties.filter((prop: string) => 
          prop.toLowerCase().includes(pathParts[0].toLowerCase()) || 
          pathParts[0].toLowerCase().includes(prop.toLowerCase())
        );
        
        return {
          isValid: false,
          errors: [`Property '${pathParts[0]}' not found in ${resourceType}`],
          suggestions: similarProperties.length > 0 ? [`Did you mean one of: ${similarProperties.join(', ')}?`] : []
        };
      }

      return { isValid: true, errors: [], suggestions: [] };
    } catch (error) {
      return {
        isValid: false,
        errors: [`Error validating property path: ${error}`],
        suggestions: []
      };
    }
  }


  getAllResourceTypes(): string[] {
    if (!this.fhirPathService) {
      console.warn('FHIRResourceService: Cannot get resource types - no FHIRPathService available');
      return [];
    }

    try {
      return this.fhirPathService.getAvailableResourceTypes();
    } catch (error) {
      console.warn('Failed to get resource types from model provider:', error);
      return [];
    }
  }

  getResourceProperties(resourceType: string): FHIRResourceProperty[] {
    if (!this.fhirPathService) {
      console.warn(`FHIRResourceService: Cannot get properties for ${resourceType} - no FHIRPathService available`);
      return [];
    }

    try {
      const properties = this.fhirPathService.getResourcePropertyDetails(resourceType);
      return properties.map((prop: any) => ({
        name: prop.name,
        type: prop.type,
        cardinality: prop.cardinality || '0..1',
        description: prop.description || `Property ${prop.name} of ${resourceType}`,
        binding: prop.binding,
        choices: prop.choices,
        isBackboneElement: prop.isBackboneElement,
        properties: prop.properties
      }));
    } catch (error) {
      console.warn(`Failed to get properties for ${resourceType} from model provider:`, error);
      return [];
    }
  }
}