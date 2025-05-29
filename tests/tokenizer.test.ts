import { test, expect } from "bun:test";
import { tokenize, parseTokens, TokenType } from "../src/lib/tokenizer";
import { loadExample } from "./example-loader";

// Test specific tokenization features
test("should tokenize basic heading", () => {
  const input = "# Hello World";
  const tokens = tokenize(input);
  
  expect(tokens.length).toBeGreaterThan(1); // At least one token + EOF
  expect(tokens[0].type).toBe(TokenType.HEADING);
  expect(tokens[0].value).toBe("Hello World");
  expect(tokens[0].level).toBe(1);
});

test("should tokenize heading with ID", () => {
  const input = "{#title}\n# Hello World";
  const tokens = tokenize(input);
  
  expect(tokens.length).toBeGreaterThan(2); // ID + heading + EOF
  expect(tokens[0].type).toBe(TokenType.ID_MARKER);
  expect(tokens[0].id).toBe("title");
  expect(tokens[2].type).toBe(TokenType.HEADING);
});

test("should tokenize form with button", () => {
  const input = "[form @post_hello]\n  [button \"Say Hello\"]";
  const tokens = tokenize(input);
  
  expect(tokens.length).toBeGreaterThan(3); // form + newline + text + button + EOF
  expect(tokens[0].type).toBe(TokenType.FORM_START);
  expect(tokens[0].attributes?.event).toBe("@post_hello");
  expect(tokens[3].type).toBe(TokenType.ELEMENT_START); // Button is at index 3, not 2
  expect(tokens[3].value).toBe("button");
  expect(tokens[3].attributes?.content).toBe("Say Hello");
});

test("should tokenize form with input", () => {
  const input = "[form @post_message]\n  [input name=\"message\" placeholder=\"Enter message...\"]\n  [button \"Post\"]";
  const tokens = tokenize(input);
  
  const inputToken = tokens.find(t => t.type === TokenType.ELEMENT_START && t.value === "input");
  expect(inputToken).toBeDefined();
  expect(inputToken?.attributes?.name).toBe("message");
  expect(inputToken?.attributes?.placeholder).toBe("Enter message...");
});

test("should tokenize each loop with variable references", async () => {
  const input = "[each $my_feed as $note]\n  {$note.content}";
  const tokens = tokenize(input);
  
  // Find the EACH_START token
  const eachToken = tokens.find(t => t.type === TokenType.EACH_START);
  expect(eachToken).toBeDefined();
  expect(eachToken?.attributes?.source).toBe("$my_feed");
  expect(eachToken?.attributes?.variable).toBe("$note");
  
  // Find the VARIABLE_REFERENCE token
  const varToken = tokens.find(t => t.type === TokenType.VARIABLE_REFERENCE);
  expect(varToken).toBeDefined();
  expect(varToken?.value).toBe("{$note.content}");
});

test("should tokenize form event correctly", () => {
  const input = "[form @post_hello]";
  const tokens = tokenize(input);
  
  expect(tokens.length).toBe(2); // form token + EOF
  expect(tokens[0].type).toBe(TokenType.FORM_START);
  expect(tokens[0].value).toBe("form");
  expect(tokens[0].attributes?.event).toBe("@post_hello");
});

test("should handle multiple heading levels", () => {
  const input = "# H1\n## H2\n### H3";
  const tokens = tokenize(input);
  const elements = parseTokens(tokens);
  
  expect(elements.length).toBe(3);
  expect(elements[0].type).toBe("h1");
  expect(elements[0].content).toEqual(["H1"]);
  expect(elements[1].type).toBe("h2");
  expect(elements[1].content).toEqual(["H2"]);
  expect(elements[2].type).toBe("h3");
  expect(elements[2].content).toEqual(["H3"]);
});

test("should handle variable reference with leading whitespace", () => {
  const input = "  {$variable}";
  const tokens = tokenize(input);
  const elements = parseTokens(tokens);
  
  // Should create a span element for standalone variable even with leading whitespace
  expect(elements.length).toBe(1);
  expect(elements[0].type).toBe("span");
  expect(elements[0].content).toEqual(["{$variable}"]);
});

test("should handle variable reference within text content", () => {
  const input = "Hello {$name}, welcome!";
  const tokens = tokenize(input);
  const elements = parseTokens(tokens);
  
  // Should create a paragraph with mixed content
  expect(elements.length).toBe(1);
  expect(elements[0].type).toBe("p");
  expect(elements[0].content).toEqual(["Hello ", "{$name}", ", welcome!"]);
});

// Test with real examples
test("should correctly tokenize and parse query-and-loop example", () => {
  const example = loadExample("query-and-loop");
  const content = example.markdown.split('---')[2].trim(); // Get content after frontmatter
  
  const tokens = tokenize(content);
  const elements = parseTokens(tokens);
  
  expect(elements.length).toBe(1);
  expect(elements[0].type).toBe("loop");
  expect(elements[0].source).toBe("$my_feed");
  expect(elements[0].variable).toBe("$note");
  expect(elements[0].elements?.length).toBe(1);
  expect(elements[0].elements?.[0].type).toBe("span");
});

test("should correctly tokenize and parse form-with-input example", () => {
  const example = loadExample("form-with-input");
  const content = example.markdown.split('---')[2].trim(); // Get content after frontmatter
  
  const tokens = tokenize(content);
  const elements = parseTokens(tokens);
  
  expect(elements.length).toBe(2); // heading + form
  expect(elements[0].type).toBe("h1");
  expect(elements[1].type).toBe("form");
  expect(elements[1].event).toBe("@post_message");
  expect(elements[1].elements?.length).toBe(2); // input + button
}); 