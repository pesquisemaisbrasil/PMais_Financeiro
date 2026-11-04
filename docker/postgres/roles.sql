-- Roles do ambiente local (handoff/04). Roda sozinho em volume novo, como superuser.
-- Volume criado antes destas roles:
--   docker compose exec -T db psql -U postgres -d financeiro < docker/postgres/roles.sql
-- Fora do ambiente local, as senhas vêm do cofre.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'financeiro_migrator') THEN
    CREATE ROLE financeiro_migrator LOGIN PASSWORD 'troque-local' NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'financeiro_app') THEN
    CREATE ROLE financeiro_app LOGIN PASSWORD 'troque-local' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END $$;

ALTER DATABASE financeiro OWNER TO financeiro_migrator;
REVOKE ALL ON DATABASE financeiro FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE financeiro TO financeiro_app;

REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO financeiro_migrator;
GRANT USAGE ON SCHEMA public TO financeiro_app;

-- O que o migrator criar daqui para a frente já nasce liberado para a app.
ALTER DEFAULT PRIVILEGES FOR ROLE financeiro_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO financeiro_app;
ALTER DEFAULT PRIVILEGES FOR ROLE financeiro_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO financeiro_app;

-- Tabelas de um volume que já existia.
DO $$
DECLARE
  existing text;
BEGIN
  FOR existing IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE %I OWNER TO financeiro_migrator', existing);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO financeiro_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO financeiro_app;
