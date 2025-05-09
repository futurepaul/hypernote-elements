import { z } from "zod";

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
    z.lazy(() => ElementSchema)
  ])
);

/**
 * Basic element schema for standard HTML-like elements
 * Elements can have a type (like "p", "h1", "div"), optional ID, 
 * optional content (array of strings/elements), and optional attributes
 */
const ElementSchema = z.object({
  type: z.string(),
  id: z.string().optional(),
  content: ElementContentSchema.optional(),
  attributes: z.record(z.string(), z.string()).optional(),
});

/**
 * Component element schema
 * Used to reference external Hypernote components by their alias
 * Components receive a single string argument (npub/nevent depending on component_kind)
 */
const ComponentElementSchema = z.object({
  type: z.literal("component"),
  id: z.string().optional(),
  alias: z.string(),
  argument: z.string(),
});

/**
 * Conditional rendering element schema
 * Renders its child elements only if the condition evaluates to true
 * The condition is a string expression evaluated by the client with variable substitution
 */
const IfElementSchema = z.object({
  type: z.literal("if"),
  id: z.string().optional(),
  condition: z.string(),
  elements: z.array(z.union([
    ElementSchema,
    ComponentElementSchema,
    z.lazy(() => IfElementSchema),
    z.lazy(() => LoopElementSchema),
    z.lazy(() => FormElementSchema)
  ])),
});

/**
 * Loop element schema
 * Iterates over data from a query, rendering child elements for each item
 * - source: Name of the query (references entries in the queries map)
 * - variable: Name for each item in the iteration (available in nested scope)
 */
const LoopElementSchema = z.object({
  type: z.literal("loop"),
  id: z.string().optional(),
  source: z.string(),
  variable: z.string(),
  elements: z.array(z.union([
    ElementSchema,
    ComponentElementSchema,
    z.lazy(() => IfElementSchema),
    z.lazy(() => LoopElementSchema),
    z.lazy(() => FormElementSchema)
  ])),
});

/**
 * Form element schema
 * Creates an interactive form that can trigger event publishing
 * - event: References an event template in the events map
 * - target: Optional ID of an element to update upon successful submission
 */
const FormElementSchema = z.object({
  type: z.literal("form"),
  id: z.string().optional(),
  event: z.string(),
  target: z.string().optional(),
  elements: z.array(z.union([
    ElementSchema,
    ComponentElementSchema,
    z.lazy(() => IfElementSchema),
    z.lazy(() => LoopElementSchema)
  ])),
});

// Style properties schema
const StylePropertiesSchema = z.record(z.string(), z.string());

// Query pipe step schema
const QueryPipeStepSchema = z.union([
  // Regular nostr filter
  z.object({
    kinds: z.array(z.number()).optional(),
    authors: z.union([z.array(z.string()), z.string()]).optional(),
    limit: z.number().optional(),
    since: z.union([z.number(), z.string()]).optional(),
    until: z.union([z.number(), z.string()]).optional(),
    ids: z.array(z.string()).optional(),
    tags: z.record(z.string(), z.array(z.string())).optional(),
  }),
  // Extract operation
  z.object({
    extract: z.string(),
    as: z.string(),
  }),
]);

// Query schema
const QuerySchema = z.union([
  // Simple query
  z.object({
    kinds: z.array(z.number()).optional(),
    authors: z.union([z.array(z.string()), z.string()]).optional(),
    limit: z.number().optional(),
    since: z.union([z.number(), z.string()]).optional(),
    until: z.union([z.number(), z.string()]).optional(),
    ids: z.array(z.string()).optional(),
    tags: z.record(z.string(), z.array(z.string())).optional(),
  }),
  // Pipeline query
  z.object({
    pipe: z.array(QueryPipeStepSchema),
  }),
]);

// Event template schema
const EventTemplateSchema = z.object({
  kind: z.number(),
  content: z.string(),
  tags: z.array(z.array(z.string())).optional(),
});

/**
 * Main Hypernote schema
 * Represents the complete structure of a Hypernote document
 */
export const hypernoteSchema = z.object({
  // Schema version (should match the ["hypernote", "..."] tag)
  version: z.string(),
  
  // For component definitions: 0 (npub input), 1 (nevent input), or null (not a component)
  component_kind: z.union([z.literal(0), z.literal(1), z.null()]).optional(),
  
  // Maps aliases used in HNMD to their Nostr identifiers (naddr, nevent, etc.)
  imports: z.record(z.string(), z.string()).optional(),
  
  // Style definitions - selectors are keys, properties are values
  styles: z.record(z.string(), StylePropertiesSchema).optional(),
  
  // Query definitions - keys are query names from HNMD ($query_name)
  queries: z.record(z.string(), QuerySchema).optional(),
  
  // Event template definitions - keys are event names from HNMD (@event_name)
  events: z.record(z.string(), EventTemplateSchema).optional(),
  
  // Main content structure as a flat array of element objects
  elements: z.array(z.union([
    ElementSchema,
    ComponentElementSchema,
    IfElementSchema,
    LoopElementSchema,
    FormElementSchema,
  ])),
});

// Export the inferred type
export type Hypernote = z.infer<typeof hypernoteSchema>;

// Export individual element types
// Union of all element types for simpler type checking
export const AnyElementSchema = z.union([
  ElementSchema,
  ComponentElementSchema,
  IfElementSchema,
  LoopElementSchema,
  FormElementSchema,
]);

export type Element = z.infer<typeof ElementSchema>;
export type ComponentElement = z.infer<typeof ComponentElementSchema>;
export type IfElement = z.infer<typeof IfElementSchema>;
export type LoopElement = z.infer<typeof LoopElementSchema>;
export type FormElement = z.infer<typeof FormElementSchema>;
export type AnyElement = z.infer<typeof AnyElementSchema>;

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