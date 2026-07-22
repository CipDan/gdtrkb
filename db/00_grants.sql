-- SELECT-only role that PostGraphile connects as at runtime
-- (see ci-deploy-setup.md §2.4 and the Identity table in §1).
--
-- Not part of 01_schema.sql on purpose: the role and its password are
-- deployment concerns, not schema. Run this against the Neon *direct*
-- (unpooled) connection, after 01_schema.sql and before 02_seed.sql.
--
-- The password is never hardcoded here. Pass it in as a psql variable:
--   psql "$DATABASE_URL" -v pass="$GDTRKB_RO_PASSWORD" -f db/00_grants.sql
--
-- Password policy (deliberate, not on every run): the password is set ONLY
-- when the role is first created. Re-running this file re-grants tables
-- (idempotent) but never touches an existing role's password, so an
-- `apply_schema` re-run can't silently rotate the live password out from
-- under the pooled DATABASE_URL that PostGraphile uses. Rotate deliberately
-- instead: update the GDTRKB_RO_PASSWORD secret and Railway's DATABASE_URL,
-- then run a one-off `ALTER ROLE gdtrkb_ro PASSWORD '<new>'`.
--
-- IMPORTANT: :'pass' must stay at the TOP LEVEL. psql does NOT expand
-- :variables inside dollar-quoted ($$ ... $$) strings, so it can't live in a
-- DO block body — it would be sent to the server verbatim and raise a syntax
-- error. The role is instead created via \gexec, where format(... %L)
-- receives the already-quoted literal that :'pass' produces.
--
-- Idempotent: safe to re-run on every schema apply, whether the role
-- already exists or not.

-- Create the role (with its password) only if it doesn't already exist.
-- format(%L) is fed :'pass', which psql expands to a safely quoted SQL
-- string literal at the top level.
SELECT format('CREATE ROLE gdtrkb_ro LOGIN PASSWORD %L', :'pass')
WHERE NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'gdtrkb_ro')
\gexec

GRANT USAGE ON SCHEMA public TO gdtrkb_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO gdtrkb_ro;

-- So re-created tables (e.g. after a future 01_schema.sql rebuild) keep
-- working without re-granting by hand. CURRENT_USER is whoever
-- DATABASE_URL_MIGRATIONS connects as — the owner role that creates and
-- will keep creating tables — so this doesn't need an explicit role name.
ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA public
  GRANT SELECT ON TABLES TO gdtrkb_ro;
