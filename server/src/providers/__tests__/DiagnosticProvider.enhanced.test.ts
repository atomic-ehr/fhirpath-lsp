import { describe, it, expect, beforeEach, jest, Mock } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DiagnosticSeverity } from 'vscode-languageserver';

import { DiagnosticProvider } from '../DiagnosticProvider';
import { FHIRPathService } from '../../parser/FHIRPathService';
import { FHIRPathContextService } from '../../services/FHIRPathContextService';
import { FHIRValidationProvider } from '../FHIRValidationProvider';
import { ModelProviderService, EnhancedTypeInfo, ChoiceValidationResult, NavigationResult } from '../../services/ModelProviderService';
import {
  EnhancedDiagnosticCategory,
  DiagnosticImpact,
  TypeAwareDiagnosticInfo,
  ChoiceTypeDiagnostic
} from '../../diagnostics/EnhancedDiagnosticTypes';

// Mock dependencies
jest.mock('../../parser/FHIRPathService');
jest.mock('../../services/FHIRPathContextService');
jest.mock('../FHIRValidationProvider');
jest.mock('../../services/ModelProviderService');

describe('DiagnosticProvider - Enhanced Type-Aware Validation', () => {
  let diagnosticProvider: DiagnosticProvider;
  let mockFhirPathService: jest.Mocked<FHIRPathService>;
  let mockFhirPathContextService: jest.Mocked<FHIRPathContextService>;
  let mockModelProviderService: jest.Mocked<ModelProviderService>;
  let mockFhirValidationProvider: jest.Mocked<FHIRValidationProvider>;

  beforeEach(() => {
    // Create mocks
    mockFhirPathService = {
      parse: jest.fn(),
      compile: jest.fn(),
      evaluate: jest.fn(),
      getAvailableResourceTypes: jest.fn(),
      isValidResourceType: jest.fn(),
      initializeModelProvider: jest.fn()
    } as any;

    mockFhirPathContextService = {
      extractFHIRPathExpressions: jest.fn(),
      getResourceContext: jest.fn(),
      inferResourceTypeFromExpression: jest.fn()
    } as any;

    mockModelProviderService = {
      isInitialized: jest.fn().mockReturnValue(true),
      validateChoiceProperty: jest.fn(),
      navigatePropertyPath: jest.fn(),
      getEnhancedTypeInfo: jest.fn(),
      getTypeInfo: jest.fn(),
      getResourceTypeInfo: jest.fn()
    } as any;

    mockFhirValidationProvider = {
      validate: jest.fn()
    } as any;

    // Initialize diagnostic provider
    diagnosticProvider = new DiagnosticProvider(
      mockFhirPathService,
      mockFhirPathContextService,
      mockFhirValidationProvider,
      {
        fhirBestPractices: {
          enabled: true,
          enforceTypeSafety: true,
          flagDeprecatedElements: true,
          suggestOptimizations: true,
          checkCardinality: true
        }
      },
      mockModelProviderService
    );
  });

  describe('Choice Type Validation', () => {
    it('should detect invalid choice type properties', async () => {
      // Setup
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.valueInteger'
      );

      mockFhirPathContextService.extractFHIRPathExpressions.mockReturnValue([{
        expression: 'Patient.valueInteger',
        line: 0,
        column: 0,
        length: 19
      }]);

      mockFhirPathService.parse.mockReturnValue({
        success: true,
        ast: {} as any,
        errors: []
      });

      const choiceValidationResult: ChoiceValidationResult = {
        isValid: false,
        error: 'Invalid choice type',
        validChoices: ['valueString', 'valueQuantity', 'valueBoolean'],
        suggestedProperty: 'valueString'
      };

      mockModelProviderService.validateChoiceProperty.mockResolvedValue(choiceValidationResult);

      // Execute
      const diagnostics = await diagnosticProvider.provideDiagnostics(document);

      // Verify
      expect(diagnostics).toHaveLength(1);
      const diagnostic = diagnostics[0] as ChoiceTypeDiagnostic;
      expect(diagnostic.severity).toBe(DiagnosticSeverity.Error);
      expect(diagnostic.message).toContain('valueInteger');
      expect(diagnostic.message).toContain('valueString, valueQuantity, valueBoolean');
      expect(diagnostic.category).toBe(EnhancedDiagnosticCategory.ChoiceTypes);
      expect(diagnostic.quickFix).toBeDefined();
      expect(diagnostic.quickFix?.title).toContain('valueString');
    });

    it('should suggest best matching choice type', async () => {
      // Setup
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Observation.valueStrin' // Typo: missing 'g'
      );

      mockFhirPathContextService.extractFHIRPathExpressions.mockReturnValue([{
        expression: 'Observation.valueStrin',
        line: 0,
        column: 0,
        length: 22
      }]);

      mockFhirPathService.parse.mockReturnValue({
        success: true,
        ast: {} as any,
        errors: []
      });

      const choiceValidationResult: ChoiceValidationResult = {
        isValid: false,
        validChoices: ['valueString', 'valueQuantity', 'valueBoolean', 'valueDateTime'],
        suggestedProperty: 'valueString'
      };

      mockModelProviderService.validateChoiceProperty.mockResolvedValue(choiceValidationResult);

      // Execute
      const diagnostics = await diagnosticProvider.provideDiagnostics(document);

      // Verify
      expect(diagnostics).toHaveLength(1);
      const diagnostic = diagnostics[0] as ChoiceTypeDiagnostic;
      expect(diagnostic.choiceInfo?.suggestedChoice).toBe('valueString');
      expect(diagnostic.quickFix?.newText).toContain('valueString');
    });
  });

  describe('Property Path Validation', () => {
    it('should detect invalid property paths', async () => {
      // Setup
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.nam.family' // Typo: 'nam' instead of 'name'
      );

      mockFhirPathContextService.extractFHIRPathExpressions.mockReturnValue([{
        expression: 'Patient.nam.family',
        line: 0,
        column: 0,
        length: 18
      }]);

      mockFhirPathService.parse.mockReturnValue({
        success: true,
        ast: {} as any,
        errors: []
      });

      const navigationResult: NavigationResult = {
        isValid: false,
        finalType: undefined,
        navigationPath: [],
        availableProperties: ['name', 'identifier', 'gender', 'birthDate'],
        errors: ['Property "nam" not found']
      };

      mockModelProviderService.navigatePropertyPath.mockResolvedValue(navigationResult);

      // Execute
      const diagnostics = await diagnosticProvider.provideDiagnostics(document);

      // Verify
      expect(diagnostics).toHaveLength(1);
      const diagnostic = diagnostics[0];
      expect(diagnostic.severity).toBe(DiagnosticSeverity.Error);
      expect(diagnostic.message).toContain('nam');
      expect(diagnostic.message).toContain('name');
      expect(diagnostic.message).toContain('identifier, gender, birthDate');
      expect(diagnostic.category).toBe(EnhancedDiagnosticCategory.TypeSafety);
    });

    it('should provide property suggestions based on similarity', async () => {
      // Setup
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.identifyer' // Typo: 'identifyer' instead of 'identifier'
      );

      mockFhirPathContextService.extractFHIRPathExpressions.mockReturnValue([{
        expression: 'Patient.identifyer',
        line: 0,
        column: 0,
        length: 18
      }]);

      mockFhirPathService.parse.mockReturnValue({
        success: true,
        ast: {} as any,
        errors: []
      });

      const navigationResult: NavigationResult = {
        isValid: false,
        finalType: undefined,
        navigationPath: [],
        availableProperties: ['identifier', 'name', 'gender'],
        errors: ['Property "identifyer" not found']
      };

      mockModelProviderService.navigatePropertyPath.mockResolvedValue(navigationResult);

      // Execute
      const diagnostics = await diagnosticProvider.provideDiagnostics(document);

      // Verify
      expect(diagnostics).toHaveLength(1);
      const diagnostic = diagnostics[0];
      expect(diagnostic.typeInfo?.suggestedProperty).toBe('identifier');
      expect(diagnostic.quickFix?.title).toContain('identifier');
    });
  });

  describe('Constraint Validation', () => {
    it('should validate required field constraints', async () => {
      // Setup
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.identifier.exists()'
      );

      mockFhirPathContextService.extractFHIRPathExpressions.mockReturnValue([{
        expression: 'Patient.identifier.exists()',
        line: 0,
        column: 0,
        length: 25
      }]);

      mockFhirPathService.parse.mockReturnValue({
        success: true,
        ast: {} as any,
        errors: []
      });

      const typeInfo: EnhancedTypeInfo = {
        type: {
          name: 'Identifier',
          kind: 'complex-type',
          cardinality: '0..*'
        } as any,
        hierarchy: [],
        choiceTypes: [],
        constraints: {
          cardinality: '1..*',
          required: true,
          minLength: undefined,
          maxLength: undefined
        },
        terminology: {
          strength: 'example' as const
        }
      };

      mockModelProviderService.getEnhancedTypeInfo.mockResolvedValue(typeInfo);

      // Execute
      const diagnostics = await diagnosticProvider.provideDiagnostics(document);

      // Verify
      expect(diagnostics).toHaveLength(1);
      const diagnostic = diagnostics[0];
      expect(diagnostic.severity).toBe(DiagnosticSeverity.Warning);
      expect(diagnostic.category).toBe(EnhancedDiagnosticCategory.ConstraintViolation);
      expect(diagnostic.message).toContain('Constraint violation');
    });

    it('should validate cardinality constraints', async () => {
      // Setup
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.name.family'
      );

      mockFhirPathContextService.extractFHIRPathExpressions.mockReturnValue([{
        expression: 'Patient.name.family',
        line: 0,
        column: 0,
        length: 18
      }]);

      mockFhirPathService.parse.mockReturnValue({
        success: true,
        ast: {} as any,
        errors: []
      });

      const typeInfo: EnhancedTypeInfo = {
        type: {
          name: 'string',
          kind: 'primitive-type',
          cardinality: '0..1'
        } as any,
        hierarchy: [],
        choiceTypes: [],
        constraints: {
          cardinality: '1..1',
          required: true
        },
        terminology: {
          strength: 'example' as const
        }
      };

      mockModelProviderService.getEnhancedTypeInfo.mockResolvedValue(typeInfo);

      // Execute
      const diagnostics = await diagnosticProvider.provideDiagnostics(document);

      // Verify
      expect(diagnostics).toHaveLength(1);
      const diagnostic = diagnostics[0];
      expect(diagnostic.severity).toBe(DiagnosticSeverity.Warning);
      expect(diagnostic.typeInfo?.constraints).toBeDefined();
    });
  });

  describe('Enhanced Error Messages', () => {
    it('should provide enhanced error messages with type information', async () => {
      // Setup
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.invalidProperty'
      );

      mockFhirPathContextService.extractFHIRPathExpressions.mockReturnValue([{
        expression: 'Patient.invalidProperty',
        line: 0,
        column: 0,
        length: 21
      }]);

      mockFhirPathService.parse.mockReturnValue({
        success: true,
        ast: {} as any,
        errors: []
      });

      const navigationResult: NavigationResult = {
        isValid: false,
        finalType: undefined,
        navigationPath: [],
        availableProperties: ['name', 'identifier', 'gender', 'birthDate', 'address'],
        errors: ['Property "invalidProperty" not found']
      };

      mockModelProviderService.navigatePropertyPath.mockResolvedValue(navigationResult);

      // Execute
      const diagnostics = await diagnosticProvider.provideDiagnostics(document);

      // Verify
      expect(diagnostics).toHaveLength(1);
      const diagnostic = diagnostics[0];
      expect(diagnostic.message).toContain('invalidProperty');
      expect(diagnostic.message).toContain('Available properties');
      expect(diagnostic.message).toContain('name, identifier, gender, birthDate, address');
      expect(diagnostic.typeInfo).toBeDefined();
      expect(diagnostic.typeInfo?.resourceType).toBe('Patient');
      expect(diagnostic.typeInfo?.propertyPath).toEqual(['Patient', 'invalidProperty']);
    });

    it('should provide context-aware suggestions', async () => {
      // Setup
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Observation.valueIntege' // Close to 'valueInteger'
      );

      mockFhirPathContextService.extractFHIRPathExpressions.mockReturnValue([{
        expression: 'Observation.valueIntege',
        line: 0,
        column: 0,
        length: 23
      }]);

      mockFhirPathService.parse.mockReturnValue({
        success: true,
        ast: {} as any,
        errors: []
      });

      const choiceValidationResult: ChoiceValidationResult = {
        isValid: false,
        validChoices: ['valueInteger', 'valueString', 'valueQuantity'],
        suggestedProperty: 'valueInteger'
      };

      mockModelProviderService.validateChoiceProperty.mockResolvedValue(choiceValidationResult);

      // Execute
      const diagnostics = await diagnosticProvider.provideDiagnostics(document);

      // Verify
      expect(diagnostics).toHaveLength(1);
      const diagnostic = diagnostics[0] as ChoiceTypeDiagnostic;
      expect(diagnostic.message).toContain('Did you mean \'valueInteger\'?');
      expect(diagnostic.choiceInfo?.suggestedChoice).toBe('valueInteger');
    });
  });

  describe('Deep Property Path Validation', () => {
    it('should validate multi-level property paths', async () => {
      // Setup
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.name.family.substring(0, 5)'
      );

      mockFhirPathContextService.extractFHIRPathExpressions.mockReturnValue([{
        expression: 'Patient.name.family.substring(0, 5)',
        line: 0,
        column: 0,
        length: 35
      }]);

      mockFhirPathService.parse.mockReturnValue({
        success: true,
        ast: {} as any,
        errors: []
      });

      const navigationResult: NavigationResult = {
        isValid: true,
        finalType: {
          name: 'string',
          kind: 'primitive-type',
          cardinality: '0..1'
        } as any,
        navigationPath: [
          { name: 'Patient', kind: 'resource', cardinality: '1..1' } as any,
          { name: 'HumanName', kind: 'complex-type', cardinality: '0..*' } as any,
          { name: 'string', kind: 'primitive-type', cardinality: '0..1' } as any
        ],
        availableProperties: [],
        errors: []
      };

      mockModelProviderService.navigatePropertyPath.mockResolvedValue(navigationResult);

      // Execute
      const diagnostics = await diagnosticProvider.provideDiagnostics(document);

      // This should pass validation with no errors
      const typeAwareErrors = diagnostics.filter(d => 
        d.category === EnhancedDiagnosticCategory.TypeSafety ||
        d.category === EnhancedDiagnosticCategory.ChoiceTypes
      );
      expect(typeAwareErrors).toHaveLength(0);
    });
  });

  describe('Performance and Integration', () => {
    it('should handle documents without ModelProvider gracefully', async () => {
      // Setup - create provider without ModelProvider
      const providerWithoutModel = new DiagnosticProvider(
        mockFhirPathService,
        mockFhirPathContextService,
        mockFhirValidationProvider,
        undefined,
        undefined // No ModelProvider
      );

      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.invalidProperty'
      );

      mockFhirPathContextService.extractFHIRPathExpressions.mockReturnValue([{
        expression: 'Patient.invalidProperty',
        line: 0,
        column: 0,
        length: 21
      }]);

      mockFhirPathService.parse.mockReturnValue({
        success: true,
        ast: {} as any,
        errors: []
      });

      // Execute
      const diagnostics = await providerWithoutModel.provideDiagnostics(document);

      // Should not crash and should provide basic diagnostics
      expect(diagnostics).toBeDefined();
    });

    it('should maintain performance with large expressions', async () => {
      // Setup - large expression
      const largeExpression = 'Patient.name.where(family.exists()).family.where(length() > 2).substring(0, 10).upper()';
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        largeExpression
      );

      mockFhirPathContextService.extractFHIRPathExpressions.mockReturnValue([{
        expression: largeExpression,
        line: 0,
        column: 0,
        length: largeExpression.length
      }]);

      mockFhirPathService.parse.mockReturnValue({
        success: true,
        ast: {} as any,
        errors: []
      });

      const navigationResult: NavigationResult = {
        isValid: true,
        finalType: {
          name: 'string',
          kind: 'primitive-type',
          cardinality: '0..*'
        } as any,
        navigationPath: [],
        availableProperties: [],
        errors: []
      };

      mockModelProviderService.navigatePropertyPath.mockResolvedValue(navigationResult);

      // Execute and measure time
      const startTime = Date.now();
      const diagnostics = await diagnosticProvider.provideDiagnostics(document);
      const endTime = Date.now();

      // Verify performance (should be under 200ms as per success metrics)
      expect(endTime - startTime).toBeLessThan(200);
      expect(diagnostics).toBeDefined();
    });
  });
});