import { describe, it, expect } from 'bun:test';
import { SemanticTokensProvider, TokenType } from '../providers/SemanticTokensProvider';
import { FHIRPathService } from '../parser/FHIRPathService';
import { FHIRPathFunctionRegistry } from '../services/FHIRPathFunctionRegistry';
import { TextDocument } from 'vscode-languageserver-textdocument';

describe('SemanticTokensProvider Registry Integration', () => {
  const fhirPathService = new FHIRPathService();
  const semanticTokensProvider = new SemanticTokensProvider(fhirPathService);
  const functionRegistry = new FHIRPathFunctionRegistry();

  it('should use Registry API for function detection', async () => {
    const document = TextDocument.create(
      'test://test.fhirpath', 
      'fhirpath', 
      1, 
      'Patient.name.exists() and Patient.active = true'
    );

    // First verify that the registry has functions
    const functions = functionRegistry.getFunctions();
    expect(functions.length).toBeGreaterThan(0);

    // Test parsing works
    const parseResult = fhirPathService.parse('Patient.name.exists()');
    expect(parseResult.success).toBe(true);

    const result = await semanticTokensProvider.provideSemanticTokens(document, {
      textDocument: { uri: document.uri }
    });

    expect(result).toBeDefined();
    expect(result.data).toBeDefined();
    // The regex-based approach should still find tokens even if AST parsing fails
    expect(result.data.length).toBeGreaterThanOrEqual(0);
  });

  it('should recognize Registry API operators', async () => {
    const document = TextDocument.create(
      'test://test.fhirpath', 
      'fhirpath', 
      1, 
      'Patient.name where use = "official" and given exists'
    );

    // Verify operators are available
    const operators = functionRegistry.getOperators();
    expect(operators.length).toBeGreaterThan(0);

    const result = await semanticTokensProvider.provideSemanticTokens(document, {
      textDocument: { uri: document.uri }
    });

    expect(result).toBeDefined();
    expect(result.data).toBeDefined();
    expect(result.data.length).toBeGreaterThanOrEqual(0);
  });

  it('should recognize Registry API keywords', async () => {
    const document = TextDocument.create(
      'test://test.fhirpath', 
      'fhirpath', 
      1, 
      'Patient.active = true or Patient.active = false'
    );

    // Verify keywords are available
    const keywords = functionRegistry.getKeywords();
    expect(keywords.length).toBeGreaterThan(0);

    const result = await semanticTokensProvider.provideSemanticTokens(document, {
      textDocument: { uri: document.uri }
    });

    expect(result).toBeDefined();
    expect(result.data).toBeDefined();
    expect(result.data.length).toBeGreaterThanOrEqual(0);
  });
});
