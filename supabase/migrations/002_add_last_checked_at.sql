ALTER TABLE clients
ADD COLUMN IF NOT EXISTS last_checked_at timestamptz DEFAULT NULL;
