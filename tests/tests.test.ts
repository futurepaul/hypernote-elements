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
  const example = loadExample("feed");
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

test("should parse client example with pipe operations and query dependencies", () => {
  const example = loadExample("client");
  const result = compileHypernoteToContent(example.markdown);
  
  expect(result.version).toBe("1.1.0");
  expect(result.component_kind).toBe(null);
  
  // Check that queries are parsed correctly
  expect(result.queries).toBeDefined();
  expect(result.queries?.$contact_list).toEqual({
    kinds: [3],
    authors: ["user.pubkey"],
    limit: 1,
    pipe: [{
      operation: "extract",
      expression: ".tags[] | select(.[0] == \"p\") | .[1]",
      as: "followed_pubkeys"
    }]
  });
  
  expect(result.queries?.$following_feed).toEqual({
    kinds: [1],
    authors: "$followed_pubkeys",
    limit: 100,
    since: "time.now - 86400000",
    pipe: [{
      operation: "reverse"
    }]
  });
  
  // Check that events are parsed correctly
  expect(result.events).toEqual({
    "@post_note": {
      kind: 1,
      content: "{form.message}",
      tags: [["client", "hypernote-client"]],
    },
  });
  
  // Check that elements contain the expected loops
  expect(result.elements).toBeDefined();
  const feedLoop = result.elements?.find(el => el.type === 'div' && el.elementId === 'feed');
  expect(feedLoop).toBeDefined();
  expect(feedLoop?.elements?.[0]?.type).toBe('loop');
  expect(feedLoop?.elements?.[0]?.source).toBe('$following_feed');
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
  const example = loadExample("feed");
  const result = compileHypernoteToContent(example.markdown);
  
  expect(result).toEqual(example.expectedJson);
}); 