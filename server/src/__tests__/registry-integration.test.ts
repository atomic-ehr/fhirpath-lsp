import { describe, it, expect } from 'bun:test';
import { FHIRPathFunctionRegistry } from '../services/FHIRPathFunctionRegistry';
import { CompletionProvider } from '../providers/CompletionProvider';
import { HoverProvider } from '../providers/HoverProvider';
import { DiagnosticProvider } from '../providers/DiagnosticProvider';
import { FHIRPathService } from '../parser/FHIRPathService';
import { FHIRPathContextService } from '../services/FHIRPathContextService';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position, CompletionItemKind } from 'vscode-languageserver/node';

describe('Registry API Integration Tests', () => {
  const fhirPathService = new FHIRPathService();
  const contextService = new FHIRPathContextService();
  
  describe('FHIRPathFunctionRegistry', () => {
    it('should provide functions from Registry API', () => {
      const registry = new FHIRPathFunctionRegistry();
      const functions = registry.getFunctions();
      
      // Verify we get functions from the Registry API
      expect(functions.length).toBeGreaterThan(20); // Should have many functions
      
      // Check specific functions exist
      const whereFunc = functions.find(f => f.name === 'where');
      expect(whereFunc).toBeDefined();
      expect(whereFunc?.category).toBe('filtering');
      
      const existsFunc = functions.find(f => f.name === 'exists');
      expect(existsFunc).toBeDefined();
      expect(existsFunc?.category).toBe('existence');
    });
    
    it('should provide operators from Registry API', () => {
      const registry = new FHIRPathFunctionRegistry();
      const operators = registry.getOperators();
      
      // Verify we get operators
      expect(operators.length).toBeGreaterThan(10);
      
      // Check specific operators exist
      const equalsOp = operators.find(o => o.symbol === '=');
      expect(equalsOp).toBeDefined();
      expect(equalsOp?.name).toBe('Equals');
      
      const andOp = operators.find(o => o.symbol === 'and');
      expect(andOp).toBeDefined();
      expect(andOp?.name).toBe('Logical AND');
    });
  });
  
  describe('CompletionProvider Integration', () => {
    it('should provide completions for Registry API functions', async () => {
      const completionProvider = new CompletionProvider(fhirPathService);
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.');
      
      const completions = await completionProvider.provideCompletions(document, {
        textDocument: { uri: document.uri },
        position: Position.create(0, 8) // After the dot
      });
      
      // Should have function completions
      const functionCompletions = completions.filter(c => c.kind === CompletionItemKind.Function);
      expect(functionCompletions.length).toBeGreaterThan(20);
      
      // Check for specific functions
      const whereCompletion = completions.find(c => c.label === 'where');
      expect(whereCompletion).toBeDefined();
      expect(whereCompletion?.detail).toContain('where');
    });
  });
  
  describe('HoverProvider Integration', () => {
    it('should provide hover info for Registry API functions', async () => {
      const hoverProvider = new HoverProvider(fhirPathService);
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.name.exists()');
      
      const hover = await hoverProvider.provideHover(document, {
        textDocument: { uri: document.uri },
        position: Position.create(0, 15) // On 'exists'
      });
      
      expect(hover).toBeDefined();
      expect(hover?.contents).toBeDefined();
      
      if (typeof hover?.contents === 'object' && 'value' in hover.contents) {
        expect(hover.contents.value).toContain('exists');
        expect(hover.contents.value).toContain('Returns true if the collection is not empty');
      }
    });
  });
  
  describe('DiagnosticProvider Integration', () => {
    it('should suggest Registry API functions for typos', async () => {
      const diagnosticProvider = new DiagnosticProvider(
        fhirPathService,
        contextService
      );
      
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.name.exsts()');
      
      const diagnostics = await diagnosticProvider.provideDiagnostics(document);
      
      // Should have at least one diagnostic for the unknown function
      expect(diagnostics.length).toBeGreaterThan(0);
      
      // The diagnostic should suggest 'exists' as a correction
      const unknownFunctionDiag = diagnostics.find(d => 
        d.message.toLowerCase().includes('unknown') || 
        d.message.toLowerCase().includes('function')
      );
      
      if (unknownFunctionDiag?.relatedInformation) {
        const suggestions = unknownFunctionDiag.relatedInformation
          .map(r => r.message)
          .join(' ');
        expect(suggestions).toContain('exists');
      }
    });
  });
});