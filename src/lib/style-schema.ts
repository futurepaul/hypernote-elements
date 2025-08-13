/**
 * Hypernote Style Properties Type
 * 
 * This defines the exact subset of CSS properties supported by Hypernote.
 * We use a simple type instead of Zod validation for performance.
 */

export type HypernoteStyle = {
  // Layout & Box Model
  display?: string;
  width?: string | number;
  height?: string | number;
  minWidth?: string | number;
  maxWidth?: string | number;
  minHeight?: string | number;
  maxHeight?: string | number;
  
  // Padding
  padding?: string | number;
  paddingTop?: string | number;
  paddingRight?: string | number;
  paddingBottom?: string | number;
  paddingLeft?: string | number;
  
  // Margin
  margin?: string | number;
  marginTop?: string | number;
  marginRight?: string | number;
  marginBottom?: string | number;
  marginLeft?: string | number;
  
  // Border
  borderWidth?: string | number;
  borderRadius?: string | number;
  borderColor?: string;
  
  // Flexbox
  flexDirection?: string;
  justifyContent?: string;
  alignItems?: string;
  alignSelf?: string;
  flex?: string | number;
  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: string | number;
  flexWrap?: string;
  gap?: string | number;
  
  // Typography
  color?: string;
  fontSize?: string | number;
  fontWeight?: string | number;
  fontFamily?: string;
  lineHeight?: string | number;
  textAlign?: string;
  textDecoration?: string;
  textTransform?: string;
  letterSpacing?: string | number;
  
  // Background & Effects
  backgroundColor?: string;
  opacity?: number;
  overflow?: string;
  boxShadow?: string;
  
  // Positioning
  position?: string;
  top?: string | number;
  right?: string | number;
  bottom?: string | number;
  left?: string | number;
  zIndex?: number;
};

// Legacy type alias for compatibility
export type StyleProperties = HypernoteStyle;

/**
 * Fast validation without Zod overhead
 * Simply checks if the object has only known properties
 */
export function safeValidateStyleProperties(data: unknown): { success: boolean; data?: HypernoteStyle; error?: { issues: any[] } } {
  if (!data || typeof data !== 'object') {
    return { success: false, error: { issues: [{ message: 'Style must be an object' }] } };
  }
  
  // List of all supported properties
  const supportedProps = new Set([
    'display', 'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
    'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
    'borderWidth', 'borderRadius', 'borderColor',
    'flexDirection', 'justifyContent', 'alignItems', 'alignSelf',
    'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'flexWrap', 'gap',
    'color', 'fontSize', 'fontWeight', 'fontFamily', 'lineHeight',
    'textAlign', 'textDecoration', 'textTransform', 'letterSpacing',
    'backgroundColor', 'opacity', 'overflow', 'boxShadow',
    'position', 'top', 'right', 'bottom', 'left', 'zIndex'
  ]);
  
  // Check for unsupported properties
  const style = data as Record<string, any>;
  for (const key in style) {
    if (!supportedProps.has(key)) {
      return { 
        success: false, 
        error: { issues: [{ message: `Unsupported style property: ${key}` }] } 
      };
    }
  }
  
  return { success: true, data: style as HypernoteStyle };
}

export function validateStyleProperties(data: unknown): StyleProperties {
  const result = safeValidateStyleProperties(data);
  if (!result.success) {
    throw new Error(result.error?.issues[0]?.message || 'Invalid style properties');
  }
  return result.data!;
} 