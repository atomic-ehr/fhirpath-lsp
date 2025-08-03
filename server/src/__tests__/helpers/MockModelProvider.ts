import type {
  ModelTypeProvider,
  TypeInfo,
  TypeName
} from '@atomic-ehr/fhirpath';

/**
 * Comprehensive mock ModelProvider for testing with realistic FHIR data structures
 */
export class MockModelProvider implements ModelTypeProvider {
  private types = new Map<string, TypeInfo>();
  private elementMappings = new Map<string, Map<string, TypeInfo>>();
  private initialized = false;

  constructor() {
    this.initializeMockData();
  }

  /**
   * Get type information for a given type name
   */
  getType(typeName: string): TypeInfo | undefined {
    return this.types.get(typeName);
  }

  /**
   * Get element type for a property on a parent type
   */
  getElementType(parentType: TypeInfo, propertyName: string): TypeInfo | undefined {
    const parentKey = (parentType as any).type?.name || parentType.name;
    const elementMap = this.elementMappings.get(parentKey);
    return elementMap?.get(propertyName);
  }

  /**
   * Get all element names for a parent type
   */
  getElementNames(parentType: TypeInfo): string[] {
    const parentKey = (parentType as any).type?.name || parentType.name;
    const elementMap = this.elementMappings.get(parentKey);
    return elementMap ? Array.from(elementMap.keys()) : [];
  }

  /**
   * Filter type to specific choice type
   */
  ofType(type: TypeInfo, typeName: TypeName): TypeInfo {
    const modelContext = (type as any).modelContext;
    
    if (modelContext?.isUnion && modelContext?.choices) {
      const targetChoice = modelContext.choices.find((c: any) => 
        c.type?.name === typeName.name || c.choiceName === typeName.name
      );
      
      if (targetChoice) {
        return {
          ...type,
          type: targetChoice.type,
          singleton: true,
          modelContext: {
            ...modelContext,
            isUnion: false,
            choiceType: targetChoice.choiceName
          }
        } as TypeInfo;
      }
    }
    
    return type;
  }

  /**
   * Check if this is a mock provider (for testing identification)
   */
  isMockProvider(): boolean {
    return true;
  }

  /**
   * Get all available type names (for testing)
   */
  getAllTypeNames(): string[] {
    return Array.from(this.types.keys());
  }

  /**
   * Initialize mock data with comprehensive FHIR types
   */
  private initializeMockData(): void {
    if (this.initialized) return;

    // Base types
    this.createBaseTypes();
    
    // Resource hierarchy
    this.createResourceHierarchy();
    
    // Core FHIR resources
    this.createPatientType();
    this.createObservationType();
    this.createConditionType();
    this.createProcedureType();
    this.createMedicationRequestType();
    this.createOrganizationType();
    
    // Complex data types
    this.createComplexDataTypes();
    
    this.initialized = true;
  }

  private createBaseTypes(): void {
    // Primitive types
    this.types.set('string', this.createPrimitiveType('string'));
    this.types.set('boolean', this.createPrimitiveType('boolean'));
    this.types.set('integer', this.createPrimitiveType('integer'));
    this.types.set('decimal', this.createPrimitiveType('decimal'));
    this.types.set('date', this.createPrimitiveType('date'));
    this.types.set('dateTime', this.createPrimitiveType('dateTime'));
    this.types.set('time', this.createPrimitiveType('time'));
    this.types.set('instant', this.createPrimitiveType('instant'));
    this.types.set('uri', this.createPrimitiveType('uri'));
    this.types.set('url', this.createPrimitiveType('url'));
    this.types.set('code', this.createPrimitiveType('code'));
    this.types.set('id', this.createPrimitiveType('id'));
  }

  private createResourceHierarchy(): void {
    // Element - base for all FHIR types
    this.types.set('Element', {
      name: 'Element',
      modelContext: {
        path: 'Element',
        schemaHierarchy: [{ name: 'Element' }]
      }
    } as TypeInfo);

    const elementProperties = new Map<string, TypeInfo>();
    elementProperties.set('id', this.types.get('string')!);
    elementProperties.set('extension', this.createExtensionType());
    this.elementMappings.set('Element', elementProperties);

    // Resource - base for all resources
    this.types.set('Resource', {
      name: 'Resource',
      modelContext: {
        path: 'Resource',
        schemaHierarchy: [
          { name: 'Resource' },
          { name: 'Element' }
        ]
      }
    } as TypeInfo);

    const resourceProperties = new Map<string, TypeInfo>();
    resourceProperties.set('id', this.types.get('id')!);
    resourceProperties.set('meta', this.createMetaType());
    resourceProperties.set('implicitRules', this.types.get('uri')!);
    resourceProperties.set('language', this.types.get('code')!);
    this.elementMappings.set('Resource', resourceProperties);

    // DomainResource - base for most clinical resources
    this.types.set('DomainResource', {
      name: 'DomainResource',
      modelContext: {
        path: 'DomainResource',
        schemaHierarchy: [
          { name: 'DomainResource' },
          { name: 'Resource' },
          { name: 'Element' }
        ]
      }
    } as TypeInfo);

    const domainResourceProperties = new Map<string, TypeInfo>();
    // Inherit from Resource
    domainResourceProperties.set('id', this.types.get('id')!);
    domainResourceProperties.set('meta', this.createMetaType());
    domainResourceProperties.set('implicitRules', this.types.get('uri')!);
    domainResourceProperties.set('language', this.types.get('code')!);
    // DomainResource-specific
    domainResourceProperties.set('text', this.createNarrativeType());
    domainResourceProperties.set('contained', this.types.get('Resource')!);
    domainResourceProperties.set('extension', this.createExtensionType());
    domainResourceProperties.set('modifierExtension', this.createExtensionType());
    this.elementMappings.set('DomainResource', domainResourceProperties);
  }

  private createPatientType(): void {
    this.types.set('Patient', {
      name: 'Patient',
      modelContext: {
        path: 'Patient',
        schemaHierarchy: [
          { name: 'Patient' },
          { name: 'DomainResource' },
          { name: 'Resource' },
          { name: 'Element' }
        ]
      }
    } as TypeInfo);

    const patientProperties = new Map<string, TypeInfo>();
    
    // Inherited properties
    patientProperties.set('id', this.types.get('id')!);
    patientProperties.set('meta', this.createMetaType());
    patientProperties.set('text', this.createNarrativeType());
    patientProperties.set('extension', this.createExtensionType());
    
    // Patient-specific properties
    patientProperties.set('identifier', this.createIdentifierType());
    patientProperties.set('active', this.types.get('boolean')!);
    patientProperties.set('name', this.createHumanNameType());
    patientProperties.set('telecom', this.createContactPointType());
    patientProperties.set('gender', this.types.get('code')!);
    patientProperties.set('birthDate', this.types.get('date')!);
    patientProperties.set('deceased', this.createDeceasedChoiceType());
    patientProperties.set('address', this.createAddressType());
    patientProperties.set('maritalStatus', this.createCodeableConceptType());
    patientProperties.set('multipleBirth', this.createMultipleBirthChoiceType());
    patientProperties.set('photo', this.createAttachmentType());
    patientProperties.set('contact', this.createPatientContactType());
    patientProperties.set('communication', this.createPatientCommunicationType());
    patientProperties.set('generalPractitioner', this.createReferenceType());
    patientProperties.set('managingOrganization', this.createReferenceType());
    patientProperties.set('link', this.createPatientLinkType());

    this.elementMappings.set('Patient', patientProperties);
  }

  private createObservationType(): void {
    this.types.set('Observation', {
      name: 'Observation',
      modelContext: {
        path: 'Observation',
        schemaHierarchy: [
          { name: 'Observation' },
          { name: 'DomainResource' },
          { name: 'Resource' },
          { name: 'Element' }
        ]
      }
    } as TypeInfo);

    const observationProperties = new Map<string, TypeInfo>();
    
    // Inherited properties
    observationProperties.set('id', this.types.get('id')!);
    observationProperties.set('meta', this.createMetaType());
    observationProperties.set('text', this.createNarrativeType());
    observationProperties.set('extension', this.createExtensionType());
    
    // Observation-specific properties
    observationProperties.set('identifier', this.createIdentifierType());
    observationProperties.set('basedOn', this.createReferenceType());
    observationProperties.set('partOf', this.createReferenceType());
    observationProperties.set('status', this.types.get('code')!);
    observationProperties.set('category', this.createCodeableConceptType());
    observationProperties.set('code', this.createCodeableConceptType());
    observationProperties.set('subject', this.createReferenceType());
    observationProperties.set('focus', this.createReferenceType());
    observationProperties.set('encounter', this.createReferenceType());
    observationProperties.set('effective', this.createEffectiveChoiceType());
    observationProperties.set('issued', this.types.get('instant')!);
    observationProperties.set('performer', this.createReferenceType());
    observationProperties.set('value', this.createValueChoiceType());
    observationProperties.set('dataAbsentReason', this.createCodeableConceptType());
    observationProperties.set('interpretation', this.createCodeableConceptType());
    observationProperties.set('note', this.createAnnotationType());
    observationProperties.set('bodySite', this.createCodeableConceptType());
    observationProperties.set('method', this.createCodeableConceptType());
    observationProperties.set('specimen', this.createReferenceType());
    observationProperties.set('device', this.createReferenceType());
    observationProperties.set('referenceRange', this.createObservationReferenceRangeType());
    observationProperties.set('hasMember', this.createReferenceType());
    observationProperties.set('derivedFrom', this.createReferenceType());
    observationProperties.set('component', this.createObservationComponentType());

    this.elementMappings.set('Observation', observationProperties);
  }

  private createConditionType(): void {
    this.types.set('Condition', {
      name: 'Condition',
      modelContext: {
        path: 'Condition',
        schemaHierarchy: [
          { name: 'Condition' },
          { name: 'DomainResource' },
          { name: 'Resource' },
          { name: 'Element' }
        ]
      }
    } as TypeInfo);

    const conditionProperties = new Map<string, TypeInfo>();
    
    // Inherited properties
    conditionProperties.set('id', this.types.get('id')!);
    conditionProperties.set('meta', this.createMetaType());
    conditionProperties.set('text', this.createNarrativeType());
    
    // Condition-specific properties
    conditionProperties.set('identifier', this.createIdentifierType());
    conditionProperties.set('clinicalStatus', this.createCodeableConceptType());
    conditionProperties.set('verificationStatus', this.createCodeableConceptType());
    conditionProperties.set('category', this.createCodeableConceptType());
    conditionProperties.set('severity', this.createCodeableConceptType());
    conditionProperties.set('code', this.createCodeableConceptType());
    conditionProperties.set('bodySite', this.createCodeableConceptType());
    conditionProperties.set('subject', this.createReferenceType());
    conditionProperties.set('encounter', this.createReferenceType());
    conditionProperties.set('onset', this.createOnsetChoiceType());
    conditionProperties.set('abatement', this.createAbatementChoiceType());
    conditionProperties.set('recordedDate', this.types.get('dateTime')!);
    conditionProperties.set('recorder', this.createReferenceType());
    conditionProperties.set('asserter', this.createReferenceType());
    conditionProperties.set('stage', this.createConditionStageType());
    conditionProperties.set('evidence', this.createConditionEvidenceType());
    conditionProperties.set('note', this.createAnnotationType());

    this.elementMappings.set('Condition', conditionProperties);
  }

  private createComplexDataTypes(): void {
    // HumanName
    this.types.set('HumanName', {
      name: 'HumanName',
      modelContext: {
        path: 'HumanName',
        schemaHierarchy: [{ name: 'HumanName' }, { name: 'Element' }]
      }
    } as TypeInfo);

    const humanNameProperties = new Map<string, TypeInfo>();
    humanNameProperties.set('use', this.types.get('code')!);
    humanNameProperties.set('text', this.types.get('string')!);
    humanNameProperties.set('family', this.types.get('string')!);
    humanNameProperties.set('given', this.types.get('string')!);
    humanNameProperties.set('prefix', this.types.get('string')!);
    humanNameProperties.set('suffix', this.types.get('string')!);
    humanNameProperties.set('period', this.createPeriodType());
    this.elementMappings.set('HumanName', humanNameProperties);

    // CodeableConcept
    this.types.set('CodeableConcept', {
      name: 'CodeableConcept',
      modelContext: {
        path: 'CodeableConcept',
        schemaHierarchy: [{ name: 'CodeableConcept' }, { name: 'Element' }]
      }
    } as TypeInfo);

    const codeableConceptProperties = new Map<string, TypeInfo>();
    codeableConceptProperties.set('coding', this.createCodingType());
    codeableConceptProperties.set('text', this.types.get('string')!);
    this.elementMappings.set('CodeableConcept', codeableConceptProperties);

    // Coding
    this.types.set('Coding', {
      name: 'Coding',
      modelContext: {
        path: 'Coding',
        schemaHierarchy: [{ name: 'Coding' }, { name: 'Element' }]
      }
    } as TypeInfo);

    const codingProperties = new Map<string, TypeInfo>();
    codingProperties.set('system', this.types.get('uri')!);
    codingProperties.set('version', this.types.get('string')!);
    codingProperties.set('code', this.types.get('code')!);
    codingProperties.set('display', this.types.get('string')!);
    codingProperties.set('userSelected', this.types.get('boolean')!);
    this.elementMappings.set('Coding', codingProperties);

    // Quantity
    this.types.set('Quantity', {
      name: 'Quantity',
      modelContext: {
        path: 'Quantity',
        schemaHierarchy: [{ name: 'Quantity' }, { name: 'Element' }]
      }
    } as TypeInfo);

    const quantityProperties = new Map<string, TypeInfo>();
    quantityProperties.set('value', this.types.get('decimal')!);
    quantityProperties.set('comparator', this.types.get('code')!);
    quantityProperties.set('unit', this.types.get('string')!);
    quantityProperties.set('system', this.types.get('uri')!);
    quantityProperties.set('code', this.types.get('code')!);
    this.elementMappings.set('Quantity', quantityProperties);

    // Period
    this.types.set('Period', {
      name: 'Period',
      modelContext: {
        path: 'Period',
        schemaHierarchy: [{ name: 'Period' }, { name: 'Element' }]
      }
    } as TypeInfo);

    const periodProperties = new Map<string, TypeInfo>();
    periodProperties.set('start', this.types.get('dateTime')!);
    periodProperties.set('end', this.types.get('dateTime')!);
    this.elementMappings.set('Period', periodProperties);

    // Range
    this.types.set('Range', {
      name: 'Range',
      modelContext: {
        path: 'Range',
        schemaHierarchy: [{ name: 'Range' }, { name: 'Element' }]
      }
    } as TypeInfo);

    const rangeProperties = new Map<string, TypeInfo>();
    rangeProperties.set('low', this.types.get('Quantity')!);
    rangeProperties.set('high', this.types.get('Quantity')!);
    this.elementMappings.set('Range', rangeProperties);
  }

  // Helper methods for creating specific types
  private createPrimitiveType(name: string): TypeInfo {
    return {
      name,
      modelContext: {
        path: name,
        isPrimitive: true
      }
    } as TypeInfo;
  }

  private createHumanNameType(): TypeInfo {
    return this.types.get('HumanName')!;
  }

  private createCodeableConceptType(): TypeInfo {
    return this.types.get('CodeableConcept')!;
  }

  private createCodingType(): TypeInfo {
    return this.types.get('Coding')!;
  }

  private createQuantityType(): TypeInfo {
    return this.types.get('Quantity')!;
  }

  private createPeriodType(): TypeInfo {
    return this.types.get('Period')!;
  }

  private createRangeType(): TypeInfo {
    return this.types.get('Range')!;
  }

  // Choice type creators
  private createValueChoiceType(): TypeInfo {
    return {
      name: 'value[x]',
      modelContext: {
        path: 'Observation.value',
        isUnion: true,
        choices: [
          { type: { name: 'Quantity' }, choiceName: 'Quantity', code: 'Quantity' },
          { type: { name: 'CodeableConcept' }, choiceName: 'CodeableConcept', code: 'CodeableConcept' },
          { type: { name: 'string' }, choiceName: 'String', code: 'string' },
          { type: { name: 'boolean' }, choiceName: 'Boolean', code: 'boolean' },
          { type: { name: 'integer' }, choiceName: 'Integer', code: 'integer' },
          { type: { name: 'Range' }, choiceName: 'Range', code: 'Range' },
          { type: { name: 'Period' }, choiceName: 'Period', code: 'Period' },
          { type: { name: 'dateTime' }, choiceName: 'DateTime', code: 'dateTime' },
          { type: { name: 'time' }, choiceName: 'Time', code: 'time' },
          { type: { name: 'SampledData' }, choiceName: 'SampledData', code: 'SampledData' }
        ]
      }
    } as TypeInfo;
  }

  private createEffectiveChoiceType(): TypeInfo {
    return {
      name: 'effective[x]',
      modelContext: {
        path: 'Observation.effective',
        isUnion: true,
        choices: [
          { type: { name: 'dateTime' }, choiceName: 'DateTime', code: 'dateTime' },
          { type: { name: 'Period' }, choiceName: 'Period', code: 'Period' },
          { type: { name: 'instant' }, choiceName: 'Instant', code: 'instant' }
        ]
      }
    } as TypeInfo;
  }

  private createDeceasedChoiceType(): TypeInfo {
    return {
      name: 'deceased[x]',
      modelContext: {
        path: 'Patient.deceased',
        isUnion: true,
        choices: [
          { type: { name: 'boolean' }, choiceName: 'Boolean', code: 'boolean' },
          { type: { name: 'dateTime' }, choiceName: 'DateTime', code: 'dateTime' }
        ]
      }
    } as TypeInfo;
  }

  private createMultipleBirthChoiceType(): TypeInfo {
    return {
      name: 'multipleBirth[x]',
      modelContext: {
        path: 'Patient.multipleBirth',
        isUnion: true,
        choices: [
          { type: { name: 'boolean' }, choiceName: 'Boolean', code: 'boolean' },
          { type: { name: 'integer' }, choiceName: 'Integer', code: 'integer' }
        ]
      }
    } as TypeInfo;
  }

  private createOnsetChoiceType(): TypeInfo {
    return {
      name: 'onset[x]',
      modelContext: {
        path: 'Condition.onset',
        isUnion: true,
        choices: [
          { type: { name: 'dateTime' }, choiceName: 'DateTime', code: 'dateTime' },
          { type: { name: 'Age' }, choiceName: 'Age', code: 'Age' },
          { type: { name: 'Period' }, choiceName: 'Period', code: 'Period' },
          { type: { name: 'Range' }, choiceName: 'Range', code: 'Range' },
          { type: { name: 'string' }, choiceName: 'String', code: 'string' }
        ]
      }
    } as TypeInfo;
  }

  private createAbatementChoiceType(): TypeInfo {
    return {
      name: 'abatement[x]',
      modelContext: {
        path: 'Condition.abatement',
        isUnion: true,
        choices: [
          { type: { name: 'dateTime' }, choiceName: 'DateTime', code: 'dateTime' },
          { type: { name: 'Age' }, choiceName: 'Age', code: 'Age' },
          { type: { name: 'Period' }, choiceName: 'Period', code: 'Period' },
          { type: { name: 'Range' }, choiceName: 'Range', code: 'Range' },
          { type: { name: 'string' }, choiceName: 'String', code: 'string' },
          { type: { name: 'boolean' }, choiceName: 'Boolean', code: 'boolean' }
        ]
      }
    } as TypeInfo;
  }

  // Placeholder methods for complex types that would be too lengthy to implement fully
  private createMetaType(): TypeInfo {
    return { name: 'Meta' } as TypeInfo;
  }

  private createNarrativeType(): TypeInfo {
    return { name: 'Narrative' } as TypeInfo;
  }

  private createExtensionType(): TypeInfo {
    return { name: 'Extension' } as TypeInfo;
  }

  private createIdentifierType(): TypeInfo {
    return { name: 'Identifier' } as TypeInfo;
  }

  private createContactPointType(): TypeInfo {
    return { name: 'ContactPoint' } as TypeInfo;
  }

  private createAddressType(): TypeInfo {
    return { name: 'Address' } as TypeInfo;
  }

  private createAttachmentType(): TypeInfo {
    return { name: 'Attachment' } as TypeInfo;
  }

  private createAnnotationType(): TypeInfo {
    return { name: 'Annotation' } as TypeInfo;
  }

  private createReferenceType(): TypeInfo {
    return { name: 'Reference' } as TypeInfo;
  }

  private createPatientContactType(): TypeInfo {
    return { name: 'Patient.Contact' } as TypeInfo;
  }

  private createPatientCommunicationType(): TypeInfo {
    return { name: 'Patient.Communication' } as TypeInfo;
  }

  private createPatientLinkType(): TypeInfo {
    return { name: 'Patient.Link' } as TypeInfo;
  }

  private createObservationReferenceRangeType(): TypeInfo {
    return { name: 'Observation.ReferenceRange' } as TypeInfo;
  }

  private createObservationComponentType(): TypeInfo {
    return { name: 'Observation.Component' } as TypeInfo;
  }

  private createConditionStageType(): TypeInfo {
    return { name: 'Condition.Stage' } as TypeInfo;
  }

  private createConditionEvidenceType(): TypeInfo {
    return { name: 'Condition.Evidence' } as TypeInfo;
  }

  private createProcedureType(): void {
    this.types.set('Procedure', {
      name: 'Procedure',
      modelContext: {
        path: 'Procedure',
        schemaHierarchy: [
          { name: 'Procedure' },
          { name: 'DomainResource' },
          { name: 'Resource' },
          { name: 'Element' }
        ]
      }
    } as TypeInfo);

    const procedureProperties = new Map<string, TypeInfo>();
    procedureProperties.set('id', this.types.get('id')!);
    procedureProperties.set('status', this.types.get('code')!);
    procedureProperties.set('code', this.createCodeableConceptType());
    procedureProperties.set('subject', this.createReferenceType());
    procedureProperties.set('performed', this.createPerformedChoiceType());
    this.elementMappings.set('Procedure', procedureProperties);
  }

  private createMedicationRequestType(): void {
    this.types.set('MedicationRequest', {
      name: 'MedicationRequest',
      modelContext: {
        path: 'MedicationRequest',
        schemaHierarchy: [
          { name: 'MedicationRequest' },
          { name: 'DomainResource' },
          { name: 'Resource' },
          { name: 'Element' }
        ]
      }
    } as TypeInfo);

    const medicationRequestProperties = new Map<string, TypeInfo>();
    medicationRequestProperties.set('id', this.types.get('id')!);
    medicationRequestProperties.set('status', this.types.get('code')!);
    medicationRequestProperties.set('intent', this.types.get('code')!);
    medicationRequestProperties.set('medication', this.createMedicationChoiceType());
    medicationRequestProperties.set('subject', this.createReferenceType());
    this.elementMappings.set('MedicationRequest', medicationRequestProperties);
  }

  private createOrganizationType(): void {
    this.types.set('Organization', {
      name: 'Organization',
      modelContext: {
        path: 'Organization',
        schemaHierarchy: [
          { name: 'Organization' },
          { name: 'DomainResource' },
          { name: 'Resource' },
          { name: 'Element' }
        ]
      }
    } as TypeInfo);

    const organizationProperties = new Map<string, TypeInfo>();
    organizationProperties.set('id', this.types.get('id')!);
    organizationProperties.set('name', this.types.get('string')!);
    organizationProperties.set('active', this.types.get('boolean')!);
    organizationProperties.set('type', this.createCodeableConceptType());
    organizationProperties.set('telecom', this.createContactPointType());
    organizationProperties.set('address', this.createAddressType());
    this.elementMappings.set('Organization', organizationProperties);
  }

  private createPerformedChoiceType(): TypeInfo {
    return {
      name: 'performed[x]',
      modelContext: {
        path: 'Procedure.performed',
        isUnion: true,
        choices: [
          { type: { name: 'dateTime' }, choiceName: 'DateTime', code: 'dateTime' },
          { type: { name: 'Period' }, choiceName: 'Period', code: 'Period' },
          { type: { name: 'string' }, choiceName: 'String', code: 'string' },
          { type: { name: 'Age' }, choiceName: 'Age', code: 'Age' },
          { type: { name: 'Range' }, choiceName: 'Range', code: 'Range' }
        ]
      }
    } as TypeInfo;
  }

  private createMedicationChoiceType(): TypeInfo {
    return {
      name: 'medication[x]',
      modelContext: {
        path: 'MedicationRequest.medication',
        isUnion: true,
        choices: [
          { type: { name: 'CodeableConcept' }, choiceName: 'CodeableConcept', code: 'CodeableConcept' },
          { type: { name: 'Reference' }, choiceName: 'Reference', code: 'Reference' }
        ]
      }
    } as TypeInfo;
  }
}