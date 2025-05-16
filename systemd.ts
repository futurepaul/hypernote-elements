// Systemd setup script for creating a service that automates your app startup
// Run with: bun run systemd.ts

import { writeFileSync } from 'fs';
import { execSync } from 'child_process';
import readline from 'readline';
import { DOMAIN, SUBDOMAIN, FULL_DOMAIN, PORT } from './src/lib/utils';
import path from 'path';
import os from 'os';

const SERVICE_NAME = 'hypernote-elements';

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

function getCurrentWorkingDirectory(): string {
  return process.cwd();
}

function getBunPath(): string {
  try {
    return execSync('which bun').toString().trim();
  } catch (error) {
    console.error('Failed to find bun path:', error);
    return `/home/${getCurrentUser()}/.bun/bin/bun`;
  }
}

function buildSystemdConfig(appName: string, user: string, workingDir: string, bunPath: string): string {
  return `[Unit]
Description=${appName}
After=network.target

[Service]
Type=simple
User=${user}
WorkingDirectory=${workingDir}
ExecStart=${bunPath} run start
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${appName}

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

function printInstructions(serviceName: string, serviceFilePath: string) {
  console.log('\n================ SYSTEMD SERVICE SETUP GUIDE ================\n');
  
  // Installation instructions
  console.log('📋 INSTALLATION:');
  console.log(`1. Copy the service file to the systemd directory:`);
  console.log(`   sudo cp ${serviceFilePath} /etc/systemd/system/`);
  console.log('2. Reload systemd to recognize the new service:');
  console.log('   sudo systemctl daemon-reload');
  console.log(`3. Enable the service to start on boot:`);
  console.log(`   sudo systemctl enable ${serviceName}`);
  console.log(`4. Start the service:`);
  console.log(`   sudo systemctl start ${serviceName}`);
  
  // Management instructions
  console.log('\n📋 SERVICE MANAGEMENT:');
  console.log(`1. Check status of the service:`);
  console.log(`   sudo systemctl status ${serviceName}`);
  console.log('2. View logs:');
  console.log(`   sudo journalctl -u ${serviceName} -f`);
  console.log('3. Restart the service:');
  console.log(`   sudo systemctl restart ${serviceName}`);
  console.log('4. Stop the service:');
  console.log(`   sudo systemctl stop ${serviceName}`);
  console.log('5. Disable service from starting on boot:');
  console.log(`   sudo systemctl disable ${serviceName}`);
  
  // Troubleshooting
  console.log('\n📋 TROUBLESHOOTING:');
  console.log('1. If the service fails to start, check the logs:');
  console.log(`   sudo journalctl -u ${serviceName} -e`);
  console.log('2. Make sure the bun executable has the correct permissions');
  console.log('3. Ensure the working directory exists and is accessible');
  console.log('4. Verify that the user running the service has permission to access all required files');
  
  console.log('\n================================================================\n');
}

async function main() {
  console.log('--- Hypernote Elements Systemd Setup ---\n');
  console.log('This script will create a systemd service file for your application.');
  console.log('You can then install this service to automatically start your app on system boot.');

  const proceed = (await prompt('Continue? (y/N): ')).trim().toLowerCase();
  if (proceed !== 'y') {
    console.log('Aborted.');
    process.exit(0);
  }

  // Get default values
  const defaultUser = getCurrentUser();
  const defaultWorkingDir = getCurrentWorkingDirectory();
  const defaultBunPath = getBunPath();
  const defaultAppName = 'Hypernote Elements';

  // Prompt for customization
  console.log('\nPlease confirm or customize the following settings:');
  
  const appName = (await prompt(`Application name [${defaultAppName}]: `)).trim() || defaultAppName;
  const user = (await prompt(`User to run the service [${defaultUser}]: `)).trim() || defaultUser;
  const workingDir = (await prompt(`Working directory [${defaultWorkingDir}]: `)).trim() || defaultWorkingDir;
  const bunPath = (await prompt(`Path to bun executable [${defaultBunPath}]: `)).trim() || defaultBunPath;
  const customServiceName = (await prompt(`Service name [${SERVICE_NAME}]: `)).trim() || SERVICE_NAME;

  try {
    const config = buildSystemdConfig(appName, user, workingDir, bunPath);
    const serviceFilePath = writeServiceFile(customServiceName, config);
    printInstructions(customServiceName, serviceFilePath);
  } catch (err: any) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();
