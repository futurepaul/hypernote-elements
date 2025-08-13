import { compileHypernoteToContent } from "./src/lib/compiler";
import chessMd from "./examples/chess.md";
import * as yaml from 'js-yaml';

// Enable profiling mode via environment variable
process.env.HYPERNOTE_PROFILE = 'true';

// Store timing data
const timings: { phase: string; time: number }[] = [];
let lastTime = performance.now();

// Monkey-patch console to capture timing logs
const originalLog = console.log;
console.log = (...args: any[]) => {
  if (args[0]?.startsWith('[PROFILE]')) {
    const now = performance.now();
    const phase = args[0].replace('[PROFILE] ', '');
    timings.push({ phase, time: now - lastTime });
    lastTime = now;
  } else if (!args[0]?.startsWith('[HYPERNOTE DEBUG]')) {
    originalLog.apply(console, args);
  }
};

// Profile chess compilation
console.log("=== Profiling Chess Compilation ===\n");

// Analyze the markdown structure first
const parts = chessMd.split('---');
const frontmatterContent = parts[1] || '';
const content = parts[2] || '';

// Parse frontmatter
const frontmatter = yaml.load(frontmatterContent) as Record<string, any>;
const queries = Object.keys(frontmatter).filter(k => k.startsWith('$'));
const events = Object.keys(frontmatter).filter(k => k.startsWith('@'));

console.log("Document structure:");
console.log(`  Queries: ${queries.length} (${queries.join(', ')})`);
console.log(`  Events: ${events.length} (${events.join(', ')})`);
console.log(`  Content length: ${content.length} chars`);

// Count conditionals and loops in the content
const ifMatches = content.match(/\[if /g);
const eachMatches = content.match(/\[each /g);
const divMatches = content.match(/\[div /g);

console.log("\nContent elements:");
console.log(`  Conditionals: ${ifMatches?.length || 0}`);
console.log(`  Loops: ${eachMatches?.length || 0}`);
console.log(`  Divs: ${divMatches?.length || 0}`);

// Run the actual compilation with timing
console.log("\n=== Running Compilation ===");
lastTime = performance.now();
const start = performance.now();
const result = compileHypernoteToContent(chessMd);
const end = performance.now();

const totalTime = end - start;
console.log(`\nTotal compilation time: ${totalTime.toFixed(2)}ms`);
console.log(`Output size: ${JSON.stringify(result).length} chars`);

// Count actual elements recursively
let totalElements = 0;
function countElements(obj: any): void {
  if (Array.isArray(obj)) {
    totalElements += obj.length;
    obj.forEach(countElements);
  } else if (obj && typeof obj === 'object') {
    if (obj.elements) {
      countElements(obj.elements);
    }
    if (obj.content && Array.isArray(obj.content)) {
      countElements(obj.content);
    }
  }
}
countElements(result.elements);

console.log(`Total elements in output: ${totalElements}`);

// Display timing breakdown if we captured any
if (timings.length > 0) {
  console.log("\n=== Phase Timing Breakdown ===");
  let cumulative = 0;
  for (const { phase, time } of timings) {
    cumulative += time;
    const percent = (time / totalTime * 100).toFixed(1);
    console.log(`${phase}: ${time.toFixed(2)}ms (${percent}%)`);
  }
  console.log(`\nAccounted for: ${cumulative.toFixed(2)}ms of ${totalTime.toFixed(2)}ms`);
}