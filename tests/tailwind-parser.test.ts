import { describe, test, expect } from "bun:test";
import { parseTailwindClasses } from "../src/lib/tailwind-parser";
import { compileHypernoteToContent } from "../src/lib/compiler";
import fs from "fs";
import path from "path";

describe("Tailwind Parser", () => {
  test("parses basic spacing classes", () => {
    const result = parseTailwindClasses("p-4 m-2");
    expect(result).toEqual({
      padding: "1rem",
      margin: "0.5rem"
    });
  });

  test("parses color classes", () => {
    const result = parseTailwindClasses("text-blue-500 bg-gray-100");
    expect(result).toEqual({
      color: "rgb(59,130,246)",
      backgroundColor: "rgb(243,244,246)"
    });
  });

  test("parses flexbox classes", () => {
    const result = parseTailwindClasses("flex justify-center items-center gap-4");
    expect(result).toEqual({
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      gap: "1rem"
    });
  });

  test("parses border classes", () => {
    const result = parseTailwindClasses("border-4 border-amber-900 rounded");
    expect(result).toEqual({
      borderWidth: "4px",
      borderColor: "rgb(120,53,15)",
      borderRadius: "0.25rem"
    });
  });

  test("parses width and height classes", () => {
    const result = parseTailwindClasses("w-16 h-16");
    expect(result).toEqual({
      width: "4rem",
      height: "4rem"
    });
  });

  test("parses font classes", () => {
    const result = parseTailwindClasses("text-4xl font-bold");
    expect(result).toEqual({
      fontSize: "2.25rem",
      fontWeight: 700
    });
  });

  test("handles unknown classes gracefully", () => {
    const result = parseTailwindClasses("unknown-class hover:text-blue-500");
    expect(result).toBeNull();
  });

  test("returns null for empty string", () => {
    const result = parseTailwindClasses("");
    expect(result).toBeNull();
  });
});

describe("Example Style Validation", () => {
  const examplesDir = path.join(__dirname, "..", "examples");
  
  // Get all .md files in examples directory
  const examples = fs.readdirSync(examplesDir)
    .filter(file => file.endsWith(".md"))
    .map(file => file.replace(".md", ""));

  for (const example of examples) {
    test(`compiles styles from ${example}.md without errors`, () => {
      const mdPath = path.join(examplesDir, `${example}.md`);
      const mdContent = fs.readFileSync(mdPath, "utf-8");
      
      // This should not throw
      const result = compileHypernoteToContent(mdContent);
      
      // Check that it's valid
      expect(result).toBeDefined();
      expect(result.version).toBe("1.1.0");
      
      // Count how many elements have styles
      let styleCount = 0;
      function countStyles(obj: any) {
        if (obj && typeof obj === "object") {
          if (obj.style) styleCount++;
          if (obj.elements) {
            for (const el of obj.elements) {
              countStyles(el);
            }
          }
          if (obj.content && Array.isArray(obj.content)) {
            for (const item of obj.content) {
              if (typeof item === "object") {
                countStyles(item);
              }
            }
          }
        }
      }
      
      countStyles(result);
      console.log(`  ${example}: ${styleCount} styled elements`);
    });
  }
});

describe("Chess Example Performance", () => {
  test("compiles chess example quickly with validation skipped", () => {
    const chessMd = fs.readFileSync(path.join(__dirname, "..", "examples", "chess.md"), "utf-8");
    
    // Skip validation for performance test
    process.env.SKIP_VALIDATION = 'true';
    
    const start = performance.now();
    const result = compileHypernoteToContent(chessMd);
    const end = performance.now();
    
    // Re-enable validation
    delete process.env.SKIP_VALIDATION;
    
    const time = end - start;
    console.log(`  Chess compilation time (no validation): ${time.toFixed(2)}ms`);
    
    // Should be much faster without validation
    expect(time).toBeLessThan(100);
    
    // Verify it compiled correctly
    expect(result).toBeDefined();
    expect(result.version).toBe("1.1.0");
  });
  
  test("compiles chess example with validation", () => {
    const chessMd = fs.readFileSync(path.join(__dirname, "..", "examples", "chess.md"), "utf-8");
    
    const start = performance.now();
    const result = compileHypernoteToContent(chessMd);
    const end = performance.now();
    
    const time = end - start;
    console.log(`  Chess compilation time (with validation): ${time.toFixed(2)}ms`);
    
    // With validation it's slower but still acceptable
    expect(time).toBeLessThan(1500);
    
    // Verify it compiled correctly
    expect(result).toBeDefined();
    expect(result.version).toBe("1.1.0");
  });
});