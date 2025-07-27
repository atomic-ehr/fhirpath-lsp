/**
 * Diagnostic context management for FHIRPath expression analysis
 */

import { DiagnosticLogContext, LogContext } from '../types';
import { requestContext } from './RequestContext';

export class DiagnosticContextManager {
  private static instance: DiagnosticContextManager;
  private diagnosticSessions = new Map<string, DiagnosticSession>();

  static getInstance(): DiagnosticContextManager {
    if (!DiagnosticContextManager.instance) {
      DiagnosticContextManager.instance = new DiagnosticContextManager();
    }
    return DiagnosticContextManager.instance;
  }

  startDiagnosticSession(
    documentUri: string,
    expression: string,
    resourceType?: string
  ): DiagnosticSession {
    const context = requestContext.createDiagnosticContext(
      documentUri,
      expression,
      { resourceType }
    );

    const session = new DiagnosticSession(context);
    this.diagnosticSessions.set(context.requestId!, session);

    return session;
  }

  getDiagnosticSession(requestId: string): DiagnosticSession | undefined {
    return this.diagnosticSessions.get(requestId);
  }

  endDiagnosticSession(requestId: string): void {
    const session = this.diagnosticSessions.get(requestId);
    if (session) {
      session.end();
      this.diagnosticSessions.delete(requestId);
    }
  }

  createPhaseContext(
    baseContext: DiagnosticLogContext,
    phase: 'lexing' | 'parsing' | 'validation' | 'analysis',
    additionalContext: Partial<DiagnosticLogContext> = {}
  ): DiagnosticLogContext {
    return {
      ...baseContext,
      parsePhase: phase,
      operation: `${baseContext.operation}.${phase}`,
      ...additionalContext
    };
  }

  createValidationContext(
    baseContext: DiagnosticLogContext,
    validationType: 'syntax' | 'semantic' | 'performance' | 'best-practices',
    additionalContext: Partial<DiagnosticLogContext> = {}
  ): DiagnosticLogContext {
    return {
      ...baseContext,
      diagnosticType: validationType,
      operation: `validation.${validationType}`,
      ...additionalContext
    };
  }

  getStats() {
    return {
      activeSessions: this.diagnosticSessions.size,
      avgSessionDuration: this.calculateAverageSessionDuration()
    };
  }

  private calculateAverageSessionDuration(): number {
    const now = Date.now();
    let totalDuration = 0;
    let count = 0;

    for (const session of this.diagnosticSessions.values()) {
      totalDuration += now - session.startTime.getTime();
      count++;
    }

    return count > 0 ? totalDuration / count : 0;
  }
}

export class DiagnosticSession {
  readonly context: DiagnosticLogContext;
  readonly startTime: Date;
  private phases: Array<{ phase: string; startTime: Date; endTime?: Date }> = [];
  private metrics: Record<string, number> = {};

  constructor(context: DiagnosticLogContext) {
    this.context = context;
    this.startTime = new Date();
  }

  startPhase(phase: string): void {
    // End the previous phase if it's still running
    const lastPhase = this.phases[this.phases.length - 1];
    if (lastPhase && !lastPhase.endTime) {
      lastPhase.endTime = new Date();
    }

    this.phases.push({
      phase,
      startTime: new Date()
    });
  }

  endPhase(phase?: string): void {
    const phaseToEnd = phase 
      ? this.phases.find(p => p.phase === phase && !p.endTime)
      : this.phases[this.phases.length - 1];

    if (phaseToEnd) {
      phaseToEnd.endTime = new Date();
    }
  }

  addMetric(name: string, value: number): void {
    this.metrics[name] = value;
  }

  incrementMetric(name: string, amount: number = 1): void {
    this.metrics[name] = (this.metrics[name] || 0) + amount;
  }

  getPhaseContext(phase: string): DiagnosticLogContext {
    return {
      ...this.context,
      parsePhase: phase as any,
      operation: `${this.context.operation}.${phase}`
    };
  }

  getValidationContext(validationType: string): DiagnosticLogContext {
    return {
      ...this.context,
      diagnosticType: validationType as any,
      operation: `validation.${validationType}`
    };
  }

  end(): DiagnosticSessionSummary {
    // End any running phases
    const lastPhase = this.phases[this.phases.length - 1];
    if (lastPhase && !lastPhase.endTime) {
      lastPhase.endTime = new Date();
    }

    const endTime = new Date();
    const totalDuration = endTime.getTime() - this.startTime.getTime();

    return {
      context: this.context,
      startTime: this.startTime,
      endTime,
      totalDuration,
      phases: this.phases.map(p => ({
        ...p,
        duration: p.endTime ? p.endTime.getTime() - p.startTime.getTime() : null
      })),
      metrics: { ...this.metrics }
    };
  }

  getSummary(): DiagnosticSessionSummary {
    const now = new Date();
    const totalDuration = now.getTime() - this.startTime.getTime();

    return {
      context: this.context,
      startTime: this.startTime,
      endTime: now,
      totalDuration,
      phases: this.phases.map(p => ({
        ...p,
        duration: (p.endTime || now).getTime() - p.startTime.getTime()
      })),
      metrics: { ...this.metrics }
    };
  }
}

export interface DiagnosticSessionSummary {
  context: DiagnosticLogContext;
  startTime: Date;
  endTime: Date;
  totalDuration: number;
  phases: Array<{
    phase: string;
    startTime: Date;
    endTime?: Date;
    duration: number | null;
  }>;
  metrics: Record<string, number>;
}

// Singleton instance
export const diagnosticContext = DiagnosticContextManager.getInstance();