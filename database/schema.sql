-- EduAxis hosted PostgreSQL schema. Run once against the Neon database.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('parent','admin')), full_name TEXT NOT NULL,
  phone TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sessions (
  id_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf TEXT NOT NULL, expires_at BIGINT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS enquiries (
  id TEXT PRIMARY KEY, parent_name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL,
  learner_name TEXT, grade TEXT, service TEXT, message TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), status TEXT NOT NULL DEFAULT 'New'
);
CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY, parent_name TEXT NOT NULL, parent_email TEXT NOT NULL, parent_phone TEXT NOT NULL,
  learner_name TEXT NOT NULL, grade TEXT NOT NULL, previous_school TEXT, academic_info TEXT,
  support_needs TEXT, additional_info TEXT, consent BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), status TEXT NOT NULL DEFAULT 'Received'
);
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY, parent_name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL,
  preferred_date DATE NOT NULL, preferred_time TEXT NOT NULL, notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), status TEXT NOT NULL DEFAULT 'Requested'
);
CREATE TABLE IF NOT EXISTS learners (
  id TEXT PRIMARY KEY, parent_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL, grade TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS learners_parent_idx ON learners(parent_user_id);
CREATE TABLE IF NOT EXISTS homework (
  id TEXT PRIMARY KEY, learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  title TEXT NOT NULL, subject TEXT NOT NULL, due_date DATE, details TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS progress (
  id TEXT PRIMARY KEY, learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  subject TEXT NOT NULL, period TEXT NOT NULL, summary TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS timetable (
  id TEXT PRIMARY KEY, learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  day TEXT NOT NULL, time TEXT NOT NULL, subject TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS notices (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS resources (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, grade TEXT NOT NULL, subject TEXT NOT NULL,
  description TEXT NOT NULL, file_url TEXT NOT NULL, published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS testimonials (
  id TEXT PRIMARY KEY, display_name TEXT NOT NULL, quote TEXT NOT NULL,
  permission_confirmed BOOLEAN NOT NULL DEFAULT FALSE, published BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE IF NOT EXISTS gallery (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, image_url TEXT NOT NULL, alt_text TEXT NOT NULL,
  permission_confirmed BOOLEAN NOT NULL DEFAULT FALSE, published BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE IF NOT EXISTS news (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL,
  published BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS rate_limits (
  rate_key TEXT NOT NULL, bucket BIGINT NOT NULL, count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(rate_key,bucket)
);
