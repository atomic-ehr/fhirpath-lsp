import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position, Range, Connection } from 'vscode-languageserver';

import { DefinitionProvider } from '../DefinitionProvider';
import { SymbolService } from '../../services/SymbolService';
import { FHIRPathFunctionRegistry } from '../../services/FHIRPathFunctionRegistry';
import { ModelProviderService, ChoiceValidationResult, NavigationResult, EnhancedTypeInfo } from '../../services/ModelProviderService';
import {
  DefinitionType,
  EnhancedDefinition,
  DefinitionResolutionResult
} from '../EnhancedDefinitionTypes';

describe('DefinitionProvider - Enhanced FHIR-Aware Definition Resolution', () => {
  let definitionProvider: DefinitionProvider;
  let mockConnection: any;
  let mockSymbolService: any;
  let mockFunctionRegistry: any;
  let mockModelProviderService: any;

  beforeEach(() => {
    // Create mocks
    mockConnection = {
      console: {
        log: mock(() => {}),
        error: mock(() => {})
      }
    };

    mockSymbolService = {
      findSymbolAtPosition: mock(() => null)
    };

    mockFunctionRegistry = {
      getFunction: mock(() => null),
      getFunctions: mock(() => [])
    };

    mockModelProviderService = {
      isInitialized: mock(() => true),
      validateChoiceProperty: mock(() => Promise.resolve({ isValid: false })),
      navigatePropertyPath: mock(() => Promise.resolve({ isValid: false, finalType: undefined, navigationPath: [], availableProperties: [], errors: [] })),
      getEnhancedTypeInfo: mock(() => Promise.resolve(null))
    };

    // Initialize definition provider
    definitionProvider = new DefinitionProvider(
      mockConnection,
      mockSymbolService,
      mockFunctionRegistry,
      mockModelProviderService
    );
  });

  describe('Choice Type Definition Resolution', () => {
    it('should resolve valueString choice type definition', async () => {
      // Setup
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Observation.valueString'
      );

      const position = Position.create(0, 15); // Position on "valueString"

      const validationResult: ChoiceValidationResult = {
        isValid: true,
        validChoices: ['valueString', 'valueQuantity', 'valueBoolean']
      };

      mockModelProviderService.validateChoiceProperty.mockReturnValue(Promise.resolve(validationResult));

      // Execute
      const result = await definitionProvider.provideEnhancedDefinition(document, position);

      // Verify
      expect(result.definitions).toBeDefined();
      expect(result.definitions.length).toBeGreaterThan(0);
      
      const choiceDefinition = result.definitions.find(d => d.type === DefinitionType.CHOICE_TYPE);
      expect(choiceDefinition).toBeDefined();
      expect(choiceDefinition?.targetInfo.name).toBe('valueString');
      expect(choiceDefinition?.targetInfo.choiceTypes).toContain('valueString');
      expect(choiceDefinition?.targetInfo.choiceTypes).toContain('valueQuantity');
      expect(choiceDefinition?.confidence).toBeGreaterThan(0.8);
    });

    it('should resolve valueQuantity choice type definition', async () => {
      // Setup
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Observation.valueQuantity'
      );

      const position = Position.create(0, 18); // Position on "valueQuantity"

      const validationResult: ChoiceValidationResult = {
        isValid: true,
        validChoices: ['valueString', 'valueQuantity', 'valueBoolean']
      };

      mockModelProviderService.validateChoiceProperty.mockReturnValue(Promise.resolve(validationResult));

      // Execute
      const result = await definitionProvider.provideEnhancedDefinition(document, position);

      // Verify
      const choiceDefinition = result.definitions.find(d => d.type === DefinitionType.CHOICE_TYPE);
      expect(choiceDefinition).toBeDefined();
      expect(choiceDefinition?.targetInfo.name).toBe('valueQuantity');
      expect(choiceDefinition?.targetUri).toContain('datatypes.html#quantity');
    });

    it('should handle invalid choice type properties', async () => {
      // Setup
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Observation.valueInvalid'
      );

      const position = Position.create(0, 16); // Position on "valueInvalid"

      const validationResult: ChoiceValidationResult = {
        isValid: false,
        validChoices: ['valueString', 'valueQuantity', 'valueBoolean'],
        error: 'Invalid choice type'
      };

      mockModelProviderService.validateChoiceProperty.mockReturnValue(Promise.resolve(validationResult));

      // Execute
      const result = await definitionProvider.provideEnhancedDefinition(document, position);

      // Verify - should still attempt other resolution methods
      expect(result.definitions).toBeDefined();
      expect(result.errors.length).toBe(0); // Should not error, just no choice type definition
    });
  });

  describe('Inherited Property Definition Resolution', () => {
    it('should resolve inherited id property definition', async () => {
      // Setup
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.id'
      );

      const position = Position.create(0, 9); // Position on "id"

      // Execute
      const result = await definitionProvider.provideEnhancedDefinition(document, position);

      // Verify
      const inheritedDefinition = result.definitions.find(d => d.type === DefinitionType.INHERITED_PROPERTY);
      expect(inheritedDefinition).toBeDefined();
      expect(inheritedDefinition?.targetInfo.name).toBe('id');
      expect(inheritedDefinition?.targetInfo.fhirPath).toBe('Resource.id');
      expect(inheritedDefinition?.targetUri).toContain('resource-definitions.html#Resource.id');
    });

    it('should resolve inherited meta property definition', async () => {
      // Setup
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.meta'
      );

      const position = Position.create(0, 11); // Position on "meta"

      // Execute
      const result = await definitionProvider.provideEnhancedDefinition(document, position);

      // Verify
      const inheritedDefinition = result.definitions.find(d => d.type === DefinitionType.INHERITED_PROPERTY);
      expect(inheritedDefinition).toBeDefined();
      expect(inheritedDefinition?.targetInfo.name).toBe('meta');
      expect(inheritedDefinition?.targetInfo.description).toContain('Inherited from Resource');
    });

    it('should resolve text property inherited from DomainResource', async () => {
      // Setup
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.text'
      );

      const position = Position.create(0, 11); // Position on "text"

      // Execute
      const result = await definitionProvider.provideEnhancedDefinition(document, position);

      // Verify
      const inheritedDefinition = result.definitions.find(d => d.type === DefinitionType.INHERITED_PROPERTY);
      expect(inheritedDefinition).toBeDefined();
      expect(inheritedDefinition?.targetInfo.fhirPath).toBe('DomainResource.text');
    });
  });

  describe('Function Definition Resolution', () => {
    it('should resolve where() function definition', async () => {
      // Setup
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.name.where(family.exists())'
      );

      const position = Position.create(0, 15); // Position on "where"

      const mockFunction = {
        name: 'where',
        signature: 'where(criteria: expression)',
        description: 'Returns a collection containing only those elements for which the criteria expression evaluates to true',
        category: 'filtering',
        parameters: [
          { name: 'criteria', type: 'expression', optional: false, description: 'Boolean expression to filter by' }
        ],
        examples: [
          { expression: 'Patient.name.where(use = "official")', context: 'Patient', result: 'official names only' }
        ]
      };

      mockFunctionRegistry.getFunction.mockReturnValue(mockFunction);

      // Execute
      const result = await definitionProvider.provideEnhancedDefinition(document, position);

      // Verify
      const functionDefinition = result.definitions.find(d => d.type === DefinitionType.FUNCTION);
      expect(functionDefinition).toBeDefined();
      expect(functionDefinition?.targetInfo.name).toBe('where');
      expect(functionDefinition?.targetInfo.fhirPath).toBe('where(criteria: expression)');
      expect(functionDefinition?.targetUri).toContain('fhirpath/#where');
      expect(functionDefinition?.confidence).toBeGreaterThan(0.9);
    });

    it('should resolve select() function definition', async () => {
      // Setup
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.name.select(family)'
      );

      const position = Position.create(0, 15); // Position on "select"

      const mockFunction = {
        name: 'select',
        signature: 'select(projection: expression)',
        description: 'Projects the collection to a new collection with elements transformed by the projection expression',
        category: 'projection'
      };

      mockFunctionRegistry.getFunction.mockReturnValue(mockFunction);

      // Execute
      const result = await definitionProvider.provideEnhancedDefinition(document, position);

      // Verify
      const functionDefinition = result.definitions.find(d => d.type === DefinitionType.FUNCTION);
      expect(functionDefinition).toBeDefined();
      expect(functionDefinition?.targetInfo.name).toBe('select');
      expect(functionDefinition?.targetUri).toContain('fhirpath/#select');
    });

    it('should handle unknown functions gracefully', async () => {
      // Setup
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.name.unknownFunction()'
      );

      const position = Position.create(0, 20); // Position on "unknownFunction"

      mockFunctionRegistry.getFunction.mockReturnValue(null);

      // Execute
      const result = await definitionProvider.provideEnhancedDefinition(document, position);

      // Verify - should not include function definition
      const functionDefinition = result.definitions.find(d => d.type === DefinitionType.FUNCTION);
      expect(functionDefinition).toBeUndefined();
    });
  });

  describe('Resource Type Definition Resolution', () => {
    it('should resolve Patient resource definition', async () => {
      // Setup
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.name'
      );

      const position = Position.create(0, 3); // Position on "Patient"

      // Execute
      const result = await definitionProvider.provideEnhancedDefinition(document, position);

      // Verify
      const resourceDefinition = result.definitions.find(d => d.type === DefinitionType.RESOURCE_TYPE);
      expect(resourceDefinition).toBeDefined();
      expect(resourceDefinition?.targetInfo.name).toBe('Patient');
      expect(resourceDefinition?.targetInfo.resourceType).toBe('Patient');
      expect(resourceDefinition?.targetUri).toBe('https://hl7.org/fhir/R4/patient.html');
      expect(resourceDefinition?.confidence).toBeGreaterThan(0.9);
    });

    it('should resolve Observation resource definition', async () => {
      // Setup
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Observation.valueString'
      );

      const position = Position.create(0, 5); // Position on "Observation"

      // Execute
      const result = await definitionProvider.provideEnhancedDefinition(document, position);

      // Verify
      const resourceDefinition = result.definitions.find(d => d.type === DefinitionType.RESOURCE_TYPE);
      expect(resourceDefinition).toBeDefined();
      expect(resourceDefinition?.targetInfo.name).toBe('Observation');
      expect(resourceDefinition?.targetUri).toBe('https://hl7.org/fhir/R4/observation.html');
    });
  });

  describe('Property Definition Resolution', () => {
    it('should resolve Patient.name property definition', async () => {
      // Setup
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.name.family'
      );

      const position = Position.create(0, 10); // Position on "name"

      const navigationResult: NavigationResult = {
        isValid: true,
        finalType: { name: 'HumanName', kind: 'complex-type' } as any,
        navigationPath: [],
        availableProperties: ['family', 'given', 'use'],
        errors: []
      };

      mockModelProviderService.navigatePropertyPath.mockReturnValue(Promise.resolve(navigationResult));

      // Execute
      const result = await definitionProvider.provideEnhancedDefinition(document, position);

      // Verify
      const propertyDefinition = result.definitions.find(d => d.type === DefinitionType.PROPERTY);
      expect(propertyDefinition).toBeDefined();
      expect(propertyDefinition?.targetInfo.name).toBe('name');
      expect(propertyDefinition?.targetInfo.resourceType).toBe('Patient');
      expect(propertyDefinition?.targetUri).toContain('patient-definitions.html#Patient.name');
    });

    it('should handle invalid property navigation', async () => {
      // Setup
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.invalidProperty'
      );

      const position = Position.create(0, 15); // Position on "invalidProperty"

      const navigationResult: NavigationResult = {
        isValid: false,
        finalType: undefined,
        navigationPath: [],
        availableProperties: ['name', 'identifier', 'gender'],
        errors: ['Property "invalidProperty" not found']
      };

      mockModelProviderService.navigatePropertyPath.mockReturnValue(Promise.resolve(navigationResult));

      // Execute
      const result = await definitionProvider.provideEnhancedDefinition(document, position);

      // Verify - should not include property definition for invalid properties
      const propertyDefinition = result.definitions.find(d => d.type === DefinitionType.PROPERTY);
      expect(propertyDefinition).toBeUndefined();
    });
  });

  describe('Context Extraction', () => {
    it('should extract resource type from document', () => {
      // Setup
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.name.family'
      );

      const position = Position.create(0, 10);

      // Execute
      const context = definitionProvider.extractDefinitionContext(document, position);

      // Verify
      expect(context.resourceType).toBe('Patient');
      expect(context.position.line).toBe(0);
      expect(context.position.character).toBe(10);
    });

    it('should extract property path from document', () => {
      // Setup
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.name.family'
      );

      const position = Position.create(0, 18); // Position on "family"

      // Execute
      const context = definitionProvider.extractDefinitionContext(document, position);

      // Verify
      expect(context.resourceType).toBe('Patient');
      expect(context.currentPath).toEqual(['name']);
    });

    it('should handle complex expressions', () => {
      // Setup
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.name.where(use = "official").family'
      );

      const position = Position.create(0, 43); // Position on "family"

      // Execute
      const context = definitionProvider.extractDefinitionContext(document, position);

      // Verify
      expect(context.resourceType).toBe('Patient');
      // Should extract path before the where clause
      expect(context.currentPath).toEqual(['name']);
    });
  });

  describe('Word Range Detection', () => {
    it('should detect word range at position', () => {
      // Setup
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.name.family'
      );

      const position = Position.create(0, 15); // Middle of "family"

      // Execute
      const range = definitionProvider.getWordRangeAtPosition(document, position);

      // Verify
      expect(range).toBeDefined();
      expect(range?.start.character).toBe(13);
      expect(range?.end.character).toBe(19);
      expect(document.getText(range!)).toBe('family');
    });

    it('should handle position at word boundary', () => {
      // Setup
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.name'
      );

      const position = Position.create(0, 8); // At the dot between Patient and name

      // Execute
      const range = definitionProvider.getWordRangeAtPosition(document, position);

      // Verify - should return null for non-word characters
      expect(range).toBeNull();
    });
  });

  describe('Performance Requirements', () => {
    it('should maintain definition resolution under 100ms', async () => {
      // Setup
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.name.family.where(length() > 2)'
      );

      const position = Position.create(0, 15); // Position on "family"

      const navigationResult: NavigationResult = {
        isValid: true,
        finalType: { name: 'string', kind: 'primitive-type' } as any,
        navigationPath: [],
        availableProperties: [],
        errors: []
      };

      mockModelProviderService.navigatePropertyPath.mockReturnValue(Promise.resolve(navigationResult));

      // Execute and measure time
      const startTime = Date.now();
      const result = await definitionProvider.provideEnhancedDefinition(document, position);
      const endTime = Date.now();

      // Verify performance
      expect(endTime - startTime).toBeLessThan(100);
      expect(result.definitions).toBeDefined();
    });
  });

  describe('Graceful Degradation', () => {
    it('should work without ModelProvider', async () => {
      // Setup provider without ModelProvider
      const basicProvider = new DefinitionProvider(
        mockConnection,
        mockSymbolService,
        mockFunctionRegistry,
        undefined
      );

      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.name'
      );

      const position = Position.create(0, 10);

      // Setup fallback symbol service
      mockSymbolService.findSymbolAtPosition.mockReturnValue({
        name: 'name',
        kind: 'Property',
        context: 'Patient'
      });

      // Execute
      const result = await basicProvider.provideDefinition(document, position);

      // Verify - should fallback to basic resolution
      expect(result).toBeDefined();
    });

    it('should handle ModelProvider errors gracefully', async () => {
      // Setup
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.name'
      );

      const position = Position.create(0, 10);

      mockModelProviderService.navigatePropertyPath.mockReturnValue(Promise.reject(new Error('ModelProvider error')));

      // Execute
      const result = await definitionProvider.provideEnhancedDefinition(document, position);

      // Verify - should not crash and handle error gracefully
      expect(result.definitions).toBeDefined();
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].severity).toBe('error');
    });
  });

  describe('Multiple Definition Scenarios', () => {
    it('should return multiple definitions for ambiguous terms', async () => {
      // Setup - document where "value" could be both inherited property and choice type base
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Observation.value'
      );

      const position = Position.create(0, 14); // Position on "value"

      const validationResult: ChoiceValidationResult = {
        isValid: true,
        validChoices: ['valueString', 'valueQuantity', 'valueBoolean']
      };

      mockModelProviderService.validateChoiceProperty.mockReturnValue(Promise.resolve(validationResult));

      // Execute
      const result = await definitionProvider.provideEnhancedDefinition(document, position);

      // Verify
      expect(result.definitions.length).toBeGreaterThan(0);
      expect(result.ambiguous).toBe(false); // Should prioritize choice type
      
      const choiceDefinition = result.definitions.find(d => d.type === DefinitionType.CHOICE_TYPE);
      expect(choiceDefinition).toBeDefined();
    });
  });
});