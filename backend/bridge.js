const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Load environment variables from mobile/.env if present
const mobileEnvPath = path.resolve(__dirname, '..', 'mobile', '.env');
let DATABASE_URL = 'postgresql://postgres.swggqdgmbsikwibyhita:Abhishek%4054605@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';

if (fs.existsSync(mobileEnvPath)) {
  const content = fs.readFileSync(mobileEnvPath, 'utf8');
  for (const line of content.split('\n')) {
    const match = line.match(/^DATABASE_URL\s*=\s*["']?([^"'\r\n]+)["']?/);
    if (match) {
      DATABASE_URL = match[1];
      break;
    }
  }
}

// PostgreSQL Client
let sql = null;
try {
  const mod = require(path.resolve(__dirname, '..', 'mobile', 'node_modules', 'postgres'));
  const postgres = typeof mod === 'function' ? mod : mod.default || mod.postgres;
  sql = postgres(DATABASE_URL, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  console.log('[NODE BRIDGE] Connected to PostgreSQL DB on Supabase Pooler!');
} catch (dbErr) {
  console.warn('[NODE BRIDGE] PostgreSQL driver init notice:', dbErr.message);
}

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

// Start Python OCR microservice
startPythonOcrService();

// Helper to read request body JSON
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const urlPath = req.url.split('?')[0];

  // -------------------------------------------------------------
  // Route 1: Register User in PostgreSQL Database
  // -------------------------------------------------------------
  if (req.method === 'POST' && urlPath === '/api/v1/auth/register') {
    try {
      const data = await parseJsonBody(req);
      const { username, email, password, role } = data;

      if (!username || !email || !password) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'Username, email and password are required' }));
      }

      if (!sql) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'Database connection not initialized' }));
      }

      const cleanEmail = email.trim().toLowerCase();

      // Check if email already exists
      const existing = await sql`
        SELECT id FROM public.users 
        WHERE LOWER(email) = ${cleanEmail}
        LIMIT 1
      `;

      if (existing.length > 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'Mail id already exists' }));
      }

      const id = `USR-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
      const cleanRole = (role || 'OPERATOR').toUpperCase();

      const inserted = await sql`
        INSERT INTO public.users (id, username, email, password, role)
        VALUES (${id}, ${username.trim()}, ${cleanEmail}, ${password}, ${cleanRole})
        RETURNING id, username, email, role, created_at
      `;

      console.log(`[DB AUTH] User registered successfully in PostgreSQL: ${cleanEmail} (${id})`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        user: inserted[0]
      }));
    } catch (authErr) {
      console.error('[DB AUTH ERROR]:', authErr.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: authErr.message || 'Database registration failed' }));
    }
  }

  // -------------------------------------------------------------
  // Route 2: Login User against PostgreSQL Database
  // -------------------------------------------------------------
  if (req.method === 'POST' && urlPath === '/api/v1/auth/login') {
    try {
      const data = await parseJsonBody(req);
      const { emailOrUsername, password } = data;

      if (!emailOrUsername || !password) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'Email/username and password are required' }));
      }

      if (!sql) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'Database connection not initialized' }));
      }

      const query = emailOrUsername.trim().toLowerCase();

      const found = await sql`
        SELECT id, username, email, password, role
        FROM public.users
        WHERE LOWER(email) = ${query} OR LOWER(username) = ${query}
        LIMIT 1
      `;

      if (found.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'No account found with this email or username' }));
      }

      const user = found[0];
      if (user.password !== password) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'Incorrect password. Please verify and try again.' }));
      }

      console.log(`[DB AUTH] User logged in successfully: ${user.email} (${user.role})`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          fullName: user.username,
          email: user.email,
          role: user.role,
        }
      }));
    } catch (loginErr) {
      console.error('[DB LOGIN ERROR]:', loginErr.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: loginErr.message || 'Database login failed' }));
    }
  }

  // -------------------------------------------------------------
  // Route 3: Get All Users from PostgreSQL Database
  // -------------------------------------------------------------
  if (req.method === 'GET' && urlPath === '/api/v1/auth/users') {
    try {
      if (!sql) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'Database connection not initialized' }));
      }

      const allUsers = await sql`
        SELECT id, username, email, role, created_at, updated_at
        FROM public.users
        ORDER BY created_at DESC
      `;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, users: allUsers }));
    } catch (usersErr) {
      console.error('[DB USERS ERROR]:', usersErr.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: usersErr.message }));
    }
  }

  // -------------------------------------------------------------
  // Route 4: Forward All Other Requests to Python FastAPI (OCR)
  // -------------------------------------------------------------
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
  console.log(`[NODE BRIDGE] OCR Gateway & DB Auth listening on http://0.0.0.0:${PORT} -> Forwarding OCR to Python :${PYTHON_TARGET_PORT}`);
});

process.on('exit', () => {
  if (pythonProc) pythonProc.kill();
  if (sql) sql.end();
});
