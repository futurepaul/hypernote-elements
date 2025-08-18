import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { NostrServerTransport } from "@contextvm/sdk";
import { PrivateKeySigner } from "@contextvm/sdk";
import { SimpleRelayPool } from "@contextvm/sdk";
import { z } from "zod";
import { nip19 } from "nostr-tools";

// --- Chess Logic ---
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

function getPieceSymbol(piece: string): string {
  const piece_lower = piece.toLowerCase();
  const symbols: Record<string, string> = {
    'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟',
    ' ': ' '  // Return space instead of empty string
  };
  return symbols[piece_lower] || ' ';
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

function applyMove(board: string[][], move: string, turn: 'w' | 'b'): { board: string[][], success: boolean, error?: string } {
  // Clone the board
  const newBoard = board.map(row => [...row]);
  
  // Parse algebraic notation
  const files = 'abcdefgh';
  const ranks = '87654321';
  
  // Handle castling
  if (move === 'O-O' || move === '0-0') {
    const row = turn === 'w' ? 7 : 0;
    newBoard[row][4] = ' '; // King moves
    newBoard[row][7] = ' '; // Rook moves
    newBoard[row][6] = turn === 'w' ? 'K' : 'k';
    newBoard[row][5] = turn === 'w' ? 'R' : 'r';
    return { board: newBoard, success: true };
  }
  
  if (move === 'O-O-O' || move === '0-0-0') {
    const row = turn === 'w' ? 7 : 0;
    newBoard[row][4] = ' '; // King moves
    newBoard[row][0] = ' '; // Rook moves
    newBoard[row][2] = turn === 'w' ? 'K' : 'k';
    newBoard[row][3] = turn === 'w' ? 'R' : 'r';
    return { board: newBoard, success: true };
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
        return { board: newBoard, success: true };
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
        return { board: newBoard, success: true };
      }
      // Check two squares back (initial pawn move)
      else if ((turn === 'w' && destRank === 4) || (turn === 'b' && destRank === 3)) {
        if (newBoard[destRank + 2 * direction][destFile] === pawn) {
          newBoard[destRank + 2 * direction][destFile] = ' ';
          newBoard[destRank][destFile] = pawn;
          return { board: newBoard, success: true };
        }
      }
    }
    
    return { board: board, success: false, error: `Invalid pawn move: ${move}` };
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
        return { board: newBoard, success: true };
      }
    }
  }
  
  return { board: board, success: false, error: `Invalid move: ${move}` };
}

// --- Configuration ---
// IMPORTANT: Replace with your own private key
const SERVER_PRIVATE_KEY_HEX =
  process.env.CHESS_SERVER_KEY || "your-32-byte-server-private-key-in-hex";
const RELAYS = ["wss://nos.lol"];

// --- Main Server Logic ---
async function main() {
  // Chess state maintained server-side
  let chessState = {
    board: initializeBoard(),
    turn: 'w' as 'w' | 'b',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    lastMove: null as string | null,
    moveHistory: [] as string[]
  };
  
  // 1. Setup Signer and Relay Pool
  const signer = new PrivateKeySigner(SERVER_PRIVATE_KEY_HEX);
  const relayPool = new SimpleRelayPool(RELAYS);
  const serverPubkey = await signer.getPublicKey();

  console.log(`Chess Server Public Key: ${serverPubkey}`);
  console.log("Connecting to relays...");

  // 2. Create and Configure the MCP Server
  const mcpServer = new McpServer({
    name: "chess-mcp-server",
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

  // Helper function to publish chess FEN data (kind 30078)
  async function publishChessFEN(): Promise<void> {
    const dataEvent = {
      kind: 30078,  // APP_STATE_KIND - simple data
      content: chessState.fen,
      tags: [
        ["d", "chess-fen"],  // Replaceable identifier
        ["description", "Current chess game in FEN notation"]
      ],
      created_at: Math.floor(Date.now() / 1000)
    };

    const signedDataEvent = await signer.signEvent(dataEvent);
    await publishWithRetry(signedDataEvent);
    console.log(`Published chess FEN: ${chessState.fen}`);
  }

  // Helper function to create and publish chess board UI
  async function publishChessBoard(): Promise<string> {
    const hypernoteJson = {
      version: "1.1.0",
      type: "element",
      component_kind: null,
      elements: [
        // Turn indicator
        {
          type: "h2",
          content: [`${chessState.turn === 'w' ? '♔ White' : '♚ Black'} to move`],
          style: {
            textAlign: "center",
            fontSize: "1.5rem",
            fontWeight: "bold",
            marginBottom: "1rem"
          }
        },
        // Chess board with coordinates
        {
          type: "div",
          style: {
            display: "flex",
            flexDirection: "row",
            gap: "0.5rem",
            justifyContent: "center"
          },
          elements: [
            // Rank numbers (8-1) on the left
            {
              type: "div",
              style: {
                display: "flex",
                flexDirection: "column"
              },
              elements: ['8', '7', '6', '5', '4', '3', '2', '1'].map(rank => ({
                type: "div",
                content: [rank],
                style: {
                  width: "1.5rem",
                  height: "3rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1rem",
                  fontWeight: "bold",
                  color: "rgb(107, 114, 128)"
                }
              }))
            },
            // Chess board squares
            {
              type: "div",
              style: {
                display: "flex",
                flexDirection: "column"
              },
              elements: [
                // Board rows
                ...chessState.board.map((row, rowIdx) => ({
                  type: "div",
                  elements: row.map((piece, colIdx) => {
                    const symbol = getPieceSymbol(piece);
                    return {
                      type: "div",
                      content: [symbol],
                      style: {
                        width: "3rem",
                        height: "3rem",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: piece.toLowerCase() === piece ? "rgb(0,0,0)" : "rgb(255,255,255)",
                        fontSize: "2.5rem",
                        lineHeight: "1",
                        backgroundColor: (rowIdx + colIdx) % 2 === 0 
                          ? "rgb(240, 217, 181)"  // light square
                          : "rgb(181, 136, 99)"   // dark square
                      }
                    };
                  }),
                  style: {
                    display: "flex",
                    flexDirection: "row"
                  }
                })),
                // File letters (a-h) at the bottom
                {
                  type: "div",
                  style: {
                    display: "flex",
                    flexDirection: "row",
                    marginTop: "0.5rem"
                  },
                  elements: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(file => ({
                    type: "div",
                    content: [file],
                    style: {
                      width: "3rem",
                      height: "1.5rem",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "1rem",
                      fontWeight: "bold",
                      color: "rgb(107, 114, 128)"
                    }
                  }))
                }
              ]
            }
          ]
        },
        // Last move display
        {
          type: "div",
          content: [chessState.lastMove ? `Last move: ${chessState.lastMove}` : "Game start"],
          style: {
            marginTop: "1rem",
            textAlign: "center",
            color: "rgb(107, 114, 128)",
            fontSize: "0.875rem"
          }
        }
      ]
    };

    // Create the Nostr event template
    const eventTemplate = {
      kind: 32616,  // HYPERNOTE_ELEMENT_KIND
      content: JSON.stringify(hypernoteJson),
      tags: [
        ["d", "chess-board"],  // Replaceable identifier
        ["hypernote", "1.1.0"],
        ["description", "MCP Chess Board UI"]
      ],
      created_at: Math.floor(Date.now() / 1000)
    };

    // Sign the event using the signer's signEvent method
    const signedEvent = await signer.signEvent(eventTemplate);
    await publishWithRetry(signedEvent);
    
    console.log(`Published chess board UI, event ID: ${signedEvent.id}`);

    // Return naddr as resource identifier (without relay hints)
    return nip19.naddrEncode({
      kind: 32616,
      pubkey: serverPubkey,
      identifier: "chess-board"
    });
  }

  // Initialize and publish chess board on startup
  console.log('Publishing initial chess state...');
  console.log('Initial board state:', chessState.board);
  console.log('Board[0][0] (should be r):', chessState.board[0][0]);
  console.log('Board[7][4] (should be K):', chessState.board[7][4]);
  
  try {
    await publishChessFEN();
    await new Promise(resolve => setTimeout(resolve, 500));
    const boardNaddr = await publishChessBoard();
    console.log('Initial chess state published successfully');
    console.log('Board can be viewed at:', boardNaddr);
  } catch (err) {
    console.error('Failed to publish initial chess state:', err);
  }

  // 3. Register MCP Resources for reading chess state
  
  // Resource for raw FEN data (via naddr)
  const chessFenNaddr = nip19.naddrEncode({
    kind: 30078,
    pubkey: serverPubkey,
    identifier: "chess-fen"
  });

  console.log(`Chess FEN naddr: ${chessFenNaddr}`);
  
  mcpServer.registerResource(
    "chess-fen",
    `${chessFenNaddr}`,
    {
      title: "Chess FEN",
      description: "Current chess position in FEN notation",
      mimeType: "application/json",
    },
    async (uri) => {
      // Return the current chess FEN as if it were fetched from Nostr
      const dataEvent = {
        kind: 30078,
        content: chessState.fen,
        tags: [
          ["d", "chess-fen"],
          ["description", "Current chess game in FEN notation"]
        ],
        created_at: Math.floor(Date.now() / 1000),
        pubkey: serverPubkey
      };
      
      return {
        contents: [{
          uri: uri.href,
          name: "chess-fen",
          mimeType: "application/json",
          text: JSON.stringify(dataEvent),
        }]
      };
    }
  );
  
  // Resource for Chess Board UI element (via naddr)
  const chessBoardNaddr = nip19.naddrEncode({
    kind: 32616,
    pubkey: serverPubkey,
    identifier: "chess-board"
  });
  
  console.log(`Chess Board UI naddr: ${chessBoardNaddr}`);
  
  mcpServer.registerResource(
    "chess-board",
    `${chessBoardNaddr}`,
    {
      title: "Chess Board UI",
      description: "Hypernote element for rendering chess board",
      mimeType: "application/json",
    },
    async (uri) => {
      // Build the Hypernote JSON (same as publishChessBoard but for resource)
      const hypernoteJson = {
        version: "1.1.0",
        type: "element",
        component_kind: null,
        elements: [
          // Turn indicator
          {
            type: "h2",
            content: [`${chessState.turn === 'w' ? '♔ White' : '♚ Black'} to move`],
            style: {
              textAlign: "center",
              fontSize: "1.5rem",
              fontWeight: "bold",
              marginBottom: "1rem"
            }
          },
          // Chess board with coordinates
          {
            type: "div",
            style: {
              display: "flex",
              flexDirection: "row",
              gap: "0.5rem",
              justifyContent: "center"
            },
            elements: [
              // Rank numbers (8-1) on the left
              {
                type: "div",
                style: {
                  display: "flex",
                  flexDirection: "column"
                },
                elements: ['8', '7', '6', '5', '4', '3', '2', '1'].map(rank => ({
                  type: "div",
                  content: [rank],
                  style: {
                    width: "1.5rem",
                    height: "3rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "1rem",
                    fontWeight: "bold",
                    color: "rgb(107, 114, 128)"
                  }
                }))
              },
              // Chess board squares
              {
                type: "div",
                style: {
                  display: "flex",
                  flexDirection: "column"
                },
                elements: [
                  // Board rows
                  ...chessState.board.map((row, rowIdx) => ({
                    type: "div",
                    elements: row.map((piece, colIdx) => {
                      const symbol = getPieceSymbol(piece);
                      return {
                        type: "div",
                        content: [symbol],
                        style: {
                          width: "3rem",
                          height: "3rem",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "2.5rem",
                          lineHeight: "1",
                          backgroundColor: (rowIdx + colIdx) % 2 === 0 
                            ? "rgb(240, 217, 181)"
                            : "rgb(181, 136, 99)"
                        }
                      };
                    }),
                    style: {
                      display: "flex",
                      flexDirection: "row"
                    }
                  })),
                  // File letters (a-h) at the bottom
                  {
                    type: "div",
                    style: {
                      display: "flex",
                      flexDirection: "row",
                      marginTop: "0.5rem"
                    },
                    elements: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(file => ({
                      type: "div",
                      content: [file],
                      style: {
                        width: "3rem",
                        height: "1.5rem",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "1rem",
                        fontWeight: "bold",
                        color: "rgb(107, 114, 128)"
                      }
                    }))
                  }
                ]
              }
            ]
          },
          // Last move display
          {
            type: "div",
            content: [chessState.lastMove ? `Last move: ${chessState.lastMove}` : "Game start"],
            style: {
              marginTop: "1rem",
              textAlign: "center",
              color: "rgb(107, 114, 128)",
              fontSize: "0.875rem"
            }
          }
        ]
      };
      
      // Return as a Nostr event
      const uiEvent = {
        kind: 32616,
        content: JSON.stringify(hypernoteJson),
        tags: [
          ["d", "chess-board"],
          ["hypernote", "1.1.0"],
          ["description", "MCP Chess Board UI"]
        ],
        created_at: Math.floor(Date.now() / 1000),
        pubkey: serverPubkey
      };
      
      return {
        contents: [{
          uri: uri.href,
          name: "chess-board",
          mimeType: "application/json",
          text: JSON.stringify(uiEvent),
        }]
      };
    }
  );

  // 4. Define chess tools
  mcpServer.registerTool(
    "make_move",
    {
      title: "Make Chess Move",
      description: "Make a move in algebraic notation",
      inputSchema: { move: z.string() },
    },
    async ({ move }: { move: string }) => {
      console.log(`make_move: Attempting move ${move} (${chessState.turn} to move)`);
      
      // Apply the move to the board
      const result = applyMove(chessState.board, move, chessState.turn);
      
      if (result.success) {
        // Update state
        chessState.board = result.board;
        chessState.turn = chessState.turn === 'w' ? 'b' : 'w';
        chessState.fen = boardToFEN(chessState.board, chessState.turn);
        chessState.lastMove = move;
        chessState.moveHistory.push(move);
        
        console.log(`Move ${move} successful, new turn: ${chessState.turn}`);
        
        // Publish our events to Nostr
        try {
          await publishChessFEN();
          // Small delay to avoid rate limit
          await new Promise(resolve => setTimeout(resolve, 500));
          await publishChessBoard();
        } catch (err) {
          console.error('Failed to publish chess events:', err);
        }
        
        // Delay before returning RPC response to avoid rate limit
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify({
              success: true,
              fen: chessState.fen,
              turn: chessState.turn,
              lastMove: move
            })
          }],
        };
      } else {
        console.log(`Move ${move} failed: ${result.error}`);
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify({
              success: false,
              error: result.error || "Invalid move"
            })
          }],
        };
      }
    },
  );

  mcpServer.registerTool(
    "new_game",
    {
      title: "New Chess Game",
      description: "Start a new chess game",
      inputSchema: {},
    },
    async () => {
      console.log(`new_game: Starting new chess game`);
      
      // Reset state
      chessState = {
        board: initializeBoard(),
        turn: 'w',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        lastMove: null,
        moveHistory: []
      };
      
      // Publish fresh state
      try {
        await publishChessFEN();
        await new Promise(resolve => setTimeout(resolve, 500));
        await publishChessBoard();
      } catch (err) {
        console.error('Failed to publish chess events:', err);
      }
      
      // Delay before returning RPC response to avoid rate limit
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      return {
        content: [{ type: "text", text: "New game started" }],
      };
    },
  );

  // 5. Configure the Nostr Server Transport
  const serverTransport = new NostrServerTransport({
    signer,
    relayHandler: relayPool,
    isPublicServer: true, // Announce this server on the Nostr network
    serverInfo: {
      name: "CTXVM Chess Server",
    },
  });

  // 6. Connect the server
  await mcpServer.connect(serverTransport);

  console.log("Chess server is running and listening for requests on Nostr...");
  console.log("Press Ctrl+C to exit.");
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});