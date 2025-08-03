import { describe, it, expect, beforeEach } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position, Range } from 'vscode-languageserver';

import {
  DefinitionUtils,
  DefinitionType,
  EnhancedDefinitionBuilder
} from '../EnhancedDefinitionTypes';

describe('DefinitionProvider - Enhanced Types and Utilities', () => {
  describe('DefinitionUtils', () => {
    it('should identify choice type properties correctly', () => {
      expect(DefinitionUtils.isChoiceTypeProperty('valueString')).toBe(true);
      expect(DefinitionUtils.isChoiceTypeProperty('valueQuantity')).toBe(true);
      expect(DefinitionUtils.isChoiceTypeProperty('effectiveDateTime')).toBe(true);
      expect(DefinitionUtils.isChoiceTypeProperty('onsetAge')).toBe(true);
      expect(DefinitionUtils.isChoiceTypeProperty('abatementString')).toBe(true);
      expect(DefinitionUtils.isChoiceTypeProperty('componentValue')).toBe(true);
      
      expect(DefinitionUtils.isChoiceTypeProperty('name')).toBe(false);
      expect(DefinitionUtils.isChoiceTypeProperty('status')).toBe(false);
      expect(DefinitionUtils.isChoiceTypeProperty('identifier')).toBe(false);
    });

    it('should extract correct base property from choice types', () => {
      expect(DefinitionUtils.getChoiceBaseProperty('valueString')).toBe('value');
      expect(DefinitionUtils.getChoiceBaseProperty('valueQuantity')).toBe('value');
      expect(DefinitionUtils.getChoiceBaseProperty('effectiveDateTime')).toBe('effective');
      expect(DefinitionUtils.getChoiceBaseProperty('onsetAge')).toBe('onset');
      expect(DefinitionUtils.getChoiceBaseProperty('abatementString')).toBe('abatement');
      expect(DefinitionUtils.getChoiceBaseProperty('componentValue')).toBe('component');
      expect(DefinitionUtils.getChoiceBaseProperty('regularProperty')).toBe('regularProperty');
    });

    it('should extract correct data type from choice properties', () => {
      expect(DefinitionUtils.getChoiceDataType('valueString')).toBe('String');
      expect(DefinitionUtils.getChoiceDataType('valueQuantity')).toBe('Quantity');
      expect(DefinitionUtils.getChoiceDataType('effectiveDateTime')).toBe('DateTime');
      expect(DefinitionUtils.getChoiceDataType('onsetAge')).toBe('Age');
      expect(DefinitionUtils.getChoiceDataType('invalidChoice')).toBe('unknown');
    });

    it('should identify inherited properties correctly', () => {
      expect(DefinitionUtils.isInheritedProperty('id')).toBe(true);
      expect(DefinitionUtils.isInheritedProperty('meta')).toBe(true);
      expect(DefinitionUtils.isInheritedProperty('text')).toBe(true);
      expect(DefinitionUtils.isInheritedProperty('extension')).toBe(true);
      expect(DefinitionUtils.isInheritedProperty('modifierExtension')).toBe(true);
      
      expect(DefinitionUtils.isInheritedProperty('name')).toBe(false);
      expect(DefinitionUtils.isInheritedProperty('status')).toBe(false);
    });

    it('should generate correct FHIR specification URLs', () => {
      expect(DefinitionUtils.getFhirResourceUrl('Patient')).toBe('https://hl7.org/fhir/R4/patient.html');
      expect(DefinitionUtils.getFhirResourceUrl('Observation')).toBe('https://hl7.org/fhir/R4/observation.html');
      
      expect(DefinitionUtils.getFhirPropertyUrl('Patient', 'name')).toBe('https://hl7.org/fhir/R4/patient-definitions.html#Patient.name');
      
      expect(DefinitionUtils.getFhirDataTypeUrl('string')).toBe('https://hl7.org/fhir/R4/datatypes.html#string');
      expect(DefinitionUtils.getFhirDataTypeUrl('Quantity')).toBe('https://hl7.org/fhir/R4/datatypes.html#quantity');
    });

    it('should generate correct FHIRPath function URLs', () => {
      expect(DefinitionUtils.getFhirPathFunctionUrl('where')).toBe('https://hl7.org/fhirpath/#where');
      expect(DefinitionUtils.getFhirPathFunctionUrl('select')).toBe('https://hl7.org/fhirpath/#select');
      expect(DefinitionUtils.getFhirPathFunctionUrl('exists')).toBe('https://hl7.org/fhirpath/#exists');
      expect(DefinitionUtils.getFhirPathFunctionUrl('unknownFunction')).toBe('https://hl7.org/fhirpath/#functions');
    });

    it('should get correct inheritance hierarchy', () => {
      expect(DefinitionUtils.getInheritanceHierarchy('id')).toEqual(['Element', 'Resource']);
      expect(DefinitionUtils.getInheritanceHierarchy('meta')).toEqual(['Element', 'Resource']);
      expect(DefinitionUtils.getInheritanceHierarchy('text')).toEqual(['Element', 'DomainResource', 'Resource']);
      expect(DefinitionUtils.getInheritanceHierarchy('extension')).toEqual(['Element', 'DomainResource', 'Resource']);
      expect(DefinitionUtils.getInheritanceHierarchy('unknownProperty')).toEqual([]);
    });
  });

  describe('EnhancedDefinitionBuilder', () => {
    let builder: EnhancedDefinitionBuilder;
    const testRange = Range.create(0, 0, 0, 10);

    beforeEach(() => {
      builder = new EnhancedDefinitionBuilder();
    });

    it('should build resource definitions correctly', () => {
      builder.addResourceDefinition('Patient', 'https://hl7.org/fhir/R4/patient.html', testRange);
      
      const definitions = builder.build();
      expect(definitions).toHaveLength(1);
      
      const definition = definitions[0];
      expect(definition.type).toBe(DefinitionType.RESOURCE_TYPE);
      expect(definition.targetInfo.name).toBe('Patient');
      expect(definition.targetInfo.resourceType).toBe('Patient');
      expect(definition.targetUri).toBe('https://hl7.org/fhir/R4/patient.html');
      expect(definition.confidence).toBeGreaterThan(0.9);
    });

    it('should build property definitions correctly', () => {
      builder.addPropertyDefinition('name', 'Patient', 'https://hl7.org/fhir/R4/patient-definitions.html#Patient.name', testRange);
      
      const definitions = builder.build();
      expect(definitions).toHaveLength(1);
      
      const definition = definitions[0];
      expect(definition.type).toBe(DefinitionType.PROPERTY);
      expect(definition.targetInfo.name).toBe('name');
      expect(definition.targetInfo.resourceType).toBe('Patient');
      expect(definition.targetInfo.fhirPath).toBe('Patient.name');
    });

    it('should build choice type definitions correctly', () => {
      const choiceContext = {
        baseProperty: 'value',
        choiceProperty: 'valueString',
        availableChoices: [
          { name: 'valueString', dataType: 'string', description: 'String value' },
          { name: 'valueQuantity', dataType: 'quantity', description: 'Quantity value' }
        ],
        currentChoice: {
          name: 'valueString',
          dataType: 'string',
          description: 'String value for value'
        }
      };

      builder.addChoiceTypeDefinition(choiceContext, 'https://hl7.org/fhir/R4/datatypes.html#string', testRange);
      
      const definitions = builder.build();
      expect(definitions).toHaveLength(1);
      
      const definition = definitions[0];
      expect(definition.type).toBe(DefinitionType.CHOICE_TYPE);
      expect(definition.targetInfo.name).toBe('valueString');
      expect(definition.targetInfo.choiceTypes).toHaveLength(2);
      expect(definition.targetInfo.choiceTypes).toContain('valueString');
      expect(definition.targetInfo.choiceTypes).toContain('valueQuantity');
    });

    it('should build inherited property definitions correctly', () => {
      const inheritanceContext = {
        property: 'id',
        inheritedFrom: 'Resource',
        isAbstract: false,
        hierarchy: ['Element', 'Resource']
      };

      builder.addInheritedPropertyDefinition(inheritanceContext, 'https://hl7.org/fhir/R4/resource-definitions.html#Resource.id', testRange);
      
      const definitions = builder.build();
      expect(definitions).toHaveLength(1);
      
      const definition = definitions[0];
      expect(definition.type).toBe(DefinitionType.INHERITED_PROPERTY);
      expect(definition.targetInfo.name).toBe('id');
      expect(definition.targetInfo.fhirPath).toBe('Resource.id');
      expect(definition.targetInfo.description).toContain('Inherited from Resource');
    });

    it('should build function definitions correctly', () => {
      const functionContext = {
        name: 'where',
        signature: 'where(criteria: expression)',
        parameters: [
          { name: 'criteria', type: 'expression', optional: false, description: 'Boolean expression' }
        ],
        returnType: 'collection',
        description: 'Filters collection based on criteria',
        examples: [
          { expression: 'Patient.name.where(use = "official")', context: 'Patient', result: 'official names', description: 'Filter names' }
        ],
        category: 'filtering' as const
      };

      builder.addFunctionDefinition(functionContext, 'https://hl7.org/fhirpath/#where', testRange);
      
      const definitions = builder.build();
      expect(definitions).toHaveLength(1);
      
      const definition = definitions[0];
      expect(definition.type).toBe(DefinitionType.FUNCTION);
      expect(definition.targetInfo.name).toBe('where');
      expect(definition.targetInfo.fhirPath).toBe('where(criteria: expression)');
      expect(definition.targetInfo.description).toBe('Filters collection based on criteria');
    });

    it('should clear builder state after build', () => {
      builder.addResourceDefinition('Patient', 'https://hl7.org/fhir/R4/patient.html', testRange);
      expect(builder.getDefinitionCount()).toBe(1);
      
      const definitions = builder.build();
      expect(definitions).toHaveLength(1);
      expect(builder.getDefinitionCount()).toBe(0);
    });

    it('should support multiple definitions in a single build', () => {
      builder.addResourceDefinition('Patient', 'https://hl7.org/fhir/R4/patient.html', testRange);
      builder.addPropertyDefinition('name', 'Patient', 'https://hl7.org/fhir/R4/patient-definitions.html#Patient.name', testRange);
      
      expect(builder.getDefinitionCount()).toBe(2);
      
      const definitions = builder.build();
      expect(definitions).toHaveLength(2);
      
      const resourceDef = definitions.find(d => d.type === DefinitionType.RESOURCE_TYPE);
      const propertyDef = definitions.find(d => d.type === DefinitionType.PROPERTY);
      
      expect(resourceDef).toBeDefined();
      expect(propertyDef).toBeDefined();
    });
  });
});