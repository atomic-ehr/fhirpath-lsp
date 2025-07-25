import { test, expect } from 'bun:test';
import { TransformationService, TransformationType } from '../../services/TransformationService';
import { FHIRPathService } from '../../parser/FHIRPathService';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Range } from 'vscode-languageserver';

const fhirPathService = new FHIRPathService();
const transformationService = new TransformationService(fhirPathService);

test('TransformationService - canApplyTransformation detects boolean simplification', () => {
  const document = TextDocument.create(
    'test://boolean.fhirpath',
    'fhirpath',
    1,
    'Patient.active = true'
  );

  const range: Range = {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 21 }
  };

  const canSimplify = transformationService.canApplyTransformation(
    document,
    range,
    TransformationType.SimplifyBoolean
  );

  expect(canSimplify).toBe(true);
});

test('TransformationService - canApplyTransformation detects path optimization', () => {
  const document = TextDocument.create(
    'test://path.fhirpath',
    'fhirpath',
    1,
    'Patient.name.where(true).count() > 0'
  );

  const range: Range = {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 34 }
  };

  const canOptimize = transformationService.canApplyTransformation(
    document,
    range,
    TransformationType.OptimizePath
  );

  expect(canOptimize).toBe(true);
});

test('TransformationService - simplify boolean expressions', async () => {
  const document = TextDocument.create(
    'test://simplify.fhirpath',
    'fhirpath',
    1,
    'Patient.active = true'
  );

  const range: Range = {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 21 }
  };

  const result = await transformationService.applyTransformation(
    document,
    range,
    TransformationType.SimplifyBoolean
  );

  expect(result.success).toBe(true);
  expect(result.transformedText).toBe('Patient.active');
  expect(result.description).toContain('Simplify "X = true" to "X"');
});

test('TransformationService - optimize path expressions', async () => {
  const document = TextDocument.create(
    'test://optimize.fhirpath',
    'fhirpath',
    1,
    'Patient.name.where(true).count() > 0'
  );

  const range: Range = {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 34 }
  };

  const result = await transformationService.applyTransformation(
    document,
    range,
    TransformationType.OptimizePath
  );

  expect(result.success).toBe(true);
  expect(result.transformedText).toBe('Patient.name.exists()');
  expect(result.description).toContain('Remove redundant where(true)');
});

test('TransformationService - remove redundant operations', async () => {
  const document = TextDocument.create(
    'test://redundant.fhirpath',
    'fhirpath',
    1,
    'Patient.telecom.count() = 0'
  );

  const range: Range = {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 26 }
  };

  const result = await transformationService.applyTransformation(
    document,
    range,
    TransformationType.RemoveRedundancy
  );

  expect(result.success).toBe(true);
  expect(result.transformedText).toBe('Patient.telecom.empty()');
  expect(result.description).toContain('replaced count() = 0 with empty()');
});

test('TransformationService - normalize spacing', async () => {
  const document = TextDocument.create(
    'test://spacing.fhirpath',
    'fhirpath',
    1,
    'Patient . name.where(use="official")'
  );

  const range: Range = {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 35 }
  };

  const result = await transformationService.applyTransformation(
    document,
    range,
    TransformationType.NormalizeSpacing
  );

  expect(result.success).toBe(true);
  expect(result.transformedText).toBe('Patient.name.where(use = "official")');
  expect(result.description).toContain('normalized');
});

test('TransformationService - handles multiple boolean rules', async () => {
  const document = TextDocument.create(
    'test://multiple.fhirpath',
    'fhirpath',
    1,
    'Patient.active = true and not not Patient.gender.exists()'
  );

  const range: Range = {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 52 }
  };

  const result = await transformationService.applyTransformation(
    document,
    range,
    TransformationType.SimplifyBoolean
  );

  expect(result.success).toBe(true);
  expect(result.transformedText).toBe('Patient.active and Patient.gender.exists()');
  expect(result.description).toContain('Applied');
});

test('TransformationService - rejects invalid transformations', async () => {
  const document = TextDocument.create(
    'test://invalid.fhirpath',
    'fhirpath',
    1,
    'Patient.name' // No transformations applicable
  );

  const range: Range = {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 12 }
  };

  const result = await transformationService.applyTransformation(
    document,
    range,
    TransformationType.SimplifyBoolean
  );

  expect(result.success).toBe(false);
  expect(result.error).toBe('No transformation needed');
});

test('TransformationService - getAvailableTransformations', () => {
  const document = TextDocument.create(
    'test://available.fhirpath',
    'fhirpath',
    1,
    'Patient.name.where(true).count() > 0'
  );

  const range: Range = {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 34 }
  };

  const available = transformationService.getAvailableTransformations(document, range);

  expect(available.length).toBeGreaterThan(0);
  expect(available).toContain(TransformationType.OptimizePath);
  expect(available).toContain(TransformationType.RemoveRedundancy);
});

test('TransformationService - handles empty text gracefully', async () => {
  const document = TextDocument.create(
    'test://empty.fhirpath',
    'fhirpath',
    1,
    '    ' // Only whitespace
  );

  const range: Range = {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 4 }
  };

  const result = await transformationService.applyTransformation(
    document,
    range,
    TransformationType.SimplifyBoolean
  );

  expect(result.success).toBe(false);
  expect(result.error).toBe('No text to transform');
});

test('TransformationService - merge consecutive where clauses', async () => {
  const document = TextDocument.create(
    'test://merge.fhirpath',
    'fhirpath',
    1,
    'Patient.name.where(use = "official").where(given.exists())'
  );

  const range: Range = {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 54 }
  };

  const result = await transformationService.applyTransformation(
    document,
    range,
    TransformationType.OptimizePath
  );

  expect(result.success).toBe(true);
  expect(result.transformedText).toBe('Patient.name.where(use = "official" and given.exists())');
  expect(result.description).toContain('Merge consecutive where clauses');
});