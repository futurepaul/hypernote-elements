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
    display: "flex",
    width: "100%",
    height: 50,
    "padding-top": 10,
    "margin-left": "0%",
    border: {
      width: 1,
      style: "solid",
      color: "#cccccc",
      radius: 5
    },
    "flex-direction": "column",
    spacing: 1.5,
    position: "relative",
    top: 0,
    left: "10%",
    "font-size": 16,
    "background-color": "#f0f0f0",
  };
  const result = StylePropertiesSchema.safeParse(validProps);
  expect(result.success).toBe(true);
  if (!result.success) console.log("Valid props failed:", result.error.issues);
});

test("StylePropertiesSchema - should validate new overlay system for absolute positioning", () => {
  const validProps = {
    overlay: {
      anchor: "top-left",
      offset: {
        x: 10,
        y: "5%"
      }
    },
    width: 200,
    height: 100
  };
  const result = StylePropertiesSchema.safeParse(validProps);
  expect(result.success).toBe(true);
  if (!result.success) console.log("Overlay props failed:", result.error.issues);
});

test("StylePropertiesSchema - should validate enhanced color system", () => {
  const validProps = {
    color: "#ff0000",
    "background-color": "rgba(255, 0, 0, 0.5)",
    border: {
      color: "transparent"
    }
  };
  const result = StylePropertiesSchema.safeParse(validProps);
  expect(result.success).toBe(true);
  if (!result.success) console.log("Color props failed:", result.error.issues);
});

test("StylePropertiesSchema - should validate enhanced font-weight with numeric values", () => {
  const validProps = {
    "font-weight": 700,
  };
  const result = StylePropertiesSchema.safeParse(validProps);
  expect(result.success).toBe(true);
  
  const validProps2 = {
    "font-weight": "bold",
  };
  const result2 = StylePropertiesSchema.safeParse(validProps2);
  expect(result2.success).toBe(true);
  
  if (!result.success) console.log("Font weight props failed:", result.error.issues);
});

test("StylePropertiesSchema - should validate new elevation property", () => {
  const validProps = {
    elevation: 8,
    "background-color": "#ffffff"
  };
  const result = StylePropertiesSchema.safeParse(validProps);
  expect(result.success).toBe(true);
  if (!result.success) console.log("Elevation props failed:", result.error.issues);
});

test("StylePropertiesSchema - should validate 'auto' for relevant properties", () => {
  const validProps = {
    width: "auto",
    height: "auto",
    "flex-basis": "auto",
  };
  const result = StylePropertiesSchema.safeParse(validProps);
  expect(result.success).toBe(true);
  if (!result.success) console.log("Auto props failed:", result.error.issues);
});

test("StylePropertiesSchema - should reject invalid style properties according to new schema", () => {
  const invalidCases = [
    { width: "100" },
    { height: "autoX" },
    { "padding-top": "10 %" },
    { spacing: "1.5KHz" },
    { top: "10percent" },
    { "font-size": "large" },
    { display: "inline-block" },
    { display: "block" },
    { position: "absolute" },
    { position: "fixed" },
    { "border-width": 1 },
    { color: "invalid-color" },
    { "font-weight": "700" },
    { "text-decoration": "line-through" },
    { elevation: 25 },
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
    display: "flex",
    "z-index": 10,
    color: "#333333",
    "font-family": "Arial, sans-serif",
    "font-weight": "bold",
    "line-height": 1.5,
    "text-align": "center",
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
      "font-size": 20,
      color: "#000080",
    },
    "#main-content": {
      "padding-left": 20,
      "padding-right": "10%",
      "background-color": "#ffffff",
    },
    ".card": {
      border: {
        width: 1,
        style: "solid",
        color: "#cccccc",
        radius: 8
      },
      display: "flex",
      "flex-direction": "column",
      spacing: 8,
      elevation: 2,
    },
    ":root": {
      "background-color": "#f4f4f4",
      color: "#333333",
    },
  };
  const result = safeValidateStyleSheet(validStyleSheet);
  expect(result.success).toBe(true);
  if (!result.success) console.log("Valid stylesheet failed:", result.error.issues);
});

test("StyleSheetSchema - should validate stylesheet with overlay positioning", () => {
  const validStyleSheet = {
    ".modal": {
      overlay: {
        anchor: "center",
        offset: { x: 0, y: -50 }
      },
      width: 400,
      height: 300,
      "background-color": "#ffffff",
      elevation: 16
    },
    ".tooltip": {
      overlay: {
        anchor: "top-right",
        offset: { x: "5%", y: 10 }
      },
      "font-size": 12
    }
  };
  const result = safeValidateStyleSheet(validStyleSheet);
  expect(result.success).toBe(true);
  if (!result.success) console.log("Overlay stylesheet failed:", result.error.issues);
});

test("StyleSheetSchema - should validate standard properties in :root", () => {
  const validStyleSheet = {
    ":root": {
      "background-color": "#f0f0f0", 
      color: "#333333",
      "padding-top": 10,
      "font-size": 16 
    },
    h1: {
      color: "#0000ff",
      "font-size": 24,
      "font-weight": 700
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
    "h1": { color: "#0000ff" },
    "my-custom-element": { "font-size": 12 },
    "#main-content": { "padding-top": 10 },
    "#_private-id": { "margin-left": "5%" },
    "#id-with-hyphens_and_numbers123": { 
      border: { width: 1, color: "#008000" }
    },
    ".card": { "background-color": "#ffffff" },
    "._user-profile-card": { 
      border: { radius: 4 }
    },
    ".class-with-hyphens-and-numbers123": { width: "100%" },
    ":root": { "background-color": "#eeeeee" }
  };

  for (const [selector, style] of Object.entries(validStyleSheets)) {
    const result = safeValidateStyleSheet({ [selector]: style });
    expect(result.success).toBe(true);
    if (!result.success) {
      console.log(`Selector '${selector}' was unexpectedly rejected:`, result.error.issues);
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
      "background-color": "#d3d3d3",
      "font-family": "Verdana",
      width: "100%" 
    }
  };
  const result = safeValidateStyleSheet(rootOnlyStyleSheet);
  expect(result.success).toBe(true);
  if (!result.success) console.log("Root only stylesheet failed:", result.error.issues);
});

// Test helper functions
test("validateStyleSheet - should return validated data for correct input", () => {
  const validData = {
    h1: { color: "#ff0000", "font-size": 22 },
    ".my-class": { "padding-top": 10 }, 
  };
  const validated = validateStyleSheet(validData);
  expect(validated).toEqual(validData);
});

test("validateStyleSheet - should throw for incorrect input", () => {
  const invalidData = {
    h1: { "font-size": "22inches" },
  };
  expect(() => validateStyleSheet(invalidData)).toThrow();
});

test("safeValidateStyleSheet - should return success true for correct input", () => {
  const validData = {
    p: { "font-size": 12 }, 
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