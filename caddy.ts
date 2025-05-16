// Caddy setup script for reverse proxying to your app
// Run with: bun run caddy.ts

import { writeFileSync } from 'fs';
import readline from 'readline';
import { DOMAIN, SUBDOMAIN, FULL_DOMAIN, PORT } from './src/lib/utils';

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

async function promptPorkbunKeys(): Promise<{ apiKey: string; apiSecretKey: string } | null> {
  console.log(`📌 Porkbun DNS is required for wildcard certificates (*.${DOMAIN})`);
  console.log('   This will allow you to add more apps under different subdomains later');
  const apiKey = (await prompt('Enter your Porkbun API key: ')).trim();
  if (!apiKey) {
    console.log('No API key provided. Skipping DNS challenge config.');
    return null;
  }
  
  const apiSecretKey = (await prompt('Enter your Porkbun API Secret key: ')).trim();
  if (!apiSecretKey) {
    console.log('No API Secret key provided. Skipping DNS challenge config.');
    return null;
  }
  
  return { apiKey, apiSecretKey };
}

function buildCaddyConfig(domain: string, subdomain: string, proxyPort: number, porkbunKeys?: { apiKey: string; apiSecretKey: string }) {
  const fullDomain = `${subdomain}.${domain}`;
  
  // Initialize the config with a server that responds to the specific subdomain
  const config: any = {
    apps: {
      http: {
        servers: {
          elements: {
            listen: [":443", ":80"],
            routes: [
              {
                // Match only the specific subdomain, not all subdomains
                match: [{ host: [fullDomain] }],
                handle: [
                  {
                    handler: "reverse_proxy",
                    upstreams: [{ dial: `localhost:${proxyPort}` }],
                  },
                ],
              },
            ],
          },
        },
      },
    },
  };

  // Add Porkbun DNS challenge if keys are provided
  if (porkbunKeys) {
    // Add top-level DNS app config for Porkbun
    config.apps.tls = {
      automation: {
        policies: [
          {
            // Request a certificate for the base domain and a wildcard for all subdomains
            subjects: [domain, `*.${domain}`],
            issuer: {
              module: "acme",
              challenges: {
                dns: {
                  provider: {
                    name: "porkbun",
                    api_key: porkbunKeys.apiKey,
                    api_secret_key: porkbunKeys.apiSecretKey
                  }
                }
              }
            }
          }
        ]
      }
    };
  }

  return config;
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

function printInstructions(domain: string, subdomain: string, porkbunConfigured: boolean) {
  const fullDomain = `${subdomain}.${domain}`;
  
  console.log('\n================ HYPERNOTE ELEMENTS SETUP GUIDE ================\n');
  
  // DNS Configuration
  console.log('📋 DNS CONFIGURATION:');
  console.log(`1. Point your domain to this server's public IP address.`);
  console.log(`   - Set an A record for ${fullDomain} → your-server-ip`);
  
  if (porkbunConfigured) {
    console.log(`   - Wildcard certificates are enabled using Porkbun DNS for *.${domain}`);
    console.log('   - Caddy will automatically obtain and renew certificates for all subdomains.');
    console.log(`   - Future subdomains like another.${domain} will use the same certificate.`);
    console.log(`   - For each new subdomain, you'll need to:`);
    console.log(`     a) Set an A record for the subdomain -> your-server-ip`);
    console.log(`     b) Configure Caddy to route that subdomain to the appropriate application`);
  } else {
    console.log(`   - ⚠️ Porkbun DNS configuration is missing. Wildcard certificates for *.${domain} will not work.`);
    console.log('   - Re-run this script and provide your Porkbun API keys to enable wildcards.');
    console.log('   - Ensure Caddy is built with the Porkbun module:');
    console.log('     `xcaddy build --with github.com/caddy-dns/porkbun`');
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
  console.log(`1. Once DNS propagates, visit https://${fullDomain} in your browser.`);
  console.log('2. Check Caddy logs if you encounter any issues:');
  console.log('   `sudo journalctl -u caddy` (if using systemd)');
  console.log('   or wherever Caddy logs are stored on your system.');
  
  // Recovery
  console.log('\n📋 RECOVERY:');
  console.log('1. If you need to restore the previous Caddy config:');
  console.log('   - Locate the backup file created by this script');
  console.log('   - Use the Caddy API to reload it:');
  console.log('     `curl -X POST -H "Content-Type: application/json" -d @caddy-backup-[timestamp].json http://localhost:2019/load`');
  
  // Adding additional subdomains
  if (porkbunConfigured) {
    console.log('\n📋 ADDING MORE SUBDOMAINS LATER:');
    console.log(`1. Each new app should have its own subdomain, like another.${domain}`);
    console.log('2. Set DNS A records for each new subdomain.');
    console.log('3. Update your Caddy config to route the new subdomain to the right port.');
    console.log('   - You can use the Caddy API to add a new route without disrupting existing ones.');
  }
  
  console.log('\n================================================================\n');
}

async function main() {
  console.log('--- Hypernote Elements Caddy Setup ---\n');
  console.log(`This script will configure Caddy to reverse proxy https://${FULL_DOMAIN} to localhost:${PORT}`);
  console.log(`It will also attempt to set up wildcard certificates for *.${DOMAIN} if Porkbun credentials are provided.`);
  console.log('A backup of your current Caddy config will be created before making changes.');

  const proceed = (await prompt('Continue? (y/N): ')).trim().toLowerCase();
  if (proceed !== 'y') {
    console.log('Aborted.');
    process.exit(0);
  }

  // Get Porkbun credentials
  let porkbunKeys = await promptPorkbunKeys();
  const porkbunConfigured = !!porkbunKeys;
  
  if (!porkbunConfigured) {
    console.log(`⚠️ Skipping Porkbun DNS setup. Wildcard certificates for *.${DOMAIN} will not work.`);
  }

  try {
    await backupCaddyConfig();
    const config = buildCaddyConfig(DOMAIN, SUBDOMAIN, PORT, porkbunKeys || undefined);
    await postCaddyConfig(config);
    printInstructions(DOMAIN, SUBDOMAIN, porkbunConfigured);
  } catch (err: any) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();
