import type { Hypernote } from "../src/lib/schema";

// Import all markdown examples directly using our custom loader
import basicHelloMd from "../examples/basic-hello.md";
import divContainerMd from "../examples/div-container.md";
import clientMd from "../examples/client.md";
import profileMd from "../examples/profile.md";
import textFormattingMd from "../examples/text-formatting.md";
import imageVariablesMd from "../examples/image-variables.md";
import hypernotesMd from "../examples/hypernotes.md";
import counterMd from "../examples/counter.md";
import inlineCodeMd from "../examples/inline-code.md";

// Import all JSON examples directly using Bun's built-in JSON loader
import basicHelloJson from "../examples/basic-hello.json";
import divContainerJson from "../examples/div-container.json";
import clientJson from "../examples/client.json";
import profileJson from "../examples/profile.json";
import textFormattingJson from "../examples/text-formatting.json";
import imageVariablesJson from "../examples/image-variables.json";
import hypernotesJson from "../examples/hypernotes.json";
import counterJson from "../examples/counter.json";
import inlineCodeJson from "../examples/inline-code.json";

// Map of example names to their imported content
const EXAMPLE_MAP = {
  "basic-hello": { markdown: basicHelloMd, json: basicHelloJson },
  "div-container": { markdown: divContainerMd, json: divContainerJson },
  "client": { markdown: clientMd, json: clientJson },
  "profile": { markdown: profileMd, json: profileJson },
  "image-variables": { markdown: imageVariablesMd, json: imageVariablesJson },
  "text-formatting": { markdown: textFormattingMd, json: textFormattingJson },
  "hypernotes": { markdown: hypernotesMd, json: hypernotesJson },
  "counter": { markdown: counterMd, json: counterJson },
  "inline-code": { markdown: inlineCodeMd, json: inlineCodeJson },
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
  "profile",
  "client",
  "div-container",
  "image-variables",
  "text-formatting",
  "hypernotes",
  "counter",
  "inline-code",
] as const;

export type ExampleName = typeof AVAILABLE_EXAMPLES[number]; 