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
- **Parser**: HL7 FHIRPath.js (official implementation)
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
| LSP with FHIRPath.js | Reuses official parser, portable | More complex setup | ✅ Selected |

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
│  │  - HL7 FHIRPath.js      - Error Recovery           │   │
│  │  - Token Extraction     - AST Analysis             │   │
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
    "fhirpath": "^3.15.2",
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
import * as fhirpath from 'fhirpath';
import r4_model from 'fhirpath/fhir-context/r4';

export interface ParseResult {
  success: boolean;
  ast?: any;
  errors: ParseError[];
  tokens?: Token[];
}

export class FHIRPathService {
  private compiledCache = new Map<string, any>();
  
  parse(expression: string): ParseResult {
    try {
      const compiled = fhirpath.compile(expression, r4_model);
      this.compiledCache.set(expression, compiled);
      
      // Extract tokens through lexical analysis
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
  
  private tokenize(expression: string): Token[] {
    // Implementation using regex patterns for FHIRPath tokens
    const patterns = [
      { regex: /'([^'\\]|\\.)*'/g, type: TokenType.String },
      { regex: /\b\d+(\.\d+)?\b/g, type: TokenType.Number },
      { regex: /\b(true|false|null)\b/g, type: TokenType.Keyword },
      { regex: /\b(where|select|exists|all|empty|first|last)\b/g, type: TokenType.Keyword },
      { regex: /\b(count|distinct|union|intersect)\b(?=\s*\()/g, type: TokenType.Function },
      { regex: /[+\-*\/<>=!]+/g, type: TokenType.Operator },
      { regex: /[()[\]{},.]/g, type: TokenType.Punctuation },
      { regex: /\b[a-zA-Z_][a-zA-Z0-9_]*\b/g, type: TokenType.Identifier }
    ];
    
    // Process patterns and extract tokens with positions
    // ... implementation details
  }
}
```

#### 1.2 Diagnostic Provider

```typescript
// server/src/providers/DiagnosticProvider.ts
export class DiagnosticProvider {
  constructor(private fhirPathService: FHIRPathService) {}
  
  async provideDiagnostics(document: TextDocument): Promise<Diagnostic[]> {
    const text = document.getText();
    const parseResult = this.fhirPathService.parse(text);
    
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
}
```

#### 1.3 TextMate Grammar

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
    // ... more functions
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
    [TokenType.Function, 0],
    [TokenType.Property, 3],
    [TokenType.Operator, 4],
    [TokenType.Keyword, 5],
    [TokenType.String, 6],
    [TokenType.Number, 7]
  ]);
  
  provideSemanticTokens(document: TextDocument): SemanticTokens {
    const builder = new SemanticTokensBuilder();
    const parseResult = this.fhirPathService.parse(document.getText());
    
    if (parseResult.tokens) {
      for (const token of parseResult.tokens) {
        const position = document.positionAt(token.start);
        builder.push(
          position.line,
          position.character,
          token.end - token.start,
          this.tokenTypeMap.get(token.type) || 0,
          0
        );
      }
    }
    
    return builder.build();
  }
}
```

## Performance Optimization

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

## Timeline and Milestones

| Phase | Duration | Deliverables | Success Criteria |
|-------|----------|--------------|------------------|
| Phase 1 | 3 weeks | - Basic LSP server<br>- Syntax highlighting<br>- Error detection | - .fhirpath files recognized<br>- Syntax errors shown<br>- Keywords highlighted |
| Phase 2 | 2 weeks | - Auto-completion<br>- Function signatures<br>- Context awareness | - Function suggestions work<br>- Completion on dot operator<br>- < 200ms response time |
| Phase 3 | 3 weeks | - Semantic tokens<br>- Hover information<br>- Performance optimization | - Enhanced highlighting<br>- Function documentation on hover<br>- < 100ms parse time |

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

This comprehensive plan combines the best architectural insights from multiple analyses to create a robust, performant, and extensible FHIRPath language support system. By leveraging the official HL7 FHIRPath.js library and following LSP best practices, we ensure compatibility, reliability, and future-proofing. The phased approach allows for iterative development with clear milestones and measurable success criteria.

The implementation prioritizes developer experience through intelligent features while maintaining the flexibility to support multiple editors through the Language Server Protocol. With proper caching, debouncing, and optimization strategies, the solution will provide responsive, real-time feedback even for complex FHIRPath expressions.