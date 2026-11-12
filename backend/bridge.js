const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const PORT = 8080;
const PYTHON_TARGET_PORT = 8001;
const PYTHON_EXE = 'C:\\Users\\kjabh\\AppData\\Local\\Programs\\Python\\Python311\\python.exe';

let pythonProc = null;

function startPythonOcrService() {
  console.log('[NODE BRIDGE] Spawning Python OCR service (FastAPI / EasyOCR)...');
  pythonProc = spawn(PYTHON_EXE, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(PYTHON_TARGET_PORT)], {
    cwd: __dirname,
    env: { ...process.env, PYTHONUNBUFFERED: '1' }
  });

  pythonProc.stdout.on('data', (data) => {
    console.log(`[PYTHON OCR] ${data.toString().trim()}`);
  });

  pythonProc.stderr.on('data', (data) => {
    console.log(`[PYTHON OCR] ${data.toString().trim()}`);
  });

  pythonProc.on('close', (code) => {
    console.log(`[PYTHON OCR] Process exited with code ${code}. Restarting in 2s...`);
    setTimeout(startPythonOcrService, 2000);
  });
}

// Start Python OCR automatically
startPythonOcrService();

const server = http.createServer((req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Proxy request to Python FastAPI on 127.0.0.1:8001
  const options = {
    hostname: '127.0.0.1',
    port: PYTHON_TARGET_PORT,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: `127.0.0.1:${PYTHON_TARGET_PORT}`,
    },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    console.error('[BRIDGE ERROR] Could not reach Python OCR microservice on 8001:', err.message);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: 'Backend OCR microservice connection failed on port 8001',
      details: err.message,
    }));
  });

  req.pipe(proxyReq, { end: true });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[NODE BRIDGE] OCR Gateway listening on http://0.0.0.0:${PORT} -> Forwarding to Python :${PYTHON_TARGET_PORT}`);
});

process.on('exit', () => {
  if (pythonProc) pythonProc.kill();
});
