import { test, expect } from "bun:test";
import { compileHypernoteToContent } from "../src/lib/compiler";
import type { FormElement, LoopElement, Element } from "../src/lib/schema";

test("should parse basic H1 and a form triggering a hardcoded event", () => {
  const inputHnmd = `
---
"@post_hello":
  kind: 1
  content: "hello world"
  tags: [] 
---

# Hello There

[form @post_hello]
  [button "Say Hello"]
`.trim();

  const result = compileHypernoteToContent(inputHnmd);
  
  expect(result.version).toBe("1.1.0");
  expect(result.component_kind).toBe(null);
  expect(result.events?.["@post_hello"]).toBeDefined();
  expect(result.events?.["@post_hello"].kind).toBe(1);
  expect(result.events?.["@post_hello"].content).toBe("hello world");
  
  // Check the elements structure
  expect(result.elements).toBeArray();
  expect(result.elements[0].type).toBe("h1");
  expect((result.elements[0] as Element).content?.[0]).toBe("Hello There");
  
  // Check the form structure
  const formElement = result.elements[1] as FormElement;
  expect(formElement.type).toBe("form");
  expect(formElement.event).toBe("@post_hello");
  expect(formElement.elements?.[0].type).toBe("button");
  expect((formElement.elements?.[0] as Element).content?.[0]).toBe("Say Hello");
});

test("should parse H1 with ID and apply a simple style rule", () => {
  const inputHnmd = `
---
"@post_hello":
  kind: 1
  content: "hello world"
  tags: []
style:
  "#main-title":
    color: "#3b82f6"
  button:
    background-color: "#3b82f6" 
---

{#main-title}
# Hello Styled

[form @post_hello]
  [button "Say Hello Blue"]
`.trim();

  const result = compileHypernoteToContent(inputHnmd);
  
  // Check styles
  expect(result.styles).toBeDefined();
  expect(result.styles?.["#main-title"]["color"]).toBe("#3b82f6");
  expect(result.styles?.["button"]["background-color"]).toBe("#3b82f6");
  
  // Check elements
  expect(result.elements[0].type).toBe("h1");
  expect(result.elements[0].id).toBe("main-title");
  expect((result.elements[0] as Element).content?.[0]).toBe("Hello Styled");
});

test("should parse form with input and use form variable in event template", () => {
  const inputHnmd = `
---
"@post_message":
  kind: 1
  content: "{form.message}" 
  tags: [["client", "hypernote-test"]] 
---

# Post a Message

[form @post_message]
  [input name="message" placeholder="Enter message..."]
  [button "Post"]
`.trim();

  const result = compileHypernoteToContent(inputHnmd);
  
  // Check event template
  expect(result.events?.["@post_message"].content).toBe("{form.message}");
  
  // Check form elements
  const form = result.elements[1] as FormElement;
  expect(form.type).toBe("form");
  expect(form.event).toBe("@post_message");
  
  // Check input
  const input = form.elements?.[0] as Element;
  expect(input?.type).toBe("input");
  expect(input?.attributes?.name).toBe("message");
  expect(input?.attributes?.placeholder).toBe("Enter message...");
  
  // Check button
  const button = form.elements?.[1] as Element;
  expect(button?.type).toBe("button");
  expect(button?.content?.[0]).toBe("Post");
});

test("should parse query in frontmatter and loop in content", () => {
  const inputHnmd = `
---
"$my_feed":
  authors: [user.pubkey]
  limit: 20
---

[each $my_feed as $note]
  {$note.content}
`.trim();

  const result = compileHypernoteToContent(inputHnmd);
  
  // Check the query in frontmatter
  expect(result.queries).toBeDefined();
  expect(result.queries?.["$my_feed"]).toBeDefined();
  
  // Type assertion for the query to access its properties
  const query = result.queries?.["$my_feed"];
  if (query && 'authors' in query) {
    expect(query.authors).toEqual(["user.pubkey"]);
    expect(query.limit).toBe(20);
  } else {
    throw new Error("Expected simple query with authors and limit");
  }
  
  // Check the loop structure
  expect(result.elements).toBeArray();
  const loopElement = result.elements[0] as LoopElement;
  expect(loopElement.type).toBe("loop");
  expect(loopElement.source).toBe("$my_feed");
  expect(loopElement.variable).toBe("$note");
  
  // Check the variable reference inside the loop - should be a span element
  expect(loopElement.elements?.[0].type).toBe("span");
  expect((loopElement.elements?.[0] as Element).content?.[0]).toBe("{$note.content}");
});

test("should handle invalid query gracefully and return fallback structure", () => {
  const inputHnmd = `
---
"$my_feed":
  limit: null  # Invalid - should be a number
  authors: [user.pubkey]
---

# Test Content

Some content here.
`.trim();

  // Capture console.error calls
  const originalConsoleError = console.error;
  const errorLogs: any[] = [];
  console.error = (...args: any[]) => {
    errorLogs.push(args);
  };

  try {
    const result = compileHypernoteToContent(inputHnmd);
    
    // Should return fallback structure instead of throwing
    expect(result.version).toBe("1.1.0");
    expect(result.component_kind).toBe(null);
    expect(result.elements).toBeArray();
    expect(result.elements.length).toBe(1);
    expect(result.elements[0].type).toBe("div");
    
    // Check that it contains the validation error
    const divElement = result.elements[0] as Element;
    expect(divElement.content?.[0]).toBe("Validation Error:");
    expect(divElement.content?.[1]).toMatchObject({
      type: "pre",
      content: expect.arrayContaining([expect.stringContaining("invalid_type")])
    });
    
    // Should have logged validation errors
    expect(errorLogs.length).toBeGreaterThan(0);
    expect(JSON.stringify(errorLogs)).toContain("validation failed");
  } finally {
    // Restore console.error
    console.error = originalConsoleError;
  }
}); 