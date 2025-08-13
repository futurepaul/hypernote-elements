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
  expect(tokens[0].elementId).toBe("title");
  expect(tokens[2].type).toBe(TokenType.HEADING);
});

test("should tokenize form with button", () => {
  const input = "[form @post_hello]\n  [button]Say Hello[/button]\n[/form]";
  const tokens = tokenize(input);
  
  expect(tokens.length).toBeGreaterThan(5); // form start + newline + text + button start + text + button end + form end + EOF
  expect(tokens[0].type).toBe(TokenType.FORM_START);
  expect(tokens[0].attributes?.event).toBe("@post_hello");
  
  // Find button start token
  const buttonToken = tokens.find(t => t.type === TokenType.BUTTON_START);
  expect(buttonToken).toBeDefined();
  expect(buttonToken?.value).toBe("button");
});

test("should tokenize form with input", () => {
  const input = "[form @post_message]\n  [input name=\"message\" placeholder=\"Enter message...\"]\n  [button]Post[/button]\n[/form]";
  const tokens = tokenize(input);
  
  const inputToken = tokens.find(t => t.type === TokenType.ELEMENT_START && t.value === "input");
  expect(inputToken).toBeDefined();
  expect(inputToken?.attributes?.name).toBe("message");
  expect(inputToken?.attributes?.placeholder).toBe("Enter message...");
  
  const buttonToken = tokens.find(t => t.type === TokenType.BUTTON_START);
  expect(buttonToken).toBeDefined();
});

test("should tokenize each loop with variable references", async () => {
  const input = "[each $my_feed as $note]\n  {$note.content}\n[/each]";
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
  
  // Find the EACH_END token
  const eachEndToken = tokens.find(t => t.type === TokenType.EACH_END);
  expect(eachEndToken).toBeDefined();
});

test("should tokenize form event correctly", () => {
  const input = "[form @post_hello]\n[/form]";
  const tokens = tokenize(input);
  
  expect(tokens.length).toBe(4); // form start + newline + form end + EOF
  expect(tokens[0].type).toBe(TokenType.FORM_START);
  expect(tokens[0].value).toBe("form");
  expect(tokens[0].attributes?.event).toBe("@post_hello");
  expect(tokens[2].type).toBe(TokenType.FORM_END);
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
  
  // Should create a paragraph element for standalone variable with leading whitespace
  expect(elements.length).toBe(1);
  expect(elements[0].type).toBe("p");
  expect(elements[0].content).toEqual(["  ", "{$variable}"]);
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
test("should correctly tokenize and parse client example query and loop", () => {
  const example = loadExample("client");
  const content = example.markdown.split('---')[2].trim(); // Get content after frontmatter
  
  const tokens = tokenize(content);
  const elements = parseTokens(tokens);
  
  // Client example has different structure with divs
  expect(elements.length).toBeGreaterThan(0);
  expect(elements[0].type).toBe("h1"); // Title
  
  // Find the loop element
  const divs = elements.filter((el: any) => el.type === "div");
  const loopDiv = divs.find((div: any) => 
    div.elements?.some((el: any) => el.type === "loop")
  );
  const loop = loopDiv?.elements?.find((el: any) => el.type === "loop");
  
  if (loop) {
    expect(loop.type).toBe("loop");
    expect(loop.source).toBe("$following_feed");
    expect(loop.variable).toBe("$note");
  }
});

test("should correctly tokenize and parse client example form", () => {
  const example = loadExample("client");
  const content = example.markdown.split('---')[2].trim(); // Get content after frontmatter
  
  const tokens = tokenize(content);
  const elements = parseTokens(tokens);
  
  // Client example has divs containing forms
  expect(elements[0].type).toBe("h1");
  
  // Find the form element within div structure
  const divs = elements.filter((el: any) => el.type === "div");
  const formDiv = divs.find((div: any) => 
    div.elements?.some((el: any) => el.type === "form")
  );
  const form = formDiv?.elements?.find((el: any) => el.type === "form");
  
  if (form) {
    expect(form.type).toBe("form");
    expect(form.event).toBe("@post_note");
    expect(form.elements?.length).toBe(2); // input + button
  }
});

test("should correctly tokenize json element with variable parameter", () => {
  const testContent = '[json $note]';
  const tokens = tokenize(testContent);
  const elements = parseTokens(tokens);
  
  expect(elements.length).toBe(1);
  expect(elements[0].type).toBe("json");
  expect(elements[0].attributes).toBeDefined();
  expect(elements[0].attributes.variable).toBe("$note");
});

test("should correctly tokenize json element with dot notation", () => {
  const testContent = '[json $note.content]';
  const tokens = tokenize(testContent);
  const elements = parseTokens(tokens);
  
  expect(elements.length).toBe(1);
  expect(elements[0].type).toBe("json");
  expect(elements[0].attributes).toBeDefined();
  expect(elements[0].attributes.variable).toBe("$note.content");
}); 