/**
 * Request context management for LSP operations
 */

import { LogContext, DiagnosticLogContext, ProviderLogContext, ServiceLogContext } from '../types';
import { correlationContext } from './CorrelationContext';

export class RequestContextManager {
  private static instance: RequestContextManager;
  private requestContexts = new Map<string, LogContext>();

  static getInstance(): RequestContextManager {
    if (!RequestContextManager.instance) {
      RequestContextManager.instance = new RequestContextManager();
    }
    return RequestContextManager.instance;
  }

  createRequestContext(
    component: string,
    operation: string,
    documentUri?: string,
    additionalContext: Partial<LogContext> = {}
  ): LogContext {
    const correlationCtx = correlationContext.createContext(undefined, {
      component,
      operation,
      documentUri
    });

    const context: LogContext = {
      component,
      operation,
      documentUri,
      requestId: correlationCtx.correlationId,
      sessionId: this.getOrCreateSessionId(),
      source: this.getSourceInfo(),
      tags: additionalContext.tags || [],
      ...additionalContext
    };

    this.requestContexts.set(correlationCtx.correlationId, context);
    correlationContext.setActiveContext(correlationCtx);

    return context;
  }

  createDiagnosticContext(
    documentUri: string,
    expression: string,
    additionalContext: Partial<DiagnosticLogContext> = {}
  ): DiagnosticLogContext {
    const baseContext = this.createRequestContext(
      'diagnostic',
      'validateExpression',
      documentUri
    );

    const diagnosticContext: DiagnosticLogContext = {
      ...baseContext,
      expression,
      parsePhase: additionalContext.parsePhase || 'validation',
      diagnosticType: additionalContext.diagnosticType || 'syntax',
      resourceType: additionalContext.resourceType,
      lineNumber: additionalContext.lineNumber,
      columnNumber: additionalContext.columnNumber,
      ...additionalContext
    };

    return diagnosticContext;
  }

  createProviderContext(
    provider: string,
    method: string,
    documentUri?: string,
    additionalContext: Partial<ProviderLogContext> = {}
  ): ProviderLogContext {
    const baseContext = this.createRequestContext(
      'provider',
      `${provider}.${method}`,
      documentUri
    );

    const providerContext: ProviderLogContext = {
      ...baseContext,
      provider,
      method,
      params: additionalContext.params,
      resultCount: additionalContext.resultCount,
      cached: additionalContext.cached || false,
      ...additionalContext
    };

    return providerContext;
  }

  createServiceContext(
    service: string,
    method: string,
    additionalContext: Partial<ServiceLogContext> = {}
  ): ServiceLogContext {
    const baseContext = this.createRequestContext(
      'service',
      `${service}.${method}`
    );

    const serviceContext: ServiceLogContext = {
      ...baseContext,
      service,
      method,
      resourceId: additionalContext.resourceId,
      cacheHit: additionalContext.cacheHit || false,
      backgroundTask: additionalContext.backgroundTask || false,
      ...additionalContext
    };

    return serviceContext;
  }

  getRequestContext(requestId: string): LogContext | undefined {
    return this.requestContexts.get(requestId);
  }

  updateRequestContext(requestId: string, updates: Partial<LogContext>): void {
    const context = this.requestContexts.get(requestId);
    if (context) {
      Object.assign(context, updates);
    }
  }

  endRequest(requestId: string): void {
    this.requestContexts.delete(requestId);
    correlationContext.removeContext(requestId);
  }

  private getOrCreateSessionId(): string {
    // In a real implementation, this might be tied to the LSP connection
    return process.pid.toString();
  }

  private getSourceInfo() {
    const stack = new Error().stack;
    if (!stack) return undefined;

    // Parse stack trace to get meaningful source information
    const lines = stack.split('\n');
    for (let i = 2; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('server/src/') && !line.includes('logging/')) {
        const match = line.match(/at\s+(?:(\w+)\.)?(\w+)\s+\((.+):(\d+):(\d+)\)/);
        if (match) {
          const [, className, functionName, file, lineNumber] = match;
          return {
            class: className,
            function: functionName,
            file: file.split('/').pop(),
            line: parseInt(lineNumber, 10)
          };
        }
      }
    }

    return undefined;
  }

  getActiveRequestContext(): LogContext | undefined {
    const activeCorrelation = correlationContext.getActiveContext();
    return activeCorrelation ? this.requestContexts.get(activeCorrelation.correlationId) : undefined;
  }

  cleanupExpiredRequests(maxAge: number = 300000): void {
    correlationContext.clearExpiredContexts(maxAge);
    
    // Clean up request contexts that no longer have correlation contexts
    for (const [requestId] of this.requestContexts) {
      if (!correlationContext.getContext(requestId)) {
        this.requestContexts.delete(requestId);
      }
    }
  }

  getStats() {
    return {
      activeRequests: this.requestContexts.size,
      correlationStats: correlationContext.getStats()
    };
  }
}

// Singleton instance
export const requestContext = RequestContextManager.getInstance();