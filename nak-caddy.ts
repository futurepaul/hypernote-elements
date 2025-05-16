// NAK WebSocket Relay Caddy setup script
// Run with: bun run nak-caddy.ts

import { writeFileSync } from 'fs';
import readline from 'readline';

// Configuration
const CADDY_API_URL = 'http://localhost:2019';
const DOMAIN = 'hypernote.dev';
const SUBDOMAIN = 'relay';
const FULL_DOMAIN = `${SUBDOMAIN}.${DOMAIN}`;
const NAK_WS_PORT = 10547;

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans); }));
}

async function backupCaddyConfig() {
  const res = await fetch(`${CADDY_API_URL}/config/`);
  if (!res.ok) throw new Error('Failed to fetch current Caddy config');
  const config = await res.json();
  const backupFile = `caddy-backup-${Date.now()}.json`;
  writeFileSync(backupFile, JSON.stringify(config, null, 2));
  console.log(`✅ Backed up current Caddy config to ${backupFile}`);
  return config;
}

function createNakRelayConfig(domain: string, subdomain: string, wsPort: number) {
  const fullDomain = `${subdomain}.${domain}`;
  
  // Create only the route configuration for the NAK relay
  return {
    match: [{ host: [fullDomain] }],
    handle: [
      {
        handler: "reverse_proxy",
        upstreams: [{ dial: `localhost:${wsPort}` }],
        // WebSocket-specific configuration
        transport: {
          protocol: "http",
          versions: ["1.1", "2"]
        },
        headers: {
          request: {
            add: {
              "Host": ["{http.reverse_proxy.upstream.host}"],
              "X-Forwarded-Host": ["{http.request.host}"]
            }
          }
        }
      },
    ],
  };
}

async function mergeWithExistingConfig(nakRelayRoute: any) {
  // Fetch the current Caddy config
  const res = await fetch(`${CADDY_API_URL}/config/`);
  if (!res.ok) throw new Error('Failed to fetch current Caddy config');
  const currentConfig = await res.json();

  // Make sure we have the HTTP app
  if (!currentConfig.apps || !currentConfig.apps.http || !currentConfig.apps.http.servers) {
    throw new Error('Current Caddy config does not have the expected structure');
  }

  // Find the first server (usually named 'srv0' or similar)
  const serverNames = Object.keys(currentConfig.apps.http.servers);
  if (serverNames.length === 0) {
    throw new Error('No HTTP servers found in current Caddy config');
  }

  // Use the first server to add our route, or create a new one
  const serverName = serverNames[0];
  const server = currentConfig.apps.http.servers[serverName];

  // Ensure the server has a routes array
  if (!server.routes) {
    server.routes = [];
  }

  // Add our new route to the beginning of the routes array
  server.routes.unshift(nakRelayRoute);

  return currentConfig;
}

async function postCaddyConfig(config: any) {
  const res = await fetch(`${CADDY_API_URL}/load`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to POST new config: ${text}`);
  }
  console.log('✅ Successfully posted new Caddy config!');
}

function printInstructions(domain: string, subdomain: string, wsPort: number) {
  const fullDomain = `${subdomain}.${domain}`;
  
  console.log('\n================ NAK WEBSOCKET RELAY SETUP GUIDE ================\n');
  
  // DNS Configuration
  console.log('📋 DNS CONFIGURATION:');
  console.log(`1. Point your domain to this server's public IP address.`);
  console.log(`   - Set an A record for ${fullDomain} → your-server-ip`);
  console.log('   - Using existing Caddy TLS configuration for certificate management');
  
  // Server Information
  console.log('\n📋 NAK WEBSOCKET RELAY INFO:');
  console.log(`1. Your NAK WebSocket relay is running on local port ${wsPort}`);
  console.log(`2. It's now accessible via wss://${fullDomain}`);
  console.log('3. Clients should connect using the secure WebSocket protocol (wss://)');
  console.log(`   - Example: const socket = new WebSocket("wss://${fullDomain}");`);
  
  // Verification
  console.log('\n📋 VERIFICATION:');
  console.log(`1. Check if the NAK service is running: \`systemctl status nak\``);
  console.log('2. Verify Caddy is running and logs show no errors');
  console.log('3. Test the WebSocket connection from a client');
  
  console.log('\n================================================================\n');
}

async function main() {
  console.log('--- NAK WebSocket Relay Caddy Setup ---\n');
  console.log(`This script will add a Caddy route to proxy wss://${FULL_DOMAIN} to ws://localhost:${NAK_WS_PORT}`);
  console.log('A backup of your current Caddy config will be created before making changes.');
  console.log('⚠️ This will preserve your existing routes, including elements.hypernote.dev');

  const proceed = (await prompt('Continue? (y/N): ')).trim().toLowerCase();
  if (proceed !== 'y') {
    console.log('Aborted.');
    process.exit(0);
  }

  try {
    // Backup the config first
    await backupCaddyConfig();
    
    // Create the NAK relay route configuration
    const nakRelayRoute = createNakRelayConfig(DOMAIN, SUBDOMAIN, NAK_WS_PORT);
    
    // Merge with the existing configuration
    const mergedConfig = await mergeWithExistingConfig(nakRelayRoute);
    
    // Post the updated config
    await postCaddyConfig(mergedConfig);
    
    printInstructions(DOMAIN, SUBDOMAIN, NAK_WS_PORT);
    
    console.log(`\n🎉 NAK WebSocket relay is now configured at wss://${FULL_DOMAIN}`);
    console.log('Make sure the NAK service is running: `systemctl status nak`');
    console.log('✅ Your existing Caddy routes have been preserved');
  } catch (err: any) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main(); 