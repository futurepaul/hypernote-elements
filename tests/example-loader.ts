import type { Hypernote } from "../src/lib/schema";

// Import all markdown examples directly using our custom loader
import basicHelloMd from "../examples/basic-hello.md";
import formWithInputMd from "../examples/form-with-input.md";
import queryAndLoopMd from "../examples/query-and-loop.md";
import divContainerMd from "../examples/div-container.md";

// Import all JSON examples directly using Bun's built-in JSON loader
import basicHelloJson from "../examples/basic-hello.json";
import formWithInputJson from "../examples/form-with-input.json";
import queryAndLoopJson from "../examples/query-and-loop.json";
import divContainerJson from "../examples/div-container.json";

// Map of example names to their imported content
const EXAMPLE_MAP = {
  "basic-hello": { markdown: basicHelloMd, json: basicHelloJson },
  "form-with-input": { markdown: formWithInputMd, json: formWithInputJson },
  "query-and-loop": { markdown: queryAndLoopMd, json: queryAndLoopJson },
  "div-container": { markdown: divContainerMd, json: divContainerJson },
} as const;

export interface ExampleData {
  name: string;
  markdown: string;
  expectedJson: Hypernote;
}

/**
 * Loads an example by name using direct imports (no filesystem operations)
 */
export function loadExample(name: string): ExampleData {
  const example = EXAMPLE_MAP[name as keyof typeof EXAMPLE_MAP];
  
  if (!example) {
    throw new Error(`No example found for "${name}". Available examples: ${AVAILABLE_EXAMPLES.join(", ")}`);
  }
  
  return {
    name,
    markdown: example.markdown,
    expectedJson: example.json as Hypernote
  };
}

/**
 * Loads multiple examples by name
 */
export function loadExamples(names: string[]): ExampleData[] {
  return names.map(loadExample);
}

/**
 * Available example names
 */
export const AVAILABLE_EXAMPLES = [
  "basic-hello",
  "form-with-input",
  "query-and-loop",
  "div-container",
] as const;

export type ExampleName = typeof AVAILABLE_EXAMPLES[number]; 