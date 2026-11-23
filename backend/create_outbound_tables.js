const path = require('path');
const mod = require(path.resolve(__dirname, '..', 'mobile', 'node_modules', 'postgres'));
const postgres = typeof mod === 'function' ? mod : mod.default || mod.postgres;

const DATABASE_URL = 'postgresql://postgres.swggqdgmbsikwibyhita:Abhishek%4054605@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';
const sql = postgres(DATABASE_URL);

async function setupOutboundTables() {
  try {
    console.log('[DB MIGRATION] Creating public.outbound_orders table...');
    await sql`
      CREATE TABLE IF NOT EXISTS public.outbound_orders (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        order_number varchar(100) NOT NULL UNIQUE,
        customer_name varchar(255) NOT NULL,
        status varchar(50) NOT NULL DEFAULT 'PENDING',
        priority varchar(50) NOT NULL DEFAULT 'NORMAL',
        delivery_date timestamptz,
        notes text,
        dispatched_by varchar(100) REFERENCES public.users(id),
        created_at timestamptz DEFAULT NOW(),
        updated_at timestamptz DEFAULT NOW()
      );
    `;

    console.log('[DB MIGRATION] Creating public.outbound_order_items table...');
    await sql`
      CREATE TABLE IF NOT EXISTS public.outbound_order_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id uuid NOT NULL REFERENCES public.outbound_orders(id) ON DELETE CASCADE,
        product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
        product_name varchar(255) NOT NULL,
        sku varchar(100) NOT NULL,
        required_qty integer NOT NULL,
        picked_qty integer NOT NULL DEFAULT 0,
        status varchar(50) NOT NULL DEFAULT 'PENDING',
        suggested_batch varchar(100),
        created_at timestamptz DEFAULT NOW(),
        updated_at timestamptz DEFAULT NOW()
      );
    `;

    // Check existing count
    const existingOrders = await sql`SELECT count(*) FROM public.outbound_orders`;
    console.log(`Current outbound_orders row count: ${existingOrders[0].count}`);

    if (parseInt(existingOrders[0].count, 10) === 0) {
      console.log('[DB SEED] Seeding real customer sales orders into PostgreSQL...');

      const seedOrders = [
        {
          orderNumber: 'ORD-2026-4412',
          customerName: 'Apollo Hospitals - Central Pharmacy',
          priority: 'URGENT',
          deliveryDays: 1,
          notes: 'Urgent ICU replenishment. Verify tamper seal and expiry date (10/2028).',
          productName: 'Calpol 650 Tablets',
          sku: 'MED-CALP-650',
          requiredQty: 20,
          suggestedBatch: 'BTH-CALP-2601',
        },
        {
          orderNumber: 'ORD-2026-4413',
          customerName: 'Fortis Healthcare - Pediatric Wing',
          priority: 'COLD_CHAIN',
          deliveryDays: 2,
          notes: 'Antibiotic order. Box of 10 Tablets. Verify Abbott QR code authenticity.',
          productName: 'Claribid 500 Tablets',
          sku: 'MED-CLAR-500',
          requiredQty: 15,
          suggestedBatch: 'BTH-CLAR-4091',
        },
        {
          orderNumber: 'ORD-2026-4414',
          customerName: 'Manipal Hospitals - Outpatient Dept',
          priority: 'NORMAL',
          deliveryDays: 3,
          notes: '3 Cartons x 6 Tablets. Verify 2D DataMatrix (GTIN: 00368094900188).',
          productName: 'Azithromycin Tablets USP 250mg',
          sku: 'MED-AZIT-250',
          requiredQty: 25,
          suggestedBatch: '4242407041',
        },
        {
          orderNumber: 'ORD-2026-4415',
          customerName: 'MIOT International - Acute Care',
          priority: 'URGENT',
          deliveryDays: 4,
          notes: 'Cardiology emergency replenishment. Amlodipine 5mg. Batch BTH-AMLO-5510.',
          productName: 'Amlokind 5 Tablets',
          sku: 'MED-AMLO-005',
          requiredQty: 30,
          suggestedBatch: 'BTH-AMLO-5510',
        },
        {
          orderNumber: 'ORD-2026-4416',
          customerName: 'Kauvery Hospital - Emergency Ward',
          priority: 'NORMAL',
          deliveryDays: 5,
          notes: 'Bottle of 60 Tablets. NDC: 16110-502-01. Barcode: 316110502014.',
          productName: 'Acticlate 150mg Tablets',
          sku: 'MED-ACTI-150',
          requiredQty: 20,
          suggestedBatch: 'BTH-ACTI-7812',
        },
        {
          orderNumber: 'ORD-2026-4417',
          customerName: 'SIMS Hospital - Inpatient Pharmacy',
          priority: 'URGENT',
          deliveryDays: 6,
          notes: 'Fever management ward batch dispatch. Calpol 650 15-tablet strips.',
          productName: 'Calpol 650 Tablets',
          sku: 'MED-CALP-650',
          requiredQty: 10,
          suggestedBatch: 'BTH-CALP-2601',
        },
      ];

      for (const order of seedOrders) {
        // Find product_id
        const pRows = await sql`SELECT id FROM public.products WHERE LOWER(sku) = ${order.sku.toLowerCase()} OR LOWER(name) = ${order.productName.toLowerCase()} LIMIT 1`;
        const prodId = pRows.length > 0 ? pRows[0].id : null;

        const delDate = new Date(Date.now() + order.deliveryDays * 86400000);

        const insertedOrder = await sql`
          INSERT INTO public.outbound_orders (order_number, customer_name, status, priority, delivery_date, notes)
          VALUES (${order.orderNumber}, ${order.customerName}, 'PENDING', ${order.priority}, ${delDate}, ${order.notes})
          RETURNING id
        `;

        await sql`
          INSERT INTO public.outbound_order_items (order_id, product_id, product_name, sku, required_qty, picked_qty, status, suggested_batch)
          VALUES (${insertedOrder[0].id}, ${prodId}, ${order.productName}, ${order.sku}, ${order.requiredQty}, 0, 'PENDING', ${order.suggestedBatch})
        `;
      }
      console.log(`[DB SEED SUCCESS] Successfully seeded ${seedOrders.length} customer sales orders into PostgreSQL!`);
    } else {
      console.log('[DB SEED] Orders already exist in PostgreSQL table, skipping seed.');
    }
  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    await sql.end();
  }
}

setupOutboundTables();
