import { compileHypernoteToContent } from "./src/lib/compiler";
import chessMd from "./examples/chess.md";
import counterMd from "./examples/counter.md";
import basicHelloMd from "./examples/basic-hello.md";
import clientMd from "./examples/client.md";

function benchmark(name: string, markdown: string) {
  console.log(`\n=== Benchmarking ${name} ===`);
  
  const start = performance.now();
  const result = compileHypernoteToContent(markdown);
  const end = performance.now();
  
  const time = end - start;
  const size = JSON.stringify(result).length;
  
  console.log(`Time: ${time.toFixed(2)}ms`);
  console.log(`Output size: ${size} chars`);
  console.log(`Elements: ${result.elements?.length || 0}`);
  
  // Count total elements recursively
  let totalElements = 0;
  function countElements(elements: any[]) {
    if (!elements) return;
    totalElements += elements.length;
    for (const el of elements) {
      if (el.elements) countElements(el.elements);
    }
  }
  countElements(result.elements || []);
  console.log(`Total elements (nested): ${totalElements}`);
  
  return { name, time, size, elements: totalElements };
}

console.log("Starting Hypernote Compiler Benchmarks");
console.log("======================================");

const results = [
  benchmark("basic-hello", basicHelloMd),
  benchmark("counter", counterMd),
  benchmark("client", clientMd),
  benchmark("chess", chessMd),
];

console.log("\n=== Summary ===");
console.log("Name\t\tTime (ms)\tSize (chars)\tElements");
for (const r of results) {
  console.log(`${r.name}\t${r.time.toFixed(2)}\t\t${r.size}\t\t${r.elements}`);
}

// Calculate relative slowdown
const baseTime = results[0].time;
console.log("\n=== Relative Slowdown ===");
for (const r of results) {
  const slowdown = r.time / baseTime;
  console.log(`${r.name}: ${slowdown.toFixed(1)}x`);
}