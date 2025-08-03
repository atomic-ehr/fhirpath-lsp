import { expect, test, describe, beforeEach, mock } from 'bun:test';
import { Position, Range, Location } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { ReferencesProvider } from '../ReferencesProvider';
import { ModelProviderService } from '../../services/ModelProviderService';
import { SymbolService } from '../../services/SymbolService';
import {
  ReferenceType,
  UsageType,
  EnhancedReference,
  ReferenceFinderConfig
} from '../EnhancedReferenceTypes';

describe('ReferencesProvider Enhanced Functionality', () => {
  let referencesProvider: ReferencesProvider;
  let mockConnection: any;
  let mockSymbolService: any;
  let mockModelProviderService: any;
  let sampleDocument: TextDocument;

  beforeEach(() => {
    mockConnection = {
      console: {
        log: mock(() => {}),
        error: mock(() => {}),
        warn: mock(() => {})
      }
    };

    mockSymbolService = {
      findSymbolAtPosition: mock(() => null),
      extractDocumentSymbols: mock(() => ({ symbols: [] }))
    };

    mockModelProviderService = {
      isInitialized: mock(() => true),
      isChoiceProperty: mock(() => false),
      extractBaseProperty: mock(() => 'value'),
      extractChoiceType: mock(() => 'String'),
      getEnhancedTypeInfo: mock(() => Promise.resolve(undefined)),
      navigatePropertyPath: mock(() => Promise.resolve({
        isValid: true,
        finalType: { name: 'String' },
        navigationPath: [],
        availableProperties: [],
        errors: []
      }))
    };

    referencesProvider = new ReferencesProvider(
      mockConnection,
      mockSymbolService,
      mockModelProviderService
    );

    sampleDocument = TextDocument.create(
      'file:///test.fhirpath',
      'fhirpath',
      1,
      `Patient.name.given.where(use = 'official')
Observation.valueString
Observation.valueQuantity
Patient.id
Observation.id
MedicationRequest.status
Patient.active
Organization.name`
    );
  });

  describe('Enhanced Reference Finding', () => {
    test('should find enhanced references with ModelProvider', async () => {
      // Mock symbol
      const mockSymbol = {
        name: 'name',
        kind: 'property',
        range: Range.create(0, 8, 0, 12)
      };

      mockSymbolService.findSymbolAtPosition.mockReturnValue(mockSymbol);

      const result = await referencesProvider.findEnhancedReferences(
        sampleDocument,
        Position.create(0, 10)
      );

      expect(result).toBeDefined();
      expect(result.references).toBeArray();
      expect(result.summary).toBeDefined();
      expect(result.summary.totalReferences).toBeGreaterThanOrEqual(0);
    });

    test('should handle missing ModelProvider gracefully', async () => {
      const providerWithoutModel = new ReferencesProvider(mockConnection, mockSymbolService);
      
      const result = await providerWithoutModel.findEnhancedReferences(
        sampleDocument,
        Position.create(0, 10)
      );

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('NO_MODEL_PROVIDER');
      expect(result.references).toHaveLength(0);
    });

    test('should handle missing symbol gracefully', async () => {
      mockSymbolService.findSymbolAtPosition.mockReturnValue(null);

      const result = await referencesProvider.findEnhancedReferences(
        sampleDocument,
        Position.create(0, 10)
      );

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('NO_SYMBOL');
      expect(result.references).toHaveLength(0);
    });
  });

  describe('Choice Type Reference Discovery', () => {
    test('should find choice type references', async () => {
      const mockSymbol = {
        name: 'valueString',
        kind: 'property',
        range: Range.create(1, 12, 1, 23)
      };

      mockSymbolService.findSymbolAtPosition.mockReturnValue(mockSymbol);
      mockModelProviderService.isChoiceProperty.mockReturnValue(true);
      mockModelProviderService.extractBaseProperty.mockReturnValue('value');
      mockModelProviderService.extractChoiceType.mockReturnValue('String');

      const result = await referencesProvider.findEnhancedReferences(
        sampleDocument,
        Position.create(1, 15),
        { includeChoiceTypes: true }
      );

      expect(result.references.length).toBeGreaterThan(0);
      
      // Should find both valueString and valueQuantity as choice type references
      const choiceTypeRefs = result.references.filter(ref => 
        ref.type === ReferenceType.CHOICE_TYPE_USAGE
      );
      expect(choiceTypeRefs.length).toBeGreaterThan(0);
    });

    test('should extract base property correctly from choice properties', async () => {
      mockModelProviderService.isChoiceProperty.mockReturnValue(true);
      mockModelProviderService.extractBaseProperty.mockReturnValueOnce('value');
      mockModelProviderService.extractBaseProperty.mockReturnValueOnce('effective');
      
      expect(mockModelProviderService.extractBaseProperty('valueString')).toBe('value');
      expect(mockModelProviderService.extractBaseProperty('effectiveDateTime')).toBe('effective');
    });

    test('should group choice type references', async () => {
      const mockSymbol = {
        name: 'value',
        kind: 'property',
        range: Range.create(1, 12, 1, 17)
      };

      mockSymbolService.findSymbolAtPosition.mockReturnValue(mockSymbol);

      const result = await referencesProvider.findEnhancedReferences(
        sampleDocument,
        Position.create(1, 15),
        { groupResults: true, includeChoiceTypes: true }
      );

      expect(result.grouped).toBeArray();
      const choiceGroup = result.grouped.find(group => group.type === 'choiceTypes');
      if (choiceGroup) {
        expect(choiceGroup.references.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Inherited Property Reference Discovery', () => {
    test('should find inherited property references', async () => {
      const mockSymbol = {
        name: 'id',
        kind: 'property',
        range: Range.create(3, 8, 3, 10)
      };

      mockSymbolService.findSymbolAtPosition.mockReturnValue(mockSymbol);

      const result = await referencesProvider.findEnhancedReferences(
        sampleDocument,
        Position.create(3, 9),
        { includeInherited: true }
      );

      expect(result.references.length).toBeGreaterThan(0);
      
      // Should find id property in both Patient and Observation
      const inheritedRefs = result.references.filter(ref => 
        ref.type === ReferenceType.INHERITED_USAGE
      );
      expect(inheritedRefs.length).toBeGreaterThan(0);
    });

    test('should identify common inherited properties', async () => {
      const inheritedProperties = ['id', 'meta', 'extension', 'text', 'language'];
      
      for (const prop of inheritedProperties) {
        const mockSymbol = {
          name: prop,
          kind: 'property',
          range: Range.create(0, 0, 0, prop.length)
        };

        mockSymbolService.findSymbolAtPosition.mockReturnValue(mockSymbol);

        const result = await referencesProvider.findEnhancedReferences(
          sampleDocument,
          Position.create(0, 0),
          { includeInherited: true }
        );

        // Should handle inherited properties without errors
        expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0);
      }
    });
  });

  describe('Cross-Resource Reference Finding', () => {
    test('should find cross-resource references', async () => {
      const mockSymbol = {
        name: 'status',
        kind: 'property',
        range: Range.create(5, 18, 5, 24)
      };

      mockSymbolService.findSymbolAtPosition.mockReturnValue(mockSymbol);

      const result = await referencesProvider.findEnhancedReferences(
        sampleDocument,
        Position.create(5, 20),
        { includeCrossResource: true }
      );

      expect(result.references.length).toBeGreaterThan(0);
      
      // Should find status-like properties across different resources
      const crossResourceRefs = result.references.filter(ref => 
        ref.type === ReferenceType.CROSS_RESOURCE_USAGE
      );
      expect(crossResourceRefs.length).toBeGreaterThan(0);
    });

    test('should handle common cross-resource properties', async () => {
      const commonProperties = ['status', 'active', 'name', 'code', 'category'];
      
      for (const prop of commonProperties) {
        const mockSymbol = {
          name: prop,
          kind: 'property',
          range: Range.create(0, 0, 0, prop.length)
        };

        mockSymbolService.findSymbolAtPosition.mockReturnValue(mockSymbol);

        const result = await referencesProvider.findEnhancedReferences(
          sampleDocument,
          Position.create(0, 0),
          { includeCrossResource: true }
        );

        // Should handle cross-resource properties without errors
        expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0);
      }
    });
  });

  describe('Usage Pattern Analysis', () => {
    test('should classify usage patterns correctly', async () => {
      const testCases = [
        { text: 'Patient.name.where(use = "official")', expected: UsageType.CONDITION },
        { text: 'Patient.name.given', expected: UsageType.NAVIGATION },
        { text: 'Patient.select(name)', expected: UsageType.SELECTION },
        { text: 'Patient.name.exists()', expected: UsageType.EXISTS_CHECK },
        { text: 'Patient.name', expected: UsageType.READ }
      ];

      const mockSymbol = {
        name: 'name',
        kind: 'property',
        range: Range.create(0, 8, 0, 12)
      };

      mockSymbolService.findSymbolAtPosition.mockReturnValue(mockSymbol);

      for (const testCase of testCases) {
        const testDoc = TextDocument.create(
          'file:///test.fhirpath',
          'fhirpath',
          1,
          testCase.text
        );

        const result = await referencesProvider.findEnhancedReferences(
          testDoc,
          Position.create(0, 10)
        );

        if (result.references.length > 0) {
          const hasExpectedUsage = result.references.some(ref => ref.usage === testCase.expected);
          expect(hasExpectedUsage).toBe(true);
        }
      }
    });

    test('should calculate usage pattern statistics', async () => {
      const mockSymbol = {
        name: 'name',
        kind: 'property',
        range: Range.create(0, 8, 0, 12)
      };

      mockSymbolService.findSymbolAtPosition.mockReturnValue(mockSymbol);

      const result = await referencesProvider.findEnhancedReferences(
        sampleDocument,
        Position.create(0, 10),
        { groupResults: true }
      );

      expect(result.summary).toBeDefined();
      expect(result.summary.mostCommonUsage).toBeOneOf(Object.values(UsageType));
      expect(result.summary.totalReferences).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Reference Confidence and Ranking', () => {
    test('should assign confidence scores to references', async () => {
      const mockSymbol = {
        name: 'name',
        kind: 'property',
        range: Range.create(0, 8, 0, 12)
      };

      mockSymbolService.findSymbolAtPosition.mockReturnValue(mockSymbol);

      const result = await referencesProvider.findEnhancedReferences(
        sampleDocument,
        Position.create(0, 10)
      );

      for (const ref of result.references) {
        expect(ref.confidence).toBeNumber();
        expect(ref.confidence).toBeGreaterThanOrEqual(0);
        expect(ref.confidence).toBeLessThanOrEqual(1);
      }
    });

    test('should filter references by minimum confidence', async () => {
      const mockSymbol = {
        name: 'name',
        kind: 'property',
        range: Range.create(0, 8, 0, 12)
      };

      mockSymbolService.findSymbolAtPosition.mockReturnValue(mockSymbol);

      const lowConfidenceResult = await referencesProvider.findEnhancedReferences(
        sampleDocument,
        Position.create(0, 10),
        { minConfidence: 0.1 }
      );

      const highConfidenceResult = await referencesProvider.findEnhancedReferences(
        sampleDocument,
        Position.create(0, 10),
        { minConfidence: 0.9 }
      );

      expect(lowConfidenceResult.references.length).toBeGreaterThanOrEqual(
        highConfidenceResult.references.length
      );
    });

    test('should sort references by relevance', async () => {
      const mockSymbol = {
        name: 'name',
        kind: 'property',
        range: Range.create(0, 8, 0, 12)
      };

      mockSymbolService.findSymbolAtPosition.mockReturnValue(mockSymbol);

      const result = await referencesProvider.findEnhancedReferences(
        sampleDocument,
        Position.create(0, 10),
        { sortBy: 'relevance' }
      );

      // Check that references are sorted by confidence (descending)
      for (let i = 1; i < result.references.length; i++) {
        expect(result.references[i - 1].confidence).toBeGreaterThanOrEqual(
          result.references[i].confidence
        );
      }
    });
  });

  describe('Reference Grouping', () => {
    test('should group references by resource type', async () => {
      const mockSymbol = {
        name: 'id',
        kind: 'property',
        range: Range.create(3, 8, 3, 10)
      };

      mockSymbolService.findSymbolAtPosition.mockReturnValue(mockSymbol);

      const result = await referencesProvider.findEnhancedReferences(
        sampleDocument,
        Position.create(3, 9),
        { groupResults: true }
      );

      expect(result.grouped).toBeArray();
      
      const resourceTypeGroups = result.grouped.filter(group => 
        group.type === 'resourceType'
      );
      expect(resourceTypeGroups.length).toBeGreaterThan(0);
    });

    test('should provide usage pattern statistics for groups', async () => {
      const mockSymbol = {
        name: 'name',
        kind: 'property',
        range: Range.create(0, 8, 0, 12)
      };

      mockSymbolService.findSymbolAtPosition.mockReturnValue(mockSymbol);

      const result = await referencesProvider.findEnhancedReferences(
        sampleDocument,
        Position.create(0, 10),
        { groupResults: true }
      );

      for (const group of result.grouped) {
        expect(group.usagePatterns).toBeDefined();
        expect(group.usagePatterns.total).toBeNumber();
        expect(group.usagePatterns.total).toBe(group.references.length);
      }
    });
  });

  describe('Configuration Options', () => {
    test('should respect maxResults configuration', async () => {
      const mockSymbol = {
        name: 'name',
        kind: 'property',
        range: Range.create(0, 8, 0, 12)
      };

      mockSymbolService.findSymbolAtPosition.mockReturnValue(mockSymbol);

      const result = await referencesProvider.findEnhancedReferences(
        sampleDocument,
        Position.create(0, 10),
        { maxResults: 5 }
      );

      expect(result.references.length).toBeLessThanOrEqual(5);
    });

    test('should handle different sorting options', async () => {
      const sortOptions: ('relevance' | 'location' | 'usage')[] = ['relevance', 'location', 'usage'];
      
      const mockSymbol = {
        name: 'name',
        kind: 'property',
        range: Range.create(0, 8, 0, 12)
      };

      mockSymbolService.findSymbolAtPosition.mockReturnValue(mockSymbol);

      for (const sortBy of sortOptions) {
        const result = await referencesProvider.findEnhancedReferences(
          sampleDocument,
          Position.create(0, 10),
          { sortBy }
        );

        // Should not throw error and should return valid results
        expect(result.references).toBeArray();
        expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0);
      }
    });

    test('should allow disabling specific reference types', async () => {
      const mockSymbol = {
        name: 'valueString',
        kind: 'property',
        range: Range.create(1, 12, 1, 23)
      };

      mockSymbolService.findSymbolAtPosition.mockReturnValue(mockSymbol);
      mockModelProviderService.isChoiceProperty.mockReturnValue(true);

      const withChoiceTypes = await referencesProvider.findEnhancedReferences(
        sampleDocument,
        Position.create(1, 15),
        { includeChoiceTypes: true }
      );

      const withoutChoiceTypes = await referencesProvider.findEnhancedReferences(
        sampleDocument,
        Position.create(1, 15),
        { includeChoiceTypes: false }
      );

      const choiceTypeRefsWith = withChoiceTypes.references.filter(ref => 
        ref.type === ReferenceType.CHOICE_TYPE_USAGE
      );
      const choiceTypeRefsWithout = withoutChoiceTypes.references.filter(ref => 
        ref.type === ReferenceType.CHOICE_TYPE_USAGE
      );

      expect(choiceTypeRefsWith.length).toBeGreaterThanOrEqual(choiceTypeRefsWithout.length);
    });
  });

  describe('Error Handling', () => {
    test('should handle ModelProvider errors gracefully', async () => {
      mockModelProviderService.isInitialized.mockReturnValue(true);
      mockModelProviderService.isChoiceProperty.mockImplementation(() => {
        throw new Error('ModelProvider error');
      });

      const mockSymbol = {
        name: 'valueString',
        kind: 'property',
        range: Range.create(1, 12, 1, 23)
      };

      mockSymbolService.findSymbolAtPosition.mockReturnValue(mockSymbol);

      const result = await referencesProvider.findEnhancedReferences(
        sampleDocument,
        Position.create(1, 15)
      );

      // Should not crash and should return partial results
      expect(result).toBeDefined();
      expect(result.references).toBeArray();
    });

    test('should provide meaningful error messages', async () => {
      const uninitializedModelProvider = {
        isInitialized: mock(() => false)
      };

      const providerWithUninitializedModel = new ReferencesProvider(
        mockConnection,
        mockSymbolService,
        uninitializedModelProvider as any
      );

      const result = await providerWithUninitializedModel.findEnhancedReferences(
        sampleDocument,
        Position.create(0, 10)
      );

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('ModelProvider not available');
      expect(result.errors[0].severity).toBe('warning');
    });
  });

  describe('Performance', () => {
    test('should complete reference finding within reasonable time', async () => {
      const mockSymbol = {
        name: 'name',
        kind: 'property',
        range: Range.create(0, 8, 0, 12)
      };

      mockSymbolService.findSymbolAtPosition.mockReturnValue(mockSymbol);

      const startTime = Date.now();
      
      const result = await referencesProvider.findEnhancedReferences(
        sampleDocument,
        Position.create(0, 10)
      );
      
      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(500); // Should complete within 500ms
      expect(result).toBeDefined();
    });

    test('should handle large documents efficiently', async () => {
      // Create a larger document
      const largeContent = Array(100).fill(sampleDocument.getText()).join('\\n');
      const largeDocument = TextDocument.create(
        'file:///large-test.fhirpath',
        'fhirpath',
        1,
        largeContent
      );

      const mockSymbol = {
        name: 'name',
        kind: 'property',
        range: Range.create(0, 8, 0, 12)
      };

      mockSymbolService.findSymbolAtPosition.mockReturnValue(mockSymbol);

      const result = await referencesProvider.findEnhancedReferences(
        largeDocument,
        Position.create(0, 10),
        { maxResults: 50 } // Limit results for performance
      );

      expect(result).toBeDefined();
      expect(result.references.length).toBeLessThanOrEqual(50);
    });
  });
});