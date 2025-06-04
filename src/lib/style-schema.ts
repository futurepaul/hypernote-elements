import { z } from "zod/v4";

/**
 * CSS-in-JS Style Properties Schema
 * 
 * This schema defines a strict subset of CSS properties using camelCase naming
 * compatible with React's style prop and React Native StyleSheet.
 * 
 * Security: Each property is individually validated to prevent XSS attacks.
 * The schema only allows safe CSS properties with proper type validation.
 * 
 * Usage: Validates CSS-in-JS style objects before being included in the JSON output.
 */

// Color validation - strict patterns for security
const colorValue = z.union([
  // Hex colors: #RRGGBB or #RRGGBBAA
  z.string().regex(/^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/, "Invalid hex color"),
  // RGB/RGBA: rgb(r,g,b) or rgba(r,g,b,a)
  z.string().regex(/^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*(0|1|0?\.\d+))?\s*\)$/, "Invalid rgb color"),
  // Named colors - only safe ones
  z.enum(["transparent", "inherit", "currentColor"])
]);

// Size/dimension validation
const dimensionValue = z.union([
  z.number().min(0), // Numbers for React Native (no units)
  z.string().regex(/^\d+(\.\d+)?(px|em|rem|%|vh|vw)$/, "Invalid dimension"), // Web units
  z.enum(["auto", "inherit"])
]);

// Font weight validation
const fontWeightValue = z.union([
  z.enum(["normal", "bold", "lighter", "bolder"]),
  z.number().int().min(100).max(900).multipleOf(100) // 100, 200, ... 900
]);

/**
 * Strict CSS-in-JS properties schema using camelCase naming.
 * Only includes properties that are:
 * 1. Commonly supported across web and React Native
 * 2. Safe from XSS attacks
 * 3. Compatible with cross-platform rendering
 */
export const StylePropertiesSchema = z.object({
  // Layout & Display
  display: z.enum(["none", "flex"]).optional(),
  position: z.enum(["static", "relative", "absolute", "fixed", "sticky"]).optional(),
  overflow: z.enum(["visible", "hidden", "scroll", "auto"]).optional(),
  
  // Box Model - Dimensions
  width: dimensionValue.optional(),
  height: dimensionValue.optional(),
  minWidth: dimensionValue.optional(),
  minHeight: dimensionValue.optional(),
  maxWidth: dimensionValue.optional(),
  maxHeight: dimensionValue.optional(),
  
  // Box Model - Spacing
  margin: dimensionValue.optional(),
  marginTop: dimensionValue.optional(),
  marginRight: dimensionValue.optional(),
  marginBottom: dimensionValue.optional(),
  marginLeft: dimensionValue.optional(),
  
  padding: dimensionValue.optional(),
  paddingTop: dimensionValue.optional(),
  paddingRight: dimensionValue.optional(),
  paddingBottom: dimensionValue.optional(),
  paddingLeft: dimensionValue.optional(),
  
  // Positioning
  top: dimensionValue.optional(),
  right: dimensionValue.optional(),
  bottom: dimensionValue.optional(),
  left: dimensionValue.optional(),
  zIndex: z.number().int().optional(),
  
  // Flexbox
  flexDirection: z.enum(["row", "row-reverse", "column", "column-reverse"]).optional(),
  flexWrap: z.enum(["nowrap", "wrap", "wrap-reverse"]).optional(),
  justifyContent: z.enum([
    "flex-start", "flex-end", "center", "space-between", 
    "space-around", "space-evenly"
  ]).optional(),
  alignItems: z.enum([
    "stretch", "flex-start", "flex-end", "center", "baseline"
  ]).optional(),
  alignContent: z.enum([
    "stretch", "flex-start", "flex-end", "center", 
    "space-between", "space-around", "space-evenly"
  ]).optional(),
  alignSelf: z.enum([
    "auto", "stretch", "flex-start", "flex-end", "center", "baseline"
  ]).optional(),
  flex: z.union([z.number(), z.string()]).optional(),
  flexGrow: z.number().min(0).optional(),
  flexShrink: z.number().min(0).optional(),
  flexBasis: dimensionValue.optional(),
  gap: dimensionValue.optional(),
  
  // Colors
  color: colorValue.optional(),
  backgroundColor: colorValue.optional(),
  borderColor: colorValue.optional(),
  borderTopColor: colorValue.optional(),
  borderRightColor: colorValue.optional(),
  borderBottomColor: colorValue.optional(),
  borderLeftColor: colorValue.optional(),
  
  // Typography
  fontFamily: z.string().optional(),
  fontSize: dimensionValue.optional(),
  fontWeight: fontWeightValue.optional(),
  fontStyle: z.enum(["normal", "italic", "oblique"]).optional(),
  lineHeight: z.union([z.number().positive(), z.string()]).optional(),
  textAlign: z.enum(["left", "right", "center", "justify"]).optional(),
  textDecoration: z.enum(["none", "underline", "line-through", "overline"]).optional(),
  textTransform: z.enum(["none", "uppercase", "lowercase", "capitalize"]).optional(),
  letterSpacing: z.union([z.number(), z.string()]).optional(),
  wordSpacing: z.union([z.number(), z.string()]).optional(),
  
  // Borders
  border: z.string().optional(), // e.g., "1px solid #000"
  borderWidth: dimensionValue.optional(),
  borderStyle: z.enum(["none", "solid", "dashed", "dotted", "double"]).optional(),
  borderRadius: dimensionValue.optional(),
  
  borderTop: z.string().optional(),
  borderRight: z.string().optional(),
  borderBottom: z.string().optional(),
  borderLeft: z.string().optional(),
  
  borderTopWidth: dimensionValue.optional(),
  borderRightWidth: dimensionValue.optional(),
  borderBottomWidth: dimensionValue.optional(),
  borderLeftWidth: dimensionValue.optional(),
  
  borderTopStyle: z.enum(["none", "solid", "dashed", "dotted", "double"]).optional(),
  borderRightStyle: z.enum(["none", "solid", "dashed", "dotted", "double"]).optional(),
  borderBottomStyle: z.enum(["none", "solid", "dashed", "dotted", "double"]).optional(),
  borderLeftStyle: z.enum(["none", "solid", "dashed", "dotted", "double"]).optional(),
  
  borderTopLeftRadius: dimensionValue.optional(),
  borderTopRightRadius: dimensionValue.optional(),
  borderBottomLeftRadius: dimensionValue.optional(),
  borderBottomRightRadius: dimensionValue.optional(),
  
  // Visual Effects
  opacity: z.number().min(0).max(1).optional(),
  boxShadow: z.string().optional(), // e.g., "0 4px 6px rgba(0,0,0,0.1)"
  
  // Transforms (basic support)
  transform: z.string().optional(),
  
  // Cursor (web only, but safe)
  cursor: z.enum([
    "auto", "pointer", "default", "text", "move", "not-allowed", 
    "grab", "grabbing", "crosshair", "help"
  ]).optional(),
  
  // User interaction
  userSelect: z.enum(["none", "auto", "text", "all"]).optional(),
  pointerEvents: z.enum(["auto", "none"]).optional(),
}).strict();

export type StyleProperties = z.infer<typeof StylePropertiesSchema>;

/**
 * CSS Selector validation
 * Supports: element types, #id, .class, :root
 */
const ElementTypeSelectorSchema = z.string().regex(
  /^[a-zA-Z][a-zA-Z0-9_-]*$/, 
  "Invalid element type selector"
);

const IdSelectorSchema = z.string().regex(
  /^#[a-zA-Z_][a-zA-Z0-9_-]*$/, 
  "Invalid ID selector"
);

const ClassSelectorSchema = z.string().regex(
  /^\.[a-zA-Z_][a-zA-Z0-9_-]*$/, 
  "Invalid class selector"
);

const RootSelectorSchema = z.literal(":root");

export const CssSelectorSchema = z.union([
  ElementTypeSelectorSchema,
  IdSelectorSchema,
  ClassSelectorSchema,
  RootSelectorSchema
]);

/**
 * StyleSheet schema - maps selectors to style properties
 * Used for top-level styles (mainly for overriding imported components)
 */
export const StyleSheetSchema = z.record(
  CssSelectorSchema,
  StylePropertiesSchema
);

export type StyleSheet = z.infer<typeof StyleSheetSchema>;

// Validation helper functions
export function validateStyleSheet(data: unknown): StyleSheet {
  return StyleSheetSchema.parse(data);
}

export function safeValidateStyleSheet(data: unknown) {
  return StyleSheetSchema.safeParse(data);
}

export function validateStyleProperties(data: unknown): StyleProperties {
  return StylePropertiesSchema.parse(data);
}

export function safeValidateStyleProperties(data: unknown) {
  return StylePropertiesSchema.safeParse(data);
} 