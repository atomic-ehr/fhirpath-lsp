/**
 * Component-based log filtering
 */

import { ILogFilter, LogEntry } from '../types';

export class ComponentFilter implements ILogFilter {
  private allowedComponents: Set<string>;
  private blockedComponents: Set<string>;
  private allowedOperations: Set<string>;
  private blockedOperations: Set<string>;
  private componentPatterns: RegExp[];
  private operationPatterns: RegExp[];

  constructor(options: ComponentFilterOptions = {}) {
    this.allowedComponents = new Set(options.allowedComponents || []);
    this.blockedComponents = new Set(options.blockedComponents || []);
    this.allowedOperations = new Set(options.allowedOperations || []);
    this.blockedOperations = new Set(options.blockedOperations || []);
    this.componentPatterns = (options.componentPatterns || []).map(p => new RegExp(p));
    this.operationPatterns = (options.operationPatterns || []).map(p => new RegExp(p));
  }

  shouldLog(entry: LogEntry): boolean {
    const component = entry.context?.component;
    const operation = entry.context?.operation;

    // Check blocked components first
    if (component && this.blockedComponents.has(component)) {
      return false;
    }

    // Check blocked operations
    if (operation && this.blockedOperations.has(operation)) {
      return false;
    }

    // Check blocked patterns
    if (component && this.componentPatterns.some(pattern => pattern.test(component))) {
      return false;
    }

    if (operation && this.operationPatterns.some(pattern => pattern.test(operation))) {
      return false;
    }

    // If we have allowed lists, entry must match at least one
    const hasAllowedComponents = this.allowedComponents.size > 0;
    const hasAllowedOperations = this.allowedOperations.size > 0;

    if (hasAllowedComponents || hasAllowedOperations) {
      let componentMatch = !hasAllowedComponents; // Default to true if no component filter
      let operationMatch = !hasAllowedOperations; // Default to true if no operation filter

      if (hasAllowedComponents && component) {
        componentMatch = this.allowedComponents.has(component);
      }

      if (hasAllowedOperations && operation) {
        operationMatch = this.allowedOperations.has(operation);
      }

      return componentMatch && operationMatch;
    }

    return true;
  }

  addAllowedComponent(component: string): void {
    this.allowedComponents.add(component);
  }

  removeAllowedComponent(component: string): void {
    this.allowedComponents.delete(component);
  }

  addBlockedComponent(component: string): void {
    this.blockedComponents.add(component);
  }

  removeBlockedComponent(component: string): void {
    this.blockedComponents.delete(component);
  }

  addAllowedOperation(operation: string): void {
    this.allowedOperations.add(operation);
  }

  removeAllowedOperation(operation: string): void {
    this.allowedOperations.delete(operation);
  }

  addBlockedOperation(operation: string): void {
    this.blockedOperations.add(operation);
  }

  removeBlockedOperation(operation: string): void {
    this.blockedOperations.delete(operation);
  }

  addComponentPattern(pattern: string): void {
    this.componentPatterns.push(new RegExp(pattern));
  }

  addOperationPattern(pattern: string): void {
    this.operationPatterns.push(new RegExp(pattern));
  }

  clearAllowedComponents(): void {
    this.allowedComponents.clear();
  }

  clearBlockedComponents(): void {
    this.blockedComponents.clear();
  }

  clearAllowedOperations(): void {
    this.allowedOperations.clear();
  }

  clearBlockedOperations(): void {
    this.blockedOperations.clear();
  }

  getStats() {
    return {
      allowedComponents: Array.from(this.allowedComponents),
      blockedComponents: Array.from(this.blockedComponents),
      allowedOperations: Array.from(this.allowedOperations),
      blockedOperations: Array.from(this.blockedOperations),
      componentPatterns: this.componentPatterns.map(p => p.source),
      operationPatterns: this.operationPatterns.map(p => p.source)
    };
  }
}

export interface ComponentFilterOptions {
  allowedComponents?: string[];
  blockedComponents?: string[];
  allowedOperations?: string[];
  blockedOperations?: string[];
  componentPatterns?: string[];
  operationPatterns?: string[];
}