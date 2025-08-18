import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { NostrServerTransport } from "@contextvm/sdk";
import { PrivateKeySigner } from "@contextvm/sdk";
import { SimpleRelayPool } from "@contextvm/sdk";
import { z } from "zod";
import { nip19, finalizeEvent, getPublicKey } from "nostr-tools";

// Chess helper functions
function initializeBoard(): string[][] {
  return [
    ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
    ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
    [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
    [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
    [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
    [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
    ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
    ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
  ];
}

function parseFEN(fen: string): string[][] {
  const rows = fen.split('/');
  const board: string[][] = [];
  
  for (const row of rows) {
    const boardRow: string[] = [];
    for (const char of row) {
      if (/\d/.test(char)) {
        const spaces = parseInt(char);
        for (let i = 0; i < spaces; i++) {
          boardRow.push(' ');
        }
      } else {
        boardRow.push(char);
      }
    }
    board.push(boardRow);
  }
  
  return board;
}

function boardToFEN(board: string[][], turn: 'w' | 'b'): string {
  const rows = board.map(row => {
    let fenRow = '';
    let spaceCount = 0;
    
    for (const piece of row) {
      if (piece === ' ') {
        spaceCount++;
      } else {
        if (spaceCount > 0) {
          fenRow += spaceCount;
          spaceCount = 0;
        }
        fenRow += piece;
      }
    }
    
    if (spaceCount > 0) {
      fenRow += spaceCount;
    }
    
    return fenRow;
  });
  
  return rows.join('/') + ' ' + turn + ' KQkq - 0 1';
}

function applyMove(board: string[][], move: string, turn: 'w' | 'b'): { board: string[][] } {
  // Clone the board
  const newBoard = board.map(row => [...row]);
  
  // Parse algebraic notation
  // This is a simplified parser - a real implementation would be more complex
  const files = 'abcdefgh';
  const ranks = '87654321';
  
  // Handle castling
  if (move === 'O-O' || move === '0-0') {
    const row = turn === 'w' ? 7 : 0;
    newBoard[row][4] = ' '; // King moves
    newBoard[row][7] = ' '; // Rook moves
    newBoard[row][6] = turn === 'w' ? 'K' : 'k';
    newBoard[row][5] = turn === 'w' ? 'R' : 'r';
    return { board: newBoard };
  }
  
  if (move === 'O-O-O' || move === '0-0-0') {
    const row = turn === 'w' ? 7 : 0;
    newBoard[row][4] = ' '; // King moves
    newBoard[row][0] = ' '; // Rook moves
    newBoard[row][2] = turn === 'w' ? 'K' : 'k';
    newBoard[row][3] = turn === 'w' ? 'R' : 'r';
    return { board: newBoard };
  }
  
  // Remove check/checkmate symbols
  const cleanMove = move.replace(/[+#]/, '');
  
  // Handle pawn moves (e4, exd5, etc.)
  if (/^[a-h]/.test(cleanMove) && cleanMove[0].toLowerCase() === cleanMove[0]) {
    const isCapture = cleanMove.includes('x');
    let destFile: number;
    let destRank: number;
    
    if (isCapture) {
      // Pawn capture (exd5)
      const parts = cleanMove.split('x');
      const fromFile = files.indexOf(parts[0]);
      destFile = files.indexOf(parts[1][0]);
      destRank = ranks.indexOf(parts[1][1]);
      
      // Find the pawn
      const pawn = turn === 'w' ? 'P' : 'p';
      const direction = turn === 'w' ? 1 : -1;
      const fromRank = destRank + direction;
      
      if (newBoard[fromRank][fromFile] === pawn) {
        newBoard[fromRank][fromFile] = ' ';
        newBoard[destRank][destFile] = pawn;
      }
    } else {
      // Regular pawn move (e4)
      destFile = files.indexOf(cleanMove[0]);
      destRank = ranks.indexOf(cleanMove[1]);
      
      const pawn = turn === 'w' ? 'P' : 'p';
      const direction = turn === 'w' ? 1 : -1;
      
      // Check one square back
      if (newBoard[destRank + direction][destFile] === pawn) {
        newBoard[destRank + direction][destFile] = ' ';
        newBoard[destRank][destFile] = pawn;
      }
      // Check two squares back (initial pawn move)
      else if ((turn === 'w' && destRank === 4) || (turn === 'b' && destRank === 3)) {
        if (newBoard[destRank + 2 * direction][destFile] === pawn) {
          newBoard[destRank + 2 * direction][destFile] = ' ';
          newBoard[destRank][destFile] = pawn;
        }
      }
    }
    
    return { board: newBoard };
  }
  
  // Handle piece moves (Nf3, Bxe5, etc.)
  const pieceType = cleanMove[0].toUpperCase();
  const pieceChar = turn === 'w' ? pieceType : pieceType.toLowerCase();
  
  // Extract destination
  const captureIndex = cleanMove.indexOf('x');
  const destSquare = captureIndex > -1 
    ? cleanMove.substring(captureIndex + 1)
    : cleanMove.substring(1);
  
  const destFile = files.indexOf(destSquare[destSquare.length - 2]);
  const destRank = ranks.indexOf(destSquare[destSquare.length - 1]);
  
  // Find the piece that can make this move
  // This is simplified - real chess needs to check legal moves
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      if (newBoard[r][f] === pieceChar) {
        // For simplicity, just move the first matching piece found
        // A real implementation would validate the move is legal
        newBoard[r][f] = ' ';
        newBoard[destRank][destFile] = pieceChar;
        return { board: newBoard };
      }
    }
  }
  
  throw new Error(`Invalid move: ${move}`);
}

// --- Configuration ---
// IMPORTANT: Replace with your own private key
const SERVER_PRIVATE_KEY_HEX =
  process.env.SERVER_PRIVATE_KEY || "your-32-byte-server-private-key-in-hex";
// const RELAYS = ["wss://relay.damus.io/", "wss://nos.lol/", "wss://relay.primal.net/"];
// nos.lol has a nicer rate limit
const RELAYS = ["wss://nos.lol"];

// --- Main Server Logic ---
async function main() {
  // Counter state maintained server-side
  let counterState = 0;
  
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

  // Helper function to publish with retry on rate limit
  async function publishWithRetry(event: any, maxRetries = 3, initialDelay = 1000): Promise<void> {
    let delay = initialDelay;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Publishing event kind ${event.kind} to relays...`);
        await relayPool.publish(event);
        console.log(`Successfully published event ${event.id} to relays`);
        
        return; // Success!
      } catch (error: any) {
        console.error(`Failed to publish event:`, error);
        if (error.message?.includes('rate-limited') && attempt < maxRetries) {
          console.log(`Rate limited, waiting ${delay}ms before retry (attempt ${attempt}/${maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2; // Exponential backoff
        } else {
          throw error; // Re-throw if not rate limit or max retries reached
        }
      }
    }
  }

  // Helper function to publish counter data as a simple value (kind 30078)
  async function publishCounterData(count: number): Promise<void> {
    const dataEvent = {
      kind: 30078,  // APP_STATE_KIND - simple data
      content: String(count),  // Just the raw count value
      tags: [
        ["d", "counter-value"],  // Replaceable identifier
        ["description", "Current counter value"]
      ],
      created_at: Math.floor(Date.now() / 1000)
    };

    const signedDataEvent = await signer.signEvent(dataEvent);
    await publishWithRetry(signedDataEvent);
    console.log(`Published counter data: ${count}`);
  }

  // Helper function to create and publish counter Hypernote element
  async function publishCounterUI(count: number): Promise<string> {
    const hypernoteJson = {
      version: "1.1.0",
      type: "element",
      component_kind: null,
      elements: [
        {
          type: "div",
          elements: [
            {
              type: "h2",
              content: [`Current count: ${count}`]
            }
          ],
          style: {
            textAlign: "center",
            fontSize: "2rem",
            fontWeight: "bold",
            color: "rgb(59,130,246)",
            padding: "1rem",
            backgroundColor: "rgb(239,246,255)",
            borderRadius: "0.5rem",
            marginBottom: "1rem"
          }
        }
      ]
    };

    // Create the Nostr event template
    const eventTemplate = {
      kind: 32616,  // HYPERNOTE_ELEMENT_KIND
      content: JSON.stringify(hypernoteJson),
      tags: [
        ["d", "counter-ui"],  // Shared counter state
        ["hypernote", "1.1.0"],
        ["description", "MCP Counter UI Element"]
      ],
      created_at: Math.floor(Date.now() / 1000)
    };

    // Sign the event using the signer's signEvent method
    const signedEvent = await signer.signEvent(eventTemplate);
    await publishWithRetry(signedEvent);
    
    console.log(`Published counter UI for count=${count}, event ID: ${signedEvent.id}`);

    // Return naddr as resource identifier (without relay hints)
    return nip19.naddrEncode({
      kind: 32616,
      pubkey: serverPubkey,
      identifier: "counter-ui"
    });
  }

  // Initialize and publish counter UI on startup
  console.log('Publishing initial counter state...');
  try {
    await publishCounterData(counterState);
    await new Promise(resolve => setTimeout(resolve, 500));
    await publishCounterUI(counterState);
    console.log('Initial counter state published successfully');
  } catch (err) {
    console.error('Failed to publish initial counter state:', err);
  }

  // 3. Register MCP Resources for reading counter state
  
  // Resource for raw counter data (via naddr)

  const counterDataNaddr = nip19.naddrEncode({
    kind: 30078,
    pubkey: serverPubkey,
    identifier: "counter-value"
  });

  console.log(`Counter Data naddr: ${counterDataNaddr}`);
  
  mcpServer.registerResource(
    "counter-data",
    `${counterDataNaddr}`,
    {
      title: "Counter Data",
      description: "Current counter value as Nostr event",
      mimeType: "application/json",
    },
    async (uri) => {
      // Return the current counter state as if it were fetched from Nostr
      const dataEvent = {
        kind: 30078,
        content: String(counterState),
        tags: [
          ["d", "counter-value"],
          ["description", "Current counter value"]
        ],
        created_at: Math.floor(Date.now() / 1000),
        pubkey: serverPubkey
      };
      
      return {
        contents: [{
          uri: uri.href,
          name: "counter-value",
          mimeType: "application/json",
          text: JSON.stringify(dataEvent),
        }]
      };
    }
  );
  
  // Resource for Hypernote UI element (via naddr)

  const counterUiNaddr = nip19.naddrEncode({
    kind: 32616,
    pubkey: serverPubkey,
    identifier: "counter-ui"
  });
  
  console.log(`Counter UI naddr: ${counterUiNaddr}`);
  
  mcpServer.registerResource(
    "counter-ui",
    `${counterUiNaddr}`,
    {
      title: "Counter UI Element",
      description: "Hypernote element for rendering counter",
      mimeType: "application/json",
    },
    async (uri) => {
      // Build the Hypernote JSON
      const hypernoteJson = {
        version: "1.1.0",
        type: "element",
        component_kind: null,
        elements: [
          {
            type: "div",
            elements: [
              {
                type: "h2",
                content: [`Current count: ${counterState}`]
              }
            ],
            style: {
              textAlign: "center",
              fontSize: "2rem",
              fontWeight: "bold",
              color: "rgb(59,130,246)",
              padding: "1rem",
              backgroundColor: "rgb(239,246,255)",
              borderRadius: "0.5rem",
              marginBottom: "1rem"
            }
          }
        ]
      };
      
      // Return as a Nostr event
      const uiEvent = {
        kind: 32616,
        content: JSON.stringify(hypernoteJson),
        tags: [
          ["d", "counter-ui"],
          ["hypernote", "1.1.0"],
          ["description", "MCP Counter UI Element"]
        ],
        created_at: Math.floor(Date.now() / 1000),
        pubkey: serverPubkey
      };
      
      return {
        contents: [{
          uri: uri.href,
          name: "counter-ui",
          mimeType: "application/json",
          text: JSON.stringify(uiEvent),
        }]
      };
    }
  );

  // 4. Define counter tools (with resource update notifications)
  mcpServer.registerTool(
    "addone",
    {
      title: "Add One Tool",
      description: "Adds one to a number",
      inputSchema: { a: z.union([z.string(), z.number()]) },
    },
    async ({ a }: { a: string | number }) => {
      // Ignore the input and use server state
      counterState += 1;
      console.log(`addone: counter is now ${counterState}`);
      
      // Publish our events to Nostr
      try {
        await publishCounterData(counterState);
        // Small delay to avoid rate limit
        await new Promise(resolve => setTimeout(resolve, 500));
        await publishCounterUI(counterState);
      } catch (err) {
        console.error('Failed to publish counter events:', err);
      }
      
      // Note: MCP doesn't have per-resource update notifications
      // Clients will need to poll or re-read the resources
      // We could send a generic resource list changed notification if resources were added/removed
      // but for value changes, clients need to re-read
      
      // Delay before returning RPC response to avoid rate limit
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      return {
        content: [{ type: "text", text: `${counterState}` }],
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
      // Ignore the input and use server state
      counterState -= 1;
      console.log(`minusone: counter is now ${counterState}`);
      
      // Publish our events to Nostr
      try {
        await publishCounterData(counterState);
        // Small delay to avoid rate limit
        await new Promise(resolve => setTimeout(resolve, 500));
        await publishCounterUI(counterState);
      } catch (err) {
        console.error('Failed to publish counter events:', err);
      }
      
      // Note: MCP doesn't have per-resource update notifications
      // Clients will need to poll or re-read the resources
      // We could send a generic resource list changed notification if resources were added/removed
      // but for value changes, clients need to re-read
      
      // Delay before returning RPC response to avoid rate limit
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      return {
        content: [{ type: "text", text: `${counterState}` }],
      };
    },
  );

  // Initialize counter tool
  mcpServer.registerTool(
    "initialize_counter",
    {
      title: "Initialize Counter",
      description: "Initialize the counter to a specific value",
      inputSchema: { value: z.number().default(0) },
    },
    async ({ value }: { value: number }) => {
      counterState = value;
      console.log(`Initializing counter to ${counterState}`);
      
      // Publish our events to Nostr
      try {
        await publishCounterData(counterState);
        // Small delay to avoid rate limit
        await new Promise(resolve => setTimeout(resolve, 500));
        await publishCounterUI(counterState);
      } catch (err) {
        console.error('Failed to publish counter events:', err);
      }
      
      // Note: MCP doesn't have per-resource update notifications
      // Clients will need to poll or re-read the resources
      // We could send a generic resource list changed notification if resources were added/removed
      // but for value changes, clients need to re-read
      
      // Delay before returning RPC response to avoid rate limit
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      return {
        content: [{ type: "text", text: `Counter initialized to ${counterState}` }],
      };
    },
  );

  // Chess board update tool
  mcpServer.registerTool(
    "chess_board_update",
    {
      title: "Chess Board Update",
      description: "Updates a chess board state with a move in standard notation",
      inputSchema: { 
        board: z.string().describe("Current board state as FEN or simple notation"),
        move: z.string().describe("Move in algebraic notation (e.g., e4, Nf3, O-O)")
      },
    },
    async ({ board, move }: { board: string; move: string }) => {
      console.log(`chess_board_update: Applying move ${move} to board`);
      
      // Handle reset command
      if (move.toLowerCase() === 'reset' || move.toLowerCase() === 'new') {
        const freshBoard = initializeBoard();
        const rows = [];
        for (let row = 0; row < 8; row++) {
          const rowSquares = [];
          for (let col = 0; col < 8; col++) {
            rowSquares.push({
              row,
              col,
              piece: freshBoard[row][col],
              color: (row + col) % 2 === 0 ? 'light' : 'dark'
            });
          }
          rows.push(rowSquares);
        }
        
        const output = JSON.stringify({
          board: freshBoard,
          rows: rows,  // Array of arrays for proper layout
          turn: 'w',
          lastMove: 'New Game',
          fen: boardToFEN(freshBoard, 'w')
        });
        
        console.log(`Board reset to initial position`);
        return {
          content: [{ type: "text", text: output }],
        };
      }
      
      // Parse the board state (FEN or our simple format)
      let boardState: string[][];
      let currentTurn: 'w' | 'b' = 'w';
      
      // Check if it's FEN notation
      if (board.includes('/')) {
        // Parse FEN
        const fenParts = board.split(' ');
        const fenBoard = fenParts[0];
        currentTurn = (fenParts[1] || 'w') as 'w' | 'b';
        boardState = parseFEN(fenBoard);
      } else {
        // Parse our simple JSON format
        try {
          // Check if board is already an object (from double-parsing issue)
          let boardData;
          if (typeof board === 'string') {
            // If it starts with quotes, it might be double-stringified
            if (board.startsWith('"') && board.endsWith('"')) {
              // Remove outer quotes and parse
              boardData = JSON.parse(JSON.parse(board));
            } else {
              boardData = JSON.parse(board);
            }
          } else {
            boardData = board;
          }
          
          boardState = boardData.board || initializeBoard();
          currentTurn = boardData.turn || 'w';
        } catch (err) {
          console.error('Failed to parse board:', err);
          console.log('Board input was:', board);
          // Initialize new board
          boardState = initializeBoard();
        }
      }
      
      // Apply the move
      try {
        const result = applyMove(boardState, move, currentTurn);
        const nextTurn = currentTurn === 'w' ? 'b' : 'w';
        
        // Convert board to enriched squares format - grouped by rows
        const rows = [];
        for (let row = 0; row < 8; row++) {
          const rowSquares = [];
          for (let col = 0; col < 8; col++) {
            rowSquares.push({
              row,
              col,
              piece: result.board[row][col],
              color: (row + col) % 2 === 0 ? 'light' : 'dark'
            });
          }
          rows.push(rowSquares);
        }
        
        // Return the updated board state with enriched data
        const output = JSON.stringify({
          board: result.board,
          rows: rows,  // Array of arrays for proper layout
          turn: nextTurn,
          lastMove: move,
          fen: boardToFEN(result.board, nextTurn)
        });
        
        console.log(`Move applied successfully`);
        return {
          content: [{ type: "text", text: output }],
        };
      } catch (error: any) {
        console.error(`Invalid move: ${error.message}`);
        return {
          content: [{ type: "text", text: JSON.stringify({ 
            error: error.message,
            board: boardState,
            turn: currentTurn 
          }) }],
        };
      }
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