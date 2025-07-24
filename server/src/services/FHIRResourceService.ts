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
  private resourceDefinitions: Map<string, FHIRResourceDefinition> = new Map();

  constructor() {
    this.initializeResourceDefinitions();
  }

  private initializeResourceDefinitions(): void {
    // Patient resource definition
    this.resourceDefinitions.set('Patient', {
      name: 'Patient',
      description: 'Demographics and other administrative information about an individual or animal receiving care or other health-related services.',
      baseType: 'DomainResource',
      properties: [
        {
          name: 'id',
          type: 'id',
          cardinality: '0..1',
          description: 'Logical id of this artifact'
        },
        {
          name: 'meta',
          type: 'Meta',
          cardinality: '0..1',
          description: 'Metadata about the resource'
        },
        {
          name: 'implicitRules',
          type: 'uri',
          cardinality: '0..1',
          description: 'A set of rules under which this content was created'
        },
        {
          name: 'language',
          type: 'code',
          cardinality: '0..1',
          description: 'Language of the resource content'
        },
        {
          name: 'text',
          type: 'Narrative',
          cardinality: '0..1',
          description: 'Text summary of the resource, for human interpretation'
        },
        {
          name: 'extension',
          type: 'Extension',
          cardinality: '0..*',
          description: 'Additional content defined by implementations'
        },
        {
          name: 'modifierExtension',
          type: 'Extension',
          cardinality: '0..*',
          description: 'Extensions that cannot be ignored'
        },
        {
          name: 'identifier',
          type: 'Identifier',
          cardinality: '0..*',
          description: 'An identifier for this patient'
        },
        {
          name: 'active',
          type: 'boolean',
          cardinality: '0..1',
          description: 'Whether this patient record is in active use'
        },
        {
          name: 'name',
          type: 'HumanName',
          cardinality: '0..*',
          description: 'A name associated with the patient'
        },
        {
          name: 'telecom',
          type: 'ContactPoint',
          cardinality: '0..*',
          description: 'A contact detail for the patient'
        },
        {
          name: 'gender',
          type: 'code',
          cardinality: '0..1',
          description: 'male | female | other | unknown',
          binding: {
            strength: 'required',
            valueSet: 'http://hl7.org/fhir/ValueSet/administrative-gender'
          },
          choices: ['male', 'female', 'other', 'unknown']
        },
        {
          name: 'birthDate',
          type: 'date',
          cardinality: '0..1',
          description: 'The date of birth for the patient'
        },
        {
          name: 'deceased',
          type: 'boolean | dateTime',
          cardinality: '0..1',
          description: 'Indicates if the patient is deceased or not'
        },
        {
          name: 'address',
          type: 'Address',
          cardinality: '0..*',
          description: 'An address for the patient'
        },
        {
          name: 'maritalStatus',
          type: 'CodeableConcept',
          cardinality: '0..1',
          description: 'Marital (civil) status of a patient'
        },
        {
          name: 'multipleBirth',
          type: 'boolean | integer',
          cardinality: '0..1',
          description: 'Whether patient is part of a multiple birth'
        },
        {
          name: 'photo',
          type: 'Attachment',
          cardinality: '0..*',
          description: 'Image of the patient'
        },
        {
          name: 'contact',
          type: 'BackboneElement',
          cardinality: '0..*',
          description: 'A contact party for the patient',
          isBackboneElement: true,
          properties: [
            {
              name: 'relationship',
              type: 'CodeableConcept',
              cardinality: '0..*',
              description: 'The kind of relationship'
            },
            {
              name: 'name',
              type: 'HumanName',
              cardinality: '0..1',
              description: 'A name associated with the contact person'
            },
            {
              name: 'telecom',
              type: 'ContactPoint',
              cardinality: '0..*',
              description: 'A contact detail for the person'
            },
            {
              name: 'address',
              type: 'Address',
              cardinality: '0..1',
              description: 'Address for the contact person'
            },
            {
              name: 'gender',
              type: 'code',
              cardinality: '0..1',
              description: 'male | female | other | unknown'
            },
            {
              name: 'organization',
              type: 'Reference(Organization)',
              cardinality: '0..1',
              description: 'Organization that is associated with the contact'
            },
            {
              name: 'period',
              type: 'Period',
              cardinality: '0..1',
              description: 'The period during which this contact person or organization is valid to be contacted relating to this patient'
            }
          ]
        },
        {
          name: 'communication',
          type: 'BackboneElement',
          cardinality: '0..*',
          description: 'A language which may be used to communicate with the patient about his or her health',
          isBackboneElement: true,
          properties: [
            {
              name: 'language',
              type: 'CodeableConcept',
              cardinality: '1..1',
              description: 'The language which can be used to communicate with the patient about his or her health'
            },
            {
              name: 'preferred',
              type: 'boolean',
              cardinality: '0..1',
              description: 'Language preference indicator'
            }
          ]
        },
        {
          name: 'generalPractitioner',
          type: 'Reference(Organization | Practitioner | PractitionerRole)',
          cardinality: '0..*',
          description: "Patient's nominated primary care provider"
        },
        {
          name: 'managingOrganization',
          type: 'Reference(Organization)',
          cardinality: '0..1',
          description: 'Organization that is the custodian of the patient record'
        },
        {
          name: 'link',
          type: 'BackboneElement',
          cardinality: '0..*',
          description: 'Link to a Patient or RelatedPerson resource that concerns the same actual individual',
          isBackboneElement: true,
          properties: [
            {
              name: 'other',
              type: 'Reference(Patient | RelatedPerson)',
              cardinality: '1..1',
              description: 'The other patient or related person resource that the link refers to'
            },
            {
              name: 'type',
              type: 'code',
              cardinality: '1..1',
              description: 'replaced-by | replaces | refer | seealso',
              binding: {
                strength: 'required',
                valueSet: 'http://hl7.org/fhir/ValueSet/link-type'
              },
              choices: ['replaced-by', 'replaces', 'refer', 'seealso']
            }
          ]
        }
      ]
    });

    // Observation resource definition
    this.resourceDefinitions.set('Observation', {
      name: 'Observation',
      description: 'Measurements and simple assertions made about a patient, device or other subject.',
      baseType: 'DomainResource',
      properties: [
        {
          name: 'id',
          type: 'id',
          cardinality: '0..1',
          description: 'Logical id of this artifact'
        },
        {
          name: 'meta',
          type: 'Meta',
          cardinality: '0..1',
          description: 'Metadata about the resource'
        },
        {
          name: 'identifier',
          type: 'Identifier',
          cardinality: '0..*',
          description: 'Business Identifier for observation'
        },
        {
          name: 'basedOn',
          type: 'Reference',
          cardinality: '0..*',
          description: 'Fulfills plan, proposal or order'
        },
        {
          name: 'partOf',
          type: 'Reference',
          cardinality: '0..*',
          description: 'Part of referenced event'
        },
        {
          name: 'status',
          type: 'code',
          cardinality: '1..1',
          description: 'registered | preliminary | final | amended | corrected | cancelled | entered-in-error | unknown',
          binding: {
            strength: 'required',
            valueSet: 'http://hl7.org/fhir/ValueSet/observation-status'
          },
          choices: ['registered', 'preliminary', 'final', 'amended', 'corrected', 'cancelled', 'entered-in-error', 'unknown']
        },
        {
          name: 'category',
          type: 'CodeableConcept',
          cardinality: '0..*',
          description: 'Classification of type of observation'
        },
        {
          name: 'code',
          type: 'CodeableConcept',
          cardinality: '1..1',
          description: 'Type of observation (code / type)'
        },
        {
          name: 'subject',
          type: 'Reference(Patient | Group | Device | Location)',
          cardinality: '0..1',
          description: 'Who and/or what this observation is about'
        },
        {
          name: 'focus',
          type: 'Reference',
          cardinality: '0..*',
          description: 'What the observation is about, when it is not about the subject of record'
        },
        {
          name: 'encounter',
          type: 'Reference(Encounter)',
          cardinality: '0..1',
          description: 'Healthcare event during which this observation is made'
        },
        {
          name: 'effective',
          type: 'dateTime | Period | Timing | instant',
          cardinality: '0..1',
          description: 'Clinically relevant time/time-period for observation'
        },
        {
          name: 'issued',
          type: 'instant',
          cardinality: '0..1',
          description: 'Date/Time this version was made available'
        },
        {
          name: 'performer',
          type: 'Reference',
          cardinality: '0..*',
          description: 'Who performed the observation'
        },
        {
          name: 'value',
          type: 'Quantity | CodeableConcept | string | boolean | integer | Range | Ratio | SampledData | time | dateTime | Period',
          cardinality: '0..1',
          description: 'The information determined as a result of making the observation, if the information has a simple scalar value'
        },
        {
          name: 'dataAbsentReason',
          type: 'CodeableConcept',
          cardinality: '0..1',
          description: 'Why the result is missing'
        },
        {
          name: 'interpretation',
          type: 'CodeableConcept',
          cardinality: '0..*',
          description: 'High, low, normal, etc.'
        },
        {
          name: 'note',
          type: 'Annotation',
          cardinality: '0..*',
          description: 'Comments about the observation'
        },
        {
          name: 'bodySite',
          type: 'CodeableConcept',
          cardinality: '0..1',
          description: 'Observed body part'
        },
        {
          name: 'method',
          type: 'CodeableConcept',
          cardinality: '0..1',
          description: 'How it was done'
        },
        {
          name: 'specimen',
          type: 'Reference(Specimen)',
          cardinality: '0..1',
          description: 'The specimen that was used when this observation was made'
        },
        {
          name: 'device',
          type: 'Reference(Device | DeviceMetric)',
          cardinality: '0..1',
          description: '(Measurement) Device'
        },
        {
          name: 'referenceRange',
          type: 'BackboneElement',
          cardinality: '0..*',
          description: 'Provides guide for interpretation',
          isBackboneElement: true,
          properties: [
            {
              name: 'low',
              type: 'SimpleQuantity',
              cardinality: '0..1',
              description: 'Low Range, if relevant'
            },
            {
              name: 'high',
              type: 'SimpleQuantity',
              cardinality: '0..1',
              description: 'High Range, if relevant'
            },
            {
              name: 'type',
              type: 'CodeableConcept',
              cardinality: '0..1',
              description: 'Reference range qualifier'
            },
            {
              name: 'appliesTo',
              type: 'CodeableConcept',
              cardinality: '0..*',
              description: 'Reference range population'
            },
            {
              name: 'age',
              type: 'Range',
              cardinality: '0..1',
              description: 'Applicable age range, if relevant'
            },
            {
              name: 'text',
              type: 'string',
              cardinality: '0..1',
              description: 'Text based reference range in an observation'
            }
          ]
        },
        {
          name: 'hasMember',
          type: 'Reference(Observation | QuestionnaireResponse | MolecularSequence)',
          cardinality: '0..*',
          description: 'Related resource that belongs to the Observation group'
        },
        {
          name: 'derivedFrom',
          type: 'Reference',
          cardinality: '0..*',
          description: 'Related measurements the observation is made from'
        },
        {
          name: 'component',
          type: 'BackboneElement',
          cardinality: '0..*',
          description: 'Component observations',
          isBackboneElement: true,
          properties: [
            {
              name: 'code',
              type: 'CodeableConcept',
              cardinality: '1..1',
              description: 'Type of component observation (code / type)'
            },
            {
              name: 'value',
              type: 'Quantity | CodeableConcept | string | boolean | integer | Range | Ratio | SampledData | time | dateTime | Period',
              cardinality: '0..1',
              description: 'The information determined as a result of making the observation, if the information has a simple scalar value'
            },
            {
              name: 'dataAbsentReason',
              type: 'CodeableConcept',
              cardinality: '0..1',
              description: 'Why the component result is missing'
            },
            {
              name: 'interpretation',
              type: 'CodeableConcept',
              cardinality: '0..*',
              description: 'High, low, normal, etc.'
            },
            {
              name: 'referenceRange',
              type: 'BackboneElement',
              cardinality: '0..*',
              description: 'Provides guide for interpretation of component result'
            }
          ]
        }
      ]
    });

    // Add more resource definitions as needed
    // For now, we'll add basic definitions for other common resources
    this.addBasicResourceDefinitions();
  }

  private addBasicResourceDefinitions(): void {
    const basicResources = [
      'Condition', 'Procedure', 'MedicationRequest', 'DiagnosticReport', 
      'Encounter', 'Organization', 'Practitioner', 'Location', 'Device',
      'Medication', 'Substance', 'AllergyIntolerance', 'Immunization'
    ];

    basicResources.forEach(resourceName => {
      this.resourceDefinitions.set(resourceName, {
        name: resourceName,
        description: `FHIR ${resourceName} resource`,
        baseType: 'DomainResource',
        properties: [
          {
            name: 'id',
            type: 'id',
            cardinality: '0..1',
            description: 'Logical id of this artifact'
          },
          {
            name: 'meta',
            type: 'Meta',
            cardinality: '0..1',
            description: 'Metadata about the resource'
          },
          {
            name: 'identifier',
            type: 'Identifier',
            cardinality: '0..*',
            description: 'Business identifier'
          },
          {
            name: 'status',
            type: 'code',
            cardinality: '0..1',
            description: 'Status of the resource'
          }
        ]
      });
    });
  }

  getResourceDefinition(resourceType: string): FHIRResourceDefinition | undefined {
    return this.resourceDefinitions.get(resourceType);
  }

  getResourceProperty(resourceType: string, propertyName: string): FHIRResourceProperty | undefined {
    const resource = this.resourceDefinitions.get(resourceType);
    if (!resource) {
      return undefined;
    }

    return this.findPropertyInResource(resource, propertyName);
  }

  private findPropertyInResource(resource: FHIRResourceDefinition, propertyName: string): FHIRResourceProperty | undefined {
    // Direct property search
    const directProperty = resource.properties.find(prop => prop.name === propertyName);
    if (directProperty) {
      return directProperty;
    }

    // Search in backbone elements
    for (const property of resource.properties) {
      if (property.isBackboneElement && property.properties) {
        const nestedProperty = property.properties.find(nested => nested.name === propertyName);
        if (nestedProperty) {
          return nestedProperty;
        }
      }
    }

    return undefined;
  }

  validatePropertyPath(resourceType: string, propertyPath: string): {
    isValid: boolean;
    errors: string[];
    suggestions: string[];
  } {
    const errors: string[] = [];
    const suggestions: string[] = [];

    const resource = this.resourceDefinitions.get(resourceType);
    if (!resource) {
      errors.push(`Unknown FHIR resource type: ${resourceType}`);
      return { isValid: false, errors, suggestions };
    }

    const pathParts = propertyPath.split('.');
    let currentResource = resource;
    let currentPath = '';

    for (let i = 0; i < pathParts.length; i++) {
      const part = pathParts[i];
      currentPath = currentPath ? `${currentPath}.${part}` : part;

      const property = this.findPropertyInResource(currentResource, part);
      if (!property) {
        errors.push(`Property '${part}' not found in ${currentResource.name}${i > 0 ? ` at path '${currentPath}'` : ''}`);
        
        // Suggest similar property names
        const availableProperties = currentResource.properties.map(p => p.name);
        const similarProperties = availableProperties.filter(prop => 
          prop.toLowerCase().includes(part.toLowerCase()) || 
          part.toLowerCase().includes(prop.toLowerCase())
        );
        
        if (similarProperties.length > 0) {
          suggestions.push(`Did you mean one of: ${similarProperties.join(', ')}?`);
        }
        
        return { isValid: false, errors, suggestions };
      }

      // If this is not the last part, check if we can continue navigation
      if (i < pathParts.length - 1) {
        // For complex types, we would need to load their definitions
        // For now, we'll allow navigation if it's a known complex type
        if (this.isComplexType(property.type)) {
          // In a real implementation, we would load the complex type definition
          // For now, we'll assume it's valid
          continue;
        } else if (property.type.includes('Reference(')) {
          // Handle references - extract the referenced resource type
          const referencedTypes = this.extractReferencedTypes(property.type);
          if (referencedTypes.length > 0) {
            // For simplicity, use the first referenced type
            const referencedResource = this.resourceDefinitions.get(referencedTypes[0]);
            if (referencedResource) {
              currentResource = referencedResource;
              continue;
            }
          }
        }
      }
    }

    return { isValid: true, errors, suggestions };
  }

  private isComplexType(type: string): boolean {
    const complexTypes = [
      'HumanName', 'Address', 'ContactPoint', 'Identifier', 'CodeableConcept',
      'Coding', 'Quantity', 'Range', 'Ratio', 'Period', 'Attachment', 'Annotation',
      'Meta', 'Narrative', 'Extension', 'BackboneElement'
    ];
    
    return complexTypes.some(complexType => type.includes(complexType));
  }

  private extractReferencedTypes(referenceType: string): string[] {
    const match = referenceType.match(/Reference\\(([^)]+)\\)/);
    if (match) {
      return match[1].split('|').map(type => type.trim());
    }
    return [];
  }

  getAllResourceTypes(): string[] {
    return Array.from(this.resourceDefinitions.keys());
  }

  getResourceProperties(resourceType: string): FHIRResourceProperty[] {
    const resource = this.resourceDefinitions.get(resourceType);
    return resource ? resource.properties : [];
  }
}