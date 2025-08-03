# Configuration Schema Support

The FHIRPath LSP extension provides comprehensive autocomplete support for `.fhirpath-lsp.json` configuration files through a JSON schema.

## Features

### Automatic Key Completion
When editing `.fhirpath-lsp.json` files, VSCode will automatically provide:
- **Property name suggestions** based on the configuration schema
- **Value suggestions** for enum properties
- **Type validation** with real-time error highlighting
- **Documentation tooltips** explaining each configuration option

### Schema Location
The schema is located at: `./schemas/fhirpath-lsp-config.schema.json`

### Supported Configuration Categories

#### 1. Diagnostics Configuration
```json
{
  "diagnostics": {
    "enabled": true,
    "performance": {
      "maxComplexity": 10,
      "maxNestingDepth": 5,
      "flagRedundantOperations": true
    },
    "codeQuality": {
      "maxLineLength": 100,
      "flagMagicValues": true
    },
    "fhirBestPractices": {
      "enforceTypeSafety": true,
      "checkCardinality": false
    },
    "severity": {
      "performance": 2,
      "codeQuality": 3
    }
  }
}
```

#### 2. Provider Configuration
```json
{
  "providers": {
    "enabled": true,
    "modelProvider": {
      "enabled": true,
      "fhirModelProvider": {
        "packages": [
          {
            "name": "hl7.fhir.r4.core",
            "version": "4.0.1"
          }
        ],
        "cacheDir": ".fhir-cache",
        "registryUrl": "https://fs.get-ig.org/pkgs"
      }
    },
    "enhanced": {
      "completion": {
        "enabled": true,
        "choiceTypes": true,
        "deepNavigation": true,
        "maxCompletions": 100
      },
      "hover": {
        "showHierarchy": true,
        "showConstraints": true
      }
    }
  }
}
```

#### 3. Performance Configuration
```json
{
  "providers": {
    "performance": {
      "enabled": true,
      "requestThrottling": {
        "enabled": true,
        "adaptiveEnabled": true,
        "defaultWindowMs": 1000
      },
      "caching": {
        "enabled": true,
        "maxCacheSize": 1000,
        "ttlMs": 300000
      },
      "timeouts": {
        "completionTimeoutMs": 5000,
        "diagnosticTimeoutMs": 10000,
        "hoverTimeoutMs": 3000
      }
    }
  }
}
```

## Using the Schema

### 1. Automatic Detection
The extension automatically associates `.fhirpath-lsp.json` files with the schema. No manual configuration required.

### 2. Manual Schema Reference
You can also explicitly reference the schema in your configuration file:

```json
{
  "$schema": "./schemas/fhirpath-lsp-config.schema.json",
  "enabled": true,
  // ... rest of configuration
}
```

### 3. Validation Features

#### Real-time Validation
- **Type checking**: Ensures values match expected types
- **Range validation**: Validates numeric ranges (e.g., `maxComplexity: 1-50`)
- **Required properties**: Highlights missing required properties
- **Invalid properties**: Flags unknown configuration keys

#### Enum Value Suggestions
For properties with predefined values:
- Severity levels: `1` (Error), `2` (Warning), `3` (Info), `4` (Hint)
- Boolean values: `true`, `false`

#### Documentation on Hover
Each configuration property includes:
- **Description**: What the property controls
- **Default value**: Default setting if not specified
- **Valid range**: For numeric properties
- **Examples**: Common use cases

## Example Configuration File

```json
{
  "$schema": "./schemas/fhirpath-lsp-config.schema.json",
  "enabled": true,
  "version": "1.0.0",
  "diagnostics": {
    "enabled": true,
    "performance": {
      "enabled": true,
      "maxComplexity": 15,
      "flagExpensiveOperations": true
    },
    "severity": {
      "performance": 2,
      "codeQuality": 3
    }
  },
  "providers": {
    "enabled": true,
    "modelProvider": {
      "enabled": true,
      "fhirModelProvider": {
        "packages": [
          {
            "name": "hl7.fhir.r4.core",
            "version": "4.0.1"
          }
        ]
      }
    },
    "enhanced": {
      "completion": {
        "enabled": true,
        "maxCompletions": 150
      }
    }
  }
}
```

## Tips for Using Schema Autocomplete

1. **Start typing**: Begin typing a property name to see available options
2. **Use Ctrl+Space**: Trigger completion manually in VSCode
3. **Read descriptions**: Hover over properties to see detailed documentation
4. **Follow validation**: Pay attention to red underlines for validation errors
5. **Use snippets**: The schema includes common configuration patterns

## Schema Updates

The schema is automatically updated when the extension configuration interfaces change, ensuring autocomplete stays current with available options.