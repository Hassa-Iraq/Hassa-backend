-- Notification inbox stored per user
CREATE SCHEMA IF NOT EXISTS notification;

CREATE TABLE IF NOT EXISTS notification.notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  title           VARCHAR(255) NOT NULL,
  body            TEXT NOT NULL,
  type            VARCHAR(60) NOT NULL,        -- order_placed, order_status_changed, driver_assigned, wallet_credited …
  data            JSONB NOT NULL DEFAULT '{}',
  is_read         BOOLEAN NOT NULL DEFAULT FALSE,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id     ON notification.notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notification.notifications (user_id) WHERE is_read = FALSE;
