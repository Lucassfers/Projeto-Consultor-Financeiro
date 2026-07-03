DO $$
BEGIN
  CREATE TYPE category_type AS ENUM ('income', 'expense');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS type category_type NOT NULL DEFAULT 'expense';
