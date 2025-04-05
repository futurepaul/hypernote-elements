import React, { useState } from 'react';
import { RelayHandler } from './lib/relayHandler';
import { compileHypernoteToContent } from './lib/compiler';

// Define the structure of elements based on compiler output
interface HypernoteElement {
  type: string;
  content?: string[];
  id?: string;
  event?: string;
  elements?: HypernoteElement[];
  attributes?: Record<string, string>;
}

interface HypernoteContent {
  version: string;
  component_kind: string | null;
  elements: HypernoteElement[];
  events?: Record<string, any>;
  styles?: Record<string, Record<string, string>>;
}

interface RendererProps {
  element: HypernoteElement;
  relayHandler: RelayHandler;
  formData?: Record<string, string>;
  setFormData?: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  events?: Record<string, any>;
  styles?: Record<string, Record<string, string>>;
}

// Component to render a single element based on its type
function ElementRenderer({ element, relayHandler, formData = {}, setFormData, events = {}, styles = {} }: RendererProps) {
  // Helper to apply styles based on element type or ID
  const getStyles = (element: HypernoteElement) => {
    const elementStyles: Record<string, string> = {};
    
    // Apply styles by type
    if (styles[element.type]) {
      Object.assign(elementStyles, styles[element.type]);
    }
    
    // Apply styles by ID if available
    if (element.id && styles[`#${element.id}`]) {
      Object.assign(elementStyles, styles[`#${element.id}`]);
    }
    
    return elementStyles;
  };

  // Process form submission
  const handleFormSubmit = async (e: React.FormEvent, eventName?: string) => {
    e.preventDefault();
    
    // If no event name is provided, just prevent default
    if (!eventName) {
      console.log('Form submitted but no event is specified');
      return;
    }
    
    if (!events || !events[eventName]) {
      console.error(`Event ${eventName} not found`);
      return;
    }
    
    const eventTemplate = events[eventName];
    
    // Process template variables
    let content = eventTemplate.content;
    if (typeof content === 'string' && content.includes('{form.')) {
      // Replace {form.fieldName} with actual form values
      Object.keys(formData).forEach(key => {
        content = content.replace(`{form.${key}}`, formData[key] || '');
      });
    }
    
    // Publish the event
    try {
      const eventId = await relayHandler.publishEvent(
        eventTemplate.kind,
        content,
        eventTemplate.tags || []
      );
      
      console.log(`Published event: ${eventId}`);
      
      // Reset form if successful
      if (setFormData) {
        setFormData({});
      }
    } catch (error) {
      console.error(`Failed to publish event: ${error}`);
    }
  };

  // Handle input changes in forms
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>, name: string) => {
    if (setFormData) {
      setFormData(prev => ({
        ...prev,
        [name]: e.target.value
      }));
    }
  };

  // Apply styles for this element
  const elementStyles = getStyles(element);

  // Debugging log
  console.log("Rendering element:", element);

  // Render element based on its type
  switch (element.type) {
    case 'h1':
      return (
        <h1 id={element.id} style={elementStyles as React.CSSProperties}>
          {element.content?.join(' ') || ''}
        </h1>
      );
      
    case 'h2':
      return (
        <h2 id={element.id} style={elementStyles as React.CSSProperties}>
          {element.content?.join(' ') || ''}
        </h2>
      );

    case 'h3':
      return (
        <h3 id={element.id} style={elementStyles as React.CSSProperties}>
          {element.content?.join(' ') || ''}
        </h3>
      );
      
    case 'p':
      return (
        <p id={element.id} style={elementStyles as React.CSSProperties}>
          {element.content?.join(' ') || ''}
        </p>
      );
      
    case 'form':
      return (
        <form 
          id={element.id} 
          onSubmit={(e) => handleFormSubmit(e, element.event)}
          style={elementStyles as React.CSSProperties}
        >
          {element.elements && element.elements.map((child, index) => (
            <ElementRenderer 
              key={index} 
              element={child} 
              relayHandler={relayHandler}
              formData={formData}
              setFormData={setFormData}
              events={events}
              styles={styles}
            />
          ))}
        </form>
      );
      
    case 'button':
      return (
        <button 
          id={element.id} 
          type="submit"
          style={elementStyles as React.CSSProperties}
        >
          {element.content?.join(' ') || 'Submit'}
        </button>
      );
      
    case 'input':
      const name = element.attributes?.name || '';
      return (
        <input
          id={element.id}
          name={name}
          placeholder={element.attributes?.placeholder || ''}
          value={formData[name] || ''}
          onChange={(e) => handleInputChange(e, name)}
          style={elementStyles as React.CSSProperties}
        />
      );
      
    default:
      return (
        <div id={element.id} style={elementStyles as React.CSSProperties}>
          {element.content?.join(' ') || ''}
          {element.elements && element.elements.map((child, index) => (
            <ElementRenderer 
              key={index} 
              element={child} 
              relayHandler={relayHandler}
              formData={formData}
              setFormData={setFormData}
              events={events}
              styles={styles}
            />
          ))}
        </div>
      );
  }
}

// Main renderer function that takes markdown and returns React node
export function HypernoteRenderer({ markdown, relayHandler }: { markdown: string, relayHandler: RelayHandler }) {
  // Compile markdown to content object
  const content: HypernoteContent = compileHypernoteToContent(markdown);
  
  // Set up form data state
  const [formData, setFormData] = useState<Record<string, string>>({});
  
  // Debugging logs
  console.log("Compiled content:", content);
  console.log("Elements:", content.elements);
  
  // If there are no elements, show a placeholder
  if (!content.elements || content.elements.length === 0) {
    return <div>No content to display. Try adding some markdown!</div>;
  }
  
  return (
    <div className="hypernote-content">
      {content.elements.map((element, index) => (
        <ElementRenderer
          key={index}
          element={element}
          relayHandler={relayHandler}
          formData={formData}
          setFormData={setFormData}
          events={content.events}
          styles={content.styles}
        />
      ))}
    </div>
  );
} 