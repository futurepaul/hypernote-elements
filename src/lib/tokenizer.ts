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
  VARIABLE_REFERENCE,
  BOLD,
  ITALIC,
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
    }
    
    // Handle image syntax (e.g., ![alt text](src))
    if (char === '!' && content[pos + 1] === '[') {
      pos += 2; // Skip '!['
      
      let altText = '';
      while (pos < content.length && content[pos] !== ']') {
        altText += content[pos];
        pos++;
      }
      
      if (content[pos] === ']') pos++; // Skip ']'
      
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
        
        if (content[pos] === ']') pos++; // Skip ']'
        
        tokens.push({
          type: TokenType.COMPONENT,
          value: alias,
          attributes: { argument: argument.trim() }
        });
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
        
        if (content[pos] === ']') pos++; // Skip ']'
        
        tokens.push({ 
          type: TokenType.ELEMENT_START, 
          value: elementType,
          attributes
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
    
    // Handle bold syntax (**text**)
    if (char === '*' && content[pos + 1] === '*' && 
        pos + 2 < content.length && content[pos + 2] !== '*') {
      pos += 2; // Skip '**'
      
      let boldText = '';
      while (pos < content.length - 1) {
        if (content[pos] === '*' && content[pos + 1] === '*') {
          pos += 2; // Skip closing '**'
          tokens.push({
            type: TokenType.BOLD,
            value: boldText
          });
          break;
        }
        boldText += content[pos];
        pos++;
      }
      continue;
    }
    
    // Handle italic syntax (*text* but not **text**)
    if (char === '*' && content[pos + 1] !== '*' && pos > 0 && content[pos - 1] !== '*') {
      pos++; // Skip '*'
      
      let italicText = '';
      while (pos < content.length) {
        if (content[pos] === '*' && (pos + 1 >= content.length || content[pos + 1] !== '*')) {
          pos++; // Skip closing '*'
          tokens.push({
            type: TokenType.ITALIC,
            value: italicText
          });
          break;
        }
        italicText += content[pos];
        pos++;
      }
      continue;
    }
    
    // Handle plain text
    let text = '';
    while (pos < content.length && 
           content[pos] !== '\n' && 
           content[pos] !== '#' && 
           content[pos] !== '[' && 
           content[pos] !== '{' &&
           content[pos] !== '*' &&
           !(content[pos] === '!' && content[pos + 1] === '[')) {
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
  let currentStyle: string | null = null;

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
        if (currentStyle) {
          paragraph['attributes'] = { class: currentStyle };
          currentStyle = null;
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
      if (t.type === TokenType.FORM_START) {
        flushContainerParagraph();
        const nestedForm = parseContainer(TokenType.FORM_START, TokenType.FORM_END, 'form', t);
        // Apply pending style if present
        if (containerStyle) {
          if (!nestedForm.attributes) nestedForm.attributes = {};
          nestedForm.attributes.class = containerStyle;
          containerStyle = null;
        }
        containerElements.push(nestedForm);
        continue;
      }
      
      if (t.type === TokenType.DIV_START) {
        flushContainerParagraph();
        const nestedDiv = parseContainer(TokenType.DIV_START, TokenType.DIV_END, 'div', t);
        // Apply pending style if present
        if (containerStyle) {
          if (!nestedDiv.attributes) nestedDiv.attributes = {};
          nestedDiv.attributes.class = containerStyle;
          containerStyle = null;
        }
        containerElements.push(nestedDiv);
        continue;
      }
      
      if (t.type === TokenType.BUTTON_START) {
        flushContainerParagraph();
        const nestedButton = parseContainer(TokenType.BUTTON_START, TokenType.BUTTON_END, 'button', t);
        // Apply pending style if present
        if (containerStyle) {
          if (!nestedButton.attributes) nestedButton.attributes = {};
          nestedButton.attributes.class = containerStyle;
          containerStyle = null;
        }
        containerElements.push(nestedButton);
        continue;
      }
      
      if (t.type === TokenType.SPAN_START) {
        flushContainerParagraph();
        const nestedSpan = parseContainer(TokenType.SPAN_START, TokenType.SPAN_END, 'span', t);
        // Apply pending style if present
        if (containerStyle) {
          if (!nestedSpan.attributes) nestedSpan.attributes = {};
          nestedSpan.attributes.class = containerStyle;
          containerStyle = null;
        }
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
        // Apply pending style if present
        if (containerStyle) {
          heading['attributes'] = { class: containerStyle };
          containerStyle = null;
        }
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
      
      // Handle loops
      if (t.type === TokenType.EACH_START) {
        flushContainerParagraph();
        const loopElement = parseContainer(TokenType.EACH_START, TokenType.EACH_END, 'loop', t);
        // Apply pending style if present
        if (containerStyle) {
          if (!loopElement.attributes) loopElement.attributes = {};
          loopElement.attributes.class = containerStyle;
          containerStyle = null;
        }
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
      
      // Handle bold text
      if (t.type === TokenType.BOLD) {
        containerInlineBuffer.push({
          type: 'strong',
          content: [t.value]
        });
        currentIndex++;
        continue;
      }
      
      // Handle italic text
      if (t.type === TokenType.ITALIC) {
        containerInlineBuffer.push({
          type: 'em',
          content: [t.value]
        });
        currentIndex++;
        continue;
      }
      
      // Handle newlines - check for double newline (paragraph break)
      if (t.type === TokenType.NEWLINE) {
        currentIndex++;
        // Check if the next token is also a newline (blank line = new paragraph)
        if (currentIndex < tokens.length && tokens[currentIndex].type === TokenType.NEWLINE) {
          flushContainerParagraph();
          currentIndex++; // Skip the second newline
        } else {
          // Single newline - treat as a space (markdown convention)
          // Only add space if buffer has content and doesn't end with space
          if (containerInlineBuffer.length > 0) {
            const lastItem = containerInlineBuffer[containerInlineBuffer.length - 1];
            if (typeof lastItem === 'string' && !lastItem.endsWith(' ')) {
              containerInlineBuffer.push(' ');
            } else if (typeof lastItem !== 'string') {
              // Last item was a bold/italic element, add space
              containerInlineBuffer.push(' ');
            }
          }
        }
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
      if (currentId) {
        heading['elementId'] = currentId;
        currentId = null;
      }
      if (currentStyle) {
        heading['attributes'] = { class: currentStyle };
        currentStyle = null;
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
      if (currentStyle) {
        if (!formElement.attributes) {
          formElement.attributes = {};
        }
        formElement.attributes.class = currentStyle;
        currentStyle = null;
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
      if (currentStyle) {
        if (!divElement.attributes) {
          divElement.attributes = {};
        }
        divElement.attributes.class = currentStyle;
        currentStyle = null;
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
      if (currentStyle) {
        if (!buttonElement.attributes) {
          buttonElement.attributes = {};
        }
        buttonElement.attributes.class = currentStyle;
        currentStyle = null;
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
      if (currentStyle) {
        if (!spanElement.attributes) {
          spanElement.attributes = {};
        }
        spanElement.attributes.class = currentStyle;
        currentStyle = null;
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
      if (currentStyle) {
        if (!loopElement.attributes) {
          loopElement.attributes = {};
        }
        loopElement.attributes.class = currentStyle;
        currentStyle = null;
      }
      elements.push(loopElement);
      continue;
    }

    // Handle component references
    if (token.type === TokenType.COMPONENT) {
      const componentElement = {
        type: 'component',
        alias: token.value,
        argument: token.attributes?.argument || ''
      };
      if (currentId) {
        componentElement['elementId'] = currentId;
        currentId = null;
      }
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
      if (currentId) {
        element['elementId'] = currentId;
        currentId = null;
      }
      if (currentStyle) {
        if (!element.attributes) {
          element.attributes = {};
        }
        element.attributes.class = currentStyle;
        currentStyle = null;
      }
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
      if (currentId) {
        imageElement['elementId'] = currentId;
        currentId = null;
      }
      if (currentStyle) {
        imageElement.attributes.class = currentStyle;
        currentStyle = null;
      }
      elements.push(imageElement);
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
    
    // Handle bold text
    if (token.type === TokenType.BOLD) {
      inlineBuffer.push({
        type: 'strong',
        content: [token.value]
      });
      currentIndex++;
      continue;
    }
    
    // Handle italic text
    if (token.type === TokenType.ITALIC) {
      inlineBuffer.push({
        type: 'em',
        content: [token.value]
      });
      currentIndex++;
      continue;
    }
    
    // Handle newlines
    if (token.type === TokenType.NEWLINE) {
      currentIndex++;
      // Check if the next token is also a newline (blank line = new paragraph)
      if (currentIndex < tokens.length && tokens[currentIndex].type === TokenType.NEWLINE) {
        flushParagraph();
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
      continue;
    }

    // Skip other tokens
    currentIndex++;
  }

  flushParagraph();
  return elements;
} 