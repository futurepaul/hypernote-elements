/**
 * Tokenizer validation errors
 */
export class TokenizerError extends Error {
  constructor(
    message: string,
    public line: number,
    public column: number,
    public code: string
  ) {
    super(`${message} at line ${line}, column ${column}`);
    this.name = 'TokenizerError';
  }
}

/**
 * Track position in the source for better error reporting
 */
export class SourcePosition {
  private lines: string[];
  
  constructor(content: string) {
    this.lines = content.split('\n');
  }
  
  getPosition(offset: number, content: string): { line: number; column: number } {
    let currentOffset = 0;
    
    for (let lineNum = 0; lineNum < this.lines.length; lineNum++) {
      const lineLength = this.lines[lineNum].length + 1; // +1 for newline
      
      if (currentOffset + lineLength > offset) {
        return {
          line: lineNum + 1,
          column: offset - currentOffset + 1
        };
      }
      
      currentOffset += lineLength;
    }
    
    return { line: this.lines.length, column: 1 };
  }
}

/**
 * Validation state for tracking open tags and context
 */
export class ValidationState {
  private tagStack: Array<{ type: string; name: string; line: number; column: number }> = [];
  private selfClosingTags = new Set(['img', 'br', 'hr', 'input', 'meta', 'link']);
  private containerTags = new Set(['div', 'span', 'button', 'form', 'each', 'if']);
  
  pushTag(type: string, name: string, line: number, column: number) {
    // Self-closing tags don't get pushed to stack
    if (this.selfClosingTags.has(name)) {
      return;
    }
    
    this.tagStack.push({ type, name, line, column });
  }
  
  popTag(name: string, line: number, column: number): void {
    if (this.tagStack.length === 0) {
      throw new TokenizerError(
        `Unexpected closing tag [/${name}] with no matching opening tag`,
        line,
        column,
        'UNMATCHED_CLOSING_TAG'
      );
    }
    
    const lastTag = this.tagStack[this.tagStack.length - 1];
    
    if (lastTag.name !== name) {
      throw new TokenizerError(
        `Mismatched closing tag [/${name}] - expected [/${lastTag.name}]`,
        line,
        column,
        'MISMATCHED_TAG'
      );
    }
    
    this.tagStack.pop();
  }
  
  checkUnclosedTags(): void {
    if (this.tagStack.length > 0) {
      const unclosed = this.tagStack[0];
      throw new TokenizerError(
        `Unclosed tag [${unclosed.name}]`,
        unclosed.line,
        unclosed.column,
        'UNCLOSED_TAG'
      );
    }
  }
  
  getCurrentDepth(): number {
    return this.tagStack.length;
  }
  
  isInsideTag(tagName: string): boolean {
    return this.tagStack.some(tag => tag.name === tagName);
  }
}

/**
 * Validate element name syntax
 */
export function validateElementName(name: string, line: number, column: number): void {
  // Check for empty name
  if (!name || name.trim().length === 0) {
    throw new TokenizerError(
      'Empty element name',
      line,
      column,
      'EMPTY_ELEMENT_NAME'
    );
  }
  
  // Check for invalid characters (like newlines embedded in the name)
  if (name.includes('\n') || name.includes('\r')) {
    throw new TokenizerError(
      `Invalid element name [${name.replace(/\n/g, '\\n').replace(/\r/g, '\\r')}] - contains newline`,
      line,
      column,
      'INVALID_ELEMENT_NAME'
    );
  }
  
  // Valid element names: start with letter, can contain letters, numbers, hyphens, underscores
  const validNamePattern = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
  
  if (!validNamePattern.test(name)) {
    throw new TokenizerError(
      `Invalid element name [${name}] - must start with a letter and contain only letters, numbers, hyphens, and underscores`,
      line,
      column,
      'INVALID_ELEMENT_NAME'
    );
  }
}

/**
 * Validate attribute syntax (quotes, names, etc.)
 */
export function validateAttribute(
  name: string,
  value: string | undefined,
  hasQuotes: boolean,
  line: number,
  column: number
): void {
  // Attribute names must be valid identifiers
  const validAttrNamePattern = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
  
  if (!validAttrNamePattern.test(name)) {
    throw new TokenizerError(
      `Invalid attribute name "${name}"`,
      line,
      column,
      'INVALID_ATTRIBUTE_NAME'
    );
  }
  
  // If value is provided, it must be quoted
  if (value !== undefined && !hasQuotes) {
    throw new TokenizerError(
      `Attribute value for "${name}" must be quoted`,
      line,
      column,
      'UNQUOTED_ATTRIBUTE'
    );
  }
}

/**
 * Validate conditional expression
 */
export function validateIfCondition(condition: string, line: number, column: number): void {
  if (!condition || condition.trim().length === 0) {
    throw new TokenizerError(
      'Empty condition in [if] statement',
      line,
      column,
      'EMPTY_CONDITION'
    );
  }
  
  // Basic validation - condition should have some meaningful content
  const trimmed = condition.trim();
  
  // Check for obviously invalid conditions
  if (trimmed === '{}' || trimmed === '[]' || trimmed === '()') {
    throw new TokenizerError(
      `Invalid condition "${trimmed}" in [if] statement`,
      line,
      column,
      'INVALID_CONDITION'
    );
  }
}

/**
 * Validate loop syntax
 */
export function validateEachLoop(
  source: string,
  variable: string,
  line: number,
  column: number
): void {
  // Source must start with $ (query reference)
  if (!source || !source.startsWith('$')) {
    throw new TokenizerError(
      `Invalid loop source "${source}" - must be a query reference starting with $`,
      line,
      column,
      'INVALID_LOOP_SOURCE'
    );
  }
  
  // Variable name must be valid
  if (!variable || variable.trim().length === 0) {
    throw new TokenizerError(
      'Missing loop variable name',
      line,
      column,
      'MISSING_LOOP_VARIABLE'
    );
  }
  
  // Variable should not include special characters
  const validVarPattern = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
  const cleanVariable = variable.startsWith('$') ? variable.slice(1) : variable;
  
  if (!validVarPattern.test(cleanVariable)) {
    throw new TokenizerError(
      `Invalid loop variable name "${variable}"`,
      line,
      column,
      'INVALID_LOOP_VARIABLE'
    );
  }
}

/**
 * Validate form event reference
 */
export function validateFormEvent(event: string, line: number, column: number): void {
  if (!event || event.trim().length === 0) {
    throw new TokenizerError(
      'Form requires an event reference',
      line,
      column,
      'MISSING_FORM_EVENT'
    );
  }
  
  // Event must start with @
  if (!event.startsWith('@')) {
    throw new TokenizerError(
      `Invalid form event "${event}" - must start with @`,
      line,
      column,
      'INVALID_FORM_EVENT'
    );
  }
  
  // Event name (after @) must be valid
  const eventName = event.slice(1);
  const validEventPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  
  if (!validEventPattern.test(eventName)) {
    throw new TokenizerError(
      `Invalid event name "${event}"`,
      line,
      column,
      'INVALID_EVENT_NAME'
    );
  }
}

/**
 * Validate variable interpolation syntax
 */
export function validateVariableReference(
  variable: string,
  line: number,
  column: number
): void {
  // Remove the surrounding braces for validation
  const inner = variable.slice(1, -1).trim();
  
  if (inner.length === 0) {
    throw new TokenizerError(
      'Empty variable reference {}',
      line,
      column,
      'EMPTY_VARIABLE'
    );
  }
  
  // Check for balanced braces
  let braceCount = 0;
  for (const char of variable) {
    if (char === '{') braceCount++;
    if (char === '}') braceCount--;
    if (braceCount < 0) {
      throw new TokenizerError(
        `Unbalanced braces in variable reference "${variable}"`,
        line,
        column,
        'UNBALANCED_BRACES'
      );
    }
  }
  
  if (braceCount !== 0) {
    throw new TokenizerError(
      `Unbalanced braces in variable reference "${variable}"`,
      line,
      column,
      'UNBALANCED_BRACES'
    );
  }
}

/**
 * Check for unclosed quotes in content
 */
export function checkUnclosedQuotes(
  content: string,
  startPos: number,
  sourcePosition: SourcePosition
): void {
  let inDoubleQuote = false;
  let quoteStartPos = -1;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    
    if (char === '"' && (i === 0 || content[i - 1] !== '\\')) {
      if (!inDoubleQuote) {
        inDoubleQuote = true;
        quoteStartPos = startPos + i;
      } else {
        inDoubleQuote = false;
      }
    }
  }
  
  if (inDoubleQuote && quoteStartPos !== -1) {
    const pos = sourcePosition.getPosition(quoteStartPos, content);
    throw new TokenizerError(
      'Unclosed quote in attribute',
      pos.line,
      pos.column,
      'UNCLOSED_QUOTE'
    );
  }
}