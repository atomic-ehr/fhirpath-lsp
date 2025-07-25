import { describe, expect, test, beforeEach } from 'bun:test';
import { Location, Range, Position } from 'vscode-languageserver';

import { FuzzySearchService } from '../../services/FuzzySearchService';
import { SymbolIndexService } from '../../services/SymbolIndexService';
import { WorkspaceSymbolProvider } from '../../providers/WorkspaceSymbolProvider';
import { SymbolService } from '../../services/SymbolService';
import { FHIRPathService } from '../../parser/FHIRPathService';
import { FHIRPathFunctionRegistry } from '../../services/FHIRPathFunctionRegistry';
import {
  SymbolEntry,
  WorkspaceSymbolQuery,
  SearchOptions,
} from '../../types/WorkspaceSymbolTypes';
import { FHIRPathSymbolKind } from '../../types/SymbolTypes';

// Mock connection
const mockConnection = {
  console: {
    log: () => {},
    warn: () => {},
    error: () => {}
  },
  workspace: {
    getWorkspaceFolders: async () => []
  }
} as any;

describe('Workspace Symbol Search', () => {
  let fuzzySearchService: FuzzySearchService;
  let symbolIndexService: SymbolIndexService;
  let workspaceSymbolProvider: WorkspaceSymbolProvider;
  let symbolService: SymbolService;

  beforeEach(() => {
    const fhirPathService = new FHIRPathService();
    const functionRegistry = new FHIRPathFunctionRegistry();
    
    fuzzySearchService = new FuzzySearchService();
    symbolIndexService = new SymbolIndexService();
    symbolService = new SymbolService(fhirPathService, functionRegistry);
    workspaceSymbolProvider = new WorkspaceSymbolProvider(mockConnection, symbolService);
  });

  function createSymbolEntry(
    name: string,
    kind: FHIRPathSymbolKind,
    fileUri: string = 'test://test.fhirpath',
    context?: string,
    fhirPath?: string
  ): SymbolEntry {
    return {
      name,
      kind,
      location: {
        uri: fileUri,
        range: Range.create(Position.create(0, 0), Position.create(0, name.length))
      },
      containerName: context,
      context,
      fhirPath,
      detail: `${kind}: ${name}`,
      fileUri,
      lastModified: Date.now(),
      searchTerms: [name.toLowerCase()]
    };
  }

  describe('FuzzySearchService', () => {
    test('should perform exact match search', () => {
      const items = [
        createSymbolEntry('Patient', FHIRPathSymbolKind.Resource),
        createSymbolEntry('Practitioner', FHIRPathSymbolKind.Resource),
        createSymbolEntry('Organization', FHIRPathSymbolKind.Resource)
      ];

      const results = fuzzySearchService.search('Patient', items);
      
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].item.name).toBe('Patient');
      expect(results[0].score).toBe(1.0);
    });

    test('should perform fuzzy search with scoring', () => {
      const items = [
        createSymbolEntry('Patient', FHIRPathSymbolKind.Resource),
        createSymbolEntry('PatientName', FHIRPathSymbolKind.Property),
        createSymbolEntry('where', FHIRPathSymbolKind.Function),
        createSymbolEntry('when', FHIRPathSymbolKind.Function)
      ];

      const results = fuzzySearchService.search('Pat', items);
      
      expect(results.length).toBeGreaterThan(0);
      
      // Patient should score higher or equal to PatientName for "Pat" query
      const patientResult = results.find(r => r.item.name === 'Patient');
      const patientNameResult = results.find(r => r.item.name === 'PatientName');
      
      expect(patientResult).toBeDefined();
      expect(patientNameResult).toBeDefined();
      expect(patientResult!.score).toBeGreaterThanOrEqual(patientNameResult!.score);
    });

    test('should handle fuzzy matching with typos', () => {
      const items = [
        createSymbolEntry('where', FHIRPathSymbolKind.Function),
        createSymbolEntry('select', FHIRPathSymbolKind.Function),
        createSymbolEntry('exists', FHIRPathSymbolKind.Function)
      ];

      const results = fuzzySearchService.search('wher', items, { threshold: 0.2 });
      
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].item.name).toBe('where');
      expect(results[0].score).toBeGreaterThan(0.5);
    });

    test('should calculate similarity scores correctly', () => {
      const exactScore = fuzzySearchService.calculateScore('Patient', 'Patient');
      const prefixScore = fuzzySearchService.calculateScore('Pat', 'Patient');
      const substringScore = fuzzySearchService.calculateScore('tie', 'Patient');
      const fuzzyScore = fuzzySearchService.calculateScore('Ptnt', 'Patient');
      
      expect(exactScore).toBe(1.0);
      expect(prefixScore).toBeGreaterThan(substringScore);
      // Allow for slight variations in scoring algorithms
      expect(substringScore).toBeGreaterThan(0.5);
      expect(fuzzyScore).toBeGreaterThan(0);
      expect(fuzzyScore).toBeLessThan(1.0);
    });

    test('should provide search suggestions', () => {
      const items = [
        createSymbolEntry('Patient', FHIRPathSymbolKind.Resource),
        createSymbolEntry('PatientName', FHIRPathSymbolKind.Property),
        createSymbolEntry('where', FHIRPathSymbolKind.Function)
      ];

      const suggestions = fuzzySearchService.getSuggestions('Pat', items);
      
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions).toContain('Patient');
      expect(suggestions).toContain('PatientName');
    });

    test('should handle empty queries gracefully', () => {
      const items = [
        createSymbolEntry('Patient', FHIRPathSymbolKind.Resource)
      ];

      const results = fuzzySearchService.search('', items);
      expect(results.length).toBe(1);
      expect(results[0].score).toBe(1.0);
    });

    test('should respect max results limit', () => {
      const items = Array.from({ length: 100 }, (_, i) => 
        createSymbolEntry(`Symbol${i}`, FHIRPathSymbolKind.Property)
      );

      const results = fuzzySearchService.search('Symbol', items, { maxResults: 10 });
      expect(results.length).toBe(10);
    });
  });

  describe('SymbolIndexService', () => {
    test('should initialize empty index', () => {
      const stats = symbolIndexService.getStats();
      
      expect(stats.totalSymbols).toBe(0);
      expect(stats.totalFiles).toBe(0);
      expect(stats.indexedFiles).toBe(0);
    });

    test('should add and retrieve symbols', async () => {
      const symbols = [
        createSymbolEntry('Patient', FHIRPathSymbolKind.Resource, 'file1.fhirpath'),
        createSymbolEntry('name', FHIRPathSymbolKind.Property, 'file1.fhirpath', 'Patient')
      ];

      await symbolIndexService.updateFile('file1.fhirpath', symbols);
      
      const stats = symbolIndexService.getStats();
      expect(stats.totalSymbols).toBe(2);
      expect(stats.totalFiles).toBe(1);
      
      const fileSymbols = symbolIndexService.getFileSymbols('file1.fhirpath');
      expect(fileSymbols.length).toBe(2);
    });

    test('should search symbols by name', async () => {
      const symbols = [
        createSymbolEntry('Patient', FHIRPathSymbolKind.Resource, 'file1.fhirpath'),
        createSymbolEntry('PatientName', FHIRPathSymbolKind.Property, 'file1.fhirpath'),
        createSymbolEntry('where', FHIRPathSymbolKind.Function, 'file1.fhirpath')
      ];

      await symbolIndexService.updateFile('file1.fhirpath', symbols);
      
      const results = await symbolIndexService.search('Patient');
      expect(results.length).toBeGreaterThan(0);
      
      const patientSymbol = results.find(s => s.name === 'Patient');
      expect(patientSymbol).toBeDefined();
    });

    test('should get symbols by kind', async () => {
      const symbols = [
        createSymbolEntry('Patient', FHIRPathSymbolKind.Resource, 'file1.fhirpath'),
        createSymbolEntry('where', FHIRPathSymbolKind.Function, 'file1.fhirpath'),
        createSymbolEntry('name', FHIRPathSymbolKind.Property, 'file1.fhirpath')
      ];

      await symbolIndexService.updateFile('file1.fhirpath', symbols);
      
      const functions = symbolIndexService.getSymbolsByKind(FHIRPathSymbolKind.Function);
      expect(functions.length).toBe(1);
      expect(functions[0].name).toBe('where');
      
      const resources = symbolIndexService.getSymbolsByKind(FHIRPathSymbolKind.Resource);
      expect(resources.length).toBe(1);
      expect(resources[0].name).toBe('Patient');
    });

    test('should remove file from index', async () => {
      const symbols = [
        createSymbolEntry('Patient', FHIRPathSymbolKind.Resource, 'file1.fhirpath')
      ];

      await symbolIndexService.updateFile('file1.fhirpath', symbols);
      expect(symbolIndexService.getStats().totalSymbols).toBe(1);
      
      await symbolIndexService.removeFile('file1.fhirpath');
      expect(symbolIndexService.getStats().totalSymbols).toBe(0);
    });

    test('should handle search with options', async () => {
      const symbols = Array.from({ length: 50 }, (_, i) => 
        createSymbolEntry(`Symbol${i}`, FHIRPathSymbolKind.Property, 'file1.fhirpath')
      );

      await symbolIndexService.updateFile('file1.fhirpath', symbols);
      
      const options: SearchOptions = {
        maxResults: 10,
        fuzzyThreshold: 0.5,
        includePrivate: true,
        searchInContent: false,
        sortByRelevance: true
      };
      
      const results = await symbolIndexService.search('Symbol', options);
      expect(results.length).toBeLessThanOrEqual(10);
    });

    test('should clear index', async () => {
      const symbols = [
        createSymbolEntry('Patient', FHIRPathSymbolKind.Resource, 'file1.fhirpath')
      ];

      await symbolIndexService.updateFile('file1.fhirpath', symbols);
      expect(symbolIndexService.getStats().totalSymbols).toBe(1);
      
      await symbolIndexService.clearIndex();
      expect(symbolIndexService.getStats().totalSymbols).toBe(0);
    });

    test('should provide index health information', async () => {
      const health = symbolIndexService.getIndexHealth();
      
      expect(health).toHaveProperty('isHealthy');
      expect(health).toHaveProperty('issues');
      expect(health).toHaveProperty('recommendations');
      expect(typeof health.isHealthy).toBe('boolean');
      expect(Array.isArray(health.issues)).toBe(true);
      expect(Array.isArray(health.recommendations)).toBe(true);
    });
  });

  describe('WorkspaceSymbolProvider', () => {
    test('should initialize with empty workspace', async () => {
      await workspaceSymbolProvider.initialize([]);
      
      const stats = workspaceSymbolProvider.getStats();
      expect(stats.totalSymbols).toBe(0);
    });

    test('should search workspace symbols', async () => {
      await workspaceSymbolProvider.initialize([]);
      
      const query: WorkspaceSymbolQuery = {
        query: 'Patient',
        maxResults: 10,
        fuzzySearch: true
      };
      
      const results = await workspaceSymbolProvider.search(query);
      expect(Array.isArray(results)).toBe(true);
    });

    test('should handle file indexing', async () => {
      await workspaceSymbolProvider.initialize([]);
      
      await workspaceSymbolProvider.indexFile('test://test.fhirpath');
      
      // Should not throw errors
      expect(true).toBe(true);
    });

    test('should remove files from index', async () => {
      await workspaceSymbolProvider.initialize([]);
      
      await workspaceSymbolProvider.indexFile('test://test.fhirpath');
      await workspaceSymbolProvider.removeFile('test://test.fhirpath');
      
      // Should not throw errors
      expect(true).toBe(true);
    });

    test('should get suggestions', async () => {
      await workspaceSymbolProvider.initialize([]);
      
      const suggestions = await workspaceSymbolProvider.getSuggestions('Pat');
      expect(Array.isArray(suggestions)).toBe(true);
    });

    test('should handle file system changes', async () => {
      await workspaceSymbolProvider.initialize([]);
      
      // Test file change handlers
      await workspaceSymbolProvider.handleFileCreated('test://new.fhirpath');
      await workspaceSymbolProvider.handleFileChanged('test://existing.fhirpath');
      await workspaceSymbolProvider.handleFileDeleted('test://deleted.fhirpath');
      
      // Should not throw errors
      expect(true).toBe(true);
    });

    test('should provide health status', async () => {
      await workspaceSymbolProvider.initialize([]);
      
      const health = workspaceSymbolProvider.getHealthStatus();
      
      expect(health).toHaveProperty('isHealthy');
      expect(health).toHaveProperty('message');
      expect(health).toHaveProperty('stats');
      expect(typeof health.isHealthy).toBe('boolean');
      expect(typeof health.message).toBe('string');
    });

    test('should handle workspace folder changes', async () => {
      await workspaceSymbolProvider.initialize([]);
      
      await workspaceSymbolProvider.handleWorkspaceFoldersChanged(
        ['test://new-folder'],
        ['test://old-folder']
      );
      
      // Should not throw errors
      expect(true).toBe(true);
    });

    test('should clear index', async () => {
      await workspaceSymbolProvider.initialize([]);
      
      await workspaceSymbolProvider.clearIndex();
      
      const stats = workspaceSymbolProvider.getStats();
      expect(stats.totalSymbols).toBe(0);
    });
  });

  describe('Integration Tests', () => {
    test('should handle complex workspace scenarios', async () => {
      await workspaceSymbolProvider.initialize(['test://workspace']);
      
      // Add multiple files with symbols
      await workspaceSymbolProvider.indexFile('test://file1.fhirpath');
      await workspaceSymbolProvider.indexFile('test://file2.fhirpath');
      
      // Search across workspace
      const results = await workspaceSymbolProvider.search({
        query: 'Patient',
        maxResults: 50,
        fuzzySearch: true
      });
      
      expect(Array.isArray(results)).toBe(true);
    });

    test('should handle search performance requirements', async () => {
      await workspaceSymbolProvider.initialize([]);
      
      const startTime = Date.now();
      
      const results = await workspaceSymbolProvider.search({
        query: 'test',
        maxResults: 100
      });
      
      const searchTime = Date.now() - startTime;
      
      // Should complete search within reasonable time (< 100ms for empty index)
      expect(searchTime).toBeLessThan(100);
      expect(Array.isArray(results)).toBe(true);
    });

    test('should handle memory efficiency', () => {
      const stats = symbolIndexService.getStats();
      
      // Memory usage should be reasonable for empty index
      expect(stats.memoryUsage).toBeLessThan(1024 * 1024); // < 1MB
    });

    test('should handle edge cases gracefully', async () => {
      await workspaceSymbolProvider.initialize([]);
      
      // Empty query
      const emptyResults = await workspaceSymbolProvider.search({
        query: '',
        maxResults: 10
      });
      expect(emptyResults.length).toBe(0);
      
      // Very long query
      const longQuery = 'a'.repeat(1000);
      const longResults = await workspaceSymbolProvider.search({
        query: longQuery,
        maxResults: 10
      });
      expect(Array.isArray(longResults)).toBe(true);
      
      // Special characters
      const specialResults = await workspaceSymbolProvider.search({
        query: '!@#$%^&*()',
        maxResults: 10
      });
      expect(Array.isArray(specialResults)).toBe(true);
    });
  });
});