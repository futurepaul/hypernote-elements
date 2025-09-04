#!/usr/bin/env bun
/**
 * Check line counts for all source files
 * Red = over 500 lines, Yellow = over 400 lines
 */

import { $ } from "bun";
import { readdirSync, statSync } from "fs";
import { join } from "path";

// ANSI colors
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const RESET = '\x1b[0m';

interface FileInfo {
  path: string;
  lines: number;
  color: string;
}

/**
 * Get all TypeScript files recursively
 */
function getAllTSFiles(dir: string, basePath: string = ''): string[] {
  const files: string[] = [];
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const relativePath = basePath ? `${basePath}/${entry}` : entry;
    
    // Skip node_modules and other ignored directories
    if (entry === 'node_modules' || entry === '.git' || entry === 'dist' || entry === 'build') {
      continue;
    }

    const stat = statSync(fullPath);
    
    if (stat.isDirectory()) {
      files.push(...getAllTSFiles(fullPath, relativePath));
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      files.push(relativePath);
    }
  }

  return files;
}

/**
 * Get line count for a file
 */
async function getLineCount(filePath: string): Promise<number> {
  try {
    const result = await $`wc -l ${filePath}`.text();
    const lines = parseInt(result.trim().split(' ')[0]);
    return lines;
  } catch (error) {
    console.error(`Error counting lines for ${filePath}:`, error);
    return 0;
  }
}

/**
 * Determine color based on line count
 */
function getColor(lines: number): string {
  if (lines > 500) return RED;
  if (lines > 400) return YELLOW;
  return GREEN;
}

/**
 * Main function
 */
async function main() {
  console.log('🔍 Checking line counts for all TypeScript files...\n');

  const files = getAllTSFiles('.');
  const fileInfos: FileInfo[] = [];

  for (const file of files) {
    const lines = await getLineCount(file);
    const color = getColor(lines);
    
    fileInfos.push({ path: file, lines, color });
  }

  // Sort by line count (highest first)
  fileInfos.sort((a, b) => b.lines - a.lines);

  // Print results
  console.log('📊 Line count report (sorted by size):\n');

  let overLimit = 0;
  let needsAttention = 0;
  
  for (const info of fileInfos) {
    const status = info.lines > 500 ? ' ⚠️  OVER LIMIT' : 
                  info.lines > 400 ? ' ⚡ NEEDS ATTENTION' : 
                  ' ✅';
                  
    console.log(`${info.color}${info.lines.toString().padStart(4)} lines${RESET} ${info.path}${status}`);
    
    if (info.lines > 500) overLimit++;
    if (info.lines > 400) needsAttention++;
  }

  // Summary
  console.log(`\n📈 Summary:`);
  console.log(`   Total files: ${fileInfos.length}`);
  console.log(`   ${RED}Over 500 lines (CRITICAL): ${overLimit}${RESET}`);
  console.log(`   ${YELLOW}Over 400 lines (attention): ${needsAttention}${RESET}`);
  console.log(`   ${GREEN}Under 400 lines (good): ${fileInfos.length - needsAttention}${RESET}`);

  if (overLimit > 0) {
    console.log(`\n🎯 Priority: Refactor files over 500 lines first`);
  } else if (needsAttention > 0) {
    console.log(`\n✨ Good progress! Consider refactoring files over 400 lines`);
  } else {
    console.log(`\n🎉 Excellent! All files under 400 lines`);
  }
}

main().catch(console.error);