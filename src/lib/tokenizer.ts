/**
 * Token types in Hypernote Markdown
 */
export enum TokenType {
  TEXT,
  HEADING,
  FORM_START,
  FORM_END,
  ELEMENT_START,
  ELEMENT_END,
  ATTRIBUTE,
  ID_MARKER,
  NEWLINE,
  EACH_START,
  EACH_END,
  VARIABLE_REFERENCE,
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
  id?: string; // For elements with IDs
}

/**
 * Tokenizes Hypernote Markdown content
 * @param content The markdown content to tokenize
 * @returns Array of tokens
 */
export function tokenize(content: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;
  
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
    
    // Handle ID marker (e.g., {#id})
    if (char === '{' && content[pos + 1] === '#') {
      pos += 2; // Skip '{#'
      let id = '';
      while (pos < content.length && content[pos] !== '}') {
        id += content[pos];
        pos++;
      }
      pos++; // Skip '}'
      
      tokens.push({ 
        type: TokenType.ID_MARKER, 
        value: id,
        id
      });
      continue;
    }
    
    // Handle variable reference (e.g., {$variable})
    if (char === '{' && content[pos + 1] === '$') {
      pos += 2; // Skip '{'
      let variableName = '$';
      while (pos < content.length && content[pos] !== '}') {
        variableName += content[pos];
        pos++;
      }
      pos++; // Skip '}'
      
      tokens.push({ 
        type: TokenType.VARIABLE_REFERENCE, 
        value: variableName
      });
      continue;
    }
    
    // Handle form or element start (e.g., [form @event])
    if (char === '[') {
      pos++; // Skip '['
      let elementType = '';
      
      // Collect element type
      while (pos < content.length && content[pos] !== ' ' && content[pos] !== ']' && content[pos] !== '@') {
        elementType += content[pos];
        pos++;
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
        
        if (content[pos] === ']') pos++; // Skip ']'
        
        tokens.push({ 
          type: TokenType.FORM_START, 
          value: elementType,
          attributes: { event }
        });
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
        
        if (content[pos] === ']') pos++; // Skip ']'
        
        tokens.push({ 
          type: TokenType.EACH_START, 
          value: elementType,
          attributes: { source, variable }
        });
        continue;
      } else {
        // Handle other elements (e.g., [button "Text"])
        let attributes: Record<string, string> = {};
        
        // Process attributes until we hit closing bracket
        while (pos < content.length && content[pos] !== ']') {
          // Skip whitespace
          if (content[pos] === ' ') {
            pos++;
            continue;
          }
          
          // Handle quoted attribute (e.g., [input "value"])
          if (content[pos] === '"') {
            pos++; // Skip opening quote
            let attributeValue = '';
            
            while (pos < content.length && content[pos] !== '"') {
              attributeValue += content[pos];
              pos++;
            }
            
            pos++; // Skip closing quote
            attributes['content'] = attributeValue;
            continue;
          } 
          
          // Handle named attribute (e.g., [input name="value"])
          let attributeName = '';
          while (pos < content.length && content[pos] !== '=' && content[pos] !== ' ' && content[pos] !== ']') {
            attributeName += content[pos];
            pos++;
          }
          
          if (attributeName && content[pos] === '=') {
            pos++; // Skip '='
            
            // Handle quoted attribute value
            if (content[pos] === '"') {
              pos++; // Skip opening quote
              let attributeValue = '';
              
              while (pos < content.length && content[pos] !== '"') {
                attributeValue += content[pos];
                pos++;
              }
              
              pos++; // Skip closing quote
              attributes[attributeName] = attributeValue;
            }
          }
        }
        
        if (content[pos] === ']') pos++; // Skip ']'
        
        tokens.push({ 
          type: TokenType.ELEMENT_START, 
          value: elementType,
          attributes
        });
        continue;
      }
    }
    
    // Handle plain text
    let text = '';
    while (pos < content.length && 
           content[pos] !== '\n' && 
           content[pos] !== '#' && 
           content[pos] !== '[' && 
           content[pos] !== '{') {
      text += content[pos];
      pos++;
    }
    
    if (text.length > 0) {
      tokens.push({ type: TokenType.TEXT, value: text });
    }
    
    // If we didn't make progress, move to the next character
    if (pos < content.length && char === content[pos]) {
      pos++;
    }
  }
  
  tokens.push({ type: TokenType.EOF, value: '' });
  return tokens;
}

/**
 * Parses tokens into an elements array
 * @param tokens Array of tokens to parse
 * @returns Array of element objects
 */
export function parseTokens(tokens: Token[]): any[] {
  const elements: any[] = [];
  let currentIndex = 0;
  let currentId: string | null = null;

  // Buffer for inline content (for paragraphs)
  let inlineBuffer: any[] = [];
  let lastTokenWasNewline = false;

  function flushParagraph() {
    if (inlineBuffer.length > 0) {
      const paragraph = {
        type: 'p',
        content: [...inlineBuffer],
      };
      if (currentId) {
        paragraph['id'] = currentId;
        currentId = null;
      }
      elements.push(paragraph);
      inlineBuffer = [];
    }
  }

  // Helper for loop paragraph flushing
  let loopInlineBuffer: any[] = [];
  let loopLastTokenWasNewline = false;
  function flushLoopParagraph(loopElements: any[]) {
    if (loopInlineBuffer.length > 0) {
      loopElements.push({ type: 'p', content: [...loopInlineBuffer] });
      loopInlineBuffer = [];
    }
  }

  while (currentIndex < tokens.length && tokens[currentIndex].type !== TokenType.EOF) {
    const token = tokens[currentIndex];

    // Handle ID marker - applies to the next element
    if (token.type === TokenType.ID_MARKER) {
      currentId = token.id;
      currentIndex++;
      continue;
    }

    // Block-level tokens: flush paragraph before handling
    if (
      token.type === TokenType.HEADING ||
      token.type === TokenType.FORM_START ||
      token.type === TokenType.EACH_START
    ) {
      flushParagraph();
    }

    // Handle heading
    if (token.type === TokenType.HEADING) {
      const heading = {
        type: `h${token.level}`,
        content: [token.value]
      };
      if (currentId) {
        heading['id'] = currentId;
        currentId = null;
      }
      elements.push(heading);
      currentIndex++;
      continue;
    }

    // Handle form
    if (token.type === TokenType.FORM_START) {
      const formElements: any[] = [];
      currentIndex++;
      while (currentIndex < tokens.length && tokens[currentIndex].type !== TokenType.EOF && tokens[currentIndex].type !== TokenType.FORM_END) {
        if (tokens[currentIndex].type === TokenType.NEWLINE) {
          currentIndex++;
          continue;
        }
        if (tokens[currentIndex].type === TokenType.ELEMENT_START) {
          const childElement = {
            type: tokens[currentIndex].value,
            content: tokens[currentIndex].attributes?.content ? [tokens[currentIndex].attributes.content] : [],
            attributes: { ...tokens[currentIndex].attributes }
          };
          if (childElement.attributes && 'content' in childElement.attributes) {
            delete childElement.attributes.content;
          }
          formElements.push(childElement);
          currentIndex++;
          continue;
        }
        if (tokens[currentIndex].type === TokenType.HEADING || tokens[currentIndex].type === TokenType.FORM_START) {
          break;
        }
        currentIndex++;
      }
      const formElement = {
        type: 'form',
        event: token.attributes?.event,
        elements: formElements
      };
      if (currentId) {
        formElement['id'] = currentId;
        currentId = null;
      }
      elements.push(formElement);
      continue;
    }

    // Handle each loop
    if (token.type === TokenType.EACH_START) {
      const loopElements: any[] = [];
      currentIndex++;
      loopInlineBuffer = [];
      loopLastTokenWasNewline = false;
      while (currentIndex < tokens.length && tokens[currentIndex].type !== TokenType.EOF && tokens[currentIndex].type !== TokenType.EACH_END) {
        const t = tokens[currentIndex];
        if (t.type === TokenType.NEWLINE) {
          if (loopLastTokenWasNewline) {
            flushLoopParagraph(loopElements);
            loopLastTokenWasNewline = false;
          } else {
            loopLastTokenWasNewline = true;
          }
          currentIndex++;
          continue;
        }
        if (t.type === TokenType.VARIABLE_REFERENCE) {
          loopInlineBuffer.push({ type: 'variable', name: t.value });
          loopLastTokenWasNewline = false;
          currentIndex++;
          continue;
        }
        if (t.type === TokenType.TEXT) {
          loopInlineBuffer.push(t.value);
          loopLastTokenWasNewline = false;
          currentIndex++;
          continue;
        }
        if (t.type === TokenType.HEADING || t.type === TokenType.FORM_START || t.type === TokenType.EACH_START) {
          flushLoopParagraph(loopElements);
          break;
        }
        currentIndex++;
      }
      flushLoopParagraph(loopElements);
      const loopElement = {
        type: 'loop',
        source: token.attributes?.source,
        variable: token.attributes?.variable,
        elements: loopElements
      };
      if (currentId) {
        loopElement['id'] = currentId;
        currentId = null;
      }
      elements.push(loopElement);
      continue;
    }

    // Inline content handling (outside loops/forms)
    if (token.type === TokenType.NEWLINE) {
      if (lastTokenWasNewline) {
        flushParagraph();
        lastTokenWasNewline = false;
      } else {
        lastTokenWasNewline = true;
      }
      currentIndex++;
      continue;
    }
    if (token.type === TokenType.TEXT) {
      inlineBuffer.push(token.value);
      lastTokenWasNewline = false;
      currentIndex++;
      continue;
    }
    if (token.type === TokenType.VARIABLE_REFERENCE) {
      inlineBuffer.push({ type: 'variable', name: token.value });
      lastTokenWasNewline = false;
      currentIndex++;
      continue;
    }
    // Handle variable references outside loops
    // (already handled above)
    // Skip any other tokens
    currentIndex++;
  }
  flushParagraph();
  return elements;
} 