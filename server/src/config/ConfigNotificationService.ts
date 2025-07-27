import { EventEmitter } from 'events';
import { ConfigChangeEvent, ConfigChangeListener } from './schemas/BaseConfig';
import { AppConfig, ConfigManager } from './ConfigManager';

/**
 * Configuration change notification types
 */
export type ConfigNotificationType =
  | 'config-loaded'
  | 'config-changed'
  | 'config-validated'
  | 'config-error'
  | 'config-reset';

/**
 * Configuration notification event
 */
export interface ConfigNotificationEvent {
  type: ConfigNotificationType;
  path?: string;
  oldValue?: any;
  newValue?: any;
  config?: Partial<AppConfig>;
  timestamp: Date;
  source?: string;
  metadata?: Record<string, any>;
}

/**
 * Configuration subscription options
 */
export interface ConfigSubscriptionOptions {
  paths?: string[];
  debounceMs?: number;
  immediate?: boolean;
  includeMetadata?: boolean;
}

/**
 * Configuration notification listener
 */
export type ConfigNotificationListener = (event: ConfigNotificationEvent) => void;

/**
 * Configuration subscription
 */
export interface ConfigSubscription {
  id: string;
  listener: ConfigNotificationListener;
  options: ConfigSubscriptionOptions;
  lastNotified?: Date;
}

/**
 * Service for managing configuration change notifications
 */
export class ConfigNotificationService extends EventEmitter {
  private subscriptions: Map<string, ConfigSubscription> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private configManager?: ConfigManager;
  private subscriptionCounter = 0;

  constructor(configManager?: ConfigManager) {
    super();
    if (configManager) {
      this.attachToConfigManager(configManager);
    }
  }

  /**
   * Attach to a configuration manager
   */
  attachToConfigManager(configManager: ConfigManager): void {
    this.configManager = configManager;

    // Listen to configuration manager events
    configManager.on('configLoaded', (config: AppConfig) => {
      this.notifySubscribers({
        type: 'config-loaded',
        config,
        timestamp: new Date()
      });
    });

    configManager.on('configChanged', (changeEvent: ConfigChangeEvent) => {
      this.notifySubscribers({
        type: 'config-changed',
        path: changeEvent.path,
        oldValue: changeEvent.oldValue,
        newValue: changeEvent.newValue,
        timestamp: changeEvent.timestamp
      });
    });

    console.log('ConfigNotificationService attached to ConfigManager');
  }

  /**
   * Subscribe to configuration changes
   */
  subscribe(
    listener: ConfigNotificationListener,
    options: ConfigSubscriptionOptions = {}
  ): string {
    const subscriptionId = `sub_${++this.subscriptionCounter}`;

    const subscription: ConfigSubscription = {
      id: subscriptionId,
      listener,
      options: {
        debounceMs: 100,
        immediate: false,
        includeMetadata: false,
        ...options
      }
    };

    this.subscriptions.set(subscriptionId, subscription);

    // Send immediate notification if requested and config is available
    if (subscription.options.immediate && this.configManager) {
      const currentConfig = this.configManager.getConfig();
      this.notifySubscriber(subscription, {
        type: 'config-loaded',
        config: currentConfig,
        timestamp: new Date()
      });
    }

    console.log(`Configuration subscription created: ${subscriptionId}`);
    return subscriptionId;
  }

  /**
   * Subscribe to specific configuration paths
   */
  subscribeToPaths(
    paths: string[],
    listener: ConfigNotificationListener,
    options: Omit<ConfigSubscriptionOptions, 'paths'> = {}
  ): string {
    return this.subscribe(listener, { ...options, paths });
  }

  /**
   * Subscribe to diagnostic configuration changes
   */
  subscribeToDiagnostics(
    listener: ConfigNotificationListener,
    options: Omit<ConfigSubscriptionOptions, 'paths'> = {}
  ): string {
    return this.subscribeToPaths(['diagnostics'], listener, options);
  }

  /**
   * Subscribe to provider configuration changes
   */
  subscribeToProviders(
    listener: ConfigNotificationListener,
    options: Omit<ConfigSubscriptionOptions, 'paths'> = {}
  ): string {
    return this.subscribeToPaths(['providers'], listener, options);
  }

  /**
   * Subscribe to performance configuration changes
   */
  subscribeToPerformance(
    listener: ConfigNotificationListener,
    options: Omit<ConfigSubscriptionOptions, 'paths'> = {}
  ): string {
    return this.subscribeToPaths(['providers.performance', 'diagnostics.performance'], listener, options);
  }

  /**
   * Unsubscribe from configuration changes
   */
  unsubscribe(subscriptionId: string): boolean {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return false;
    }

    // Clear any pending debounce timer
    const timer = this.debounceTimers.get(subscriptionId);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(subscriptionId);
    }

    this.subscriptions.delete(subscriptionId);
    console.log(`Configuration subscription removed: ${subscriptionId}`);
    return true;
  }

  /**
   * Get all active subscriptions
   */
  getSubscriptions(): ConfigSubscription[] {
    return Array.from(this.subscriptions.values());
  }

  /**
   * Get subscription by ID
   */
  getSubscription(subscriptionId: string): ConfigSubscription | undefined {
    return this.subscriptions.get(subscriptionId);
  }

  /**
   * Clear all subscriptions
   */
  clearSubscriptions(): void {
    // Clear all debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    this.subscriptions.clear();
    console.log('All configuration subscriptions cleared');
  }

  /**
   * Manually notify subscribers of a configuration event
   */
  notify(event: ConfigNotificationEvent): void {
    this.notifySubscribers(event);
  }

  /**
   * Create a scoped notification service for specific configuration paths
   */
  createScopedService(scope: string): ScopedConfigNotificationService {
    return new ScopedConfigNotificationService(this, scope);
  }

  /**
   * Get notification statistics
   */
  getStats(): {
    totalSubscriptions: number;
    activeDebounceTimers: number;
    subscriptionsByType: Record<string, number>;
  } {
    const subscriptionsByType: Record<string, number> = {};

    for (const subscription of this.subscriptions.values()) {
      const pathCount = subscription.options.paths?.length || 0;
      const key = pathCount === 0 ? 'global' : `paths:${pathCount}`;
      subscriptionsByType[key] = (subscriptionsByType[key] || 0) + 1;
    }

    return {
      totalSubscriptions: this.subscriptions.size,
      activeDebounceTimers: this.debounceTimers.size,
      subscriptionsByType
    };
  }

  private notifySubscribers(event: ConfigNotificationEvent): void {
    for (const subscription of this.subscriptions.values()) {
      if (this.shouldNotifySubscription(subscription, event)) {
        this.scheduleNotification(subscription, event);
      }
    }

    // Emit event for general listeners
    this.emit('notification', event);
  }

  private shouldNotifySubscription(subscription: ConfigSubscription, event: ConfigNotificationEvent): boolean {
    // Check if subscription is interested in this type of event
    if (event.type === 'config-changed' && event.path) {
      // If subscription has specific paths, check if event path matches
      if (subscription.options.paths && subscription.options.paths.length > 0) {
        return subscription.options.paths.some(subscribedPath =>
          event.path!.startsWith(subscribedPath) || subscribedPath.startsWith(event.path!)
        );
      }
    }

    // Global subscription or non-path-specific event
    return true;
  }

  private scheduleNotification(subscription: ConfigSubscription, event: ConfigNotificationEvent): void {
    const debounceMs = subscription.options.debounceMs || 0;

    if (debounceMs > 0) {
      // Clear existing timer
      const existingTimer = this.debounceTimers.get(subscription.id);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // Schedule debounced notification
      const timer = setTimeout(() => {
        this.notifySubscriber(subscription, event);
        this.debounceTimers.delete(subscription.id);
      }, debounceMs);

      this.debounceTimers.set(subscription.id, timer);
    } else {
      // Immediate notification
      this.notifySubscriber(subscription, event);
    }
  }

  private notifySubscriber(subscription: ConfigSubscription, event: ConfigNotificationEvent): void {
    try {
      // Add metadata if requested
      if (subscription.options.includeMetadata && this.configManager) {
        const metadata = event.path ? this.configManager.getMetadata(event.path) : undefined;
        event.metadata = metadata ? { source: metadata } : undefined;
      }

      subscription.listener(event);
      subscription.lastNotified = new Date();
    } catch (error) {
      console.error(`Error in configuration notification listener ${subscription.id}:`, error);

      // Emit error event
      this.emit('listenerError', {
        subscriptionId: subscription.id,
        error,
        event
      });
    }
  }
}

/**
 * Scoped configuration notification service for specific configuration sections
 */
export class ScopedConfigNotificationService {
  constructor(
    private parentService: ConfigNotificationService,
    private scope: string
  ) {}

  /**
   * Subscribe to changes within the scope
   */
  subscribe(
    listener: ConfigNotificationListener,
    options: Omit<ConfigSubscriptionOptions, 'paths'> = {}
  ): string {
    return this.parentService.subscribe(listener, {
      ...options,
      paths: [this.scope]
    });
  }

  /**
   * Subscribe to specific paths within the scope
   */
  subscribeToPaths(
    relativePaths: string[],
    listener: ConfigNotificationListener,
    options: Omit<ConfigSubscriptionOptions, 'paths'> = {}
  ): string {
    const fullPaths = relativePaths.map(path => `${this.scope}.${path}`);
    return this.parentService.subscribe(listener, {
      ...options,
      paths: fullPaths
    });
  }

  /**
   * Unsubscribe from changes
   */
  unsubscribe(subscriptionId: string): boolean {
    return this.parentService.unsubscribe(subscriptionId);
  }

  /**
   * Get the scope
   */
  getScope(): string {
    return this.scope;
  }
}

/**
 * Factory for creating notification services
 */
export class ConfigNotificationServiceFactory {
  /**
   * Create notification service with config manager
   */
  static create(configManager: ConfigManager): ConfigNotificationService {
    return new ConfigNotificationService(configManager);
  }

  /**
   * Create standalone notification service
   */
  static createStandalone(): ConfigNotificationService {
    return new ConfigNotificationService();
  }

  /**
   * Create notification service for development with verbose logging
   */
  static createDevelopment(configManager: ConfigManager): ConfigNotificationService {
    const service = new ConfigNotificationService(configManager);

    // Add development logging
    service.on('notification', (event: ConfigNotificationEvent) => {
      console.log('[DEV] Configuration notification:', event);
    });

    service.on('listenerError', (errorEvent: any) => {
      console.error('[DEV] Configuration listener error:', errorEvent);
    });

    return service;
  }

  /**
   * Create notification service for production with minimal logging
   */
  static createProduction(configManager: ConfigManager): ConfigNotificationService {
    const service = new ConfigNotificationService(configManager);

    // Add minimal production logging
    service.on('listenerError', (errorEvent: any) => {
      console.error('Configuration listener error:', errorEvent.error?.message || 'Unknown error');
    });

    return service;
  }
}
