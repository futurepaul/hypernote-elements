/**
 * Compiler for compact YAML pipe syntax to JSON
 */

/**
 * Converts compact YAML pipe syntax to full JSON format
 * 
 * @example
 * Input:
 * - first
 * - get: content
 * - json
 * - save: value
 * 
 * Output:
 * [
 *   { "op": "first" },
 *   { "op": "get", "field": "content" },
 *   { "op": "json" },
 *   { "op": "save", "as": "value" }
 * ]
 */
export function compileCompactPipe(yamlPipe: any): any[] {
  if (!Array.isArray(yamlPipe)) {
    return yamlPipe; // Already in some other format
  }

  return yamlPipe.map(item => {
    // String alone = simple operation
    if (typeof item === 'string') {
      return { op: item };
    }

    // Already has 'op' field - pass through
    if (item.op) {
      return item;
    }

    // Object with single key = operation with parameter(s)
    const keys = Object.keys(item);
    if (keys.length === 1) {
      const op = keys[0];
      const value = item[op];

      // Special parameter mappings
      switch (op) {
        case 'save':
          return { op: 'save', as: value };
        
        case 'get':
        case 'pluck':
          return { op, field: value };
        
        case 'limit':
        case 'take':
        case 'drop':
          return { op, count: value };
        
        case 'default':
        case 'add':
        case 'multiply':
          return { op, value };
        
        case 'sort':
          if (typeof value === 'object') {
            return { op, ...value };
          }
          return { op, by: value };
        
        case 'filter':
          if (typeof value === 'object') {
            return { op, ...value };
          }
          return { op, field: value };
        
        case 'filterTag':
        case 'pluckTag':
          if (typeof value === 'object') {
            return { op, ...value };
          }
          return { op, tag: value };
        
        case 'whereIndex':
        case 'pluckIndex':
          if (typeof value === 'object') {
            return { op, ...value };
          }
          return { op, index: value };
        
        case 'split':
        case 'join':
          return { op, separator: value };
        
        case 'replace':
          return { op, ...value };
        
        case 'merge':
          return { op, with: value };
        
        case 'pick':
        case 'omit':
          return { op, fields: value };
        
        case 'map':
          // Recursive compilation for nested pipes
          if (Array.isArray(value)) {
            return { op, pipe: compileCompactPipe(value) };
          }
          return { op, pipe: value };
        
        case 'where':
          return { op, expression: value };
        
        // Operations that take complex objects
        case 'defaults':
          // For defaults, we want to merge with existing data
          // This is a special operation that merges defaults into the current value
          return { op: 'defaults', value };
        
        default:
          // Unknown operation - pass through as is
          console.warn(`Unknown pipe operation: ${op}`);
          return { op, value };
      }
    }

    // Multi-key object - shouldn't happen in compact syntax
    console.warn('Multi-key object in pipe:', item);
    return item;
  });
}

/**
 * Converts legacy pipe operations to new format
 */
export function convertLegacyPipe(legacyPipe: any[]): any[] {
  if (!Array.isArray(legacyPipe)) {
    return legacyPipe;
  }

  return legacyPipe.map(op => {
    // Handle legacy 'operation' field
    if (op.operation) {
      switch (op.operation) {
        case 'extract':
          // Complex extract needs special handling
          // For now, convert to a series of operations
          console.warn('Legacy "extract" operation needs manual conversion:', op);
          // Try to parse simple cases
          if (op.expression && op.as) {
            // Simple field extraction
            if (op.expression.startsWith('.')) {
              return { op: 'get', field: op.expression.slice(1) };
            }
            // Tag filtering - common pattern
            if (op.expression.includes('tags') && op.expression.includes('select')) {
              return { op: 'filterTag', tag: 'p', value: '*' };
            }
          }
          return { op: 'get', field: 'content' }; // Fallback
        
        case 'field':
          return { op: 'get', field: op.name };
        
        case 'parse_json':
          return { op: 'json' };
        
        case 'first':
        case 'last':
        case 'reverse':
        case 'json':
        case 'unique':
        case 'flatten':
          return { op: op.operation };
        
        case 'default':
          return { op: 'default', value: op.value };
        
        case 'sort':
          return { 
            op: 'sort', 
            by: op.by,
            order: op.order || 'asc'
          };
        
        case 'filter':
          if (op.expression) {
            return { op: 'where', expression: op.expression };
          }
          return op;
        
        case 'map':
          if (op.expression) {
            return { op: 'map', pipe: [{ op: 'where', expression: op.expression }] };
          }
          return op;
        
        default:
          console.warn('Unknown legacy operation:', op.operation);
          return op;
      }
    }

    // Not a legacy operation
    return op;
  });
}

/**
 * Processes pipes in queries and events
 * Handles both compact YAML syntax and legacy format
 */
export function processPipes(data: any): any {
  // Process queries
  if (data.queries) {
    for (const queryName in data.queries) {
      const query = data.queries[queryName];
      if (query.pipe) {
        // Check if it's legacy format (has 'operation' field)
        if (Array.isArray(query.pipe) && query.pipe[0]?.operation) {
          query.pipe = convertLegacyPipe(query.pipe);
        } else {
          query.pipe = compileCompactPipe(query.pipe);
        }
      }
    }
  }

  // Process events
  if (data.events) {
    for (const eventName in data.events) {
      const event = data.events[eventName];
      
      // Process reactive event pipes
      if (event.pipe) {
        if (Array.isArray(event.pipe) && event.pipe[0]?.operation) {
          event.pipe = convertLegacyPipe(event.pipe);
        } else {
          event.pipe = compileCompactPipe(event.pipe);
        }
      }
      
      // Convert legacy tool_call to new format
      if (event.tool_call) {
        console.warn(`Converting legacy tool_call event: ${eventName}`);
        // This will be handled in the next phase
      }
    }
  }

  return data;
}