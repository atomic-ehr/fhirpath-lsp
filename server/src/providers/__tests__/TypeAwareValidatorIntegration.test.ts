import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { DiagnosticProvider } from '../DiagnosticProvider';
import { FHIRPathService } from '../../parser/FHIRPathService';
import { FHIRPathContextService } from '../../services/FHIRPathContextService';
import { FHIRResourceService } from '../../services/FHIRResourceService';
import { ModelProviderService } from '../../services/ModelProviderService';
import { TextDocument } from 'vscode-languageserver-textdocument';

describe('TypeAwareValidator Integration', () => {
  let diagnosticProvider: DiagnosticProvider;
  let mockFHIRPathService: any;
  let mockContextService: any;
  let mockModelProviderService: any;

  beforeEach(() => {
    // Mock FHIRPathService
    mockFHIRPathService = {
      parse: mock((expression: string) => {
        return {
          success: true,
          expression,
          ast: {}
        };
      }),
      analyze: mock(() => ({ diagnostics: [] })),
      analyzeWithContext: mock(() => ({ diagnostics: [] })),
      getExpressionType: mock(() => ({ type: 'string', singleton: true })),
      getResourceProperties: mock(() => ['name', 'birthDate', 'gender']),
      initializeModelProvider: mock()
    };

    // Mock FHIRPathContextService
    mockContextService = {
      extractFHIRPathExpressions: mock(() => [])
    };

    // Mock ModelProviderService  
    mockModelProviderService = {
      isInitialized: () => false,
      navigatePropertyPath: mock(async () => ({
        isValid: true,
        errors: [],
        finalType: { type: 'string', singleton: true }
      })),
      getEnhancedTypeInfo: mock(async () => null)
    };

    diagnosticProvider = new DiagnosticProvider(
      mockFHIRPathService,
      mockContextService,
      undefined,
      undefined,
      mockModelProviderService
    );
  });

  test('should integrate TypeAwareValidator without errors', async () => {
    const document = TextDocument.create(
      'test://test.fhirpath',
      'fhirpath',
      1,
      'Patient.name'
    );

    const diagnostics = await diagnosticProvider.provideDiagnostics(document);

    expect(Array.isArray(diagnostics)).toBe(true);
    expect(diagnostics.length).toBeGreaterThanOrEqual(0);
  });

  test('should handle expressions with TypeAwareValidator', async () => {
    const document = TextDocument.create(
      'test://test.fhirpath',
      'fhirpath',
      1,
      'Patient.invalidProperty'
    );

    const diagnostics = await diagnosticProvider.provideDiagnostics(document);

    expect(Array.isArray(diagnostics)).toBe(true);
    // Should have some diagnostics since we're testing invalid property access
    expect(diagnostics.length).toBeGreaterThan(0);
  });

  test('should work when ModelProviderService is not available', async () => {
    const diagnosticProviderNoModel = new DiagnosticProvider(
      mockFHIRPathService,
      mockContextService,
      undefined,
      undefined,
      undefined // No ModelProviderService
    );

    const document = TextDocument.create(
      'test://test.fhirpath',
      'fhirpath',
      1,
      'Patient.name'
    );

    const diagnostics = await diagnosticProviderNoModel.provideDiagnostics(document);

    expect(Array.isArray(diagnostics)).toBe(true);
    // Should not crash even without ModelProviderService
  });

  test('should include type-aware diagnostics in results', async () => {
    const document = TextDocument.create(
      'test://test.fhirpath',
      'fhirpath',
      1,
      'Patient.name.count() = true'
    );

    const diagnostics = await diagnosticProvider.provideDiagnostics(document);

    expect(Array.isArray(diagnostics)).toBe(true);
    // Should include type-aware analysis for this type mismatch
    const typeAwareDiagnostic = diagnostics.find(d => 
      d.source?.includes('type') || d.message?.includes('type')
    );
    expect(typeAwareDiagnostic).toBeDefined();
  });
});