Great. I will create a comprehensive 5-page Architecture Decision Record and implementation plan for developing a TypeScript-based FHIRPath Language Server Protocol (LSP) and integrating it with a VS Code extension.

This will include syntax highlighting and syntactic error detection in the first phase, with future plans for autocompletion. I’ll also document reusable LSP architecture, integration points with VS Code, file handling for `.fhirpath` extensions, and implementation-level concerns like dependency management and testing.

I’ll let you know as soon as the plan is ready for review.


# FHIRPath Language Server for VS Code – Architecture & Implementation Plan

## Introduction & Background

FHIRPath is a path-based navigation and extraction language for FHIR (similar in spirit to XPath for XML) that allows traversal, selection, and filtering of data in FHIR resources. It is used across the FHIR ecosystem (e.g. in validation rules, search definitions, mapping, etc.) to express constraints and queries. Currently, VS Code has limited support for FHIRPath (only basic syntax highlighting via a community extension) and no robust editing assistance. To improve the developer experience, we propose building a **Language Server Protocol (LSP)** extension for FHIRPath in TypeScript. This will provide rich features in VS Code for `.fhirpath` files, including syntax highlighting, real-time error feedback (diagnostics), and eventually autocompletion and other language tools.

**Why LSP?** VS Code’s LSP support allows us to implement advanced language features (like autocomplete, diagnostics, go-to-definition, etc.) in a tool-agnostic way. Instead of writing a one-off VS Code plugin with limited capabilities, we can create a language server that *standardizes communication* between the editor and our FHIRPath logic. The LSP approach solves the problem of needing separate integrations for every editor and language – by using a common protocol, the FHIRPath server can potentially be reused in other editors as well. It also keeps the heavy computation (parsing, analysis) out of VS Code’s process, running the language server in a separate process to avoid slowing down the editor. This ADR details the plan to implement the FHIRPath language server in TypeScript and integrate it into a VS Code extension. We assume an existing **FHIRPath TypeScript library** is available, which provides parsing and basic syntactic analysis of FHIRPath expressions. This library will be leveraged to avoid writing a grammar from scratch and to ensure compliance with the FHIRPath specification.

## Goals and Scope

**Phase 1 (Initial Implementation):**

* **Syntax Highlighting:** Provide appropriate syntax coloring for `.fhirpath` files in VS Code. Keywords, literals, and FHIRPath operators/functions should be colorized to improve readability.
* **Syntactic Error Highlighting:** As users type expressions, any syntactic errors should be flagged with underline squiggles and explanatory messages (diagnostics). This requires parsing the expression in real-time and reporting errors.

**Phase 2 (Future Enhancements):**

* **Autocompletion (IntelliSense):** Suggest completions for partial expressions. This could include FHIRPath function names, constants (`true`, `false`), or even context-aware suggestions (e.g. FHIR resource element names if a context type is known). Autocompletion will be designed after basic highlighting/error support is in place.
* **Additional LSP Features (Potential):** As a full LSP, we can later add features like hover tooltips (e.g. showing documentation for a FHIRPath function or FHIR element), “go to definition” or reference (though for FHIRPath these may not apply unless linking to StructureDefinition), formatting, etc. These are out of scope for now but the architecture will not preclude them.

**File Types:** The language server will target files with extension `.fhirpath`. We will register a new VS Code language ID (e.g. `"fhirpath"`) associated with `*.fhirpath` files. This ensures that opening such files triggers our extension. (In the future, we might also support FHIRPath embedded in other files – for example, FHIR Mapping Language `.map` files, or FSH/StructureDefinition JSON – but initially we focus on standalone `.fhirpath` files.)

**Assumptions:** We have a working FHIRPath JS/TS library available (for example, the HL7 `fhirpath.js` package). This library can parse FHIRPath expressions and likely provide an Abstract Syntax Tree (AST) or throw parse errors for invalid input. Indeed, the HL7 FHIRPath library’s parser was auto-generated from the official ANTLR grammar and can even produce a parse tree representation of an expression. We will utilize this library for parsing and syntax checking, rather than writing our own parser. All standard FHIRPath grammar rules and functions are handled by the library (covering the full language specification), so our focus is on integration and editor features, not language mechanics (the library “handles all of them”, i.e. all syntax rules and evaluation logic).

## High-Level Solution Approach

We will implement a **Language Server** for FHIRPath using Microsoft’s LSP Node SDK. The solution has two main components:

* **VS Code Language Client (Extension):** This is the VS Code extension (written in TypeScript) that acts as the client. It activates for `.fhirpath` files and launches the FHIRPath language server. The client uses the `vscode-languageclient` library to manage communication. It doesn’t itself perform language analysis – instead, it forwards events (like opening a document, changing text, requesting completions) to the server and applies the server’s responses (highlighting, error squiggles, completions) in the editor. The extension’s manifest (`package.json`) will declare the new language and file extension, and specify an activation event such as `onLanguage:fhirpath` so it starts when a FHIRPath file is opened.

* **FHIRPath Language Server:** This is a separate process (also written in TypeScript/Node) that implements the LSP for FHIRPath. The server will use the `vscode-languageserver` Node module for convenience, which handles much of the protocol plumbing. The server’s responsibilities include parsing documents, maintaining their text state, and computing responses for language features (diagnostics, completions, etc.). Running the analysis in a separate process is beneficial for performance and allows using non-Node code if ever needed. In our case the server is in Node/TS (same language), but we still isolate it for stability and to follow the LSP architecture.

&#x20;*Illustration of how Language Servers decouple language-specific analysis from the editor. Instead of VS Code directly understanding FHIRPath, the editor (client) delegates to our FHIRPath server via the Language Server Protocol. This design also makes it possible to reuse the FHIRPath server in other LSP-compatible editors.*

When a `.fhirpath` file is opened, VS Code (client) will start the FHIRPath server (likely via Node `fork` or `spawn`). The client and server then communicate over IPC (or stdio) using LSP messages. For example, when the user types, VS Code sends `textDocument/didChange` events to the server with the new text; the server responds with `textDocument/publishDiagnostics` messages if it finds errors. The two processes operate asynchronously, which keeps the editor UI responsive even if the server does heavy computations.

&#x20;*VS Code extension architecture for LSP: the FHIRPath *language client* runs in the extension host and launches the *language server* as a separate process. They communicate via IPC using the Language Server Protocol. This separation allows the parsing logic (server) to be implemented in TypeScript (or any language) without impacting the VS Code runtime.*

### Alternatives Considered

* **Direct VS Code Extension (No LSP):** We considered implementing highlighting and suggestions using VS Code’s direct extension APIs (e.g. using `vscode.languages.registerCompletionItemProvider`). This approach is simpler for basic features but would tie our implementation specifically to VS Code’s API. Given we want full language support and possibly reuse in other editors, LSP is a better choice. The LSP route also has robust tooling and examples, reducing the risk.
* **TextMate Grammar Only:** Another alternative is to only supply a TextMate grammar for FHIRPath to handle syntax highlighting. In fact, a community extension already provides `.fhirpath` grammar highlighting. However, that alone cannot do dynamic error checking or autocompletion. We will still likely use a grammar for initial coloring, but the core of our solution needs a parser for deeper features. Relying solely on a static grammar was not sufficient for our goals.
* **Implementing a Custom Parser:** We ruled out writing our own FHIRPath parser because a reliable implementation already exists in the library. Writing a new parser would be time-consuming and error-prone, given FHIRPath’s complexity (the HL7 library covers the full spec and is tested). Using the existing library lets us focus on the editor integration. The only downside is treating the library as a “black box” – we need to ensure it gives us adequate error information (line/column of errors) and possibly AST details for highlighting. We will verify the library’s API for these capabilities (e.g. does it have a parse function or do we use its `compile` and catch exceptions).

## VS Code Extension Design

The VS Code client extension will be relatively lightweight. Key tasks for the extension include:

* **Language Definition:** In `package.json`, define a new language called “FHIRPath” with file extension `.fhirpath`. This ensures VS Code recognizes the file type. We will also contribute a basic syntax coloring definition here (either via a TextMate grammar file or via semantic token mappings). For example, we might include a TextMate grammar (TM Language JSON or PLIST) that highlights FHIRPath keywords and literals. This grammar can be adapted from the FHIRPath spec or the existing extension (if license permits). Initially, this gives immediate colorization for known tokens (e.g., `true`, `false`, `and`, `or`, string literals, numbers, etc.) in case the semantic highlighting from LSP is not yet active or supported by the theme.

* **Activation Events:** We will use `"activationEvents": ["onLanguage:fhirpath"]` (and possibly on file extension) so that the extension activates whenever a FHIRPath file is opened. The extension might also activate on other triggers (for example, if we support FHIRPath in markdown code fences or in other file types, we could add those, but that’s future consideration).

* **Launching the Server:** In the extension’s `activate` function (in `extension.ts`), we will spawn the language server. Using the `vscode-languageclient` API, we specify the server entry point (the compiled JS of our server module) and the communication transport (IPC is convenient for Node – VS Code will spawn a Node subprocess). We configure the `LanguageClient` with a document selector for “fhirpath” language, so it knows to route `.fhirpath` documents to our server. Then we call `client.start()` to launch it. The server will initialize and send back its capabilities. This startup sequence is standard for LSP extensions.

* **Editor Features via LSP:** Once running, the VS Code client mostly sits idle and waits for the server. For example, when the server sends diagnostics, the client displays them as squiggly underlines in the editor. When the user requests autocomplete (Ctrl+Space), the client forwards a `textDocument/completion` request to the server and then shows the CompletionItems returned. This division of labor means our extension code can remain very minimal aside from initialization. (We will handle any configuration synchronization if needed – e.g., if we add settings for the extension, the client can forward them to the server as shown in the LSP sample, but initially we may not need custom settings.)

## Language Server Implementation Details

The FHIRPath language server will handle the core logic: parsing documents, reporting errors, and computing syntax highlights (and later completions). We outline its main components and how they will be implemented:

* **Document Management:** We will use the `TextDocuments` manager from `vscode-languageserver` to track open documents. This utility will handle storing the text content and efficient incremental updates (we set sync kind to incremental in our server capabilities). As a result, whenever a document changes, we can easily retrieve its new text via the TextDocuments API. The manager also simplifies converting between offsets and line/column positions, which we will need for error locations.

* **Parsing and Diagnostics:** Every time a FHIRPath document is changed (or opened), we will invoke the FHIRPath library to parse the expression. This could be done in an event handler: `documents.onDidChangeContent` will fire for changes. In that handler, we call our `validateTextDocument()` function to parse and produce diagnostics. Using the library might look like:

  ```ts
  try {
      fhirpath.parse(expressionText); // hypothetical parse function
  } catch (e) {
      // extract error location and message
  }
  ```

  If the library doesn’t have a direct `parse` method, we might use `fhirpath.compile(expression)` as a proxy – this compiles the expression and throws on syntax error. We will wrap this in a try/catch. On an exception, we’ll create a **Diagnostic** object with severity Error. We need the error’s character position; hopefully the exception or an API provides line/column. The HL7 library’s ANTLR parser likely provides the location of syntax errors (we may inspect the error object for fields like `location` or parse the message). We then add the diagnostic with the range covering the error (or at least the token where it occurred). If the parse succeeds (no exception), we consider the document valid and produce no error diagnostics (clearing any previous).

  The server then sends diagnostics to VS Code via `connection.sendDiagnostics`. VS Code will underline the range in red and show the error message in the Problems panel. This immediate feedback is crucial for users to catch mistakes. For example, if a user types an incomplete expression or a typo, the parser might throw an error like “mismatched input ‘…’ expecting … at line X col Y” – we’ll surface that to the user. We will limit re-parsing frequency if needed (e.g., introduce a short debounce when typing rapidly), but given FHIRPath expressions are usually short, performance is not a big concern. The sample LSP validates on each content change; we can start with that approach. We will also ensure only a reasonable number of diagnostics (if the user somehow has multiple errors) are sent, to avoid spamming (the sample uses a `maxNumberOfProblems` setting; we could implement a similar config or just use 1 error per file since FHIRPath is often a single expression).

* **Syntax Highlighting Implementation:** We plan to implement syntax highlighting through **Semantic Tokens**, a modern LSP feature that allows the language server to classify tokens in the document for coloring. While a TextMate grammar could provide basic highlighting, semantic tokens give us more flexibility and accuracy (especially if we want context-specific highlighting). The idea is that after parsing, we can walk the AST and categorize each token (identifier, number, string, keyword, function, etc.) by type and range, and send this info to VS Code. The client (VS Code) will map these token types to theming colors.

  **Token Types and Modifiers:** We will define a legend of token types our server will use – for example: `keyword`, `string`, `number`, `boolean`, `function`, `variable`, `operator`, `type` (for type names like `FHIR.Patient`), etc. We list all token categories up-front in the server capabilities as required by LSP. For instance, our legend might be:

  ```ts
  tokenTypes: ["keyword","string","number","boolean","function","operator","identifier","type"],
  tokenModifiers: []
  ```

  (If needed, we could have modifiers like `"defaultLibrary"` vs `"custom"` for functions, but likely unnecessary now.) The LSP spec requires that this legend be provided during the server initialization so the editor knows how to interpret the token data.

  **Providing Semantic Tokens:** We will implement the handler for `textDocument/semanticTokens/full`. The `vscode-languageserver` library makes this convenient by allowing us to register a callback for semantic token requests. In that callback, we will parse or use the existing AST (we might reuse the last parse from diagnostics to avoid re-parsing). Then we traverse the AST nodes to collect token positions and assign each a token type from our legend. For example:

  * All string literal nodes -> token type `"string"`
  * All numeric literals -> `"number"`
  * `true`/`false` -> `"boolean"`
  * `and`, `or`, `xor`, `implies` -> `"keyword"` (logical operators as keywords)
  * `=` `!=` `>` etc -> `"operator"`
  * Function names (like `.where()`, `.exists()`) -> `"function"` (possibly we treat them as function calls)
  * Identifiers (paths, element names) -> perhaps `"property"` or `"identifier"`; we might choose `"property"` if it refers to a FHIR element/field.
  * Percent-prefixed variables (e.g. `%resource`) -> `"variable"`
  * Type names in `is(Type)` or `as Type` -> `"type"`

  We need the exact character ranges for each token. The parse library/AST likely provides start and end indices for each token or rule. If not directly, we can re-tokenize using a simpler approach (for example, use a regex or a secondary ANTLR lexer if available). However, since the grammar is known, using the AST is ideal. We will carefully examine the library’s API – perhaps it exposes an AST with position metadata or a token stream. In case of difficulty, a pragmatic short-term solution could be to rely on TextMate grammar for highlighting and postpone semantic token implementation. But assuming we can get the needed info, we proceed with semantic tokens.

  The server will return a list of tokens (with line, char, length, type index, modifier bitmask). VS Code will apply them to highlight text. Notably, semantic highlighting is often an *addition* to TextMate highlighting, and by default VS Code themes might prioritize one over the other depending on settings. We will ensure to enable semantic highlighting for the FHIRPath language by adding in our package.json:

  ```json
  "configurationDefaults": {
      "[fhirpath]": { "editor.semanticHighlighting.enabled": true }
  }
  ```

  This ensures that our semantic colors take effect. If a theme doesn’t explicitly support our token types, VS Code will fall back to a default mapping or the TextMate grammar. We may also contribute a `semanticTokenScopes` mapping in package.json to map our token types to default TextMate scopes (for example, map `"keyword"` to a generic keyword scope, `"string"` to string, `"function"` to entity.name.function, etc., so that even without theme support, colors are sensible).

* **Using TextMate Grammar (Backup Plan):** If for any reason semantic tokens are not fully implemented in the first phase, we will at least provide a TextMate grammar file for FHIRPath. The grammar (likely a `.tmLanguage.json` or `.plist`) will define regex patterns for various tokens. For example, a pattern for booleans (`\btrue\b|\bfalse\b`), for numbers (`\b\d+(\.\d+)?\b`), for strings (`'[^']*'`), for symbols like `(`, `)`, `.`, etc. We can base this on the official grammar to ensure accuracy. The existing extension by Beda Software might have a grammar we can reuse or refer to. This will handle basic highlighting immediately. As we introduce semantic highlighting, we can phase out or reduce reliance on the grammar. Both can coexist (semantic tokens can override or complement the baseline highlighting).

* **Error Highlighting (Diagnostics):** We have largely covered this under parsing: the server will produce diagnostics on parse errors. One detail is handling multiple expressions: if `.fhirpath` files might contain more than one expression (e.g., separated by newlines?), we should clarify the file format. Typically, `.fhirpath` might contain a single expression (since FHIRPath is usually one-liners). If we support multi-line (maybe each line is separate expression), we could attempt to parse each independently. But that complicates matters. We will assume one expression per file (or if multiple lines, treat it as one continuous expression with line breaks allowed). The parser likely can handle whitespace and line breaks as insignificant (except in strings). So we parse the whole content at once. Any error location we get (line/col) must be translated to VS Code 0-based positions for the Diagnostic range. We’ll use our TextDocument from the manager to do `positionAt(offset)` conversions if needed (the library might give col number in 1-based; we adjust accordingly). Once created, we send the diagnostics to VS Code, which will present them immediately.

* **Autocompletion (Phase 2 Planning):** Although not implemented in phase 1, we outline how we will add it. The server can implement the `textDocument/completion` request by analyzing the context at the cursor position. When the user triggers completion, we receive the text document and position. Potential strategies:

  * If the cursor is at a certain context in the expression (e.g., after a dot `Patient.name.` or after a function open parenthesis), we could provide relevant suggestions. For example, after a dot on a resource path, suggest valid child element names (this would require knowing the type of the element to list its properties – which might be possible if we had some context of a base resource. However, in a standalone `.fhirpath` file, we might not know the context type unless the expression starts with a resource name like `Patient.` which gives a clue).
  * We will at least provide **static suggestions**: a list of all built-in FHIRPath functions and keywords. E.g., suggestions for functions like `empty()`, `exists()`, `where()`, `select()`, `ofType()`, etc., and perhaps operators like `and`, `or`, etc. These can be offered regardless of context, to help users recall the syntax. We can obtain a list of FHIRPath function names from the spec or the library (the library might have an export or we can compile one manually). For each, we return a `CompletionItem` with the function name and perhaps a brief documentation or snippet. For instance, typing "`.`" could trigger member suggestions (`.where()`, `.select(){}` etc.).
  * If context is known (for example, if the user has loaded a FHIR StructureDefinition or indicated the context resource type in a comment or setting), we could use that to suggest actual FHIR fields. This is an advanced feature and might require hooking into FHIR definitions (which might be out of scope). Initially, we will likely stick to language keywords and functions.

  The completion support in LSP will be registered via `connection.onCompletion` and `connection.onCompletionResolve` (for additional info on selection). Phase 2 will include implementing these. The groundwork in phase 1 ensures we have the parsing (for context) ready. One challenge is providing sensible completions when the expression is partially complete or even syntactically incorrect (since user might trigger completion mid-typing). We may need an error-tolerant parse or at least string analysis to guess what to suggest. For example, if user types `Patient.name.g` and triggers completion, we should ideally suggest `.given` (if context known to be Patient.name elements). Achieving this context sensitivity might require tying into FHIR definitions (which the library can support if given a model, e.g., R4 model was mentioned in `fhirpath.js` usage). We may defer such intelligent completions and start with generic suggestions.

* **Testing & Validation:** During development, we will test the LSP using VS Code’s Extension Host (launch the extension and open sample `.fhirpath` files). We will create sample expressions to ensure:

  * Correct tokens are highlighted (e.g., `Observation.value.code` – check that `Observation` might be colored as type or identifier, `value` as property, `.code` as property, etc., strings like `'abc'` in an expression are colored as string).
  * Proper error diagnostics appear. For example, test a known invalid expression (like `1 + + 2`, or an unclosed quote) and see that a diagnostic with a clear message and correct location is shown. If the message from the library is too technical, we might catch certain common errors and replace with friendlier messages.
  * Autocomplete (when implemented) offers a reasonable list and inserts text correctly. We will validate that the completion items appear and that choosing one inserts the expected snippet.

* **Performance Considerations:** The FHIRPath expressions are typically small (a few hundred characters at most), so parsing is fast (the HL7 library is written in JS and is efficient enough for this size). The overhead of LSP communication is negligible here. Memory footprint is small. We do not anticipate performance issues. However, we will ensure that the language server does not leak documents (the TextDocuments manager should release closed documents from memory). We will also turn off any unnecessary features; for instance, if we do not implement document formatting or symbol outline, we won’t advertise those capabilities. The server’s `initialize` response will list only what we support: at least text document sync, diagnostics, completion, and semantic tokens. For semantic tokens, we will specify range and full support (full document tokens) unless we plan to implement fine-grained (full is simpler initially).

## Implementation Plan (Step-by-Step)

**1. Project Setup:** We will create a new VS Code extension project (using `yo code` or by manually structuring as per the LSP sample). The structure will have a client and server sub-folder (as shown in the Microsoft LSP example). We will add the `vscode-languageclient` dependency to the client package.json and `vscode-languageserver` to the server package.json. Also, install the FHIRPath TS library (`npm i fhirpath`) in the server project. Ensure we have build scripts to compile both client and server (likely using tsc with outDir). We will set up a debugging configuration for VS Code to launch the extension and attach to the server (using the `--inspect` flag as in the sample).

**2. Define Language in Extension Manifest:** In `package.json` of the extension (root), add a `"contributes.languages"` entry for FHIRPath. For example:

```json
"contributes": {
  "languages": [{
      "id": "fhirpath",
      "aliases": ["FHIRPath"],
      "extensions": [".fhirpath"],
      "configuration": "./language-configuration.json"
  }],
  "grammars": [ ... if using TextMate grammar ... ]
}
```

This registers the language ID and file extension with VS Code. We also include a basic `language-configuration.json` (to define comment syntax if any – FHIRPath doesn’t have comment syntax, so this might be minimal, perhaps define quotes as string delimiters, etc.). If we prepared a TextMate grammar (optional at first), we list it under `grammars` with a scope name and path to the grammar file. For instance, scope `source.fhirpath` and the path to our `fhirpath.tmLanguage.json`. The activationEvents should include `"onLanguage:fhirpath"` so that our extension activates correctly.

**3. Implement Extension Activation (Client Code):** In `client/src/extension.ts`, write the `activate` function. Here we resolve the path to our server module (after compilation, e.g. `path.join(__dirname, '..', 'server', 'out', 'server.js')`) and set up `ServerOptions` for running it. We will use `TransportKind.ipc` for simplicity (Node processes can use IPC easily). Then define `LanguageClientOptions` with `documentSelector: [{ scheme: 'file', language: 'fhirpath' }]` (and possibly handle workspace file watching if needed, but not necessary for now). Create a `LanguageClient` from these options, and call `start()`. Also handle `deactivate` to stop the client/server on extension shutdown. This is largely boilerplate from the VS Code LSP guide.

**4. Server Initialization (Server Code):** In `server/src/server.ts`, set up the LSP server. We call `createConnection(ProposedFeatures.all)` to create the connection object. Create a `TextDocuments` manager to manage open docs. Listen for the `onInitialize` request: here we return the server’s capabilities. We will include:

* `textDocumentSync = TextDocumentSyncKind.Incremental` (so we get incremental updates).
* `completionProvider = { resolveProvider: true }` to indicate we will provide autocompletion (even if empty suggestions at first, we can stub it).
* `semanticTokensProvider = { legend: { tokenTypes: [...], tokenModifiers: [...] }, full: true }` to declare semantic token support (assuming we implement it now; if not ready, we can omit this in Phase 1 and add later).
* We might also add `diagnosticProvider` if needed, but diagnostics are usually just published via sendDiagnostics (no need for capability flag beyond textDocumentSync).
* If we foresee needing workspace configuration, we set those flags (not needed initially).

After initialize, in `onInitialized`, we could register for workspace change notifications if we had settings, but likely not needed now.

**5. Document Change Handling (Diagnostics):** Still in `server.ts`, set up the document listener: `documents.onDidChangeContent(change => { validateTextDocument(change.document); });`. Also call `validateTextDocument` for each open document on startup if desired (and on config change if applicable). Implement `validateTextDocument(textDocument: TextDocument)`: this will retrieve the text (`textDocument.getText()`), then attempt to parse it using the FHIRPath library. For example:

```ts
const text = textDocument.getText();
let diagnostics: Diagnostic[] = [];
try {
    fhirpath.parse(text); // or fhirpath.compile
} catch(e: any) {
    const msg = e.message || "Syntax error";
    let line = 0, col = 0;
    // if e has location info, extract it. For ANTLR, error messages might be like "line 1:5 mismatched input ..." 
    // We can parse that or if the library provides e.location with {line, column} use it.
    if (e.location) {
        line = e.location.startLine - 1;
        col = e.location.startColumn - 1;
    } else {
        // parse e.message for 'line X:' pattern
        const match = msg.match(/line (\d+):(\d+)/);
        if(match) { line = parseInt(match[1]) - 1; col = parseInt(match[2]) - 1; }
    }
    diagnostics.push({
        range: {
            start: { line, character: col },
            end:   { line, character: col+1 }
        },
        message: msg,
        severity: DiagnosticSeverity.Error,
        source: "FHIRPath"
    });
}
connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
```

The above is illustrative – we will refine how we get the error position. If the parse library returns an AST on success, we might store it (for semantic tokens use). If no error, we send an empty diagnostics array to clear prior errors. We will also decide how to handle multiple errors. ANTLR typically stops at first error by default; or we could attempt to continue. But since FHIRPath is often short, one error at a time is okay. (We might improve by allowing multiple issues if possible, but not required).

**6. Semantic Tokens Handler:** Implement the semantic token provider if in scope for Phase 1. The `vscode-languageserver` library can use `connection.languages.semanticTokens.on(...)` to handle full document token requests. In the handler, we do: get the document text or AST. If we have an AST from the last successful parse, use it; otherwise (if the code has errors or no stored AST), we might attempt a best-effort parse or skip highlighting (in error scenarios, some tokens could still be highlighted by fallback grammar). Ideally, we highlight even if there's an error, just not the erroneous part. If AST is partial, we could traverse what’s available. This can get complex – a simpler approach: we could re-parse even on erroneous text using a resilient mode if the library supports it. If not, an alternative is to perform our own tokenization for highlighting: e.g., use regex to identify strings, numbers, etc., as a fallback when parse fails. Many languages do something similar to not break all highlighting on a single error. Given time constraints, we might accept that if the expression is syntactically invalid, semantic highlighting might not be provided (the editor might still have basic TextMate coloring as fallback). Once the expression is valid, we use AST for full semantic coloring.

Assuming we got a valid parse tree, we traverse it. We will likely have nodes for literals, identifiers, function invocations, etc. For each, determine token range and type. We accumulate them in an array of `{ line, startChar, length, tokenTypeIndex, tokenModifiersBitmask }`. Then we must encode them as the LSP expects (delta-encoding relative to previous token). The `vscode-languageserver` library might have a helper (SemanticTokensBuilder) on the server side as well, similar to client side. If not, we can manually encode as per spec: sort tokens by position and produce the delta array. But the easier path: use `SemanticTokensBuilder`. According to documentation, one can do:

```ts
let builder = new SemanticTokensBuilder(legend);
builder.push(line, startChar, length, tokenTypeIndex, tokenModifiersBitmask);
...
return builder.build();
```

We will research the exact API; many language server examples do this. The result is returned to the client. We also need to register the legend in the client extension so VS Code knows the token types names. Actually, in LSP, the legend is part of server capabilities we send, and the VS Code client (language client library) uses it under the hood. We might also map token types to TextMate scopes in package.json as mentioned.

**7. Completion Provider (Phase 2):** Although Phase 2, we can stub it now. For instance, implement `connection.onCompletion` to always return an array of a few sample `CompletionItem`s (like the lsp-sample does) to verify the plumbing. The sample returns "TypeScript" and "JavaScript" as dummy suggestions. We will replace with, say, "exists()" and "empty()" or similar as placeholders. This will confirm that when the user hits Ctrl+Space in a FHIRPath file, our server is indeed invoked. In Phase 2, we will expand this list dynamically based on context. We might also implement `onCompletionResolve` if we want to add details when the user selects an item (like showing documentation of that function). We can populate a static dictionary of docs for known functions (possibly extract from the FHIRPath spec). This is a nice-to-have addition to autocompletion.

**8. Testing and Iteration:** With the above implemented, we will test manually with VS Code:

* Create a `.fhirpath` file with a simple expression (e.g. `Patient.name.given | first()` ). Verify no errors if syntax is correct. Introduce an error (like remove a parenthesis) and see the diagnostic appear. The error underline should roughly align with where the parse error is (we’ll adjust if it’s off).
* Check basic syntax colors. If using TextMate grammar, ensure it’s loaded (the language id in bottom right of VS Code should show "FHIRPath"). If using semantic tokens, ensure semantic highlighting is enabled and our tokens are colored. We might use VS Code’s developer inspect tokens feature to see that our token types are recognized.
* Try autocompletion (if stubbed) to see if suggestions pop up.
* We will also add some unit tests if possible for the server logic (for example, call our validateTextDocument with known inputs programmatically and assert that diagnostics come out as expected). The extension sample shows setting up tests for client/server which we can mimic.

**9. Documentation and ADR Completion:** We will document how to build and run the extension. For the ADR, this document itself serves as the design record. We will also summarize the decisions (e.g., *Decision:* Use LSP with existing library, *Alternatives:* as discussed, *Consequences:* need to manage two processes but gain extensibility). This ADR will be circulated for feedback.

**10. Phase 1 Delivery:** After implementing syntax highlighting and error diagnostics, we will deliver the VS Code extension (version 0.1.0). Users will be able to open `.fhirpath` files and immediately benefit from coloring and error checking. This sets the stage for Phase 2.

## Future Work (Phase 2 and beyond)

Once the basic LSP is in place, we will extend it with more advanced features:

* **Autocompletion Context Sensitivity:** Enhance the completion suggestions by integrating knowledge of FHIR resource structures. One idea is to allow the user (or extension) to specify the context type of the expression (for example, if they are writing a FHIRPath for a Patient resource, we could know that `name` or `gender` are valid top-level attributes). We could achieve this by a setting or by detecting if the expression starts with a resource name (e.g. begins with `Patient.`). The `fhirpath` library can load model info (by requiring `fhirpath/fhir-context/r4`, etc.) – with that, it might be possible to query what properties a type has. If so, on seeing `Patient.` and an incomplete path, we could list all Patient element names. This is a significant improvement for usability when authoring FHIRPath in a known context. We will research the library’s capabilities to get available child paths (some libraries provide a way to enumerate possible paths given a context type).

* **Hover Information:** Provide hover tooltip when the user hovers over a function or symbol. For functions, we can show a brief description (from the FHIRPath spec, e.g., “`empty()` returns true if the collection is empty”). For FHIR elements, if context is known and we have StructureDefinition info, we could show the element’s definition (like “Patient.name.given: Given names (usually first names)”). This would require loading FHIR definitions (maybe via an available package or an API). This might be a longer-term enhancement and could potentially be part of a separate extension or an opt-in feature due to the complexity of loading all FHIR metadata.

* **Multi-file/Project Integration:** If users are writing many FHIRPath expressions, we could consider adding features like a workspace symbol search (not very applicable unless .fhirpath files have names and are referenced), or validating expressions against example resources (execution). For example, one could imagine a feature to test a FHIRPath expression against a sample JSON to see the result. While not strictly LSP, the extension could provide a custom command for that. This is beyond the core language support but a potential addition to increase utility.

* **Publishing and Community Feedback:** We will publish the extension to the VS Code Marketplace (and Open VSX for broader availability) once stable. This will also allow users to give feedback which can guide further enhancements (maybe support for embedding FHIRPath in other file types, etc., as mentioned earlier like YAML or FSH files containing FHIRPath).

* **Ensure Cross-Editor Potential:** Because we are using LSP, theoretically this FHIRPath server could work with other editors (like Vim/Neovim LSP clients, Eclipse, etc.). We will keep the server generic (no VS Code specific APIs in it). In the future, we might provide instructions to use the server in other environments. The VS Code client is just one way to deploy; others could reuse `server.js` with their own client. This goal isn’t immediate, but it’s a benefit of our approach.

## Conclusion

In summary, this plan details a comprehensive approach to implement a FHIRPath language service in TypeScript and integrate it with VS Code. By leveraging the existing HL7 FHIRPath library for all parsing and syntax rules, we minimize complexity and ensure compliance with the standard. The Language Server Protocol provides the backbone to deliver features like rich syntax highlighting, real-time error diagnostics, and (eventually) autocompletion to the user’s editor. We have outlined the architecture (a VS Code client extension paired with a Node-based server) and the step-by-step implementation plan covering both initial features and anticipated enhancements.

This design emphasizes maintainability and extensibility: new language features can be added in the server without modifying the editor, and the solution could be extended to other editors that support LSP with minimal effort. By completing Phase 1, we will immediately improve the editing experience for FHIRPath authors (no more guess-and-check in external tools, since errors will be caught inline). Phase 2 will further boost productivity with IntelliSense for FHIRPath.

We will proceed with the implementation as per this plan, and iterate as needed based on testing and feedback. The end result will be a developer-friendly VS Code plugin that makes writing and validating FHIRPath expressions much easier and less error-prone, aligning with our goal of smoother health data specification tooling.

**Sources:**

* HL7 FHIRPath Specification (background on FHIRPath)
* VS Code LSP Extension Guide (rationale and sample code for LSP architecture)
* VS Code Marketplace – FHIRPath Language extension (existing .fhirpath support)
* HL7 `fhirpath` NPM library docs (parser info)
* VS Code LSP Sample (diagnostics and completion handling)
* LSP 3.17 Specification (semantic tokens legend requirements)

Understood. I will provide a detailed technical breakdown of the specific libraries and APIs you should use to implement the FHIRPath LSP server, the VS Code extension client, and support for semantic highlighting.

I'll identify TypeScript libraries, Node.js modules, and relevant APIs from the `vscode-languageserver`, `vscode-languageclient`, and other tools necessary to implement syntax highlighting, diagnostics, and LSP features efficiently.

I'll follow up shortly with the findings.


# Implementing a FHIRPath Language Server and VS Code Extension

## Language Server Implementation (TypeScript/Node)

**Key Libraries:** The FHIRPath language server will be built with the Node.js implementation of the Language Server Protocol. The primary library for this is the **`vscode-languageserver`** package (and its associated types/protocol packages) which provides an LSP server framework in TypeScript. You will typically also use **`vscode-languageserver-textdocument`** for convenient text document management. These libraries simplify implementing document synchronization, diagnostics, and other LSP features.

### Document Synchronization

Document sync in an LSP server is managed via LSP notifications (`textDocument/didOpen`, `didChange`, `didClose`, etc.). The `vscode-languageserver` library provides a **`TextDocuments`** manager to handle these events for you. For example, you can create a document manager as:

```ts
import { TextDocuments } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
```

This `TextDocuments` instance will keep track of open documents and apply incremental updates from the client. You must tell it to listen on the LSP connection for document events, e.g.:

```ts
documents.listen(connection);
connection.listen();
```

This wiring ensures the server receives text updates. In the official sample, the text document manager is initialized and instructed to listen on the connection for open/change/close events. The `TextDocuments` API exposes events like `onDidOpen`, `onDidChangeContent`, and `onDidClose` so you can react to changes. For example, you might register a handler to re-validate the document on every content change:

```ts
documents.onDidChangeContent(change => {
  validateTextDocument(change.document);
});
```

Using `vscode-languageserver-textdocument`’s `TextDocument` class gives you helpful methods like `getText()` and `positionAt(offset)` to retrieve text and compute positions from indices.

When creating the LSP server’s capabilities during initialization, ensure you specify the sync method (e.g., full or incremental). In the initialization handler (`connection.onInitialize`), set `capabilities.textDocumentSync = TextDocumentSyncKind.Incremental` to support incremental updates.

### Diagnostics (Error Reporting)

After each change, the server should validate the FHIRPath expression and report errors as **diagnostics**. The LSP defines a `textDocument/publishDiagnostics` notification for this purpose, and `vscode-languageserver` exposes an easy way to send them. Use the **`Diagnostic`** type to format each error (with message, severity, and a range highlighting the problematic text). Then send them via `connection.sendDiagnostics()`. For example:

```ts
let diagnostics: Diagnostic[] = [];
// ... populate diagnostics array by parsing the FHIRPath expression ...
connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
```

The VS Code LSP guide shows a simple validation loop that creates a Diagnostic for each issue and pushes it to an array, then publishes it. A Diagnostic requires a **`range`** (start and end positions in the document), a severity (e.g. Error or Warning), and a message. If the FHIRPath parser throws syntax errors, you would catch those, map them to character positions in the document, and create diagnostics accordingly. For example, if the parser reports an unexpected token at a certain index, you can convert that index to a `{ start, end }` position range using `TextDocument.positionAt(...)`. Then call `sendDiagnostics` with the document URI. The language client (VS Code) will display these in the Problems panel automatically.

**Related APIs:** The `Diagnostic` and `DiagnosticSeverity` classes are provided by `vscode-languageserver` (or its types submodule). You also have `Diagnostic.relatedInformation` for additional context, though that’s optional. The act of sending diagnostics is done with `Connection.sendDiagnostics`, which takes an object containing the document URI and the array of diagnostics.

There are also utility classes like **`ErrorMessageTracker`** in `vscode-languageserver` which can coalesce repeated errors, but for most cases you can directly send diagnostics as shown above.

### Semantic Token Highlighting (Server Side)

To support semantic highlighting in editors, the LSP server must implement the **Semantic Tokens** requests. The key steps are: advertise the capability in server initialization, define a token legend, and handle the token requests. In the `onInitialize` response, include a `semanticTokensProvider` in your capabilities. For example:

```ts
connection.onInitialize(params => {
  return { capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      semanticTokensProvider: {
        legend: {
          tokenTypes: ['function', 'number', 'string', /* ... */],
          tokenModifiers: []
        },
        full: true,
        range: true
      }
  }};
});
```

This declares that the server can provide full-document semantic tokens (and in this case, range-based requests as well) with a given legend of token types and modifiers. The **legend** is critical – it lists the token types (e.g. `"function"`, `"keyword"`, `"number"`, etc.) and token modifiers (like `"declaration"`, `"static"`, etc.) that your server will use. The client (VS Code) will map these to colors/styles according to its theme.

On the server, you handle the actual request by implementing a handler for the `"textDocument/semanticTokens/full"` request (and `".../range"` if range is supported). With the `vscode-languageserver` API, you can register a handler via `connection.onRequest`. For example:

```ts
connection.onRequest('textDocument/semanticTokens/full', (params: SemanticTokensParams) => {
  const doc = documents.get(params.textDocument.uri);
  return doc ? computeSemanticTokens(doc) : { data: [] };
});
```

In the `computeSemanticTokens` function, you use your FHIRPath parser analysis to determine the tokens and their types. The LSP **`SemanticTokens`** response is a compact integer array. However, the server SDK provides a helper **`SemanticTokensBuilder`** class to simplify token construction. You can do:

```ts
import { SemanticTokensBuilder } from 'vscode-languageserver';
const builder = new SemanticTokensBuilder();
// For each identified token in the FHIRPath AST:
builder.push(line, startChar, length, tokenTypeIndex, tokenModifiersBitmask);
return builder.build();  // returns a SemanticTokens object
```

Here `tokenTypeIndex` is the index into your legend’s tokenTypes array (e.g., 0 for "function", 1 for "number", etc.), and `tokenModifiersBitmask` is an integer where each bit represents a modifier (often 0 if no modifiers). The builder will handle computing the LSP-required delta-encoded array format for you. Finally, it outputs a `SemanticTokens` object with a `data` property (the integer array) when you call `build()`.

**Documentation & Classes:** The semantic tokens feature was added in LSP 3.16+, and classes like `SemanticTokensBuilder` are part of the `vscode-languageserver` module. The protocol types `SemanticTokens`, `SemanticTokensParams`, `SemanticTokensLegend` etc. come from `vscode-languageserver-protocol` (usually re-exported by the main library). For reference, the VS Code LSP spec shows how tokens are encoded (5 integers per token: deltaLine, deltaStartChar, length, tokenType, tokenModifiers). Using the builder abstracts that away.

Once this is set up, VS Code will request semantic tokens whenever needed (e.g., on document open or change) and apply the highlighting on top of syntax grammar highlighting. You generally **do not push tokens proactively**; you respond to the client’s requests with the computed tokens.

## VS Code Extension Client Implementation

On the client side (the VS Code extension), you will use the **VS Code Extension API** and the **`vscode-languageclient`** library to connect VS Code to your language server. The extension acts as an LSP **client**.

### Registering the FHIRPath Language

First, VS Code needs to recognize the `.fhirpath` file extension and associate it with a language ID. In your extension’s `package.json` manifest, contribute a language entry. For example:

```json
"contributes": {
  "languages": [{
    "id": "fhirpath",
    "aliases": ["FHIRPath"],
    "extensions": [".fhirpath"],
    "configuration": "./language-configuration.json"
  }],
  "activationEvents": [
    "onLanguage:fhirpath"
  ],
  ...
}
```

This declares a new language called "fhirpath" with the `.fhirpath` extension. It also ensures the extension activates when a FHIRPath file is opened (`onLanguage:fhirpath`). The `language-configuration.json` can define comment syntax, brackets, etc., if needed (not mandatory, but helpful for editor features like commenting and bracket matching).

Alternatively, you could register the language programmatically via the VS Code API (`vscode.languages.setLanguageConfiguration` or similar), but using the manifest is simpler and standard. Once registered, VS Code will treat `.fhirpath` files as language "fhirpath", and your extension can target that in its language client.

### Connecting the Language Client to the Server

The **`vscode-languageclient`** Node library provides a `LanguageClient` class which manages launching the server process and communicating with it over IPC (or other transports). In your extension’s activation function, you typically:

1. Define how to start the server, and
2. Create & start the `LanguageClient`.

**Server launch options:** If your server is implemented in TypeScript/Node and packaged with the extension, you can launch it by referencing its module. For example:

```ts
import * as path from 'path';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';

let serverModule = context.asAbsolutePath(path.join('server', 'out', 'server.js'));
let serverOptions: ServerOptions = {
  run:   { module: serverModule, transport: TransportKind.ipc },
  debug: { module: serverModule, transport: TransportKind.ipc, options: { execArgv: ["--nolazy", "--inspect=6009"] } }
};
```

Here we prepare to run the `server.js` (the compiled server module) in a separate process using Node’s IPC for communication. The `debug` section allows debugging the server (by enabling the Node inspector on port 6009 in this case). `TransportKind.ipc` is common for Node servers; it uses VS Code’s built-in IPC channel. Alternatively, for an external server you might use `TransportKind.stdio` or sockets.

**Client options:** Next, configure `LanguageClientOptions`. The most important option is the `documentSelector`, which tells the client for which files it should activate. For FHIRPath, you’d use something like:

```ts
const clientOptions: LanguageClientOptions = {
  documentSelector: [{ scheme: 'file', language: 'fhirpath' }],
  synchronize: {
    // optional: file watchers or configuration synchronization
  }
};
```

This example uses the `fhirpath` language ID so that the client attaches to all files with that language. The `synchronize` block can notify the server about file changes (e.g., if you want to watch certain config files) – often not needed unless your server requires it. Now instantiate the client:

```ts
const client = new LanguageClient(
    'fhirpathLanguageServer',            // internally used ID
    'FHIRPath Language Server',          // display name (for logs)
    serverOptions,
    clientOptions
);
client.start();
```

By calling `start()`, the LanguageClient will launch the server (using the `serverOptions` defined) and establish the LSP connection. From here on, the client handles all messaging: it will send didOpen/didChange notifications for `.fhirpath` documents, route user requests (e.g. completion requests) to the server, and apply server responses (like diagnostics, hovers, etc.) in the editor.

**Under the hood:** The `vscode-languageclient` library abstracts the VS Code extension API for LSP. It internally registers VS Code **Language Features** providers for things the server advertises. For instance, when the server reports capabilities like completionProvider or definitionProvider, the LanguageClient will register the corresponding `vscode.languages.registerCompletionItemProvider`, etc., that call into the server. It also automatically listens for `textDocument/publishDiagnostics` messages and displays them. This means you typically do not need to use the raw `vscode.languages.createDiagnosticCollection` – the language client does it. In the extension’s `package.json`, ensure you list `vscode-languageclient` in `dependencies` and the compatible VS Code engine (e.g., VS Code 1.52.0+ for language client 7.x).

### Semantic Tokens on the Client Side

For semantic highlighting, the client needs to indicate it can handle semantic tokens and coordinate with the server. Modern versions of `vscode-languageclient` (v7+ which corresponds to LSP 3.16/3.17) include support for semantic tokens. When you use `LanguageClient.start()`, it will send the client’s capabilities in the initialize request. By default, VS Code’s client capabilities include semanticTokens if the editor version supports it. However, if you are using an older version of the language client, you might need to enable **proposed features**. One way is to initialize the LanguageClient with `client.registerProposedFeatures()` or use the `ProposedFeatures` export on the server side. In practice, using the latest stable library is easiest – for example, the official sample uses `ProposedFeatures.all` when creating the server connection to include all preview LSP features (semantic tokens was a proposed feature in older LSP versions).

When the server advertises `semanticTokensProvider` in its capabilities, the `LanguageClient` will handle the registration of a semantic token provider with VS Code. Essentially, it tells VS Code: “for documents of language fhirpath, when semantic tokens are needed, ask me (the LanguageClient)”. You typically do not have to manually call `vscode.languages.registerDocumentSemanticTokensProvider` in your client code – the language client does that if the protocol is set up. It uses the legend provided by the server to map token type indices to token types. If needed, you can access the legend via `LanguageClient.initializeResult` after the client is ready, but this is rarely necessary.

**Relevant APIs:** In VS Code’s API, there is a `DocumentSemanticTokensProvider` interface and a `languages.registerDocumentSemanticTokensProvider` function. The language client essentially implements this for you. If you were implementing the client from scratch, you would use those to register a provider that calls the LSP `textDocument/semanticTokens` request and returns a `SemanticTokens`. With the language client library, this boilerplate is handled internally as long as both client and server support the feature. For completeness, if one were to do it manually, it would look like the example in the VS Code API docs: creating a `vscode.SemanticTokensLegend` with token types and modifiers, then registering a provider that calls your LSP server. But again, **if you use `vscode-languageclient`, simply ensure the server capability is present** and the client will register it.

One thing to remember is that semantic token highlighting must be enabled by the user’s theme. Most default themes support it, but they might choose whether to prioritize semantic colors. The VS Code Semantic Highlighting Guide explains that semantic tokens are an addition on top of syntax highlighting, and themes can opt in. There’s usually no action needed in your extension for this, but you may document that users should use a theme that supports semantic coloring for full effect.

## Summary of Important Libraries and APIs

* **`vscode-languageserver`** (Node) – Provides the server skeleton. Key classes: `createConnection()` to create an IPC connection; `TextDocuments` for document sync (with `listen` to tie into the connection); `Diagnostic` for diagnostics; `SemanticTokensBuilder` for constructing semantic token data easily; plus onDidChangeContent, onInitialize, onRequest handlers, etc. Documentation: *VS Code API – Language Server Extension Guide* and the \[**vscode-languageserver** npm docs].

* **`vscode-languageserver-textdocument`** – Utility to create a TextDocument class implementation (provides text content, offsets to positions, etc.). This is typically used in tandem with `TextDocuments` manager.

* **FHIRPath parsing/analyzing library** – Not an LSP library per se, but you mentioned it's available. This would be used inside your server’s validation and token computation logic (e.g., to produce an AST or detect tokens). For example, you might use it in `validateTextDocument()` to catch syntax errors and in `computeSemanticTokens()` to walk the AST and identify token types. Ensure it can provide token positions or you have to derive them from the text.

* **`vscode-languageclient`** (Node) – Used in the VS Code extension to create the client that connects to the server. Important classes/interfaces: `LanguageClient`, `LanguageClientOptions`, `ServerOptions`, `TransportKind`. Methods: `start()` (starts the server process and client), and `stop()` (usually called in `deactivate()`). This library also includes middleware and hooks if you need to intercept or augment communication, but for basic use you configure and start it.

* **VS Code Extension API (`vscode` namespace)** – Used mainly for extension setup. For example, the `workspace.createFileSystemWatcher` can be passed in `synchronize.fileEvents` if you want the server to know about file changes. The `ExtensionContext` is used to find the server module path (`context.asAbsolutePath`). You also rely on the extension manifest (package.json) to declare the language and possibly commands or settings if needed.

* **Semantic Tokens Specific APIs:** If needed, `vscode` API offers `SemanticTokensLegend` and `SemanticTokensBuilder` on the client side, but in practice with LSP you mostly deal with the legend via LSP. The LSP types for semantic tokens come from `vscode-languageserver-protocol` (for example, `SemanticTokensParams`, `SemanticTokens`, `SemanticTokensDelta`, etc.), but you usually use them through the server library. The communication is handled via the `textDocument/semanticTokens/*` requests as defined in the LSP spec.

* **Additional Utilities:** Depending on your needs, you might consider:

  * **`vscode-uri`**: A utility to handle URI parsing if you need to manipulate document URIs.
  * **Diagnostics helpers**: If your FHIRPath lib gives line/col of errors, you may use those directly. Otherwise, a small helper to convert line/col to offset could be written (though `TextDocument` provides `offsetAt(position)` and `positionAt(offset)` which cover this).
  * **Text document utilities**: The LSP TextDocument (from `vscode-languageserver-textdocument`) already provides a lot, including managing the content changes if you use its update methods via the TextDocuments manager.
  * **Logging**: You can use `connection.console.log()` for logging in the server (it shows up in the VS Code output). Or use the built-in logging support of LanguageClient by enabling tracing (`"[yourLanguageId].trace.server": "verbose"` in settings).

By leveraging these libraries and APIs, you can implement a robust FHIRPath language server. The **server** handles text sync, parses FHIRPath expressions and reports any syntax errors via diagnostics, and provides semantic tokens for rich highlighting. The **VS Code extension (client)** is relatively light-weight: it registers the `.fhirpath` language, starts the server, and relies on the language client framework to forward editor events and apply server responses (like showing squiggly lines for diagnostics or coloring tokens). All the heavy lifting of LSP communication (including semantic token requests) is managed by the `vscode-languageclient`/`vscode-languageserver` libraries, following the patterns described in the official documentation and examples.

**References:**

* Visual Studio Code Official LSP Extension Guide (client/server example)
* *vscode-languageserver* npm documentation (classes like TextDocuments, SemanticTokensBuilder)
* Stack Overflow discussion on implementing semantic tokens in LSP
* VS Code API docs on Semantic Highlighting and Language Extensions

