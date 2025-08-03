import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { HoverProvider } from '../HoverProvider';
import { FHIRPathService } from '../../parser/FHIRPathService';
import { FHIRPathContextService } from '../../services/FHIRPathContextService';
import { ModelProviderService } from '../../services/ModelProviderService';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { HoverParams, MarkupKind } from 'vscode-languageserver/node';

describe('HoverProvider Enhanced Features', () => {
  let hoverProvider: HoverProvider;
  let mockFHIRPathService: any;
  let mockFHIRPathContextService: any;
  let mockModelProviderService: any;

  beforeEach(() => {
    // Mock FHIRPathService
    mockFHIRPathService = {
      getAvailableResourceTypes: () => ['Patient', 'Observation', 'Condition'],
      isValidResourceType: (type: string) => ['Patient', 'Observation', 'Condition'].includes(type),
      getResourcePropertyDetails: (resourceType: string) => {
        const properties: Record<string, any[]> = {
          Patient: [
            { name: 'id', type: 'string', description: 'Logical id' },
            { name: 'name', type: 'HumanName', cardinality: '0..*', description: 'A human name' },
            { name: 'birthDate', type: 'date', description: 'Date of birth' },
            { name: 'active', type: 'boolean', description: 'Whether record is in active use' }
          ],
          Observation: [
            { name: 'id', type: 'string', description: 'Logical id' },
            { name: 'status', type: 'code', description: 'Status of the observation' },
            { name: 'valueQuantity', type: 'Quantity', description: 'Value as quantity' },
            { name: 'valueString', type: 'string', description: 'Value as string' }
          ]
        };
        return properties[resourceType] || [];
      },
      getExpressionType: () => null,
      analyzeWithContext: () => null
    };

    // Mock FHIRPathContextService
    mockFHIRPathContextService = {
      getCompletionContext: () => null
    };

    // Mock ModelProviderService
    mockModelProviderService = {
      isInitialized: () => true,
      navigatePropertyPath: mock(async (resourceType: string, propertyPath: string[]) => {
        const mockResults: Record<string, any> = {
          'Patient': {
            isValid: true,
            finalType: { name: 'Patient' },
            availableProperties: ['id', 'name', 'birthDate', 'active']
          },
          'Patient.name': {
            isValid: true,
            finalType: { name: 'HumanName' },
            availableProperties: ['family', 'given', 'use', 'text']
          }
        };
        const key = propertyPath.length > 0 ? `${resourceType}.${propertyPath.join('.')}` : resourceType;
        return mockResults[key] || { isValid: false, finalType: null, availableProperties: [] };
      }),
      getEnhancedTypeInfo: mock(async (typeName: string) => {
        const mockEnhanced: Record<string, any> = {
          'Patient': {
            hierarchy: [
              { type: { name: 'Patient' } },
              { type: { name: 'DomainResource' } },
              { type: { name: 'Resource' } }
            ],
            constraints: {
              cardinality: '1..1',
              required: false
            },
            terminology: null,
            choiceTypes: []
          },
          'HumanName': {
            hierarchy: [
              { type: { name: 'HumanName' } },
              { type: { name: 'Element' } }
            ],
            constraints: {
              cardinality: '0..*',
              required: false
            },
            terminology: null,
            choiceTypes: []
          },
          'Quantity': {
            hierarchy: [
              { type: { name: 'Quantity' } },
              { type: { name: 'Element' } }
            ],
            constraints: {
              cardinality: '0..1',
              required: false
            },
            terminology: {
              strength: 'preferred',
              valueSet: 'http://hl7.org/fhir/ValueSet/ucum-common',
              description: 'UCUM Common Units'
            },
            choiceTypes: []
          }
        };
        return mockEnhanced[typeName] || null;
      }),
      resolveChoiceTypes: mock(async (typeInfo: any) => {
        if (typeInfo.name === 'Observation') {
          return [
            { type: { name: 'Quantity' } },
            { type: { name: 'string' } },
            { type: { name: 'boolean' } },
            { type: { name: 'CodeableConcept' } }
          ];
        }
        return [];
      })
    };

    hoverProvider = new HoverProvider(
      mockFHIRPathService,
      mockFHIRPathContextService,
      mockModelProviderService
    );
  });

  describe('Enhanced Type Hover', () => {
    test('should provide enhanced hover for Patient resource', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient');
      const params: HoverParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 5 }
      };

      const hover = await hoverProvider.provideHover(document, params);

      expect(hover).not.toBeNull();
      expect(hover?.contents).toBeDefined();
      const content = hover?.contents as any;
      expect(content.kind).toBe(MarkupKind.Markdown);
      expect(content.value).toContain('🔷 Patient');
      expect(content.value).toContain('Type: Patient');
    });

    test('should provide enhanced hover with type hierarchy', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient');
      const params: HoverParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 5 }
      };

      const hover = await hoverProvider.provideHover(document, params);

      expect(hover).not.toBeNull();
      const content = hover?.contents as any;
      expect(content.value).toContain('📊 **Type Hierarchy**');
      expect(content.value).toContain('Patient → DomainResource → Resource');
    });

    test('should provide enhanced hover with constraints', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.name');
      const params: HoverParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 10 }
      };

      const hover = await hoverProvider.provideHover(document, params);

      expect(hover).not.toBeNull();
      const content = hover?.contents as any;
      expect(content.value).toContain('⚖️ **Constraints**');
      expect(content.value).toContain('Cardinality: 0..*');
    });

    test('should provide enhanced hover with terminology binding', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Observation.valueQuantity');
      const params: HoverParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 20 }
      };

      // Mock navigation for this specific case
      mockModelProviderService.navigatePropertyPath = mock(async () => ({
        isValid: true,
        finalType: { name: 'Quantity' },
        availableProperties: ['value', 'unit', 'system', 'code']
      }));

      const hover = await hoverProvider.provideHover(document, params);

      expect(hover).not.toBeNull();
      const content = hover?.contents as any;
      expect(content.value).toContain('📚 **Terminology Binding**');
      expect(content.value).toContain('Strength: preferred');
      expect(content.value).toContain('ucum-common');
    });
  });

  describe('Choice Type Hover', () => {
    test('should provide choice type hover for valueQuantity', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Observation.valueQuantity');
      const params: HoverParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 20 }
      };

      const hover = await hoverProvider.provideHover(document, params);

      expect(hover).not.toBeNull();
      const content = hover?.contents as any;
      expect(content.value).toContain('🔀 valueQuantity');
      expect(content.value).toContain('Choice Type: Quantity');
      expect(content.value).toContain('from value[x]');
    });

    test('should show alternative choice types', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Observation.valueString');
      const params: HoverParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 18 }
      };

      const hover = await hoverProvider.provideHover(document, params);

      expect(hover).not.toBeNull();
      const content = hover?.contents as any;
      expect(content.value).toContain('Other Available Choices');
      expect(content.value).toContain('valueQuantity');
      expect(content.value).toContain('valueBoolean');
    });

    test('should provide type-specific information for Quantity', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Observation.valueQuantity');
      const params: HoverParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 20 }
      };

      const hover = await hoverProvider.provideHover(document, params);

      expect(hover).not.toBeNull();
      const content = hover?.contents as any;
      expect(content.value).toContain('📏 **Quantity Properties**');
      expect(content.value).toContain('value (decimal)');
      expect(content.value).toContain('unit (string)');
      expect(content.value).toContain('system (uri)');
    });
  });

  describe('FHIR Resource Hover', () => {
    test('should provide enhanced resource hover with key properties', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient');
      const params: HoverParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 5 }
      };

      const hover = await hoverProvider.provideHover(document, params);

      expect(hover).not.toBeNull();
      const content = hover?.contents as any;
      expect(content.value).toContain('🔷 Patient');
      expect(content.value).toContain('FHIR Resource');
      expect(content.value).toContain('📝 **Key Properties**');
    });

    test('should include FHIRPath examples for Patient', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient');
      const params: HoverParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 5 }
      };

      const hover = await hoverProvider.provideHover(document, params);

      expect(hover).not.toBeNull();
      const content = hover?.contents as any;
      expect(content.value).toContain('💡 **FHIRPath Examples**');
      expect(content.value).toContain('Patient.name.family');
      expect(content.value).toContain('Patient.birthDate < today()');
    });

    test('should include specification link', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient');
      const params: HoverParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 5 }
      };

      const hover = await hoverProvider.provideHover(document, params);

      expect(hover).not.toBeNull();
      const content = hover?.contents as any;
      expect(content.value).toContain('📚 [Specification]');
      expect(content.value).toContain('hl7.org/fhir/R4/patient.html');
    });
  });

  describe('Hover Caching', () => {
    test('should cache hover results', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient');
      const params: HoverParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 5 }
      };

      // First call
      await hoverProvider.provideHover(document, params);
      
      // Second call should use cache
      const hover = await hoverProvider.provideHover(document, params);

      expect(hover).not.toBeNull();
      // Verify that ModelProviderService methods were called only once
      expect(mockModelProviderService.navigatePropertyPath).toHaveBeenCalledTimes(1);
    });

    test('should respect cache expiry', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient');
      const params: HoverParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 5 }
      };

      // Mock cache expiry by directly accessing the private cache
      const provider = hoverProvider as any;
      provider.cacheExpiryMs = 1; // 1ms expiry

      await hoverProvider.provideHover(document, params);
      
      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 2));
      
      await hoverProvider.provideHover(document, params);

      // Should have been called twice due to cache expiry
      expect(mockModelProviderService.navigatePropertyPath).toHaveBeenCalledTimes(2);
    });
  });

  describe('Fallback Behavior', () => {
    test('should fallback to basic hover when ModelProviderService unavailable', async () => {
      const hoverProviderNoModel = new HoverProvider(
        mockFHIRPathService,
        mockFHIRPathContextService,
        undefined
      );

      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient');
      const params: HoverParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 5 }
      };

      const hover = await hoverProviderNoModel.provideHover(document, params);

      expect(hover).not.toBeNull();
      const content = hover?.contents as any;
      expect(content.value).toContain('🔷 Patient');
      // Should not contain enhanced features
      expect(content.value).not.toContain('📊 **Type Hierarchy**');
    });

    test('should handle navigation failures gracefully', async () => {
      mockModelProviderService.navigatePropertyPath = mock(async () => ({
        isValid: false,
        finalType: null,
        availableProperties: []
      }));

      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'UnknownResource.property');
      const params: HoverParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 20 }
      };

      const hover = await hoverProvider.provideHover(document, params);

      // Should fallback to function/basic hover or return null
      expect(hover).toBeDefined();
    });
  });

  describe('Performance Tests', () => {
    test('should provide hover within 50ms for simple types', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient');
      const params: HoverParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 5 }
      };

      const start = performance.now();
      await hoverProvider.provideHover(document, params);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(50);
    });

    test('should provide hover within 100ms for complex types', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.name.given');
      const params: HoverParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 15 }
      };

      const start = performance.now();
      await hoverProvider.provideHover(document, params);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(100);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty documents', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, '');
      const params: HoverParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 0 }
      };

      const hover = await hoverProvider.provideHover(document, params);
      expect(hover).toBeNull();
    });

    test('should handle invalid positions', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient');
      const params: HoverParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 100 }
      };

      const hover = await hoverProvider.provideHover(document, params);
      expect(hover).toBeNull();
    });

    test('should handle whitespace in expressions', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, '  Patient  ');
      const params: HoverParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 5 }
      };

      const hover = await hoverProvider.provideHover(document, params);
      expect(hover).not.toBeNull();
    });
  });
});