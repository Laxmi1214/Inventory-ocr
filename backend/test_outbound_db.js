const path = require('path');
const mod = require(path.resolve(__dirname, '..', 'mobile', 'node_modules', 'postgres'));
const postgres = typeof mod === 'function' ? mod : mod.default || mod.postgres;

const DATABASE_URL = 'postgresql://postgres.swggqdgmbsikwibyhita:Abhishek%4054605@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';
const sql = postgres(DATABASE_URL);

async function testOutboundOrders() {
  console.log('=== TESTING OUTBOUND ORDERS DATABASE INTEGRATION ===');

  try {
    // 1. Fetch live orders from PostgreSQL
    const orders = await sql`
      SELECT 
        o.id,
        o.order_number AS "orderNumber",
        o.customer_name AS "customerName",
        o.status,
        o.priority,
        COALESCE(
          json_agg(
            json_build_object(
              'id', i.id,
              'productName', i.product_name,
              'sku', i.sku,
              'requiredQty', i.required_qty,
              'pickedQty', i.picked_qty,
              'status', i.status
            )
          ) FILTER (WHERE i.id IS NOT NULL),
          '[]'::json
        ) AS items
      FROM public.outbound_orders o
      LEFT JOIN public.outbound_order_items i ON i.order_id = o.id
      GROUP BY o.id
      ORDER BY o.created_at ASC
    `;

    console.log(`[STEP 1 SUCCESS] Fetched ${orders.length} real outbound orders from PostgreSQL:`);
    orders.forEach(o => console.log(`  - ${o.orderNumber}: ${o.customerName} [${o.status}] - Item: ${o.items[0]?.productName} (${o.items[0]?.requiredQty} units)`));

    if (orders.length === 0) {
      throw new Error('No outbound orders found in DB!');
    }

    // 2. Select first order to test dispatch
    const targetOrder = orders[0];
    const targetItem = targetOrder.items[0];
    console.log(`\n[STEP 2] Simulating dispatch for order ${targetOrder.orderNumber}: ${targetItem.productName} (${targetItem.requiredQty} units)`);

    // Lookup user id
    const userRows = await sql`SELECT id FROM public.users LIMIT 1`;
    const validUserId = userRows[0].id;

    // Update item picked_qty and status in DB
    await sql`
      UPDATE public.outbound_order_items
      SET picked_qty = ${targetItem.requiredQty}, status = 'COMPLETED', updated_at = NOW()
      WHERE id = ${targetItem.id}
    `;

    // Update order status in DB
    await sql`
      UPDATE public.outbound_orders
      SET status = 'DISPATCHED', dispatched_by = ${validUserId}, updated_at = NOW()
      WHERE id = ${targetOrder.id}
    `;

    // 3. Verify in DB
    const checkOrder = await sql`SELECT status, dispatched_by FROM public.outbound_orders WHERE id = ${targetOrder.id}`;
    const checkItem = await sql`SELECT picked_qty, status FROM public.outbound_order_items WHERE id = ${targetItem.id}`;

    console.log('[STEP 3 SUCCESS] Verified in PostgreSQL:');
    console.log(`  - Order Status: ${checkOrder[0].status}`);
    console.log(`  - Item Status: ${checkItem[0].status}, Picked Qty: ${checkItem[0].picked_qty}`);

    if (checkOrder[0].status !== 'DISPATCHED' || checkItem[0].status !== 'COMPLETED') {
      throw new Error('Database order dispatch update failed!');
    }

    // Reset test order back to PENDING for demo consistency
    await sql`UPDATE public.outbound_order_items SET picked_qty = 0, status = 'PENDING' WHERE id = ${targetItem.id}`;
    await sql`UPDATE public.outbound_orders SET status = 'PENDING', dispatched_by = NULL WHERE id = ${targetOrder.id}`;
    console.log('\n[STEP 4] Test order reset back to PENDING for clean app state.');

    console.log('\n======================================================');
    console.log('>>> OUTBOUND ORDERS POSTGRESQL INTEGRATION VERIFIED! <<<');
    console.log('======================================================\n');
  } catch (err) {
    console.error('Test error:', err);
  } finally {
    await sql.end();
  }
}

testOutboundOrders();
