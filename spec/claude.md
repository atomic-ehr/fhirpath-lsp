# Architecture Decision Record: FHIRPath Language Server Protocol Implementation

## Context and Background

This ADR documents the architectural decisions for implementing a FHIRPath Language Server Protocol (LSP) in TypeScript and integrating it into Visual Studio Code. FHIRPath is a path-based navigation and extraction language used in HL7 FHIR for querying and manipulating healthcare data structures.

**Key Finding**: The atomic-ehr GitHub organization referenced in the requirements does not exist. Instead, we recommend leveraging the **official HL7 FHIRPath.js implementation** (https://github.com/HL7/fhirpath.js) as the parsing foundation, which provides a mature ANTLR-generated parser with full FHIRPath 2.0.0 support.

## Decision

We will implement a phased FHIRPath LSP using TypeScript that provides syntax highlighting, error detection, and future extensibility for advanced features. The implementation will follow LSP best practices and integrate seamlessly with VS Code while maintaining compatibility with other LSP-compliant editors.

### Technology Stack
- **Parser**: HL7 FHIRPath.js with ANTLR 4.0 grammar
- **LSP Framework**: Microsoft vscode-languageserver-node
- **Client Integration**: vscode-languageclient
- **Syntax Highlighting**: TextMate grammars with semantic tokens
- **Build System**: TypeScript with incremental compilation

## Architecture Overview

### Project Structure
```
fhirpath-lsp/
├── client/                        # VS Code Extension
│   ├── src/
│   │   ├── extension.ts          # Extension entry point
│   │   └── test/                 # Extension tests
│   └── package.json              # Extension manifest
├── server/                        # Language Server
│   ├── src/
│   │   ├── server.ts            # LSP server entry
│   │   ├── parser/              # FHIRPath parsing
│   │   ├── analyzer/            # Semantic analysis
│   │   ├── providers/           # LSP feature providers
│   │   └── services/            # Core services
│   └── package.json
├── syntaxes/
│   └── fhirpath.tmGrammar.json  # TextMate grammar
└── package.json                  # Workspace configuration
```

### Core Architecture Components

**1. Parser Integration Layer**
```typescript
interface IFHIRPathParser {
  parse(expression: string): ParseResult;
  getTokens(expression: string): Token[];
  validateSyntax(expression: string): Diagnostic[];
}

class FHIRPathParserAdapter implements IFHIRPathParser {
  private parser: any; // HL7 FHIRPath.js parser
  
  parse(expression: string): ParseResult {
    try {
      const ast = this.parser.parse(expression);
      return { success: true, ast, errors: [] };
    } catch (error) {
      return this.handleParseError(error);
    }
  }
}
```

**2. Language Server Core**
```typescript
const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments<TextDocument>(TextDocument);

connection.onInitialize((params: InitializeParams): InitializeResult => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      diagnosticProvider: { interFileDependencies: false, workspaceDiagnostics: false },
      semanticTokensProvider: {
        legend: { tokenTypes: TOKEN_TYPES, tokenModifiers: TOKEN_MODIFIERS },
        full: true,
        range: true
      },
      completionProvider: { 
        resolveProvider: true,
        triggerCharacters: ['.', '[', '('] 
      }
    }
  };
});
```

**3. Document Management Service**
```typescript
class DocumentService {
  private cache: Map<string, DocumentState> = new Map();
  private parser: IFHIRPathParser;
  
  async analyzeDocument(uri: string, content: string): Promise<DocumentAnalysis> {
    const parseResult = this.parser.parse(content);
    const diagnostics = this.generateDiagnostics(parseResult);
    const tokens = this.extractSemanticTokens(parseResult);
    
    this.cache.set(uri, { parseResult, diagnostics, tokens });
    return { diagnostics, tokens };
  }
}
```

## Phase 1 Implementation Details

### 1. TextMate Grammar for Syntax Highlighting

The TextMate grammar provides immediate visual feedback before LSP initialization:

```json
{
  "scopeName": "source.fhirpath",
  "patterns": [
    {
      "name": "keyword.control.fhirpath",
      "match": "\\b(where|select|exists|all|empty|first|last)\\b"
    },
    {
      "name": "keyword.operator.fhirpath",
      "match": "\\b(and|or|xor|implies|is|as|in|contains)\\b"
    },
    {
      "name": "entity.name.function.fhirpath",
      "match": "\\b(count|distinct|union|intersect|combine)\\b(?=\\s*\\()"
    },
    {
      "name": "string.quoted.single.fhirpath",
      "begin": "'",
      "end": "'",
      "patterns": [
        {
          "name": "constant.character.escape.fhirpath",
          "match": "\\\\."
        }
      ]
    }
  ]
}
```

### 2. Error Detection and Diagnostics

**Diagnostic Provider Implementation**:
```typescript
class DiagnosticProvider {
  private validators: IValidator[] = [
    new SyntaxValidator(),
    new PathValidator(),
    new FunctionValidator(),
    new TypeValidator()
  ];
  
  async validateDocument(document: TextDocument): Promise<Diagnostic[]> {
    const text = document.getText();
    const diagnostics: Diagnostic[] = [];
    
    // Syntax validation using parser
    try {
      const ast = this.parser.parse(text);
      
      // Run semantic validators
      for (const validator of this.validators) {
        const issues = await validator.validate(ast, document);
        diagnostics.push(...issues);
      }
    } catch (syntaxError) {
      diagnostics.push(this.createSyntaxDiagnostic(syntaxError, document));
    }
    
    return diagnostics;
  }
  
  private createSyntaxDiagnostic(error: any, document: TextDocument): Diagnostic {
    return {
      severity: DiagnosticSeverity.Error,
      range: {
        start: document.positionAt(error.offset),
        end: document.positionAt(error.offset + error.length)
      },
      message: error.message,
      code: 'fhirpath-syntax-error',
      source: 'fhirpath'
    };
  }
}
```

### 3. Semantic Token Provider

Enhanced syntax highlighting through semantic tokens:

```typescript
class SemanticTokenProvider {
  private tokenTypes = ['function', 'operator', 'variable', 'property', 'keyword'];
  private tokenModifiers = ['declaration', 'readonly', 'deprecated'];
  
  provideSemanticTokens(document: TextDocument): SemanticTokens {
    const builder = new SemanticTokensBuilder();
    const ast = this.parser.parse(document.getText());
    
    this.visitAST(ast, (node) => {
      const position = document.positionAt(node.start);
      const tokenType = this.getTokenType(node);
      
      builder.push(
        position.line,
        position.character,
        node.length,
        tokenType,
        0 // no modifiers for Phase 1
      );
    });
    
    return builder.build();
  }
}
```

### 4. VS Code Extension Integration

**Extension Activation**:
```typescript
export function activate(context: ExtensionContext) {
  const serverModule = context.asAbsolutePath(
    path.join('server', 'out', 'server.js')
  );
  
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ['--nolazy', '--inspect=6009'] }
    }
  };
  
  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: 'file', language: 'fhirpath' },
      { scheme: 'untitled', language: 'fhirpath' }
    ],
    synchronize: {
      configurationSection: 'fhirpath',
      fileEvents: workspace.createFileSystemWatcher('**/*.fhirpath')
    }
  };
  
  const client = new LanguageClient(
    'fhirpathLanguageServer',
    'FHIRPath Language Server',
    serverOptions,
    clientOptions
  );
  
  client.start();
}
```

**Package.json Configuration**:
```json
{
  "contributes": {
    "languages": [{
      "id": "fhirpath",
      "extensions": [".fhirpath", ".fhir"],
      "aliases": ["FHIRPath", "fhirpath"],
      "configuration": "./language-configuration.json"
    }],
    "grammars": [{
      "language": "fhirpath",
      "scopeName": "source.fhirpath",
      "path": "./syntaxes/fhirpath.tmGrammar.json"
    }],
    "configuration": {
      "title": "FHIRPath",
      "properties": {
        "fhirpath.validate.enable": {
          "type": "boolean",
          "default": true,
          "description": "Enable/disable FHIRPath validation"
        },
        "fhirpath.trace.server": {
          "type": "string",
          "enum": ["off", "messages", "verbose"],
          "default": "off"
        }
      }
    }
  }
}
```

## Technical Considerations and Future Phases

### Performance Optimization

**1. Incremental Parsing Strategy**
- Implement debounced validation (300ms delay after typing stops)
- Cache parse results with document version tracking
- Use incremental text synchronization (TextDocumentSyncKind.Incremental)
- Limit initial validation to visible viewport

**2. Memory Management**
```typescript
class CacheManager {
  private cache = new LRUCache<string, ParseResult>({ max: 100 });
  private weakRefs = new WeakMap<TextDocument, DocumentState>();
  
  cleanup() {
    // Periodic cleanup of stale entries
    setInterval(() => this.evictStaleEntries(), 60000);
  }
}
```

### Error Recovery and Tolerance

**Parser Error Recovery**:
```typescript
class ErrorTolerantParser {
  parse(text: string): ParseResult {
    const errors: ParseError[] = [];
    const recoveryPoints = this.findRecoveryPoints(text);
    
    // Attempt parsing segments between recovery points
    const segments = this.splitByRecoveryPoints(text, recoveryPoints);
    const partialASTs = segments.map(segment => 
      this.parseSegment(segment, errors)
    );
    
    return {
      ast: this.mergePartialASTs(partialASTs),
      errors,
      partial: true
    };
  }
}
```

### Extension Points for Future Phases

**Phase 2 - Auto-completion**:
```typescript
interface ICompletionProvider {
  provideCompletions(
    document: TextDocument,
    position: Position,
    context: CompletionContext
  ): CompletionItem[];
}

class FHIRPathCompletionProvider implements ICompletionProvider {
  private schemaService: IFHIRSchemaService;
  
  provideCompletions(/*...*/) {
    // Context-aware completion based on:
    // - Current path context
    // - Available FHIR resources
    // - Function signatures
    // - Variable scope
  }
}
```

**Phase 3 - Advanced Features**:
- **Go to Definition**: Navigate to FHIR resource definitions
- **Find References**: Track path usage across files
- **Rename Refactoring**: Safely rename path elements
- **Code Actions**: Quick fixes for common errors
- **Hover Information**: Display type information and documentation

### Testing Strategy

**1. Unit Tests**:
```typescript
describe('FHIRPathParser', () => {
  it('should parse valid expressions', () => {
    const result = parser.parse('Patient.name.given');
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
  
  it('should recover from syntax errors', () => {
    const result = parser.parse('Patient.name[');
    expect(result.partial).toBe(true);
    expect(result.errors).toHaveLength(1);
  });
});
```

**2. Integration Tests**:
- End-to-end VS Code extension tests
- LSP protocol compliance tests
- Performance benchmarks for large files

### Success Metrics

- **Performance**: < 200ms response time for completions
- **Accuracy**: > 95% successful parsing of valid FHIRPath
- **Recovery**: Meaningful diagnostics for 90% of syntax errors
- **Adoption**: Multi-editor support within 6 months

## Conclusion

This architecture provides a solid foundation for FHIRPath language support in VS Code while maintaining extensibility for future enhancements. By leveraging the official HL7 FHIRPath.js parser and following LSP best practices, we ensure compatibility and reliability. The phased approach allows for rapid delivery of core features while building toward a comprehensive development environment for FHIRPath expressions.


# FHIRPath Language Server Protocol: Technical Implementation Guide

## Core Dependencies and Package Setup

### 1. Essential NPM Packages

```json
{
  "devDependencies": {
    // VS Code Extension Development
    "@types/vscode": "^1.84.0",
    "@vscode/test-electron": "^2.3.8",
    "esbuild": "^0.19.11",
    
    // TypeScript
    "typescript": "^5.3.3",
    "@types/node": "^20.11.0",
    
    // Testing
    "jest": "^29.7.0",
    "@types/jest": "^29.5.11"
  },
  "dependencies": {
    // Language Server Protocol
    "vscode-languageserver": "^9.0.1",
    "vscode-languageserver-textdocument": "^1.0.11",
    "vscode-languageserver-types": "^3.17.5",
    "vscode-languageclient": "^9.0.1",
    
    // FHIRPath Parser
    "fhirpath": "^3.15.2",
    
    // FHIR Model Data (R4)
    "@types/fhir": "^0.0.41",
    
    // Utilities
    "lodash": "^4.17.21",
    "@types/lodash": "^4.14.202"
  }
}
```

### 2. Workspace Configuration

**Root package.json (Monorepo)**:
```json
{
  "private": true,
  "workspaces": [
    "client",
    "server"
  ],
  "scripts": {
    "compile": "npm run compile:client && npm run compile:server",
    "compile:client": "npm run compile --workspace=client",
    "compile:server": "npm run compile --workspace=server",
    "watch": "npm run watch:client & npm run watch:server",
    "test": "jest",
    "vscode:prepublish": "npm run compile"
  }
}
```

## Language Server Implementation

### 1. Server Initialization and Capabilities

```typescript
// server/src/server.ts
import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
  CompletionItem,
  CompletionItemKind,
  SemanticTokensBuilder,
  SemanticTokensLegend,
  DiagnosticSeverity,
  Position,
  Range
} from 'vscode-languageserver/node';

import {
  TextDocument
} from 'vscode-languageserver-textdocument';

// FHIRPath imports
import fhirpath from 'fhirpath';
import r4_model from 'fhirpath/fhir-context/r4';

// Create connection using Node IPC
const connection = createConnection(ProposedFeatures.all);

// Document manager using the new text document API
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// Token types and modifiers for semantic highlighting
const tokenTypes = ['function', 'parameter', 'variable', 'property', 'operator', 'keyword', 'string', 'number'];
const tokenModifiers = ['declaration', 'readonly', 'deprecated', 'modification'];

connection.onInitialize((params: InitializeParams): InitializeResult => {
  const capabilities = params.capabilities;
  
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      
      // Diagnostic support
      diagnosticProvider: {
        interFileDependencies: false,
        workspaceDiagnostics: false
      },
      
      // Semantic tokens for enhanced highlighting
      semanticTokensProvider: {
        legend: {
          tokenTypes,
          tokenModifiers
        },
        full: true,
        range: true
      },
      
      // Future: Completion support
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: ['.', '[', '(', ' ']
      },
      
      // Future: Hover support
      hoverProvider: true,
      
      // Future: Definition support
      definitionProvider: true
    }
  };
});
```

### 2. FHIRPath Parser Integration

```typescript
// server/src/services/FHIRPathService.ts
import * as fhirpath from 'fhirpath';
import r4_model from 'fhirpath/fhir-context/r4';

export interface ParseError {
  message: string;
  line: number;
  column: number;
  offset: number;
  length: number;
}

export interface ParseResult {
  success: boolean;
  ast?: any;
  errors: ParseError[];
  tokens?: Token[];
}

export interface Token {
  type: TokenType;
  value: string;
  start: number;
  end: number;
  line: number;
  column: number;
}

export enum TokenType {
  Identifier = 'identifier',
  Function = 'function',
  Operator = 'operator',
  Keyword = 'keyword',
  String = 'string',
  Number = 'number',
  Punctuation = 'punctuation',
  Comment = 'comment'
}

export class FHIRPathService {
  private compiledCache = new Map<string, any>();
  
  /**
   * Parse FHIRPath expression and extract tokens
   */
  parse(expression: string): ParseResult {
    try {
      // Try to compile the expression
      const compiled = fhirpath.compile(expression, r4_model);
      
      // Cache compiled expression
      this.compiledCache.set(expression, compiled);
      
      // Extract tokens from the expression
      const tokens = this.tokenize(expression);
      
      return {
        success: true,
        tokens,
        errors: []
      };
    } catch (error: any) {
      return {
        success: false,
        errors: [this.parseErrorFromException(error, expression)]
      };
    }
  }
  
  /**
   * Validate FHIRPath expression with context
   */
  validate(expression: string, resourceType?: string): ParseError[] {
    const errors: ParseError[] = [];
    
    try {
      const compiled = fhirpath.compile(expression, r4_model);
      
      // Additional validation based on resource type
      if (resourceType) {
        // Validate path existence in resource type
        const paths = this.extractPaths(expression);
        for (const path of paths) {
          if (!this.isValidPath(path, resourceType)) {
            errors.push({
              message: `Unknown path '${path}' for resource type ${resourceType}`,
              line: 0, // Will be calculated from offset
              column: 0,
              offset: expression.indexOf(path),
              length: path.length
            });
          }
        }
      }
    } catch (error: any) {
      errors.push(this.parseErrorFromException(error, expression));
    }
    
    return errors;
  }
  
  /**
   * Tokenize FHIRPath expression
   */
  private tokenize(expression: string): Token[] {
    const tokens: Token[] = [];
    
    // FHIRPath keywords
    const keywords = ['where', 'select', 'exists', 'all', 'empty', 'first', 'last', 'tail', 
                     'skip', 'take', 'union', 'combine', 'intersect', 'exclude', 'iif',
                     'and', 'or', 'xor', 'implies', 'is', 'as', 'in', 'contains'];
    
    // FHIRPath functions
    const functions = ['count', 'distinct', 'isDistinct', 'subsetOf', 'supersetOf',
                      'matches', 'indexOf', 'substring', 'startsWith', 'endsWith',
                      'contains', 'replace', 'length', 'toInteger', 'toDecimal',
                      'toString', 'toBoolean', 'toQuantity', 'toDateTime', 'toTime'];
    
    // Regular expressions for token patterns
    const patterns = [
      { regex: /\/\*[\s\S]*?\*\//g, type: TokenType.Comment },
      { regex: /\/\/.*$/gm, type: TokenType.Comment },
      { regex: /'([^'\\]|\\.)*'/g, type: TokenType.String },
      { regex: /\b\d+(\.\d+)?\b/g, type: TokenType.Number },
      { regex: /\b(true|false)\b/g, type: TokenType.Keyword },
      { regex: /[+\-*\/<>=!]+/g, type: TokenType.Operator },
      { regex: /[()[\]{},.]/g, type: TokenType.Punctuation },
      { regex: /\b[a-zA-Z_][a-zA-Z0-9_]*\b/g, type: TokenType.Identifier }
    ];
    
    // Implementation would parse and classify tokens
    // This is a simplified version - real implementation would use
    // proper lexical analysis
    
    return tokens;
  }
  
  private parseErrorFromException(error: any, expression: string): ParseError {
    // Extract error position from FHIRPath parser error
    const match = error.message?.match(/at position (\d+)/);
    const offset = match ? parseInt(match[1]) : 0;
    
    return {
      message: error.message || 'Parse error',
      line: this.offsetToLine(expression, offset),
      column: this.offsetToColumn(expression, offset),
      offset,
      length: 1
    };
  }
  
  private offsetToLine(text: string, offset: number): number {
    return text.substring(0, offset).split('\n').length - 1;
  }
  
  private offsetToColumn(text: string, offset: number): number {
    const lines = text.substring(0, offset).split('\n');
    return lines[lines.length - 1].length;
  }
}
```

### 3. Diagnostic Provider Implementation

```typescript
// server/src/providers/DiagnosticProvider.ts
import {
  Diagnostic,
  DiagnosticSeverity,
  Range,
  Position
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { FHIRPathService } from '../services/FHIRPathService';

export class DiagnosticProvider {
  constructor(private fhirPathService: FHIRPathService) {}
  
  async provideDiagnostics(document: TextDocument): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();
    
    // Parse the entire document
    const parseResult = this.fhirPathService.parse(text);
    
    // Convert parse errors to diagnostics
    for (const error of parseResult.errors) {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: Position.create(error.line, error.column),
          end: Position.create(error.line, error.column + error.length)
        },
        message: error.message,
        source: 'fhirpath'
      });
    }
    
    // Additional validation
    const validationErrors = this.fhirPathService.validate(text);
    for (const error of validationErrors) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: document.positionAt(error.offset),
          end: document.positionAt(error.offset + error.length)
        },
        message: error.message,
        source: 'fhirpath'
      });
    }
    
    return diagnostics;
  }
}
```

### 4. Semantic Token Provider

```typescript
// server/src/providers/SemanticTokenProvider.ts
import {
  SemanticTokens,
  SemanticTokensBuilder,
  Position
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { FHIRPathService, TokenType } from '../services/FHIRPathService';

export class SemanticTokenProvider {
  private tokenTypeMap = new Map<TokenType, number>([
    [TokenType.Function, 0],     // 'function'
    [TokenType.Identifier, 1],   // 'parameter'
    [TokenType.Identifier, 2],   // 'variable'
    [TokenType.Identifier, 3],   // 'property'
    [TokenType.Operator, 4],     // 'operator'
    [TokenType.Keyword, 5],      // 'keyword'
    [TokenType.String, 6],       // 'string'
    [TokenType.Number, 7]        // 'number'
  ]);
  
  constructor(
    private fhirPathService: FHIRPathService,
    private legend: { tokenTypes: string[], tokenModifiers: string[] }
  ) {}
  
  provideSemanticTokens(document: TextDocument): SemanticTokens {
    const text = document.getText();
    const builder = new SemanticTokensBuilder();
    
    const parseResult = this.fhirPathService.parse(text);
    
    if (parseResult.tokens) {
      for (const token of parseResult.tokens) {
        const position = document.positionAt(token.start);
        const length = token.end - token.start;
        const tokenType = this.tokenTypeMap.get(token.type) || 0;
        
        builder.push(
          position.line,
          position.character,
          length,
          tokenType,
          0 // no modifiers for now
        );
      }
    }
    
    return builder.build();
  }
}
```

## VS Code Extension Client

### 1. Extension Activation

```typescript
// client/src/extension.ts
import * as path from 'path';
import { 
  workspace, 
  ExtensionContext,
  window,
  commands
} from 'vscode';

import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind
} from 'vscode-languageclient/node';

let client: LanguageClient;

export function activate(context: ExtensionContext) {
  // Server module path
  const serverModule = context.asAbsolutePath(
    path.join('server', 'out', 'server.js')
  );
  
  // Debug options for the server
  const debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };
  
  // Server options
  const serverOptions: ServerOptions = {
    run: { 
      module: serverModule, 
      transport: TransportKind.ipc 
    },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: debugOptions
    }
  };
  
  // Client options
  const clientOptions: LanguageClientOptions = {
    // Register for .fhirpath files
    documentSelector: [
      { scheme: 'file', language: 'fhirpath' },
      { scheme: 'untitled', language: 'fhirpath' }
    ],
    synchronize: {
      // Notify server about file changes to .fhirpath files
      fileEvents: workspace.createFileSystemWatcher('**/*.fhirpath'),
      // Synchronize configuration
      configurationSection: 'fhirpath'
    },
    // Middleware for additional processing
    middleware: {
      // Future: Intercept completion requests
      provideCompletionItem: async (document, position, context, token, next) => {
        // Add custom logic here
        return next(document, position, context, token);
      }
    }
  };
  
  // Create and start the client
  client = new LanguageClient(
    'fhirpathLanguageServer',
    'FHIRPath Language Server',
    serverOptions,
    clientOptions
  );
  
  // Register additional commands
  const disposable = commands.registerCommand('fhirpath.validateExpression', () => {
    window.showInformationMessage('Validating FHIRPath expression...');
  });
  
  context.subscriptions.push(disposable);
  
  // Start the client
  client.start();
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
```

### 2. Extension Manifest (package.json)

```json
{
  "name": "fhirpath-lsp",
  "displayName": "FHIRPath Language Support",
  "description": "Language support for FHIRPath expressions",
  "version": "0.1.0",
  "engines": {
    "vscode": "^1.84.0"
  },
  "categories": ["Programming Languages"],
  "activationEvents": [
    "onLanguage:fhirpath"
  ],
  "main": "./client/out/extension",
  "contributes": {
    "languages": [{
      "id": "fhirpath",
      "aliases": ["FHIRPath", "fhirpath"],
      "extensions": [".fhirpath", ".fhir"],
      "configuration": "./language-configuration.json"
    }],
    "grammars": [{
      "language": "fhirpath",
      "scopeName": "source.fhirpath",
      "path": "./syntaxes/fhirpath.tmGrammar.json"
    }],
    "configuration": {
      "type": "object",
      "title": "FHIRPath",
      "properties": {
        "fhirpath.validate.enable": {
          "scope": "resource",
          "type": "boolean",
          "default": true,
          "description": "Enable/disable FHIRPath validation"
        },
        "fhirpath.trace.server": {
          "scope": "window",
          "type": "string",
          "enum": ["off", "messages", "verbose"],
          "default": "off",
          "description": "Traces the communication between VS Code and the language server"
        },
        "fhirpath.fhirVersion": {
          "scope": "resource",
          "type": "string",
          "enum": ["R4", "STU3", "DSTU2"],
          "default": "R4",
          "description": "FHIR version for validation"
        }
      }
    },
    "commands": [{
      "command": "fhirpath.validateExpression",
      "title": "Validate FHIRPath Expression"
    }]
  }
}
```

## TextMate Grammar Implementation

### 1. Complete FHIRPath Grammar

```json
{
  "$schema": "https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json",
  "name": "FHIRPath",
  "scopeName": "source.fhirpath",
  "patterns": [
    { "include": "#comments" },
    { "include": "#keywords" },
    { "include": "#operators" },
    { "include": "#functions" },
    { "include": "#strings" },
    { "include": "#numbers" },
    { "include": "#identifiers" },
    { "include": "#punctuation" }
  ],
  "repository": {
    "comments": {
      "patterns": [
        {
          "name": "comment.line.double-slash.fhirpath",
          "match": "//.*$"
        },
        {
          "name": "comment.block.fhirpath",
          "begin": "/\\*",
          "end": "\\*/"
        }
      ]
    },
    "keywords": {
      "patterns": [
        {
          "name": "keyword.control.fhirpath",
          "match": "\\b(where|select|exists|all|any|empty|first|last|tail|skip|take|distinct|iif)\\b"
        },
        {
          "name": "keyword.operator.logical.fhirpath",
          "match": "\\b(and|or|xor|implies|not)\\b"
        },
        {
          "name": "keyword.operator.type.fhirpath",
          "match": "\\b(is|as)\\b"
        },
        {
          "name": "constant.language.fhirpath",
          "match": "\\b(true|false|null)\\b"
        }
      ]
    },
    "operators": {
      "patterns": [
        {
          "name": "keyword.operator.arithmetic.fhirpath",
          "match": "[+\\-*/]"
        },
        {
          "name": "keyword.operator.comparison.fhirpath",
          "match": "(<=?|>=?|!=?|~)"
        },
        {
          "name": "keyword.operator.union.fhirpath",
          "match": "\\|"
        },
        {
          "name": "keyword.operator.assignment.fhirpath",
          "match": "="
        }
      ]
    },
    "functions": {
      "patterns": [
        {
          "name": "entity.name.function.fhirpath",
          "match": "\\b(count|sum|min|max|avg|distinct|isDistinct|subsetOf|supersetOf|matches|indexOf|substring|startsWith|endsWith|contains|replace|length|toInteger|toDecimal|toString|toBoolean|toQuantity|toDateTime|toTime|today|now|timeOfDay|year|month|day|hour|minute|second|millisecond|date|dateTime|time|duration|between|toString|toQuantity|convertsToBoolean|convertsToInteger|convertsToDecimal|convertsToString|convertsToQuantity|convertsToDateTime|convertsToTime|convertsToDate|round|sqrt|abs|ceiling|exp|floor|ln|log|power|truncate|aggregate|groupBy|where|select|repeat|trace)\\b(?=\\s*\\()"
        }
      ]
    },
    "strings": {
      "patterns": [
        {
          "name": "string.quoted.single.fhirpath",
          "begin": "'",
          "end": "'",
          "patterns": [
            {
              "name": "constant.character.escape.fhirpath",
              "match": "\\\\."
            }
          ]
        },
        {
          "name": "string.quoted.double.fhirpath",
          "begin": "\"",
          "end": "\"",
          "patterns": [
            {
              "name": "constant.character.escape.fhirpath",
              "match": "\\\\."
            }
          ]
        }
      ]
    },
    "numbers": {
      "patterns": [
        {
          "name": "constant.numeric.decimal.fhirpath",
          "match": "\\b\\d+\\.\\d+\\b"
        },
        {
          "name": "constant.numeric.integer.fhirpath",
          "match": "\\b\\d+\\b"
        }
      ]
    },
    "identifiers": {
      "patterns": [
        {
          "name": "variable.other.fhirpath",
          "match": "\\$[a-zA-Z_][a-zA-Z0-9_]*"
        },
        {
          "name": "entity.name.type.fhirpath",
          "match": "\\b[A-Z][a-zA-Z0-9_]*\\b"
        },
        {
          "name": "variable.other.property.fhirpath",
          "match": "\\b[a-z][a-zA-Z0-9_]*\\b"
        }
      ]
    },
    "punctuation": {
      "patterns": [
        {
          "name": "punctuation.definition.array.fhirpath",
          "match": "[\\[\\]]"
        },
        {
          "name": "punctuation.definition.parameters.fhirpath",
          "match": "[()]"
        },
        {
          "name": "punctuation.separator.fhirpath",
          "match": "[,.]"
        }
      ]
    }
  }
}
```

### 2. Language Configuration

```json
{
  "comments": {
    "lineComment": "//",
    "blockComment": ["/*", "*/"]
  },
  "brackets": [
    ["{", "}"],
    ["[", "]"],
    ["(", ")"]
  ],
  "autoClosingPairs": [
    ["{", "}"],
    ["[", "]"],
    ["(", ")"],
    ["\"", "\""],
    ["'", "'"]
  ],
  "surroundingPairs": [
    ["{", "}"],
    ["[", "]"],
    ["(", ")"],
    ["\"", "\""],
    ["'", "'"]
  ],
  "folding": {
    "markers": {
      "start": "^\\s*//\\s*#?region\\b",
      "end": "^\\s*//\\s*#?endregion\\b"
    }
  },
  "wordPattern": "(-?\\d*\\.\\d\\w*)|([^\\`\\~\\!\\@\\#\\%\\^\\&\\*\\(\\)\\-\\=\\+\\[\\{\\]\\}\\\\\\|\\;\\:\\'\\\"\\,\\.\\<\\>\\/\\?\\s]+)"
}
```

## Performance Optimization Strategies

### 1. Debounced Validation

```typescript
// server/src/utils/debounce.ts
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | undefined;
  
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = undefined;
      func(...args);
    };
    
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

// Usage in server
const debouncedValidate = debounce(
  (document: TextDocument) => validateDocument(document),
  300 // 300ms delay
);
```

### 2. Incremental Parsing Cache

```typescript
// server/src/services/DocumentCache.ts
import { LRUCache } from 'lru-cache';

interface CachedDocument {
  version: number;
  parseResult: ParseResult;
  diagnostics: Diagnostic[];
  tokens: SemanticTokens;
}

export class DocumentCache {
  private cache: LRUCache<string, CachedDocument>;
  
  constructor() {
    this.cache = new LRUCache<string, CachedDocument>({
      max: 100, // Maximum 100 documents
      ttl: 1000 * 60 * 5, // 5 minutes TTL
      updateAgeOnGet: true,
      updateAgeOnHas: true
    });
  }
  
  get(uri: string, version: number): CachedDocument | undefined {
    const cached = this.cache.get(uri);
    if (cached && cached.version === version) {
      return cached;
    }
    return undefined;
  }
  
  set(uri: string, document: CachedDocument): void {
    this.cache.set(uri, document);
  }
  
  delete(uri: string): void {
    this.cache.delete(uri);
  }
  
  clear(): void {
    this.cache.clear();
  }
}
```

## Testing Strategy

### 1. Unit Tests for Parser Service

```typescript
// server/src/services/__tests__/FHIRPathService.test.ts
import { FHIRPathService } from '../FHIRPathService';

describe('FHIRPathService', () => {
  let service: FHIRPathService;
  
  beforeEach(() => {
    service = new FHIRPathService();
  });
  
  describe('parse', () => {
    it('should parse valid FHIRPath expressions', () => {
      const result = service.parse('Patient.name.given');
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    
    it('should handle syntax errors', () => {
      const result = service.parse('Patient.name[');
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Expected');
    });
    
    it('should tokenize complex expressions', () => {
      const result = service.parse('Patient.name.where(use = "official").given.first()');
      expect(result.success).toBe(true);
      expect(result.tokens).toBeDefined();
      expect(result.tokens!.length).toBeGreaterThan(0);
    });
  });
  
  describe('validate', () => {
    it('should validate paths against resource types', () => {
      const errors = service.validate('Patient.invalidPath', 'Patient');
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('Unknown path');
    });
  });
});
```

### 2. Integration Tests

```typescript
// client/src/test/integration/diagnostics.test.ts
import * as vscode from 'vscode';
import * as path from 'path';
import { getDocumentDiagnostics } from './helper';

suite('FHIRPath Diagnostics', () => {
  test('Should show error for invalid syntax', async () => {
    const docUri = vscode.Uri.file(
      path.join(__dirname, '..', 'fixtures', 'invalid.fhirpath')
    );
    
    await vscode.workspace.openTextDocument(docUri);
    
    // Wait for diagnostics
    const diagnostics = await getDocumentDiagnostics(docUri, 1000);
    
    assert.strictEqual(diagnostics.length, 1);
    assert.strictEqual(diagnostics[0].severity, vscode.DiagnosticSeverity.Error);
  });
});
```

## Configuration and Settings

### 1. VS Code Settings Schema

```json
{
  "fhirpath.validate.enable": {
    "type": "boolean",
    "default": true,
    "description": "Enable/disable real-time validation"
  },
  "fhirpath.validate.delay": {
    "type": "number",
    "default": 300,
    "description": "Delay in milliseconds before validation triggers"
  },
  "fhirpath.semantic.enable": {
    "type": "boolean",
    "default": true,
    "description": "Enable semantic highlighting"
  },
  "fhirpath.completion.snippets": {
    "type": "boolean",
    "default": true,
    "description": "Enable snippet suggestions in completion"
  },
  "fhirpath.fhirVersion": {
    "type": "string",
    "enum": ["R4", "STU3", "DSTU2"],
    "default": "R4",
    "description": "FHIR version for validation and completion"
  }
}
```

## Build and Development Scripts

### 1. ESBuild Configuration

```javascript
// esbuild.js
const esbuild = require('esbuild');

// Build client
esbuild.build({
  entryPoints: ['client/src/extension.ts'],
  bundle: true,
  outfile: 'client/out/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node16',
  sourcemap: true,
  minify: process.env.NODE_ENV === 'production'
}).catch(() => process.exit(1));

// Build server
esbuild.build({
  entryPoints: ['server/src/server.ts'],
  bundle: true,
  outfile: 'server/out/server.js',
  external: ['vscode-languageserver'],
  format: 'cjs',
  platform: 'node',
  target: 'node16',
  sourcemap: true,
  minify: process.env.NODE_ENV === 'production'
}).catch(() => process.exit(1));
```

### 2. Development Workflow

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Launch Extension",
      "type": "extensionHost",
      "request": "launch",
      "runtimeExecutable": "${execPath}",
      "args": [
        "--extensionDevelopmentPath=${workspaceFolder}"
      ],
      "outFiles": [
        "${workspaceFolder}/client/out/**/*.js",
        "${workspaceFolder}/server/out/**/*.js"
      ],
      "preLaunchTask": "npm: compile"
    },
    {
      "name": "Attach to Server",
      "type": "node",
      "request": "attach",
      "port": 6009,
      "restart": true,
      "outFiles": ["${workspaceFolder}/server/out/**/*.js"]
    }
  ],
  "compounds": [
    {
      "name": "Client + Server",
      "configurations": ["Launch Extension", "Attach to Server"]
    }
  ]
}
```

## Summary

This technical guide provides a complete implementation blueprint for the FHIRPath Language Server Protocol, including:

1. **Core Dependencies**: All necessary npm packages with specific versions
2. **Server Architecture**: Complete LSP server implementation with FHIRPath integration
3. **Parser Integration**: Detailed FHIRPath.js library usage and error handling
4. **TextMate Grammar**: Comprehensive syntax highlighting rules
5. **Performance Optimization**: Caching, debouncing, and incremental updates
6. **Testing Strategy**: Unit and integration test examples
7. **Build Configuration**: ESBuild setup for optimal bundling

The implementation leverages the official HL7 FHIRPath.js library and Microsoft's vscode-languageserver-node packages, ensuring compatibility and maintainability.