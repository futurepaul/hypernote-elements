import { z } from "zod/v4";
import { StyleSheetSchema, StylePropertiesSchema } from "./style-schema";

/**
 * IMPORTANT: TypeScript Circular Reference Warnings
 * 
 * This file contains complex recursive schemas that may trigger TypeScript warnings about
 * "circularly references itself" - these are expected and NOT actual errors. They occur
 * because TypeScript has limitations when inferring types for complex mutual recursion.
 * 
 * The schema works perfectly at runtime and all tests pass. This is a known limitation
 * of TypeScript's type system when dealing with recursive object schemas, not a Zod issue.
 * 
 * The warnings can be safely ignored as they don't affect runtime behavior or validation.
 */

/**
 * Component element schema
 * Used to reference external Hypernote components by their alias
 * Components receive a single string argument (npub/nevent depending on component_kind)
 */
const ComponentElementSchema = z.object({
  type: z.literal("component"),
  elementId: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/, "Invalid elementId format").optional(),
  alias: z.string().min(1),
  argument: z.string().min(1),
});

/**
 * Supported HTML-like element types
 * Markdown basics: headers, paragraphs, line breaks, emphasis, blockquotes, lists, code, hr, links, images
 * Hypernote additions: input, textarea (form, div, button, span have their own schemas)
 */
const SupportedElementType = z.union([
  // Markdown headers
  z.literal("h1"),
  z.literal("h2"),
  z.literal("h3"),
  z.literal("h4"),
  z.literal("h5"),
  z.literal("h6"),
  // Markdown text elements
  z.literal("p"),
  z.literal("br"),
  z.literal("em"),
  z.literal("strong"),
  z.literal("blockquote"),
  // Markdown lists
  z.literal("ul"),
  z.literal("ol"),
  z.literal("li"),
  // Markdown code
  z.literal("code"),
  z.literal("pre"),
  // Markdown misc
  z.literal("hr"),
  z.literal("a"),
  z.literal("img"),
  // Hypernote additions
  z.literal("input"),
  z.literal("textarea"),
  z.literal("json"), // For JSON data display
], {
  error: (issue) => {
    if (issue.code === "invalid_union") {
      return `Unsupported element type "${issue.input}". Supported types are: h1, h2, h3, h4, h5, h6, p, br, em, strong, blockquote, ul, ol, li, code, pre, hr, a, img, input, textarea, json (form, div, button, span have separate schemas)`;
    }
    return undefined; // defer to default
  }
});

/**
 * Basic element schema for standard HTML-like elements
 * Elements can have a type (like "p", "h1", "div"), optional elementId, 
 * optional content (array of strings/elements), optional attributes,
 * and optional inline styles (CSS-in-JS object)
 */
const ElementSchema = z.object({
  type: SupportedElementType,
  elementId: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/, "Invalid elementId format").optional(),
  style: StylePropertiesSchema.optional(), // Inline styles as CSS-in-JS object
  get content() {
    return ElementContentSchema.optional();
  },
  attributes: z.record(z.string().min(1), z.string()).optional(),
});

/**
 * Schema for element content, which is always an array that can contain:
 * - Strings (plain text content)
 * - Nested element objects (for formatting or structure)
 * 
 * This allows mixed content like: ["Some text ", {type: "em", content: ["formatted"]}, " more text"]
 */
const ElementContentSchema = z.array(
  z.union([
    z.string(),
    ElementSchema
  ])
);

/**
 * Conditional rendering element schema
 * Renders its child elements only if the condition evaluates to true
 * The condition is a string expression evaluated by the client with variable substitution
 */
const IfElementSchema = z.object({
  type: z.literal("if"),
  elementId: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/, "Invalid elementId format").optional(),
  condition: z.string().min(1),
  get elements() {
    return z.array(AnyElementSchema);
  },
});

/**
 * Loop element schema
 * Iterates over data from a query, rendering child elements for each item
 * - source: Name of the query (references entries in the queries map)
 * - variable: Name for each item in the iteration (available in nested scope)
 */
const LoopElementSchema = z.object({
  type: z.literal("loop"),
  elementId: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/, "Invalid elementId format").optional(),
  source: z.string().min(1),
  variable: z.string().min(1),
  get elements() {
    return z.array(AnyElementSchema);
  },
});

/**
 * Form element schema
 * Creates an interactive form that can trigger event publishing
 * - event: References an event template in the events map
 * - target: Optional elementId of an element to update upon successful submission
 */
const FormElementSchema = z.object({
  type: z.literal("form"),
  elementId: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/, "Invalid elementId format").optional(),
  event: z.string().min(1),
  target: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/, "Invalid elementId format").optional(),
  get elements() {
    return z.array(z.union([
      ElementSchema,
      DivElementSchema,
      ButtonElementSchema,
      SpanElementSchema,
      ComponentElementSchema,
      IfElementSchema,
      LoopElementSchema
    ]));
  },
});

/**
 * Div element schema
 * Creates a container element that can hold nested elements
 * Similar to form but without event handling - purely for structure and styling
 */
const DivElementSchema = z.object({
  type: z.literal("div"),
  elementId: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/, "Invalid elementId format").optional(),
  style: StylePropertiesSchema.optional(),
  attributes: z.record(z.string().min(1), z.string()).optional(),
  get elements() {
    return z.array(AnyElementSchema).optional();
  },
});

/**
 * Button element schema
 * Creates a button container that can hold nested elements (text, icons, etc.)
 * Can be styled and contain complex content
 */
const ButtonElementSchema = z.object({
  type: z.literal("button"),
  elementId: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/, "Invalid elementId format").optional(),
  style: StylePropertiesSchema.optional(),
  attributes: z.record(z.string().min(1), z.string()).optional(),
  get elements() {
    return z.array(AnyElementSchema).optional();
  },
});

/**
 * Span element schema  
 * Creates an inline container that can hold nested elements
 * Useful for styling sections of text or grouping inline content
 */
const SpanElementSchema = z.object({
  type: z.literal("span"),
  elementId: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/, "Invalid elementId format").optional(),
  style: StylePropertiesSchema.optional(),
  attributes: z.record(z.string().min(1), z.string()).optional(),
  get elements() {
    return z.array(AnyElementSchema).optional();
  },
});

// Union of all element types for simpler type checking
const AnyElementSchema = z.union([
  FormElementSchema,
  DivElementSchema,
  ButtonElementSchema,
  SpanElementSchema,
  ComponentElementSchema,
  IfElementSchema,
  LoopElementSchema,
  ElementSchema,
]);

// Style properties schema - REMOVED as it's now in style-schema.ts
// const StylePropertiesSchema = z.record(z.string().min(1), z.string());

// Query pipe step schema - now only for transformations, no Nostr filters
const QueryPipeStepSchema = z.union([
  // Extract operation - jq-style data extraction with variable assignment
  z.object({
    operation: z.literal("extract"),
    expression: z.string().min(1), // jq expression like ".tags[] | select(.[0] == \"p\") | .[1]"
    as: z.string().min(1), // variable name to store result
  }),
  // Reverse operation - reverses array order
  z.object({
    operation: z.literal("reverse"),
  }),
  // Flatten operation - flattens nested arrays
  z.object({
    operation: z.literal("flatten"),
    depth: z.number().positive().optional(), // optional depth limit
  }),
  // Unique operation - removes duplicate values
  z.object({
    operation: z.literal("unique"),
    by: z.string().optional(), // optional property to determine uniqueness
  }),
  // Sort operation - sorts array by property
  z.object({
    operation: z.literal("sort"),
    by: z.string().optional(), // property to sort by (e.g., "created_at")
    order: z.enum(["asc", "desc"]).optional().default("asc"),
  }),
  // Map operation - transforms each item
  z.object({
    operation: z.literal("map"),
    expression: z.string().min(1), // jq expression to apply to each item
  }),
  // Filter operation - filters items based on condition
  z.object({
    operation: z.literal("filter"),
    expression: z.string().min(1), // jq expression that returns boolean
  }),
  z.object({
    operation: z.literal("parse_json"),
    field: z.string().min(1).optional(), // Field containing JSON to parse (default: 'content')
  }),
]);

// Query schema - combines base Nostr filter with optional pipe transformations
const QuerySchema = z.object({
  // Base Nostr filter fields
  kinds: z.array(z.int().nonnegative()).optional(),
  authors: z.union([z.array(z.string().min(1)), z.string().min(1)]).optional(),
  limit: z.int().positive().optional(),
  since: z.union([z.int().nonnegative(), z.string()]).optional(),
  until: z.union([z.int().nonnegative(), z.string()]).optional(),
  ids: z.array(z.string().min(1)).optional(),
  tags: z.record(z.string().min(1), z.array(z.string())).optional(),
  
  // Live subscription flag - keeps WebSocket connection open for real-time updates
  live: z.boolean().optional(),
  
  // Optional transformation pipeline
  pipe: z.array(QueryPipeStepSchema).optional(),
});

// Event template schema
const EventTemplateSchema = z.object({
  kind: z.int().nonnegative(),
  content: z.string(),
  tags: z.array(z.array(z.string())).optional(),
});

/**
 * Main Hypernote schema
 * Represents the complete structure of a Hypernote document
 */
export const hypernoteSchema = z.object({
  // Schema version (should match the ["hypernote", "..."] tag)
  version: z.string().min(1),
  
  // For component definitions: 0 (npub input), 1 (nevent input), or null (not a component)
  component_kind: z.union([z.literal(0), z.literal(1), z.null()]).optional(),
  
  // Maps aliases used in HNMD to their Nostr identifiers (naddr, nevent, etc.)
  imports: z.record(z.string().min(1), z.string().min(1)).optional(),
  
  // Root-level styles as CSS-in-JS object (compiled from HNMD Tailwind classes)
  // In HNMD, this is specified as Tailwind classes, but gets compiled to a style object
  style: StylePropertiesSchema.optional(),
  
  // Query definitions - keys are query names from HNMD ($query_name)
  queries: z.record(z.string().min(1), QuerySchema).optional(),
  
  // Event template definitions - keys are event names from HNMD (@event_name)
  events: z.record(z.string().min(1), EventTemplateSchema).optional(),
  
  // Main content structure as a flat array of element objects
  elements: z.array(AnyElementSchema).min(0),
});

// Export the inferred type
export type Hypernote = z.infer<typeof hypernoteSchema>;

// Export individual element types
export type Element = z.infer<typeof ElementSchema>;
export type ComponentElement = z.infer<typeof ComponentElementSchema>;
export type IfElement = z.infer<typeof IfElementSchema>;
export type LoopElement = z.infer<typeof LoopElementSchema>;
export type FormElement = z.infer<typeof FormElementSchema>;
export type DivElement = z.infer<typeof DivElementSchema>;
export type ButtonElement = z.infer<typeof ButtonElementSchema>;
export type SpanElement = z.infer<typeof SpanElementSchema>;
export type AnyElement = z.infer<typeof AnyElementSchema>;
export type SupportedElementType = z.infer<typeof SupportedElementType>;

// Export the supported element type schema for programmatic access
export { SupportedElementType as supportedElementTypeSchema };

/**
 * Validates a Hypernote document against the schema
 * @param data The data to validate
 * @returns The validated Hypernote document
 * @throws ZodError if validation fails
 */
export function validateHypernote(data: unknown): Hypernote {
  return hypernoteSchema.parse(data);
}

/**
 * Safely validates a Hypernote document against the schema
 * @param data The data to validate
 * @returns An object with success/error information and the validated data if successful
 */
export function safeValidateHypernote(data: unknown) {
  return hypernoteSchema.safeParse(data);
}