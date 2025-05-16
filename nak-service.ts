// Systemd setup script for creating a service that runs the nak server
// Run with: bun run nak-service.ts

import { writeFileSync } from 'fs';
import { execSync } from 'child_process';
import readline from 'readline';
import path from 'path';
import os from 'os';

const SERVICE_NAME = 'nak';
const SYSTEMD_DIR = '/etc/systemd/system';
const NAK_COMMAND = 'serve';

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

function getNakBinaryPath(user: string): string {
  return `/home/${user}/go/bin/nak`;
}

function getCurrentWorkingDirectory(): string {
  return process.cwd();
}

function buildSystemdConfig(appName: string, user: string, workingDir: string): string {
  const nakBinaryPath = getNakBinaryPath(user);
  
  return `[Unit]
Description=${appName}
After=network.target

[Service]
Type=simple
User=${user}
WorkingDirectory=${workingDir}
ExecStart=${nakBinaryPath} ${NAK_COMMAND}
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

function printInstructions(serviceName: string, serviceFilePath: string, user: string) {
  const nakBinaryPath = getNakBinaryPath(user);
  
  console.log('\n================ SYSTEMD SERVICE SETUP GUIDE ================\n');
  
  // Installation instructions
  console.log('📋 MANUAL INSTALLATION (if automatic install failed):');
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
  console.log('2. Make sure the NAK binary has the correct permissions');
  console.log(`3. Verify that ${nakBinaryPath} exists and is executable`);
  console.log('4. Ensure the working directory exists and is accessible');
  console.log('5. Verify that the user running the service has permission to access all required files');
  
  console.log('\n================================================================\n');
}

async function main() {
  console.log('--- NAK Service Setup ---\n');
  console.log('This script will create a systemd service file for the NAK server.');
  console.log('You can then install this service to automatically start the NAK server on system boot.');

  const proceed = (await prompt('Continue? (y/N): ')).trim().toLowerCase();
  if (proceed !== 'y') {
    console.log('Aborted.');
    process.exit(0);
  }

  // Get default values
  const defaultUser = getCurrentUser();
  const defaultWorkingDir = getCurrentWorkingDirectory();
  const defaultAppName = 'NAK Server';

  // Prompt for customization
  console.log('\nPlease confirm or customize the following settings:');
  
  const appName = (await prompt(`Application name [${defaultAppName}]: `)).trim() || defaultAppName;
  const user = (await prompt(`User to run the service [${defaultUser}]: `)).trim() || defaultUser;
  const workingDir = (await prompt(`Working directory [${defaultWorkingDir}]: `)).trim() || defaultWorkingDir;
  const customServiceName = (await prompt(`Service name [${SERVICE_NAME}]: `)).trim() || SERVICE_NAME;

  try {
    const config = buildSystemdConfig(appName, user, workingDir);
    const serviceFilePath = writeServiceFile(customServiceName, config);
    
    // Check if we should attempt automatic installation
    const hasSudo = checkSudo();
    
    if (hasSudo) {
      const shouldInstall = (await prompt('Do you want to automatically install and start the service? (y/N): ')).trim().toLowerCase() === 'y';
      
      if (shouldInstall) {
        const success = installService(serviceFilePath, customServiceName);
        if (success) {
          console.log(`\n🎉 Service ${customServiceName} has been successfully installed and started!`);
        } else {
          console.log('\n⚠️ Automatic installation encountered issues. Please refer to the manual instructions below.');
        }
      } else {
        console.log('\n📋 Skipping automatic installation. Please refer to the manual instructions below.');
      }
    } else {
      console.log('\n⚠️ Sudo access is required for automatic installation. Please enter your password when prompted or follow manual instructions.');
      
      const shouldInstall = (await prompt('Do you want to attempt installation with sudo? (y/N): ')).trim().toLowerCase() === 'y';
      
      if (shouldInstall) {
        const success = installService(serviceFilePath, customServiceName);
        if (success) {
          console.log(`\n🎉 Service ${customServiceName} has been successfully installed and started!`);
        } else {
          console.log('\n⚠️ Automatic installation encountered issues. Please refer to the manual instructions below.');
        }
      } else {
        console.log('\n📋 Skipping automatic installation. Please refer to the manual instructions below.');
      }
    }
    
    printInstructions(customServiceName, serviceFilePath, user);
  } catch (err: any) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main(); 