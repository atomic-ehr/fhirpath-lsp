# FHIRPath Language Server Protocol: Comprehensive Implementation Plan

## Executive Summary

This document synthesizes the best ideas from multiple architectural analyses to create a comprehensive implementation plan for a FHIRPath Language Server Protocol (LSP) in TypeScript, integrated with Visual Studio Code. The plan combines detailed technical specifications, practical implementation guidance, and strategic phasing to deliver a robust, extensible language support solution.

## Project Overview

### Vision
Create a professional-grade FHIRPath language support system that provides developers with intelligent code editing features including syntax highlighting, real-time error detection, auto-completion, and semantic analysis.

### Key Objectives
1. **Phase 1**: Syntax highlighting and syntactic error detection
2. **Phase 2**: Context-aware auto-completion
3. **Phase 3**: Advanced features (hover, go-to-definition, refactoring)
4. **Cross-Editor Compatibility**: Design for LSP portability beyond VS Code

### Technology Stack
- **Parser**: atomic-ehr/fhirpath (TypeScript implementation with AST support)
- **LSP Framework**: Microsoft vscode-languageserver-node
- **Build System**: TypeScript with ESBuild
- **Testing**: Jest + VS Code Extension Test Framework
- **Runtime**: Bun (preferred) or Node.js

## Architecture Decision Record

### Decision: LSP-Based Architecture

**Selected Approach**: Implement a TypeScript-based Language Server using LSP with separate client (VS Code extension) and server components.

**Rationale**:
- **Portability**: LSP enables support for multiple editors (VS Code, Vim, Emacs, etc.)
- **Separation of Concerns**: Client handles editor integration; server handles language intelligence
- **Performance**: Server runs in separate process, preventing UI blocking
- **Maintainability**: Standard protocol simplifies debugging and testing

**Alternatives Considered**:
| Alternative | Pros | Cons | Decision |
|-------------|------|------|----------|
| Direct VS Code Extension | Simpler initial setup | Not portable to other editors | ❌ Rejected |
| TextMate Grammar Only | Quick implementation | No dynamic features | ❌ Rejected |
| Custom Parser Implementation | Full control | Duplicates existing work | ❌ Rejected |
| LSP with atomic-ehr/fhirpath | TypeScript native, AST access, portable | More complex setup | ✅ Selected |

## Technical Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                        VS Code                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │            FHIRPath Extension (Client)               │   │
│  │  - Language Client                                   │   │
│  │  - Configuration Management                          │   │
│  │  - Command Registration                              │   │
│  └──────────────────┬──────────────────────────────────┘   │
│                     │ LSP Protocol (JSON-RPC)               │
└─────────────────────┼───────────────────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────────────────┐
│              FHIRPath Language Server                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  Core Services                       │   │
│  │  - Document Manager      - Parser Service            │   │
│  │  - Diagnostic Provider   - Semantic Token Provider   │   │
│  │  - Completion Provider   - Cache Manager             │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              FHIRPath Parser Layer                   │   │
│  │  - atomic-ehr/fhirpath  - Error Recovery           │   │
│  │  - AST Analysis         - Type Analysis            │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Project Structure

```
fhirpath-lsp/
├── client/                        # VS Code Extension
│   ├── src/
│   │   ├── extension.ts          # Extension entry point
│   │   ├── config/               # Configuration handling
│   │   └── test/                 # Extension tests
│   ├── package.json              # Extension manifest
│   └── tsconfig.json
├── server/                        # Language Server
│   ├── src/
│   │   ├── server.ts            # LSP server entry
│   │   ├── parser/              # FHIRPath parsing layer
│   │   │   ├── FHIRPathService.ts
│   │   │   └── ErrorRecovery.ts
│   │   ├── providers/           # LSP feature providers
│   │   │   ├── DiagnosticProvider.ts
│   │   │   ├── SemanticTokenProvider.ts
│   │   │   ├── CompletionProvider.ts
│   │   │   └── HoverProvider.ts
│   │   ├── services/            # Core services
│   │   │   ├── DocumentService.ts
│   │   │   ├── CacheManager.ts
│   │   │   └── ValidationService.ts
│   │   └── utils/               # Utilities
│   ├── package.json
│   └── tsconfig.json
├── shared/                       # Shared types/utilities
│   └── src/
│       └── types.ts
├── syntaxes/
│   └── fhirpath.tmGrammar.json  # TextMate grammar
├── test/                         # Integration tests
│   ├── fixtures/
│   └── e2e/
├── docs/                         # Documentation
├── package.json                  # Workspace configuration
├── bun.lockb                     # Bun lock file
└── README.md
```

## Implementation Details

### Core Dependencies

```json
{
  "devDependencies": {
    "@types/vscode": "^1.84.0",
    "@vscode/test-electron": "^2.3.8",
    "esbuild": "^0.19.11",
    "typescript": "^5.3.3",
    "@types/node": "^20.11.0",
    "jest": "^29.7.0",
    "@types/jest": "^29.5.11"
  },
  "dependencies": {
    "vscode-languageserver": "^9.0.1",
    "vscode-languageserver-textdocument": "^1.0.11",
    "vscode-languageserver-types": "^3.17.5",
    "vscode-languageclient": "^9.0.1",
    "@atomic-ehr/fhirpath": "^1.0.0",
    "@types/fhir": "^0.0.41",
    "lodash": "^4.17.21",
    "lru-cache": "^10.1.0"
  }
}
```

### Phase 1: Foundation (Weeks 1-3)

#### 1.1 Parser Integration Layer

```typescript
// server/src/parser/FHIRPathService.ts
import * as fhirpath from '@atomic-ehr/fhirpath';

export interface ParseResult {
  success: boolean;
  ast?: fhirpath.FHIRPathExpression;
  errors: ParseError[];
  tokens?: Token[];
}

export interface ParseError {
  message: string;
  line: number;
  column: number;
  offset: number;
  length: number;
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
  Boolean = 'boolean',
  Punctuation = 'punctuation'
}

export class FHIRPathService {
  private compiledCache = new Map<string, any>();
  
  parse(expression: string): ParseResult {
    try {
      // Parse the expression to get AST
      const ast = fhirpath.parse(expression);
      
      // Compile for caching
      const compiled = fhirpath.compile(ast);
      this.compiledCache.set(expression, compiled);
      
      // Extract tokens from AST
      const tokens = this.extractTokensFromAST(ast, expression);
      
      return {
        success: true,
        ast,
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
  
  analyze(expression: string | fhirpath.FHIRPathExpression): any {
    // Use the analyze function for type analysis
    return fhirpath.analyze(expression);
  }
  
  private extractTokensFromAST(ast: fhirpath.FHIRPathExpression, expression: string): Token[] {
    const tokens: Token[] = [];
    
    // Walk the AST and extract tokens
    const walkAST = (node: any, parent?: any) => {
      if (!node) return;
      
      // Determine token type based on node type
      let tokenType: TokenType | null = null;
      let value: string | null = null;
      
      switch (node.type) {
        case 'Identifier':
          tokenType = TokenType.Identifier;
          value = node.name;
          break;
        case 'FunctionCall':
          tokenType = TokenType.Function;
          value = node.name;
          break;
        case 'StringLiteral':
          tokenType = TokenType.String;
          value = node.value;
          break;
        case 'NumberLiteral':
          tokenType = TokenType.Number;
          value = node.value.toString();
          break;
        case 'BooleanLiteral':
          tokenType = TokenType.Boolean;
          value = node.value.toString();
          break;
        case 'BinaryOperator':
          tokenType = TokenType.Operator;
          value = node.operator;
          break;
      }
      
      if (tokenType && value && node.location) {
        tokens.push({
          type: tokenType,
          value,
          start: node.location.start.offset,
          end: node.location.end.offset,
          line: node.location.start.line - 1,
          column: node.location.start.column - 1
        });
      }
      
      // Recursively walk child nodes
      if (node.children) {
        for (const child of node.children) {
          walkAST(child, node);
        }
      }
    };
    
    walkAST(ast);
    return tokens.sort((a, b) => a.start - b.start);
  }
  
  private parseErrorFromException(error: any, expression: string): ParseError {
    // Check if error has location information
    if (error.location) {
      return {
        message: error.message || 'Parse error',
        line: error.location.start.line - 1,
        column: error.location.start.column - 1,
        offset: error.location.start.offset,
        length: error.location.end.offset - error.location.start.offset
      };
    }
    
    // Fallback to regex parsing
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

#### 1.2 Server Initialization

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
  SemanticTokensBuilder
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';

// Create connection using Node IPC
const connection = createConnection(ProposedFeatures.all);

// Document manager using the new text document API
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// Token types and modifiers for semantic highlighting
const tokenTypes = ['function', 'parameter', 'variable', 'property', 'operator', 'keyword', 'string', 'number', 'boolean', 'comment'];
const tokenModifiers = ['declaration', 'readonly', 'deprecated', 'modification', 'documentation', 'defaultLibrary'];

connection.onInitialize((params: InitializeParams): InitializeResult => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      diagnosticProvider: {
        interFileDependencies: false,
        workspaceDiagnostics: false
      },
      semanticTokensProvider: {
        legend: {
          tokenTypes,
          tokenModifiers
        },
        full: true,
        range: true
      },
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: ['.', '[', '(', ' ', '"', "'"]
      },
      hoverProvider: true,
      definitionProvider: true
    }
  };
});

// Document change handling with validation
documents.onDidChangeContent(change => {
  validateTextDocument(change.document);
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  const diagnostics = await diagnosticProvider.provideDiagnostics(textDocument);
  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

documents.listen(connection);
connection.listen();
```

#### 1.3 Diagnostic Provider

```typescript
// server/src/providers/DiagnosticProvider.ts
interface IValidator {
  validate(ast: any, document: TextDocument): Promise<Diagnostic[]>;
}

export class DiagnosticProvider {
  private validators: IValidator[] = [
    new SyntaxValidator(),
    new PathValidator(),
    new FunctionValidator(),
    new TypeValidator()
  ];
  
  constructor(private fhirPathService: FHIRPathService) {}
  
  async provideDiagnostics(document: TextDocument): Promise<Diagnostic[]> {
    const text = document.getText();
    const diagnostics: Diagnostic[] = [];
    
    // First, check for syntax errors
    const parseResult = this.fhirPathService.parse(text);
    
    if (!parseResult.success) {
      return parseResult.errors.map(error => ({
        severity: DiagnosticSeverity.Error,
        range: {
          start: document.positionAt(error.offset),
          end: document.positionAt(error.offset + error.length)
        },
        message: error.message,
        source: 'fhirpath',
        code: error.code
      }));
    }
    
    // Run semantic validators
    for (const validator of this.validators) {
      const issues = await validator.validate(parseResult.ast, document);
      diagnostics.push(...issues);
    }
    
    return diagnostics;
  }
}
```

#### 1.4 TextMate Grammar

```json
{
  "scopeName": "source.fhirpath",
  "patterns": [
    {
      "name": "keyword.control.fhirpath",
      "match": "\\b(where|select|exists|all|any|empty|first|last|tail|skip|take|distinct|iif)\\b"
    },
    {
      "name": "entity.name.function.fhirpath",
      "match": "\\b(count|sum|min|max|avg|distinct|matches|contains|startsWith|endsWith)\\b(?=\\s*\\()"
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

### Phase 2: Auto-completion (Weeks 4-5)

#### 2.1 Completion Provider

```typescript
// server/src/providers/CompletionProvider.ts
export class CompletionProvider {
  private functionSignatures = new Map<string, CompletionItem>([
    ['where', {
      label: 'where',
      kind: CompletionItemKind.Function,
      detail: 'where(criteria: expression) -> collection',
      documentation: 'Filters the collection based on criteria'
    }],
    ['select', {
      label: 'select',
      kind: CompletionItemKind.Function,
      detail: 'select(projection: expression) -> collection',
      documentation: 'Projects each item in the collection'
    }],
    ['exists', {
      label: 'exists',
      kind: CompletionItemKind.Function,
      detail: 'exists(criteria?: expression) -> boolean',
      documentation: 'Returns true if any element matches criteria'
    }],
    ['count', {
      label: 'count',
      kind: CompletionItemKind.Function,
      detail: 'count() -> integer',
      documentation: 'Returns the number of items in the collection'
    }],
    ['first', {
      label: 'first',
      kind: CompletionItemKind.Function,
      detail: 'first() -> item',
      documentation: 'Returns the first item in the collection'
    }],
    ['last', {
      label: 'last',
      kind: CompletionItemKind.Function,
      detail: 'last() -> item',
      documentation: 'Returns the last item in the collection'
    }],
    ['matches', {
      label: 'matches',
      kind: CompletionItemKind.Function,
      detail: 'matches(regex: string) -> boolean',
      documentation: 'Tests if the string matches the regular expression'
    }],
    ['contains', {
      label: 'contains',
      kind: CompletionItemKind.Function,
      detail: 'contains(substring: string) -> boolean',
      documentation: 'Tests if the string contains the substring'
    }],
    ['startsWith', {
      label: 'startsWith',
      kind: CompletionItemKind.Function,
      detail: 'startsWith(prefix: string) -> boolean',
      documentation: 'Tests if the string starts with the prefix'
    }],
    ['endsWith', {
      label: 'endsWith',
      kind: CompletionItemKind.Function,
      detail: 'endsWith(suffix: string) -> boolean',
      documentation: 'Tests if the string ends with the suffix'
    }]
  ]);
  
  provideCompletions(
    document: TextDocument,
    position: Position,
    context: CompletionContext
  ): CompletionItem[] {
    const line = document.getText({
      start: { line: position.line, character: 0 },
      end: position
    });
    
    // Context-aware completion logic
    if (line.endsWith('.')) {
      return this.getPropertyCompletions(line);
    }
    
    return Array.from(this.functionSignatures.values());
  }
}
```

### Phase 3: Advanced Features (Weeks 6-8)

#### 3.1 Semantic Token Provider

```typescript
// server/src/providers/SemanticTokenProvider.ts
export class SemanticTokenProvider {
  private tokenTypeMap = new Map<TokenType, number>([
    [TokenType.Function, 0],     // 'function'
    [TokenType.Identifier, 1],   // 'parameter'
    [TokenType.Identifier, 2],   // 'variable'  
    [TokenType.Identifier, 3],   // 'property'
    [TokenType.Operator, 4],     // 'operator'
    [TokenType.Keyword, 5],      // 'keyword'
    [TokenType.String, 6],       // 'string'
    [TokenType.Number, 7],       // 'number'
    [TokenType.Boolean, 8]       // 'boolean'
  ]);
  
  provideSemanticTokens(document: TextDocument): SemanticTokens {
    const builder = new SemanticTokensBuilder();
    const parseResult = this.fhirPathService.parse(document.getText());
    
    if (parseResult.success && parseResult.tokens) {
      // Use AST-extracted tokens for accurate highlighting
      for (const token of parseResult.tokens) {
        const position = document.positionAt(token.start);
        builder.push(
          position.line,
          position.character,
          token.end - token.start,
          this.tokenTypeMap.get(token.type) || 0,
          0 // no modifiers for now
        );
      }
    } else {
      // Fallback to regex-based tokenization if AST parsing fails
      this.fallbackTokenization(document.getText(), builder);
    }
    
    return builder.build();
  }
  
  private fallbackTokenization(text: string, builder: SemanticTokensBuilder): void {
    // Simple regex-based tokenization for partial syntax highlighting
    const patterns = [
      { regex: /\b(where|select|exists|all|empty|first|last)\b/g, type: 5 }, // keywords
      { regex: /\b(true|false|null)\b/g, type: 8 }, // booleans
      { regex: /'([^'\\]|\\.)*'/g, type: 6 }, // strings
      { regex: /\b\d+(\.\d+)?\b/g, type: 7 }, // numbers
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.regex.exec(text)) !== null) {
        const lines = text.substring(0, match.index).split('\n');
        const line = lines.length - 1;
        const character = lines[line].length;
        
        builder.push(line, character, match[0].length, pattern.type, 0);
      }
    }
  }
}
```

### Extension Client Implementation

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
  const serverModule = context.asAbsolutePath(
    path.join('server', 'out', 'server.js')
  );
  
  const debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };
  
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
  
  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: 'file', language: 'fhirpath' },
      { scheme: 'untitled', language: 'fhirpath' }
    ],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher('**/*.fhirpath'),
      configurationSection: 'fhirpath'
    },
    middleware: {
      provideCompletionItem: async (document, position, context, token, next) => {
        // Add custom logic here if needed
        return next(document, position, context, token);
      }
    }
  };
  
  client = new LanguageClient(
    'fhirpathLanguageServer',
    'FHIRPath Language Server',
    serverOptions,
    clientOptions
  );
  
  // Register commands
  const validateCommand = commands.registerCommand('fhirpath.validateExpression', () => {
    const editor = window.activeTextEditor;
    if (editor && editor.document.languageId === 'fhirpath') {
      window.showInformationMessage('Validating FHIRPath expression...');
      // Trigger validation
      client.sendRequest('fhirpath/validate', {
        uri: editor.document.uri.toString(),
        content: editor.document.getText()
      });
    }
  });
  
  context.subscriptions.push(validateCommand);
  client.start();
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
```

## Performance Optimization

### Error Recovery Strategy

```typescript
// server/src/parser/ErrorRecovery.ts
export class ErrorRecoveryParser {
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
  
  private findRecoveryPoints(text: string): number[] {
    // Find natural break points in FHIRPath expressions
    const points: number[] = [0];
    const patterns = [
      /\s+and\s+/g,
      /\s+or\s+/g,
      /\s*\|\s*/g,  // Union operator
      /\s*\.\s*/g   // Path separator
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        points.push(match.index);
      }
    }
    
    return [...new Set(points)].sort((a, b) => a - b);
  }
}
```

### Caching Strategy

```typescript
// server/src/services/CacheManager.ts
import { LRUCache } from 'lru-cache';

export class CacheManager {
  private parseCache = new LRUCache<string, ParseResult>({ 
    max: 100,
    ttl: 1000 * 60 * 5 // 5 minutes
  });
  
  private documentCache = new WeakMap<TextDocument, DocumentState>();
  
  getCachedParse(content: string): ParseResult | undefined {
    return this.parseCache.get(content);
  }
  
  setCachedParse(content: string, result: ParseResult): void {
    this.parseCache.set(content, result);
  }
}
```

### Debouncing

```typescript
// server/src/utils/debounce.ts
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | undefined;
  
  return function executedFunction(...args: Parameters<T>) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// Usage
const debouncedValidate = debounce(validateDocument, 300);
```

## Testing Strategy

### Unit Tests

```typescript
// server/src/parser/__tests__/FHIRPathService.test.ts
describe('FHIRPathService', () => {
  let service: FHIRPathService;
  
  beforeEach(() => {
    service = new FHIRPathService();
  });
  
  test('parses valid expressions', () => {
    const result = service.parse('Patient.name.given');
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
  
  test('handles syntax errors gracefully', () => {
    const result = service.parse('Patient.name[');
    expect(result.success).toBe(false);
    expect(result.errors[0].message).toContain('Expected');
  });
});
```

### Integration Tests

```typescript
// test/e2e/diagnostics.test.ts
suite('FHIRPath Diagnostics', () => {
  test('shows error for invalid syntax', async () => {
    const docUri = vscode.Uri.file(
      path.join(__dirname, '../fixtures/invalid.fhirpath')
    );
    
    await vscode.workspace.openTextDocument(docUri);
    const diagnostics = await getDiagnostics(docUri, 1000);
    
    assert.strictEqual(diagnostics.length, 1);
    assert.strictEqual(diagnostics[0].severity, vscode.DiagnosticSeverity.Error);
  });
});
```

## Build and Deployment

### ESBuild Configuration

```javascript
// esbuild.js
const esbuild = require('esbuild');

async function build() {
  // Build client
  await esbuild.build({
    entryPoints: ['client/src/extension.ts'],
    bundle: true,
    outfile: 'client/out/extension.js',
    external: ['vscode'],
    format: 'cjs',
    platform: 'node',
    target: 'node16',
    sourcemap: true,
    minify: process.env.NODE_ENV === 'production'
  });
  
  // Build server
  await esbuild.build({
    entryPoints: ['server/src/server.ts'],
    bundle: true,
    outfile: 'server/out/server.js',
    external: ['vscode-languageserver'],
    format: 'cjs',
    platform: 'node',
    target: 'node16',
    sourcemap: true,
    minify: process.env.NODE_ENV === 'production'
  });
}

build().catch(() => process.exit(1));
```

### VS Code Extension Manifest

```json
{
  "name": "fhirpath-lsp",
  "displayName": "FHIRPath Language Support",
  "version": "0.1.0",
  "engines": {
    "vscode": "^1.84.0"
  },
  "categories": ["Programming Languages"],
  "activationEvents": ["onLanguage:fhirpath"],
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
        "fhirpath.validate.delay": {
          "scope": "resource",
          "type": "number",
          "default": 300,
          "description": "Delay in milliseconds before validation triggers"
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
          "description": "FHIR version for validation and completion"
        }
      }
    },
    "commands": [{
      "command": "fhirpath.validateExpression",
      "title": "FHIRPath: Validate Expression"
    }],
    "configurationDefaults": {
      "[fhirpath]": {
        "editor.semanticHighlighting.enabled": true
      }
    }
  }
}
```

### Language Configuration

```json
// language-configuration.json
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

### VS Code Debugging Configuration

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

## Timeline and Milestones

| Phase | Duration | Deliverables | Success Criteria | Estimated Hours |
|-------|----------|--------------|------------------|-----------------|
| Phase 1 | 3 weeks | - Basic LSP server<br>- Syntax highlighting<br>- Error detection<br>- TextMate grammar | - .fhirpath files recognized<br>- Syntax errors shown with line/column<br>- Keywords highlighted<br>- Basic operators colored | 40-50 hours |
| Phase 2 | 2 weeks | - Auto-completion<br>- Function signatures<br>- Context awareness<br>- Trigger characters | - Function suggestions work<br>- Completion on dot operator<br>- < 200ms response time<br>- All FHIRPath functions available | 30-40 hours |
| Phase 3 | 3 weeks | - Semantic tokens<br>- Hover information<br>- Performance optimization<br>- Error recovery | - Enhanced highlighting<br>- Function documentation on hover<br>- < 100ms parse time<br>- Partial parsing on errors | 30-40 hours |

**Total Estimated Effort**: 100-130 hours (80-120 development + 20-30 testing/documentation)

## Risk Mitigation

| Risk | Impact | Mitigation Strategy |
|------|--------|-------------------|
| FHIRPath.js API limitations | High | Create abstraction layer; consider ANTLR if needed |
| Performance issues with large files | Medium | Implement incremental parsing and caching |
| Cross-platform compatibility | Low | Test on Windows, Mac, Linux early |
| VS Code API changes | Low | Pin VS Code engine version; monitor changelog |

## Quality Assurance

### Code Quality Standards
- TypeScript strict mode enabled
- ESLint configuration for consistent style
- 80% minimum test coverage
- Automated CI/CD pipeline

### Performance Targets
- Parse time: < 100ms for typical expressions
- Completion response: < 200ms
- Memory usage: < 50MB for server process
- Startup time: < 2 seconds

## Future Enhancements

1. **FHIR Context Integration**: Load FHIR resource definitions for smarter completions
2. **Multi-File Support**: Cross-file references and workspace-wide analysis
3. **Debugging Support**: Step-through debugging of FHIRPath expressions
4. **Code Actions**: Quick fixes for common errors
5. **Snippet Support**: Pre-defined templates for common patterns
6. **Web Extension**: Support for VS Code web/github.dev

## Conclusion

This comprehensive plan combines the best architectural insights from multiple analyses to create a robust, performant, and extensible FHIRPath language support system. By leveraging the atomic-ehr/fhirpath library with its native TypeScript implementation and AST access, we ensure type safety, better error handling, and direct access to the parse tree for semantic analysis. The phased approach allows for iterative development with clear milestones and measurable success criteria.

The implementation prioritizes developer experience through intelligent features while maintaining the flexibility to support multiple editors through the Language Server Protocol. With proper caching, debouncing, and optimization strategies, the solution will provide responsive, real-time feedback even for complex FHIRPath expressions. The atomic-ehr/fhirpath library's built-in AST and type analysis capabilities make it ideal for providing rich language features like semantic highlighting and context-aware completions.