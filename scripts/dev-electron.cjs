const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const electronBinary = require('electron');
const projectRoot = path.resolve(__dirname, '..');
const watchedFiles = [
  path.join(projectRoot, 'dist', 'main', 'main.js'),
  path.join(projectRoot, 'dist', 'preload', 'preload.js')
];

let child = null;
let restartTimer = null;
let shuttingDown = false;
let pendingRestart = false;

function launchElectron() {
  if (shuttingDown) {
    return;
  }

  const env = {
    ...process.env,
    VITE_DEV_SERVER_URL: 'http://localhost:5173'
  };
  delete env.ELECTRON_RUN_AS_NODE;

  child = spawn(electronBinary, ['.'], {
    cwd: projectRoot,
    stdio: 'inherit',
    env
  });

  child.on('exit', (code) => {
    const wasRestart = pendingRestart;
    pendingRestart = false;
    child = null;

    if (shuttingDown) {
      return;
    }

    if (wasRestart) {
      launchElectron();
      return;
    }

    process.exit(typeof code === 'number' ? code : 0);
  });
}

function restartElectron() {
  if (shuttingDown) {
    return;
  }

  if (!child) {
    launchElectron();
    return;
  }

  pendingRestart = true;
  child.kill();
}

function scheduleRestart() {
  if (restartTimer) {
    clearTimeout(restartTimer);
  }
  restartTimer = setTimeout(() => {
    restartTimer = null;
    restartElectron();
  }, 250);
}

function cleanupAndExit() {
  shuttingDown = true;
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }

  for (const filePath of watchedFiles) {
    fs.unwatchFile(filePath);
  }

  if (!child) {
    process.exit(0);
    return;
  }

  const current = child;
  pendingRestart = false;
  child = null;
  current.once('exit', () => {
    process.exit(0);
  });
  current.kill();
}

for (const filePath of watchedFiles) {
  fs.watchFile(filePath, { interval: 400 }, (current, previous) => {
    if (current.mtimeMs === 0 || current.mtimeMs === previous.mtimeMs) {
      return;
    }
    scheduleRestart();
  });
}

process.on('SIGINT', cleanupAndExit);
process.on('SIGTERM', cleanupAndExit);

launchElectron();
