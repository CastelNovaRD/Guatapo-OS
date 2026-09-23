const fs = require("fs");
const { Pool } = require("pg");

const pool = new Pool({
  host: "127.0.0.1",
  port: 5433,
  database: "shopdesk",
  user: "castelnova_admin",
  password: process.env.CASTELNOVA_DB_ADMIN_PASSWORD,
});

async function main() {
  const sql = fs.readFileSync(
    "./db/schema/0002_shopdesk_pos_compatibility.sql",
    "utf8"
  );

  try {
    await pool.query("BEGIN");
    await pool.query(sql);
    await pool.query("COMMIT");

    console.log("OK: migracion 0002 aplicada correctamente.");
  } catch (error) {
    try {
      await pool.query("ROLLBACK");
    } catch {}

    console.error("ERROR aplicando migracion:");
    console.error(error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
