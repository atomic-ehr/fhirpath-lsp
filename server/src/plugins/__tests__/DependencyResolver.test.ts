import { DependencyResolver } from '../lifecycle/DependencyResolver';
import { PluginManifest } from '../interfaces/IPlugin';

describe('DependencyResolver', () => {
  let resolver: DependencyResolver;

  beforeEach(() => {
    resolver = new DependencyResolver();
  });

  describe('Simple Dependencies', () => {
    it('should resolve plugins with no dependencies', async () => {
      const manifests: PluginManifest[] = [
        {
          id: 'plugin-a',
          name: 'Plugin A',
          version: '1.0.0',
          main: 'index.js',
          capabilities: []
        },
        {
          id: 'plugin-b',
          name: 'Plugin B',
          version: '1.0.0',
          main: 'index.js',
          capabilities: []
        }
      ];

      const result = await resolver.resolve(manifests);

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.order).toHaveLength(2);
      expect(result.order).toContain('plugin-a');
      expect(result.order).toContain('plugin-b');
    });

    it('should resolve simple dependency chain', async () => {
      const manifests: PluginManifest[] = [
        {
          id: 'plugin-b',
          name: 'Plugin B',
          version: '1.0.0',
          main: 'index.js',
          capabilities: [],
          dependencies: [
            { id: 'plugin-a', version: '1.0.0' }
          ]
        },
        {
          id: 'plugin-a',
          name: 'Plugin A',
          version: '1.0.0',
          main: 'index.js',
          capabilities: []
        }
      ];

      const result = await resolver.resolve(manifests);

      expect(result.success).toBe(true);
      expect(result.order).toEqual(['plugin-a', 'plugin-b']);
    });

    it('should resolve complex dependency chain', async () => {
      const manifests: PluginManifest[] = [
        {
          id: 'plugin-d',
          name: 'Plugin D',
          version: '1.0.0',
          main: 'index.js',
          capabilities: [],
          dependencies: [
            { id: 'plugin-b', version: '1.0.0' },
            { id: 'plugin-c', version: '1.0.0' }
          ]
        },
        {
          id: 'plugin-c',
          name: 'Plugin C',
          version: '1.0.0',
          main: 'index.js',
          capabilities: [],
          dependencies: [
            { id: 'plugin-a', version: '1.0.0' }
          ]
        },
        {
          id: 'plugin-b',
          name: 'Plugin B',
          version: '1.0.0',
          main: 'index.js',
          capabilities: [],
          dependencies: [
            { id: 'plugin-a', version: '1.0.0' }
          ]
        },
        {
          id: 'plugin-a',
          name: 'Plugin A',
          version: '1.0.0',
          main: 'index.js',
          capabilities: []
        }
      ];

      const result = await resolver.resolve(manifests);

      expect(result.success).toBe(true);
      expect(result.order[0]).toBe('plugin-a'); // Should be first
      expect(result.order[3]).toBe('plugin-d'); // Should be last
      
      // plugin-b and plugin-c can be in either order as they both depend only on plugin-a
      const bIndex = result.order.indexOf('plugin-b');
      const cIndex = result.order.indexOf('plugin-c');
      const dIndex = result.order.indexOf('plugin-d');
      
      expect(bIndex).toBeLessThan(dIndex);
      expect(cIndex).toBeLessThan(dIndex);
    });
  });

  describe('Missing Dependencies', () => {
    it('should detect missing required dependencies', async () => {
      const manifests: PluginManifest[] = [
        {
          id: 'plugin-b',
          name: 'Plugin B',
          version: '1.0.0',
          main: 'index.js',
          capabilities: [],
          dependencies: [
            { id: 'missing-plugin', version: '1.0.0' }
          ]
        }
      ];

      const result = await resolver.resolve(manifests);

      expect(result.success).toBe(false);
      expect(result.missingDependencies.has('plugin-b')).toBe(true);
      expect(result.missingDependencies.get('plugin-b')).toContain('missing-plugin');
      expect(result.errors).toContain(expect.stringContaining('missing dependencies'));
    });

    it('should handle optional missing dependencies', async () => {
      const manifests: PluginManifest[] = [
        {
          id: 'plugin-b',
          name: 'Plugin B',
          version: '1.0.0',
          main: 'index.js',
          capabilities: [],
          dependencies: [
            { id: 'missing-plugin', version: '1.0.0', optional: true }
          ]
        }
      ];

      const result = await resolver.resolve(manifests);

      expect(result.success).toBe(true);
      expect(result.order).toContain('plugin-b');
    });

    it('should handle mixed required and optional dependencies', async () => {
      const manifests: PluginManifest[] = [
        {
          id: 'plugin-c',
          name: 'Plugin C',
          version: '1.0.0',
          main: 'index.js',
          capabilities: [],
          dependencies: [
            { id: 'plugin-a', version: '1.0.0' }, // Required, exists
            { id: 'missing-plugin', version: '1.0.0', optional: true } // Optional, missing
          ]
        },
        {
          id: 'plugin-a',
          name: 'Plugin A',
          version: '1.0.0',
          main: 'index.js',
          capabilities: []
        }
      ];

      const result = await resolver.resolve(manifests);

      expect(result.success).toBe(true);
      expect(result.order).toEqual(['plugin-a', 'plugin-c']);
    });
  });

  describe('Circular Dependencies', () => {
    it('should detect simple circular dependency', async () => {
      const manifests: PluginManifest[] = [
        {
          id: 'plugin-a',
          name: 'Plugin A',
          version: '1.0.0',
          main: 'index.js',
          capabilities: [],
          dependencies: [
            { id: 'plugin-b', version: '1.0.0' }
          ]
        },
        {
          id: 'plugin-b',
          name: 'Plugin B',
          version: '1.0.0',
          main: 'index.js',
          capabilities: [],
          dependencies: [
            { id: 'plugin-a', version: '1.0.0' }
          ]
        }
      ];

      const result = await resolver.resolve(manifests);

      expect(result.success).toBe(false);
      expect(result.circularDependencies).toHaveLength(1);
      expect(result.errors).toContain(expect.stringContaining('Circular dependencies'));
    });

    it('should detect complex circular dependency', async () => {
      const manifests: PluginManifest[] = [
        {
          id: 'plugin-a',
          name: 'Plugin A',
          version: '1.0.0',
          main: 'index.js',
          capabilities: [],
          dependencies: [
            { id: 'plugin-b', version: '1.0.0' }
          ]
        },
        {
          id: 'plugin-b',
          name: 'Plugin B',
          version: '1.0.0',
          main: 'index.js',
          capabilities: [],
          dependencies: [
            { id: 'plugin-c', version: '1.0.0' }
          ]
        },
        {
          id: 'plugin-c',
          name: 'Plugin C',
          version: '1.0.0',
          main: 'index.js',
          capabilities: [],
          dependencies: [
            { id: 'plugin-a', version: '1.0.0' }
          ]
        }
      ];

      const result = await resolver.resolve(manifests);

      expect(result.success).toBe(false);
      expect(result.circularDependencies).toHaveLength(1);
      expect(result.circularDependencies[0]).toContain('plugin-a');
      expect(result.circularDependencies[0]).toContain('plugin-b');
      expect(result.circularDependencies[0]).toContain('plugin-c');
    });

    it('should handle self-dependency', async () => {
      const manifests: PluginManifest[] = [
        {
          id: 'plugin-a',
          name: 'Plugin A',
          version: '1.0.0',
          main: 'index.js',
          capabilities: [],
          dependencies: [
            { id: 'plugin-a', version: '1.0.0' } // Self-dependency
          ]
        }
      ];

      const result = await resolver.resolve(manifests);

      expect(result.success).toBe(false);
      expect(result.circularDependencies).toHaveLength(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty plugin list', async () => {
      const result = await resolver.resolve([]);

      expect(result.success).toBe(true);
      expect(result.order).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle plugins with no dependencies field', async () => {
      const manifests: PluginManifest[] = [
        {
          id: 'plugin-a',
          name: 'Plugin A',
          version: '1.0.0',
          main: 'index.js',
          capabilities: []
          // No dependencies field
        }
      ];

      const result = await resolver.resolve(manifests);

      expect(result.success).toBe(true);
      expect(result.order).toEqual(['plugin-a']);
    });

    it('should handle plugins with empty dependencies array', async () => {
      const manifests: PluginManifest[] = [
        {
          id: 'plugin-a',
          name: 'Plugin A',
          version: '1.0.0',
          main: 'index.js',
          capabilities: [],
          dependencies: []
        }
      ];

      const result = await resolver.resolve(manifests);

      expect(result.success).toBe(true);
      expect(result.order).toEqual(['plugin-a']);
    });

    it('should handle duplicate plugin IDs', async () => {
      const manifests: PluginManifest[] = [
        {
          id: 'plugin-a',
          name: 'Plugin A (first)',
          version: '1.0.0',
          main: 'index.js',
          capabilities: []
        },
        {
          id: 'plugin-a', // Duplicate ID
          name: 'Plugin A (second)',
          version: '2.0.0',
          main: 'index.js',
          capabilities: []
        }
      ];

      const result = await resolver.resolve(manifests);

      // Should still work, but only one instance should be in the result
      expect(result.success).toBe(true);
      expect(result.order).toHaveLength(1);
      expect(result.order).toContain('plugin-a');
    });
  });

  describe('Performance', () => {
    it('should handle large number of plugins efficiently', async () => {
      // Create 100 plugins with no dependencies
      const manifests: PluginManifest[] = [];
      for (let i = 0; i < 100; i++) {
        manifests.push({
          id: `plugin-${i}`,
          name: `Plugin ${i}`,
          version: '1.0.0',
          main: 'index.js',
          capabilities: []
        });
      }

      const startTime = Date.now();
      const result = await resolver.resolve(manifests);
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(result.order).toHaveLength(100);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should handle complex dependency graph efficiently', async () => {
      // Create a more complex but realistic dependency graph
      const manifests: PluginManifest[] = [];
      
      // Create a base plugin
      manifests.push({
        id: 'base-plugin',
        name: 'Base Plugin',
        version: '1.0.0',
        main: 'index.js',
        capabilities: []
      });

      // Create 20 plugins that depend on the base
      for (let i = 1; i <= 20; i++) {
        manifests.push({
          id: `feature-plugin-${i}`,
          name: `Feature Plugin ${i}`,
          version: '1.0.0',
          main: 'index.js',
          capabilities: [],
          dependencies: [
            { id: 'base-plugin', version: '1.0.0' }
          ]
        });
      }

      // Create 5 composite plugins that depend on multiple feature plugins
      for (let i = 1; i <= 5; i++) {
        const dependencies = [];
        for (let j = 1; j <= 4; j++) {
          dependencies.push({
            id: `feature-plugin-${(i - 1) * 4 + j}`,
            version: '1.0.0'
          });
        }

        manifests.push({
          id: `composite-plugin-${i}`,
          name: `Composite Plugin ${i}`,
          version: '1.0.0',
          main: 'index.js',
          capabilities: [],
          dependencies
        });
      }

      const startTime = Date.now();
      const result = await resolver.resolve(manifests);
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(result.order[0]).toBe('base-plugin');
      expect(endTime - startTime).toBeLessThan(500); // Should complete within 0.5 seconds
    });
  });
});