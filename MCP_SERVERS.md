# MCP Hypermedia Servers

This project includes two example MCP servers that demonstrate the hypermedia pattern with Nostr events.

## Counter Server

A simple counter that publishes both raw data and UI elements.

### Run the server:
```bash
COUNTER_SERVER_KEY=<your-hex-private-key> bun run mcp-counter
```

### Outputs:
- **Counter Data naddr**: The raw counter value (kind 30078)
- **Counter UI naddr**: The rendered counter display (kind 32616)

Update `examples/counter.md` with the naddr values from the console output.

## Chess Server

A full chess game with board rendering and move processing.

### Run the server:
```bash
CHESS_SERVER_KEY=<your-hex-private-key> bun run mcp-chess
```

### Outputs:
- **Chess FEN naddr**: The game state in FEN notation (kind 30078)
- **Chess Board UI naddr**: The rendered chess board (kind 32616)
- **Server Public Key**: Needed for the client to send moves

Update `examples/chess.md` with:
1. Replace `REPLACE_WITH_CHESS_SERVER_PUBKEY` with the server's public key
2. Replace `REPLACE_WITH_CHESS_BOARD_NADDR` with the Chess Board UI naddr

## How It Works

Both servers follow the same hypermedia pattern:

1. **State Management**: Server maintains all state (counter value, chess board)
2. **Dual Publishing**: Each state change publishes both:
   - Raw data event (kind 30078) for programmatic access
   - UI element (kind 32616) as a complete Hypernote component
3. **MCP Tools**: Expose functions that modify state and publish updates
4. **Live Updates**: Clients subscribe to the events and update automatically

## Benefits

- **No Callbacks**: Direct actions without complex query chains
- **Server Authority**: All logic lives on the server
- **UI Control**: Server defines exactly how data is displayed
- **Live by Default**: Changes propagate immediately via Nostr subscriptions
- **Clean Clients**: Minimal client code, just display and input

## Private Key Generation

To generate a new private key for testing:

```javascript
import { generateSecretKey, nip19 } from 'nostr-tools'
const sk = generateSecretKey()
console.log(Buffer.from(sk).toString('hex'))
```

Or use any Nostr client to generate a new key pair.