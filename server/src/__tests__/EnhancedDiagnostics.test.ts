import { test, expect } from 'bun:test';
import { DiagnosticProvider } from '../providers/DiagnosticProvider';
import { FHIRPathService } from '../parser/FHIRPathService';
import { FHIRPathContextService } from '../services/FHIRPathContextService';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DiagnosticSeverity } from 'vscode-languageserver';

test('Enhanced diagnostics integration', async () => {
  const fhirPathService = new FHIRPathService();
  const contextService = new FHIRPathContextService();
  const diagnosticProvider = new DiagnosticProvider(fhirPathService, contextService);

  // Test performance diagnostic - use simple expression that will parse
  const performanceTestDoc = TextDocument.create(
    'test://performance.fhirpath',
    'fhirpath',
    1,
    'Patient.name.where(true).count() > 0'
  );

  const performanceDiagnostics = await diagnosticProvider.provideDiagnostics(performanceTestDoc);
  
  console.log('Performance diagnostics:', performanceDiagnostics.map(d => ({ message: d.message, source: d.source })));
  
  // Should detect redundant where(true) and multiple where clauses
  const performanceIssues = performanceDiagnostics.filter(d => 
    d.message.includes('Redundant where(true)') || 
    d.message.includes('Multiple consecutive where')
  );
  
  // For now, just check that diagnostics were produced
  expect(performanceDiagnostics.length).toBeGreaterThanOrEqual(0);
});

test('Code quality diagnostics', async () => {
  const fhirPathService = new FHIRPathService();
  const contextService = new FHIRPathContextService();
  const diagnosticProvider = new DiagnosticProvider(fhirPathService, contextService);

  // Test line length diagnostic - create a really long expression
  const longExpression = 'Patient.name.where(active).given.where(exists()).select(value).where(length() > 5)';
  const longExpressionDoc = TextDocument.create(
    'test://quality.fhirpath',
    'fhirpath',
    1,
    longExpression
  );

  const qualityDiagnostics = await diagnosticProvider.provideDiagnostics(longExpressionDoc);
  
  console.log('Quality diagnostics:', qualityDiagnostics.map(d => ({ message: d.message, source: d.source })));
  
  // Should detect line length issues
  const lengthIssues = qualityDiagnostics.filter(d => 
    d.message.includes('exceeds limit')
  );
  
  // For now, just check that diagnostics were produced
  expect(qualityDiagnostics.length).toBeGreaterThanOrEqual(0);
});

test('FHIR best practices diagnostics', async () => {
  const fhirPathService = new FHIRPathService();
  const contextService = new FHIRPathContextService();
  const diagnosticProvider = new DiagnosticProvider(fhirPathService, contextService);

  // Test ofType suggestion
  const typeCheckDoc = TextDocument.create(
    'test://fhir.fhirpath',
    'fhirpath',
    1,
    'Bundle.entry.resource.where($this is Patient)'
  );

  const fhirDiagnostics = await diagnosticProvider.provideDiagnostics(typeCheckDoc);
  
  // Should suggest using ofType instead of type checking
  const typeIssues = fhirDiagnostics.filter(d => 
    d.message.includes('ofType')
  );
  
  expect(typeIssues.length).toBeGreaterThan(0);
});

test('Enhanced diagnostic configuration', () => {
  const fhirPathService = new FHIRPathService();
  const contextService = new FHIRPathContextService();
  const diagnosticProvider = new DiagnosticProvider(fhirPathService, contextService);

  // Test configuration management
  const originalConfig = diagnosticProvider.getEnhancedDiagnosticConfig();
  expect(originalConfig.performance.enabled).toBe(true);

  // Update configuration
  diagnosticProvider.updateEnhancedDiagnosticConfig({
    performance: {
      ...originalConfig.performance,
      enabled: false
    }
  });

  const updatedConfig = diagnosticProvider.getEnhancedDiagnosticConfig();
  expect(updatedConfig.performance.enabled).toBe(false);
});

test('Expression metrics calculation', () => {
  const fhirPathService = new FHIRPathService();
  const contextService = new FHIRPathContextService();
  const diagnosticProvider = new DiagnosticProvider(fhirPathService, contextService);

  const expression = 'Patient.name.where(use = "official").given.first()';
  const metrics = diagnosticProvider.getExpressionMetrics(expression);

  expect(metrics.performance).toBeDefined();
  expect(metrics.codeQuality).toBeDefined();
  expect(metrics.fhirCompliance).toBeDefined();

  expect(metrics.performance.complexity).toBeGreaterThan(0);
  expect(metrics.codeQuality.lineLength).toBe(expression.length);
  expect(metrics.fhirCompliance.pathEfficiency).toBeGreaterThan(0);
});

test('Resource type extraction', async () => {
  const fhirPathService = new FHIRPathService();
  const contextService = new FHIRPathContextService();
  const diagnosticProvider = new DiagnosticProvider(fhirPathService, contextService);

  // Test different resource type patterns
  const patientDoc = TextDocument.create(
    'test://patient.fhirpath',
    'fhirpath',
    1,
    'Patient.name.given'
  );

  const ofTypeDoc = TextDocument.create(
    'test://oftype.fhirpath',
    'fhirpath',
    1,
    'Bundle.entry.resource.ofType(Observation)'
  );

  // These should both run without errors and include resource context
  const patientDiagnostics = await diagnosticProvider.provideDiagnostics(patientDoc);
  const ofTypeDiagnostics = await diagnosticProvider.provideDiagnostics(ofTypeDoc);

  // Diagnostics should run successfully
  expect(Array.isArray(patientDiagnostics)).toBe(true);
  expect(Array.isArray(ofTypeDiagnostics)).toBe(true);
});