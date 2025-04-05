import { test, expect } from "bun:test";
import { compileHypernoteToContent } from "../src/lib/compiler";

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
  expect(result.elements[0].content?.[0]).toBe("Hello There");
  
  // Check the form structure
  expect(result.elements[1].type).toBe("form");
  expect(result.elements[1].event).toBe("@post_hello");
  expect(result.elements[1].elements?.[0].type).toBe("button");
  expect(result.elements[1].elements?.[0].content?.[0]).toBe("Say Hello");
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
    text-color: primary
  button:
    bg-color: blue-500 
---

{#main-title}
# Hello Styled

[form @post_hello]
  [button "Say Hello Blue"]
`.trim();

  const result = compileHypernoteToContent(inputHnmd);
  
  // Check styles
  expect(result.styles).toBeDefined();
  expect(result.styles?.["#main-title"]["text-color"]).toBe("primary");
  expect(result.styles?.["button"]["bg-color"]).toBe("blue-500");
  
  // Check elements
  expect(result.elements[0].type).toBe("h1");
  expect(result.elements[0].id).toBe("main-title");
  expect(result.elements[0].content?.[0]).toBe("Hello Styled");
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
  const form = result.elements[1];
  expect(form.type).toBe("form");
  expect(form.event).toBe("@post_message");
  
  // Check input
  const input = form.elements?.[0];
  expect(input?.type).toBe("input");
  expect(input?.attributes?.name).toBe("message");
  expect(input?.attributes?.placeholder).toBe("Enter message...");
  
  // Check button
  const button = form.elements?.[1];
  expect(button?.type).toBe("button");
  expect(button?.content?.[0]).toBe("Post");
}); 