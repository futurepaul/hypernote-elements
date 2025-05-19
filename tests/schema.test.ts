import { test, expect } from "bun:test";
import { validateHypernote, safeValidateHypernote, generateJsonSchema } from '../src/lib/schema';

// Example Hypernote document based on OUTPUT.md example
const validHypernoteExample = {
  version: "1.1.0",
  component_kind: null,
  
  imports: {
    profile_card: "naddr1...",
    note_display: "nevent1..."
  },
  
  styles: {
    h1: { "font-weight": "bold", "text-size": "2xl" },
    button: { "bg-color": "primary", "text-color": "white", "rounded": "md" },
    p: { "text-color": "neutral-700" },
    "#header-title": { "text-color": "primary" },
    ":root": { "bg-color": "neutral-100" }
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
      id: "header-title",
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
          id: "special-text",
          content: ["important"]
        },
        "."
      ]
    },
    {
      type: "component",
      alias: "profile_card",
      argument: "npub1...",
      id: "profile-display"
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
      target: "#profile-display",
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
          content: ["Send Reply"]
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
  // Test with deeply nested content structure
  const nestedContentExample = {
    version: "1.1.0",
    elements: [
      {
        type: "div",
        content: [
          "Outer text ",
          {
            type: "span",
            content: [
              "Inner text ",
              {
                type: "em",
                content: ["emphasized"]
              },
              " more inner text"
            ]
          },
          " more outer text"
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
  // Test with various style selectors and properties
  const stylesExample = {
    version: "1.1.0",
    styles: {
      // Element selector
      "button": {
        "bg-color": "blue-500",
        "text-color": "white"
      },
      // ID selector
      "#header": {
        "font-weight": "bold",
        "text-size": "xl"
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

test("should generate valid JSON Schema", () => {
  // Generate the JSON schema
  const jsonSchema = generateJsonSchema();
  
  // Basic checks to verify the schema structure
  expect(jsonSchema).toBeDefined();
  expect(typeof jsonSchema).toBe("object");
  expect(jsonSchema).not.toBeNull();
  
  // Check for required properties in the schema
  expect(jsonSchema).toHaveProperty("type", "object");
  expect(jsonSchema).toHaveProperty("properties");
  expect(jsonSchema.properties).toHaveProperty("version");
  expect(jsonSchema.properties).toHaveProperty("elements");
  
  // Check that the required fields are marked as such
  expect(jsonSchema).toHaveProperty("required");
  expect(jsonSchema.required).toContain("version");
  expect(jsonSchema.required).toContain("elements");
});