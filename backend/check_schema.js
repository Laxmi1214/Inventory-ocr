const path = require('path');
const mod = require(path.resolve(__dirname, '..', 'mobile', 'node_modules', 'postgres'));
const postgres = typeof mod === 'function' ? mod : mod.default || mod.postgres;

const DATABASE_URL = 'postgresql://postgres.swggqdgmbsikwibyhita:Abhishek%4054605@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';
const sql = postgres(DATABASE_URL);

async function inspect() {
  try {
    const invCols = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'inventory'`;
    console.log('--- INVENTORY COLUMNS ---');
    console.table(invCols);

    const batchCols = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'batches'`;
    console.log('--- BATCHES COLUMNS ---');
    console.table(batchCols);

    const txCols = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'inventory_transactions'`;
    console.log('--- INVENTORY_TRANSACTIONS COLUMNS ---');
    console.table(txCols);
  } catch (err) {
    console.error('Error inspecting:', err.message);
  } finally {
    await sql.end();
  }
}

inspect();
