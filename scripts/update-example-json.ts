#!/usr/bin/env bun

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { compileHypernoteToContent } from '../src/lib/compiler';

const EXAMPLES_DIR = join(import.meta.dir, '../examples');

/**
 * Gets all available example names (based on .md files)
 */
function getAvailableExamples(): string[] {
  return readdirSync(EXAMPLES_DIR)
    .filter(file => file.endsWith('.md') && file !== 'README.md')
    .map(file => file.replace('.md', ''))
    .sort();
}

/**
 * Updates the JSON output for a single example
 */
function updateExampleJson(exampleName: string): void {
  const mdPath = join(EXAMPLES_DIR, `${exampleName}.md`);
  const jsonPath = join(EXAMPLES_DIR, `${exampleName}.json`);
  
  try {
    console.log(`📝 Reading ${exampleName}.md...`);
    const markdown = readFileSync(mdPath, 'utf-8');
    
    console.log(`⚙️  Compiling ${exampleName}...`);
    const compiled = compileHypernoteToContent(markdown);
    
    console.log(`💾 Writing ${exampleName}.json...`);
    writeFileSync(jsonPath, JSON.stringify(compiled, null, 2) + '\n');
    
    console.log(`✅ Updated ${exampleName}.json successfully!`);
  } catch (error) {
    console.error(`❌ Failed to update ${exampleName}:`, error);
    process.exit(1);
  }
}

/**
 * Main function to handle command line arguments
 */
function main(): void {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('📚 Hypernote Example JSON Updater');
    console.log('');
    console.log('Usage:');
    console.log('  bun scripts/update-example-json.ts <example-name>');
    console.log('  bun scripts/update-example-json.ts all');
    console.log('  bun scripts/update-example-json.ts --list');
    console.log('');
    console.log('Examples:');
    console.log('  bun scripts/update-example-json.ts zap-cloud');
    console.log('  bun scripts/update-example-json.ts image-test zap-cloud');
    console.log('  bun scripts/update-example-json.ts all');
    process.exit(0);
  }
  
  const availableExamples = getAvailableExamples();
  
  if (args[0] === '--list') {
    console.log('📋 Available examples:');
    availableExamples.forEach(name => console.log(`  • ${name}`));
    process.exit(0);
  }
  
  if (args[0] === 'all') {
    console.log(`🔄 Updating all ${availableExamples.length} examples...`);
    console.log('');
    
    for (const exampleName of availableExamples) {
      updateExampleJson(exampleName);
      console.log('');
    }
    
    console.log(`🎉 All examples updated successfully!`);
    process.exit(0);
  }
  
  // Handle specific example names
  for (const exampleName of args) {
    if (!availableExamples.includes(exampleName)) {
      console.error(`❌ Example "${exampleName}" not found.`);
      console.log('Available examples:', availableExamples.join(', '));
      process.exit(1);
    }
    
    updateExampleJson(exampleName);
    console.log('');
  }
  
  console.log(`🎉 Updated ${args.length} example(s) successfully!`);
}

// Run the script
main(); 