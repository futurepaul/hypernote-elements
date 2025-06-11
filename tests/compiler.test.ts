import { test, expect } from "bun:test";
import { compileHypernoteToContent } from "../src/lib/compiler";
import { loadExample, AVAILABLE_EXAMPLES } from "./example-loader";
import type { FormElement, LoopElement, Element, ButtonElement } from "../src/lib/schema";

test("should parse basic H1 and a form triggering a hardcoded event", () => {
  const example = loadExample("basic-hello");
  const result = compileHypernoteToContent(example.markdown);
  
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
  
  // Button is now a container with elements, not content
  const button = formElement.elements?.[0] as ButtonElement;
  expect(button.elements?.[0].type).toBe("p");
  expect((button.elements?.[0] as Element).content?.[0]).toBe("Say Hello");
});

test("should parse H1 with ID and apply a simple style rule", () => {
  const example = loadExample("div-container");
  const result = compileHypernoteToContent(example.markdown);

  // Check structure
  expect(result.version).toBe("1.1.0");
  expect(result.elements.length).toBeGreaterThan(2);
  
  // Check H1 element
  const h1 = result.elements[0] as Element;
  expect(h1.type).toBe("h1");
  expect(h1.content).toEqual(["Div Container Example"]);
  
  // Check element with ID (the paragraph after the ID marker)
  const elementWithId = result.elements[1] as any;
  expect(elementWithId.elementId).toBe("card-container");
  
  // Check styled div element
  const divElement = result.elements[2] as any;
  expect(divElement.type).toBe("div");
  expect(divElement.style).toBeDefined();
  expect(divElement.style?.backgroundColor).toBe("rgb(255,255,255)");
  expect(divElement.style?.padding).toBe("1.5rem");
});

test("should parse form with input and use form variable in event template", () => {
  const example = loadExample("feed");
  const result = compileHypernoteToContent(example.markdown);
  
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
  
  // Check button - now a container with elements
  const button = form.elements?.[1] as ButtonElement;
  expect(button?.type).toBe("button");
  expect(button.elements?.[0].type).toBe("p");
  expect((button.elements?.[0] as Element).content?.[0]).toBe("Post");
});

test("should parse query in frontmatter and loop in content", () => {
  const example = loadExample("feed");
  const result = compileHypernoteToContent(example.markdown);
  
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
  
  // Check the loop structure - it's the 3rd element (after h1 and form)
  expect(result.elements).toBeArray();
  const loopElement = result.elements[2] as LoopElement;
  expect(loopElement.type).toBe("loop");
  expect(loopElement.source).toBe("$my_feed");
  expect(loopElement.variable).toBe("$note");
  
  // Check the variable reference inside the loop - should be a paragraph
  expect(loopElement.elements?.[0].type).toBe("p");
  const paragraphContent = (loopElement.elements?.[0] as Element).content;
  expect(paragraphContent).toContain("{$note.content}");
});

test("should compile all examples without errors", () => {
  for (const exampleName of AVAILABLE_EXAMPLES) {
    const example = loadExample(exampleName);
    
    // This should not throw
    const result = compileHypernoteToContent(example.markdown);
    
    // Basic sanity checks
    expect(result.version).toBe("1.1.0");
    expect(result.elements).toBeArray();
    expect(result.elements.length).toBeGreaterThan(0);
  }
});

test("should match expected JSON output for all examples", () => {
  for (const exampleName of AVAILABLE_EXAMPLES) {
    const example = loadExample(exampleName);
    const result = compileHypernoteToContent(example.markdown);
    
    // Compare the compiled result with the expected JSON
    expect(result).toEqual(example.expectedJson);
  }
});

test("should handle invalid query gracefully and return fallback structure", () => {
  const invalidHnmd = `---
"$my_feed":
  limit: null  # Invalid - should be a number
  authors: [user.pubkey]
---

# Test Content

Some content here.`;

  // Capture console.error calls
  const originalConsoleError = console.error;
  const errorLogs: any[] = [];
  console.error = (...args: any[]) => {
    errorLogs.push(args);
  };

  try {
    const result = compileHypernoteToContent(invalidHnmd);
    
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