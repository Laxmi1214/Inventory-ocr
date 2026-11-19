const mod = require('../mobile/node_modules/postgres');
const postgres = typeof mod === 'function' ? mod : mod.default || mod.postgres;
const sql = postgres('postgresql://postgres.swggqdgmbsikwibyhita:Abhishek%4054605@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres');

async function check() {
  try {
    const products = await sql`
      SELECT p.id, p.name, p.sku, p.product_id, COALESCE(SUM(i.quantity), 0)::int as stock 
      FROM public.products p 
      LEFT JOIN public.inventory i ON p.id = i.product_id 
      GROUP BY p.id, p.name, p.sku, p.product_id 
      ORDER BY p.name
    `;
    console.log('PostgreSQL Products & Stock:');
    console.log(JSON.stringify(products, null, 2));
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await sql.end();
  }
}
check();
