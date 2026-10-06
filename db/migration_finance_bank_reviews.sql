-- Additive: bank reviews never change finance_records or the opening baseline.
-- Execute only with explicit authorization for the database migration.
BEGIN;
CREATE TABLE IF NOT EXISTS finance_bank_reviews (
 id uuid PRIMARY KEY,
 month text NOT NULL CHECK (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
 source_hash text NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
 name text NOT NULL CHECK (length(name) BETWEEN 1 AND 180),
 path text UNIQUE NOT NULL,
 config jsonb NOT NULL CHECK (jsonb_typeof(config)='object'),
 rows jsonb NOT NULL CHECK (jsonb_typeof(rows)='array' AND jsonb_array_length(rows)<=5000),
 decisions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(decisions)='array'),
 notes text NOT NULL DEFAULT '' CHECK (length(notes)<=4000),
 version integer NOT NULL DEFAULT 1 CHECK (version>0),
 actor text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(month,source_hash)
);
CREATE INDEX IF NOT EXISTS finance_bank_reviews_month_updated ON finance_bank_reviews(month,updated_at DESC);
CREATE TABLE IF NOT EXISTS finance_bank_review_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 review_id uuid NOT NULL REFERENCES finance_bank_reviews(id),
 actor text NOT NULL,
 before_row jsonb,
 after_row jsonb NOT NULL,
 at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION finance_bank_review_audit_change() RETURNS trigger LANGUAGE plpgsql
SET search_path=public AS $$
BEGIN
 INSERT INTO finance_bank_review_audit(review_id,actor,before_row,after_row)
 VALUES(NEW.id,NEW.actor,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,to_jsonb(NEW));
 RETURN NEW;
END; $$;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='finance_bank_review_audit_trigger' AND tgrelid='public.finance_bank_reviews'::regclass) THEN
  CREATE TRIGGER finance_bank_review_audit_trigger AFTER INSERT OR UPDATE ON finance_bank_reviews
  FOR EACH ROW EXECUTE FUNCTION finance_bank_review_audit_change();
 END IF;
END $$;
ALTER TABLE finance_bank_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_bank_review_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON finance_bank_reviews,finance_bank_review_audit FROM anon,authenticated;
GRANT ALL ON finance_bank_reviews,finance_bank_review_audit TO service_role;
GRANT USAGE,SELECT ON SEQUENCE finance_bank_review_audit_id_seq TO service_role;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('finance-bank-private','finance-bank-private',false,5242880,ARRAY['text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
ON CONFLICT(id) DO NOTHING;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='finance_bank_private_server_only') THEN
  CREATE POLICY finance_bank_private_server_only ON storage.objects AS RESTRICTIVE FOR ALL TO anon,authenticated
  USING(bucket_id<>'finance-bank-private') WITH CHECK(bucket_id<>'finance-bank-private');
 END IF;
 IF EXISTS(SELECT 1 FROM storage.buckets WHERE id='finance-bank-private' AND public) THEN
  RAISE EXCEPTION 'finance-bank-private must be private';
 END IF;
END $$;
COMMIT;
