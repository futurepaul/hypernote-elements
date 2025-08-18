# MCP Service Setup

This document explains how to set up MCP (Model Context Protocol) servers as systemd services on Linux systems.

## Quick Start

```bash
# Run the service setup script
bun run mcp-service

# Or directly
bun run mcp-service.ts
```

## Overview

The MCP service setup script (`mcp-service.ts`) helps you:
- Create systemd service files for MCP servers
- Configure environment variables for server private keys
- Automatically install and start services
- Manage multiple MCP servers (counter, chess, etc.)

## Key Features

### No Port Configuration Needed
All MCP communication happens over Nostr, so you don't need to worry about:
- Port conflicts
- Firewall rules
- Network configuration
- SSL certificates

### Environment-Based Configuration
Private keys are stored in a `.env` file on the server:
```env
# .env file
COUNTER_SERVER_KEY=your-32-byte-counter-server-private-key-in-hex
CHESS_SERVER_KEY=your-32-byte-chess-server-private-key-in-hex
```

## Setup Process

### 1. Run the Setup Script
```bash
bun run mcp-service
```

### 2. Follow the Interactive Prompts
The script will ask you to:
- Confirm the user to run services
- Confirm the working directory
- Choose which servers to set up
- Optionally install services automatically

### 3. Configure Private Keys
Edit the generated `.env` file:
```bash
nano .env
```

Add your actual 32-byte private keys in hex format:
```env
COUNTER_SERVER_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
CHESS_SERVER_KEY=fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210
```

### 4. Start the Services
If not automatically started:
```bash
# Start individual service
sudo systemctl start mcp-counter
sudo systemctl start mcp-chess

# Or start all at once
sudo systemctl start mcp-counter mcp-chess
```

## Service Management

### Check Service Status
```bash
sudo systemctl status mcp-counter
sudo systemctl status mcp-chess
```

### View Logs
```bash
# Follow logs in real-time
sudo journalctl -u mcp-counter -f
sudo journalctl -u mcp-chess -f

# View recent logs
sudo journalctl -u mcp-counter -n 100
```

### Get Server Public Keys
After starting services, find the public keys in logs:
```bash
sudo journalctl -u mcp-counter | grep "Public Key"
sudo journalctl -u mcp-chess | grep "Public Key"
```

### Restart Services
```bash
sudo systemctl restart mcp-counter
sudo systemctl restart mcp-chess
```

### Stop Services
```bash
sudo systemctl stop mcp-counter
sudo systemctl stop mcp-chess
```

### Enable/Disable Auto-Start
```bash
# Enable auto-start on boot
sudo systemctl enable mcp-counter

# Disable auto-start
sudo systemctl disable mcp-counter
```

## Testing Locally

Before deploying as a service, test locally:
```bash
# Set environment variables
export COUNTER_SERVER_KEY=your-key-here
export CHESS_SERVER_KEY=your-key-here

# Run servers
bun run mcp-counter
bun run mcp-chess
```

## Systemd Service Files

The generated service files include:
- Automatic restart on failure
- Environment file loading from `.env`
- Proper logging to journald
- Resource limits
- Working directory configuration

Example service file structure:
```ini
[Unit]
Description=MCP mcp-counter Server
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/hypernote-elements
Environment="NODE_ENV=production"
EnvironmentFile=/path/to/hypernote-elements/.env
ExecStart=/path/to/bun run mcp-counter-server.ts
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

## Troubleshooting

### Service Won't Start
1. Check logs: `sudo journalctl -u mcp-counter -e`
2. Verify `.env` file has valid private keys
3. Ensure all dependencies are installed: `bun install`
4. Test locally first before using systemd

### Rate Limiting Issues
The MCP servers include built-in retry logic with exponential backoff for Nostr relay rate limits.

### Permission Issues
- Ensure the service user has read access to the working directory
- Verify bun is accessible to the service user
- Check that `.env` file is readable

### Finding Server Public Keys
Public keys are logged when servers start. Use:
```bash
sudo journalctl -u mcp-counter | grep "Server Public Key"
```

## Adding New MCP Servers

To add a new MCP server to the service setup:

1. Create your new server file (e.g., `mcp-newservice-server.ts`)
2. Edit `mcp-service.ts` and add to the `MCP_SERVERS` array:
```typescript
const MCP_SERVERS = [
  { name: 'mcp-counter', script: 'mcp-counter-server.ts', envVar: 'COUNTER_SERVER_KEY' },
  { name: 'mcp-chess', script: 'mcp-chess-server.ts', envVar: 'CHESS_SERVER_KEY' },
  { name: 'mcp-newservice', script: 'mcp-newservice-server.ts', envVar: 'NEWSERVICE_SERVER_KEY' }
];
```
3. Run the setup script again to create the new service

## Security Considerations

- **Never commit `.env` files** to version control
- Use strong, randomly generated private keys
- Restrict `.env` file permissions: `chmod 600 .env`
- Consider using a secrets management system for production
- Regularly rotate private keys

## Integration with Hypernote

Once your MCP servers are running, you can reference them in Hypernote documents using their public keys:

```markdown
# In your Hypernote document
"#counter_ui": "naddr1qvzqqqrldqpzqtn2mzpatgf55man7r0fqcatzux7awq9ty4m4y9vwdgu7wfqhw7sqq9kx6r9wdej6cn0v9exgmqldu0"
```

The naddr encoding includes the server's public key, making it easy to connect to your MCP services from any Hypernote client.