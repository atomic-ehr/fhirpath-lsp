import { describe, it, expect } from 'bun:test';
import { RegistryAdapter } from '../RegistryAdapter';

describe('RegistryAdapter', () => {
  const adapter = new RegistryAdapter();

  describe('getFunctions', () => {
    it('should return array of functions', () => {
      const functions = adapter.getFunctions();
      expect(Array.isArray(functions)).toBe(true);
      expect(functions.length).toBeGreaterThan(0);
    });

    it('should include core FHIRPath functions', () => {
      const functions = adapter.getFunctions();
      const functionNames = functions.map(f => f.name);
      
      // Check for essential functions
      expect(functionNames).toContain('exists');
      expect(functionNames).toContain('empty');
      expect(functionNames).toContain('where');
      expect(functionNames).toContain('select');
      expect(functionNames).toContain('first');
      expect(functionNames).toContain('last');
      expect(functionNames).toContain('count');
    });

    it('should have proper function structure', () => {
      const functions = adapter.getFunctions();
      const whereFunc = functions.find(f => f.name === 'where');
      
      expect(whereFunc).toBeDefined();
      expect(whereFunc?.signature).toContain('where');
      expect(whereFunc?.description).toBeTruthy();
      expect(whereFunc?.category).toBeTruthy();
      expect(Array.isArray(whereFunc?.parameters)).toBe(true);
      expect(whereFunc?.returnType).toBeTruthy();
    });
  });

  describe('getOperators', () => {
    it('should return array of operators', () => {
      const operators = adapter.getOperators();
      expect(Array.isArray(operators)).toBe(true);
      expect(operators.length).toBeGreaterThan(0);
    });

    it('should include core FHIRPath operators', () => {
      const operators = adapter.getOperators();
      const operatorSymbols = operators.map(o => o.symbol);
      
      // Check for essential operators
      expect(operatorSymbols).toContain('=');
      expect(operatorSymbols).toContain('!=');
      expect(operatorSymbols).toContain('and');
      expect(operatorSymbols).toContain('or');
      expect(operatorSymbols).toContain('+');
      expect(operatorSymbols).toContain('-');
    });

    it('should have proper operator structure', () => {
      const operators = adapter.getOperators();
      const equalsOp = operators.find(o => o.symbol === '=');
      
      expect(equalsOp).toBeDefined();
      expect(equalsOp?.name).toBeTruthy();
      expect(equalsOp?.description).toBeTruthy();
      expect(typeof equalsOp?.precedence).toBe('number');
      expect(equalsOp?.associativity).toMatch(/^(left|right)$/);
    });
  });

  describe('getKeywords', () => {
    it('should return FHIRPath keywords', () => {
      const keywords = adapter.getKeywords();
      expect(Array.isArray(keywords)).toBe(true);
      
      const keywordNames = keywords.map(k => k.keyword);
      expect(keywordNames).toContain('true');
      expect(keywordNames).toContain('false');
      expect(keywordNames).toContain('null');
    });
  });

  describe('hasOperation', () => {
    it('should return true for existing operations', () => {
      expect(adapter.hasOperation('exists')).toBe(true);
      expect(adapter.hasOperation('where')).toBe(true);
      expect(adapter.hasOperation('+')).toBe(true);
    });

    it('should return false for non-existing operations', () => {
      expect(adapter.hasOperation('nonExistentFunction')).toBe(false);
    });
  });

  describe('getOperationInfo', () => {
    it('should return operation info for valid operations', () => {
      const info = adapter.getOperationInfo('where');
      expect(info).toBeDefined();
      expect(info?.name).toBe('where');
      expect(info?.kind).toBe('function');
    });
  });

  describe('getDocumentation', () => {
    it('should return documentation for documented functions', () => {
      const doc = adapter.getDocumentation('exists');
      expect(doc).toBeDefined();
      expect(doc?.description).toBeTruthy();
      expect(doc?.examples).toBeDefined();
      expect(doc?.category).toBe('existence');
    });
  });
});