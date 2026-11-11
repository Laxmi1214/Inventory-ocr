const mod = require('postgres');
require('dotenv').config();

const postgres = typeof mod === 'function' ? mod : mod.default || mod.postgres;
const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL or DIRECT_URL is missing in .env');
  process.exit(1);
}

const sql = postgres(connectionString);

async function seed() {
  try {
    console.log('Seeding initial receiving data...');

    // 1. Check or insert Products
    const existing = await sql`SELECT count(*) FROM public.products`;
    if (parseInt(existing[0].count, 10) === 0) {
      const insertedProducts = await sql`
        INSERT INTO public.products (sku, name, barcode, pack_size, unit)
        VALUES 
          ('MED-PARA-500', 'Paracetamol 500mg Tablets', '08901234567890', 'Box of 100 Tablets', 'BOX'),
          ('MED-AMOX-250', 'Amoxicillin 250mg Suspension', '08909876543210', 'Bottle of 100ml', 'BOTTLE')
        RETURNING id, sku, name;
      `;
      console.log('Inserted Products:', insertedProducts);

      const paraProduct = insertedProducts.find(p => p.sku === 'MED-PARA-500');

      // 2. Insert Sample Inbound Shipment (PO)
      const insertedShipment = await sql`
        INSERT INTO public.inbound_shipments (po_number, supplier_name, status, expected_delivery_date, notes)
        VALUES 
          ('PO-2026-0891', 'Novartis Healthcare Pvt Ltd', 'PENDING', NOW() + INTERVAL '1 day', 'Standard delivery at Dock Bay 3. Handle with care.')
        RETURNING id, po_number;
      `;
      console.log('Inserted Inbound Shipment:', insertedShipment);

      // 3. Insert Inbound Shipment Item
      const insertedItem = await sql`
        INSERT INTO public.inbound_shipment_items (shipment_id, product_id, expected_batch, expected_qty, received_qty, status)
        VALUES 
          (${insertedShipment[0].id}, ${paraProduct.id}, 'BATCH123', 100, 0, 'PENDING')
        RETURNING id, expected_qty, status;
      `;
      console.log('Inserted Inbound Shipment Item:', insertedItem);

      console.log('Successfully seeded Inbound Receiving master data!');
    } else {
      console.log('Products already exist in database, skipping seed.');
    }
  } catch (err) {
    console.error('Seeding error:', err);
  } finally {
    await sql.end();
  }
}

seed();

