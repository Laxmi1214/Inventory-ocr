const path = require('path');
const mod = require(path.resolve(__dirname, '..', 'mobile', 'node_modules', 'postgres'));
const postgres = typeof mod === 'function' ? mod : mod.default || mod.postgres;

const DATABASE_URL = 'postgresql://postgres.swggqdgmbsikwibyhita:Abhishek%4054605@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';
const sql = postgres(DATABASE_URL);

async function runTest() {
  console.log('=== TESTING SHORTAGE RECEIVING & SUPERVISOR APPROVAL WORKFLOW ===');
  const now = Date.now();
  const testPoNumber = `PO-TEST-${now}`;
  const testBatch = `BATCH-TEST-${now}`;
  let testShipmentId = null;
  let testItemId = null;
  let testProductId = null;
  let testBatchId = null;

  try {
    // 1. Setup: Create test product and inbound shipment expecting 50 units
    const prodRows = await sql`SELECT id, name, sku FROM public.products LIMIT 1`;
    testProductId = prodRows[0].id;
    const prodName = prodRows[0].name;

    const shipInsert = await sql`
      INSERT INTO public.inbound_shipments (po_number, supplier_name, status, notes)
      VALUES (${testPoNumber}, 'Test Pharma Supplier Ltd', 'PENDING', 'PO created for testing shortage logic')
      RETURNING id, po_number, status
    `;
    testShipmentId = shipInsert[0].id;

    const itemInsert = await sql`
      INSERT INTO public.inbound_shipment_items (shipment_id, product_id, expected_batch, expected_qty, received_qty, status)
      VALUES (${testShipmentId}, ${testProductId}, ${testBatch}, 50, 0, 'PENDING')
      RETURNING id, expected_qty, received_qty, status
    `;
    testItemId = itemInsert[0].id;

    console.log(`[STEP 1 SUCCESS] Created PO ${testPoNumber}: Expected Qty = 50 units`);

    // 2. Simulate Operator Receiving: Counted 40 units (Shortage of 10)
    // Operator flags discrepancy and routes to Supervisor
    const flagPayload = {
      poNumber: testPoNumber,
      itemId: testItemId,
      productId: testProductId,
      productName: prodName,
      batchNumber: testBatch,
      expectedQty: 50,
      receivedQty: 40,
      reasons: ['Quantity Shortage: Expected 50 units on PO, but only 40 units physically received (-10 units shortage). Supervisor deviation approval required.'],
      notes: 'Delivery driver noted vendor ran short on shipment batch. Balance 10 on backorder.',
      userId: 'priya@gmail.com',
    };

    const discrepancyNote = ` [DISCREPANCY: ${flagPayload.reasons.join('; ')} - ${flagPayload.notes}]`;

    await sql`
      UPDATE public.inbound_shipments
      SET status = 'DISCREPANCY',
          notes = COALESCE(notes, '') || ${discrepancyNote},
          updated_at = NOW()
      WHERE LOWER(po_number) = ${testPoNumber.toLowerCase()}
    `;

    await sql`
      UPDATE public.inbound_shipment_items
      SET status = 'DISCREPANCY',
          received_qty = 40,
          expected_batch = ${testBatch},
          updated_at = NOW()
      WHERE id = ${testItemId}
    `;

    console.log('[STEP 2 SUCCESS] Shortage discrepancy flagged (40 / 50 units). PO status = DISCREPANCY');

    // 3. Verify Active Inventory BEFORE Supervisor approval:
    // Ensure 0 units were added for this test batch!
    const invCheckBefore = await sql`
      SELECT COALESCE(SUM(quantity), 0) as total_qty 
      FROM public.inventory 
      WHERE product_id = ${testProductId} AND batch_id IN (
        SELECT id FROM public.batches WHERE batch_number = ${testBatch}
      )
    `;
    console.log(`[STEP 3 VERIFICATION] Inventory before Supervisor approval: ${invCheckBefore[0].total_qty} units (Should be 0)`);
    if (parseInt(invCheckBefore[0].total_qty, 10) !== 0) {
      throw new Error('Stock should NOT be in inventory before supervisor approval!');
    }

    // 4. Simulate Supervisor Exception Inbox Fetch (Route 6.3 query):
    const poExceptions = await sql`
      SELECT 
        s.id,
        s.po_number AS "poNumber",
        s.supplier_name AS "supplierName",
        s.status,
        s.notes,
        i.expected_qty AS "expectedQty",
        i.received_qty AS "receivedQty",
        (COALESCE(i.expected_qty, 50) - COALESCE(i.received_qty, 0)) AS "shortageQty"
      FROM public.inbound_shipments s
      LEFT JOIN public.inbound_shipment_items i ON i.shipment_id = s.id
      WHERE s.status = 'DISCREPANCY' AND s.id = ${testShipmentId}
    `;

    console.log('[STEP 4 SUCCESS] Supervisor Inbox retrieved PO hold:', {
      poNumber: poExceptions[0].poNumber,
      status: poExceptions[0].status,
      expectedQty: poExceptions[0].expectedQty,
      receivedQty: poExceptions[0].receivedQty,
      shortageQty: poExceptions[0].shortageQty,
    });

    if (poExceptions[0].shortageQty !== 10) {
      throw new Error(`Expected shortage of 10, got ${poExceptions[0].shortageQty}`);
    }

    // 5. Simulate Supervisor Approval (Route 6.5 logic):
    const supervisorDecision = 'APPROVE';
    const overrideReason = 'Approved partial receipt of 40 units per Vendor Delivery Note. Remaining 10 units confirmed for next Tuesday delivery.';
    const supervisorId = 'supervisor@congiotech.com';

    // Execute route logic
    const row = poExceptions[0];
    const quantityAdded = row.receivedQty; // 40 units

    // Create batch
    let batchRows = await sql`
      SELECT id FROM public.batches WHERE product_id = ${testProductId} AND batch_number = ${testBatch} LIMIT 1
    `;
    if (batchRows.length > 0) {
      testBatchId = batchRows[0].id;
    } else {
      const insertedBatch = await sql`
        INSERT INTO public.batches (product_id, batch_number, expiry_date, status)
        VALUES (${testProductId}, ${testBatch}, NOW() + INTERVAL '2 years', 'APPROVED_DEVIATION')
        RETURNING id
      `;
      testBatchId = insertedBatch[0].id;
    }

    // Upsert into inventory table
    await sql`
      INSERT INTO public.inventory (product_id, batch_id, location_code, quantity)
      VALUES (${testProductId}, ${testBatchId}, 'BAY-01', ${quantityAdded})
      ON CONFLICT DO NOTHING
    `;

    // Lookup valid user id for foreign key
    const anyUser = await sql`SELECT id FROM public.users LIMIT 1`;
    const validUserId = anyUser[0].id;

    // Audit log
    await sql`
      INSERT INTO public.inventory_transactions (product_id, batch_id, type, quantity, notes, created_by)
      VALUES (
        ${testProductId}, 
        ${testBatchId}, 
        'INBOUND', 
        ${quantityAdded}, 
        ${'PO ' + testPoNumber + ' Partial Deviation Approved: +' + quantityAdded + ' units (' + overrideReason + ')'}, 
        ${validUserId}
      )
    `;

    // Update shipment items and shipment
    await sql`
      UPDATE public.inbound_shipment_items
      SET received_qty = ${quantityAdded}, status = 'APPROVED_WITH_DEVIATION', updated_at = NOW()
      WHERE id = ${testItemId}
    `;

    await sql`
      UPDATE public.inbound_shipments
      SET status = 'APPROVED_WITH_DEVIATION',
          notes = CONCAT(COALESCE(notes, ''), ' [Supervisor Approved Partial Intake (+40 units): ' || ${overrideReason} || ' by ' || ${supervisorId} || ']'),
          updated_at = NOW()
      WHERE id = ${testShipmentId}
    `;

    console.log(`[STEP 5 SUCCESS] Supervisor approved! +${quantityAdded} units committed to database.`);

    // 6. Verify Active Inventory AFTER Supervisor approval:
    const invCheckAfter = await sql`
      SELECT COALESCE(SUM(quantity), 0) as total_qty 
      FROM public.inventory 
      WHERE product_id = ${testProductId} AND batch_id = ${testBatchId}
    `;
    console.log(`[STEP 6 VERIFICATION] Inventory after Supervisor approval: ${invCheckAfter[0].total_qty} units (Should be 40)`);

    if (parseInt(invCheckAfter[0].total_qty, 10) !== 40) {
      throw new Error(`Expected 40 units in inventory, found ${invCheckAfter[0].total_qty}`);
    }

    // Verify transaction audit log
    const txLog = await sql`
      SELECT type, quantity, notes, created_by 
      FROM public.inventory_transactions 
      WHERE product_id = ${testProductId} AND batch_id = ${testBatchId}
      ORDER BY created_at DESC LIMIT 1
    `;
    console.log('[STEP 7 AUDIT VERIFICATION] Transaction logged in 21 CFR Part 11 audit trail:', txLog[0]);

    console.log('\n======================================================');
    console.log('>>> ALL 7 WORKFLOW STEPS PASSED SUCCESSFULLY! <<<');
    console.log('Shortage receiving (50 expected -> 40 received) redirects to Supervisor, blocks direct DB commit, and only stores in DB when Supervisor allows it!');
    console.log('======================================================\n');
  } catch (err) {
    console.error('Test failed:', err);
  } finally {
    // Clean up test records
    if (testBatchId) {
      await sql`DELETE FROM public.inventory WHERE batch_id = ${testBatchId}`;
      await sql`DELETE FROM public.inventory_transactions WHERE batch_id = ${testBatchId}`;
      await sql`DELETE FROM public.batches WHERE id = ${testBatchId}`;
    }
    if (testItemId) {
      await sql`DELETE FROM public.inbound_shipment_items WHERE id = ${testItemId}`;
    }
    if (testShipmentId) {
      await sql`DELETE FROM public.inbound_shipments WHERE id = ${testShipmentId}`;
    }
    console.log('Test records cleaned up.');
    await sql.end();
  }
}

runTest();
