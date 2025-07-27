/**
 * Correlation context management for request tracing
 */

import { randomUUID, randomBytes } from 'crypto';
import { CorrelationContext } from '../types';

export class CorrelationContextManager {
  private static instance: CorrelationContextManager;
  private contexts = new Map<string, CorrelationContext>();
  private activeContext: CorrelationContext | null = null;
  private generator: () => string = randomUUID;

  static getInstance(): CorrelationContextManager {
    if (!CorrelationContextManager.instance) {
      CorrelationContextManager.instance = new CorrelationContextManager();
    }
    return CorrelationContextManager.instance;
  }

  setIdGenerator(generator: 'uuid' | 'short' | (() => string)): void {
    if (typeof generator === 'function') {
      this.generator = generator;
    } else if (generator === 'uuid') {
      this.generator = randomUUID;
    } else if (generator === 'short') {
      this.generator = () => randomBytes(6).toString('hex');
    }
  }

  createContext(parentId?: string, metadata: Record<string, any> = {}): CorrelationContext {
    const correlationId = this.generator();
    const context: CorrelationContext = {
      correlationId,
      parentId,
      startTime: new Date(),
      metadata: { ...metadata }
    };

    this.contexts.set(correlationId, context);
    return context;
  }

  setActiveContext(context: CorrelationContext): void {
    this.activeContext = context;
  }

  getActiveContext(): CorrelationContext | null {
    return this.activeContext;
  }

  getContext(correlationId: string): CorrelationContext | undefined {
    return this.contexts.get(correlationId);
  }

  updateContextMetadata(correlationId: string, metadata: Record<string, any>): void {
    const context = this.contexts.get(correlationId);
    if (context) {
      Object.assign(context.metadata, metadata);
    }
  }

  removeContext(correlationId: string): void {
    this.contexts.delete(correlationId);
  }

  clearExpiredContexts(maxAge: number = 3600000): void {
    const now = Date.now();
    for (const [id, context] of this.contexts.entries()) {
      if (now - context.startTime.getTime() > maxAge) {
        this.contexts.delete(id);
      }
    }
  }

  runWithContext<T>(context: CorrelationContext, fn: () => T): T {
    const previousContext = this.activeContext;
    this.setActiveContext(context);
    try {
      return fn();
    } finally {
      this.activeContext = previousContext;
    }
  }

  async runWithContextAsync<T>(context: CorrelationContext, fn: () => Promise<T>): Promise<T> {
    const previousContext = this.activeContext;
    this.setActiveContext(context);
    try {
      return await fn();
    } finally {
      this.activeContext = previousContext;
    }
  }

  createChildContext(metadata: Record<string, any> = {}): CorrelationContext {
    const parentId = this.activeContext?.correlationId;
    return this.createContext(parentId, metadata);
  }

  getContextChain(correlationId: string): CorrelationContext[] {
    const chain: CorrelationContext[] = [];
    let currentId: string | undefined = correlationId;

    while (currentId) {
      const context = this.contexts.get(currentId);
      if (!context) break;
      
      chain.unshift(context);
      currentId = context.parentId;
    }

    return chain;
  }

  getStats() {
    return {
      activeContexts: this.contexts.size,
      currentContext: this.activeContext?.correlationId || null,
      memoryUsage: this.contexts.size * 200 // rough estimate
    };
  }
}

// Singleton instance
export const correlationContext = CorrelationContextManager.getInstance();