-- A new top tier above ADMIN. Added in its own migration because Postgres
-- forbids using a freshly added enum value in the same transaction.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN';
