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
  expect(result.kind).toBeUndefined();
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
  expect(result.kind).toBeUndefined();
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
  const example = loadExample("client");
  const result = compileHypernoteToContent(example.markdown);
  
  expect(result.version).toBe("1.1.0");
  expect(result.kind).toBeUndefined();
  expect(result.events).toEqual({
    "@post_note": {
      kind: 1,
      content: "{form.message}",
      tags: [["client", "hypernote-client"]],
    },
  });
});

test("should parse client example with pipe operations and query dependencies", () => {
  const example = loadExample("client");
  const result = compileHypernoteToContent(example.markdown);
  
  expect(result.version).toBe("1.1.0");
  expect(result.kind).toBeUndefined();
  
  // Check that queries are parsed correctly
  expect(result.queries).toBeDefined();
  expect(result.queries?.$contact_list).toEqual({
    kinds: [3],
    authors: ["user.pubkey"],
    limit: 1,
    pipe: [
      { op: "first" },
      { op: "get", field: "tags" },
      { op: "whereIndex", index: 0, eq: "p" },
      { op: "pluckIndex", index: 1 }
    ]
  });
  
  expect(result.queries?.$following_feed).toEqual({
    kinds: [1],
    authors: "$contact_list",
    limit: 20,
    since: 0
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
  
  // Find the loop element within the div structure
  const divs = result.elements?.filter((el: any) => el.type === 'div');
  const loopDiv = divs?.find((div: any) => 
    div.elements?.some((el: any) => el.type === 'loop')
  );
  const loopElement = loopDiv?.elements?.find((el: any) => el.type === 'loop');
  
  expect(loopElement).toBeDefined();
  expect(loopElement?.type).toBe('loop');
  expect(loopElement?.source).toBe('$following_feed');
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
  const example = loadExample("client");
  const result = compileHypernoteToContent(example.markdown);
  
  // Check event template
  expect(result.events?.["@post_note"].content).toBe("{form.message}");
  
  // Find form element in the structure
  const divs = result.elements.filter((el: any) => el.type === "div");
  const formDiv = divs.find((div: any) => 
    div.elements?.some((el: any) => el.type === "form")
  );
  const form = formDiv?.elements?.find((el: any) => el.type === "form") as any;
  
  expect(form.type).toBe("form");
  expect(form.event).toBe("@post_note");
  
  // Check input
  const input = form.elements?.[0] as any;
  expect(input?.type).toBe("input");
  expect(input?.attributes?.name).toBe("message");
  expect(input?.attributes?.placeholder).toBe("What's happening?");
  
  // Check button - has elements array with paragraph inside
  const button = form.elements?.[1] as any;
  expect(button?.type).toBe("button");
  expect(button.elements?.[0].type).toBe("p");
  expect(button.elements?.[0].content?.[0]).toBe("Post");
}); 