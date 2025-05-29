import type { Hypernote } from "../src/lib/schema";

// Import all markdown examples directly using our custom loader
import basicHelloMd from "../examples/basic-hello.md";
import styledHeadingMd from "../examples/styled-heading.md"; 
import formWithInputMd from "../examples/form-with-input.md";
import queryAndLoopMd from "../examples/query-and-loop.md";
import complexFeedMd from "../examples/complex-feed.md";
import componentExampleMd from "../examples/component-example.md";

// Import all JSON examples directly using Bun's built-in JSON loader
import basicHelloJson from "../examples/basic-hello.json";
import styledHeadingJson from "../examples/styled-heading.json";
import formWithInputJson from "../examples/form-with-input.json";
import queryAndLoopJson from "../examples/query-and-loop.json";
import complexFeedJson from "../examples/complex-feed.json";
import componentExampleJson from "../examples/component-example.json";

// Map of example names to their imported content
const EXAMPLE_MAP = {
  "basic-hello": { markdown: basicHelloMd, json: basicHelloJson },
  "styled-heading": { markdown: styledHeadingMd, json: styledHeadingJson },
  "form-with-input": { markdown: formWithInputMd, json: formWithInputJson },
  "query-and-loop": { markdown: queryAndLoopMd, json: queryAndLoopJson },
  "complex-feed": { markdown: complexFeedMd, json: complexFeedJson },
  "component-example": { markdown: componentExampleMd, json: componentExampleJson },
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
  "styled-heading", 
  "form-with-input",
  "query-and-loop",
  "complex-feed",
  "component-example"
] as const;

export type ExampleName = typeof AVAILABLE_EXAMPLES[number]; 