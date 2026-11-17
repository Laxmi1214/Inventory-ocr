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
const localVenvPython = path.resolve(__dirname, '..', 'ocr-service', '.venv', 'Scripts', 'python.exe');
const uvPython = 'C:\\Users\\Admin\\AppData\\Roaming\\uv\\python\\cpython-3.11.18-windows-x86_64-none\\python.exe';
const PYTHON_EXE = fs.existsSync(localVenvPython) ? localVenvPython : (fs.existsSync(uvPython) ? uvPython : 'python');

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
  // Route 0: Health Check Endpoint
  // -------------------------------------------------------------
  if (req.method === 'GET' && (urlPath === '/health' || urlPath === '/api/v1/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      status: 'healthy',
      service: 'Node Bridge & PostgreSQL Gateway',
      dbConnected: !!sql,
      timestamp: new Date().toISOString()
    }));
  }

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
      if (user.password !== password && user.password !== password.trim()) {
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
  // Route 4: Get All Inbound Shipments (Real POs) from DB
  // -------------------------------------------------------------
  if (req.method === 'GET' && urlPath === '/api/v1/receiving/shipments') {
    try {
      if (!sql) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'Database connection not initialized' }));
      }

      const shipments = await sql`
        SELECT 
          s.id,
          s.po_number AS "poNumber",
          s.supplier_name AS "supplierName",
          s.status,
          s.expected_delivery_date AS "expectedDeliveryDate",
          s.notes,
          s.created_at AS "createdAt",
          COALESCE(
            json_agg(
              json_build_object(
                'id', i.id,
                'shipmentId', i.shipment_id,
                'productId', i.product_id,
                'expectedBatch', i.expected_batch,
                'expectedQty', i.expected_qty,
                'receivedQty', i.received_qty,
                'status', i.status,
                'product', json_build_object(
                  'id', p.id,
                  'sku', p.sku,
                  'name', p.name,
                  'barcode', p.barcode,
                  'packSize', p.pack_size,
                  'unit', p.unit
                )
              )
            ) FILTER (WHERE i.id IS NOT NULL),
            '[]'::json
          ) AS items
        FROM public.inbound_shipments s
        LEFT JOIN public.inbound_shipment_items i ON i.shipment_id = s.id
        LEFT JOIN public.products p ON p.id = i.product_id
        GROUP BY s.id
        ORDER BY s.created_at DESC
      `;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, shipments }));
    } catch (shipErr) {
      console.error('[DB SHIPMENTS ERROR]:', shipErr.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: shipErr.message }));
    }
  }

  // -------------------------------------------------------------
  // Route 5: Receive Item & Commit to Real PostgreSQL Inventory
  // -------------------------------------------------------------
  if (req.method === 'POST' && urlPath === '/api/v1/receiving/receive-item') {
    try {
      if (!sql) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'Database connection not initialized' }));
      }

      const body = await parseJsonBody(req);
      const {
        poNumber,
        productName,
        sku,
        batchNumber,
        mfgDate,
        expiryDate,
        quantity,
        price,
        userId,
        locationCode = 'BAY-01'
      } = body;

      const numQty = parseInt(quantity, 10);
      if (isNaN(numQty) || numQty <= 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'Valid received quantity greater than 0 is required' }));
      }

      const cleanProdName = (productName || 'Pharmaceutical Item').trim();
      const cleanSku = (sku || `MED-${cleanProdName.substring(0, 4).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`).trim();
      const cleanBatch = (batchNumber || `BATCH-${Date.now().toString().slice(-6)}`).trim().toUpperCase();

      // Helper function for date parsing into PostgreSQL compatible timestamp
      function parseDbDate(dateStr, isExpiry = false) {
        if (!dateStr || typeof dateStr !== 'string') {
          return isExpiry ? new Date(Date.now() + 2 * 365 * 86400000) : null;
        }
        const clean = dateStr.trim();
        if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(clean)) {
          const d = new Date(clean);
          if (!isNaN(d.getTime())) return d;
        }
        const dmy = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        if (dmy) {
          const d = new Date(`${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`);
          if (!isNaN(d.getTime())) return d;
        }
        const my = clean.match(/^(\d{1,2})[\/\-](\d{4})$/);
        if (my) {
          const day = isExpiry ? '28' : '01';
          const d = new Date(`${my[2]}-${my[1].padStart(2, '0')}-${day}`);
          if (!isNaN(d.getTime())) return d;
        }
        const myShort = clean.match(/^(\d{1,2})[\/\-](\d{2})$/);
        if (myShort) {
          const year = `20${myShort[2]}`;
          const day = isExpiry ? '28' : '01';
          const d = new Date(`${year}-${myShort[1].padStart(2, '0')}-${day}`);
          if (!isNaN(d.getTime())) return d;
        }
        const d = new Date(clean);
        if (!isNaN(d.getTime())) return d;
        return isExpiry ? new Date(Date.now() + 2 * 365 * 86400000) : null;
      }

      // 1. Find or insert Product
      let productRows = await sql`
        SELECT id, sku, name, barcode, pack_size, unit
        FROM public.products
        WHERE LOWER(sku) = ${cleanSku.toLowerCase()} OR LOWER(name) = ${cleanProdName.toLowerCase()}
        LIMIT 1
      `;
      let product = productRows[0];
      if (!product) {
        const inserted = await sql`
          INSERT INTO public.products (sku, name, unit)
          VALUES (${cleanSku}, ${cleanProdName}, 'BOX')
          RETURNING id, sku, name, barcode, pack_size, unit
        `;
        product = inserted[0];
        console.log(`[DB RECEIVE] Created new product in DB: ${cleanProdName} (${cleanSku})`);
      }

      // 2. Find or insert Batch
      const parsedMfg = parseDbDate(mfgDate, false);
      const parsedExp = parseDbDate(expiryDate, true);

      let batchRows = await sql`
        SELECT id, batch_number, expiry_date, status
        FROM public.batches
        WHERE product_id = ${product.id} AND UPPER(batch_number) = ${cleanBatch}
        LIMIT 1
      `;
      let batch = batchRows[0];
      if (!batch) {
        const inserted = await sql`
          INSERT INTO public.batches (product_id, batch_number, mfg_date, expiry_date, status)
          VALUES (${product.id}, ${cleanBatch}, ${parsedMfg}, ${parsedExp}, 'ACTIVE')
          RETURNING id, batch_number, expiry_date, status
        `;
        batch = inserted[0];
        console.log(`[DB RECEIVE] Created new batch in DB: ${cleanBatch} for product ${product.name}`);
      }

      // 3. User verification for foreign key constraint
      let validUserId = null;
      if (userId) {
        const userCheck = await sql`SELECT id FROM public.users WHERE id = ${userId} OR LOWER(username) = ${String(userId).toLowerCase()} LIMIT 1`;
        if (userCheck.length > 0) validUserId = userCheck[0].id;
      }
      if (!validUserId) {
        const anyUser = await sql`SELECT id FROM public.users LIMIT 1`;
        if (anyUser.length > 0) validUserId = anyUser[0].id;
      }

      // 4. Update Inbound Shipment and Item
      let shipmentId = null;
      if (poNumber) {
        const shipRows = await sql`
          SELECT id FROM public.inbound_shipments 
          WHERE LOWER(po_number) = ${poNumber.trim().toLowerCase()} 
          LIMIT 1
        `;
        if (shipRows.length > 0) {
          shipmentId = shipRows[0].id;
          const itemRows = await sql`
            SELECT id, expected_qty, received_qty 
            FROM public.inbound_shipment_items
            WHERE shipment_id = ${shipmentId} AND product_id = ${product.id}
            LIMIT 1
          `;
          if (itemRows.length > 0) {
            const item = itemRows[0];
            const newQty = (item.received_qty || 0) + numQty;
            const newStatus = newQty >= item.expected_qty ? 'COMPLETED' : 'IN_PROGRESS';
            await sql`
              UPDATE public.inbound_shipment_items
              SET received_qty = ${newQty}, status = ${newStatus}, updated_at = NOW()
              WHERE id = ${item.id}
            `;
          } else {
            await sql`
              INSERT INTO public.inbound_shipment_items (shipment_id, product_id, expected_batch, expected_qty, received_qty, status)
              VALUES (${shipmentId}, ${product.id}, ${cleanBatch}, ${numQty}, ${numQty}, 'COMPLETED')
            `;
          }

          // Check if all items in shipment are completed
          const remainingItems = await sql`
            SELECT id FROM public.inbound_shipment_items
            WHERE shipment_id = ${shipmentId} AND status != 'COMPLETED'
            LIMIT 1
          `;
          const shipStatus = remainingItems.length === 0 ? 'COMPLETED' : 'IN_PROGRESS';
          await sql`
            UPDATE public.inbound_shipments
            SET status = ${shipStatus}, received_by = ${validUserId}, updated_at = NOW()
            WHERE id = ${shipmentId}
          `;
        }
      }

      // 5. Upsert Inventory
      const invRows = await sql`
        SELECT id, quantity FROM public.inventory
        WHERE product_id = ${product.id} AND batch_id = ${batch.id} AND location_code = ${locationCode}
        LIMIT 1
      `;
      let inventoryRow;
      if (invRows.length > 0) {
        const updated = await sql`
          UPDATE public.inventory
          SET quantity = quantity + ${numQty}, updated_at = NOW()
          WHERE id = ${invRows[0].id}
          RETURNING id, product_id, batch_id, location_code, quantity
        `;
        inventoryRow = updated[0];
      } else {
        const inserted = await sql`
          INSERT INTO public.inventory (product_id, batch_id, location_code, quantity)
          VALUES (${product.id}, ${batch.id}, ${locationCode}, ${numQty})
          RETURNING id, product_id, batch_id, location_code, quantity
        `;
        inventoryRow = inserted[0];
      }

      // 6. Insert Inventory Transaction
      const noteText = `PO ${poNumber || 'N/A'} received (${cleanProdName}, Batch: ${cleanBatch}, Qty: ${numQty}${price ? ', Price: ₹' + price : ''})`;
      const txRows = await sql`
        INSERT INTO public.inventory_transactions (product_id, batch_id, type, quantity, notes, created_by)
        VALUES (${product.id}, ${batch.id}, 'INBOUND', ${numQty}, ${noteText}, ${validUserId})
        RETURNING id, product_id, batch_id, type, quantity, notes, created_by, created_at
      `;

      console.log(`[DB RECEIVE SUCCESS] Stock updated in DB: +${numQty} units of ${cleanProdName}. Current batch stock: ${inventoryRow.quantity}`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        message: 'Stock successfully committed to PostgreSQL database',
        product,
        batch,
        inventory: inventoryRow,
        transaction: txRows[0]
      }));
    } catch (recErr) {
      console.error('[DB RECEIVE ERROR]:', recErr);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: recErr.message || 'Database receiving transaction failed' }));
    }
  }

  // -------------------------------------------------------------
  // Route 5.2: Flag Purchase Order Discrepancy & Quarantine in DB
  // -------------------------------------------------------------
  if (req.method === 'POST' && urlPath === '/api/v1/receiving/flag-discrepancy') {
    try {
      if (!sql) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'Database connection not initialized' }));
      }

      const body = await parseJsonBody(req);
      const { poNumber, itemId, reasons = [], notes } = body;

      if (!poNumber) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'PO Number is required' }));
      }

      const discrepancyNote = ` [DISCREPANCY: ${reasons.join('; ')}${notes ? ' - ' + notes : ''}]`;

      // Update PO status to DISCREPANCY
      await sql`
        UPDATE public.inbound_shipments
        SET status = 'DISCREPANCY',
            notes = COALESCE(notes, '') || ${discrepancyNote},
            updated_at = NOW()
        WHERE LOWER(po_number) = ${poNumber.trim().toLowerCase()}
      `;

      if (itemId) {
        await sql`
          UPDATE public.inbound_shipment_items
          SET status = 'DISCREPANCY',
              updated_at = NOW()
          WHERE id = ${itemId}
        `;
      }

      console.log(`[DISCREPANCY LOGGED] PO ${poNumber} marked as DISCREPANCY: ${reasons.join(', ')}`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        message: `PO ${poNumber} marked as DISCREPANCY. Goods quarantined.`,
        poNumber,
        reasons
      }));
    } catch (discErr) {
      console.error('[DB DISCREPANCY ERROR]:', discErr);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: discErr.message || 'Failed to flag discrepancy' }));
    }
  }

  // -------------------------------------------------------------
  // Route 5.5: Dispatch Item (Pick & Pack Outbound) in PostgreSQL
  // -------------------------------------------------------------
  if (req.method === 'POST' && urlPath === '/api/v1/inventory/dispatch-item') {
    try {
      if (!sql) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'Database connection not initialized' }));
      }

      const body = await parseJsonBody(req);
      const {
        productName,
        sku,
        batchNumber,
        quantity,
        orderNumber,
        notes,
        userId
      } = body;

      const numQty = parseInt(quantity, 10);
      if (isNaN(numQty) || numQty <= 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'Valid dispatch quantity greater than 0 is required' }));
      }

      const cleanProdName = (productName || '').trim();
      const cleanSku = (sku || '').trim();
      const cleanBatch = (batchNumber || '').trim().toUpperCase();

      // 1. Find Product
      let prodRows = await sql`
        SELECT id, sku, name FROM public.products
        WHERE LOWER(sku) = ${cleanSku.toLowerCase()} OR LOWER(name) = ${cleanProdName.toLowerCase()}
        LIMIT 1
      `;
      if (prodRows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: `Product "${cleanProdName || cleanSku}" not found in database.` }));
      }
      const product = prodRows[0];

      // 2. Find Batch
      let batchRows = await sql`
        SELECT id, batch_number, expiry_date, status FROM public.batches
        WHERE product_id = ${product.id} AND UPPER(batch_number) = ${cleanBatch}
        LIMIT 1
      `;
      if (batchRows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: `Batch "${cleanBatch}" of ${product.name} not found in database.` }));
      }
      const batch = batchRows[0];

      // 3. Find and check Inventory stock
      let invRows = await sql`
        SELECT id, quantity, location_code FROM public.inventory
        WHERE product_id = ${product.id} AND batch_id = ${batch.id}
        LIMIT 1
      `;
      if (invRows.length === 0 || invRows[0].quantity <= 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: `No available stock for batch ${cleanBatch} of ${product.name}.` }));
      }
      const inventoryRow = invRows[0];
      if (inventoryRow.quantity < numQty) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          success: false,
          error: `Insufficient stock! Requested: ${numQty}, Available: ${inventoryRow.quantity}`
        }));
      }

      // 4. Decrement Inventory
      const updatedInv = await sql`
        UPDATE public.inventory
        SET quantity = quantity - ${numQty}, updated_at = NOW()
        WHERE id = ${inventoryRow.id}
        RETURNING id, product_id, batch_id, location_code, quantity
      `;

      // 5. User verification for foreign key
      let validUserId = null;
      if (userId) {
        const userCheck = await sql`SELECT id FROM public.users WHERE id = ${userId} OR LOWER(username) = ${String(userId).toLowerCase()} LIMIT 1`;
        if (userCheck.length > 0) validUserId = userCheck[0].id;
      }
      if (!validUserId) {
        const anyUser = await sql`SELECT id FROM public.users LIMIT 1`;
        if (anyUser.length > 0) validUserId = anyUser[0].id;
      }

      // 6. Record OUTBOUND Transaction
      const noteText = notes || `Outbound dispatch: ${orderNumber || 'Order'} - ${numQty} units of ${product.name} (Batch: ${cleanBatch})`;
      const txRows = await sql`
        INSERT INTO public.inventory_transactions (product_id, batch_id, type, quantity, notes, created_by)
        VALUES (${product.id}, ${batch.id}, 'OUTBOUND', ${numQty}, ${noteText}, ${validUserId})
        RETURNING id, product_id, batch_id, type, quantity, notes, created_by, created_at
      `;

      console.log(`[DB DISPATCH SUCCESS] Dispatched ${numQty} units of ${product.name} (Batch: ${cleanBatch}). Remaining stock: ${updatedInv[0].quantity}`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        message: 'Stock successfully dispatched from PostgreSQL database',
        product,
        batch,
        inventory: updatedInv[0],
        transaction: txRows[0]
      }));
    } catch (dispErr) {
      console.error('[DB DISPATCH ERROR]:', dispErr);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: dispErr.message || 'Database dispatch transaction failed' }));
    }
  }

  // -------------------------------------------------------------
  // Route 6: Get Live Inventory Metrics from PostgreSQL
  // -------------------------------------------------------------
  if (req.method === 'GET' && urlPath === '/api/v1/inventory/metrics') {
    try {
      if (!sql) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'Database connection not initialized' }));
      }

      const stockRow = await sql`SELECT COALESCE(SUM(quantity), 0) AS total_in_stock, COUNT(DISTINCT product_id) AS total_products FROM public.inventory`;
      const inRow = await sql`SELECT COALESCE(SUM(quantity), 0) AS total_income FROM public.inventory_transactions WHERE type = 'INBOUND'`;
      const outRow = await sql`SELECT COALESCE(SUM(quantity), 0) AS total_go FROM public.inventory_transactions WHERE type = 'OUTBOUND'`;
      const shipRow = await sql`SELECT COUNT(*) AS total_pos, COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed_pos FROM public.inbound_shipments`;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        metrics: {
          totalInStock: parseInt(stockRow[0].total_in_stock, 10) || 0,
          totalIncome: parseInt(inRow[0].total_income, 10) || 0,
          totalGo: parseInt(outRow[0].total_go, 10) || 0,
          medicineCount: parseInt(stockRow[0].total_products, 10) || 0,
          totalShipments: parseInt(shipRow[0].total_pos, 10) || 0,
          completedShipments: parseInt(shipRow[0].completed_pos, 10) || 0,
        }
      }));
    } catch (metricErr) {
      console.error('[DB METRICS ERROR]:', metricErr.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: metricErr.message }));
    }
  }

  // -------------------------------------------------------------
  // Route 7: Forward All Other Requests to Python FastAPI (OCR)
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
