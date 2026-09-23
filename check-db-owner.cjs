const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  const user = await pool.query(`
    select current_user, session_user, current_database()
  `);

  const owners = await pool.query(`
    select
      tablename,
      tableowner
    from pg_tables
    where schemaname = 'public'
      and tablename in (
        'sales',
        'sale_items',
        'sale_payments',
        'credit_notes'
      )
    order by tablename
  `);

  console.log("CONEXION:");
  console.table(user.rows);

  console.log("PROPIETARIOS:");
  console.table(owners.rows);

  await pool.end();
}

main().catch(console.error);
