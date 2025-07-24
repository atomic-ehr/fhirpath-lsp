import {
  SemanticTokens,
  SemanticTokensBuilder,
  Position
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { FHIRPathService, TokenType } from '../parser/FHIRPathService';

export class SemanticTokenProvider {
  private tokenTypeMap = new Map<TokenType, number>([
    [TokenType.Function, 0],     // 'function'
    [TokenType.Identifier, 3],   // 'property'
    [TokenType.Operator, 4],     // 'operator'
    [TokenType.Keyword, 5],      // 'keyword'
    [TokenType.String, 6],       // 'string'
    [TokenType.Number, 7],       // 'number'
    [TokenType.Boolean, 8]       // 'boolean'
  ]);
  
  constructor(
    private fhirPathService: FHIRPathService,
    private legend: { tokenTypes: string[], tokenModifiers: string[] }
  ) {}
  
  provideSemanticTokens(document: TextDocument): SemanticTokens {
    const builder = new SemanticTokensBuilder();
    const parseResult = this.fhirPathService.parse(document.getText());
    
    if (parseResult.success && parseResult.tokens) {
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
      this.fallbackTokenization(document.getText(), builder);
    }
    
    return builder.build();
  }
  
  private fallbackTokenization(text: string, builder: SemanticTokensBuilder): void {
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