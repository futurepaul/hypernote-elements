import { test, expect } from "bun:test";
import { validateHypernote, safeValidateHypernote } from '../src/lib/schema';

// Example Hypernote document based on OUTPUT.md example
const validHypernoteExample = {
  version: "1.1.0",
  component_kind: null,
  
  imports: {
    profile_card: "naddr1...",
    note_display: "nevent1..."
  },
  
  styles: {
    h1: { 
      "font-weight": "bold", 
      "font-size": 24
    },
    button: { 
      "background-color": "#3b82f6",
      color: "#ffffff",
      border: {
        radius: 8
      }
    },
    p: { 
      color: "#374151"
    },
    "#header-title": { 
      color: "#3b82f6"
    },
    ":root": { 
      "background-color": "#f5f5f5"
    }
  },
  
  queries: {
    "$following_feed": {
      pipe: [
        {
          kinds: [3],
          authors: ["{user.pubkey}"],
          limit: 1
        },
        {
          extract: ".tags[] | select(.[0] == \"p\") | .[1]",
          as: "$follows"
        },
        {
          kinds: [1],
          authors: "$follows",
          limit: 20,
          since: "{time.now - 86400000}"
        }
      ]
    },
    "$user_profile": {
      kinds: [0],
      authors: ["{target.pubkey}"],
      limit: 1
    }
  },
  
  events: {
    "@post_comment": {
      kind: 1,
      content: "{form.message}",
      tags: [
        ["e", "{target.id}"],
        ["p", "{target.pubkey}"]
      ]
    }
  },
  
  elements: [
    {
      type: "h1",
      elementId: "header-title",
      content: ["This is a header"]
    },
    {
      type: "p",
      content: ["Just some plain text here.", "\n", "With a line break."]
    },
    {
      type: "p",
      content: [
        "Some paragraph with an explicitly ID'd span: ",
        {
          type: "em",
          elementId: "special-text",
          content: ["important"]
        },
        "."
      ]
    },
    {
      type: "component",
      alias: "profile_card",
      argument: "npub1...",
      elementId: "profile-display"
    },
    {
      type: "if",
      condition: "target.picture",
      elements: [
        {
          type: "img",
          attributes: {
            src: "{target.picture}",
            alt: "Profile picture"
          }
        }
      ]
    },
    {
      type: "loop",
      source: "$following_feed",
      variable: "note",
      elements: [
        {
          type: "h2",
          content: ["{note.pubkey}"]
        },
        {
          type: "p",
          content: ["{note.content}"]
        },
        {
          type: "component",
          alias: "note_display",
          argument: "{note.id}"
        }
      ]
    },
    {
      type: "form",
      event: "@post_comment",
      target: "profile-display",
      elements: [
        {
          type: "textarea",
          attributes: {
            name: "message",
            placeholder: "Type your reply..."
          }
        },
        {
          type: "button",
          elements: [
            {
              type: "p",
              content: ["Send Reply"]
            }
          ]
        }
      ]
    }
  ]
};

test("should validate a correct Hypernote document", () => {
  // Test the direct validation method
  expect(() => validateHypernote(validHypernoteExample)).not.toThrow();
  
  // Test the safe validation method
  const result = safeValidateHypernote(validHypernoteExample);
  expect(result.success).toBe(true);
  // We don't check equality because Zod can transform the data slightly
  // Just checking that validation succeeds is sufficient for this test
});

test("should reject an invalid Hypernote document", () => {
  // Missing required "elements" field
  const invalidExample = {
    version: "1.1.0"
    // No elements array
  };
  
  // Test the direct validation method
  expect(() => validateHypernote(invalidExample)).toThrow();
  
  // Test the safe validation method
  const result = safeValidateHypernote(invalidExample);
  expect(result.success).toBe(false);
});

test("should validate component-specific fields", () => {
  // A valid component definition
  const componentExample = {
    ...validHypernoteExample,
    component_kind: 0, // Expects npub input
  };
  
  expect(() => validateHypernote(componentExample)).not.toThrow();
  const result = safeValidateHypernote(componentExample);
  expect(result.success).toBe(true);
});

test("should properly check content structure", () => {
  // Example with invalid content structure (not an array)
  const invalidContentExample = {
    ...validHypernoteExample,
    elements: [
      {
        type: "p",
        // This should be an array, not a string
        content: "This is not an array" 
      }
    ]
  };
  
  expect(() => validateHypernote(invalidContentExample)).toThrow();
  const result = safeValidateHypernote(invalidContentExample);
  expect(result.success).toBe(false);
});

test("should validate nested elements in content", () => {
  // Test with div container and nested paragraphs
  const nestedContentExample = {
    version: "1.1.0",
    elements: [
      {
        type: "div",
        elements: [
          {
            type: "p",
            content: [
              "Outer text with some content."
            ]
          },
          {
            type: "p",
            content: [
              "Another paragraph with ",
              {
                type: "em",
                content: ["emphasized text"]
              },
              " in the content."
            ]
          }
        ]
      }
    ]
  };
  
  expect(() => validateHypernote(nestedContentExample)).not.toThrow();
  const result = safeValidateHypernote(nestedContentExample);
  expect(result.success).toBe(true);
});

test("should validate query structure", () => {
  // Test with different query formats
  const queryExample = {
    version: "1.1.0",
    queries: {
      // Simple query
      "$simple_query": {
        kinds: [1],
        authors: ["{user.pubkey}"],
        limit: 10
      },
      // Pipeline query
      "$pipeline_query": {
        pipe: [
          {
            kinds: [0],
            authors: ["{target.pubkey}"]
          },
          {
            extract: ".tags[] | select(.[0] == \"i\") | .[1]",
            as: "$image_urls"
          }
        ]
      },
      // Query with array or string authors
      "$authors_formats": {
        kinds: [0],
        authors: "{user.friends}" // String format
      }
    },
    elements: [{type: "div", content: ["Test"]}]
  };
  
  expect(() => validateHypernote(queryExample)).not.toThrow();
  const result = safeValidateHypernote(queryExample);
  expect(result.success).toBe(true);
});

test("should validate styles structure", () => {
  // Test with various style selectors and properties using valid CSS properties
  const stylesExample = {
    version: "1.1.0",
    styles: {
      // Element selector
      "button": {
        "background-color": "#3b82f6",
        color: "#ffffff"
      },
      // ID selector
      "#header": {
        "font-weight": "bold",
        "font-size": 20
      },
      // Root selector
      ":root": {
        "font-family": "sans-serif"
      }
    },
    elements: [{type: "div", content: ["Test"]}]
  };
  
  expect(() => validateHypernote(stylesExample)).not.toThrow();
  const result = safeValidateHypernote(stylesExample);
  expect(result.success).toBe(true);
});

test("should validate event template structure", () => {
  // Test with various event templates
  const eventsExample = {
    version: "1.1.0",
    events: {
      "@post_message": {
        kind: 1,
        content: "{form.message}",
        tags: [["p", "{target.pubkey}"]]
      },
      "@like_note": {
        kind: 7,
        content: "+",
        tags: [
          ["e", "{target.id}"],
          ["p", "{target.pubkey}"]
        ]
      }
    },
    elements: [{type: "div", content: ["Test"]}]
  };
  
  expect(() => validateHypernote(eventsExample)).not.toThrow();
  const result = safeValidateHypernote(eventsExample);
  expect(result.success).toBe(true);
});

test("should reject unsupported HTML element types with helpful error message", () => {
  // Test with an unsupported HTML element
  const unsupportedElementExample = {
    version: "1.1.0",
    elements: [
      {
        type: "video", // This should be rejected
        content: ["Test content"],
        attributes: {
          src: "test.mp4"
        }
      }
    ]
  };
  
  // Test the safe validation method to get the error details
  const result = safeValidateHypernote(unsupportedElementExample);
  expect(result.success).toBe(false);
  
  if (!result.success) {
    // The error structure is nested, so we need to find the right error message
    // Look through all issues to find our custom error message
    const allErrorMessages = JSON.stringify(result.error.issues);
    expect(allErrorMessages).toContain("Unsupported element type");
    expect(allErrorMessages).toContain("video");
    expect(allErrorMessages).toContain("Supported types are:");
    expect(allErrorMessages).toContain("h1, h2, h3");
    expect(allErrorMessages).toContain("input, textarea");
  }
  
  // Test the direct validation method also throws
  expect(() => validateHypernote(unsupportedElementExample)).toThrow();
});