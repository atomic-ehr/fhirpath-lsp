/**
 * Level-based log filtering
 */

import { ILogFilter, LogEntry, LogLevel } from '../types';

export class LevelFilter implements ILogFilter {
  private minLevel: LogLevel;
  private maxLevel: LogLevel;
  private allowedLevels?: Set<LogLevel>;

  constructor(options: LevelFilterOptions) {
    this.minLevel = options.minLevel ?? LogLevel.ERROR;
    this.maxLevel = options.maxLevel ?? LogLevel.TRACE;
    
    if (options.allowedLevels) {
      this.allowedLevels = new Set(options.allowedLevels);
    }
  }

  shouldLog(entry: LogEntry): boolean {
    if (this.allowedLevels) {
      return this.allowedLevels.has(entry.level);
    }

    return entry.level >= this.minLevel && entry.level <= this.maxLevel;
  }

  setMinLevel(level: LogLevel): void {
    this.minLevel = level;
    this.allowedLevels = undefined;
  }

  setMaxLevel(level: LogLevel): void {
    this.maxLevel = level;
    this.allowedLevels = undefined;
  }

  setAllowedLevels(levels: LogLevel[]): void {
    this.allowedLevels = new Set(levels);
  }

  clearAllowedLevels(): void {
    this.allowedLevels = undefined;
  }
}

export interface LevelFilterOptions {
  minLevel?: LogLevel;
  maxLevel?: LogLevel;
  allowedLevels?: LogLevel[];
}