// Import necessary functions from bun:test
import { test, expect } from "bun:test";

// Import the compiler function
import { compileHypernoteToContent } from "../src/lib/compiler";
import { loadExample } from "./example-loader";

// --- FRONTMATTER PARSING TESTS ---

test("should parse basic event from frontmatter", () => {
  const example = loadExample("basic-hello");
  const result = compileHypernoteToContent(example.markdown);
  
  expect(result.version).toBe("1.1.0");
  expect(result.component_kind).toBe(null);
  expect(result.events).toEqual({
    "@post_hello": {
      kind: 1,
      content: "hello world",
      tags: [],
    },
  });
});

test("should parse frontmatter with styles", () => {
  const example = loadExample("div-container");
  const result = compileHypernoteToContent(example.markdown);
  
  expect(result.version).toBe("1.1.0");
  expect(result.component_kind).toBe(null);
  expect(result.events).toEqual({
    "@submit_feedback": {
      kind: 1,
      content: "Thanks for your feedback: {form.message}",
      tags: [],
    },
  });
  expect(result.style).toBeDefined();
  expect(result.style?.padding).toBe("1rem");
  expect(result.style?.backgroundColor).toBe("rgb(243,244,246)");
});

test("should parse frontmatter with event using variable", () => {
  const example = loadExample("form-with-input");
  const result = compileHypernoteToContent(example.markdown);
  
  expect(result.version).toBe("1.1.0");
  expect(result.component_kind).toBe(null);
  expect(result.events).toEqual({
    "@post_message": {
      kind: 1,
      content: "{form.message}",
      tags: [["client", "hypernote-test"]],
    },
  });
});

// --- FULL ELEMENT PARSING TESTS ---

test("should parse basic H1 and a form triggering a hardcoded event", () => {
  const example = loadExample("basic-hello");
  const result = compileHypernoteToContent(example.markdown);
  
  expect(result).toEqual(example.expectedJson);
});

test("should parse H1 with ID and apply a simple style rule", () => {
  const example = loadExample("div-container");
  const result = compileHypernoteToContent(example.markdown);
  
  expect(result).toEqual(example.expectedJson);
});

test("should parse form with input and use form variable in event template", () => {
  const example = loadExample("form-with-input");
  const result = compileHypernoteToContent(example.markdown);
  
  expect(result).toEqual(example.expectedJson);
}); 