import express from 'express';
import http from 'http';
import path from 'path';
import { spawn, execSync, ChildProcess } from 'child_process';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const FLASK_PORT = process.env.FLASK_PORT ? parseInt(process.env.FLASK_PORT, 10) : 5001;

const baseDir = process.cwd();
const backendScript = path.join(baseDir, 'backend', 'app.py');
const frontendDir = path.join(baseDir, 'frontend');

// Detect available python binary across Windows, macOS, Linux, and custom VS Code virtual environments
function resolvePythonBinary(): string {
  if (process.env.PYTHON_PATH) return process.env.PYTHON_PATH;
  if (process.env.PYTHON) return process.env.PYTHON;

  const candidates = process.platform === 'win32'
    ? ['python', 'py', 'python3']
    : ['python3', 'python'];

  for (const cmd of candidates) {
    try {
      execSync(`${cmd} --version`, { stdio: 'ignore' });
      return cmd;
    } catch {
      // Continue searching candidates
    }
  }

  return process.platform === 'win32' ? 'python' : 'python3';
}

const pythonBin = resolvePythonBinary();
console.log(`[Server] Detected Python binary: "${pythonBin}"`);
console.log(`[Server] Launching Python Flask backend daemon on port ${FLASK_PORT}...`);

// Spawn Python Flask process
let flaskProcess: ChildProcess | null = null;
try {
  flaskProcess = spawn(pythonBin, [backendScript], {
    env: {
      ...process.env,
      PORT: String(FLASK_PORT),
      PYTHONUNBUFFERED: '1',
    },
    stdio: 'inherit',
  });

  flaskProcess.on('error', (err) => {
    console.error(`[Server] Error spawning Python process (${pythonBin}):`, err.message);
    console.error('[Server] Hint: Ensure Python is installed, added to PATH, and requirements are installed (pip install -r requirements.txt)');
  });

  flaskProcess.on('exit', (code, signal) => {
    console.log(`[Server] Flask process exited (code: ${code}, signal: ${signal})`);
  });
} catch (err) {
  console.error('[Server] Failed to initialize Flask subprocess:', err);
}

// Clean up child process on parent exit
function cleanupChildProcess() {
  if (flaskProcess && !flaskProcess.killed) {
    try {
      flaskProcess.kill();
    } catch {
      // Process already terminated
    }
  }
}

process.on('SIGINT', () => {
  cleanupChildProcess();
  process.exit();
});
process.on('SIGTERM', () => {
  cleanupChildProcess();
  process.exit();
});
process.on('exit', () => {
  cleanupChildProcess();
});

// Enable CORS for all API routes (supports VS Code Live Server on 5500, Chrome, Edge, and external tools)
app.use('/api', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

// Reverse proxy /api calls to Flask
app.use('/api', (req, res) => {
  const options = {
    hostname: '127.0.0.1',
    port: FLASK_PORT,
    path: req.originalUrl,
    method: req.method,
    headers: {
      ...req.headers,
      host: `127.0.0.1:${FLASK_PORT}`,
    },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('[Server] API Proxy error to Flask:', err.message);
    res.status(502).json({
      success: false,
      message: 'Flask backend is initializing or encountered an issue. Please verify Flask is running or retry shortly.',
    });
  });

  req.pipe(proxyReq);
});

// Favicon handler to prevent 404 logs in Chrome, Edge, and other browsers
app.get('/favicon.ico', (req, res) => {
  res.setHeader('Content-Type', 'image/svg+xml');
  res.send(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>`);
});

// Serve frontend static assets (HTML, CSS, JS)
app.use(express.static(frontendDir));

// Fallback to frontend index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(` EDA Studio Dashboard Server Active`);
  console.log(` Access Local URL : http://localhost:${PORT}`);
  console.log(` Network URL      : http://0.0.0.0:${PORT}`);
  console.log(` Python API Proxy : http://127.0.0.1:${FLASK_PORT}/api`);
  console.log(` Compatible with  : VS Code, Google Chrome, Microsoft Edge, Safari, Firefox`);
  console.log(`======================================================\n`);
});
