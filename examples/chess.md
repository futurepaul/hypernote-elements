---
type: "hypernote"
title: "Chess"
description: "Play chess with hypermedia UI from MCP server"
name: "chess"

# Query the FEN data (for reference/debugging)
"$chess_fen":
  kinds: [30078]
  authors: ["2e6ad883d5a134a6fb3f0de9063ab170deeb805592bba90ac7351cf3920bbbd0"]
  "#d": ["chess-fen"]
  limit: 1
  pipe:
    - first
    - get: content
    - default: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

# Component query for the board UI
"#chess_board": "naddr1qvzqqqrldqpzqtn2mzpatgf55man7r0fqcatzux7awq9ty4m4y9vwdgu7wfqhw7sqq9kx6r9wdej6cn0v9exgp4lvaj"

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
    - ["p", "2e6ad883d5a134a6fb3f0de9063ab170deeb805592bba90ac7351cf3920bbbd0"]

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
    - ["p", "2e6ad883d5a134a6fb3f0de9063ab170deeb805592bba90ac7351cf3920bbbd0"]
---

# ♟️ Chess

[div class="mt-4 text-sm text-gray-600"]
**Debug FEN**: {$chess_fen}
[/div]

[#chess_board]

[form @make_move]
  [div class="flex gap-2"]
    [input name="move" placeholder="Enter move (e.g., e4, Nf3, O-O)" class="flex-1 p-2 border rounded"]
    [button class="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded font-bold"]Make Move[/button]
  [/div]
[/form]

[form @new_game]
  [button class="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded mt-2"]New Game[/button]
[/form]

## How to Play

[div class="mt-4 p-4 bg-gray-100 rounded"]
- **Pawns**: `e4`, `d5`, `exd5`
- **Pieces**: `Nf3`, `Bxe5`, `Qd8`  
- **Castling**: `O-O` (kingside), `O-O-O` (queenside)
- **Check/Checkmate**: Add `+` or `#`
[/div]