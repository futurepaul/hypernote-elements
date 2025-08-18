import {
  TokenizerError,
  SourcePosition,
  ValidationState,
  validateElementName,
  validateAttribute,
  validateIfCondition,
  validateEachLoop,
  validateFormEvent,
  validateVariableReference,
  checkUnclosedQuotes
} from './tokenizer-validator';

// Re-export TokenizerError for consumers
export { TokenizerError } from './tokenizer-validator';

/**
 * Token types in Hypernote Markdown
 */
export enum TokenType {
  TEXT,
  HEADING,
  FORM_START,
  FORM_END,
  DIV_START,
  DIV_END,
  BUTTON_START,
  BUTTON_END,
  SPAN_START, 
  SPAN_END,
  ELEMENT_START,
  ELEMENT_END,
  ATTRIBUTE,
  ID_MARKER,
  STYLE_MARKER,
  IMAGE,
  NEWLINE,
  EACH_START,
  EACH_END,
  IF_START,
  IF_END,
  VARIABLE_REFERENCE,
  BOLD,
  ITALIC,
  INLINE_CODE,
  COMPONENT,
  EOF
}

/**
 * Token representing a piece of the Hypernote Markdown
 */
export interface Token {
  type: TokenType;
  value: string;
  level?: number; // For headings
  attributes?: Record<string, string>; // For elements with attributes
  elementId?: string; // For elements with elementIds
}

/**
 * Helper function to check if we found a closing bracket
 * Always throws error if we hit end of content - we can't continue safely
 */
function checkClosingBracket(
  pos: number,
  content: string,
  elementType: string,
  elementStart: number,
  strict: boolean,
  sourcePosition: SourcePosition | null
): void {
  if (pos >= content.length) {
    // We ran out of content looking for ]
    const position = sourcePosition ? sourcePosition.getPosition(elementStart, content) : { line: 1, column: elementStart + 1 };
    throw new TokenizerError(
      `Unclosed element [${elementType}] - missing closing bracket`,
      position.line,
      position.column,
      'UNCLOSED_ELEMENT'
    );
  }
}

/**
 * Parse a quoted string value
 * Returns the string content and new position
 */
function parseQuotedString(
  content: string,
  startPos: number,
  strict: boolean,
  sourcePosition: SourcePosition | null,
  errorContext: string
): { value: string; pos: number } {
  let pos = startPos;
  
  if (content[pos] !== '"') {
    return { value: '', pos };
  }
  
  pos++; // Skip opening quote
  const quoteStart = pos;
  let value = '';
  
  while (pos < content.length && content[pos] !== '"') {
    value += content[pos];
    pos++;
  }
  
  // Check for unclosed quote
  if (pos >= content.length) {
    if (strict && sourcePosition) {
      const position = sourcePosition.getPosition(quoteStart - 1, content);
      throw new TokenizerError(
        `Unclosed quote in ${errorContext}`,
        position.line,
        position.column,
        'UNCLOSED_QUOTE'
      );
    }
  }
  
  pos++; // Skip closing quote
  return { value, pos };
}

/**
 * Parse a single attribute (name="value" or just "value" for content)
 */
function parseSingleAttribute(
  content: string,
  startPos: number,
  elementStart: number,
  strict: boolean,
  sourcePosition: SourcePosition | null
): { name?: string; value?: string; pos: number } | null {
  let pos = startPos;
  
  // Skip whitespace
  while (pos < content.length && content[pos] === ' ') {
    pos++;
  }
  
  // Check if we're at the end
  if (pos >= content.length || content[pos] === ']') {
    return null;
  }
  
  // Handle quoted content attribute (e.g., [button "Text"])
  if (content[pos] === '"') {
    const { value, pos: newPos } = parseQuotedString(content, pos, strict, sourcePosition, 'attribute');
    return { name: 'content', value, pos: newPos };
  }
  
  // Handle named attribute (e.g., [div class="value"])
  const attrStart = pos;
  let attributeName = '';
  
  while (pos < content.length && content[pos] !== '=' && content[pos] !== ' ' && content[pos] !== ']') {
    attributeName += content[pos];
    pos++;
  }
  
  if (!attributeName) {
    return null;
  }
  
  // Check for = sign
  if (pos < content.length && content[pos] === '=') {
    pos++; // Skip '='
    
    // Parse the value
    if (pos < content.length && content[pos] === '"') {
      const { value, pos: newPos } = parseQuotedString(content, pos, strict, sourcePosition, 'attribute value');
      
      // Validate attribute if in strict mode
      if (strict && sourcePosition) {
        const position = sourcePosition.getPosition(attrStart, content);
        try {
          validateAttribute(attributeName, value, true, position.line, position.column);
        } catch (error) {
          if (error instanceof TokenizerError) {
            throw error;
          }
        }
      }
      
      return { name: attributeName, value, pos: newPos };
    } else if (strict && sourcePosition) {
      // In strict mode, attributes must be quoted
      const position = sourcePosition.getPosition(attrStart, content);
      throw new TokenizerError(
        `Attribute value for "${attributeName}" must be quoted`,
        position.line,
        position.column,
        'UNQUOTED_ATTRIBUTE'
      );
    }
  }
  
  return null;
}

/**
 * Parse attributes inside brackets until we hit ]
 * Returns the new position and the attributes object
 */
function parseAttributes(
  content: string,
  startPos: number,
  elementStart: number,
  strict: boolean,
  sourcePosition: SourcePosition | null
): { pos: number; attributes: Record<string, string> } {
  let pos = startPos;
  const attributes: Record<string, string> = {};
  
  while (pos < content.length && content[pos] !== ']') {
    const result = parseSingleAttribute(content, pos, elementStart, strict, sourcePosition);
    
    if (!result) {
      // Skip any remaining whitespace
      if (pos < content.length && content[pos] === ' ') {
        pos++;
        continue;
      }
      break;
    }
    
    if (result.name && result.value !== undefined) {
      attributes[result.name] = result.value;
    }
    pos = result.pos;
  }
  
  return { pos, attributes };
}

/**
 * Process a container element (div, button, span)
 * These all follow the same pattern: [element attrs] ... [/element]
 */
function processContainerElement(
  elementType: string,
  tokenType: TokenType,
  content: string,
  startPos: number,
  elementStart: number,
  strict: boolean,
  sourcePosition: SourcePosition | null,
  validationState: ValidationState | null,
  tokens: Token[]
): number {
  let pos = startPos;
  
  // Parse attributes
  const { pos: newPos, attributes } = parseAttributes(content, pos, elementStart, strict, sourcePosition);
  pos = newPos;
  
  // Check closing bracket
  checkClosingBracket(pos, content, elementType, elementStart, strict, sourcePosition);
  pos++; // Skip ']'
  
  // Track opening tag if in strict mode
  if (strict && validationState && sourcePosition) {
    const position = sourcePosition.getPosition(elementStart, content);
    validationState.pushTag(elementType, elementType, position.line, position.column);
  }
  
  tokens.push({ 
    type: tokenType, 
    value: elementType,
    attributes
  });
  
  return pos;
}

/**
 * Tokenize inline content (text with bold/italic/code) recursively
 * Returns array of mixed strings and inline tokens
 */
function tokenizeInlineContent(
  content: string,
  startPos: number,
  endPos: number,
  strict: boolean,
  sourcePosition: SourcePosition | null
): Array<string | Token> {
  const inlineTokens: Array<string | Token> = [];
  let pos = startPos;
  let currentText = '';
  
  while (pos < endPos) {
    const char = content[pos];
    
    // Handle inline code first (highest precedence, no nesting)
    if (char === '`') {
      // Flush any accumulated text
      if (currentText) {
        inlineTokens.push(currentText);
        currentText = '';
      }
      
      pos++; // Skip opening '`'
      let codeText = '';
      while (pos < endPos && content[pos] !== '`') {
        codeText += content[pos];
        pos++;
      }
      if (pos < endPos && content[pos] === '`') {
        pos++; // Skip closing '`'
        inlineTokens.push({
          type: TokenType.INLINE_CODE,
          value: codeText
        });
      } else {
        // No closing backtick, treat as regular text
        currentText += '`' + codeText;
      }
      continue;
    }
    
    // Handle bold (**text**)
    if (char === '*' && pos + 1 < endPos && content[pos + 1] === '*' && 
        pos + 2 < endPos && content[pos + 2] !== '*') {
      // Flush any accumulated text
      if (currentText) {
        inlineTokens.push(currentText);
        currentText = '';
      }
      
      pos += 2; // Skip '**'
      
      // Find closing '**'
      let boldEnd = pos;
      while (boldEnd < endPos - 1) {
        if (content[boldEnd] === '*' && content[boldEnd + 1] === '*') {
          break;
        }
        boldEnd++;
      }
      
      if (boldEnd < endPos - 1 && content[boldEnd] === '*' && content[boldEnd + 1] === '*') {
        // Recursively tokenize content inside bold
        const nestedTokens = tokenizeInlineContent(content, pos, boldEnd, strict, sourcePosition);
        inlineTokens.push({
          type: TokenType.BOLD,
          value: '', // Will be handled differently
          attributes: { nested: nestedTokens }
        });
        pos = boldEnd + 2; // Skip closing '**'
      } else {
        // No closing **, treat as regular text
        currentText += '**';
      }
      continue;
    }
    
    // Handle italic (*text* but not **text**)
    if (char === '*' && (pos + 1 >= endPos || content[pos + 1] !== '*') && 
        (pos === startPos || content[pos - 1] !== '*')) {
      // Flush any accumulated text
      if (currentText) {
        inlineTokens.push(currentText);
        currentText = '';
      }
      
      pos++; // Skip '*'
      
      // Find closing '*' (but not if it's part of **)
      let italicEnd = pos;
      while (italicEnd < endPos) {
        if (content[italicEnd] === '*') {
          // Check if this * is followed by another * (making it part of **)
          if (italicEnd + 1 < endPos && content[italicEnd + 1] === '*') {
            // Skip past the ** 
            italicEnd += 2;
            continue;
          }
          // Also check if this * is preceded by another * (making it the second * of **)
          if (italicEnd > pos && content[italicEnd - 1] === '*') {
            italicEnd++;
            continue;
          }
          // This is a standalone *, so it's our closing delimiter
          break;
        }
        italicEnd++;
      }
      
      if (italicEnd < endPos && content[italicEnd] === '*') {
        // Recursively tokenize content inside italic
        const nestedTokens = tokenizeInlineContent(content, pos, italicEnd, strict, sourcePosition);
        inlineTokens.push({
          type: TokenType.ITALIC,
          value: '', // Will be handled differently
          attributes: { nested: nestedTokens }
        });
        pos = italicEnd + 1; // Skip closing '*'
      } else {
        // No closing *, treat as regular text
        currentText += '*';
      }
      continue;
    }
    
    // Handle variable references
    if (char === '{' && pos + 1 < endPos) {
      const nextChar = content[pos + 1];
      const restOfContent = content.slice(pos + 1, endPos);
      const isVariable = nextChar === '$' || 
                        restOfContent.startsWith('user.') ||
                        restOfContent.startsWith('time.') ||
                        restOfContent.startsWith('target.') ||
                        restOfContent.startsWith('form.');
      
      if (isVariable) {
        // Flush any accumulated text
        if (currentText) {
          inlineTokens.push(currentText);
          currentText = '';
        }
        
        let variableName = '{';
        pos++; // Skip '{'
        while (pos < endPos && content[pos] !== '}') {
          variableName += content[pos];
          pos++;
        }
        if (pos < endPos && content[pos] === '}') {
          variableName += '}';
          pos++; // Skip '}'
          inlineTokens.push({
            type: TokenType.VARIABLE_REFERENCE,
            value: variableName
          });
        } else {
          // No closing }, treat as regular text
          currentText += variableName;
        }
        continue;
      }
    }
    
    // Regular text
    currentText += char;
    pos++;
  }
  
  // Flush any remaining text
  if (currentText) {
    inlineTokens.push(currentText);
  }
  
  return inlineTokens;
}

/**
 * Tokenizes Hypernote Markdown content with strict validation
 * @param content The markdown content to tokenize
 * @param strict Enable strict validation mode (default: true)
 * @returns Array of tokens
 * @throws TokenizerError if validation fails in strict mode
 */
export function tokenize(content: string, strict: boolean = true): Token[] {
  const tokens: Token[] = [];
  let pos = 0;
  
  // Initialize validation state if in strict mode
  const sourcePosition = strict ? new SourcePosition(content) : null;
  const validationState = strict ? new ValidationState() : null;
  
  while (pos < content.length) {
    const char = content[pos];
    
    // Handle newline
    if (char === '\n') {
      tokens.push({ type: TokenType.NEWLINE, value: '\n' });
      pos++;
      continue;
    }
    
    // Handle heading (e.g., # Heading)
    if (char === '#') {
      let level = 1;
      while (content[pos + level] === '#') {
        level++;
      }
      
      // Skip the # and any space after it
      pos += level;
      if (content[pos] === ' ') pos++;
      
      let headingText = '';
      while (pos < content.length && content[pos] !== '\n') {
        headingText += content[pos];
        pos++;
      }
      
      tokens.push({ 
        type: TokenType.HEADING, 
        value: headingText.trim(), 
        level 
      });
      continue;
    }
    
    // Handle ID marker (e.g., {#elementId})
    if (char === '{' && content[pos + 1] === '#') {
      pos += 2; // Skip '{#'
      let elementId = '';
      while (pos < content.length && content[pos] !== '}') {
        elementId += content[pos];
        pos++;
      }
      pos++; // Skip '}'
      
      tokens.push({ 
        type: TokenType.ID_MARKER, 
        value: elementId,
        elementId
      });
      continue;
    }
    
    // Handle style marker (e.g., {class="rounded-lg"})
    if (char === '{' && content.slice(pos, pos + 6) === '{class') {
      pos++; // Skip '{'
      let styleContent = '';
      
      // Capture the entire {class="..."} content
      while (pos < content.length && content[pos] !== '}') {
        styleContent += content[pos];
        pos++;
      }
      pos++; // Skip '}'
      
      // Parse class="value" to extract the class value
      const classMatch = styleContent.match(/class="([^"]+)"/);
      if (classMatch && classMatch[1]) {
        tokens.push({ 
          type: TokenType.STYLE_MARKER, 
          value: classMatch[1],
          attributes: { class: classMatch[1] }
        });
      }
      continue;
    }
    
    // Handle variable reference (e.g., {$variable}, {user.pubkey}, {time.now}, {target.id}, {form.message})
    if (char === '{' && pos + 1 < content.length) {
      const nextChar = content[pos + 1];
      // Check if this looks like a variable reference
      // Variables can start with $, or be one of our special contexts (user, time, target, form)
      const restOfContent = content.slice(pos + 1);
      const isVariable = nextChar === '$' || 
                        restOfContent.startsWith('user.') ||
                        restOfContent.startsWith('time.') ||
                        restOfContent.startsWith('target.') ||
                        restOfContent.startsWith('form.');
      
      if (isVariable) {
        const varStart = pos;
        let variableName = '{';
        pos++; // Skip '{'
        while (pos < content.length && content[pos] !== '}') {
          variableName += content[pos];
          pos++;
        }
        variableName += '}'; // Include closing brace
        pos++; // Skip '}'
        
        // Validate variable reference if in strict mode
        if (strict && sourcePosition) {
          const position = sourcePosition.getPosition(varStart, content);
          try {
            validateVariableReference(variableName, position.line, position.column);
          } catch (error) {
            if (error instanceof TokenizerError) {
              throw error;
            }
          }
        }
        
        tokens.push({ 
          type: TokenType.VARIABLE_REFERENCE, 
          value: variableName
        });
        continue;
      }
    }
    
    // Handle image syntax (e.g., ![alt text](src))
    if (char === '!' && content[pos + 1] === '[') {
      pos += 2; // Skip '!['
      
      let altText = '';
      while (pos < content.length && content[pos] !== ']') {
        altText += content[pos];
        pos++;
      }
      
      // Check if we found the closing bracket
      if (pos >= content.length) {
        // Invalid image syntax - incomplete
        pos -= (2 + altText.length); // Go back to start
        let text = '';
        text += content[pos];
        pos++;
        tokens.push({ type: TokenType.TEXT, value: text });
        continue;
      }
      
      if (pos < content.length && content[pos] === ']') pos++; // Skip ']'
      
      // Expect opening parenthesis for src
      if (content[pos] === '(') {
        pos++; // Skip '('
        
        let src = '';
        while (pos < content.length && content[pos] !== ')') {
          src += content[pos];
          pos++;
        }
        
        if (content[pos] === ')') pos++; // Skip ')'
        
        tokens.push({ 
          type: TokenType.IMAGE, 
          value: src,
          attributes: { alt: altText, src: src }
        });
        continue;
      } else {
        // Invalid image syntax, treat as text
        pos -= (2 + altText.length + 1); // Go back to start
        let text = '';
        text += content[pos];
        pos++;
        tokens.push({ type: TokenType.TEXT, value: text });
        continue;
      }
    }
    
    // Handle form or element start (e.g., [form @event])
    if (char === '[') {
      pos++; // Skip '['
      
      // Check if this is a closing tag (e.g., [/form])
      if (content[pos] === '/') {
        const closeTagStart = pos - 1; // Position of '['
        pos++; // Skip '/'
        let elementType = '';
        
        // Collect closing element type
        while (pos < content.length && content[pos] !== ']') {
          elementType += content[pos];
          pos++;
        }
        
        // Check if we found the closing bracket
        if (pos >= content.length) {
          const position = sourcePosition ? sourcePosition.getPosition(closeTagStart, content) : { line: 1, column: closeTagStart + 1 };
          throw new TokenizerError(
            `Unclosed closing tag [/${elementType}] - missing closing bracket`,
            position.line,
            position.column,
            'UNCLOSED_ELEMENT'
          );
        }
        
        if (pos < content.length && content[pos] === ']') pos++; // Skip ']'
        
        // Validate closing tag if in strict mode
        if (strict && validationState && sourcePosition) {
          const position = sourcePosition.getPosition(closeTagStart, content);
          try {
            validationState.popTag(elementType, position.line, position.column);
          } catch (error) {
            if (error instanceof TokenizerError) {
              throw error;
            }
          }
        }
        
        // Generate appropriate END token
        switch (elementType) {
          case 'form':
            tokens.push({ type: TokenType.FORM_END, value: elementType });
            break;
          case 'div':
            tokens.push({ type: TokenType.DIV_END, value: elementType });
            break;
          case 'button':
            tokens.push({ type: TokenType.BUTTON_END, value: elementType });
            break;
          case 'span':
            tokens.push({ type: TokenType.SPAN_END, value: elementType });
            break;
          case 'each':
            tokens.push({ type: TokenType.EACH_END, value: elementType });
            break;
          case 'if':
            tokens.push({ type: TokenType.IF_END, value: elementType });
            break;
        }
        continue;
      }
      
      // Check if this is a component reference [#alias argument]
      if (content[pos] === '#') {
        pos++; // Skip '#'
        
        // Get the alias name
        let alias = '';
        while (pos < content.length && content[pos] !== ' ' && content[pos] !== ']') {
          alias += content[pos];
          pos++;
        }
        
        // Skip whitespace
        if (content[pos] === ' ') pos++;
        
        // Get the argument (e.g., user.pubkey, $note.pubkey, or a literal npub/nevent)
        let argument = '';
        while (pos < content.length && content[pos] !== ']') {
          argument += content[pos];
          pos++;
        }
        
        // Check if we found the closing bracket
        if (pos >= content.length) {
          const position = sourcePosition ? sourcePosition.getPosition(pos - argument.length - 1, content) : { line: 1, column: pos - argument.length };
          throw new TokenizerError(
            `Unclosed component reference - missing closing bracket`,
            position.line,
            position.column,
            'UNCLOSED_ELEMENT'
          );
        }
        
        if (pos < content.length && content[pos] === ']') pos++; // Skip ']'
        
        tokens.push({
          type: TokenType.COMPONENT,
          value: alias,
          attributes: { argument: argument.trim() }
        });
        continue;
      }
      
      const elementStart = pos - 1; // Position of '['
      let elementType = '';
      
      // Collect element type
      while (pos < content.length && content[pos] !== ' ' && content[pos] !== ']' && content[pos] !== '@') {
        elementType += content[pos];
        pos++;
      }
      
      // Validate element name if in strict mode
      if (strict && sourcePosition) {
        const position = sourcePosition.getPosition(elementStart, content);
        try {
          validateElementName(elementType, position.line, position.column);
        } catch (error) {
          if (error instanceof TokenizerError) {
            throw error;
          }
        }
      }
      
      if (elementType === 'form') {
        // Handle form with event
        if (content[pos] === ' ') pos++; // Skip space
        
        let event = '';
        if (content[pos] === '@') {
          // Include the @ in the event name
          event = '@';
          pos++; // Skip '@'
          while (pos < content.length && content[pos] !== ']' && content[pos] !== ' ') {
            event += content[pos];
            pos++;
          }
        }
        
        // Check if we found the closing bracket
        checkClosingBracket(pos, content, elementType, elementStart, strict, sourcePosition);
        
        // Validate form event if in strict mode
        if (strict && sourcePosition) {
          const position = sourcePosition.getPosition(elementStart, content);
          try {
            validateFormEvent(event, position.line, position.column);
          } catch (error) {
            if (error instanceof TokenizerError) {
              throw error;
            }
          }
        }
        
        if (pos < content.length && content[pos] === ']') pos++; // Skip ']'
        
        // Track opening tag if in strict mode
        if (strict && validationState && sourcePosition) {
          const position = sourcePosition.getPosition(elementStart, content);
          validationState.pushTag('form', elementType, position.line, position.column);
        }
        
        tokens.push({ 
          type: TokenType.FORM_START, 
          value: elementType,
          attributes: { event }
        });
        continue;
      } else if (elementType === 'div') {
        pos = processContainerElement('div', TokenType.DIV_START, content, pos, elementStart, strict, sourcePosition, validationState, tokens);
        continue;
      } else if (elementType === 'button') {
        pos = processContainerElement('button', TokenType.BUTTON_START, content, pos, elementStart, strict, sourcePosition, validationState, tokens);
        continue;
      } else if (elementType === 'span') {
        pos = processContainerElement('span', TokenType.SPAN_START, content, pos, elementStart, strict, sourcePosition, validationState, tokens);
        continue;
      } else if (elementType === 'each') {
        // Handle [each $source as $variable]
        if (content[pos] === ' ') pos++; // Skip space
        
        // Get source variable
        let source = '';
        while (pos < content.length && content[pos] !== ' ') {
          source += content[pos];
          pos++;
        }
        
        // Skip past " as "
        if (content.slice(pos, pos + 4) === ' as ') {
          pos += 4;
        }
        
        // Get iteration variable
        let variable = '';
        while (pos < content.length && content[pos] !== ']') {
          variable += content[pos];
          pos++;
        }
        
        // Validate loop syntax if in strict mode
        if (strict && sourcePosition) {
          const position = sourcePosition.getPosition(elementStart, content);
          try {
            validateEachLoop(source, variable, position.line, position.column);
          } catch (error) {
            if (error instanceof TokenizerError) {
              throw error;
            }
          }
        }
        
        // Check if we found the closing bracket
        checkClosingBracket(pos, content, elementType, elementStart, strict, sourcePosition);
        
        if (pos < content.length && content[pos] === ']') pos++; // Skip ']'
        
        // Track opening tag if in strict mode
        if (strict && validationState && sourcePosition) {
          const position = sourcePosition.getPosition(elementStart, content);
          validationState.pushTag('each', elementType, position.line, position.column);
        }
        
        tokens.push({ 
          type: TokenType.EACH_START, 
          value: elementType,
          attributes: { source, variable }
        });
        continue;
      } else if (elementType === 'if') {
        // Handle [if condition]
        if (content[pos] === ' ') pos++; // Skip space
        
        // Get the condition expression
        let condition = '';
        while (pos < content.length && content[pos] !== ']') {
          condition += content[pos];
          pos++;
        }
        
        // Validate condition if in strict mode
        if (strict && sourcePosition) {
          const position = sourcePosition.getPosition(elementStart, content);
          try {
            validateIfCondition(condition.trim(), position.line, position.column);
          } catch (error) {
            if (error instanceof TokenizerError) {
              throw error;
            }
          }
        }
        
        // Check if we found the closing bracket
        checkClosingBracket(pos, content, elementType, elementStart, strict, sourcePosition);
        
        if (pos < content.length && content[pos] === ']') pos++; // Skip ']'
        
        // Track opening tag if in strict mode
        if (strict && validationState && sourcePosition) {
          const position = sourcePosition.getPosition(elementStart, content);
          validationState.pushTag('if', elementType, position.line, position.column);
        }
        
        tokens.push({ 
          type: TokenType.IF_START, 
          value: elementType,
          attributes: { condition: condition.trim() }
        });
        continue;
      } else if (elementType === 'json') {
        // Handle [json $variable] or [json $variable.property] syntax
        let attributes: Record<string, string> = {};
        
        // Skip whitespace
        if (content[pos] === ' ') pos++;
        
        // Get the variable parameter (including dot notation)
        let variable = '';
        while (pos < content.length && content[pos] !== ']' && content[pos] !== ' ') {
          variable += content[pos];
          pos++;
        }
        
        if (variable) {
          // Store the full variable path as the variable attribute
          attributes['variable'] = variable;
        }
        
        // Check if we found the closing bracket
        checkClosingBracket(pos, content, elementType, elementStart, strict, sourcePosition);
        
        if (pos < content.length && content[pos] === ']') pos++; // Skip ']'
        
        tokens.push({ 
          type: TokenType.ELEMENT_START, 
          value: elementType,
          attributes
        });
        continue;
      } else {
        // Handle other elements (e.g., [button "Text"])
        const { pos: newPos, attributes } = parseAttributes(content, pos, elementStart, strict, sourcePosition);
        pos = newPos;
        
        // Check if we found the closing bracket
        checkClosingBracket(pos, content, elementType, elementStart, strict, sourcePosition);
        
        if (pos < content.length && content[pos] === ']') pos++; // Skip ']'
        
        tokens.push({ 
          type: TokenType.ELEMENT_START, 
          value: elementType,
          attributes
        });
        continue;
      }
    }
    
    // Handle inline code syntax (`code`)
    if (char === '`') {
      pos++; // Skip opening '`'
      
      let codeText = '';
      while (pos < content.length) {
        if (content[pos] === '`') {
          pos++; // Skip closing '`'
          tokens.push({
            type: TokenType.INLINE_CODE,
            value: codeText
          });
          break;
        }
        codeText += content[pos];
        pos++;
      }
      continue;
    }
    
    // Handle plain text and inline formatting together
    let textEnd = pos;
    let inBackticks = false;
    while (textEnd < content.length && 
           content[textEnd] !== '\n' && 
           (inBackticks || content[textEnd] !== '#') && // Don't stop at # if inside backticks
           (inBackticks || content[textEnd] !== '[') && // Don't stop at [ if inside backticks
           !(content[textEnd] === '{' && textEnd + 1 < content.length && content[textEnd + 1] === '#') && // Stop at ID markers
           !(content[textEnd] === '{' && textEnd + 1 < content.length && content.slice(textEnd, textEnd + 6) === '{class') && // Stop at style markers
           !(content[textEnd] === '!' && textEnd + 1 < content.length && content[textEnd + 1] === '[')) {
      // Track whether we're inside backticks
      if (content[textEnd] === '`') {
        inBackticks = !inBackticks;
      }
      textEnd++;
    }
    
    if (textEnd > pos) {
      // Tokenize this text segment for inline formatting
      const inlineTokens = tokenizeInlineContent(content, pos, textEnd, strict, sourcePosition);
      
      // Add the inline tokens to our main token stream
      for (const inlineToken of inlineTokens) {
        if (typeof inlineToken === 'string') {
          if (inlineToken.length > 0) {
            tokens.push({ type: TokenType.TEXT, value: inlineToken });
          }
        } else {
          tokens.push(inlineToken);
        }
      }
      
      pos = textEnd;
    }
    
    // If we didn't make progress, move to the next character
    if (pos < content.length && char === content[pos]) {
      pos++;
    }
  }
  
  // Check for unclosed tags at end of document
  if (strict && validationState) {
    try {
      validationState.checkUnclosedTags();
    } catch (error) {
      if (error instanceof TokenizerError) {
        throw error;
      }
    }
  }
  
  tokens.push({ type: TokenType.EOF, value: '' });
  return tokens;
}

/**
 * Apply pending style to an element
 */
function applyStyleToElement(element: any, style: string | null): void {
  if (style) {
    if (!element.attributes) {
      element.attributes = {};
    }
    element.attributes.class = style;
  }
}

/**
 * Apply pending ID to an element
 */
function applyIdToElement(element: any, id: string | null): void {
  if (id) {
    element.elementId = id;
  }
}

/**
 * Apply both ID and style to an element, clearing them afterward
 */
function applyIdAndStyle(
  element: any,
  currentId: { value: string | null },
  currentStyle: { value: string | null }
): void {
  applyIdToElement(element, currentId.value);
  applyStyleToElement(element, currentStyle.value);
  currentId.value = null;
  currentStyle.value = null;
}

/**
 * Process inline token and add to buffer
 */
function processInlineToken(token: Token, inlineBuffer: any[]): void {
  switch (token.type) {
    case TokenType.TEXT:
    case TokenType.VARIABLE_REFERENCE:
      inlineBuffer.push(token.value);
      break;
    case TokenType.INLINE_CODE:
      inlineBuffer.push({
        type: 'code',
        content: [token.value]
      });
      break;
    case TokenType.BOLD: {
      const content: any[] = [];
      if (token.attributes?.nested) {
        // Process nested tokens
        const nested = token.attributes.nested as Array<string | Token>;
        for (const nestedItem of nested) {
          if (typeof nestedItem === 'string') {
            content.push(nestedItem);
          } else {
            // Recursively process nested inline tokens
            const nestedBuffer: any[] = [];
            processInlineToken(nestedItem, nestedBuffer);
            content.push(...nestedBuffer);
          }
        }
      } else {
        // Fallback to simple text value
        content.push(token.value);
      }
      inlineBuffer.push({
        type: 'strong',
        content
      });
      break;
    }
    case TokenType.ITALIC: {
      const content: any[] = [];
      if (token.attributes?.nested) {
        // Process nested tokens
        const nested = token.attributes.nested as Array<string | Token>;
        for (const nestedItem of nested) {
          if (typeof nestedItem === 'string') {
            content.push(nestedItem);
          } else {
            // Recursively process nested inline tokens
            const nestedBuffer: any[] = [];
            processInlineToken(nestedItem, nestedBuffer);
            content.push(...nestedBuffer);
          }
        }
      } else {
        // Fallback to simple text value
        content.push(token.value);
      }
      inlineBuffer.push({
        type: 'em',
        content
      });
      break;
    }
  }
}

/**
 * Create a paragraph from inline buffer if it has non-whitespace content
 */
function createParagraphFromBuffer(inlineBuffer: any[]): any | null {
  if (inlineBuffer.length === 0) {
    return null;
  }
  
  // Skip paragraphs that are only whitespace
  const hasNonWhitespace = inlineBuffer.some(item => 
    typeof item === 'string' ? item.trim().length > 0 : true
  );
  
  if (!hasNonWhitespace) {
    return null;
  }
  
  return {
    type: 'p',
    content: [...inlineBuffer]
  };
}

/**
 * Handle newline tokens - single newline adds space, double creates paragraph
 */
function handleNewline(
  tokens: Token[],
  currentIndex: number,
  inlineBuffer: any[],
  flushFn: () => void
): number {
  currentIndex++; // Skip the newline
  
  // Check if the next token is also a newline (blank line = new paragraph)
  if (currentIndex < tokens.length && tokens[currentIndex].type === TokenType.NEWLINE) {
    flushFn();
    currentIndex++; // Skip the second newline
  } else {
    // Single newline - treat as a space (markdown convention)
    // Only add space if buffer has content and doesn't end with space
    if (inlineBuffer.length > 0) {
      const lastItem = inlineBuffer[inlineBuffer.length - 1];
      if (typeof lastItem === 'string' && !lastItem.endsWith(' ')) {
        inlineBuffer.push(' ');
      } else if (typeof lastItem !== 'string') {
        // Last item was a bold/italic element, add space
        inlineBuffer.push(' ');
      }
    }
  }
  
  return currentIndex;
}

/**
 * Parses tokens into an elements array using explicit closing tags
 * @param tokens Array of tokens to parse
 * @returns Array of element objects
 */
export function parseTokens(tokens: Token[]): any[] {
  const elements: any[] = [];
  let currentIndex = 0;
  let currentId: string | null = null;
  let currentStyle: string | null = null;

  // Simple paragraph buffer for collecting inline content
  let inlineBuffer: any[] = [];

  function flushParagraph() {
    const paragraph = createParagraphFromBuffer(inlineBuffer);
    if (paragraph) {
      applyIdToElement(paragraph, currentId);
      applyStyleToElement(paragraph, currentStyle);
      currentId = null;
      currentStyle = null;
      elements.push(paragraph);
    }
    inlineBuffer = [];
  }

  // Helper function to parse container elements with explicit closing tags
  function parseContainer(startTokenType: TokenType, endTokenType: TokenType, containerType: string, token: Token): any {
    const containerElements: any[] = [];
    currentIndex++; // Skip the start token
    
    let containerInlineBuffer: any[] = [];

    function flushContainerParagraph() {
      const paragraph = createParagraphFromBuffer(containerInlineBuffer);
      if (paragraph) {
        containerElements.push(paragraph);
      }
      containerInlineBuffer = [];
    }

    // Track pending style for next element in container
    let containerStyle: string | null = null;
    
    // Parse until we find the matching closing tag
    while (currentIndex < tokens.length && tokens[currentIndex].type !== TokenType.EOF) {
      const t = tokens[currentIndex];
      
      // Found the closing tag - we're done
      if (t.type === endTokenType) {
        flushContainerParagraph();
        currentIndex++; // Skip the end token
        break;
      }
      
      // Handle style marker - applies to the next element
      if (t.type === TokenType.STYLE_MARKER) {
        flushContainerParagraph();
        containerStyle = t.value;
        currentIndex++;
        continue;
      }
      
      // Handle nested containers
      const containerMap: Array<[TokenType, TokenType, string]> = [
        [TokenType.FORM_START, TokenType.FORM_END, 'form'],
        [TokenType.DIV_START, TokenType.DIV_END, 'div'],
        [TokenType.BUTTON_START, TokenType.BUTTON_END, 'button'],
        [TokenType.SPAN_START, TokenType.SPAN_END, 'span']
      ];
      
      let handledContainer = false;
      for (const [startType, endType, elementType] of containerMap) {
        if (t.type === startType) {
          flushContainerParagraph();
          const nestedElement = parseContainer(startType, endType, elementType, t);
          applyStyleToElement(nestedElement, containerStyle);
          containerStyle = null;
          containerElements.push(nestedElement);
          handledContainer = true;
          break;
        }
      }
      if (handledContainer) continue;
      
      // Handle headings
      if (t.type === TokenType.HEADING) {
        flushContainerParagraph();
        const heading = {
          type: `h${t.level}`,
          content: [t.value]
        };
        applyStyleToElement(heading, containerStyle);
        containerStyle = null;
        containerElements.push(heading);
        currentIndex++;
        continue;
      }
      
      // Handle component references
      if (t.type === TokenType.COMPONENT) {
        flushContainerParagraph();
        const componentElement = {
          type: 'component',
          alias: t.value,
          argument: t.attributes?.argument || ''
        };
        containerElements.push(componentElement);
        currentIndex++;
        continue;
      }
      
      // Handle regular elements (input, etc.)
      if (t.type === TokenType.ELEMENT_START) {
        flushContainerParagraph();
        const element = {
          type: t.value,
          content: t.attributes?.content ? [t.attributes.content] : [],
          attributes: { ...t.attributes }
        };
        if (element.attributes && 'content' in element.attributes) {
          delete element.attributes.content;
        }
        if (element.attributes && Object.keys(element.attributes).length === 0) {
          delete element.attributes;
        }
        containerElements.push(element);
        currentIndex++;
        continue;
      }
      
      // Handle image elements
      if (t.type === TokenType.IMAGE) {
        flushContainerParagraph();
        const imageElement = {
          type: 'img',
          attributes: { ...t.attributes }
        };
        // Apply pending style if present
        if (containerStyle) {
          imageElement.attributes.class = containerStyle;
          containerStyle = null;
        }
        containerElements.push(imageElement);
        currentIndex++;
        continue;
      }
      
      // Handle loops and conditionals
      if (t.type === TokenType.EACH_START || t.type === TokenType.IF_START) {
        flushContainerParagraph();
        const [startType, endType, elementType] = t.type === TokenType.EACH_START 
          ? [TokenType.EACH_START, TokenType.EACH_END, 'loop']
          : [TokenType.IF_START, TokenType.IF_END, 'if'];
        const element = parseContainer(startType, endType, elementType, t);
        applyStyleToElement(element, containerStyle);
        containerStyle = null;
        containerElements.push(element);
        continue;
      }
      
      // Handle inline content (text, variables, formatting)
      if (t.type === TokenType.VARIABLE_REFERENCE ||
          t.type === TokenType.TEXT ||
          t.type === TokenType.INLINE_CODE ||
          t.type === TokenType.BOLD ||
          t.type === TokenType.ITALIC) {
        processInlineToken(t, containerInlineBuffer);
        currentIndex++;
        continue;
      }
      
      // Handle newlines - check for double newline (paragraph break)
      if (t.type === TokenType.NEWLINE) {
        currentIndex = handleNewline(tokens, currentIndex, containerInlineBuffer, flushContainerParagraph);
        continue;
      }
      
      // Skip other tokens
      currentIndex++;
    }
    
    // Create the container element
    const container: any = {
      type: containerType,
      elements: containerElements
    };
    
    // Add attributes if present
    if (token.attributes && Object.keys(token.attributes).length > 0) {
      container.attributes = token.attributes;
    }
    
    // Handle special properties for specific container types
    if (containerType === 'form' && token.attributes?.event) {
      container.event = token.attributes.event;
      // Remove event from attributes since it's now a separate property
      if (container.attributes) {
        const { event, ...otherAttributes } = container.attributes;
        if (Object.keys(otherAttributes).length > 0) {
          container.attributes = otherAttributes;
        } else {
          delete container.attributes;
        }
      }
    }
    
    if (containerType === 'loop') {
      container.source = token.attributes?.source;
      container.variable = token.attributes?.variable;
      delete container.attributes; // Loop doesn't use regular attributes
    }
    
    if (containerType === 'if') {
      container.condition = token.attributes?.condition;
      delete container.attributes; // If doesn't use regular attributes
    }
    
    return container;
  }

  // Main parsing loop
  while (currentIndex < tokens.length && tokens[currentIndex].type !== TokenType.EOF) {
    const token = tokens[currentIndex];

    // Handle ID marker - applies to the next element
    if (token.type === TokenType.ID_MARKER) {
      currentId = token.elementId;
      currentIndex++;
      continue;
    }

    // Handle style marker - applies to the next element
    if (token.type === TokenType.STYLE_MARKER) {
      flushParagraph(); // Flush any pending paragraph before applying style
      currentStyle = token.value;
      currentIndex++;
      continue;
    }

    // Block-level elements: flush paragraph before handling
    if (
      token.type === TokenType.HEADING ||
      token.type === TokenType.FORM_START ||
      token.type === TokenType.DIV_START ||
      token.type === TokenType.BUTTON_START ||
      token.type === TokenType.SPAN_START ||
      token.type === TokenType.EACH_START ||
      token.type === TokenType.IF_START ||
      token.type === TokenType.IMAGE ||
      token.type === TokenType.COMPONENT
    ) {
      flushParagraph();
    }

    // Handle heading
    if (token.type === TokenType.HEADING) {
      const heading = {
        type: `h${token.level}`,
        content: [token.value]
      };
      applyIdToElement(heading, currentId);
      applyStyleToElement(heading, currentStyle);
      currentId = null;
      currentStyle = null;
      elements.push(heading);
      currentIndex++;
      continue;
    }

    // Handle container elements with explicit closing tags
    const containerTypes: Array<[TokenType, TokenType, string]> = [
      [TokenType.FORM_START, TokenType.FORM_END, 'form'],
      [TokenType.DIV_START, TokenType.DIV_END, 'div'],
      [TokenType.BUTTON_START, TokenType.BUTTON_END, 'button'],
      [TokenType.SPAN_START, TokenType.SPAN_END, 'span'],
      [TokenType.EACH_START, TokenType.EACH_END, 'loop'],
      [TokenType.IF_START, TokenType.IF_END, 'if']
    ];
    
    let handledContainer = false;
    for (const [startType, endType, elementType] of containerTypes) {
      if (token.type === startType) {
        const element = parseContainer(startType, endType, elementType, token);
        const idRef = { value: currentId };
        const styleRef = { value: currentStyle };
        applyIdAndStyle(element, idRef, styleRef);
        currentId = idRef.value;
        currentStyle = styleRef.value;
        elements.push(element);
        handledContainer = true;
        break;
      }
    }
    if (handledContainer) continue;

    // Handle component references
    if (token.type === TokenType.COMPONENT) {
      const componentElement = {
        type: 'component',
        alias: token.value,
        argument: token.attributes?.argument || ''
      };
      applyIdToElement(componentElement, currentId);
      currentId = null;
      elements.push(componentElement);
      currentIndex++;
      continue;
    }

    // Handle regular elements
    if (token.type === TokenType.ELEMENT_START) {
      flushParagraph();
      const element = {
        type: token.value,
        content: token.attributes?.content ? [token.attributes.content] : [],
        attributes: { ...token.attributes }
      };
      if (element.attributes && 'content' in element.attributes) {
        delete element.attributes.content;
      }
      if (element.attributes && Object.keys(element.attributes).length === 0) {
        delete element.attributes;
      }
      applyIdToElement(element, currentId);
      applyStyleToElement(element, currentStyle);
      currentId = null;
      currentStyle = null;
      elements.push(element);
      currentIndex++;
      continue;
    }

    // Handle image elements
    if (token.type === TokenType.IMAGE) {
      flushParagraph();
      const imageElement = {
        type: 'img',
        attributes: { ...token.attributes }
      };
      applyIdToElement(imageElement, currentId);
      applyStyleToElement(imageElement, currentStyle);
      currentId = null;
      currentStyle = null;
      elements.push(imageElement);
      currentIndex++;
      continue;
    }

    // Handle inline content (text, variables, formatting)
    if (token.type === TokenType.TEXT ||
        token.type === TokenType.VARIABLE_REFERENCE ||
        token.type === TokenType.INLINE_CODE ||
        token.type === TokenType.BOLD ||
        token.type === TokenType.ITALIC) {
      processInlineToken(token, inlineBuffer);
      currentIndex++;
      continue;
    }
    
    // Handle newlines
    if (token.type === TokenType.NEWLINE) {
      currentIndex = handleNewline(tokens, currentIndex, inlineBuffer, flushParagraph);
      continue;
    }

    // Skip other tokens
    currentIndex++;
  }

  flushParagraph();
  return elements;
} 