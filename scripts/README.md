# Markdown Loader Plugin

This directory contains a custom Bun plugin that allows you to import `.md` files directly as plain text strings.

## How it works

The `md-loader.ts` plugin registers a custom loader with Bun that:

1. Intercepts imports of `.md` files
2. Reads the file content as plain text
3. Returns it as the default export of a module

## Setup

The plugin is automatically loaded via the `preload` configuration in `bunfig.toml`:

```toml
preload = ["./scripts/md-loader.ts"]

[test]
preload = ["./scripts/md-loader.ts"]
```

This ensures the plugin is loaded before any other code runs, both in development and when running tests.

## Usage

### Static imports

```typescript
import myMarkdown from "./path/to/file.md";
console.log(myMarkdown); // prints the entire markdown content as a string
```

### Dynamic imports

```typescript
const loadMarkdown = async (filename: string) => {
  const module = await import(`./examples/${filename}.md`);
  return module.default;
};

const content = await loadMarkdown("basic-hello");
console.log(content);
```

## TypeScript Support

TypeScript declarations are provided in `src/types/markdown.d.ts`:

```typescript
declare module "*.md" {
  const content: string;
  export default content;
}
```

This tells TypeScript that `.md` files export a string as their default export.

## Benefits

- **Simplicity**: No need for file system operations at runtime
- **Bundle compatibility**: Works with Bun's bundler for frontend builds
- **Type safety**: Full TypeScript support with proper type declarations
- **Performance**: Files are loaded at build time, not runtime

## Replacing example-loader.ts

Before:
```typescript
import { loadExample } from "./example-loader";
const example = loadExample("basic-hello");
console.log(example.markdown); // complex API, runtime file operations
```

After:
```typescript
import markdown from "../examples/basic-hello.md";
console.log(markdown); // simple, direct import
``` 