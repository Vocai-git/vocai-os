-- Additive migration. Review + explicit approval before executing in production.
-- Old expenses/invoices remain intact as a read-only historical reference.
BEGIN;
CREATE TABLE IF NOT EXISTS finance_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  baseline jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS finance_records (
  id uuid PRIMARY KEY,
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  version integer NOT NULL DEFAULT 1,
  voided boolean NOT NULL DEFAULT false,
  included_in_opening boolean NOT NULL DEFAULT false,
  origin_key text UNIQUE,
  actor text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS finance_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  record_id uuid NOT NULL,
  actor text NOT NULL,
  before_row jsonb,
  after_row jsonb NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS finance_document_number_unique
ON finance_records ((data->>'kind'), lower(btrim(data->>'party')), lower(btrim(data->>'number')))
WHERE NOT voided AND data->>'kind' IN ('expense','income')
AND length(btrim(data->>'party')) > 0 AND length(btrim(data->>'number')) > 0;
CREATE OR REPLACE FUNCTION finance_audit_change() RETURNS trigger LANGUAGE plpgsql
SET search_path = public AS $$
BEGIN
  INSERT INTO finance_audit(record_id, actor, before_row, after_row)
    VALUES (NEW.id, NEW.actor, CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END, to_jsonb(NEW));
  RETURN NEW;
END; $$;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='finance_audit_trigger' AND tgrelid='public.finance_records'::regclass) THEN
  CREATE TRIGGER finance_audit_trigger AFTER INSERT OR UPDATE ON finance_records
  FOR EACH ROW EXECUTE FUNCTION finance_audit_change();
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS finance_files (
  id uuid PRIMARY KEY,
  record_id uuid NOT NULL REFERENCES finance_records(id),
  path text UNIQUE NOT NULL,
  name text NOT NULL,
  mime text NOT NULL,
  bytes integer NOT NULL CHECK (bytes > 0 AND bytes <= 10485760),
  actor text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE finance_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_files ENABLE ROW LEVEL SECURITY;
-- Browser clients get no table/storage policies. Authenticated Express endpoints
-- use the service role after validating the user's session.
REVOKE ALL ON finance_settings, finance_records, finance_audit, finance_files FROM anon, authenticated;
GRANT ALL ON finance_settings, finance_records, finance_audit, finance_files TO service_role;
GRANT USAGE, SELECT ON SEQUENCE finance_audit_id_seq TO service_role;
INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES ('finance-private', 'finance-private', false, 10485760, ARRAY['application/pdf','image/jpeg','image/png'])
ON CONFLICT (id) DO NOTHING;
-- Even if this project has broad existing storage policies, anonymous/browser
-- tokens cannot access this bucket directly. The server issues short-lived URLs.
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='finance_private_server_only') THEN
  CREATE POLICY finance_private_server_only ON storage.objects AS RESTRICTIVE
  FOR ALL TO anon, authenticated
  USING (bucket_id <> 'finance-private') WITH CHECK (bucket_id <> 'finance-private');
 END IF;
END $$;
-- Refuse to activate with an accidentally public bucket.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM storage.buckets WHERE id='finance-private' AND public) THEN
  RAISE EXCEPTION 'finance-private must be private';
 END IF;
END $$;
COMMIT;
