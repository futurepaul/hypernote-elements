/**
 * Minimal Tailwind to Hypernote Styles Parser
 * 
 * This is a fast, minimal parser that converts Tailwind classes to our supported
 * CSS-in-JS properties without heavy dependencies or validation overhead.
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

// Tailwind color palette (subset of common colors)
const COLORS: Record<string, Record<string | number, string>> = {
  slate: { 50: 'rgb(248,250,252)', 100: 'rgb(241,245,249)', 200: 'rgb(226,232,240)', 300: 'rgb(203,213,225)', 400: 'rgb(148,163,184)', 500: 'rgb(100,116,139)', 600: 'rgb(71,85,105)', 700: 'rgb(51,65,85)', 800: 'rgb(30,41,59)', 900: 'rgb(15,23,42)', 950: 'rgb(2,6,23)' },
  gray: { 50: 'rgb(249,250,251)', 100: 'rgb(243,244,246)', 200: 'rgb(229,231,235)', 300: 'rgb(209,213,219)', 400: 'rgb(156,163,175)', 500: 'rgb(107,114,128)', 600: 'rgb(75,85,99)', 700: 'rgb(55,65,81)', 800: 'rgb(31,41,55)', 900: 'rgb(17,24,39)', 950: 'rgb(3,7,18)' },
  red: { 50: 'rgb(254,242,242)', 100: 'rgb(254,226,226)', 200: 'rgb(254,202,202)', 300: 'rgb(252,165,165)', 400: 'rgb(248,113,113)', 500: 'rgb(239,68,68)', 600: 'rgb(220,38,38)', 700: 'rgb(185,28,28)', 800: 'rgb(153,27,27)', 900: 'rgb(127,29,29)', 950: 'rgb(69,10,10)' },
  amber: { 50: 'rgb(255,251,235)', 100: 'rgb(254,243,199)', 200: 'rgb(253,230,138)', 300: 'rgb(252,211,77)', 400: 'rgb(251,191,36)', 500: 'rgb(245,158,11)', 600: 'rgb(217,119,6)', 700: 'rgb(180,83,9)', 800: 'rgb(146,64,14)', 900: 'rgb(120,53,15)', 950: 'rgb(69,26,3)' },
  blue: { 50: 'rgb(239,246,255)', 100: 'rgb(219,234,254)', 200: 'rgb(191,219,254)', 300: 'rgb(147,197,253)', 400: 'rgb(96,165,250)', 500: 'rgb(59,130,246)', 600: 'rgb(37,99,235)', 700: 'rgb(29,78,216)', 800: 'rgb(30,64,175)', 900: 'rgb(30,58,138)', 950: 'rgb(23,37,84)' },
  green: { 50: 'rgb(240,253,244)', 100: 'rgb(220,252,231)', 200: 'rgb(187,247,208)', 300: 'rgb(134,239,172)', 400: 'rgb(74,222,128)', 500: 'rgb(34,197,94)', 600: 'rgb(22,163,74)', 700: 'rgb(21,128,61)', 800: 'rgb(22,101,52)', 900: 'rgb(20,83,45)', 950: 'rgb(5,46,22)' },
  white: 'rgb(255,255,255)',
  black: 'rgb(0,0,0)',
  transparent: 'transparent'
};

// Spacing scale (in rem)
const SPACING: Record<string, string> = {
  '0': '0',
  'px': '1px',
  '0.5': '0.125rem',
  '1': '0.25rem',
  '1.5': '0.375rem',
  '2': '0.5rem',
  '2.5': '0.625rem',
  '3': '0.75rem',
  '3.5': '0.875rem',
  '4': '1rem',
  '5': '1.25rem',
  '6': '1.5rem',
  '7': '1.75rem',
  '8': '2rem',
  '9': '2.25rem',
  '10': '2.5rem',
  '11': '2.75rem',
  '12': '3rem',
  '14': '3.5rem',
  '16': '4rem',
  '20': '5rem',
  '24': '6rem',
  '28': '7rem',
  '32': '8rem',
  '36': '9rem',
  '40': '10rem',
  '44': '11rem',
  '48': '12rem',
  '52': '13rem',
  '56': '14rem',
  '60': '15rem',
  '64': '16rem',
  '72': '18rem',
  '80': '20rem',
  '96': '24rem'
};

// Font sizes
const FONT_SIZES: Record<string, string> = {
  'xs': '0.75rem',
  'sm': '0.875rem',
  'base': '1rem',
  'lg': '1.125rem',
  'xl': '1.25rem',
  '2xl': '1.5rem',
  '3xl': '1.875rem',
  '4xl': '2.25rem',
  '5xl': '3rem',
  '6xl': '3.75rem',
  '7xl': '4.5rem',
  '8xl': '6rem',
  '9xl': '8rem'
};

// Font weights
const FONT_WEIGHTS: Record<string, number> = {
  'thin': 100,
  'extralight': 200,
  'light': 300,
  'normal': 400,
  'medium': 500,
  'semibold': 600,
  'bold': 700,
  'extrabold': 800,
  'black': 900
};

// Border radius values
const BORDER_RADIUS: Record<string, string> = {
  'none': '0',
  'sm': '0.125rem',
  '': '0.25rem',  // default
  'md': '0.375rem',
  'lg': '0.5rem',
  'xl': '0.75rem',
  '2xl': '1rem',
  '3xl': '1.5rem',
  'full': '9999px'
};

/**
 * Parse a color class like "text-blue-500" or "bg-gray-100"
 */
function parseColor(parts: string[]): string | undefined {
  if (parts.length === 2) {
    // Could be "text-white" or "bg-black"
    const color = parts[1];
    if (color in COLORS) {
      return typeof COLORS[color] === 'string' ? COLORS[color] : undefined;
    }
  } else if (parts.length === 3) {
    // Could be "text-blue-500"
    const [, colorName, shade] = parts;
    if (colorName in COLORS && typeof COLORS[colorName] === 'object') {
      return COLORS[colorName][shade];
    }
  }
  return undefined;
}

/**
 * Parse spacing value like "p-4" or "mt-2"
 */
function parseSpacing(value: string): string | undefined {
  return SPACING[value];
}

/**
 * Convert Tailwind classes to Hypernote style object
 */
export function parseTailwindClasses(classes: string): HypernoteStyle | null {
  if (!classes || !classes.trim()) return null;
  
  const style: HypernoteStyle = {};
  const classList = classes.trim().split(/\s+/);
  
  for (const cls of classList) {
    const parts = cls.split('-');
    const prefix = parts[0];
    
    switch (prefix) {
      // Display and Flexbox direction
      case 'flex':
        if (parts.length === 1) {
          style.display = 'flex';
        } else if (parts[1] === 'row') {
          style.flexDirection = parts[2] === 'reverse' ? 'row-reverse' : 'row';
        } else if (parts[1] === 'col') {
          style.flexDirection = parts[2] === 'reverse' ? 'column-reverse' : 'column';
        }
        break;
      case 'hidden':
        style.display = 'none';
        break;
        
      // Width
      case 'w':
        if (parts[1] === 'full') style.width = '100%';
        else if (parts[1] === 'auto') style.width = 'auto';
        else if (parts[1]) style.width = parseSpacing(parts[1]);
        break;
        
      // Height
      case 'h':
        if (parts[1] === 'full') style.height = '100%';
        else if (parts[1] === 'auto') style.height = 'auto';
        else if (parts[1]) style.height = parseSpacing(parts[1]);
        break;
        
      // Padding
      case 'p':
        if (parts[1]) style.padding = parseSpacing(parts[1]);
        break;
      case 'pt':
        if (parts[1]) style.paddingTop = parseSpacing(parts[1]);
        break;
      case 'pr':
        if (parts[1]) style.paddingRight = parseSpacing(parts[1]);
        break;
      case 'pb':
        if (parts[1]) style.paddingBottom = parseSpacing(parts[1]);
        break;
      case 'pl':
        if (parts[1]) style.paddingLeft = parseSpacing(parts[1]);
        break;
      case 'px':
        if (parts[1]) {
          const spacing = parseSpacing(parts[1]);
          style.paddingLeft = spacing;
          style.paddingRight = spacing;
        }
        break;
      case 'py':
        if (parts[1]) {
          const spacing = parseSpacing(parts[1]);
          style.paddingTop = spacing;
          style.paddingBottom = spacing;
        }
        break;
        
      // Margin
      case 'm':
        if (parts[1]) style.margin = parseSpacing(parts[1]);
        break;
      case 'mt':
        if (parts[1]) style.marginTop = parseSpacing(parts[1]);
        break;
      case 'mr':
        if (parts[1]) style.marginRight = parseSpacing(parts[1]);
        break;
      case 'mb':
        if (parts[1]) style.marginBottom = parseSpacing(parts[1]);
        break;
      case 'ml':
        if (parts[1]) style.marginLeft = parseSpacing(parts[1]);
        break;
      case 'mx':
        if (parts[1]) {
          const spacing = parseSpacing(parts[1]);
          style.marginLeft = spacing;
          style.marginRight = spacing;
        }
        break;
      case 'my':
        if (parts[1]) {
          const spacing = parseSpacing(parts[1]);
          style.marginTop = spacing;
          style.marginBottom = spacing;
        }
        break;
        
      // Text color
      case 'text':
        if (parts[1] === 'left') style.textAlign = 'left';
        else if (parts[1] === 'center') style.textAlign = 'center';
        else if (parts[1] === 'right') style.textAlign = 'right';
        else if (parts[1] === 'justify') style.textAlign = 'justify';
        else if (parts[1] in FONT_SIZES) style.fontSize = FONT_SIZES[parts[1]];
        else {
          const color = parseColor(parts);
          if (color) style.color = color;
        }
        break;
        
      // Background color
      case 'bg':
        const bgColor = parseColor(parts);
        if (bgColor) style.backgroundColor = bgColor;
        break;
        
      // Border
      case 'border':
        if (parts.length === 1 || parts[1] === '') {
          style.borderWidth = '1px';
        } else if (parts[1] === '0') {
          style.borderWidth = '0';
        } else if (parts[1] === '2') {
          style.borderWidth = '2px';
        } else if (parts[1] === '4') {
          style.borderWidth = '4px';
        } else if (parts[1] === '8') {
          style.borderWidth = '8px';
        } else {
          // Could be border color
          const borderColor = parseColor(parts);
          if (borderColor) style.borderColor = borderColor;
        }
        break;
        
      // Border radius
      case 'rounded':
        if (parts[1] in BORDER_RADIUS) {
          style.borderRadius = BORDER_RADIUS[parts[1]];
        } else if (!parts[1]) {
          style.borderRadius = BORDER_RADIUS[''];
        }
        break;
        
      // Font weight
      case 'font':
        if (parts[1] in FONT_WEIGHTS) {
          style.fontWeight = FONT_WEIGHTS[parts[1]];
        }
        break;
        
      // Flexbox
      case 'justify':
        if (parts[1] === 'start') style.justifyContent = 'flex-start';
        else if (parts[1] === 'end') style.justifyContent = 'flex-end';
        else if (parts[1] === 'center') style.justifyContent = 'center';
        else if (parts[1] === 'between') style.justifyContent = 'space-between';
        else if (parts[1] === 'around') style.justifyContent = 'space-around';
        else if (parts[1] === 'evenly') style.justifyContent = 'space-evenly';
        break;
        
      case 'items':
        if (parts[1] === 'start') style.alignItems = 'flex-start';
        else if (parts[1] === 'end') style.alignItems = 'flex-end';
        else if (parts[1] === 'center') style.alignItems = 'center';
        else if (parts[1] === 'baseline') style.alignItems = 'baseline';
        else if (parts[1] === 'stretch') style.alignItems = 'stretch';
        break;
        
      case 'self':
        if (parts[1] === 'auto') style.alignSelf = 'auto';
        else if (parts[1] === 'start') style.alignSelf = 'flex-start';
        else if (parts[1] === 'end') style.alignSelf = 'flex-end';
        else if (parts[1] === 'center') style.alignSelf = 'center';
        else if (parts[1] === 'stretch') style.alignSelf = 'stretch';
        break;
        
      // Gap
      case 'gap':
        if (parts[1]) style.gap = parseSpacing(parts[1]);
        break;
        
      // Overflow
      case 'overflow':
        if (parts[1] === 'auto') style.overflow = 'auto';
        else if (parts[1] === 'hidden') style.overflow = 'hidden';
        else if (parts[1] === 'visible') style.overflow = 'visible';
        else if (parts[1] === 'scroll') style.overflow = 'scroll';
        break;
        
      // Position
      case 'absolute':
        style.position = 'absolute';
        break;
      case 'relative':
        style.position = 'relative';
        break;
      case 'fixed':
        style.position = 'fixed';
        break;
      case 'sticky':
        style.position = 'sticky';
        break;
        
      // Hover states - we ignore these for now
      case 'hover':
        break;
        
      // Opacity
      case 'opacity':
        if (parts[1]) {
          const opacity = parseInt(parts[1]);
          if (!isNaN(opacity)) {
            style.opacity = opacity / 100;
          }
        }
        break;
        
      // Z-index
      case 'z':
        if (parts[1]) {
          const zIndex = parseInt(parts[1]);
          if (!isNaN(zIndex)) {
            style.zIndex = zIndex;
          }
        }
        break;
    }
  }
  
  return Object.keys(style).length > 0 ? style : null;
}