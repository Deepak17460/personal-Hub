#!/usr/bin/env node
// Runs the emulator test project inside `firebase emulators:exec`.
// On Windows the Firestore emulator's Java process can outlive emulators:exec and keep port 8080
// busy, which makes the next run fail; afterwards we stop only that leftover emulator process.
import { spawnSync } from 'node:child_process';

const PROJECT = 'demo-personal-hub';
const command = `firebase emulators:exec --only firestore,auth --project ${PROJECT} "vitest run --project emulator --no-file-parallelism"`;

const result = spawnSync(command, { stdio: 'inherit', shell: true });

if (process.platform === 'win32') {
  const ps = [
    "Get-CimInstance Win32_Process -Filter \"Name='java.exe'\"",
    `| Where-Object { $_.CommandLine -match 'cloud-firestore-emulator' -and $_.CommandLine -match '${PROJECT}' }`,
    '| ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }',
  ].join(' ');
  spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'ignore' });
}

process.exit(result.status ?? 1);
