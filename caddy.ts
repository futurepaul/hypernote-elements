// Caddy setup script for reverse proxying to your app
// Run with: bun run caddy.ts

import { writeFileSync } from 'fs';
import readline from 'readline';
import { DOMAIN, PORT } from './src/lib/utils';

const CADDY_API_URL = 'http://localhost:2019';

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
}

async function promptDnsProvider(): Promise<{ provider: string; apiKey: string } | null> {
  const provider = (await prompt('Enter your DNS provider for wildcard certs (e.g., cloudflare), or leave blank to skip: ')).trim();
  if (!provider) return null;
  const apiKey = (await prompt(`Enter your API key/token for ${provider}: `)).trim();
  if (!apiKey) {
    console.log('No API key provided. Skipping DNS challenge config.');
    return null;
  }
  return { provider, apiKey };
}

function buildCaddyConfig(domain: string, proxyPort: number, dnsProviderConfig?: { provider: string; apiKey: string }) {
  const tlsConnectionPolicy: any = {};
  if (dnsProviderConfig) {
    tlsConnectionPolicy.issuer = {
      module: "acme",
      challenges: {
        dns: {
          provider: {
            name: dnsProviderConfig.provider,
            api_token: dnsProviderConfig.apiKey,
          },
        },
      },
    };
  }
  return {
    apps: {
      http: {
        servers: {
          elements: {
            listen: [":443", ":80"],
            routes: [
              {
                match: [{ host: [domain] }],
                handle: [
                  {
                    handler: "reverse_proxy",
                    upstreams: [{ dial: `localhost:${proxyPort}` }],
                  },
                ],
              },
            ],
            tls_connection_policies: [tlsConnectionPolicy],
          },
        },
      },
    },
  };
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

function printInstructions(domain: string, dnsProviderConfig?: { provider: string; apiKey: string } | null) {
  console.log('\n================ HYPERNOTE ELEMENTS SETUP GUIDE ================\n');
  
  // DNS Configuration
  console.log('📋 DNS CONFIGURATION:');
  console.log(`1. Point your domain (${domain}) to this server's public IP address.`);
  console.log('   - Set an A record for the main domain (e.g., elements.hypernote.dev → your-server-ip).');
  if (dnsProviderConfig) {
    console.log(`   - Wildcard certificates are enabled using the ${dnsProviderConfig.provider} DNS provider.`);
    console.log('   - Caddy will automatically obtain and renew certificates for all subdomains.');
  } else {
    console.log('   - If you want wildcard certificates (*.example.com):');
    console.log('     > Set an A record for the wildcard subdomain (e.g., *.elements.hypernote.dev → your-server-ip).');
    console.log('     > Re-run this script and provide your DNS provider and API key.');
    console.log('     > Ensure Caddy has the appropriate DNS provider module installed:');
    console.log('       `xcaddy build --with github.com/caddy-dns/[provider]`');
  }
  console.log('   - DNS propagation may take up to 24-48 hours, but typically happens within minutes.');
  
  // Server Requirements
  console.log('\n📋 SERVER REQUIREMENTS:');
  console.log('1. Ensure ports 80 and 443 are open in your firewall/security group.');
  console.log('   - These ports are required for HTTP/HTTPS and certificate validation.');
  console.log('2. Caddy must have permission to bind to ports 80 and 443.');
  console.log('   - You may need to run Caddy with elevated privileges or use setcap:');
  console.log('     `sudo setcap cap_net_bind_service=+ep $(which caddy)`');
  
  // Application Setup
  console.log('\n📋 APPLICATION SETUP:');
  console.log(`1. Your Bun server is configured to run on port ${PORT}.`);
  console.log('2. Start your application in production mode:');
  console.log('   `bun run start`');
  console.log('3. To run as a background service that survives terminal disconnects:');
  console.log('   `nohup bun run start > app.log 2>&1 &`');
  console.log('   - View logs with: `tail -f app.log`');
  
  // Verification
  console.log('\n📋 VERIFICATION:');
  console.log(`1. Once DNS propagates, visit https://${domain} in your browser.`);
  console.log('2. Check Caddy logs if you encounter any issues:');
  console.log('   `sudo journalctl -u caddy` (if using systemd)');
  console.log('   or wherever Caddy logs are stored on your system.');
  
  // Recovery
  console.log('\n📋 RECOVERY:');
  console.log('1. If you need to restore the previous Caddy config:');
  console.log('   - Locate the backup file created by this script');
  console.log('   - Use the Caddy API to reload it:');
  console.log('     `curl -X POST -H "Content-Type: application/json" -d @caddy-backup-[timestamp].json http://localhost:2019/load`');
  
  console.log('\n================================================================\n');
}

async function main() {
  console.log('--- Hypernote Elements Caddy Setup ---\n');
  console.log(`This script will configure Caddy to reverse proxy https://${DOMAIN} to localhost:${PORT}`);
  console.log('It will backup your current Caddy config before making changes.');

  const proceed = (await prompt('Continue? (y/N): ')).trim().toLowerCase();
  if (proceed !== 'y') {
    console.log('Aborted.');
    process.exit(0);
  }

  let dnsProviderConfig: { provider: string; apiKey: string } | null = null;
  dnsProviderConfig = await promptDnsProvider();
  if (!dnsProviderConfig) {
    console.log('⚠️  Skipping DNS challenge config. Wildcard certificates may not work unless your DNS provider is configured in Caddy.');
  }

  try {
    await backupCaddyConfig();
    const config = buildCaddyConfig(DOMAIN, PORT, dnsProviderConfig || undefined);
    await postCaddyConfig(config);
    printInstructions(DOMAIN, dnsProviderConfig);
  } catch (err: any) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();
