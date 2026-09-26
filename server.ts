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

// Spawn Python Flask process with automatic restart
let flaskProcess: ChildProcess | null = null;
let isShuttingDown = false;
let restartAttempts = 0;
const MAX_RESTARTS = 15;

function startFlaskProcess() {
  if (isShuttingDown) return;

  try {
    if (process.platform !== 'win32') {
      execSync(`fuser -k ${FLASK_PORT}/tcp 2>/dev/null || true`, { stdio: 'ignore' });
    }
  } catch {
    // ignore
  }

  console.log(`[Server] Starting Python Flask backend daemon (port ${FLASK_PORT})...`);
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
    });

    flaskProcess.on('exit', (code, signal) => {
      console.log(`[Server] Flask process exited (code: ${code}, signal: ${signal})`);
      flaskProcess = null;
      if (!isShuttingDown && restartAttempts < MAX_RESTARTS) {
        restartAttempts++;
        const delay = Math.min(1000 * restartAttempts, 5000);
        console.log(`[Server] Restarting Flask backend in ${delay}ms (attempt ${restartAttempts}/${MAX_RESTARTS})...`);
        setTimeout(startFlaskProcess, delay);
      }
    });
  } catch (err) {
    console.error('[Server] Failed to initialize Flask subprocess:', err);
  }
}

startFlaskProcess();

// Clean up child process on parent exit
function cleanupChildProcess() {
  isShuttingDown = true;
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

// Reverse proxy /api calls to Flask with retry resilience
app.use('/api', (req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const bodyBuffer = Buffer.concat(chunks);

    const forwardRequest = (retriesLeft: number) => {
      const options = {
        hostname: '127.0.0.1',
        port: FLASK_PORT,
        path: req.originalUrl,
        method: req.method,
        headers: {
          ...req.headers,
          host: `127.0.0.1:${FLASK_PORT}`,
          'content-length': String(bodyBuffer.length),
        },
      };

      const proxyReq = http.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
        proxyRes.pipe(res);
      });

      proxyReq.on('error', (err: any) => {
        if (retriesLeft > 0 && (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET')) {
          setTimeout(() => forwardRequest(retriesLeft - 1), 350);
          return;
        }

        console.error('[Server] API Proxy error to Flask:', err.message);
        if (!res.headersSent) {
          res.status(502).json({
            success: false,
            message: 'Flask backend is initializing. Please wait a moment and try again.',
          });
        }
      });

      if (bodyBuffer.length > 0) {
        proxyReq.write(bodyBuffer);
      }
      proxyReq.end();
    };

    forwardRequest(4);
  });
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
