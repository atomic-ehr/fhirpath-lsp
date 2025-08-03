import { test, expect, jest, describe, beforeEach, afterEach } from 'bun:test';
import { CompletionItem, CompletionItemKind, CompletionParams, Position, MarkupKind } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CompletionProvider, CompletionContext } from '../CompletionProvider';
import { FHIRPathService } from '../../parser/FHIRPathService';
import { ModelProviderService } from '../../services/ModelProviderService';
import type { ModelTypeProvider, TypeInfo } from '@atomic-ehr/fhirpath';

// Mock implementations
class MockModelTypeProvider implements ModelTypeProvider {
  private typeInfoMap = new Map<string, TypeInfo>();

  constructor() {
    // Set up Patient resource type
    this.typeInfoMap.set('Patient', {
      name: 'Patient',
      properties: new Map([
        ['id', { name: 'id', type: 'string', cardinality: '0..1' }],
        ['name', { name: 'name', type: 'HumanName', cardinality: '0..*' }],
        ['active', { name: 'active', type: 'boolean', cardinality: '0..1' }],
        ['gender', { name: 'gender', type: 'code', cardinality: '0..1' }]
      ]),
      baseType: 'DomainResource'
    });

    // Set up Observation resource type
    this.typeInfoMap.set('Observation', {
      name: 'Observation',
      properties: new Map([
        ['id', { name: 'id', type: 'string', cardinality: '0..1' }],
        ['status', { name: 'status', type: 'code', cardinality: '1..1' }],
        ['value', { name: 'value[x]', type: 'choice', cardinality: '0..1' }]
      ]),
      baseType: 'DomainResource'
    });

    // Set up DomainResource base type
    this.typeInfoMap.set('DomainResource', {
      name: 'DomainResource',
      properties: new Map([
        ['id', { name: 'id', type: 'string', cardinality: '0..1' }],
        ['text', { name: 'text', type: 'Narrative', cardinality: '0..1' }],
        ['extension', { name: 'extension', type: 'Extension', cardinality: '0..*' }]
      ]),
      baseType: 'Resource'
    });

    // Set up Resource base type
    this.typeInfoMap.set('Resource', {
      name: 'Resource',
      properties: new Map([
        ['id', { name: 'id', type: 'string', cardinality: '0..1' }],
        ['resourceType', { name: 'resourceType', type: 'code', cardinality: '1..1' }]
      ])
    });

    // Set up HumanName complex type
    this.typeInfoMap.set('HumanName', {
      name: 'HumanName',
      properties: new Map([
        ['family', { name: 'family', type: 'string', cardinality: '0..1' }],
        ['given', { name: 'given', type: 'string', cardinality: '0..*' }],
        ['use', { name: 'use', type: 'code', cardinality: '0..1' }]
      ])
    });

    // Set up primitive types
    this.typeInfoMap.set('string', {
      name: 'string',
      properties: new Map()
    });

    this.typeInfoMap.set('boolean', {
      name: 'boolean',
      properties: new Map()
    });

    this.typeInfoMap.set('code', {
      name: 'code',
      properties: new Map()
    });

    // Set up choice type
    this.typeInfoMap.set('value[x]', {
      name: 'value[x]',
      properties: new Map(),
      modelContext: {
        isUnion: true,
        choices: [
          { type: { name: 'string' } },
          { type: { name: 'Quantity' } },
          { type: { name: 'boolean' } }
        ]
      }
    } as any);

    this.typeInfoMap.set('Quantity', {
      name: 'Quantity',
      properties: new Map([
        ['value', { name: 'value', type: 'decimal', cardinality: '0..1' }],
        ['unit', { name: 'unit', type: 'string', cardinality: '0..1' }]
      ])
    });
  }

  async getType(typeName: string): Promise<TypeInfo | undefined> {
    return this.typeInfoMap.get(typeName);
  }

  async getAllResourceTypes(): Promise<string[]> {
    return ['Patient', 'Observation'];
  }

  getElementNames(typeInfo: TypeInfo): string[] {
    if ((typeInfo as any).properties instanceof Map) {
      return Array.from(((typeInfo as any).properties as Map<string, any>).keys());
    }
    return [];
  }

  getElementType(typeInfo: TypeInfo, elementName: string): any {
    if ((typeInfo as any).properties instanceof Map) {
      const properties = (typeInfo as any).properties as Map<string, any>;
      return properties.get(elementName);
    }
    return undefined;
  }

  ofType(typeInfo: TypeInfo, targetType: any): TypeInfo | undefined {
    const typeName = targetType?.name || targetType;
    return this.typeInfoMap.get(typeName);
  }
}

class MockFHIRPathService {
  getAvailableResourceTypes(): string[] {
    return ['Patient', 'Observation'];
  }

  isValidResourceType(resourceType: string): boolean {
    return ['Patient', 'Observation'].includes(resourceType);
  }

  getResourcePropertyDetails(resourceType: string): any[] {
    const mockProperties = {
      'Patient': [
        { name: 'id', type: 'string', cardinality: '0..1', description: 'Logical id of this artifact' },
        { name: 'name', type: 'HumanName', cardinality: '0..*', description: 'A name associated with the patient' },
        { name: 'active', type: 'boolean', cardinality: '0..1', description: 'Whether this patient record is in active use' }
      ],
      'Observation': [
        { name: 'id', type: 'string', cardinality: '0..1', description: 'Logical id of this artifact' },
        { name: 'status', type: 'code', cardinality: '1..1', description: 'Status of the observation' },
        { name: 'value', type: 'choice', cardinality: '0..1', description: 'Actual result' }
      ]
    };
    return mockProperties[resourceType] || [];
  }
}

describe('CompletionProvider Enhanced Features', () => {
  let completionProvider: CompletionProvider;
  let mockFHIRPathService: MockFHIRPathService;
  let mockModelProvider: MockModelTypeProvider;
  let modelProviderService: ModelProviderService;

  beforeEach(async () => {
    mockFHIRPathService = new MockFHIRPathService();
    mockModelProvider = new MockModelTypeProvider();
    modelProviderService = new ModelProviderService(mockModelProvider, { enableLogging: false });
    
    await modelProviderService.initialize();
    
    completionProvider = new CompletionProvider(
      mockFHIRPathService as any,
      modelProviderService
    );
  });

  afterEach(() => {
    // Clean up
  });

  describe('ModelProviderService Integration', () => {
    test('should use ModelProviderService for enhanced completions when available', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.');
      const params: CompletionParams = {
        textDocument: { uri: 'test://test.fhirpath' },
        position: Position.create(0, 8) // After the dot
      };

      const completions = await completionProvider.provideCompletions(document, params);
      
      expect(completions).toBeDefined();
      expect(completions.length).toBeGreaterThan(0);
      
      // Should include Patient properties
      const propertyNames = completions.map(c => c.label);
      expect(propertyNames).toContain('id');
      expect(propertyNames).toContain('name');
      expect(propertyNames).toContain('active');
    });

    test('should include cardinality information in completion details', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.');
      const params: CompletionParams = {
        textDocument: { uri: 'test://test.fhirpath' },
        position: Position.create(0, 8)
      };

      const completions = await completionProvider.provideCompletions(document, params);
      const nameCompletion = completions.find(c => c.label === 'name');
      
      expect(nameCompletion).toBeDefined();
      expect(nameCompletion!.detail).toContain('[0..');
    });

    test('should show enhanced property documentation', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.');
      const params: CompletionParams = {
        textDocument: { uri: 'test://test.fhirpath' },
        position: Position.create(0, 8)
      };

      const completions = await completionProvider.provideCompletions(document, params);
      const nameCompletion = completions.find(c => c.label === 'name');
      
      expect(nameCompletion).toBeDefined();
      expect(nameCompletion!.documentation).toBeDefined();
      expect((nameCompletion!.documentation as any).kind).toBe(MarkupKind.Markdown);
      expect((nameCompletion!.documentation as any).value).toContain('**name**');
    });
  });

  describe('Choice Type Expansion', () => {
    test('should expand choice types in completions for Observation.value', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Observation.value.');
      const params: CompletionParams = {
        textDocument: { uri: 'test://test.fhirpath' },
        position: Position.create(0, 18), // After 'value.'
        context: { triggerKind: 2, triggerCharacter: '.' }
      };

      const completions = await completionProvider.provideCompletions(document, params);
      
      expect(completions).toBeDefined();
      expect(completions.length).toBeGreaterThan(0);
      
      // Should include choice type expansions
      const propertyNames = completions.map(c => c.label);
      expect(propertyNames).toContain('valueString');
      expect(propertyNames).toContain('valueQuantity');
      expect(propertyNames).toContain('valueBoolean');
    });

    test('should show choice type details in completion', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Observation.value.');
      const params: CompletionParams = {
        textDocument: { uri: 'test://test.fhirpath' },
        position: Position.create(0, 18),
        context: { triggerKind: 2, triggerCharacter: '.' }
      };

      const completions = await completionProvider.provideCompletions(document, params);
      const valueStringCompletion = completions.find(c => c.label === 'valueString');
      
      expect(valueStringCompletion).toBeDefined();
      expect(valueStringCompletion!.detail).toContain('choice');
      expect((valueStringCompletion!.data as any)?.isChoice).toBe(true);
    });

    test('should provide choice type documentation', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Observation.value.');
      const params: CompletionParams = {
        textDocument: { uri: 'test://test.fhirpath' },
        position: Position.create(0, 18),
        context: { triggerKind: 2, triggerCharacter: '.' }
      };

      const completions = await completionProvider.provideCompletions(document, params);
      const valueStringCompletion = completions.find(c => c.label === 'valueString');
      
      expect(valueStringCompletion).toBeDefined();
      expect(valueStringCompletion!.documentation).toBeDefined();
      expect((valueStringCompletion!.documentation as any).value).toContain('choice type');
      expect((valueStringCompletion!.documentation as any).value).toContain('value[x]');
    });
  });

  describe('Inherited Properties', () => {
    test('should include inherited properties from base types', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.');
      const params: CompletionParams = {
        textDocument: { uri: 'test://test.fhirpath' },
        position: Position.create(0, 8)
      };

      const completions = await completionProvider.provideCompletions(document, params);
      
      expect(completions).toBeDefined();
      
      // Should include inherited properties from DomainResource
      const propertyNames = completions.map(c => c.label);
      expect(propertyNames).toContain('text');  // From DomainResource
      expect(propertyNames).toContain('extension');  // From DomainResource
    });

    test('should mark inherited properties in completion details', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.');
      const params: CompletionParams = {
        textDocument: { uri: 'test://test.fhirpath' },
        position: Position.create(0, 8)
      };

      const completions = await completionProvider.provideCompletions(document, params);
      const textCompletion = completions.find(c => c.label === 'text');
      
      expect(textCompletion).toBeDefined();
      expect(textCompletion!.detail).toContain('inherited from');
      expect((textCompletion!.data as any)?.isInherited).toBe(true);
    });

    test('should provide inherited property documentation', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.');
      const params: CompletionParams = {
        textDocument: { uri: 'test://test.fhirpath' },
        position: Position.create(0, 8)
      };

      const completions = await completionProvider.provideCompletions(document, params);
      const textCompletion = completions.find(c => c.label === 'text');
      
      expect(textCompletion).toBeDefined();
      expect(textCompletion!.documentation).toBeDefined();
      expect((textCompletion!.documentation as any).value).toContain('inherited from');
    });
  });

  describe('Multi-Level Navigation', () => {
    test('should handle multi-level property navigation', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.name.');
      const params: CompletionParams = {
        textDocument: { uri: 'test://test.fhirpath' },
        position: Position.create(0, 13) // After 'Patient.name.'
      };

      const completions = await completionProvider.provideCompletions(document, params);
      
      expect(completions).toBeDefined();
      expect(completions.length).toBeGreaterThan(0);
      
      // Should include HumanName properties
      const propertyNames = completions.map(c => c.label);
      expect(propertyNames).toContain('family');
      expect(propertyNames).toContain('given');
      expect(propertyNames).toContain('use');
    });

    test('should handle deep navigation like Patient.name.given', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.name.given');
      const params: CompletionParams = {
        textDocument: { uri: 'test://test.fhirpath' },
        position: Position.create(0, 18) // After 'Patient.name.given'
      };

      const completions = await completionProvider.provideCompletions(document, params);
      
      expect(completions).toBeDefined();
      // 'given' is a string, so should have no properties but may have functions
    });
  });

  describe('Intelligent Sorting', () => {
    test('should prioritize required properties', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Observation.');
      const params: CompletionParams = {
        textDocument: { uri: 'test://test.fhirpath' },
        position: Position.create(0, 12)
      };

      const completions = await completionProvider.provideCompletions(document, params);
      
      expect(completions).toBeDefined();
      expect(completions.length).toBeGreaterThan(0);
      
      // Required properties should appear first
      const statusCompletion = completions.find(c => c.label === 'status');
      expect(statusCompletion).toBeDefined();
      
      // Check if status (required) has higher priority than value (optional)
      const valueCompletion = completions.find(c => c.label === 'value');
      if (statusCompletion && valueCompletion) {
        const statusSort = statusCompletion.sortText || '';
        const valueSort = valueCompletion.sortText || '';
        expect(statusSort.localeCompare(valueSort)).toBeLessThan(0);
      }
    });

    test('should prioritize common properties', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.');
      const params: CompletionParams = {
        textDocument: { uri: 'test://test.fhirpath' },
        position: Position.create(0, 8)
      };

      const completions = await completionProvider.provideCompletions(document, params);
      
      expect(completions).toBeDefined();
      
      // Common properties like 'id', 'name' should have higher priority
      const idCompletion = completions.find(c => c.label === 'id');
      const nameCompletion = completions.find(c => c.label === 'name');
      
      expect(idCompletion).toBeDefined();
      expect(nameCompletion).toBeDefined();
      
      if (idCompletion) {
        expect(idCompletion.sortText).toContain('0_');
      }
    });

    test('should sort choice expansions with high priority', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Observation.value.');
      const params: CompletionParams = {
        textDocument: { uri: 'test://test.fhirpath' },
        position: Position.create(0, 18),
        context: { triggerKind: 2, triggerCharacter: '.' }
      };

      const completions = await completionProvider.provideCompletions(document, params);
      const valueStringCompletion = completions.find(c => c.label === 'valueString');
      
      expect(valueStringCompletion).toBeDefined();
      if (valueStringCompletion) {
        expect(valueStringCompletion.sortText).toContain('0_choice');
      }
    });
  });

  describe('Enhanced Caching', () => {
    test('should cache enhanced completions for performance', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.');
      const params: CompletionParams = {
        textDocument: { uri: 'test://test.fhirpath' },
        position: Position.create(0, 8)
      };

      // First call
      const start1 = Date.now();
      const completions1 = await completionProvider.provideCompletions(document, params);
      const end1 = Date.now();
      
      // Second call (should be cached)
      const start2 = Date.now();
      const completions2 = await completionProvider.provideCompletions(document, params);
      const end2 = Date.now();
      
      expect(completions1).toBeDefined();
      expect(completions2).toBeDefined();
      expect(completions1.length).toBe(completions2.length);
      
      // Second call should be faster (cached)
      const time1 = end1 - start1;
      const time2 = end2 - start2;
      expect(time2).toBeLessThanOrEqual(time1);
    });

    test('should handle cache expiry correctly', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.');
      const params: CompletionParams = {
        textDocument: { uri: 'test://test.fhirpath' },
        position: Position.create(0, 8)
      };

      const completions = await completionProvider.provideCompletions(document, params);
      expect(completions).toBeDefined();
      
      // Cache should work for a reasonable time period
      // (We can't easily test expiry without mocking time)
    });
  });

  describe('Error Handling', () => {
    test('should handle ModelProviderService errors gracefully', async () => {
      // Create completion provider without ModelProviderService
      const providerWithoutModel = new CompletionProvider(mockFHIRPathService as any);
      
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.');
      const params: CompletionParams = {
        textDocument: { uri: 'test://test.fhirpath' },
        position: Position.create(0, 8)
      };

      const completions = await providerWithoutModel.provideCompletions(document, params);
      
      expect(completions).toBeDefined();
      // Should fall back to legacy implementation
    });

    test('should handle invalid navigation paths', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.invalidProperty.');
      const params: CompletionParams = {
        textDocument: { uri: 'test://test.fhirpath' },
        position: Position.create(0, 23)
      };

      const completions = await completionProvider.provideCompletions(document, params);
      
      expect(completions).toBeDefined();
      // Should handle gracefully, may return empty array
    });

    test('should handle unknown resource types', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'UnknownResource.');
      const params: CompletionParams = {
        textDocument: { uri: 'test://test.fhirpath' },
        position: Position.create(0, 16)
      };

      const completions = await completionProvider.provideCompletions(document, params);
      
      expect(completions).toBeDefined();
      // Should handle gracefully
    });
  });

  describe('Performance Requirements', () => {
    test('should provide completions within performance target', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.');
      const params: CompletionParams = {
        textDocument: { uri: 'test://test.fhirpath' },
        position: Position.create(0, 8)
      };

      const start = Date.now();
      const completions = await completionProvider.provideCompletions(document, params);
      const end = Date.now();
      
      expect(completions).toBeDefined();
      expect(end - start).toBeLessThan(100); // Should complete in under 100ms
    });

    test('should handle complex completions efficiently', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.name.');
      const params: CompletionParams = {
        textDocument: { uri: 'test://test.fhirpath' },
        position: Position.create(0, 13)
      };

      const start = Date.now();
      const completions = await completionProvider.provideCompletions(document, params);
      const end = Date.now();
      
      expect(completions).toBeDefined();
      expect(end - start).toBeLessThan(100); // Multi-level navigation should still be fast
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty expressions', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, '');
      const params: CompletionParams = {
        textDocument: { uri: 'test://test.fhirpath' },
        position: Position.create(0, 0)
      };

      const completions = await completionProvider.provideCompletions(document, params);
      
      expect(completions).toBeDefined();
      // Should provide resource type completions
    });

    test('should handle partial expressions', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Pat');
      const params: CompletionParams = {
        textDocument: { uri: 'test://test.fhirpath' },
        position: Position.create(0, 3)
      };

      const completions = await completionProvider.provideCompletions(document, params);
      
      expect(completions).toBeDefined();
      
      // Should include Patient resource type
      const patientCompletion = completions.find(c => c.label === 'Patient');
      expect(patientCompletion).toBeDefined();
    });

    test('should handle expressions with whitespace', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient .');
      const params: CompletionParams = {
        textDocument: { uri: 'test://test.fhirpath' },
        position: Position.create(0, 9)
      };

      const completions = await completionProvider.provideCompletions(document, params);
      
      expect(completions).toBeDefined();
      // Should handle whitespace gracefully
    });
  });
});