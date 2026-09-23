const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  const result = await pool.query(`
    select table_name, column_name, data_type
    from information_schema.columns
    where table_schema = 'public'
      and (
        (table_name = 'sales' and column_name in (
          'sale_channel','shipping_cost','card_fee','net_received',
          'cash_received','cash_change','notes'
        ))
        or
        (table_name = 'sale_items' and column_name = 'discount')
        or
        (table_name = 'sale_payments' and column_name in ('reference','card_fee'))
        or
        (table_name = 'credit_notes' and column_name in ('used_at','updated_at'))
      )
    order by table_name, column_name
  `);

  console.table(result.rows);
  await pool.end();
}

main().catch(console.error);
