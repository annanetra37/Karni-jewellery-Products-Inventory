-- Broadcast (admin-wide) notifications: track which admins have read them.
ALTER TABLE "Notification" ADD COLUMN "readBy" TEXT[] NOT NULL DEFAULT '{}';
