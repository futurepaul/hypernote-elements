import { test, expect } from "bun:test";
import { tokenize, parseTokens, TokenType } from "../src/lib/tokenizer";

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
  
  expect(tokens.length).toBeGreaterThan(3); // form + newline + button + EOF
  expect(tokens[0].type).toBe(TokenType.FORM_START);
  expect(tokens[0].attributes?.event).toBe("@post_hello");
  expect(tokens[2].type).toBe(TokenType.ELEMENT_START);
  expect(tokens[2].value).toBe("button");
  expect(tokens[2].attributes?.content).toBe("Say Hello");
});

test("should tokenize form with input", () => {
  const input = "[form @post_message]\n  [input name=\"message\" placeholder=\"Enter message...\"]\n  [button \"Post\"]";
  const tokens = tokenize(input);
  
  const inputToken = tokens.find(t => t.type === TokenType.ELEMENT_START && t.value === "input");
  expect(inputToken).toBeDefined();
  expect(inputToken?.attributes?.name).toBe("message");
  expect(inputToken?.attributes?.placeholder).toBe("Enter message...");
});

test("should parse heading into element", () => {
  const tokens = [
    { type: TokenType.HEADING, value: "Hello World", level: 1 },
    { type: TokenType.EOF, value: "" }
  ];
  
  const elements = parseTokens(tokens);
  expect(elements.length).toBe(1);
  expect(elements[0].type).toBe("h1");
  expect(elements[0].content).toEqual(["Hello World"]);
});

test("should parse heading with ID", () => {
  const tokens = [
    { type: TokenType.ID_MARKER, value: "title", id: "title" },
    { type: TokenType.HEADING, value: "Hello World", level: 1 },
    { type: TokenType.EOF, value: "" }
  ];
  
  const elements = parseTokens(tokens);
  expect(elements.length).toBe(1);
  expect(elements[0].type).toBe("h1");
  expect(elements[0].id).toBe("title");
});

test("should parse form with button", () => {
  const tokens = [
    { type: TokenType.FORM_START, value: "form", attributes: { event: "@post_hello" } },
    { type: TokenType.NEWLINE, value: "\n" },
    { type: TokenType.ELEMENT_START, value: "button", attributes: { content: "Say Hello" } },
    { type: TokenType.EOF, value: "" }
  ];
  
  const elements = parseTokens(tokens);
  expect(elements.length).toBe(1);
  expect(elements[0].type).toBe("form");
  expect(elements[0].event).toBe("@post_hello");
  expect(elements[0].elements.length).toBe(1);
  expect(elements[0].elements[0].type).toBe("button");
  expect(elements[0].elements[0].content).toEqual(["Say Hello"]);
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
  expect(varToken?.value).toBe("$note.content");
}); 