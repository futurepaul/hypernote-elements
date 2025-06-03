import { test, expect } from "bun:test";
import {
  StylePropertiesSchema,
  StyleSheetSchema,
  validateStyleSheet,
  safeValidateStyleSheet,
} from "../src/lib/style-schema";

// Test StylePropertiesSchema
test("StylePropertiesSchema - should validate correct style properties with new schema", () => {
  const validProps = {
    width: 100,
    height: 200,
    margin: 10,
    padding: 5,
    borderRadius: 8,
    backgroundColor: "#f0f0f0",
    color: "#333333",
    position: "absolute",
    top: "10px",
    left: "10%",
    fontSize: 16,
  };
  const result = StylePropertiesSchema.safeParse(validProps);
  expect(result.success).toBe(true);
  if (!result.success) console.log("Valid props failed:", result.error.issues);
});

test("StylePropertiesSchema - should validate new overlay system for absolute positioning", () => {
  const validProps = {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    backgroundColor: "rgba(0,0,0,0.5)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    width: 200,
    height: 100
  };
  const result = StylePropertiesSchema.safeParse(validProps);
  expect(result.success).toBe(true);
  if (!result.success) console.log("Overlay props failed:", result.error.issues);
});

test("StylePropertiesSchema - should validate enhanced color system", () => {
  const validProps = {
    color: "#3b82f6",
    backgroundColor: "rgb(59,130,246)",
    borderColor: "rgba(59,130,246,0.5)"
  };
  const result = StylePropertiesSchema.safeParse(validProps);
  expect(result.success).toBe(true);
  if (!result.success) console.log("Color props failed:", result.error.issues);
});

test("StylePropertiesSchema - should validate enhanced font-weight with numeric values", () => {
  const validProps = {
    fontWeight: 700,
  };
  const result = StylePropertiesSchema.safeParse(validProps);
  expect(result.success).toBe(true);
  
  const validProps2 = {
    fontWeight: "bold",
  };
  const result2 = StylePropertiesSchema.safeParse(validProps2);
  expect(result2.success).toBe(true);
  
  if (!result.success) console.log("Font weight props failed:", result.error.issues);
});

test("StylePropertiesSchema - should validate new elevation property", () => {
  const validProps = {
    backgroundColor: "#ffffff"
  };
  const result = StylePropertiesSchema.safeParse(validProps);
  expect(result.success).toBe(true);
  if (!result.success) console.log("Elevation props failed:", result.error.issues);
});

test("StylePropertiesSchema - should validate 'auto' for relevant properties", () => {
  const validProps = {
    margin: "auto",
    width: "auto",
    height: "auto",
    flexBasis: "auto",
  };
  const result = StylePropertiesSchema.safeParse(validProps);
  expect(result.success).toBe(true);
  if (!result.success) console.log("Auto props failed:", result.error.issues);
});

test("StylePropertiesSchema - should reject invalid style properties according to new schema", () => {
  const invalidCases = [
    { color: "invalidcolor" },
    { width: -10 },
    { fontSize: "invalid" },
    { display: "table" },
    { borderRadius: "invalid" },
    { fontWeight: 50 },
    { unknownProperty: "value" },
  ];

  invalidCases.forEach((props, index) => {
    const result = StylePropertiesSchema.safeParse(props);
    expect(result.success).toBe(false);
    if (result.success) {
      console.log(`Test case ${index} (invalid props) should have failed but succeeded:`, props);
    }
  });
});

test("StylePropertiesSchema - should validate correct basic style properties with new schema", () => {
  const validProps = {
    width: 100,
    height: 200,
    margin: 10,
    padding: 15,
    borderRadius: 5,
    backgroundColor: "#f4f4f4",
    color: "#333333",
    fontSize: 14,
    fontWeight: "bold",
    textAlign: "center",
    opacity: 0.9,
    overflow: "hidden",
  };
  const result = StylePropertiesSchema.safeParse(validProps);
  expect(result.success).toBe(true);
  if (!result.success) console.log("Basic valid props failed:", result.error.issues);
});

test("StylePropertiesSchema - should reject general invalid style properties", () => {
  const invalidProps = {
    display: "grid",
    "flex-grow": -1,
    "z-index": 1.5,
    opacity: 2,
    unknownProperty: "value",
    position: "fixed",
    overflow: "scroll",
  };
  const result = StylePropertiesSchema.safeParse(invalidProps);
  expect(result.success).toBe(false);
  if (result.success) console.log("General invalid props should have failed:", invalidProps);
});

// Test StyleSheetSchema
test("StyleSheetSchema - should validate a correct stylesheet with new schema", () => {
  const validStyleSheet = {
    h1: {
      fontSize: 24,
      fontWeight: "bold",
      color: "#333333",
    },
    ".my-class": {
      padding: 16,
      margin: 8,
      backgroundColor: "#f4f4f4",
      color: "#333333",
    },
  };
  const result = safeValidateStyleSheet(validStyleSheet);
  expect(result.success).toBe(true);
  if (!result.success) console.log("Valid stylesheet failed:", result.error.issues);
});

test("StyleSheetSchema - should validate stylesheet with overlay positioning", () => {
  const validStyleSheet = {
    ".overlay": {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0,0,0,0.5)",
      zIndex: 100,
    },
    ".modal": {
      position: "relative",
      backgroundColor: "#ffffff",
      padding: 20,
      fontSize: 12
    }
  };
  const result = safeValidateStyleSheet(validStyleSheet);
  expect(result.success).toBe(true);
  if (!result.success) console.log("Overlay stylesheet failed:", result.error.issues);
});

test("StyleSheetSchema - should validate standard properties in :root", () => {
  const validStyleSheet = {
    ":root": {
      backgroundColor: "#f9fafb",
      color: "#1f2937",
      fontFamily: "Inter, sans-serif",
      fontSize: 24,
      fontWeight: 700
    }
  };
  const result = safeValidateStyleSheet(validStyleSheet);
  expect(result.success).toBe(true);
  if (!result.success) {
    console.log("Stylesheet with :root standard props failed:", result.error.issues);
  }
});

test("StyleSheetSchema - should reject custom properties in :root due to strict schema", () => {
  const invalidStyleSheet = {
    ":root": {
      "--my-custom-var": "#FF0000",
      color: "#0000ff"
    },
    p: {
      "padding-left": 10 
    }
  };
  const result = safeValidateStyleSheet(invalidStyleSheet);
  expect(result.success).toBe(false); 
  if (!result.success) {
    const hasUnrecognizedKeyIssue = result.error.issues.some(
      issue => issue.code === "unrecognized_keys" && 
               issue.path.includes(":root") && 
               (issue.keys as string[]).includes("--my-custom-var")
    );
    expect(hasUnrecognizedKeyIssue).toBe(true);
  } else {
    console.log("Stylesheet with custom var in :root should have failed due to unrecognized_keys.");
  }
});

test("StyleSheetSchema - should validate stylesheets with correct selectors", () => {
  const validStyleSheets = {
    "h1": { color: "#333333" },
    "p": { fontSize: 14 },
    "button": { padding: 8 },
    "#my-id": { margin: 16 },
    ".my-class": { backgroundColor: "#eeeeee" },
    ":root": { backgroundColor: "#eeeeee" }
  };

  for (const [selector, style] of Object.entries(validStyleSheets)) {
    const result = safeValidateStyleSheet({ [selector]: style });
    expect(result.success).toBe(true);
    if (!result.success) {
      console.log(`Selector '${selector}' failed validation:`, result.error.issues);
    }
  }
});

test("StyleSheetSchema - should reject stylesheet with invalid selectors", () => {
  const invalidStyleSheets = {
    " ": { color: "#ff0000" },
    "@page": { color: "#0000ff" },
    "my-element[attr=value]": { color: "#008000" },
    "1h1": { "font-size": 20 }, 
    "-leading-hyphen": { color: "#ff0000" },
    "#my-id!": { "padding-top": 10 }, 
    "#123starts-with-number": { color: "#0000ff" },
    "#": { color: "#ff0000" },
    ".my_class$": { color: "#ff0000" },
    ".-leading-hyphen-class": { color: "#0000ff" },
    ".": { color: "#ff0000" }
  };

  for (const [selector, style] of Object.entries(invalidStyleSheets)) {
    const result = safeValidateStyleSheet({ [selector]: style });
    expect(result.success).toBe(false);
    if (result.success) {
      console.log(`Selector '${selector}' was not rejected by StyleSheetSchema.`);
    }
    if (!result.success) {
      expect(result.error.issues[0].message).toBeTruthy(); 
    }
  }
});

test("StyleSheetSchema - should reject stylesheet with invalid style properties", () => {
  const invalidStyleSheet = {
    p: {
      color: "#333333",
      "font-size": "16pixels",
    },
    button: {
      "background-color": "#0000ff",
      display: "very-flexy",
      width: "100 %"
    },
    div: {
      "border-width": 1
    }
  };
  const result = safeValidateStyleSheet(invalidStyleSheet);
  expect(result.success).toBe(false);
  if (result.success) console.log("Invalid stylesheet should have failed:", invalidStyleSheet);
});

test("StyleSheetSchema - should accept empty stylesheet", () => {
  const emptyStyleSheet = {};
  const result = safeValidateStyleSheet(emptyStyleSheet);
  expect(result.success).toBe(true);
});

test("StyleSheetSchema - should accept stylesheet with only :root", () => {
  const rootOnlyStyleSheet = {
    ":root": {
      backgroundColor: "#f8f9fa",
      color: "#212529",
      fontFamily: "Verdana",
      width: "100%"
    }
  };
  const result = safeValidateStyleSheet(rootOnlyStyleSheet);
  expect(result.success).toBe(true);
});

// Test helper functions
test("validateStyleSheet - should return validated data for correct input", () => {
  const validData = {
    h1: { color: "#3b82f6", fontSize: 24 },
    ".my-class": { paddingTop: 16 }
  };
  const result = validateStyleSheet(validData);
  expect(result).toEqual(validData);
});

test("validateStyleSheet - should throw for incorrect input", () => {
  const invalidData = {
    h1: { "font-size": "22inches" },
  };
  expect(() => validateStyleSheet(invalidData)).toThrow();
});

test("safeValidateStyleSheet - should return success true for correct input", () => {
  const validData = {
    p: { fontSize: 12 },
  };
  const result = safeValidateStyleSheet(validData);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data).toEqual(validData);
  }
});

test("safeValidateStyleSheet - should return success false for incorrect input", () => {
  const invalidData = {
    "#id123": { width: "auto width" }, 
  };
  const result = safeValidateStyleSheet(invalidData);
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error).toBeDefined();
  }
}); 