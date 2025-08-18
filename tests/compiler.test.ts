import { test, expect } from "bun:test";
import { compileHypernoteToContent } from "../src/lib/compiler";
import { loadExample, AVAILABLE_EXAMPLES } from "./example-loader";
import type { FormElement, LoopElement, Element, ButtonElement } from "../src/lib/schema";

test("should parse basic H1 and a form triggering a hardcoded event", () => {
  const example = loadExample("basic-hello");
  const result = compileHypernoteToContent(example.markdown);
  
  expect(result.version).toBe("1.1.0");
  expect(result.kind).toBeUndefined();
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
  
  // Check paragraph element
  const paragraph = result.elements[1] as any;
  expect(paragraph.type).toBe("p");
  
  // Check styled div element with ID
  const divElement = result.elements[2] as any;
  expect(divElement.type).toBe("div");
  expect(divElement.elementId).toBe("card-container");
  expect(divElement.style).toBeDefined();
  expect(divElement.style?.backgroundColor).toBe("rgb(255,255,255)");
  expect(divElement.style?.padding).toBe("1.5rem");
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
  const form = formDiv?.elements?.find((el: any) => el.type === "form") as FormElement;
  
  expect(form.type).toBe("form");
  expect(form.event).toBe("@post_note");
  
  // Check input
  const input = form.elements?.[0] as Element;
  expect(input?.type).toBe("input");
  expect(input?.attributes?.name).toBe("message");
  expect(input?.attributes?.placeholder).toBe("What's happening?");
  
  // Check button - has elements array with paragraph inside
  const button = form.elements?.[1] as ButtonElement;
  expect(button?.type).toBe("button");
  expect(button.elements?.[0].type).toBe("p");
  expect((button.elements?.[0] as any).content?.[0]).toBe("Post");
});

test("should parse query in frontmatter and loop in content", () => {
  const example = loadExample("client");
  const result = compileHypernoteToContent(example.markdown);
  
  // Check the queries in frontmatter
  expect(result.queries).toBeDefined();
  expect(result.queries?.["$contact_list"]).toBeDefined();
  expect(result.queries?.["$following_feed"]).toBeDefined();
  
  // Check the following feed query
  const query = result.queries?.["$following_feed"];
  if (query && 'authors' in query) {
    expect(query.authors).toBe("$contact_list"); // Direct reference
    expect(query.limit).toBe(20);
  } else {
    throw new Error("Expected query with authors reference and limit");
  }
  
  // Check the loop structure - it's nested in divs
  expect(result.elements).toBeArray();
  
  // Find the loop element within the div structure
  const divs = result.elements.filter((el: any) => el.type === "div");
  const loopDiv = divs.find((div: any) => 
    div.elements?.some((el: any) => el.type === "loop")
  );
  const loopElement = loopDiv?.elements?.find((el: any) => el.type === "loop") as LoopElement;
  
  expect(loopElement).toBeDefined();
  expect(loopElement.type).toBe("loop");
  expect(loopElement.source).toBe("$following_feed");
  expect(loopElement.variable).toBe("$note");
  
  // Check the structure inside the loop
  expect(loopElement.elements?.length).toBeGreaterThan(0);
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

test("should compile chess example with board rendering", () => {
  const example = loadExample("chess");
  const result = compileHypernoteToContent(example.markdown);
  
  // Check that it has the expected structure
  expect(result.version).toBe("1.1.0");
  expect(result.queries).toBeDefined();
  expect(result.queries?.["$board_state"]).toBeDefined();
  expect(result.queries?.["$move_result"]).toBeDefined();
  expect(result.events?.["@make_move"]).toBeDefined();
  expect(result.events?.["@save_board"]).toBeDefined();
  
  // Check for chess-specific tool call
  const makeMoveEvent = result.events?.["@make_move"];
  expect(makeMoveEvent.kind).toBe(25910);
  expect(makeMoveEvent.json).toBeDefined();
  expect(makeMoveEvent.json.params.name).toBe("chess_board_update");
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
    
    // Should return valid structure with the content
    expect(result.version).toBe("1.1.0");
    expect(result.kind).toBeUndefined();
    expect(result.elements).toBeArray();
    expect(result.elements.length).toBe(2); // h1 and p elements
    expect(result.elements[0].type).toBe("h1");
    expect(result.elements[1].type).toBe("p");
    
    // Should have the query even with null limit
    expect(result.queries).toBeDefined();
    expect(result.queries?.["$my_feed"]).toBeDefined();
  } finally {
    // Restore console.error
    console.error = originalConsoleError;
  }
}); 