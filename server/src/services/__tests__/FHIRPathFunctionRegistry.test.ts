import { describe, it, expect } from 'bun:test';
import { FHIRPathFunctionRegistry } from '../FHIRPathFunctionRegistry';
import { CompletionItemKind } from 'vscode-languageserver/node';

describe('FHIRPathFunctionRegistry with Registry API', () => {
  const registry = new FHIRPathFunctionRegistry();

  describe('getFunctions', () => {
    it('should return functions from Registry API', () => {
      const functions = registry.getFunctions();
      expect(functions.length).toBeGreaterThan(0);
      
      // Check for essential functions
      const functionNames = functions.map(f => f.name);
      expect(functionNames).toContain('exists');
      expect(functionNames).toContain('where');
      expect(functionNames).toContain('select');
      expect(functionNames).toContain('first');
      expect(functionNames).toContain('count');
    });
  });

  describe('getOperators', () => {
    it('should return operators from Registry API', () => {
      const operators = registry.getOperators();
      expect(operators.length).toBeGreaterThan(0);
      
      // Check for essential operators
      const operatorSymbols = operators.map(o => o.symbol);
      expect(operatorSymbols).toContain('=');
      expect(operatorSymbols).toContain('and');
      expect(operatorSymbols).toContain('+');
    });
  });

  describe('getFunctionCompletionItems', () => {
    it('should generate completion items for functions', () => {
      const completions = registry.getFunctionCompletionItems();
      expect(completions.length).toBeGreaterThan(0);
      
      const existsCompletion = completions.find(c => c.label === 'exists');
      expect(existsCompletion).toBeDefined();
      expect(existsCompletion?.kind).toBe(CompletionItemKind.Function);
      expect(existsCompletion?.detail).toContain('exists');
      expect(existsCompletion?.documentation).toBeDefined();
    });
  });

  describe('getOperatorCompletionItems', () => {
    it('should generate completion items for word operators', () => {
      const completions = registry.getOperatorCompletionItems();
      expect(completions.length).toBeGreaterThan(0);
      
      // Should only include word operators, not symbols
      const andCompletion = completions.find(c => c.label === 'and');
      expect(andCompletion).toBeDefined();
      expect(andCompletion?.kind).toBe(CompletionItemKind.Operator);
      
      // Single character operators should be filtered out
      const equalsCompletion = completions.find(c => c.label === '=');
      expect(equalsCompletion).toBeUndefined();
    });
  });

  describe('getKeywordCompletionItems', () => {
    it('should generate completion items for keywords', () => {
      const completions = registry.getKeywordCompletionItems();
      expect(completions.length).toBeGreaterThan(0);
      
      const trueCompletion = completions.find(c => c.label === 'true');
      expect(trueCompletion).toBeDefined();
      expect(trueCompletion?.kind).toBe(CompletionItemKind.Keyword);
    });
  });

  describe('getFunction', () => {
    it('should retrieve individual function details', () => {
      const whereFunc = registry.getFunction('where');
      expect(whereFunc).toBeDefined();
      expect(whereFunc?.name).toBe('where');
      expect(whereFunc?.parameters.length).toBeGreaterThan(0);
      expect(whereFunc?.category).toBe('filtering');
    });
  });
});