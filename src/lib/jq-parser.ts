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
  console.log('[JQ] Evaluating expression:', expression, 'on data:', data);
  
  // Remove whitespace
  expression = expression.trim();
  
  // Handle empty expression or just "."
  if (!expression || expression === '.') {
    return data;
  }
  
  // Split by pipe operator
  const pipes = expression.split('|').map(s => s.trim());
  console.log('[JQ] Pipe steps:', pipes);
  
  let result = data;
  for (let i = 0; i < pipes.length; i++) {
    const pipe = pipes[i];
    console.log(`[JQ] Step ${i}: "${pipe}" on:`, result);
    result = evaluateSingleExpression(pipe, result);
    console.log(`[JQ] Step ${i} result:`, result);
  }
  
  console.log('[JQ] Final result:', result);
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
      // Array iteration - flatten one level
      if (Array.isArray(result)) {
        result = result.flat();
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
  
  if (current) {
    parts.push(current);
  }
  
  return parts;
}

/**
 * Evaluate a select() condition
 */
function evaluateSelect(condition: string, data: any): any {
  // Handle array filtering
  if (Array.isArray(data)) {
    return data.filter(item => evaluateCondition(condition, item));
  }
  
  // Handle single item
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
  console.log('[PIPE] Applying operation:', operation.operation, 'to data:', data);
  
  switch (operation.operation) {
    case 'extract':
      // Extract data and store in context if provided
      console.log('[EXTRACT] Expression:', operation.expression);
      console.log('[EXTRACT] Input data:', data);
      const extracted = evaluateJqExpression(operation.expression, data);
      console.log('[EXTRACT] Extracted result:', extracted);
      if (context && operation.as) {
        context[operation.as] = extracted;
        console.log('[EXTRACT] Stored in context as:', operation.as, '=', extracted);
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
      
    default:
      console.warn(`Unknown pipe operation: ${operation.operation}`);
      return data;
  }
}