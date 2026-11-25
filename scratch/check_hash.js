const mod = require('d:/Inventory-OCR/mobile/node_modules/postgres');
const postgres = typeof mod === 'function' ? mod : mod.default || mod.postgres;
const sql = postgres('postgresql://postgres.swggqdgmbsikwibyhita:Abhishek%4054605@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres');

async function check() {
  const u = await sql`
    SELECT id, username, email, password, role 
    FROM public.users 
    WHERE email LIKE 'test_user_%' 
    ORDER BY created_at DESC 
    LIMIT 1
  `;
  console.log('Sample User from Supabase DB:');
  console.log('Email:', u[0].email);
  console.log('Argon2 Hash:', u[0].password);
  console.log('Algorithm Identifier:', u[0].password.slice(0, 10));

  // Clean up test user
  await sql`DELETE FROM public.users WHERE email = ${u[0].email}`;
  console.log('Cleaned up test user successfully.');
  await sql.end();
}

check().catch(console.error);
