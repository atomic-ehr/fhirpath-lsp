import { describe, it, expect, beforeEach, jest, Mock } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { SemanticTokensProvider } from '../SemanticTokensProvider';
import { FHIRPathService } from '../../parser/FHIRPathService';
import { ModelProviderService, ChoiceValidationResult, NavigationResult, EnhancedTypeInfo } from '../../services/ModelProviderService';
import {
  EnhancedTokenType,
  EnhancedTokenModifier,
  TokenTypeUtils
} from '../EnhancedSemanticTokenTypes';

// Mock dependencies
jest.mock('../../parser/FHIRPathService');
jest.mock('../../services/ModelProviderService');

describe('SemanticTokensProvider - Enhanced FHIR-Aware Highlighting', () => {
  let semanticTokensProvider: SemanticTokensProvider;
  let mockFhirPathService: jest.Mocked<FHIRPathService>;
  let mockModelProviderService: jest.Mocked<ModelProviderService>;

  beforeEach(() => {
    // Create mocks
    mockFhirPathService = {
      parse: jest.fn(),
      compile: jest.fn(),
      evaluate: jest.fn(),
      getAvailableResourceTypes: jest.fn(),
      isValidResourceType: jest.fn()
    } as any;

    mockModelProviderService = {
      isInitialized: jest.fn().mockReturnValue(true),
      validateChoiceProperty: jest.fn(),
      navigatePropertyPath: jest.fn(),
      getEnhancedTypeInfo: jest.fn(),
      getTypeInfo: jest.fn(),
      getResourceTypeInfo: jest.fn()
    } as any;

    // Initialize semantic tokens provider
    semanticTokensProvider = new SemanticTokensProvider(
      mockFhirPathService,
      mockModelProviderService
    );
  });

  describe('Choice Type Highlighting', () => {
    it('should highlight valid choice type properties with choiceType token', async () => {
      // Setup
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Observation.valueString'
      );

      mockFhirPathService.parse.mockReturnValue({
        success: true,
        ast: {
          type: 'MemberExpression',
          object: { type: 'Identifier', value: 'Observation' },
          property: { type: 'Identifier', value: 'valueString' }
        },
        errors: []
      });

      const validationResult: ChoiceValidationResult = {
        isValid: true,
        validChoices: ['valueString', 'valueQuantity', 'valueBoolean']
      };

      mockModelProviderService.validateChoiceProperty.mockResolvedValue(validationResult);

      // Execute
      const result = await semanticTokensProvider.generateEnhancedSemanticTokens(document);

      // Verify
      expect(result.data).toBeDefined();
      expect(result.data.length).toBeGreaterThan(0);
      
      // Should contain choice type token
      const tokens = this.decodeSemanticTokens(result.data);
      const choiceTypeTokens = tokens.filter(t => t.tokenType === EnhancedTokenType.CHOICE_TYPE);
      expect(choiceTypeTokens.length).toBeGreaterThan(0);
      
      const choiceToken = choiceTypeTokens[0];
      expect(choiceToken.modifiers).toContain(EnhancedTokenModifier.CHOICE_SPECIFIC);
    });

    it('should highlight invalid choice types with constraint error modifier', async () => {
      // Setup
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Observation.valueInvalid'
      );

      mockFhirPathService.parse.mockReturnValue({
        success: true,
        ast: {
          type: 'MemberExpression',
          object: { type: 'Identifier', value: 'Observation' },
          property: { type: 'Identifier', value: 'valueInvalid' }
        },
        errors: []
      });

      const validationResult: ChoiceValidationResult = {
        isValid: false,
        validChoices: ['valueString', 'valueQuantity', 'valueBoolean'],
        error: 'Invalid choice type'
      };

      mockModelProviderService.validateChoiceProperty.mockResolvedValue(validationResult);

      // Execute
      const result = await semanticTokensProvider.generateEnhancedSemanticTokens(document);

      // Verify
      const tokens = this.decodeSemanticTokens(result.data);
      const choiceTypeTokens = tokens.filter(t => t.tokenType === EnhancedTokenType.CHOICE_TYPE);
      expect(choiceTypeTokens.length).toBeGreaterThan(0);
      
      const invalidChoiceToken = choiceTypeTokens[0];
      expect(invalidChoiceToken.modifiers).toContain(EnhancedTokenModifier.CONSTRAINT_ERROR);
    });

    it('should differentiate between different choice types', async () => {
      // Setup - document with multiple choice types
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Observation.valueString\nObservation.valueQuantity'
      );

      mockFhirPathService.parse.mockReturnValue({
        success: true,
        ast: {},
        errors: []
      });

      const stringValidation: ChoiceValidationResult = {
        isValid: true,
        validChoices: ['valueString', 'valueQuantity', 'valueBoolean']
      };

      const quantityValidation: ChoiceValidationResult = {
        isValid: true,
        validChoices: ['valueString', 'valueQuantity', 'valueBoolean']
      };

      mockModelProviderService.validateChoiceProperty
        .mockResolvedValueOnce(stringValidation)
        .mockResolvedValueOnce(quantityValidation);

      // Execute
      const result = await semanticTokensProvider.generateEnhancedSemanticTokens(document);

      // Verify
      const tokens = this.decodeSemanticTokens(result.data);
      const choiceTokens = tokens.filter(t => t.tokenType === EnhancedTokenType.CHOICE_TYPE);
      expect(choiceTokens.length).toBe(2);
      
      // Both should be valid choice types
      choiceTokens.forEach(token => {
        expect(token.modifiers).toContain(EnhancedTokenModifier.CHOICE_SPECIFIC);
      });
    });
  });

  describe('Inherited Property Highlighting', () => {
    it('should highlight inherited properties with inherited modifier', async () => {
      // Setup
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.id'
      );

      mockFhirPathService.parse.mockReturnValue({
        success: true,
        ast: {
          type: 'MemberExpression',
          object: { type: 'Identifier', value: 'Patient' },
          property: { type: 'Identifier', value: 'id' }
        },
        errors: []
      });

      const navigationResult: NavigationResult = {
        isValid: true,
        finalType: { name: 'id', kind: 'primitive-type', cardinality: '0..1' } as any,
        navigationPath: [],
        availableProperties: [],
        errors: []
      };

      mockModelProviderService.navigatePropertyPath.mockResolvedValue(navigationResult);

      // Execute
      const result = await semanticTokensProvider.generateEnhancedSemanticTokens(document);

      // Verify
      const tokens = this.decodeSemanticTokens(result.data);
      const inheritedTokens = tokens.filter(t => t.tokenType === EnhancedTokenType.INHERITED_PROPERTY);
      expect(inheritedTokens.length).toBeGreaterThan(0);
      
      const inheritedToken = inheritedTokens[0];
      expect(inheritedToken.modifiers).toContain(EnhancedTokenModifier.INHERITED);
    });

    it('should identify common inherited properties', () => {
      expect(TokenTypeUtils.isLikelyInheritedProperty('id')).toBe(true);
      expect(TokenTypeUtils.isLikelyInheritedProperty('meta')).toBe(true);
      expect(TokenTypeUtils.isLikelyInheritedProperty('text')).toBe(true);
      expect(TokenTypeUtils.isLikelyInheritedProperty('extension')).toBe(true);
      expect(TokenTypeUtils.isLikelyInheritedProperty('name')).toBe(false);
    });
  });

  describe('Required vs Optional Property Highlighting', () => {
    it('should highlight required properties with required modifier', async () => {
      // Setup
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.identifier'
      );

      mockFhirPathService.parse.mockReturnValue({
        success: true,
        ast: {},
        errors: []
      });

      const typeInfo: EnhancedTypeInfo = {
        type: { name: 'Identifier', kind: 'complex-type', cardinality: '1..*' } as any,
        hierarchy: [],
        choiceTypes: [],
        constraints: {
          cardinality: '1..*',
          required: true
        },
        terminology: { strength: 'example' as const }
      };

      mockModelProviderService.getEnhancedTypeInfo.mockResolvedValue(typeInfo);

      // Execute
      const result = await semanticTokensProvider.generateEnhancedSemanticTokens(document);

      // Verify
      const tokens = this.decodeSemanticTokens(result.data);
      const requiredTokens = tokens.filter(t => t.tokenType === EnhancedTokenType.REQUIRED_PROPERTY);
      expect(requiredTokens.length).toBeGreaterThan(0);
      
      const requiredToken = requiredTokens[0];
      expect(requiredToken.modifiers).toContain(EnhancedTokenModifier.REQUIRED);
    });

    it('should highlight optional properties with optional modifier', async () => {
      // Setup
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.photo'
      );

      mockFhirPathService.parse.mockReturnValue({
        success: true,
        ast: {},
        errors: []
      });

      const typeInfo: EnhancedTypeInfo = {
        type: { name: 'Attachment', kind: 'complex-type', cardinality: '0..*' } as any,
        hierarchy: [],
        choiceTypes: [],
        constraints: {
          cardinality: '0..*',
          required: false
        },
        terminology: { strength: 'example' as const }
      };

      mockModelProviderService.getEnhancedTypeInfo.mockResolvedValue(typeInfo);

      // Execute
      const result = await semanticTokensProvider.generateEnhancedSemanticTokens(document);

      // Verify
      const tokens = this.decodeSemanticTokens(result.data);
      const propertyTokens = tokens.filter(t => 
        t.tokenType === EnhancedTokenType.PROPERTY || 
        t.tokenType === EnhancedTokenType.REQUIRED_PROPERTY
      );
      
      const optionalTokens = propertyTokens.filter(t => 
        t.modifiers & (1 << EnhancedTokenModifier.OPTIONAL)
      );
      expect(optionalTokens.length).toBeGreaterThan(0);
    });
  });

  describe('Constraint Violation Highlighting', () => {
    it('should highlight properties that violate constraints', async () => {
      // Setup
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.invalidProperty'
      );

      mockFhirPathService.parse.mockReturnValue({
        success: true,
        ast: {},
        errors: []
      });

      const navigationResult: NavigationResult = {
        isValid: false,
        finalType: undefined,
        navigationPath: [],
        availableProperties: ['name', 'identifier', 'gender'],
        errors: ['Property "invalidProperty" not found']
      };

      mockModelProviderService.navigatePropertyPath.mockResolvedValue(navigationResult);

      // Execute
      const result = await semanticTokensProvider.generateEnhancedSemanticTokens(document);

      // Verify
      const tokens = this.decodeSemanticTokens(result.data);
      const violationTokens = tokens.filter(t => t.tokenType === EnhancedTokenType.CONSTRAINT_VIOLATION);
      expect(violationTokens.length).toBeGreaterThan(0);
      
      const violationToken = violationTokens[0];
      expect(violationToken.modifiers).toContain(EnhancedTokenModifier.CONSTRAINT_ERROR);
    });
  });

  describe('Context-Sensitive Classification', () => {
    it('should extract resource type from document context', () => {
      const provider = semanticTokensProvider as any;
      
      expect(provider.extractResourceTypeFromDocument('Patient.name.family')).toBe('Patient');
      expect(provider.extractResourceTypeFromDocument('Observation.valueString')).toBe('Observation');
      expect(provider.extractResourceTypeFromDocument('@Patient')).toBe('Patient');
      expect(provider.extractResourceTypeFromDocument('invalidExpression')).toBeUndefined();
    });

    it('should provide enhanced token analysis with performance metrics', async () => {
      // Setup
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.name.family\nObservation.valueString'
      );

      mockFhirPathService.parse.mockReturnValue({
        success: true,
        ast: {},
        errors: []
      });

      mockModelProviderService.validateChoiceProperty.mockResolvedValue({
        isValid: true,
        validChoices: ['valueString']
      });

      mockModelProviderService.navigatePropertyPath.mockResolvedValue({
        isValid: true,
        finalType: undefined,
        navigationPath: [],
        availableProperties: [],
        errors: []
      });

      // Execute
      const analysisResult = await (semanticTokensProvider as any).analyzeEnhancedSemanticTokens(
        document.getText(),
        document,
        'Patient'
      );

      // Verify performance tracking
      expect(analysisResult.performance).toBeDefined();
      expect(analysisResult.performance.analysisTimeMs).toBeGreaterThan(0);
      expect(analysisResult.performance.tokensAnalyzed).toBeGreaterThan(0);
      expect(analysisResult.performance.modelProviderCalls).toBeGreaterThan(0);
      expect(analysisResult.tokens).toBeDefined();
      expect(analysisResult.errors).toBeDefined();
    });
  });

  describe('Graceful Degradation', () => {
    it('should work without ModelProvider', async () => {
      // Setup provider without ModelProvider
      const basicProvider = new SemanticTokensProvider(mockFhirPathService, undefined);
      
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.name.family'
      );

      mockFhirPathService.parse.mockReturnValue({
        success: true,
        ast: {
          type: 'MemberExpression',
          property: { type: 'Identifier', value: 'family' }
        },
        errors: []
      });

      // Execute
      const result = await basicProvider.generateEnhancedSemanticTokens(document);

      // Verify - should still provide basic highlighting
      expect(result.data).toBeDefined();
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should handle ModelProvider errors gracefully', async () => {
      // Setup
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.name'
      );

      mockFhirPathService.parse.mockReturnValue({
        success: true,
        ast: {},
        errors: []
      });

      mockModelProviderService.validateChoiceProperty.mockRejectedValue(new Error('ModelProvider error'));
      mockModelProviderService.navigatePropertyPath.mockRejectedValue(new Error('ModelProvider error'));

      // Execute
      const result = await semanticTokensProvider.generateEnhancedSemanticTokens(document);

      // Verify - should not crash and provide fallback highlighting
      expect(result.data).toBeDefined();
    });
  });

  describe('Performance Requirements', () => {
    it('should maintain performance under 50ms for typical documents', async () => {
      // Setup
      const largeExpression = Array(10).fill('Patient.name.family.where(length() > 2)').join('\n');
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        largeExpression
      );

      mockFhirPathService.parse.mockReturnValue({
        success: true,
        ast: {},
        errors: []
      });

      mockModelProviderService.navigatePropertyPath.mockResolvedValue({
        isValid: true,
        finalType: undefined,
        navigationPath: [],
        availableProperties: [],
        errors: []
      });

      // Execute and measure time
      const startTime = Date.now();
      const result = await semanticTokensProvider.generateEnhancedSemanticTokens(document);
      const endTime = Date.now();

      // Verify performance
      expect(endTime - startTime).toBeLessThan(50);
      expect(result.data).toBeDefined();
    });
  });

  describe('Token Type Utilities', () => {
    it('should correctly identify choice type properties', () => {
      expect(TokenTypeUtils.isChoiceTypeProperty('valueString')).toBe(true);
      expect(TokenTypeUtils.isChoiceTypeProperty('valueQuantity')).toBe(true);
      expect(TokenTypeUtils.isChoiceTypeProperty('effectiveDateTime')).toBe(true);
      expect(TokenTypeUtils.isChoiceTypeProperty('componentValue')).toBe(true);
      expect(TokenTypeUtils.isChoiceTypeProperty('name')).toBe(false);
      expect(TokenTypeUtils.isChoiceTypeProperty('status')).toBe(false);
    });

    it('should extract correct base property from choice types', () => {
      expect(TokenTypeUtils.getChoiceBaseProperty('valueString')).toBe('value');
      expect(TokenTypeUtils.getChoiceBaseProperty('valueQuantity')).toBe('value');
      expect(TokenTypeUtils.getChoiceBaseProperty('effectiveDateTime')).toBe('effective');
      expect(TokenTypeUtils.getChoiceBaseProperty('componentValue')).toBe('component');
    });

    it('should extract correct data type from choice properties', () => {
      expect(TokenTypeUtils.getChoiceDataType('valueString')).toBe('string');
      expect(TokenTypeUtils.getChoiceDataType('valueQuantity')).toBe('quantity');
      expect(TokenTypeUtils.getChoiceDataType('effectiveDateTime')).toBe('datetime');
    });

    it('should identify likely required properties', () => {
      expect(TokenTypeUtils.isLikelyRequiredProperty('status', 'Observation')).toBe(true);
      expect(TokenTypeUtils.isLikelyRequiredProperty('code', 'Observation')).toBe(true);
      expect(TokenTypeUtils.isLikelyRequiredProperty('gender', 'Patient')).toBe(true);
      expect(TokenTypeUtils.isLikelyRequiredProperty('photo', 'Patient')).toBe(false);
    });
  });

  // Helper method to decode semantic tokens for testing
  private decodeSemanticTokens(tokenData: number[]): Array<{
    line: number;
    startChar: number;
    length: number;
    tokenType: number;
    modifiers: number[];
  }> {
    const tokens: any[] = [];
    let currentLine = 0;
    let currentChar = 0;

    for (let i = 0; i < tokenData.length; i += 5) {
      const deltaLine = tokenData[i];
      const deltaStart = tokenData[i + 1];
      const length = tokenData[i + 2];
      const tokenType = tokenData[i + 3];
      const modifierBits = tokenData[i + 4];

      currentLine += deltaLine;
      if (deltaLine > 0) {
        currentChar = deltaStart;
      } else {
        currentChar += deltaStart;
      }

      const modifiers: number[] = [];
      for (let bit = 0; bit < 16; bit++) {
        if (modifierBits & (1 << bit)) {
          modifiers.push(bit);
        }
      }

      tokens.push({
        line: currentLine,
        startChar: currentChar,
        length,
        tokenType,
        modifiers
      });
    }

    return tokens;
  }
});