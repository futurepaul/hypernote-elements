import { z } from "zod/v4";

/**
 * Pipe operations for transforming data
 * Used in both queries and reactive events
 */

// Simple operations (no parameters)
const SimpleOps = z.union([
  z.literal("first"),
  z.literal("last"),
  z.literal("json"),
  z.literal("reverse"),
  z.literal("unique"),
  z.literal("flatten"),
  z.literal("compact"), // Remove null/undefined
  z.literal("keys"),    // Object keys
  z.literal("values"),  // Object values
  z.literal("sum"),     // Sum array of numbers
  z.literal("min"),     // Min of array
  z.literal("max"),     // Max of array
  z.literal("average"), // Average of array
  z.literal("length"),  // Length of array or string
]);

// Operations with single field parameter
const FieldOps = z.union([
  z.object({ op: z.literal("get"), field: z.string() }),
  z.object({ op: z.literal("pluck"), field: z.string() }),
  z.object({ op: z.literal("groupBy"), field: z.string() }), // Group array by field value
]);

// Operations with value parameter
const ValueOps = z.union([
  z.object({ op: z.literal("default"), value: z.any() }),
  z.object({ op: z.literal("limit"), count: z.number().positive() }),
  z.object({ op: z.literal("take"), count: z.number().positive() }),
  z.object({ op: z.literal("drop"), count: z.number().positive() }),
  z.object({ op: z.literal("add"), value: z.number() }),
  z.object({ op: z.literal("multiply"), value: z.number() }),
]);

// Filter operations
const FilterOps = z.union([
  z.object({ 
    op: z.literal("filter"), 
    field: z.string(),
    eq: z.any().optional(),
    neq: z.any().optional(),
    gt: z.any().optional(),
    lt: z.any().optional(),
    gte: z.any().optional(),
    lte: z.any().optional(),
    contains: z.string().optional(),
  }),
  z.object({
    op: z.literal("where"),
    expression: z.string(), // Simple expression like "kind == 1"
  }),
]);

// Sort operation
const SortOp = z.object({
  op: z.literal("sort"),
  by: z.string().optional(),
  order: z.enum(["asc", "desc"]).optional(),
});

// Nostr-specific operations (for tags)
const NostrOps = z.union([
  z.object({
    op: z.literal("filterTag"),
    tag: z.string(), // Tag name (e.g., "p", "e")
    value: z.string().optional(), // Optional value to match ("*" for any)
  }),
  z.object({
    op: z.literal("pluckTag"),
    tag: z.string(),
    index: z.number().nonnegative(), // Index within tag array
  }),
  z.object({
    op: z.literal("whereIndex"),
    index: z.number().nonnegative(),
    eq: z.any(),
  }),
  z.object({
    op: z.literal("pluckIndex"),
    index: z.number().nonnegative(),
  }),
]);

// String operations
const StringOps = z.union([
  z.object({ op: z.literal("trim") }),
  z.object({ op: z.literal("lowercase") }),
  z.object({ op: z.literal("uppercase") }),
  z.object({ op: z.literal("split"), separator: z.string() }),
  z.object({ op: z.literal("join"), separator: z.string() }),
  z.object({ 
    op: z.literal("replace"), 
    from: z.string(), 
    to: z.string() 
  }),
]);

// Object operations
const ObjectOps = z.union([
  z.object({ op: z.literal("merge"), with: z.record(z.string(), z.any()) }),
  z.object({ op: z.literal("defaults"), value: z.record(z.string(), z.any()) }), // Apply defaults to object
  z.object({ op: z.literal("pick"), fields: z.array(z.string()) }),
  z.object({ op: z.literal("omit"), fields: z.array(z.string()) }),
]);

// Map operation (transform each item)
const MapOp = z.object({
  op: z.literal("map"),
  pipe: z.lazy(() => z.array(PipeOperation)), // Recursive: apply pipes to each item
});

// Construct operation (build new object with transformed fields)
const ConstructOp = z.object({
  op: z.literal("construct"),
  fields: z.record(z.string(), z.lazy(() => z.array(PipeOperation))), // Each field has its own pipe
});

// All pipe operations
export const PipeOperation = z.union([
  // Simple ops (as objects with just op field)
  z.object({ op: SimpleOps }),
  // Ops with parameters
  FieldOps,
  ValueOps,
  FilterOps,
  SortOp,
  NostrOps,
  StringOps,
  ObjectOps,
  MapOp,
  ConstructOp,
]);

// Pipe array (used in queries and reactive events)
export const PipeSchema = z.array(PipeOperation);

export type PipeOperation = z.infer<typeof PipeOperation>;
export type Pipe = z.infer<typeof PipeSchema>;