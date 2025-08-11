import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { NostrServerTransport } from "@contextvm/sdk";
import { PrivateKeySigner } from "@contextvm/sdk";
import { SimpleRelayPool } from "@contextvm/sdk";
import { z } from "zod";

// --- Configuration ---
// IMPORTANT: Replace with your own private key
const SERVER_PRIVATE_KEY_HEX =
  process.env.SERVER_PRIVATE_KEY || "your-32-byte-server-private-key-in-hex";
const RELAYS = ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.primal.net"];

// --- Main Server Logic ---
async function main() {
  // 1. Setup Signer and Relay Pool
  const signer = new PrivateKeySigner(SERVER_PRIVATE_KEY_HEX);
  const relayPool = new SimpleRelayPool(RELAYS);
  const serverPubkey = await signer.getPublicKey();

  console.log(`Server Public Key: ${serverPubkey}`);
  console.log("Connecting to relays...");

  // 2. Create and Configure the MCP Server
  const mcpServer = new McpServer({
    name: "counter-mcp-server",
    version: "1.0.0",
  });

  // 3. Define counter tools
  mcpServer.registerTool(
    "addone",
    {
      title: "Add One Tool",
      description: "Adds one to a number",
      inputSchema: { a: z.union([z.string(), z.number()]) },
    },
    async ({ a }: { a: string | number }) => {
      const num = typeof a === 'string' ? parseInt(a, 10) : a;
      const result = num + 1;
      console.log(`addone: ${num} + 1 = ${result}`);
      return {
        content: [{ type: "text", text: `${result}` }],
      };
    },
  );

  mcpServer.registerTool(
    "minusone",
    {
      title: "Minus One Tool",
      description: "Subtracts one from a number",
      inputSchema: { a: z.union([z.string(), z.number()]) },
    },
    async ({ a }: { a: string | number }) => {
      const num = typeof a === 'string' ? parseInt(a, 10) : a;
      const result = num - 1;
      console.log(`minusone: ${num} - 1 = ${result}`);
      return {
        content: [{ type: "text", text: `${result}` }],
      };
    },
  );

  // 4. Configure the Nostr Server Transport
  const serverTransport = new NostrServerTransport({
    signer,
    relayHandler: relayPool,
    isPublicServer: true, // Announce this server on the Nostr network
    serverInfo: {
      name: "CTXVM Counter Server",
    },
  });

  // 5. Connect the server
  await mcpServer.connect(serverTransport);

  console.log("Server is running and listening for requests on Nostr...");
  console.log("Press Ctrl+C to exit.");
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});