import {
  IFuzzySearchService,
  FuzzySearchResult,
  SymbolEntry,
} from '../types/WorkspaceSymbolTypes';

/**
 * Service for fuzzy searching symbols with scoring and ranking
 */
export class FuzzySearchService implements IFuzzySearchService {
  
  /**
   * Perform fuzzy search on symbol names
   */
  search(
    query: string,
    items: SymbolEntry[],
    options: {
      threshold?: number;
      maxResults?: number;
      keys?: string[];
    } = {}
  ): FuzzySearchResult[] {
    const {
      threshold = 0.3,
      maxResults = 100,
      keys = ['name']
    } = options;

    if (!query.trim()) {
      return items.slice(0, maxResults).map(item => ({
        item,
        score: 1.0,
        matches: []
      }));
    }

    const results: FuzzySearchResult[] = [];
    const queryLower = query.toLowerCase();

    for (const item of items) {
      const bestScore = this.getBestScore(queryLower, item, keys);
      
      if (bestScore.score >= threshold) {
        results.push({
          item,
          score: bestScore.score,
          matches: bestScore.matches
        });
      }
    }

    // Sort by score (descending) and limit results
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, maxResults);
  }

  /**
   * Calculate the best score for an item across all searchable keys
   */
  private getBestScore(
    query: string,
    item: SymbolEntry,
    keys: string[]
  ): { score: number; matches: { indices: number[][]; key: string }[] } {
    let bestScore = 0;
    const allMatches: { indices: number[][]; key: string }[] = [];

    for (const key of keys) {
      const value = this.getValueByKey(item, key);
      if (!value) continue;

      const { score, matches } = this.fuzzyMatch(query, value.toLowerCase());
      
      if (score > bestScore) {
        bestScore = score;
      }
      
      if (matches.length > 0) {
        allMatches.push({ indices: matches, key });
      }
    }

    return { score: bestScore, matches: allMatches };
  }

  /**
   * Get value from symbol entry by key
   */
  private getValueByKey(item: SymbolEntry, key: string): string | undefined {
    switch (key) {
      case 'name':
        return item.name;
      case 'context':
        return item.context;
      case 'fhirPath':
        return item.fhirPath;
      case 'detail':
        return item.detail;
      case 'containerName':
        return item.containerName;
      default:
        return undefined;
    }
  }

  /**
   * Perform fuzzy matching between query and target string
   */
  private fuzzyMatch(
    query: string,
    target: string
  ): { score: number; matches: number[][] } {
    if (query === target) {
      return { score: 1.0, matches: [[0, target.length - 1]] };
    }

    // Exact substring match gets high score
    const exactIndex = target.indexOf(query);
    if (exactIndex !== -1) {
      return {
        score: 0.9 - (exactIndex * 0.1), // Prefer matches at start
        matches: [[exactIndex, exactIndex + query.length - 1]]
      };
    }

    // Fuzzy matching using subsequence algorithm
    const { score, matches } = this.subsequenceMatch(query, target);
    return { score, matches };
  }

  /**
   * Calculate subsequence match score and positions
   */
  private subsequenceMatch(
    query: string,
    target: string
  ): { score: number; matches: number[][] } {
    const matches: number[][] = [];
    let queryIndex = 0;
    let targetIndex = 0;
    let currentMatch: number[] = [];
    let consecutiveMatches = 0;
    let totalMatches = 0;

    while (queryIndex < query.length && targetIndex < target.length) {
      if (query[queryIndex] === target[targetIndex]) {
        if (currentMatch.length === 0) {
          currentMatch = [targetIndex];
        }
        
        queryIndex++;
        totalMatches++;
        consecutiveMatches++;
      } else {
        if (currentMatch.length > 0) {
          currentMatch.push(targetIndex - 1);
          matches.push(currentMatch);
          currentMatch = [];
        }
        consecutiveMatches = 0;
      }
      targetIndex++;
    }

    // Add final match if exists
    if (currentMatch.length > 0) {
      currentMatch.push(targetIndex - 1);
      matches.push(currentMatch);
    }

    // Calculate score based on various factors
    if (totalMatches === 0) {
      return { score: 0, matches: [] };
    }

    const completionRatio = totalMatches / query.length;
    const densityRatio = totalMatches / target.length;
    const consecutiveBonus = consecutiveMatches / query.length;
    
    // Weight factors for scoring
    const score = (
      completionRatio * 0.5 +      // How much of query was matched
      densityRatio * 0.3 +         // How dense the matches are
      consecutiveBonus * 0.2       // Bonus for consecutive matches
    );

    return { score: Math.min(score, 0.95), matches }; // Cap at 0.95 (exact match is 1.0)
  }

  /**
   * Calculate similarity score between two strings
   */
  calculateScore(query: string, target: string): number {
    if (!query || !target) return 0;
    
    const queryLower = query.toLowerCase();
    const targetLower = target.toLowerCase();
    
    // Exact match
    if (queryLower === targetLower) return 1.0;
    
    // Substring match
    if (targetLower.includes(queryLower)) {
      const index = targetLower.indexOf(queryLower);
      return 0.9 - (index * 0.1); // Prefer matches at start
    }
    
    // Fuzzy match
    return this.fuzzyMatch(queryLower, targetLower).score;
  }

  /**
   * Get search suggestions based on query
   */
  getSuggestions(query: string, items: SymbolEntry[]): string[] {
    if (!query.trim()) return [];
    
    const results = this.search(query, items, { maxResults: 10 });
    return results.map(result => result.item.name);
  }

  /**
   * Compute Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() =>
      Array(str1.length + 1).fill(null)
    );

    for (let i = 0; i <= str1.length; i++) {
      matrix[0][i] = i;
    }

    for (let j = 0; j <= str2.length; j++) {
      matrix[j][0] = j;
    }

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,     // deletion
          matrix[j - 1][i] + 1,     // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Calculate similarity based on edit distance
   */
  calculateEditSimilarity(str1: string, str2: string): number {
    const maxLength = Math.max(str1.length, str2.length);
    if (maxLength === 0) return 1.0;
    
    const distance = this.levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
    return 1 - (distance / maxLength);
  }

  /**
   * Check if query matches target using common abbreviation patterns
   */
  private matchesAbbreviation(query: string, target: string): boolean {
    // Check if query matches first letters of words in target
    const words = target.toLowerCase().split(/[\s\-_.]/);
    const abbreviation = words.map(word => word[0]).join('');
    
    return abbreviation.startsWith(query.toLowerCase());
  }

  /**
   * Enhanced scoring that considers multiple matching strategies
   */
  getEnhancedScore(query: string, target: string): number {
    const queryLower = query.toLowerCase();
    const targetLower = target.toLowerCase();
    
    // Exact match
    if (queryLower === targetLower) return 1.0;
    
    // Prefix match (very high score)
    if (targetLower.startsWith(queryLower)) {
      return 0.95 - (query.length / target.length * 0.1);
    }
    
    // Abbreviation match
    if (this.matchesAbbreviation(queryLower, targetLower)) {
      return 0.8;
    }
    
    // Substring match
    if (targetLower.includes(queryLower)) {
      const index = targetLower.indexOf(queryLower);
      return 0.7 - (index / target.length * 0.2);
    }
    
    // Fuzzy match
    const fuzzyScore = this.fuzzyMatch(queryLower, targetLower).score;
    
    // Edit distance based similarity
    const editScore = this.calculateEditSimilarity(queryLower, targetLower);
    
    // Return the better of fuzzy or edit score
    return Math.max(fuzzyScore, editScore * 0.6);
  }
}