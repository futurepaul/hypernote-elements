import { serve } from "bun";
import index from "./index.html";
import { FULL_DOMAIN, PORT } from "./lib/utils";

const server = serve({
  port: PORT,
  fetch(req, server) {
    // Log all incoming requests
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    return server.fetch(req);
  },
  routes: {
    // Serve index.html for all unmatched routes
    "/*": index,

    "/api/hello": {
      async GET(req) {
        console.log("GET /api/hello called");
        return Response.json({
          message: "Hello, world!",
          method: "GET",
        });
      },
      async PUT(req) {
        console.log("PUT /api/hello called");
        return Response.json({
          message: "Hello, world!",
          method: "PUT",
        });
      },
    },

    "/api/hello/:name": async (req) => {
      const name = req.params.name;
      console.log(`GET /api/hello/${name} called`);
      return Response.json({
        message: `Hello, ${name}!`,
      });
    },
  },

  development: process.env.NODE_ENV !== "production",
});

console.log(`🚀 Server running at ${server.url}`);
console.log(`Frontend should be served via Bun's built-in bundler`);
console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
