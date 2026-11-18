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

// In-Memory Master Store for Outbound Customer Orders (Pick & Pack)
let outboundOrdersStore = [
  {
    id: 'ord-001',
    orderNumber: 'ORD-2026-4412',
    customerName: 'Apollo Hospitals - Central Pharmacy',
    status: 'PENDING',
    priority: 'URGENT',
    deliveryDate: new Date(Date.now() + 86400000).toISOString(),
    notes: 'Urgent ICU replenishment. Verify tamper seal and expiry.',
    items: [
      {
        id: 'ord-item-001',
        productName: 'Paracetamol 500mg Tablets',
        sku: 'MED-PARA-500',
        requiredQty: 20,
        pickedQty: 0,
        status: 'PENDING',
        suggestedBatch: 'BTH-PAR-26045',
      }
    ]
  },
  {
    id: 'ord-002',
    orderNumber: 'ORD-2026-4413',
    customerName: 'Fortis Healthcare - Pediatric Wing',
    status: 'PENDING',
    priority: 'COLD_CHAIN',
    deliveryDate: new Date(Date.now() + 172800000).toISOString(),
    notes: 'Pediatric suspension order. Maintain ambient temp below 25°C.',
    items: [
      {
        id: 'ord-item-002',
        productName: 'Amoxicillin 250mg Suspension',
        sku: 'MED-AMOX-250',
        requiredQty: 15,
        pickedQty: 0,
        status: 'PENDING',
        suggestedBatch: 'AMX-9082',
      }
    ]
  },
  {
    id: 'ord-003',
    orderNumber: 'ORD-2026-4414',
    customerName: 'Manipal Hospitals - Outpatient Dept',
    status: 'PENDING',
    priority: 'NORMAL',
    deliveryDate: new Date(Date.now() + 259200000).toISOString(),
    notes: 'Inpatient fever management stock replenishment.',
    items: [
      {
        id: 'ord-item-003',
        productName: 'Dolo 650 Paracetamol Tablets',
        sku: 'MED-DOLO-650',
        requiredQty: 50,
        pickedQty: 0,
        status: 'PENDING',
        suggestedBatch: 'BTH-DOLO-8821',
      }
    ]
  },
  {
    id: 'ord-004',
    orderNumber: 'ORD-2026-4415',
    customerName: 'MIOT International - Acute Care',
    status: 'PENDING',
    priority: 'URGENT',
    deliveryDate: new Date(Date.now() + 345600000).toISOString(),
    notes: 'Antidiarrheal emergency ward replenishment.',
    items: [
      {
        id: 'ord-item-004',
        productName: 'Loperamide 2mg Capsules',
        sku: 'MED-LOPE-002',
        requiredQty: 30,
        pickedQty: 0,
        status: 'PENDING',
        suggestedBatch: 'BTH-LOP-9901',
      }
    ]
  },
  {
    id: 'ord-005',
    orderNumber: 'ORD-2026-4416',
    customerName: 'Kauvery Hospital - Emergency Ward',
    status: 'PENDING',
    priority: 'NORMAL',
    deliveryDate: new Date(Date.now() + 432000000).toISOString(),
    notes: 'Emergency unit bulk order.',
    items: [
      {
        id: 'ord-item-005',
        productName: 'Dolo 650 Paracetamol Tablets',
        sku: 'MED-DOLO-650',
        requiredQty: 25,
        pickedQty: 0,
        status: 'PENDING',
        suggestedBatch: 'BTH-DOLO-8821',
      }
    ]
  },
  {
    id: 'ord-006',
    orderNumber: 'ORD-2026-4417',
    customerName: 'SIMS Hospital - Inpatient Pharmacy',
    status: 'PENDING',
    priority: 'URGENT',
    deliveryDate: new Date(Date.now() + 518400000).toISOString(),
    notes: 'Inpatient general ward batch delivery.',
    items: [
      {
        id: 'ord-item-006',
        productName: 'Paracetamol 500mg Tablets',
        sku: 'MED-PARA-500',
        requiredQty: 40,
        pickedQty: 0,
        status: 'PENDING',
        suggestedBatch: 'BATCH123',
      }
    ]
  }
];

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
  // Route 4.5: Get All Outbound Customer Orders (Pick & Pack)
  // -------------------------------------------------------------
  if (req.method === 'GET' && (urlPath === '/api/v1/orders' || urlPath === '/api/v1/picking/orders')) {
    try {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, orders: outboundOrdersStore }));
    } catch (orderErr) {
      console.error('[DB ORDERS ERROR]:', orderErr.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: orderErr.message }));
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
      let batch = null;
      let inventoryRow = null;

      if (cleanBatch) {
        let batchRows = await sql`
          SELECT id, batch_number, expiry_date, status FROM public.batches
          WHERE product_id = ${product.id} AND UPPER(batch_number) = ${cleanBatch}
          LIMIT 1
        `;
        if (batchRows.length > 0) {
          batch = batchRows[0];
          let invRows = await sql`
            SELECT id, quantity, location_code FROM public.inventory
            WHERE product_id = ${product.id} AND batch_id = ${batch.id}
            LIMIT 1
          `;
          if (invRows.length > 0) {
            inventoryRow = invRows[0];
          }
        }
      }

      // If specific batch not found or has no inventory, pick earliest expiring batch with stock (FIFO)
      if (!batch || !inventoryRow) {
        let availableBatches = await sql`
          SELECT b.id, b.batch_number, b.expiry_date, b.status, inv.id as inv_id, inv.quantity, inv.location_code
          FROM public.batches b
          JOIN public.inventory inv ON inv.batch_id = b.id
          WHERE b.product_id = ${product.id} AND inv.quantity > 0
          ORDER BY b.expiry_date ASC
          LIMIT 1
        `;
        if (availableBatches.length > 0) {
          const row = availableBatches[0];
          batch = { id: row.id, batch_number: row.batch_number, expiry_date: row.expiry_date, status: row.status };
          inventoryRow = { id: row.inv_id, quantity: row.quantity, location_code: row.location_code };
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            success: false,
            error: `No inventory stock available for product "${product.name}". Please receive stock before dispatching.`
          }));
        }
      }

      // 3. Check Inventory stock
      if (inventoryRow.quantity < numQty) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          success: false,
          error: `Insufficient stock for batch ${batch.batch_number}! Requested: ${numQty}, Available: ${inventoryRow.quantity}`
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
      const noteText = notes || `Outbound dispatch: ${orderNumber || 'Order'} - ${numQty} units of ${product.name} (Batch: ${batch.batch_number})`;
      const txRows = await sql`
        INSERT INTO public.inventory_transactions (product_id, batch_id, type, quantity, notes, created_by)
        VALUES (${product.id}, ${batch.id}, 'OUTBOUND', ${numQty}, ${noteText}, ${validUserId})
        RETURNING id, product_id, batch_id, type, quantity, notes, created_by, created_at
      `;

      console.log(`[DB DISPATCH SUCCESS] Dispatched ${numQty} units of ${product.name} (Batch: ${batch.batch_number}). Remaining stock: ${updatedInv[0].quantity}`);

      // Update outbound order in memory if orderNumber is matched
      if (orderNumber) {
        const order = outboundOrdersStore.find(o => o.orderNumber.toUpperCase() === orderNumber.trim().toUpperCase());
        if (order) {
          const item = order.items.find(i => i.sku.toUpperCase() === cleanSku.toUpperCase() || i.productName.toLowerCase() === cleanProdName.toLowerCase()) || order.items[0];
          if (item) {
            item.pickedQty = (item.pickedQty || 0) + numQty;
            item.status = item.pickedQty >= item.requiredQty ? 'COMPLETED' : 'IN_PROGRESS';
          }
          const allCompleted = order.items.every(i => i.status === 'COMPLETED');
          order.status = allCompleted ? 'DISPATCHED' : 'IN_PROGRESS';
          console.log(`[OUTBOUND ORDER UPDATE] Order ${order.orderNumber} status is now: ${order.status}`);
        }
      }

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
  // Route 6.1: Workflow 3 - Get Real Inventory Items for Stock Audit
  // -------------------------------------------------------------
  if (req.method === 'GET' && urlPath === '/api/v1/audit/tasks') {
    try {
      if (!sql) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'Database connection not initialized' }));
      }

      const items = await sql`
        SELECT 
          i.id AS "inventoryId",
          i.location_code AS "locationCode",
          i.quantity AS "systemQty",
          i.updated_at AS "lastUpdatedAt",
          p.id AS "productId",
          p.name AS "productName",
          p.sku,
          p.barcode,
          p.unit,
          p.pack_size AS "packSize",
          b.id AS "batchId",
          b.batch_number AS "batchNumber",
          b.expiry_date AS "expiryDate",
          b.status AS "batchStatus",
          (
            SELECT json_build_object(
              'id', sa.id,
              'variance', sa.variance,
              'status', sa.status,
              'createdAt', sa.created_at
            )
            FROM public.stock_audits sa
            WHERE sa.inventory_id = i.id
            ORDER BY sa.created_at DESC
            LIMIT 1
          ) AS "lastAudit"
        FROM public.inventory i
        JOIN public.products p ON p.id = i.product_id
        JOIN public.batches b ON b.id = i.batch_id
        ORDER BY i.location_code ASC, p.name ASC
      `;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, count: items.length, tasks: items }));
    } catch (auditErr) {
      console.error('[DB AUDIT TASKS ERROR]:', auditErr.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: auditErr.message }));
    }
  }

  // -------------------------------------------------------------
  // Route 6.2: Workflow 3 - Submit Physical Stock Count & Variance
  // -------------------------------------------------------------
  if (req.method === 'POST' && urlPath === '/api/v1/audit/submit') {
    try {
      if (!sql) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'Database connection not initialized' }));
      }

      const body = await parseJsonBody(req);
      const {
        inventoryId,
        productId,
        batchId,
        locationCode = 'BAY-01',
        systemQty,
        physicalQty,
        notes = '',
        userId
      } = body;

      const numSysQty = parseInt(systemQty, 10);
      const numPhysQty = parseInt(physicalQty, 10);

      if (isNaN(numSysQty) || isNaN(numPhysQty) || numPhysQty < 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          success: false,
          error: 'Valid non-negative physical count and system quantity required'
        }));
      }

      // Calculate variance: physical - system
      const variance = numPhysQty - numSysQty;
      const isMatched = variance === 0;
      const auditStatus = isMatched ? 'MATCHED' : 'PENDING_SUPERVISOR_APPROVAL';

      // Verify user id for foreign key
      let validUserId = null;
      if (userId) {
        const userCheck = await sql`SELECT id FROM public.users WHERE id = ${userId} OR LOWER(username) = ${String(userId).toLowerCase()} LIMIT 1`;
        if (userCheck.length > 0) validUserId = userCheck[0].id;
      }
      if (!validUserId) {
        const anyUser = await sql`SELECT id FROM public.users LIMIT 1`;
        if (anyUser.length > 0) validUserId = anyUser[0].id;
      }

      // Insert into stock_audits
      const insertedAudit = await sql`
        INSERT INTO public.stock_audits (
          inventory_id,
          product_id,
          batch_id,
          location_code,
          system_qty,
          physical_qty,
          variance,
          status,
          counted_by,
          notes
        )
        VALUES (
          ${inventoryId || null},
          ${productId},
          ${batchId || null},
          ${locationCode},
          ${numSysQty},
          ${numPhysQty},
          ${variance},
          ${auditStatus},
          ${validUserId},
          ${notes}
        )
        RETURNING id, inventory_id, product_id, batch_id, location_code, system_qty, physical_qty, variance, status, created_at
      `;

      // Log transaction if matched
      if (isMatched) {
        await sql`
          INSERT INTO public.inventory_transactions (product_id, batch_id, type, quantity, notes, created_by)
          VALUES (${productId}, ${batchId || null}, 'ADJUSTMENT', 0, ${'Physical stock count audit verified - 100% match (' + numPhysQty + ' units)'}, ${validUserId})
        `;
        console.log(`[AUDIT SUCCESS] 100% Match confirmed for inventory item ${inventoryId}. System: ${numSysQty}, Physical: ${numPhysQty}`);
      } else {
        console.log(`[AUDIT VARIANCE DETECTED] Variance of ${variance} units. Routed to Supervisor Review. Audit ID: ${insertedAudit[0].id}`);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        matched: isMatched,
        variance,
        status: auditStatus,
        message: isMatched
          ? 'Stock count verified & matched 100%. Audit confirmed.'
          : `Variance of ${variance > 0 ? '+' : ''}${variance} units detected. Discrepancy report routed to Supervisor for investigation.`,
        audit: insertedAudit[0]
      }));
    } catch (submitErr) {
      console.error('[DB AUDIT SUBMIT ERROR]:', submitErr);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: submitErr.message || 'Audit submission failed' }));
    }
  }

  // -------------------------------------------------------------
  // Route 6.3: Workflow 3 - Get Stock Audit History & Pending Approvals
  // -------------------------------------------------------------
  if (req.method === 'GET' && urlPath === '/api/v1/audit/history') {
    try {
      if (!sql) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'Database connection not initialized' }));
      }

      const history = await sql`
        SELECT 
          sa.id,
          sa.location_code AS "locationCode",
          sa.system_qty AS "systemQty",
          sa.physical_qty AS "physicalQty",
          sa.variance,
          sa.status,
          sa.notes,
          sa.created_at AS "createdAt",
          p.name AS "productName",
          p.sku,
          b.batch_number AS "batchNumber",
          u.username AS "countedByUser"
        FROM public.stock_audits sa
        JOIN public.products p ON p.id = sa.product_id
        LEFT JOIN public.batches b ON b.id = sa.batch_id
        LEFT JOIN public.users u ON u.id = sa.counted_by
        ORDER BY sa.created_at DESC
        LIMIT 50
      `;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, count: history.length, history }));
    } catch (histErr) {
      console.error('[DB AUDIT HISTORY ERROR]:', histErr.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: histErr.message }));
    }
  }

  // -------------------------------------------------------------
  // Route 6.3: Supervisor - Get All Pending Discrepancies (Audits & POs)
  // -------------------------------------------------------------
  if (req.method === 'GET' && urlPath === '/api/v1/supervisor/discrepancies') {
    try {
      if (!sql) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'Database connection not initialized' }));
      }

      // 1. Fetch pending stock audit variances
      const stockVariances = await sql`
        SELECT 
          sa.id,
          sa.inventory_id AS "inventoryId",
          sa.product_id AS "productId",
          sa.batch_id AS "batchId",
          sa.location_code AS "locationCode",
          sa.system_qty AS "systemQty",
          sa.physical_qty AS "physicalQty",
          sa.variance,
          sa.status,
          sa.notes,
          sa.counted_by AS "countedById",
          sa.created_at AS "createdAt",
          p.name AS "productName",
          p.sku,
          p.unit,
          b.batch_number AS "batchNumber",
          b.expiry_date AS "expiryDate",
          u.username AS "countedByName"
        FROM public.stock_audits sa
        JOIN public.products p ON p.id = sa.product_id
        LEFT JOIN public.batches b ON b.id = sa.batch_id
        LEFT JOIN public.users u ON u.id = sa.counted_by
        WHERE sa.status = 'PENDING_SUPERVISOR_APPROVAL'
        ORDER BY sa.created_at DESC
      `;

      // 2. Fetch inbound PO shipments flagged with discrepancy
      const poDiscrepancies = await sql`
        SELECT 
          s.id,
          s.po_number AS "poNumber",
          s.supplier_name AS "supplierName",
          s.status,
          s.notes,
          s.created_at AS "createdAt",
          s.updated_at AS "updatedAt",
          u.username AS "receivedByName"
        FROM public.inbound_shipments s
        LEFT JOIN public.users u ON u.id = s.received_by
        WHERE s.status = 'DISCREPANCY'
        ORDER BY s.updated_at DESC
      `;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        totalPending: stockVariances.length + poDiscrepancies.length,
        stockVariances,
        poDiscrepancies
      }));
    } catch (supErr) {
      console.error('[DB SUPERVISOR DISCREPANCIES ERROR]:', supErr.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: supErr.message }));
    }
  }

  // -------------------------------------------------------------
  // Route 6.4: Supervisor - Resolve Stock Audit Discrepancy (Approve / Reject)
  // -------------------------------------------------------------
  if (req.method === 'POST' && urlPath === '/api/v1/supervisor/resolve-audit') {
    try {
      if (!sql) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'Database connection not initialized' }));
      }

      const body = await parseJsonBody(req);
      const { auditId, decision, reason, supervisorId } = body;

      if (!auditId || !decision) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'auditId and decision (APPROVE/REJECT) required' }));
      }

      if (!reason || !reason.trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'Mandatory override justification reason is required by pharma policy' }));
      }

      // Fetch the audit record
      const auditRows = await sql`SELECT * FROM public.stock_audits WHERE id = ${auditId} LIMIT 1`;
      if (auditRows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'Audit record not found' }));
      }
      const audit = auditRows[0];

      if (decision === 'APPROVE') {
        // 1. Mark audit APPROVED
        await sql`
          UPDATE public.stock_audits
          SET 
            status = 'APPROVED',
            supervisor_id = ${supervisorId || 'SUPERVISOR'},
            supervisor_notes = ${reason.trim()},
            updated_at = NOW()
          WHERE id = ${auditId}
        `;

        // 2. Adjust active inventory balance to match verified physical count
        if (audit.inventory_id) {
          await sql`
            UPDATE public.inventory
            SET 
              quantity = ${audit.physical_qty},
              updated_at = NOW()
            WHERE id = ${audit.inventory_id}
          `;
        }

        // 3. Record transaction in audit history
        await sql`
          INSERT INTO public.inventory_transactions (
            product_id,
            batch_id,
            type,
            quantity,
            notes,
            created_by
          )
          VALUES (
            ${audit.product_id},
            ${audit.batch_id},
            'AUDIT_OVERRIDE',
            ${audit.variance},
            ${'Supervisor Approved Variance Override: ' + reason.trim()},
            ${supervisorId || 'SUPERVISOR'}
          )
        `;

        console.log(`[SUPERVISOR OVERRIDE APPROVED] Audit ${auditId} -> Inventory balance updated to ${audit.physical_qty}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          success: true,
          status: 'APPROVED',
          message: `Discrepancy approved and inventory balance updated to ${audit.physical_qty} units.`
        }));
      } else {
        // REJECT -> order physical recount
        await sql`
          UPDATE public.stock_audits
          SET 
            status = 'REJECTED_RECOUNT',
            supervisor_id = ${supervisorId || 'SUPERVISOR'},
            supervisor_notes = ${'Recount Ordered: ' + reason.trim()},
            updated_at = NOW()
          WHERE id = ${auditId}
        `;

        console.log(`[SUPERVISOR OVERRIDE REJECTED] Audit ${auditId} -> Recount ordered`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          success: true,
          status: 'REJECTED_RECOUNT',
          message: 'Discrepancy rejected. Stock recount order dispatched to warehouse floor.'
        }));
      }
    } catch (resErr) {
      console.error('[SUPERVISOR RESOLVE AUDIT ERROR]:', resErr.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: resErr.message }));
    }
  }

  // -------------------------------------------------------------
  // Route 6.5: Supervisor - Resolve Inbound PO Discrepancy
  // -------------------------------------------------------------
  if (req.method === 'POST' && urlPath === '/api/v1/supervisor/resolve-po') {
    try {
      if (!sql) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'Database connection not initialized' }));
      }

      const body = await parseJsonBody(req);
      const { poNumber, decision, reason, supervisorId } = body;

      if (!poNumber || !decision) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'poNumber and decision required' }));
      }

      if (!reason || !reason.trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'Mandatory reason is required' }));
      }

      const newStatus = decision === 'APPROVE' ? 'APPROVED_WITH_DEVIATION' : 'RETURN_TO_VENDOR';
      const actionText = decision === 'APPROVE' ? 'Supervisor Approved with Deviation' : 'Supervisor Confirmed Return to Vendor';
      const noteAppend = ` [${actionText}: ${reason.trim()} by ${supervisorId || 'SUPERVISOR'}]`;

      await sql`
        UPDATE public.inbound_shipments
        SET 
          status = ${newStatus},
          notes = CONCAT(COALESCE(notes, ''), ${noteAppend}),
          updated_at = NOW()
        WHERE po_number = ${poNumber}
      `;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        status: newStatus,
        message: `PO ${poNumber} updated to ${newStatus}.`
      }));
    } catch (poResErr) {
      console.error('[SUPERVISOR RESOLVE PO ERROR]:', poResErr.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: poResErr.message }));
    }
  }

  // -------------------------------------------------------------
  // Route 6.6: Admin - Update User Role
  // -------------------------------------------------------------
  if (req.method === 'POST' && urlPath === '/api/v1/admin/update-role') {
    try {
      if (!sql) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'Database connection not initialized' }));
      }

      const body = await parseJsonBody(req);
      const { userId, newRole } = body;

      if (!userId || !newRole) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'userId and newRole required' }));
      }

      const cleanRole = newRole.trim().toUpperCase();
      const updated = await sql`
        UPDATE public.users
        SET role = ${cleanRole}, updated_at = NOW()
        WHERE id = ${userId}
        RETURNING id, username, email, role, updated_at
      `;

      if (updated.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'User not found' }));
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, user: updated[0] }));
    } catch (roleErr) {
      console.error('[ADMIN ROLE UPDATE ERROR]:', roleErr.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: roleErr.message }));
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
