# Chess Hypermedia Implementation Plan

## Vision
Create a clean chess implementation using the hypermedia pattern we perfected with the counter example. The MCP server publishes both raw FEN data and a rendered board UI as Nostr events.

## Architecture Overview

### Parallel to Counter Pattern
Just like `mcp-counter-server.ts` publishes:
- **Data**: Raw counter value (kind 30078)
- **UI**: Counter display element (kind 32616)

The `mcp-chess-server.ts` will publish:
- **Data**: FEN notation state (kind 30078)
- **UI**: Rendered chess board element (kind 32616)

## Implementation Details

### 1. MCP Chess Server (`mcp-chess-server.ts`)

#### State Management
```typescript
// Server maintains game state
let chessState = {
  board: initializeBoard(),  // 8x8 array
  turn: 'w' as 'w' | 'b',
  fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  lastMove: null,
  moveHistory: []
};
```

#### Publishing Functions

##### Publish FEN Data (kind 30078)
```typescript
async function publishChessFEN(): Promise<void> {
  const dataEvent = {
    kind: 30078,
    content: chessState.fen,
    tags: [
      ["d", "chess-fen"],
      ["description", "Current chess game in FEN notation"]
    ],
    created_at: Math.floor(Date.now() / 1000)
  };
  
  const signedEvent = await signer.signEvent(dataEvent);
  await publishWithRetry(signedEvent);
}
```

##### Publish Board UI (kind 32616)
```typescript
async function publishChessBoard(): Promise<string> {
  const hypernoteJson = {
    version: "1.1.0",
    type: "element",
    component_kind: null,
    elements: [
      // Turn indicator
      {
        type: "div",
        content: [`${chessState.turn === 'w' ? 'White' : 'Black'} to move`],
        style: {
          textAlign: "center",
          fontSize: "1.5rem",
          fontWeight: "bold",
          marginBottom: "1rem"
        }
      },
      // Chess board
      {
        type: "div",
        elements: chessState.board.map((row, rowIdx) => ({
          type: "div",
          elements: row.map((piece, colIdx) => ({
            type: "div",
            content: [getPieceSymbol(piece)],
            style: {
              width: "3rem",
              height: "3rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "2rem",
              backgroundColor: (rowIdx + colIdx) % 2 === 0 
                ? "rgb(240, 217, 181)"  // light square
                : "rgb(181, 136, 99)",  // dark square
              border: "1px solid rgb(0,0,0,0.2)"
            }
          })),
          style: {
            display: "flex",
            flexDirection: "row"
          }
        })),
        style: {
          display: "flex",
          flexDirection: "column",
          border: "4px solid rgb(139, 69, 19)",
          borderRadius: "0.5rem",
          overflow: "hidden"
        }
      },
      // Last move display
      {
        type: "div",
        content: [chessState.lastMove ? `Last move: ${chessState.lastMove}` : "Game start"],
        style: {
          marginTop: "1rem",
          textAlign: "center",
          color: "rgb(107, 114, 128)"
        }
      }
    ]
  };
  
  const event = {
    kind: 32616,
    content: JSON.stringify(hypernoteJson),
    tags: [
      ["d", "chess-board"],
      ["hypernote", "1.1.0"],
      ["description", "Chess Board UI"]
    ],
    created_at: Math.floor(Date.now() / 1000)
  };
  
  const signedEvent = await signer.signEvent(event);
  await publishWithRetry(signedEvent);
  
  return nip19.naddrEncode({
    kind: 32616,
    pubkey: serverPubkey,
    identifier: "chess-board"
  });
}
```

#### MCP Tools

##### Make Move Tool
```typescript
mcpServer.registerTool(
  "make_move",
  {
    title: "Make Chess Move",
    description: "Make a move in algebraic notation",
    inputSchema: { move: z.string() }
  },
  async ({ move }) => {
    try {
      // Apply the move to the board
      const result = applyMove(chessState.board, move, chessState.turn);
      
      // Update state
      chessState.board = result.board;
      chessState.turn = chessState.turn === 'w' ? 'b' : 'w';
      chessState.fen = boardToFEN(chessState.board, chessState.turn);
      chessState.lastMove = move;
      chessState.moveHistory.push(move);
      
      // Publish both data and UI
      await publishChessFEN();
      await new Promise(resolve => setTimeout(resolve, 500));
      await publishChessBoard();
      
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify({
            success: true,
            fen: chessState.fen,
            turn: chessState.turn,
            lastMove: move
          })
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify({
            success: false,
            error: error.message
          })
        }]
      };
    }
  }
);
```

##### Reset Game Tool
```typescript
mcpServer.registerTool(
  "new_game",
  {
    title: "New Chess Game",
    description: "Start a new chess game"
  },
  async () => {
    // Reset state
    chessState = {
      board: initializeBoard(),
      turn: 'w',
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      lastMove: null,
      moveHistory: []
    };
    
    // Publish fresh state
    await publishChessFEN();
    await new Promise(resolve => setTimeout(resolve, 500));
    await publishChessBoard();
    
    return {
      content: [{ type: "text", text: "New game started" }]
    };
  }
);
```

### 2. Chess Client (`examples/chess.md`)

```markdown
---
type: "hypernote"
title: "Chess"
description: "Play chess with hypermedia UI from MCP server"
name: "chess"

# Query the FEN data (for move validation)
"$chess_fen":
  kinds: [30078]
  authors: ["<mcp-server-pubkey>"]
  "#d": ["chess-fen"]
  limit: 1
  pipe:
    - first
    - get: content
    - default: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

# Component query for the board UI
"#chess_board": "<naddr-for-chess-board>"

# Action to make a move
"@make_move":
  kind: 25910
  json:
    jsonrpc: "2.0"
    id: "{time.now}"
    method: "tools/call"
    params:
      name: "make_move"
      arguments:
        move: "{form.move}"
  tags:
    - ["p", "<mcp-server-pubkey>"]

# Action to start new game
"@new_game":
  kind: 25910
  json:
    jsonrpc: "2.0"
    id: "{time.now}"
    method: "tools/call"
    params:
      name: "new_game"
      arguments: {}
  tags:
    - ["p", "<mcp-server-pubkey>"]
---

# ♟️ Chess

## Board

[#chess_board]

## Controls

[form @make_move]
  [input name="move" placeholder="Enter move (e.g., e4, Nf3, O-O)" class="p-2 border rounded mr-2"]
  [button class="bg-blue-500 text-white px-4 py-2 rounded"]Make Move[/button]
[/form]

[form @new_game]
  [button class="bg-green-500 text-white px-4 py-2 rounded mt-2"]New Game[/button]
[/form]

## How to Play
- Enter moves in standard algebraic notation
- Pawns: `e4`, `d5`, `exd5`
- Pieces: `Nf3`, `Bxe5`, `Qd8`
- Castling: `O-O` (kingside), `O-O-O` (queenside)
```

### 3. Piece Symbol Helper

```typescript
function getPieceSymbol(piece: string): string {
  const symbols: Record<string, string> = {
    'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
    'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟',
    ' ': ''
  };
  return symbols[piece] || '';
}
```

## Key Improvements Over Current Implementation

### 1. **Elimination of Complexity**
- **Current**: Complex query→trigger→save chains
- **New**: Direct MCP calls, automatic UI updates via live subscriptions

### 2. **Clean Separation**
- **Data**: FEN string for game logic
- **UI**: Complete rendered board as Hypernote element
- Server owns all game state and logic

### 3. **Simpler Client**
- No board rendering logic in the client
- No piece-by-piece conditionals
- Just display the server's UI element

### 4. **Better UX**
- Turn indicator built into the UI
- Last move display
- Clean board styling with proper colors

## Implementation Steps

1. **Create `mcp-chess-server.ts`**
   - [ ] Copy structure from `mcp-counter-server.ts`
   - [ ] Add chess logic (reuse from current server)
   - [ ] Implement `publishChessFEN()` and `publishChessBoard()`
   - [ ] Create `make_move` and `new_game` tools
   - [ ] Add initial state publishing on startup

2. **Create new `examples/chess.md`**
   - [ ] Remove old complex version
   - [ ] Write clean hypermedia version
   - [ ] Use naddr for board component
   - [ ] Simple move input form

3. **Testing**
   - [ ] Start MCP server, get naddr values
   - [ ] Update chess.md with correct naddrs
   - [ ] Test move making
   - [ ] Test new game
   - [ ] Verify live updates work

## Benefits

1. **Simplicity**: No more callback chains or triggers
2. **Performance**: Fewer round trips, server calculates once
3. **Maintainability**: All chess logic in one place (server)
4. **Flexibility**: Server can enhance UI without client changes
5. **Live Updates**: Board updates automatically via subscriptions

## Future Enhancements

Once basic implementation works:
- Add move validation feedback in UI
- Show captured pieces
- Add move history panel
- Support multiple games with unique identifiers
- Add player matching/pairing

This approach transforms chess from a complex state management problem into a simple hypermedia application where the server provides both the data and the UI!