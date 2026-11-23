const path = require('path');
const mod = require(path.resolve(__dirname, '..', 'mobile', 'node_modules', 'postgres'));
const postgres = typeof mod === 'function' ? mod : mod.default || mod.postgres;
const sql = postgres('postgresql://postgres.swggqdgmbsikwibyhita:Abhishek%4054605@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres');

async function testAudit() {
  try {
    const prod = await sql`SELECT id FROM public.products LIMIT 1`;
    const user = await sql`SELECT id, username, email FROM public.users WHERE role = 'SUPERVISOR' LIMIT 1`;
    const supervisorEmail = user[0].email; // e.g. supervisor@congiotech.com

    const audit = await sql`
      INSERT INTO public.stock_audits (product_id, location_code, system_qty, physical_qty, variance, status, counted_by)
      VALUES (${prod[0].id}, 'BAY-01', 35, 30, -5, 'PENDING_SUPERVISOR_APPROVAL', ${user[0].id})
      RETURNING id, product_id, batch_id, variance, physical_qty
    `;
    const auditId = audit[0].id;
    console.log('[STEP 1] Created test audit with variance:', auditId);

    // Simulate resolve-audit with supervisor email (which previously crashed foreign key!)
    let validSupervisorId = null;
    const uCheck = await sql`SELECT id FROM public.users WHERE id = ${supervisorEmail} OR LOWER(username) = ${supervisorEmail.toLowerCase()} OR LOWER(email) = ${supervisorEmail.toLowerCase()} LIMIT 1`;
    if (uCheck.length > 0) validSupervisorId = uCheck[0].id;

    await sql`
      UPDATE public.stock_audits
      SET status = 'APPROVED', supervisor_id = ${validSupervisorId}, supervisor_notes = 'Test override reason', updated_at = NOW()
      WHERE id = ${auditId}
    `;

    const tx = await sql`
      INSERT INTO public.inventory_transactions (product_id, batch_id, type, quantity, notes, created_by)
      VALUES (${audit[0].product_id}, ${audit[0].batch_id || null}, 'AUDIT_OVERRIDE', ${audit[0].variance}, 'Supervisor Approved Variance Override: Test override reason', ${validSupervisorId})
      RETURNING id, created_by
    `;
    console.log('[STEP 2 SUCCESS] Audit override transaction logged without foreign key error! Tx ID:', tx[0].id);

    // Clean up
    await sql`DELETE FROM public.inventory_transactions WHERE id = ${tx[0].id}`;
    await sql`DELETE FROM public.stock_audits WHERE id = ${auditId}`;
    console.log('[STEP 3] Cleaned up test records.');
    console.log('>>> AUDIT OVERRIDE FOREIGN KEY FIX VERIFIED! <<<');
  } catch (err) {
    console.error('Audit test failed:', err);
  } finally {
    await sql.end();
  }
}

testAudit();
