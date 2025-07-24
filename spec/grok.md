# Architectural Decision Record: Implementing FHIRPath LSP in TypeScript for VS Code Integration

## Status
Proposed

## Context
FHIRPath is a path-based navigation and extraction language used in healthcare for querying Fast Healthcare Interoperability Resources (FHIR). Developers working with FHIR often need IDE support for FHIRPath expressions, including syntax highlighting, error detection, and autocompletion. Visual Studio Code (VS Code) is a popular editor with extensible language support via the Language Server Protocol (LSP). We assume an existing TypeScript FHIRPath library provides parsing and syntactic analysis capabilities. The goal is to create an LSP server using this library and integrate it into VS Code as an extension for .fhirpath files. The first phase focuses on syntax highlighting and syntactic error highlighting; autocompletion will follow in later phases.

This ADR analyzes LSP and VS Code plugin aspects, documents key decisions, and outlines a 5-page implementation plan (structured for brevity while covering depth; approximate page count assumes standard formatting with 500 words/page).

## Decision
Implement a FHIRPath Language Server in TypeScript, leveraging the existing FHIRPath library for core parsing. Integrate it into VS Code via an extension that launches the server and associates it with .fhirpath files. Use LSP for features like semantic highlighting and diagnostics. This approach ensures cross-editor compatibility and reuse of existing TypeScript ecosystem tools.

## Alternatives Considered
- **Direct VS Code Extension Without LSP**: Build features natively in the extension using VS Code APIs. Pros: Simpler for VS Code-only support. Cons: Not reusable in other editors; duplicates effort if LSP is needed later. Rejected for lacking portability.
- **LSP in Another Language (e.g., Python or Java)**: Use libraries like LangChain or existing FHIRPath implementations. Pros: Potentially faster prototyping if better libraries exist. Cons: Requires inter-process communication overhead; TypeScript aligns with VS Code's Node.js runtime for easier debugging and deployment. Rejected for ecosystem mismatch.
- **Monaco Editor Integration Only**: Embed FHIRPath support in web-based editors. Pros: Lightweight for browser use. Cons: Doesn't address full VS Code needs. Rejected as insufficient.

| Alternative | Pros | Cons | Selected? |
|-------------|------|------|-----------|
| Direct VS Code Extension | Simple setup | Not portable | No |
| LSP in Python/Java | Mature libraries | Runtime mismatch | No |
| Monaco Only | Web-friendly | Limited scope | No |
| TypeScript LSP (Chosen) | Ecosystem fit, reusable | Development effort | Yes |

## Consequences
- **Positive**: Standardized protocol enables future expansions (e.g., to Vim or Eclipse); leverages existing FHIRPath library to minimize custom parsing code; TypeScript ensures type safety and easy maintenance.
- **Negative**: Initial setup requires implementing LSP interfaces; potential performance issues if the FHIRPath library is inefficient (mitigate via profiling).
- **Risks**: Dependency on the assumed library's quality; LSP version mismatches (use LSP 3.17 for stability). Mitigation: Unit test library integration early.
- **Trade-offs**: Focus on phase 1 features delays autocompletion but allows quicker MVP.

## Plan Overview
The plan spans 5 "pages" (sections below), covering analysis, design, implementation, testing, and deployment. Each "page" targets 400-600 words for conciseness. Timeline: 4-6 weeks for phase 1, assuming 2 developers.

### Page 1: Analysis of LSP and VS Code Plugin Aspects
LSP is a JSON-RPC-based protocol standardizing communication between editors (clients) and language tools (servers). Key aspects from the specification (LSP 3.17):

- **Base Protocol**: Uses JSON-RPC 2.0 with requests (e.g., initialize), responses, and notifications (e.g., textDocument/didChange). Headers include Content-Length for message framing.
- **Capabilities**: During initialization, client and server exchange capabilities (e.g., textDocumentSync: Incremental for efficient updates).
- **Text Synchronization**: Handles document open/close/change via notifications; server maintains document state.
- **Features**:
  - Diagnostics: Server publishes errors/warnings as arrays of Diagnostic objects (with range, severity, message).
  - Completion: Provides CompletionItem lists; supports resolve for details.
  - Highlighting: Semantic tokens for token-based coloring (e.g., keywords, operators).
  - Others: Hover, signature help, go-to-definition (phase 2+).
- **Lifecycle**: Initialize → Shutdown → Exit.

For VS Code plugins:
- Extensions are Node.js modules packaged as .vsix files.
- LSP Integration: Use vscode-languageclient (client) and vscode-languageserver (server) NPM packages.
- Architecture: Client (extension.ts) starts server process; registers for file types (e.g., onLanguage: fhirpath).
- Features in VS Code: Syntax highlighting via TextMate (.tmLanguage.json) or semantic (LSP); diagnostics appear in Problems panel.
- Extension Manifest (package.json): Defines activation events, contributions (e.g., languages: {id: 'fhirpath', extensions: ['.fhirpath']}), commands.
- Debugging: VS Code supports attaching debuggers to both client and server.

All aspects align with our needs: Use existing FHIRPath library for parse trees in diagnostics and highlighting.

### Page 2: Design and Architecture
**High-Level Architecture**:
- **Client (VS Code Extension)**: TypeScript module using vscode-languageclient. Launches server via Node.js child process. Handles configuration sync (e.g., error severity levels).
- **Server**: TypeScript module using vscode-languageserver. Integrates FHIRPath library for parsing. Implements LSP handlers for initialization, text sync, diagnostics, and semantic tokens.
- **Communication**: Stdio-based IPC for local server.
- **File Association**: Define 'fhirpath' language in package.json with .fhirpath extension.

**Phase 1 Features**:
- **Syntax Highlighting**: Implement semanticTokensProvider in server. Use FHIRPath parser to tokenize input (e.g., keywords like 'where', operators like '.', identifiers). Map to token types (e.g., keyword, string) with modifiers (e.g., declaration).
- **Syntactic Error Highlighting**: On document change, parse with FHIRPath library. If errors, create Diagnostics with ranges and messages (e.g., "Unexpected token at position 10"). Publish via connection.sendDiagnostics.
- **Capabilities Declaration**: Server returns { textDocumentSync: TextDocumentSyncKind.Incremental, semanticTokensProvider: { legend: { tokenTypes: ['keyword', 'operator', ...], tokenModifiers: [] } }, diagnosticProvider: true }.

**Data Flow**:
1. User opens .fhirpath file → Client activates → Starts server → Initialize handshake.
2. File change → Notification to server → Parse → Send diagnostics/tokens.
3. Configuration change (e.g., via settings.json) → Notification to server → Revalidate.

**Dependencies**:
- NPM: vscode-languageclient, vscode-languageserver, vscode-languageserver-textdocument.
- FHIRPath Library: Assume import { parse, getTokens, getErrors } from 'fhirpath-ts'.

**Scalability**: Server runs per workspace; handle large files by limiting parse frequency.

### Page 3: Implementation Steps
**Setup (Week 1)**:
1. Create repo with client and server folders (clone vscode-extension-samples/lsp-sample as template).
2. Client package.json: Add "engines": {"vscode": "^1.80.0"}, "activationEvents": ["onLanguage:fhirpath"], "contributes": {"languages": [{"id": "fhirpath", "aliases": ["FHIRPath"], "extensions": [".fhirpath"]}] }.
3. Install dependencies: npm i vscode-languageclient@8 --save (client); npm i vscode-languageserver@8 vscode-languageserver-textdocument@1 --save (server).
4. Implement basic client in client/src/extension.ts: Create LanguageClient with serverModule path, start on activation.

**Server Implementation (Weeks 1-2)**:
1. In server/src/server.ts: Create connection with createConnection(ProposedFeatures.all).
2. Handle onInitialize: Return capabilities for incremental sync, semantic tokens, diagnostics.
3. Text Sync: Use TextDocuments manager. On didChangeContent: Get document text, call FHIRPath parse(text).
4. Diagnostics: From parse errors, map to LSP Diagnostic[] (e.g., { range: {start: {line: err.line, character: err.char}, end: ...}, message: err.msg, severity: DiagnosticSeverity.Error } ). Send via connection.sendDiagnostics.
5. Semantic Highlighting: Implement onSemanticTokens: Tokenize with FHIRPath getTokens(text), build SemanticTokens (encode positions/types). Use SemanticTokensBuilder for efficiency.

**Integration with FHIRPath Library**:
- Assume API: parse(text: string) => { ast: Node, errors: Error[] }; getTokens(text: string) => Token[] where Token = { type: 'keyword'|'operator'|'identifier', start: Position, end: Position }.
- Map library token types to LSP tokenTypes array (define legend in capabilities).

**Fallbacks**: If semantic highlighting fails, provide basic TextMate grammar in extension (e.g., fhirpath.tmLanguage.json with regex for keywords like \b(where|as|and)\b).

### Page 4: Testing and Debugging
**Unit Tests (Week 3)**:
- Client: Use Mocha/Chai to test activation, server start.
- Server: Test handlers independently (e.g., mock connection, assert diagnostics for invalid input like "patient..name" → error on double dot).
- FHIRPath Integration: Test parse edge cases (e.g., valid: "Patient.name.given", invalid: "Patient name").
- Use vscode-languageserver-test for LSP message validation.

**End-to-End Tests**:
- Use @vscode/test-electron: Launch VS Code instance, open .fhirpath file, type invalid syntax, assert Problems panel shows errors.
- For highlighting: Check token colors via editor.getTokensAtLine (extension test API).

**Debugging**:
- Client: Run Extension Development Host (F5 in VS Code).
- Server: Set "debug.options": {"execArgv": ["--nolazy", "--inspect=6009"] } in client, attach Node debugger.
- Logging: Enable "fhirpath.trace.server": "verbose" in settings.json for protocol traces.

**Quality Checks**:
- Lint with ESLint; type check with tsc.
- Performance: Test with 1000-line files; ensure parse < 100ms.
- Edge Cases: Empty files, unicode, multi-line expressions.

**Phase 1 Acceptance Criteria**:
- Open .fhirpath file: Keywords highlighted (e.g., 'where' in blue).
- Type error (e.g., unmatched paren): Red underline with hover message.
- No crashes on invalid input.

### Page 5: Deployment, Future Phases, and Maintenance
**Deployment (Week 4)**:
1. Package: vsce package → .vsix file.
2. Publish: To VS Code Marketplace via vsce publish (requires Azure DevOps token).
3. Local Install: vscode:install from .vsix for testing.
4. Documentation: README.md with setup, features, examples (e.g., "Patient.name.where(given = 'John')").

**Future Phases**:
- Phase 2: Autocompletion – Implement completionProvider: Use FHIRPath library for context-aware suggestions (e.g., after 'Patient.', suggest 'name', 'birthDate'). Support resolve for docs.
- Phase 3: Advanced LSP (hover for function docs, go-to-definition for variables).
- Phase 4: Semantic analysis (type checking against FHIR schemas).

**Maintenance**:
- Versioning: Semantic versioning for extension; track LSP spec updates.
- CI/CD: GitHub Actions for build/test/publish.
- Community: Open-source repo; handle issues for library bugs.
- Monitoring: Extension telemetry for usage (opt-in).

This plan ensures a robust, phased rollout, building on LSP and VS Code strengths for effective FHIRPath support. Total estimated effort: 80-120 hours.


# Technical Details: Libraries and APIs for FHIRPath LSP Implementation in TypeScript

## Overview
This document details the libraries and APIs for implementing the FHIRPath Language Server Protocol (LSP) server in TypeScript, integrated into VS Code for .fhirpath files. It builds on the assumed FHIRPath TypeScript library but specifies real-world options based on research. Focus is on phase 1: syntax highlighting and syntactic error highlighting. We prioritize open-source, maintained libraries aligned with TypeScript and Node.js.

Key decisions:
- Use official LSP libraries for VS Code integration.
- For FHIRPath parsing/syntax analysis: Generate a TypeScript parser using ANTLR4 TypeScript target from the official FHIRPath grammar, as the existing fhirpath.js library's API lacks direct exposure of parse trees/tokens for LSP needs.
- Assume no internet dependencies; all via NPM.

## Core Libraries for LSP Implementation

### VS Code Extension Client
- **Library**: `vscode-languageclient` (NPM: @vscode/languageclient@^9.0.1)
  - **Purpose**: Handles client-side LSP communication in the VS Code extension.
  - **Key APIs**:
    - `LanguageClient` class: Instantiate with server options (e.g., `serverModule: path/to/server.js`, `transport: TransportKind.ipc`).
    - `start()`: Launches the server on extension activation.
    - `onReady()`: Handles post-initialization setup.
    - Configuration sync: Use `workspace.getConfiguration('fhirpath')` to pass settings to server via `onDidChangeConfiguration`.
  - **Why**: Official Microsoft library for LSP clients in VS Code extensions. Ensures seamless integration with VS Code APIs like `window.createOutputChannel` for logging.

### LSP Server
- **Library**: `vscode-languageserver` (NPM: vscode-languageserver@^9.0.1)
  - **Purpose**: Provides base LSP server implementation.
  - **Key APIs**:
    - `createConnection(ProposedFeatures.all)`: Sets up JSON-RPC connection over stdio.
    - `onInitialize(handler)`: Returns server capabilities (e.g., `{ textDocumentSync: TextDocumentSyncKind.Incremental, semanticTokensProvider: { legend: semanticLegend }, diagnosticProvider: true }`).
    - `onShutdown()` and `onExit()`: Lifecycle management.
  - **Why**: Standard for Node.js-based LSP servers; handles protocol boilerplate.

- **Library**: `vscode-languageserver-textdocument` (NPM: vscode-languageserver-textdocument@^1.0.11)
  - **Purpose**: Manages text documents in the server.
  - **Key APIs**:
    - `TextDocuments<TextDocument>` class: Tracks open documents.
    - `documents.onDidChangeContent(handler)`: Triggers parsing on changes; access `document.getText()` for content.
    - `TextDocument.create(uri, languageId, version, content)`: For document creation.
  - **Why**: Essential for syncing and accessing document state in LSP.

- **Library**: `vscode-languageserver-types` (NPM: vscode-languageserver-types@^3.17.5)
  - **Purpose**: Type definitions for LSP objects.
  - **Key APIs**: Types like `Diagnostic`, `Range`, `Position`, `SemanticTokens`, `SemanticTokensLegend`.
  - **Why**: Ensures type safety for LSP messages (e.g., `DiagnosticSeverity.Error` for syntax errors).

## Libraries for FHIRPath Parsing and Syntax Analysis
The assumed FHIRPath library is realized as `fhirpath` (NPM: fhirpath@^4.2.1, from HL7/fhirpath.js repo). However, its API (e.g., `compile()`, `evaluate()`) focuses on evaluation and throws exceptions for parse errors but does not expose tokens or detailed syntax trees directly. For LSP needs (token-based highlighting, positioned errors), we generate a custom parser.

- **Library**: `antlr4ts` (NPM: antlr4ts@^0.5.0-alpha.4)
  - **Purpose**: ANTLR4 runtime for TypeScript; enables parsing with generated lexers/parsers.
  - **Key APIs**:
    - `ANTLRInputStream(input)`: From document text.
    - `CommonTokenStream(lexer)`: Tokenizes input.
    - `Parser(inputStream)`: Generated from grammar; call `parser.expression()` to parse.
    - `ParseTreeWalker.DEFAULT.walk(listener, tree)`: Traverse tree for tokens.
    - Custom `ErrorListener`: Implement `syntaxError(recognizer, offendingSymbol, line, charPositionInLine, msg, e)` to collect `Diagnostic` objects with `Range` from `line`/`charPositionInLine`.
  - **Why**: FHIRPath grammar is ANTLR4-based (from hl7.org/fhirpath/N1/fhirpath.html#grammar). Generate TypeScript parser/lexer for precise control over tokens (e.g., keywords, operators) and errors. Runtime is lightweight and TypeScript-native.

- **Grammar Source**: FHIRPath.g4 (copy from https://github.com/HL7/fhirpath.js/blob/master/parser/FHIRPath.g4 or spec).
  - **Generation**: Use ANTLR4 JAR (via build script: `java -jar antlr-4.13.1-complete.jar -Dlanguage=TypeScript -visitor -o src/generated src/FHIRPath.g4`).
  - **Integration**: In server, on document change: Create lexer/parser, add error listener, parse, collect tokens via visitor (map to LSP token types like 'keyword' for 'where', 'operator' for '.').
  - **Semantic Tokens**: Use `SemanticTokensBuilder` to push tokens with types from a legend (e.g., `tokenTypes: ['keyword', 'operator', 'identifier', 'string', 'number']`).
  - **Diagnostics**: From error listener, create `Diagnostic[]` and send via `connection.sendDiagnostics({ uri: document.uri, diagnostics })`.

- **Fallback/Supplement**: `fhirpath` (NPM: fhirpath@^4.2.1)
  - **Purpose**: Validate parsing or extend to evaluation in future phases.
  - **Key APIs**:
    - `compile(expression: string, model?: object, options?: object)`: Precompiles; throws on syntax errors (e.g., catch to extract message, though positions may need custom parsing from error string).
    - `evaluate(resource: object, expression: string, env?: object, model?: object, options?: object)`: Executes; use for testing.
  - **Why**: Official HL7 implementation; TypeScript-compatible (has index.d.ts). Use for cross-checking parser output if needed.

## Additional Utilities and APIs
- **NPM Dependencies for Development**:
  - `typescript@^5.5.4`: Compiler.
  - `@types/node@^22.0.1`: Node.js types.
  - `ts-node@^10.9.2`: For running server in dev mode.

- **VS Code APIs (in Extension)**:
  - `vscode.ExtensionContext`: Passed to `activate(context)`.
  - `vscode.commands.registerCommand()`: For custom commands (e.g., 'fhirpath.validate').
  - `vscode.workspace.onDidChangeConfiguration()`: Sync settings to server.
  - Manifest (package.json): Define `"languages": [{"id": "fhirpath", "extensions": [".fhirpath"]}]`, `"configuration": "./language-configuration.json"` for basic syntax (e.g., comments, brackets).

- **Build and Packaging**:
  - `vsce` (global NPM): For packaging .vsix.
  - `esbuild` or `webpack`: Bundle server/client for production.

## Implementation Notes
- **Token Legend**: Define in server capabilities: `const semanticLegend: SemanticTokensLegend = { tokenTypes: ['namespace', 'type', 'class', 'enum', 'interface', 'struct', 'typeParameter', 'parameter', 'variable', 'property', 'enumMember', 'event', 'function', 'method', 'macro', 'keyword', 'modifier', 'comment', 'string', 'number', 'regexp', 'operator'], tokenModifiers: ['declaration', 'readonly'] };`.
- **Error Positioning**: ANTLR provides exact positions; map to LSP (0-based lines/characters).
- **Performance**: ANTLR parsing is efficient for expressions; test with large .fhirpath files.
- **Future Extensions**: For autocompletion (phase 2), extend ANTLR visitor to analyze context and suggest based on FHIR models (import from fhirpath's fhir-context/r4).

This setup leverages mature libraries for a maintainable implementation, with custom parsing for FHIRPath specifics. Total NPM installs: 8 core packages.


# Technical Details: Libraries and APIs for FHIRPath LSP Implementation in TypeScript

## Overview
This document details the libraries and APIs for implementing the FHIRPath Language Server Protocol (LSP) server in TypeScript, integrated into VS Code for .fhirpath files. It builds on the assumed FHIRPath TypeScript library but specifies real-world options based on research. Focus is on phase 1: syntax highlighting and syntactic error highlighting. We prioritize open-source, maintained libraries aligned with TypeScript and Node.js.

Key decisions:
- Use official LSP libraries for VS Code integration.
- For FHIRPath parsing/syntax analysis: Generate a TypeScript parser using ANTLR4 TypeScript target from the official FHIRPath grammar, as the existing fhirpath.js library's API lacks direct exposure of parse trees/tokens for LSP needs.
- Assume no internet dependencies; all via NPM.

## Core Libraries for LSP Implementation

### VS Code Extension Client
- **Library**: `vscode-languageclient` (NPM: @vscode/languageclient@^9.0.1)
  - **Purpose**: Handles client-side LSP communication in the VS Code extension.
  - **Key APIs**:
    - `LanguageClient` class: Instantiate with server options (e.g., `serverModule: path/to/server.js`, `transport: TransportKind.ipc`).
    - `start()`: Launches the server on extension activation.
    - `onReady()`: Handles post-initialization setup.
    - Configuration sync: Use `workspace.getConfiguration('fhirpath')` to pass settings to server via `onDidChangeConfiguration`.
  - **Why**: Official Microsoft library for LSP clients in VS Code extensions. Ensures seamless integration with VS Code APIs like `window.createOutputChannel` for logging.

### LSP Server
- **Library**: `vscode-languageserver` (NPM: vscode-languageserver@^9.0.1)
  - **Purpose**: Provides base LSP server implementation.
  - **Key APIs**:
    - `createConnection(ProposedFeatures.all)`: Sets up JSON-RPC connection over stdio.
    - `onInitialize(handler)`: Returns server capabilities (e.g., `{ textDocumentSync: TextDocumentSyncKind.Incremental, semanticTokensProvider: { legend: semanticLegend }, diagnosticProvider: true }`).
    - `onShutdown()` and `onExit()`: Lifecycle management.
  - **Why**: Standard for Node.js-based LSP servers; handles protocol boilerplate.

- **Library**: `vscode-languageserver-textdocument` (NPM: vscode-languageserver-textdocument@^1.0.11)
  - **Purpose**: Manages text documents in the server.
  - **Key APIs**:
    - `TextDocuments<TextDocument>` class: Tracks open documents.
    - `documents.onDidChangeContent(handler)`: Triggers parsing on changes; access `document.getText()` for content.
    - `TextDocument.create(uri, languageId, version, content)`: For document creation.
  - **Why**: Essential for syncing and accessing document state in LSP.

- **Library**: `vscode-languageserver-types` (NPM: vscode-languageserver-types@^3.17.5)
  - **Purpose**: Type definitions for LSP objects.
  - **Key APIs**: Types like `Diagnostic`, `Range`, `Position`, `SemanticTokens`, `SemanticTokensLegend`.
  - **Why**: Ensures type safety for LSP messages (e.g., `DiagnosticSeverity.Error` for syntax errors).

## Libraries for FHIRPath Parsing and Syntax Analysis
The assumed FHIRPath library is realized as `fhirpath` (NPM: fhirpath@^4.2.1, from HL7/fhirpath.js repo). However, its API (e.g., `compile()`, `evaluate()`) focuses on evaluation and throws exceptions for parse errors but does not expose tokens or detailed syntax trees directly. For LSP needs (token-based highlighting, positioned errors), we generate a custom parser.

- **Library**: `antlr4ts` (NPM: antlr4ts@^0.5.0-alpha.4)
  - **Purpose**: ANTLR4 runtime for TypeScript; enables parsing with generated lexers/parsers.
  - **Key APIs**:
    - `ANTLRInputStream(input)`: From document text.
    - `CommonTokenStream(lexer)`: Tokenizes input.
    - `Parser(inputStream)`: Generated from grammar; call `parser.expression()` to parse.
    - `ParseTreeWalker.DEFAULT.walk(listener, tree)`: Traverse tree for tokens.
    - Custom `ErrorListener`: Implement `syntaxError(recognizer, offendingSymbol, line, charPositionInLine, msg, e)` to collect `Diagnostic` objects with `Range` from `line`/`charPositionInLine`.
  - **Why**: FHIRPath grammar is ANTLR4-based (from hl7.org/fhirpath/N1/fhirpath.html#grammar). Generate TypeScript parser/lexer for precise control over tokens (e.g., keywords, operators) and errors. Runtime is lightweight and TypeScript-native.

- **Grammar Source**: FHIRPath.g4 (copy from https://github.com/HL7/fhirpath.js/blob/master/parser/FHIRPath.g4 or spec).
  - **Generation**: Use ANTLR4 JAR (via build script: `java -jar antlr-4.13.1-complete.jar -Dlanguage=TypeScript -visitor -o src/generated src/FHIRPath.g4`).
  - **Integration**: In server, on document change: Create lexer/parser, add error listener, parse, collect tokens via visitor (map to LSP token types like 'keyword' for 'where', 'operator' for '.').
  - **Semantic Tokens**: Use `SemanticTokensBuilder` to push tokens with types from a legend (e.g., `tokenTypes: ['keyword', 'operator', 'identifier', 'string', 'number']`).
  - **Diagnostics**: From error listener, create `Diagnostic[]` and send via `connection.sendDiagnostics({ uri: document.uri, diagnostics })`.

- **Fallback/Supplement**: `fhirpath` (NPM: fhirpath@^4.2.1)
  - **Purpose**: Validate parsing or extend to evaluation in future phases.
  - **Key APIs**:
    - `compile(expression: string, model?: object, options?: object)`: Precompiles; throws on syntax errors (e.g., catch to extract message, though positions may need custom parsing from error string).
    - `evaluate(resource: object, expression: string, env?: object, model?: object, options?: object)`: Executes; use for testing.
  - **Why**: Official HL7 implementation; TypeScript-compatible (has index.d.ts). Use for cross-checking parser output if needed.

## Additional Utilities and APIs
- **NPM Dependencies for Development**:
  - `typescript@^5.5.4`: Compiler.
  - `@types/node@^22.0.1`: Node.js types.
  - `ts-node@^10.9.2`: For running server in dev mode.

- **VS Code APIs (in Extension)**:
  - `vscode.ExtensionContext`: Passed to `activate(context)`.
  - `vscode.commands.registerCommand()`: For custom commands (e.g., 'fhirpath.validate').
  - `vscode.workspace.onDidChangeConfiguration()`: Sync settings to server.
  - Manifest (package.json): Define `"languages": [{"id": "fhirpath", "extensions": [".fhirpath"]}]`, `"configuration": "./language-configuration.json"` for basic syntax (e.g., comments, brackets).

- **Build and Packaging**:
  - `vsce` (global NPM): For packaging .vsix.
  - `esbuild` or `webpack`: Bundle server/client for production.

## Implementation Notes
- **Token Legend**: Define in server capabilities: `const semanticLegend: SemanticTokensLegend = { tokenTypes: ['namespace', 'type', 'class', 'enum', 'interface', 'struct', 'typeParameter', 'parameter', 'variable', 'property', 'enumMember', 'event', 'function', 'method', 'macro', 'keyword', 'modifier', 'comment', 'string', 'number', 'regexp', 'operator'], tokenModifiers: ['declaration', 'readonly'] };`.
- **Error Positioning**: ANTLR provides exact positions; map to LSP (0-based lines/characters).
- **Performance**: ANTLR parsing is efficient for expressions; test with large .fhirpath files.
- **Future Extensions**: For autocompletion (phase 2), extend ANTLR visitor to analyze context and suggest based on FHIR models (import from fhirpath's fhir-context/r4).

This setup leverages mature libraries for a maintainable implementation, with custom parsing for FHIRPath specifics. Total NPM installs: 8 core packages.