/**
 * Simple jq expression evaluator for Hypernote pipe operations
 * Supports a limited subset of jq syntax for safe data extraction
 */

/**
 * Evaluates a limited subset of jq expressions
 * Supported operations:
 * - Property access: .property
 * - Array index: .[0]
 * - Array iteration: .[]
 * - Pipe: |
 * - Select filter: select(condition)
 * 
 * @param expression The jq expression to evaluate
 * @param data The data to evaluate against
 * @returns The result of the evaluation
 */
export function evaluateJqExpression(expression: string, data: any): any {
  // Remove whitespace
  expression = expression.trim();
  
  // Handle empty expression or just "."
  if (!expression || expression === '.') {
    return data;
  }
  
  // Split by pipe operator
  const pipes = expression.split('|').map(s => s.trim());
  
  let result = data;
  let isIterating = false; // Track if we're in array iteration mode
  
  for (let i = 0; i < pipes.length; i++) {
    const pipe = pipes[i];
    
    // Check if this step contains array iteration
    if (pipe.includes('[]')) {
      isIterating = true;
      result = evaluateSingleExpression(pipe, result);
      // After array iteration, we now have an array to iterate over
    } else if (isIterating && Array.isArray(result)) {
      // If we're iterating and have an array, apply the operation to each element
      result = result.map(item => evaluateSingleExpression(pipe, item)).filter(item => item !== undefined);
    } else {
      // Normal single expression evaluation
      result = evaluateSingleExpression(pipe, result);
    }
  }
  
  return result;
}

/**
 * Evaluates a single jq expression (no pipes)
 */
function evaluateSingleExpression(expr: string, data: any): any {
  // Handle select() function
  if (expr.startsWith('select(') && expr.endsWith(')')) {
    const condition = expr.slice(7, -1); // Extract condition from select(...)
    return evaluateSelect(condition, data);
  }
  
  // Handle property/index access chain
  const parts = parseAccessChain(expr);
  let result = data;
  for (const part of parts) {
    if (part === '[]') {
      // Array iteration - return each element of the array
      if (Array.isArray(result)) {
        // Return the array unchanged so pipe processing can iterate over elements
        result = result;
      } else {
        result = [];
      }
    } else if (part.startsWith('[') && part.endsWith(']')) {
      // Array index access
      const index = parseInt(part.slice(1, -1));
      if (Array.isArray(result)) {
        result = result[index];
      } else {
        result = undefined;
      }
    } else if (part.startsWith('.')) {
      // Property access
      const prop = part.slice(1);
      if (result && typeof result === 'object') {
        result = result[prop];
      } else {
        result = undefined;
      }
    }
  }
  
  return result;
}

/**
 * Parse an access chain like ".tags[]" or ".tags[0].value"
 */
function parseAccessChain(expr: string): string[] {
  // Special case: if expression starts with .[, treat it as a single index access
  if (expr.startsWith('.[') && expr.endsWith(']')) {
    return [expr.substring(1)]; // Return [0] instead of [".", "[0]"]
  }
  
  const parts: string[] = [];
  let current = '';
  let inBrackets = false;
  
  for (let i = 0; i < expr.length; i++) {
    const char = expr[i];
    
    if (char === '[') {
      if (current) {
        parts.push(current);
        current = '';
      }
      inBrackets = true;
      current = '[';
    } else if (char === ']') {
      current += ']';
      parts.push(current);
      current = '';
      inBrackets = false;
    } else if (char === '.' && !inBrackets && current) {
      parts.push(current);
      current = '.';
    } else {
      current += char;
    }
  }
  
  if (current && current !== '.') {  // Don't add empty '.' parts
    parts.push(current);
  }
  
  return parts;
}

/**
 * Evaluate a select() condition
 */
function evaluateSelect(condition: string, data: any): any {
  // Always treat the data as a single item to evaluate the condition on
  // In jq iteration context, each item (even if it's an array) should be tested as a single unit
  return evaluateCondition(condition, data) ? data : undefined;
}

/**
 * Evaluate a condition expression
 */
function evaluateCondition(condition: string, data: any): boolean {
  // Simple equality check: .[0] == "p"
  const eqMatch = condition.match(/^(.+?)\s*==\s*"([^"]+)"$/);
  if (eqMatch) {
    const [, accessor, value] = eqMatch;
    const result = evaluateSingleExpression(accessor, data);
    return result === value;
  }
  
  // Simple inequality check: .[0] != "p"
  const neqMatch = condition.match(/^(.+?)\s*!=\s*"([^"]+)"$/);
  if (neqMatch) {
    const [, accessor, value] = neqMatch;
    const result = evaluateSingleExpression(accessor, data);
    return result !== value;
  }
  
  // Truthy check
  const result = evaluateSingleExpression(condition, data);
  return !!result;
}

/**
 * Extract pubkeys from a Nostr contact list (kind 3 event)
 * This is a common operation for building follow feeds
 */
export function extractFollowedPubkeys(contactListEvent: any): string[] {
  if (!contactListEvent || !contactListEvent.tags) {
    return [];
  }
  
  // Filter for p tags and extract the pubkey (second element)
  const pubkeys = contactListEvent.tags
    .filter((tag: any[]) => Array.isArray(tag) && tag[0] === 'p' && tag[1])
    .map((tag: any[]) => tag[1]);
  
  // Remove duplicates
  return [...new Set(pubkeys)];
}

/**
 * Apply a pipe operation to data
 */
export function applyPipeOperation(operation: any, data: any, context?: any): any {
  switch (operation.operation) {
    case 'extract':
      // Extract data and store in context if provided
      const extracted = evaluateJqExpression(operation.expression, data);
      if (context && operation.as) {
        context[operation.as] = extracted;
      }
      return extracted;
      
    case 'reverse':
      return Array.isArray(data) ? [...data].reverse() : data;
      
    case 'flatten':
      if (!Array.isArray(data)) return data;
      return operation.depth ? data.flat(operation.depth) : data.flat();
      
    case 'unique':
      if (!Array.isArray(data)) return data;
      if (operation.by) {
        // Unique by property
        const seen = new Set();
        return data.filter(item => {
          const key = item[operation.by];
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }
      // Simple unique
      return [...new Set(data)];
      
    case 'sort':
      if (!Array.isArray(data)) return data;
      const sorted = [...data];
      if (operation.by) {
        sorted.sort((a, b) => {
          const aVal = a[operation.by];
          const bVal = b[operation.by];
          if (aVal < bVal) return operation.order === 'desc' ? 1 : -1;
          if (aVal > bVal) return operation.order === 'desc' ? -1 : 1;
          return 0;
        });
      } else {
        sorted.sort((a, b) => {
          if (a < b) return operation.order === 'desc' ? 1 : -1;
          if (a > b) return operation.order === 'desc' ? -1 : 1;
          return 0;
        });
      }
      return sorted;
      
    case 'map':
      if (!Array.isArray(data)) return data;
      return data.map(item => evaluateJqExpression(operation.expression, item));
      
    case 'filter':
      if (!Array.isArray(data)) return data;
      return data.filter(item => evaluateCondition(operation.expression, item));
      
    case 'parse_json':
      // Parse JSON from a specific field (usually 'content' for kind 0 events)
      const field = operation.field || 'content';
      
      if (Array.isArray(data)) {
        return data.map(item => {
          if (item && typeof item === 'object' && field in item) {
            try {
              const parsed = JSON.parse(item[field]);
              // Merge parsed data with original event, preserving event metadata
              return { ...item, ...parsed };
            } catch (e) {
              console.warn(`Failed to parse JSON from field ${field}:`, e);
              return item;
            }
          }
          return item;
        });
      } else if (data && typeof data === 'object' && field in data) {
        try {
          const parsed = JSON.parse(data[field]);
          // Merge parsed data with original event
          return { ...data, ...parsed };
        } catch (e) {
          console.warn(`Failed to parse JSON from field ${field}:`, e);
          return data;
        }
      }
      return data;
      
    case 'first':
      // Take the first element of an array
      if (Array.isArray(data) && data.length > 0) {
        return data[0];
      }
      return data;
      
    case 'last':
      // Take the last element of an array
      if (Array.isArray(data) && data.length > 0) {
        return data[data.length - 1];
      }
      return data;
      
    case 'field':
      // Extract a specific field from an object or array of objects
      const fieldName = operation.name || operation.field;
      if (!fieldName) {
        console.warn('field operation requires a name parameter');
        return data;
      }
      
      if (Array.isArray(data)) {
        return data.map(item => {
          if (item && typeof item === 'object') {
            return item[fieldName];
          }
          return undefined;
        }).filter(val => val !== undefined);
      } else if (data && typeof data === 'object') {
        return data[fieldName];
      }
      return undefined;
      
    case 'default':
      // Provide a default value if data is null, undefined, empty string, or empty array
      const defaultValue = operation.value;
      if (data === null || data === undefined || data === '' || 
          (Array.isArray(data) && data.length === 0)) {
        return defaultValue;
      }
      return data;
      
    case 'json':
      // Parse a JSON string
      if (typeof data === 'string') {
        try {
          return JSON.parse(data);
        } catch (e) {
          console.warn('Failed to parse JSON:', e);
          return data;
        }
      } else if (Array.isArray(data)) {
        return data.map(item => {
          if (typeof item === 'string') {
            try {
              return JSON.parse(item);
            } catch (e) {
              return item;
            }
          }
          return item;
        });
      }
      return data;
      
    default:
      console.warn(`Unknown pipe operation: ${operation.operation}`);
      return data;
  }
}