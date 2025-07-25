import { describe, expect, test, beforeEach } from 'bun:test';
import { Position, Range } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { SymbolService } from '../../services/SymbolService';
import { DocumentSymbolProvider } from '../../providers/DocumentSymbolProvider';
import { DefinitionProvider } from '../../providers/DefinitionProvider';
import { ReferencesProvider } from '../../providers/ReferencesProvider';
import { FHIRPathService } from '../../parser/FHIRPathService';
import { FHIRPathFunctionRegistry } from '../../services/FHIRPathFunctionRegistry';

// Mock connection
const mockConnection = {
  console: {
    log: () => {},
    warn: () => {},
    error: () => {}
  }
} as any;

describe('Symbol Navigation', () => {
  let fhirPathService: FHIRPathService;
  let functionRegistry: FHIRPathFunctionRegistry;
  let symbolService: SymbolService;
  let documentSymbolProvider: DocumentSymbolProvider;
  let definitionProvider: DefinitionProvider;
  let referencesProvider: ReferencesProvider;

  beforeEach(() => {
    fhirPathService = new FHIRPathService();
    functionRegistry = new FHIRPathFunctionRegistry();
    symbolService = new SymbolService(fhirPathService, functionRegistry);
    documentSymbolProvider = new DocumentSymbolProvider(mockConnection, symbolService);
    definitionProvider = new DefinitionProvider(mockConnection, symbolService, functionRegistry);
    referencesProvider = new ReferencesProvider(mockConnection, symbolService);
  });

  function createDocument(content: string): TextDocument {
    return TextDocument.create(
      'test://test.fhirpath',
      'fhirpath',
      1,
      content
    );
  }

  describe('SymbolService', () => {
    test('should extract symbols from simple expression', () => {
      const document = createDocument('Patient.name.family');
      const result = symbolService.extractDocumentSymbols(document);

      expect(result.symbols.length).toBeGreaterThan(0);
      
      // Check for Patient symbol
      const patientSymbol = result.symbols.find(s => s.name === 'Patient');
      expect(patientSymbol).toBeDefined();
      expect(patientSymbol?.kind).toBe('resource');

      // Check for property symbols
      const nameSymbol = result.symbols.find(s => s.name === 'name');
      expect(nameSymbol).toBeDefined();
      expect(nameSymbol?.kind).toBe('property');

      const familySymbol = result.symbols.find(s => s.name === 'family');
      expect(familySymbol).toBeDefined();
      expect(familySymbol?.kind).toBe('property');
    });

    test('should extract function symbols', () => {
      const document = createDocument('Patient.name.where(use = "official")');
      const result = symbolService.extractDocumentSymbols(document);

      const whereSymbol = result.symbols.find(s => s.name === 'where');
      expect(whereSymbol).toBeDefined();
      expect(whereSymbol?.kind).toBe('function');
      expect(whereSymbol?.isBuiltIn).toBe(true);
    });

    test('should extract string literals', () => {
      const document = createDocument('Patient.name.where(use = "official")');
      const result = symbolService.extractDocumentSymbols(document);

      const literalSymbol = result.symbols.find(s => s.name === '"official"');
      expect(literalSymbol).toBeDefined();
      expect(literalSymbol?.kind).toBe('literal');
    });

    test('should find symbol at position', () => {
      const document = createDocument('Patient.name.family');
      const position = Position.create(0, 8); // Position at 'name'
      
      const symbol = symbolService.findSymbolAtPosition(document, position);
      expect(symbol).toBeDefined();
      expect(symbol?.name).toBe('name');
    });

    test('should find references to symbol', () => {
      const document = createDocument('Patient.name.family\nPatient.name.given');
      const position = Position.create(0, 8); // Position at first 'name'
      
      const references = symbolService.findReferences(document, position);
      expect(references.length).toBe(2); // Both occurrences of 'name'
    });
  });

  describe('DocumentSymbolProvider', () => {
    test('should provide document symbols', () => {
      const document = createDocument('Patient.name.where(use = "official").family');
      const symbols = documentSymbolProvider.provideDocumentSymbols(document);

      expect(symbols.length).toBeGreaterThan(0);
      
      // Check symbol structure
      const patientSymbol = symbols.find(s => s.name === 'Patient');
      expect(patientSymbol).toBeDefined();
      expect(patientSymbol?.kind).toBe(5); // SymbolKind.Class for resources
    });

    test('should get symbols by kind', () => {
      const document = createDocument('Patient.name.where(use = "official")');
      const functionSymbols = documentSymbolProvider.getSymbolsByKind(document, ['function']);

      expect(functionSymbols.length).toBeGreaterThan(0);
      expect(functionSymbols.every(s => s.kind === 12)).toBe(true); // SymbolKind.Function
    });

    test('should get symbol at position', () => {
      const document = createDocument('Patient.name.family');
      const position = { line: 0, character: 8 }; // Position at 'name'
      
      const symbol = documentSymbolProvider.getSymbolAtPosition(document, position);
      expect(symbol).toBeDefined();
      expect(symbol?.name).toBe('name');
    });
  });

  describe('DefinitionProvider', () => {
    test('should provide definition for function', async () => {
      const document = createDocument('Patient.name.where(use = "official")');
      const position = Position.create(0, 13); // Position at 'where'
      
      const definitions = await definitionProvider.provideDefinition(document, position);
      expect(definitions).toBeDefined();
      
      if (Array.isArray(definitions)) {
        expect(definitions.length).toBeGreaterThan(0);
        // Should link to FHIRPath specification
        expect(definitions[0].targetUri).toContain('fhirpath');
      }
    });

    test('should provide definition for FHIR resource', async () => {
      const document = createDocument('Patient.name.family');
      const position = Position.create(0, 3); // Position at 'Patient'
      
      const definitions = await definitionProvider.provideDefinition(document, position);
      expect(definitions).toBeDefined();
      
      if (Array.isArray(definitions)) {
        expect(definitions.length).toBeGreaterThan(0);
        // Should link to FHIR specification
        expect(definitions[0].targetUri).toContain('patient.html');
      }
    });

    test('should provide definition for FHIR property', async () => {
      const document = createDocument('Patient.name.family');
      const position = Position.create(0, 8); // Position at 'name'
      
      const definitions = await definitionProvider.provideDefinition(document, position);
      expect(definitions).toBeDefined();
      
      if (Array.isArray(definitions)) {
        expect(definitions.length).toBeGreaterThan(0);
        // Should link to FHIR specification for Patient.name
        expect(definitions[0].targetUri).toContain('patient.html');
      }
    });

    test('should return null for unknown symbols', async () => {
      const document = createDocument('Unknown.property');
      const position = Position.create(0, 3); // Position at 'Unknown'
      
      const definitions = await definitionProvider.provideDefinition(document, position);
      // May return null or empty array for unknown symbols
      expect(definitions === null || (Array.isArray(definitions) && definitions.length === 0)).toBe(true);
    });
  });

  describe('ReferencesProvider', () => {
    test('should provide references for symbol', async () => {
      const document = createDocument('Patient.name.family\nPatient.name.given');
      const position = Position.create(0, 8); // Position at first 'name'
      
      const references = await referencesProvider.provideReferences(
        document, 
        position, 
        { includeDeclaration: true }
      );
      
      expect(references).toBeDefined();
      if (references) {
        expect(references.length).toBe(2); // Both occurrences of 'name'
        expect(references.every(ref => ref.uri === document.uri)).toBe(true);
      }
    });

    test('should exclude declaration when requested', async () => {
      const document = createDocument('Patient.name.family\nPatient.name.given');
      const position = Position.create(0, 8); // Position at first 'name'
      
      const references = await referencesProvider.provideReferences(
        document, 
        position, 
        { includeDeclaration: false }
      );
      
      expect(references).toBeDefined();
      if (references) {
        expect(references.length).toBe(1); // Only the second occurrence
      }
    });

    test('should return null for unknown symbols', async () => {
      const document = createDocument('Patient.name.family');
      const position = Position.create(0, 20); // Position outside any symbol
      
      const references = await referencesProvider.provideReferences(
        document, 
        position, 
        { includeDeclaration: true }
      );
      
      expect(references).toBeNull();
    });

    test('should find references by name', () => {
      const document = createDocument('Patient.name.family\nPatient.name.given');
      const references = referencesProvider.findReferencesByName(document, 'name');
      
      expect(references.length).toBe(2);
      expect(references.every(ref => ref.uri === document.uri)).toBe(true);
    });

    test('should get reference statistics', () => {
      const document = createDocument('Patient.name.where(use = "official").family');
      const stats = referencesProvider.getReferenceStats(document, 'name');
      
      expect(stats.totalReferences).toBeGreaterThan(0);
      expect(stats.propertyAccess).toBeGreaterThan(0);
    });
  });

  describe('Integration', () => {
    test('should work with complex expressions', () => {
      const document = createDocument(`
        Patient.name.where(use = 'official').family
        Patient.name.where(use = 'usual').given
        Patient.telecom.where(system = 'email').value
      `.trim());
      
      const symbols = documentSymbolProvider.provideDocumentSymbols(document);
      expect(symbols.length).toBeGreaterThan(0);
      
      // Should find multiple Patient references
      const patientSymbols = symbols.filter(s => s.name === 'Patient');
      expect(patientSymbols.length).toBeGreaterThan(1);
    });

    test('should handle malformed expressions gracefully', () => {
      const document = createDocument('Patient.name.where(');
      const result = symbolService.extractDocumentSymbols(document);
      
      // Should still extract some symbols even with malformed expression
      expect(result.symbols.length).toBeGreaterThan(0);
      expect(result.errors.length).toBeGreaterThanOrEqual(0); // May have errors but shouldn't crash
    });
  });
});