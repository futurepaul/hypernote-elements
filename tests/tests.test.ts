// Import necessary functions from bun:test
import { test, expect } from "bun:test";

// Import the compiler function
import { compileHypernoteToContent } from "../src/lib/compiler";

// --- YAML FRONTMATTER PARSING TESTS ---

test("should parse basic event from frontmatter", () => {
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

  const expectedContent = {
    version: "1.1.0",
    component_kind: null,
    events: {
      "@post_hello": {
        kind: 1,
        content: "hello world",
        tags: [],
      },
    }
  };

  const result = compileHypernoteToContent(inputHnmd);
  // Only check frontmatter properties for frontmatter tests
  expect(result.version).toEqual(expectedContent.version);
  expect(result.component_kind).toEqual(expectedContent.component_kind);
  expect(result.events).toEqual(expectedContent.events);
});

test("should parse frontmatter with styles", () => {
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

  const expectedContent = {
    version: "1.1.0",
    component_kind: null,
    styles: {
      "#main-title": {
        "text-color": "primary",
      },
      "button": {
        "bg-color": "blue-500",
      }
    },
    events: {
      "@post_hello": {
        kind: 1,
        content: "hello world",
        tags: [],
      },
    }
  };

  const result = compileHypernoteToContent(inputHnmd);
  // Only check frontmatter properties for frontmatter tests
  expect(result.version).toEqual(expectedContent.version);
  expect(result.component_kind).toEqual(expectedContent.component_kind);
  expect(result.events).toEqual(expectedContent.events);
  expect(result.styles).toEqual(expectedContent.styles);
});

test("should parse frontmatter with event using variable", () => {
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

  const expectedContent = {
    version: "1.1.0",
    component_kind: null,
    events: {
      "@post_message": {
        kind: 1,
        content: "{form.message}",
        tags: [["client", "hypernote-test"]],
      },
    }
  };

  const result = compileHypernoteToContent(inputHnmd);
  // Only check frontmatter properties for frontmatter tests
  expect(result.version).toEqual(expectedContent.version);
  expect(result.component_kind).toEqual(expectedContent.component_kind);
  expect(result.events).toEqual(expectedContent.events);
});

// --- FULL ELEMENT PARSING TESTS (TO IMPLEMENT LATER) ---

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

  const expectedContent = {
    version: "1.1.0",
    component_kind: null,
    events: {
      "@post_hello": {
        kind: 1,
        content: "hello world",
        tags: [],
      },
    },
    elements: [
      {
        type: "h1",
        content: ["Hello There"],
      },
      {
        type: "form",
        event: "@post_hello",
        elements: [
          {
            type: "button",
            content: ["Say Hello"],
            attributes: {}
          },
        ],
      },
    ],
  };

  const result = compileHypernoteToContent(inputHnmd);
  expect(result).toEqual(expectedContent);
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

  const expectedContent = {
    version: "1.1.0",
    component_kind: null,
    styles: {
      "#main-title": { // Style applied via ID selector
        "text-color": "primary",
      },
      "button": {      // Style applied via element type selector
        "bg-color": "blue-500",
      }
    },
    events: {
      "@post_hello": {
        kind: 1,
        content: "hello world",
        tags: [],
      },
    },
    elements: [
      {
        type: "h1",
        id: "main-title", // ID parsed from {#main-title}
        content: ["Hello Styled"],
      },
      {
        type: "form",
        event: "@post_hello",
        elements: [
          {
            type: "button",
            content: ["Say Hello Blue"],
            attributes: {}
          },
        ],
      },
    ],
  };

  const result = compileHypernoteToContent(inputHnmd);
  expect(result).toEqual(expectedContent);
});

test("should parse form with input and use form variable in event template", () => {
  const inputHnmd = `
---
"@post_message":
  kind: 1
  content: "{form.message}" # Use variable from form input
  tags: [["client", "hypernote-test"]] 
---

# Post a Message

[form @post_message]
  [input name="message" placeholder="Enter message..."]
  [button "Post"]
`.trim();

  const expectedContent = {
    version: "1.1.0",
    component_kind: null,
    events: {
      "@post_message": { // Event template now includes the variable placeholder
        kind: 1,
        content: "{form.message}", 
        tags: [["client", "hypernote-test"]],
      },
    },
    elements: [
      {
        type: "h1",
        content: ["Post a Message"],
      },
      {
        type: "form",
        event: "@post_message",
        elements: [
          {
            type: "input", // Input element added
            content: [],
            attributes: {
              name: "message",
              placeholder: "Enter message...",
            },
          },
          {
            type: "button",
            content: ["Post"],
            attributes: {}
          },
        ],
      },
    ],
  };

  const result = compileHypernoteToContent(inputHnmd);
  expect(result).toEqual(expectedContent);
}); 