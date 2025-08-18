// Systemd setup script for creating services that run MCP servers
// Run with: bun run mcp-service.ts

import { writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import readline from 'readline';
import path from 'path';
import os from 'os';

const SYSTEMD_DIR = '/etc/systemd/system';
const MCP_SERVERS = [
  { name: 'mcp-counter', script: 'mcp-counter-server.ts', envVar: 'COUNTER_SERVER_KEY' },
  { name: 'mcp-chess', script: 'mcp-chess-server.ts', envVar: 'CHESS_SERVER_KEY' }
];

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans); }));
}

function getCurrentUser(): string {
  try {
    return execSync('whoami').toString().trim();
  } catch (error) {
    console.error('Failed to get current user:', error);
    return os.userInfo().username;
  }
}

function getBunPath(): string {
  try {
    return execSync('which bun').toString().trim();
  } catch (error) {
    console.error('Failed to find bun:', error);
    // Common default locations
    const homeBun = path.join(os.homedir(), '.bun/bin/bun');
    if (existsSync(homeBun)) return homeBun;
    return '/usr/local/bin/bun';
  }
}

function getCurrentWorkingDirectory(): string {
  return process.cwd();
}

function buildSystemdConfig(
  serverName: string, 
  scriptPath: string, 
  user: string, 
  workingDir: string,
  envVar: string
): string {
  const bunPath = getBunPath();
  const fullScriptPath = path.join(workingDir, scriptPath);
  
  return `[Unit]
Description=MCP ${serverName} Server
After=network.target

[Service]
Type=simple
User=${user}
WorkingDirectory=${workingDir}
Environment="NODE_ENV=production"
EnvironmentFile=${workingDir}/.env
ExecStart=${bunPath} run ${fullScriptPath}
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${serverName}

# Resource limits
LimitNOFILE=4096
TimeoutStartSec=60

[Install]
WantedBy=multi-user.target
`;
}

function writeServiceFile(serviceName: string, config: string): string {
  const filename = `${serviceName}.service`;
  writeFileSync(filename, config);
  console.log(`✅ Service file created: ${filename}`);
  return filename;
}

function checkSudo(): boolean {
  try {
    execSync('sudo -n true', { stdio: 'ignore' });
    return true;
  } catch (error) {
    return false;
  }
}

function installService(serviceFilePath: string, serviceName: string): boolean {
  try {
    console.log(`📋 Installing service to ${SYSTEMD_DIR}...`);
    execSync(`sudo cp ${serviceFilePath} ${SYSTEMD_DIR}/`, { stdio: 'inherit' });
    console.log('✅ Service file copied successfully');
    
    console.log('📋 Reloading systemd daemon...');
    execSync('sudo systemctl daemon-reload', { stdio: 'inherit' });
    console.log('✅ Systemd daemon reloaded');
    
    console.log(`📋 Enabling ${serviceName} service...`);
    execSync(`sudo systemctl enable ${serviceName}`, { stdio: 'inherit' });
    console.log(`✅ Service ${serviceName} enabled`);
    
    console.log(`📋 Starting ${serviceName} service...`);
    execSync(`sudo systemctl start ${serviceName}`, { stdio: 'inherit' });
    console.log(`✅ Service ${serviceName} started`);
    
    // Check if service is running successfully
    const status = execSync(`systemctl is-active ${serviceName} || echo 'inactive'`).toString().trim();
    
    if (status === 'active') {
      console.log(`✅ Service ${serviceName} is running successfully!`);
      return true;
    } else {
      console.warn(`⚠️ Service ${serviceName} may not be running correctly. Check status for details.`);
      return false;
    }
  } catch (error: any) {
    console.error('❌ Error during service installation:', error.message);
    return false;
  }
}

function createEnvFile(workingDir: string) {
  const envPath = path.join(workingDir, '.env');
  
  if (existsSync(envPath)) {
    console.log('✅ .env file already exists');
    return;
  }
  
  const envContent = `# MCP Server Private Keys
# Replace these with your actual 32-byte private keys in hex format

# Counter server private key
COUNTER_SERVER_KEY=your-32-byte-counter-server-private-key-in-hex

# Chess server private key
CHESS_SERVER_KEY=your-32-byte-chess-server-private-key-in-hex

# Add more server keys as needed
`;
  
  writeFileSync(envPath, envContent);
  console.log(`✅ Created .env file at ${envPath}`);
  console.log('⚠️  IMPORTANT: Edit the .env file and add your actual private keys before starting the services!');
}

function printInstructions(servers: typeof MCP_SERVERS, workingDir: string) {
  console.log('\n================ MCP SERVICES SETUP GUIDE ================\n');
  
  // Environment setup
  console.log('📋 ENVIRONMENT SETUP:');
  console.log(`1. Edit the .env file in ${workingDir}:`);
  console.log(`   nano ${path.join(workingDir, '.env')}`);
  console.log('2. Add your private keys for each server:');
  servers.forEach(server => {
    console.log(`   ${server.envVar}=<your-32-byte-hex-key>`);
  });
  
  // Service management
  console.log('\n📋 SERVICE MANAGEMENT:');
  servers.forEach(server => {
    console.log(`\n${server.name}:`);
    console.log(`  Start:   sudo systemctl start ${server.name}`);
    console.log(`  Stop:    sudo systemctl stop ${server.name}`);
    console.log(`  Restart: sudo systemctl restart ${server.name}`);
    console.log(`  Status:  sudo systemctl status ${server.name}`);
    console.log(`  Logs:    sudo journalctl -u ${server.name} -f`);
  });
  
  // All services commands
  console.log('\n📋 ALL SERVICES:');
  const serviceNames = servers.map(s => s.name).join(' ');
  console.log(`  Start all:   sudo systemctl start ${serviceNames}`);
  console.log(`  Stop all:    sudo systemctl stop ${serviceNames}`);
  console.log(`  Restart all: sudo systemctl restart ${serviceNames}`);
  
  // Testing locally
  console.log('\n📋 TESTING LOCALLY (without systemd):');
  servers.forEach(server => {
    console.log(`  bun run ${server.script}`);
  });
  
  // Troubleshooting
  console.log('\n📋 TROUBLESHOOTING:');
  console.log('1. If a service fails to start, check the logs:');
  console.log('   sudo journalctl -u <service-name> -e');
  console.log('2. Verify the .env file has valid private keys');
  console.log('3. Check that all dependencies are installed:');
  console.log('   bun install');
  console.log('4. Ensure the working directory and scripts exist');
  console.log('5. Test the server locally first before using systemd');
  
  // Getting public keys
  console.log('\n📋 GETTING SERVER PUBLIC KEYS:');
  console.log('After starting the services, check the logs to see the public keys:');
  servers.forEach(server => {
    console.log(`  sudo journalctl -u ${server.name} | grep "Public Key"`);
  });
  
  console.log('\n================================================================\n');
}

async function main() {
  console.log('--- MCP Services Setup ---\n');
  console.log('This script will create systemd service files for MCP servers.');
  console.log('MCP servers communicate over Nostr, so no port configuration is needed.');
  console.log('You will need to provide private keys in a .env file.\n');

  const proceed = (await prompt('Continue? (y/N): ')).trim().toLowerCase();
  if (proceed !== 'y') {
    console.log('Aborted.');
    process.exit(0);
  }

  // Get default values
  const defaultUser = getCurrentUser();
  const defaultWorkingDir = getCurrentWorkingDirectory();

  // Prompt for customization
  console.log('\nPlease confirm or customize the following settings:');
  
  const user = (await prompt(`User to run the services [${defaultUser}]: `)).trim() || defaultUser;
  const workingDir = (await prompt(`Working directory [${defaultWorkingDir}]: `)).trim() || defaultWorkingDir;
  
  // Create .env file if it doesn't exist
  createEnvFile(workingDir);
  
  // Ask which servers to set up
  console.log('\nAvailable MCP servers:');
  MCP_SERVERS.forEach((server, i) => {
    console.log(`  ${i + 1}. ${server.name} (${server.script})`);
  });
  console.log(`  ${MCP_SERVERS.length + 1}. All servers`);
  
  const serverChoice = await prompt(`Which servers to set up? (1-${MCP_SERVERS.length + 1}) [All]: `);
  let selectedServers = MCP_SERVERS;
  
  if (serverChoice && serverChoice !== (MCP_SERVERS.length + 1).toString()) {
    const index = parseInt(serverChoice) - 1;
    if (index >= 0 && index < MCP_SERVERS.length) {
      selectedServers = [MCP_SERVERS[index]];
    }
  }

  try {
    const serviceFiles: { name: string; path: string }[] = [];
    
    // Create service files
    for (const server of selectedServers) {
      const config = buildSystemdConfig(
        server.name,
        server.script,
        user,
        workingDir,
        server.envVar
      );
      const serviceFilePath = writeServiceFile(server.name, config);
      serviceFiles.push({ name: server.name, path: serviceFilePath });
    }
    
    // Check if we should attempt automatic installation
    const hasSudo = checkSudo();
    
    if (hasSudo || (await prompt('Do you want to attempt installation with sudo? (y/N): ')).trim().toLowerCase() === 'y') {
      const shouldInstall = (await prompt('Do you want to automatically install and start the services? (y/N): ')).trim().toLowerCase() === 'y';
      
      if (shouldInstall) {
        let allSuccess = true;
        for (const service of serviceFiles) {
          const success = installService(service.path, service.name);
          if (!success) allSuccess = false;
        }
        
        if (allSuccess) {
          console.log('\n🎉 All services have been successfully installed!');
          console.log('⚠️  Remember to edit the .env file with your actual private keys!');
        } else {
          console.log('\n⚠️ Some services encountered issues. Please check the logs.');
        }
      } else {
        console.log('\n📋 Skipping automatic installation. Service files have been created.');
      }
    } else {
      console.log('\n📋 Service files created. Follow the manual instructions below for installation.');
    }
    
    printInstructions(selectedServers, workingDir);
    
  } catch (err: any) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();