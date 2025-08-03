import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { CompletionProvider } from '../CompletionProvider';
import { FHIRPathService } from '../../parser/FHIRPathService';
import { FHIRResourceService } from '../../services/FHIRResourceService';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CompletionParams, CompletionItemKind } from 'vscode-languageserver/node';

describe('CompletionProvider Multi-Level Navigation', () => {
  let completionProvider: CompletionProvider;
  let mockFHIRPathService: any;
  let mockFHIRResourceService: any;

  beforeEach(() => {
    // Mock FHIRPathService
    mockFHIRPathService = {
      getAvailableResourceTypes: () => ['Patient', 'Observation', 'Condition', 'Medication'],
      isValidResourceType: (type: string) => ['Patient', 'Observation', 'Condition', 'Medication'].includes(type),
      getResourcePropertyDetails: (resourceType: string) => {
        const properties: Record<string, any[]> = {
          Patient: [
            { name: 'id', type: 'string' },
            { name: 'name', type: 'HumanName', cardinality: '0..*' },
            { name: 'birthDate', type: 'date' },
            { name: 'address', type: 'Address', cardinality: '0..*' },
            { name: 'telecom', type: 'ContactPoint', cardinality: '0..*' },
            { name: 'identifier', type: 'Identifier', cardinality: '0..*' }
          ],
          Observation: [
            { name: 'id', type: 'string' },
            { name: 'status', type: 'code' },
            { name: 'code', type: 'CodeableConcept' },
            { name: 'value', type: 'choice' },
            { name: 'component', type: 'BackboneElement', cardinality: '0..*' }
          ]
        };
        return properties[resourceType] || [];
      }
    };

    // Mock FHIRResourceService
    mockFHIRResourceService = {
      getResourceFromContext: () => null
    };

    completionProvider = new CompletionProvider(
      mockFHIRPathService,
      undefined,
      mockFHIRResourceService
    );
  });

  describe('Basic Multi-Level Navigation', () => {
    test('should provide completions for Patient.name.', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.name.');
      const params: CompletionParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 13 }
      };

      const completions = await completionProvider.provideCompletions(document, params);

      expect(completions.length).toBeGreaterThan(0);
      
      // Should include HumanName properties
      const propertyLabels = completions.map(c => c.label);
      expect(propertyLabels).toContain('family');
      expect(propertyLabels).toContain('given');
      expect(propertyLabels).toContain('use');
      expect(propertyLabels).toContain('text');
    });

    test('should provide completions for deep navigation Patient.name.given', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.name.given');
      const params: CompletionParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 18 }
      };

      const completions = await completionProvider.provideCompletions(document, params);

      // Should provide function completions for terminal properties
      const functionLabels = completions.filter(c => c.kind === CompletionItemKind.Function);
      expect(functionLabels.length).toBeGreaterThan(0);
    });

    test('should provide completions for Observation.code.', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Observation.code.');
      const params: CompletionParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 17 }
      };

      const completions = await completionProvider.provideCompletions(document, params);

      // Should include Coding properties
      const propertyLabels = completions.map(c => c.label);
      expect(propertyLabels).toContain('system');
      expect(propertyLabels).toContain('code');
      expect(propertyLabels).toContain('display');
    });
  });

  describe('Partial Path Navigation', () => {
    test('should filter completions for partial path Patient.na', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.na');
      const params: CompletionParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 10 }
      };

      const completions = await completionProvider.provideCompletions(document, params);

      // Should only include properties starting with 'na'
      const propertyLabels = completions.filter(c => c.kind === CompletionItemKind.Property).map(c => c.label);
      expect(propertyLabels).toContain('name');
      expect(propertyLabels).not.toContain('birthDate');
    });

    test('should filter completions for partial nested path Patient.name.fa', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.name.fa');
      const params: CompletionParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 15 }
      };

      const completions = await completionProvider.provideCompletions(document, params);

      // Should filter to properties starting with 'fa'
      const propertyLabels = completions.filter(c => c.kind === CompletionItemKind.Property).map(c => c.label);
      expect(propertyLabels).toContain('family');
      expect(propertyLabels).not.toContain('given');
    });
  });

  describe('Complex Type Navigation', () => {
    test('should provide Address properties for Patient.address.', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.address.');
      const params: CompletionParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 16 }
      };

      const completions = await completionProvider.provideCompletions(document, params);

      const propertyLabels = completions.map(c => c.label);
      expect(propertyLabels).toContain('line');
      expect(propertyLabels).toContain('city');
      expect(propertyLabels).toContain('state');
      expect(propertyLabels).toContain('postalCode');
    });

    test('should provide ContactPoint properties for Patient.telecom.', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.telecom.');
      const params: CompletionParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 16 }
      };

      const completions = await completionProvider.provideCompletions(document, params);

      const propertyLabels = completions.map(c => c.label);
      expect(propertyLabels).toContain('system');
      expect(propertyLabels).toContain('value');
      expect(propertyLabels).toContain('use');
    });

    test('should provide Identifier properties for Patient.identifier.', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.identifier.');
      const params: CompletionParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 19 }
      };

      const completions = await completionProvider.provideCompletions(document, params);

      const propertyLabels = completions.map(c => c.label);
      expect(propertyLabels).toContain('system');
      expect(propertyLabels).toContain('value');
      expect(propertyLabels).toContain('type');
      expect(propertyLabels).toContain('period');
    });
  });

  describe('Navigation Context Analysis', () => {
    test('should correctly analyze navigation context for simple path', () => {
      const context = {
        text: 'Patient.name',
        position: { line: 0, character: 12 },
        isAfterDot: false,
        isInFunction: false,
        isInBrackets: false,
        isInComment: false,
        isInDirective: false
      };

      const navContext = (completionProvider as any).analyzeNavigationContext(context);

      expect(navContext.isNavigable).toBe(true);
      expect(navContext.resourceType).toBe('Patient');
      expect(navContext.propertyPath).toEqual(['name']);
      expect(navContext.depth).toBe(1);
      expect(navContext.isPartialPath).toBe(false);
    });

    test('should correctly analyze navigation context for deep path', () => {
      const context = {
        text: 'Patient.name.given',
        position: { line: 0, character: 18 },
        isAfterDot: false,
        isInFunction: false,
        isInBrackets: false,
        isInComment: false,
        isInDirective: false
      };

      const navContext = (completionProvider as any).analyzeNavigationContext(context);

      expect(navContext.isNavigable).toBe(true);
      expect(navContext.resourceType).toBe('Patient');
      expect(navContext.propertyPath).toEqual(['name', 'given']);
      expect(navContext.depth).toBe(2);
    });

    test('should detect partial path navigation', () => {
      const context = {
        text: 'Patient.name.',
        position: { line: 0, character: 13 },
        isAfterDot: true,
        isInFunction: false,
        isInBrackets: false,
        isInComment: false,
        isInDirective: false
      };

      const navContext = (completionProvider as any).analyzeNavigationContext(context);

      expect(navContext.isNavigable).toBe(true);
      expect(navContext.isPartialPath).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty expression after dot', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.');
      const params: CompletionParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 8 }
      };

      const completions = await completionProvider.provideCompletions(document, params);

      expect(completions.length).toBeGreaterThan(0);
      // Should show Patient properties
      const propertyLabels = completions.filter(c => c.kind === CompletionItemKind.Property).map(c => c.label);
      expect(propertyLabels.length).toBeGreaterThan(0);
    });

    test('should handle whitespace in expressions', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient . name .');
      const params: CompletionParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 16 }
      };

      const completions = await completionProvider.provideCompletions(document, params);

      // Should still provide name properties despite whitespace
      const propertyLabels = completions.map(c => c.label);
      expect(propertyLabels).toContain('family');
      expect(propertyLabels).toContain('given');
    });

    test('should handle unknown property gracefully', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.unknownProperty.');
      const params: CompletionParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 24 }
      };

      const completions = await completionProvider.provideCompletions(document, params);

      // Should fall back to function completions
      const functionCompletions = completions.filter(c => c.kind === CompletionItemKind.Function);
      expect(functionCompletions.length).toBeGreaterThan(0);
    });
  });

  describe('Performance Tests', () => {
    test('should provide navigation completions within 15ms for 3-level paths', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.name.given.');
      const params: CompletionParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 19 }
      };

      const start = performance.now();
      await completionProvider.provideCompletions(document, params);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(15);
    });

    test('should provide navigation completions within 50ms for deep paths', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Observation.component.code.coding.system');
      const params: CompletionParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 40 }
      };

      const start = performance.now();
      await completionProvider.provideCompletions(document, params);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(50);
    });
  });
});