-- Birthday reminder notifications. Added in its own migration because Postgres
-- forbids using a freshly added enum value in the same transaction.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BIRTHDAY';
