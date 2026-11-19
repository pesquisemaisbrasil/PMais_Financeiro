// Cria as tabelas do feriados.dev na primeira vez, com o database/init.sql da própria imagem dele, e
// sai. O run-sql-migrations dele carrega os municípios e os feriados, mas não cria as tabelas: no
// compose dele isso fica no init do Postgres, que aqui é outro container (ADR 0024). O init.sql não
// pode rodar duas vezes (cria triggers), então só roda se a tabela de cidades ainda não existe.
const fs = require("node:fs");
const { Client } = require("pg");

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const { rows } = await client.query("SELECT to_regclass('public.locations') AS tabela");
  if (!rows[0].tabela) {
    await client.query(fs.readFileSync("/app/database/init.sql", "utf8"));
    console.log("feriados.dev: tabelas criadas");
  }
  await client.end();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
