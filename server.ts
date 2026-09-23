import express from 'express';
import http from 'http';
import path from 'path';
import { spawn } from 'child_process';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const FLASK_PORT = 5001; // Internal port for Python Flask

const baseDir = process.cwd();
const backendScript = path.join(baseDir, 'backend', 'app.py');
const frontendDir = path.join(baseDir, 'frontend');

console.log('[Server] Launching Python Flask backend daemon on port', FLASK_PORT);

// Spawn Python Flask process
const flaskProcess = spawn('python3', [backendScript], {
  env: {
    ...process.env,
    PORT: String(FLASK_PORT),
    PYTHONUNBUFFERED: '1',
  },
  stdio: 'inherit',
});

flaskProcess.on('error', (err) => {
  console.error('[Server] Failed to start Python Flask process:', err);
});

flaskProcess.on('exit', (code, signal) => {
  console.log(`[Server] Flask process exited with code ${code} / signal ${signal}`);
});

// Clean up child process on parent exit
process.on('SIGINT', () => {
  flaskProcess.kill();
  process.exit();
});
process.on('SIGTERM', () => {
  flaskProcess.kill();
  process.exit();
});
process.on('exit', () => {
  flaskProcess.kill();
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
      message: 'Flask backend is initializing or encountered an issue. Please retry in a few seconds.',
    });
  });

  req.pipe(proxyReq);
});

// Serve frontend static assets (HTML, CSS, JS)
app.use(express.static(frontendDir));

// Fallback to frontend index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] EDA Dashboard running at http://0.0.0.0:${PORT}`);
  console.log(`[Server] Proxying /api to Flask at http://127.0.0.1:${FLASK_PORT}`);
});
