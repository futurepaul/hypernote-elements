---
type: "hypernote"
title: "Chess Game"
description: "Interactive chess game using ContextVM for move processing"
name: "chess-game"

# Parse the board state for display
"$board_state":
  kinds: [30078]
  authors: [user.pubkey]
  "#d": ["chess_board"]
  limit: 1
  pipe:
    - first
    - get: content
    - json

# Tool call to update the board with a move - just send FEN
"@make_move":
  kind: 25910
  json:
    jsonrpc: "2.0"
    id: "{time.now}"
    method: "tools/call"
    params:
      name: "chess_board_update"
      arguments:
        board: "{$board_state.fen or 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'}"
        move: "{form.move}"
  tags:
    - ["p", "19f5b5cd2fce663a3b4916b42c378c0280cce2bffd0af384380e91356fcff1d6"]

# Query for the tool response
"$move_result":
  kinds: [25910]
  "#e": ["@make_move"]
  authors: ["19f5b5cd2fce663a3b4916b42c378c0280cce2bffd0af384380e91356fcff1d6"]
  pipe:
    - first
    - get: content
    - json
    - get: result
    - get: content
    - first
    - get: text
  triggers: "@save_board"

# Save the updated board state
"@save_board":
  kind: 30078
  content: "{$move_result}"
  tags:
    - ["d", "chess_board"]

# Initialize/reset the board using the tool call - simplified
"@reset_board":
  kind: 25910
  json:
    jsonrpc: "2.0"
    id: "{time.now}"
    method: "tools/call"
    params:
      name: "chess_board_update"
      arguments:
        board: ""  # Empty string for reset
        move: "reset"
  tags:
    - ["p", "19f5b5cd2fce663a3b4916b42c378c0280cce2bffd0af384380e91356fcff1d6"]

# Query for the reset response  
"$reset_result":
  kinds: [25910]
  "#e": ["@reset_board"]
  authors: ["19f5b5cd2fce663a3b4916b42c378c0280cce2bffd0af384380e91356fcff1d6"]
  pipe:
    - first
    - get: content
    - json
    - get: result
    - get: content
    - first
    - get: text
  triggers: "@save_reset"

# Save the reset board state
"@save_reset":
  kind: 30078
  content: "{$reset_result}"
  tags:
    - ["d", "chess_board"]
---

# ♟️ Chess Game

[if $board_state.rows]
## Current Turn: {$board_state.turn}

[div class="mb-4"]
### Last Move: {$board_state.lastMove or "Game Start"}
[/div]

[div class="bg-amber-100 p-4 rounded border-4 border-amber-900"]
[each $board_state.rows as $row]
  [div class="flex"]
  [each $row as $square]
    [if $square.color == "dark"]
      [div class="w-16 h-16 flex items-center justify-center text-4xl font-bold border border-amber-900 bg-amber-700"]
        [if $square.piece == "K"]♔[/if]
        [if $square.piece == "Q"]♕[/if]
        [if $square.piece == "R"]♖[/if]
        [if $square.piece == "B"]♗[/if]
        [if $square.piece == "N"]♘[/if]
        [if $square.piece == "P"]♙[/if]
        [if $square.piece == "k"]♚[/if]
        [if $square.piece == "q"]♛[/if]
        [if $square.piece == "r"]♜[/if]
        [if $square.piece == "b"]♝[/if]
        [if $square.piece == "n"]♞[/if]
        [if $square.piece == "p"]♟[/if]
        [if $square.piece == " "] [/if]
      [/div]
    [/if]
    [if $square.color == "light"]
      [div class="w-16 h-16 flex items-center justify-center text-4xl font-bold border border-amber-900 bg-amber-200"]
        [if $square.piece == "K"]♔[/if]
        [if $square.piece == "Q"]♕[/if]
        [if $square.piece == "R"]♖[/if]
        [if $square.piece == "B"]♗[/if]
        [if $square.piece == "N"]♘[/if]
        [if $square.piece == "P"]♙[/if]
        [if $square.piece == "k"]♚[/if]
        [if $square.piece == "q"]♛[/if]
        [if $square.piece == "r"]♜[/if]
        [if $square.piece == "b"]♝[/if]
        [if $square.piece == "n"]♞[/if]
        [if $square.piece == "p"]♟[/if]
        [if $square.piece == " "] [/if]
      [/div]
    [/if]
  [/each]
  [/div]
[/each]
[/div]
[/if]

[if !$board_state.rows]
[div class="p-8 text-center bg-gray-100 rounded"]
### No game in progress
Click "New Game" to start playing!
[/div]
[/if]

[div class="mt-6"]
### Make a Move

[form @make_move]
  [div class="flex"]
    [input name="move" placeholder="Enter move (e.g., e4, Nf3, O-O)" class="flex-1 p-2 border rounded"]
    [button class="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded font-bold"]Move[/button]
  [/div]
[/form]

[form @reset_board]
  [button class="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded"]New Game[/button]
[/form]
[/div]

[div class="mt-6 p-4 bg-gray-100 rounded"]
### How to Play
- Enter moves in standard algebraic notation
- Pawns: `e4`, `d5`, `exd5`
- Pieces: `Nf3`, `Bxe5`, `Qd8`
- Castling: `O-O` (kingside), `O-O-O` (queenside)
- Add `+` for check, `#` for checkmate
[/div]

## Debug Info
### Raw board_state:
[json $board_state]

### Turn: {$board_state.turn or "undefined"}
### Board exists: {$board_state.board or "no board"}