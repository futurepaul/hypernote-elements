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
  elementId?: string; // For elements with elementIds
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
    
    // Handle variable reference (e.g., {$variable})
    if (char === '{' && content[pos + 1] === '$') {
      let variableName = '{';
      pos++; // Skip '{'
      while (pos < content.length && content[pos] !== '}') {
        variableName += content[pos];
        pos++;
      }
      variableName += '}'; // Include closing brace
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
      
      // Check if this is a closing tag (e.g., [/form])
      if (content[pos] === '/') {
        pos++; // Skip '/'
        let elementType = '';
        
        // Collect closing element type
        while (pos < content.length && content[pos] !== ']') {
          elementType += content[pos];
          pos++;
        }
        
        if (content[pos] === ']') pos++; // Skip ']'
        
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
        }
        continue;
      }
      
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
      } else if (elementType === 'div') {
        // Handle div container element
        let attributes: Record<string, string> = {};
        
        // Process attributes until we hit closing bracket
        while (pos < content.length && content[pos] !== ']') {
          // Skip whitespace
          if (content[pos] === ' ') {
            pos++;
            continue;
          }
          
          // Handle named attribute (e.g., [div class="value"])
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
          type: TokenType.DIV_START, 
          value: elementType,
          attributes
        });
        continue;
      } else if (elementType === 'button') {
        // Handle button container element
        let attributes: Record<string, string> = {};
        
        // Process attributes until we hit closing bracket
        while (pos < content.length && content[pos] !== ']') {
          // Skip whitespace
          if (content[pos] === ' ') {
            pos++;
            continue;
          }
          
          // Handle named attribute (e.g., [button class="value"])
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
          type: TokenType.BUTTON_START, 
          value: elementType,
          attributes
        });
        continue;
      } else if (elementType === 'span') {
        // Handle span container element
        let attributes: Record<string, string> = {};
        
        // Process attributes until we hit closing bracket
        while (pos < content.length && content[pos] !== ']') {
          // Skip whitespace
          if (content[pos] === ' ') {
            pos++;
            continue;
          }
          
          // Handle named attribute (e.g., [span class="value"])
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
          type: TokenType.SPAN_START, 
          value: elementType,
          attributes
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
 * Parses tokens into an elements array using explicit closing tags
 * @param tokens Array of tokens to parse
 * @returns Array of element objects
 */
export function parseTokens(tokens: Token[]): any[] {
  const elements: any[] = [];
  let currentIndex = 0;
  let currentId: string | null = null;

  // Simple paragraph buffer for collecting inline content
  let inlineBuffer: any[] = [];

  function flushParagraph() {
    if (inlineBuffer.length > 0) {
      // Skip paragraphs that are only whitespace
      const hasNonWhitespace = inlineBuffer.some(item => 
        typeof item === 'string' ? item.trim().length > 0 : true
      );
      
      if (hasNonWhitespace) {
        const paragraph = {
          type: 'p',
          content: [...inlineBuffer],
        };
        if (currentId) {
          paragraph['elementId'] = currentId;
          currentId = null;
        }
        elements.push(paragraph);
      }
      inlineBuffer = [];
    }
  }

  // Helper function to parse container elements with explicit closing tags
  function parseContainer(startTokenType: TokenType, endTokenType: TokenType, containerType: string, token: Token): any {
    const containerElements: any[] = [];
    currentIndex++; // Skip the start token
    
    let containerInlineBuffer: any[] = [];

    function flushContainerParagraph() {
      if (containerInlineBuffer.length > 0) {
        // Skip paragraphs that are only whitespace
        const hasNonWhitespace = containerInlineBuffer.some(item => 
          typeof item === 'string' ? item.trim().length > 0 : true
        );
        
        if (hasNonWhitespace) {
          containerElements.push({ type: 'p', content: [...containerInlineBuffer] });
        }
        containerInlineBuffer = [];
      }
    }

    // Parse until we find the matching closing tag
    while (currentIndex < tokens.length && tokens[currentIndex].type !== TokenType.EOF) {
      const t = tokens[currentIndex];
      
      // Found the closing tag - we're done
      if (t.type === endTokenType) {
        flushContainerParagraph();
        currentIndex++; // Skip the end token
        break;
      }
      
      // Handle nested containers
      if (t.type === TokenType.FORM_START) {
        flushContainerParagraph();
        const nestedForm = parseContainer(TokenType.FORM_START, TokenType.FORM_END, 'form', t);
        containerElements.push(nestedForm);
        continue;
      }
      
      if (t.type === TokenType.DIV_START) {
        flushContainerParagraph();
        const nestedDiv = parseContainer(TokenType.DIV_START, TokenType.DIV_END, 'div', t);
        containerElements.push(nestedDiv);
        continue;
      }
      
      if (t.type === TokenType.BUTTON_START) {
        flushContainerParagraph();
        const nestedButton = parseContainer(TokenType.BUTTON_START, TokenType.BUTTON_END, 'button', t);
        containerElements.push(nestedButton);
        continue;
      }
      
      if (t.type === TokenType.SPAN_START) {
        flushContainerParagraph();
        const nestedSpan = parseContainer(TokenType.SPAN_START, TokenType.SPAN_END, 'span', t);
        containerElements.push(nestedSpan);
        continue;
      }
      
      // Handle headings
      if (t.type === TokenType.HEADING) {
        flushContainerParagraph();
        const heading = {
          type: `h${t.level}`,
          content: [t.value]
        };
        containerElements.push(heading);
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
      
      // Handle loops
      if (t.type === TokenType.EACH_START) {
        flushContainerParagraph();
        const loopElement = parseContainer(TokenType.EACH_START, TokenType.EACH_END, 'loop', t);
        containerElements.push(loopElement);
        continue;
      }
      
      // Handle variable references
      if (t.type === TokenType.VARIABLE_REFERENCE) {
        containerInlineBuffer.push(t.value);
        currentIndex++;
        continue;
      }
      
      // Handle text
      if (t.type === TokenType.TEXT) {
        containerInlineBuffer.push(t.value);
        currentIndex++;
        continue;
      }
      
      // Skip newlines and other tokens
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

    // Block-level elements: flush paragraph before handling
    if (
      token.type === TokenType.HEADING ||
      token.type === TokenType.FORM_START ||
      token.type === TokenType.DIV_START ||
      token.type === TokenType.BUTTON_START ||
      token.type === TokenType.SPAN_START ||
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
        heading['elementId'] = currentId;
        currentId = null;
      }
      elements.push(heading);
      currentIndex++;
      continue;
    }

    // Handle container elements with explicit closing tags
    if (token.type === TokenType.FORM_START) {
      const formElement = parseContainer(TokenType.FORM_START, TokenType.FORM_END, 'form', token);
      if (currentId) {
        formElement.elementId = currentId;
        currentId = null;
      }
      elements.push(formElement);
      continue;
    }

    if (token.type === TokenType.DIV_START) {
      const divElement = parseContainer(TokenType.DIV_START, TokenType.DIV_END, 'div', token);
      if (currentId) {
        divElement.elementId = currentId;
        currentId = null;
      }
      elements.push(divElement);
      continue;
    }

    if (token.type === TokenType.BUTTON_START) {
      const buttonElement = parseContainer(TokenType.BUTTON_START, TokenType.BUTTON_END, 'button', token);
      if (currentId) {
        buttonElement.elementId = currentId;
        currentId = null;
      }
      elements.push(buttonElement);
      continue;
    }

    if (token.type === TokenType.SPAN_START) {
      const spanElement = parseContainer(TokenType.SPAN_START, TokenType.SPAN_END, 'span', token);
      if (currentId) {
        spanElement.elementId = currentId;
        currentId = null;
      }
      elements.push(spanElement);
      continue;
    }

    if (token.type === TokenType.EACH_START) {
      const loopElement = parseContainer(TokenType.EACH_START, TokenType.EACH_END, 'loop', token);
      if (currentId) {
        loopElement.elementId = currentId;
        currentId = null;
      }
      elements.push(loopElement);
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
      if (currentId) {
        element['elementId'] = currentId;
        currentId = null;
      }
      elements.push(element);
      currentIndex++;
      continue;
    }

    // Handle inline content (text and variable references)
    if (token.type === TokenType.TEXT) {
      inlineBuffer.push(token.value);
      currentIndex++;
      continue;
    }

    if (token.type === TokenType.VARIABLE_REFERENCE) {
      inlineBuffer.push(token.value);
      currentIndex++;
      continue;
    }

    // Skip newlines and other tokens
    currentIndex++;
  }

  flushParagraph();
  return elements;
} 