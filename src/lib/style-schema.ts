import { z } from "zod/v4";

// CSS Value Schemas
const cssNumericValue = z.number().min(0); // Represents a platform-agnostic unit (e.g., dp, pt) or a raw number
const cssPercentageUnit = z.literal("%");
const cssRawPercentageValue = z.templateLiteral([cssNumericValue, cssPercentageUnit]);

const cssDimension = z.union([cssNumericValue, cssRawPercentageValue]); // e.g., 100 or "50%"
const cssDimensionOrAuto = z.union([cssDimension, z.literal("auto")]);

// Enhanced Color Schema for better cross-platform support
// CSS: Direct 1:1 mapping for hex, rgb, rgba, and named colors
// SwiftUI: Color.init(hex:) or Color.primary for named colors
// React Native: Direct support for hex and rgba, limited named colors
// Flutter: Color(0xFF...) for hex, Colors.transparent for named
// Jetpack Compose: Color(0xFF...) for hex, Color.Transparent for named
const colorSchema = z.union([
  z.string().regex(/^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/, {
    message: "Invalid hex color. Use #RRGGBB or #RRGGBBAA format"
  }), // Hex colors - universally supported
  z.string().regex(/^rgba?\([^)]+\)$/, {
    message: "Invalid RGB color. Use rgb(r,g,b) or rgba(r,g,b,a) format"
  }), // RGB/RGBA - good support across platforms
  z.enum(["transparent"]) // Minimal named colors for maximum compatibility
]);

// Border Schema - Simplified for cross-platform compatibility
// CSS: Direct border property mapping
// SwiftUI: .border() modifier with uniform borders only
// React Native: borderWidth, borderColor, borderStyle (limited per-side support)
// Flutter: Border.all() or individual BorderSide
// Jetpack Compose: Modifier.border() with uniform borders
const borderSchema = z.object({
  width: cssNumericValue.optional(),
  style: z.enum(["solid", "dashed", "dotted"]).optional(),
  color: colorSchema.optional(),
  radius: cssNumericValue.optional()
}).optional();

// CSS offset values that can be negative (for positioning)
const cssOffsetValue = z.number(); // Allow negative values for offsets
const cssOffsetPercentageValue = z.templateLiteral([cssOffsetValue, cssPercentageUnit]);
const cssOffsetDimension = z.union([cssOffsetValue, cssOffsetPercentageValue]);

// Overlay positioning for cross-platform absolute positioning
// CSS: Maps to position: absolute with top/left/right/bottom
// SwiftUI: Uses .overlay() with alignment and .offset()
// React Native: position: 'absolute' with top/left/right/bottom
// Flutter: Positioned widget within Stack
// Jetpack Compose: Box with Modifier.offset() and alignment
const overlaySchema = z.object({
  anchor: z.enum([
    "top-left", "top-right", "top-center",
    "bottom-left", "bottom-right", "bottom-center",
    "center-left", "center-right", "center"
  ]).optional(),
  offset: z.object({
    x: cssOffsetDimension.optional(),
    y: cssOffsetDimension.optional()
  }).optional()
}).optional();

/**
 * Defines the set of allowed CSS-like properties for styling Hypernote elements.
 * Uses standard CSS property names (kebab-case).
 * Aims for a minimal, cross-platform compatible subset of CSS.
 * 
 * ⚠️  BREAKING CHANGES FROM STANDARD CSS ARE MARKED WITH WARNING SYMBOLS
 */
export const StylePropertiesSchema = z.object({
  // Layout & Box Model
  // CSS: display: block | flex | none
  // ⚠️  REMOVED 'block' - not meaningful on native platforms
  // SwiftUI: VStack/HStack for flex, EmptyView for none
  // React Native: flex vs none (no block concept)
  // Flutter: Flex/Column/Row vs SizedBox.shrink()
  // Jetpack Compose: Row/Column vs Spacer(Modifier.size(0))
  display: z.enum(["flex", "none"]).optional(),

  // CSS: Direct 1:1 mapping for width/height
  // All platforms: Good support for numbers and percentages
  // 'auto' maps to platform-specific intrinsic sizing
  width: cssDimensionOrAuto.optional(),
  height: cssDimensionOrAuto.optional(),

  // Individual padding properties
  // CSS: Direct 1:1 mapping
  // All platforms: Excellent support across all frameworks
  "padding-top": cssDimension.optional(),
  "padding-right": cssDimension.optional(),
  "padding-bottom": cssDimension.optional(),
  "padding-left": cssDimension.optional(),

  // Individual margin properties
  // CSS: Direct 1:1 mapping
  // SwiftUI: Limited margin support, often uses padding instead
  // React Native: Good margin support
  // Flutter: EdgeInsets for margin
  // Jetpack Compose: Modifier.padding() for margin-like spacing
  "margin-top": cssDimension.optional(),
  "margin-right": cssDimension.optional(),
  "margin-bottom": cssDimension.optional(),
  "margin-left": cssDimension.optional(),

  // ⚠️  SIMPLIFIED BORDER SYSTEM - individual border-* properties removed
  // CSS: Translates to border shorthand property
  // Reason: Individual border sides have poor cross-platform support
  border: borderSchema,

  // Flexbox (applicable if display: "flex")
  // CSS: Direct 1:1 mapping for all properties
  // All platforms: Excellent flexbox support across frameworks
  "flex-direction": z.enum(["row", "row-reverse", "column", "column-reverse"]).optional(),
  "justify-content": z.enum(["flex-start", "flex-end", "center", "space-between", "space-around"]).optional(),
  "align-items": z.enum(["stretch", "flex-start", "flex-end", "center", "baseline"]).optional(),
  
  // ⚠️  RENAMED 'gap' to 'spacing' for better cross-platform support
  // CSS: Maps to gap property in flexbox
  // SwiftUI: HStack/VStack spacing parameter
  // React Native: gap property (newer versions) or manual margins
  // Flutter: MainAxisAlignment spacing or SizedBox between children
  // Jetpack Compose: Arrangement.spacedBy()
  spacing: cssNumericValue.optional(),
  
  "flex-grow": z.number().min(0).optional(),
  "flex-shrink": z.number().min(0).optional(),
  "flex-basis": cssDimensionOrAuto.optional(),
  "flex-wrap": z.enum(["nowrap", "wrap"]).optional(),

  // ⚠️  SIMPLIFIED POSITIONING - absolute positioning replaced with overlay system
  // CSS: position: relative maps 1:1, absolute becomes overlay
  // SwiftUI: No relative positioning, overlay uses .overlay() modifier
  // React Native: position: 'relative' supported, absolute via overlay
  // Flutter: relative positioning via Container, overlay via Stack
  // Jetpack Compose: relative via Box, overlay via Box with positioning
  position: z.enum(["relative"]).optional(),
  
  // ⚠️  NEW: Overlay system for cross-platform absolute positioning
  // CSS: Converts to position: absolute with appropriate offsets
  overlay: overlaySchema,

  // CSS: Direct top/right/bottom/left for relative positioning only
  // These work with position: relative, not for absolute (use overlay instead)
  top: cssDimension.optional(),
  right: cssDimension.optional(),
  bottom: cssDimension.optional(),
  left: cssDimension.optional(),
  "z-index": z.number().int().optional(),

  // Typography
  // CSS: Direct 1:1 mapping for color
  color: colorSchema.optional(),
  
  // CSS: font-family maps directly
  // All platforms: Good support, though font availability varies
  "font-family": z.string().optional(),
  
  // CSS: font-size maps directly
  // All platforms: Excellent support for numeric font sizes
  "font-size": cssNumericValue.optional(),
  
  // ⚠️  ENHANCED: Added numeric font weights for better platform support
  // CSS: Direct mapping for both named and numeric weights
  // SwiftUI: Font.Weight equivalents (.thin, .bold, etc.)
  // React Native: fontWeight string or numeric
  // Flutter: FontWeight.w100 through FontWeight.w900
  // Jetpack Compose: FontWeight.Thin through FontWeight.Black
  "font-weight": z.union([
    z.enum(["normal", "bold"]),
    z.number().int().min(100).max(900).multipleOf(100)
  ]).optional(),
  
  // CSS: line-height maps directly
  // All platforms: Good support for unitless multipliers
  "line-height": z.number().min(0).optional(),
  
  // CSS: text-align maps directly
  // All platforms: Excellent support
  "text-align": z.enum(["left", "right", "center", "justify"]).optional(),
  
  // ⚠️  SIMPLIFIED: Removed 'line-through' due to poor cross-platform support
  // CSS: text-decoration maps directly for remaining values
  // SwiftUI: Limited text decoration support
  // React Native: textDecorationLine property
  // Flutter: TextDecoration enum
  // Jetpack Compose: TextDecoration enum
  "text-decoration": z.enum(["none", "underline"]).optional(),
  
  // CSS: text-transform maps directly
  // ⚠️  WARNING: Inconsistent support across platforms
  // SwiftUI: Limited text transform support
  // React Native: Good support via textTransform
  // Flutter: Good support via text styling
  // Jetpack Compose: Manual string transformation often required
  "text-transform": z.enum(["none", "capitalize", "uppercase", "lowercase"]).optional(),

  // Background
  // CSS: background-color maps directly
  "background-color": colorSchema.optional(),

  // ⚠️  NEW: Material Design elevation for cross-platform shadows
  // CSS: Converts to appropriate box-shadow values
  // SwiftUI: .shadow() modifier
  // React Native: elevation property (Android) or shadow properties (iOS)
  // Flutter: elevation property on Material widgets
  // Jetpack Compose: elevation parameter
  elevation: z.number().min(0).max(24).optional(),

  // Other
  // CSS: opacity maps directly (0.0 to 1.0)
  // All platforms: Excellent support
  opacity: z.number().min(0).max(1).optional(),
  
  // CSS: overflow maps directly
  // All platforms: Good support, though behavior may vary slightly
  overflow: z.enum(["visible", "hidden"]).optional(),
}).strict();

export type StyleProperties = z.infer<typeof StylePropertiesSchema>;

// Define individual selector type schemas
const ElementTypeSelectorSchema = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/, {
  message: "Invalid element type selector. Must start with a letter and contain only letters, numbers, underscores, or hyphens."
});

const IdSelectorSchema = z.templateLiteral(["#", z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_-]*$/, {
  message: "Invalid ID selector name. Must start with a letter or underscore and contain only letters, numbers, underscores, or hyphens."
})]);

const ClassSelectorSchema = z.templateLiteral([".", z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_-]*$/, {
  message: "Invalid class selector name. Must start with a letter or underscore and contain only letters, numbers, underscores, or hyphens."
})]);

const RootSelectorSchema = z.literal(":root");

// Union of all valid selector types
export const CssSelectorSchema = z.union([
  ElementTypeSelectorSchema,
  IdSelectorSchema,
  ClassSelectorSchema,
  RootSelectorSchema
]);

/**
 * Defines the structure for a Hypernote style sheet.
 * It's a record where keys are selectors (validated by CssSelectorSchema)
 * and values are StyleProperties objects.
 */
export const StyleSheetSchema = z.record(
  CssSelectorSchema,
  StylePropertiesSchema
);

export type StyleSheet = z.infer<typeof StyleSheetSchema>;

// Helper functions for validation
export function validateStyleSheet(data: unknown): StyleSheet {
  return StyleSheetSchema.parse(data);
}

export function safeValidateStyleSheet(data: unknown) {
  return StyleSheetSchema.safeParse(data);
} 