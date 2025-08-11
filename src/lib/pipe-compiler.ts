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
 * Processes pipes in queries and events
 * Compiles compact YAML syntax into explicit pipe operations
 */
export function processPipes(data: any): any {
  // Process queries
  if (data.queries) {
    for (const queryName in data.queries) {
      const query = data.queries[queryName];
      if (query.pipe) {
        query.pipe = compileCompactPipe(query.pipe);
      }
    }
  }

  // Process events
  if (data.events) {
    for (const eventName in data.events) {
      const event = data.events[eventName];
      
      // Process reactive event pipes
      if (event.pipe) {
        event.pipe = compileCompactPipe(event.pipe);
      }
      
    }
  }

  return data;
}