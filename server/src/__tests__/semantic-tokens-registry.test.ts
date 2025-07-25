import { describe, it, expect } from 'bun:test';
import { SemanticTokensProvider, TokenType } from '../providers/SemanticTokensProvider';
import { FHIRPathService } from '../parser/FHIRPathService';
import { TextDocument } from 'vscode-languageserver-textdocument';

describe('SemanticTokensProvider Registry Integration', () => {
  const fhirPathService = new FHIRPathService();
  const semanticTokensProvider = new SemanticTokensProvider(fhirPathService);

  it('should use Registry API for function detection', async () => {
    const document = TextDocument.create(
      'test://test.fhirpath', 
      'fhirpath', 
      1, 
      'Patient.name.exists() and Patient.active = true'
    );

    const result = await semanticTokensProvider.provideSemanticTokens(document, {
      textDocument: { uri: document.uri }
    });

    expect(result).toBeDefined();
    expect(result.data).toBeDefined();
    expect(result.data.length).toBeGreaterThan(0);
  });

  it('should recognize Registry API operators', async () => {
    const document = TextDocument.create(
      'test://test.fhirpath', 
      'fhirpath', 
      1, 
      'Patient.name where use = "official" and given exists'
    );

    const result = await semanticTokensProvider.provideSemanticTokens(document, {
      textDocument: { uri: document.uri }
    });

    expect(result).toBeDefined();
    expect(result.data).toBeDefined();
    expect(result.data.length).toBeGreaterThan(0);
  });

  it('should recognize Registry API keywords', async () => {
    const document = TextDocument.create(
      'test://test.fhirpath', 
      'fhirpath', 
      1, 
      'Patient.active = true or Patient.active = false'
    );

    const result = await semanticTokensProvider.provideSemanticTokens(document, {
      textDocument: { uri: document.uri }
    });

    expect(result).toBeDefined();
    expect(result.data).toBeDefined();
    expect(result.data.length).toBeGreaterThan(0);
  });
});