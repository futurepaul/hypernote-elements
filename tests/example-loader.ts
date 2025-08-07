import type { Hypernote } from "../src/lib/schema";

// Import all markdown examples directly using our custom loader
import basicHelloMd from "../examples/basic-hello.md";
import feedMd from "../examples/feed.md";
import divContainerMd from "../examples/div-container.md";
import zapCloudMd from "../examples/zap-cloud.md";
import imageTestMd from "../examples/image-test.md";
import clientMd from "../examples/client.md";
import profileMd from "../examples/profile.md";
import textFormattingMd from "../examples/text-formatting.md";
import imageVariablesMd from "../examples/image-variables.md";

// Import all JSON examples directly using Bun's built-in JSON loader
import basicHelloJson from "../examples/basic-hello.json";
import feedJson from "../examples/feed.json";
import divContainerJson from "../examples/div-container.json";
import zapCloudJson from "../examples/zap-cloud.json";
import imageTestJson from "../examples/image-test.json";
import clientJson from "../examples/client.json";
import profileJson from "../examples/profile.json";
import textFormattingJson from "../examples/text-formatting.json";
import imageVariablesJson from "../examples/image-variables.json";

// Map of example names to their imported content
const EXAMPLE_MAP = {
  "basic-hello": { markdown: basicHelloMd, json: basicHelloJson },
  "feed": { markdown: feedMd, json: feedJson },
  "div-container": { markdown: divContainerMd, json: divContainerJson },
  "zap-cloud": { markdown: zapCloudMd, json: zapCloudJson },
  "image-test": { markdown: imageTestMd, json: imageTestJson },
  "client": { markdown: clientMd, json: clientJson },
  "profile": { markdown: profileMd, json: profileJson },
  "image-variables": { markdown: imageVariablesMd, json: imageVariablesJson },
  "text-formatting": { markdown: textFormattingMd, json: textFormattingJson },
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
  "feed",
  "div-container",
  "zap-cloud",
  "image-test",
  "image-variables",
  "text-formatting",
] as const;

export type ExampleName = typeof AVAILABLE_EXAMPLES[number]; 