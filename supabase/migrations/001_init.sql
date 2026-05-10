CREATE TABLE clients (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    email text NOT NULL UNIQUE,
    password_encrypted text NOT NULL,
    schedule_id text NOT NULL,
    applicant_ids text[] NOT NULL DEFAULT '{}',
    "current_date" date,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'done', 'blocked')),
    attempts_left integer NOT NULL DEFAULT 3,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    action text NOT NULL CHECK (action IN ('check', 'reschedule', 'error', 'notify')),
    result text,
    date_found date,
    date_booked date,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_clients_status ON clients(status);
CREATE INDEX idx_logs_client_id ON logs(client_id);
