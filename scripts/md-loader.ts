import { plugin, type BunPlugin } from "bun";

const mdLoader: BunPlugin = {
  name: "Markdown Text Loader",
  async setup(build) {
    // when a .md file is imported...
    build.onLoad({ filter: /\.md$/ }, async (args) => {
      // read the file as plain text
      const text = await Bun.file(args.path).text();
      
      // return it as a module with the text as the default export
      return {
        exports: { default: text },
        loader: "object", // special loader for JS objects
      };
    });
  },
};

// Register for runtime use
plugin(mdLoader);

// Export for bundler use
export default mdLoader; 