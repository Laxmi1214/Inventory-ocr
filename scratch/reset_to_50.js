const mod = require('../mobile/node_modules/postgres');
const postgres = typeof mod === 'function' ? mod : mod.default || mod.postgres;
const sql = postgres('postgresql://postgres.swggqdgmbsikwibyhita:Abhishek%4054605@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres');

async function resetAllTo50() {
  try {
    await sql`UPDATE public.inventory SET quantity = 50`;
    const res = await sql`
      SELECT p.name, p.sku, p.product_id, i.quantity 
      FROM public.products p 
      JOIN public.inventory i ON p.id = i.product_id 
      ORDER BY p.name
    `;
    console.log('Stock after baseline reset to 50:');
    console.table(res);
  } catch (e) {
    console.error(e);
  } finally {
    await sql.end();
  }
}
resetAllTo50();
