-- Additive private inbox. Linking attaches evidence; it never posts money.
-- Apply only with explicit database-migration authorization.
BEGIN;
CREATE TABLE IF NOT EXISTS finance_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 draft_record_id uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
 hash text UNIQUE NOT NULL CHECK(hash ~ '^[a-f0-9]{64}$'),
 path text UNIQUE NOT NULL CHECK(path LIKE 'inbox/%'),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 180),
 mime text NOT NULL CHECK(mime IN ('application/pdf','image/jpeg','image/png')),
 bytes integer NOT NULL CHECK(bytes BETWEEN 1 AND 10485760),
 source text NOT NULL CHECK(source IN ('manual','telegram')),
 source_key text UNIQUE,
 caption text NOT NULL DEFAULT '' CHECK(length(caption)<=2000),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','linked','archived')),
 record_id uuid REFERENCES finance_records(id),
 file_id uuid REFERENCES finance_files(id),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 actor text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((status='linked' AND record_id IS NOT NULL AND file_id IS NOT NULL) OR (status<>'linked' AND record_id IS NULL AND file_id IS NULL))
);
CREATE INDEX IF NOT EXISTS finance_documents_status_created ON finance_documents(status,created_at DESC,id);
CREATE TABLE IF NOT EXISTS finance_documents_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 document_id uuid NOT NULL REFERENCES finance_documents(id),
 actor text NOT NULL, before_row jsonb, after_row jsonb NOT NULL,
 at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION finance_documents_audit_change() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 INSERT INTO finance_documents_audit(document_id,actor,before_row,after_row)
 VALUES(NEW.id,NEW.actor,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,to_jsonb(NEW));
 RETURN NEW;
END; $$;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='finance_documents_audit_trigger' AND tgrelid='public.finance_documents'::regclass) THEN
  CREATE TRIGGER finance_documents_audit_trigger AFTER INSERT OR UPDATE ON finance_documents FOR EACH ROW EXECUTE FUNCTION finance_documents_audit_change();
 END IF;
END $$;

CREATE TABLE IF NOT EXISTS finance_telegram_pairs (
 bot_id bigint NOT NULL CHECK(bot_id BETWEEN 1 AND 9007199254740991),
 chat_id bigint NOT NULL CHECK(chat_id BETWEEN 1 AND 9007199254740991),
 telegram_user_id bigint NOT NULL CHECK(telegram_user_id=chat_id),
 user_id uuid NOT NULL,
 actor text NOT NULL,
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(bot_id,chat_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS finance_telegram_active_user ON finance_telegram_pairs(bot_id,user_id) WHERE active;
CREATE TABLE IF NOT EXISTS finance_telegram_pair_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 chat_id bigint NOT NULL, actor text NOT NULL, before_row jsonb, after_row jsonb NOT NULL,
 at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION finance_telegram_pair_audit_change() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 INSERT INTO finance_telegram_pair_audit(chat_id,actor,before_row,after_row)
 VALUES(NEW.chat_id,NEW.actor,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,to_jsonb(NEW));
 RETURN NEW;
END; $$;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='finance_telegram_pair_audit_trigger' AND tgrelid='public.finance_telegram_pairs'::regclass) THEN
  CREATE TRIGGER finance_telegram_pair_audit_trigger AFTER INSERT OR UPDATE ON finance_telegram_pairs FOR EACH ROW EXECUTE FUNCTION finance_telegram_pair_audit_change();
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS finance_telegram_codes (
 hash text PRIMARY KEY CHECK(hash ~ '^[a-f0-9]{64}$'),
 bot_id bigint NOT NULL CHECK(bot_id BETWEEN 1 AND 9007199254740991),
 user_id uuid NOT NULL, actor text NOT NULL,
 expires_at timestamptz NOT NULL,
 used_at timestamptz, consumed_update_id bigint, consumed_chat_id bigint,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS finance_telegram_codes_user ON finance_telegram_codes(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS finance_telegram_updates (
 bot_id bigint NOT NULL CHECK(bot_id BETWEEN 1 AND 9007199254740991),
 update_id bigint NOT NULL CHECK(update_id BETWEEN 0 AND 9007199254740991),
 fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
 state text NOT NULL CHECK(state IN ('processing','done')),
 lease uuid NOT NULL, locked_until timestamptz NOT NULL,
 attempts integer NOT NULL DEFAULT 1,
 outcome text, document_id uuid REFERENCES finance_documents(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(bot_id,update_id)
);

CREATE OR REPLACE FUNCTION finance_link_document(p_document_id uuid,p_record_id uuid,p_version integer,p_actor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE doc finance_documents%ROWTYPE; rec finance_records%ROWTYPE; attachment finance_files%ROWTYPE;
BEGIN
 SELECT * INTO doc FROM finance_documents WHERE id=p_document_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Documento no encontrado'; END IF;
 IF doc.status='linked' THEN
  IF doc.record_id<>p_record_id THEN RAISE EXCEPTION 'El documento ya está vinculado a otro movimiento'; END IF;
  SELECT * INTO attachment FROM finance_files WHERE id=doc.file_id;
  RETURN jsonb_build_object('document',to_jsonb(doc),'file',to_jsonb(attachment));
 END IF;
 IF doc.version<>p_version THEN RAISE EXCEPTION 'El documento cambió. Recarga antes de vincular'; END IF;
 IF doc.status<>'pending' THEN RAISE EXCEPTION 'Restaura el documento antes de vincularlo'; END IF;
 SELECT * INTO rec FROM finance_records WHERE id=p_record_id FOR UPDATE;
 IF NOT FOUND OR rec.voided OR coalesce(rec.data->>'kind','') NOT IN ('income','expense') THEN RAISE EXCEPTION 'Selecciona un ingreso o gasto existente y no anulado'; END IF;
 INSERT INTO finance_files(id,record_id,path,name,mime,bytes,actor)
 VALUES(gen_random_uuid(),rec.id,doc.path,doc.name,doc.mime,doc.bytes,p_actor) RETURNING * INTO attachment;
 UPDATE finance_documents SET status='linked',record_id=rec.id,file_id=attachment.id,version=version+1,
 actor=p_actor,updated_at=now() WHERE id=doc.id RETURNING * INTO doc;
 RETURN jsonb_build_object('document',to_jsonb(doc),'file',to_jsonb(attachment));
END; $$;

CREATE OR REPLACE FUNCTION finance_create_document_record(p_document_id uuid,p_version integer,p_data jsonb,p_actor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE doc finance_documents%ROWTYPE; rec finance_records%ROWTYPE; result jsonb;
BEGIN
 SELECT * INTO doc FROM finance_documents WHERE id=p_document_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Documento no encontrado'; END IF;
 IF coalesce(p_data->>'kind','') NOT IN ('income','expense') THEN RAISE EXCEPTION 'Solo se puede crear un ingreso o gasto desde un documento'; END IF;
 SELECT * INTO rec FROM finance_records WHERE id=doc.draft_record_id FOR UPDATE;
 IF doc.status='linked' THEN
  IF doc.record_id<>doc.draft_record_id OR rec.id IS NULL OR rec.voided OR rec.data<>p_data THEN RAISE EXCEPTION 'El documento ya está vinculado. Abre su movimiento antes de continuar'; END IF;
  result:=finance_link_document(doc.id,rec.id,doc.version,p_actor);
  RETURN result||jsonb_build_object('record',to_jsonb(rec));
 END IF;
 IF doc.status<>'pending' OR doc.version<>p_version THEN RAISE EXCEPTION 'El documento cambió. Recarga antes de crear el movimiento'; END IF;
 IF rec.id IS NOT NULL THEN
  IF rec.voided OR rec.data<>p_data THEN RAISE EXCEPTION 'Ya existe un movimiento para este documento. Revisa su vinculación'; END IF;
 ELSE
  INSERT INTO finance_records(id,data,actor) VALUES(doc.draft_record_id,p_data,p_actor) RETURNING * INTO rec;
 END IF;
 result:=finance_link_document(doc.id,rec.id,doc.version,p_actor);
 RETURN result||jsonb_build_object('record',to_jsonb(rec));
END; $$;

CREATE OR REPLACE FUNCTION finance_issue_telegram_code(p_bot_id bigint,p_hash text,p_user_id uuid,p_actor text)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE expiry timestamptz:=now()+interval '10 minutes';
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text,17));
 UPDATE finance_telegram_codes SET used_at=now() WHERE bot_id=p_bot_id AND user_id=p_user_id AND used_at IS NULL;
 INSERT INTO finance_telegram_codes(bot_id,hash,user_id,actor,expires_at) VALUES(p_bot_id,p_hash,p_user_id,p_actor,expiry);
 RETURN expiry;
END; $$;
CREATE OR REPLACE FUNCTION finance_consume_telegram_code(p_bot_id bigint,p_hash text,p_chat_id bigint,p_user_id bigint,p_update_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE code finance_telegram_codes%ROWTYPE; existing finance_telegram_pairs%ROWTYPE; paired finance_telegram_pairs%ROWTYPE;
BEGIN
 IF p_chat_id<>p_user_id OR p_chat_id<1 OR p_chat_id>9007199254740991 THEN RETURN NULL; END IF;
 -- Serializes pair ownership and one-use codes across concurrent deliveries.
 PERFORM pg_advisory_xact_lock(417203019);
 SELECT * INTO code FROM finance_telegram_codes WHERE hash=p_hash AND bot_id=p_bot_id FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF code.used_at IS NOT NULL THEN
  IF code.consumed_update_id=p_update_id AND code.consumed_chat_id=p_chat_id THEN
   SELECT * INTO paired FROM finance_telegram_pairs WHERE bot_id=p_bot_id AND chat_id=p_chat_id AND user_id=code.user_id AND active;
   RETURN CASE WHEN FOUND THEN to_jsonb(paired) ELSE NULL END;
  END IF;
  RETURN NULL;
 END IF;
 IF code.expires_at<=now() THEN RETURN NULL; END IF;
 SELECT * INTO existing FROM finance_telegram_pairs WHERE bot_id=p_bot_id AND chat_id=p_chat_id FOR UPDATE;
 IF FOUND AND existing.active AND existing.user_id<>code.user_id THEN RETURN NULL; END IF;
 UPDATE finance_telegram_pairs SET active=false,updated_at=now(),actor=code.actor WHERE bot_id=p_bot_id AND user_id=code.user_id AND active AND chat_id<>p_chat_id;
 INSERT INTO finance_telegram_pairs(bot_id,chat_id,telegram_user_id,user_id,actor) VALUES(p_bot_id,p_chat_id,p_user_id,code.user_id,code.actor)
 ON CONFLICT(bot_id,chat_id) DO UPDATE SET telegram_user_id=EXCLUDED.telegram_user_id,user_id=EXCLUDED.user_id,
 actor=EXCLUDED.actor,active=true,updated_at=now() RETURNING * INTO paired;
 UPDATE finance_telegram_codes SET used_at=now(),consumed_update_id=p_update_id,consumed_chat_id=p_chat_id WHERE hash=p_hash;
 RETURN to_jsonb(paired);
END; $$;
CREATE OR REPLACE FUNCTION finance_claim_telegram_update(p_bot_id bigint,p_update_id bigint,p_fingerprint text,p_lease uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item finance_telegram_updates%ROWTYPE;
BEGIN
 INSERT INTO finance_telegram_updates(bot_id,update_id,fingerprint,state,lease,locked_until)
 VALUES(p_bot_id,p_update_id,p_fingerprint,'processing',p_lease,now()+interval '2 minutes') ON CONFLICT DO NOTHING;
 SELECT * INTO item FROM finance_telegram_updates WHERE bot_id=p_bot_id AND update_id=p_update_id FOR UPDATE;
 IF item.fingerprint<>p_fingerprint THEN RETURN jsonb_build_object('state','conflict'); END IF;
 IF item.state='done' THEN RETURN jsonb_build_object('state','done','document_id',item.document_id,'outcome',item.outcome); END IF;
 IF item.lease<>p_lease AND item.locked_until>now() THEN RETURN jsonb_build_object('state','busy'); END IF;
 UPDATE finance_telegram_updates SET lease=p_lease,locked_until=now()+interval '2 minutes',
 attempts=attempts+CASE WHEN lease=p_lease THEN 0 ELSE 1 END,updated_at=now() WHERE bot_id=p_bot_id AND update_id=p_update_id;
 RETURN jsonb_build_object('state','claimed');
END; $$;
CREATE OR REPLACE FUNCTION finance_disconnect_telegram(p_bot_id bigint,p_user_id uuid,p_actor text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(417203019);
 UPDATE finance_telegram_pairs SET active=false,updated_at=now(),actor=p_actor WHERE bot_id=p_bot_id AND user_id=p_user_id AND active;
 UPDATE finance_telegram_codes SET used_at=now() WHERE bot_id=p_bot_id AND user_id=p_user_id AND used_at IS NULL;
 RETURN true;
END; $$;
CREATE OR REPLACE FUNCTION finance_finish_telegram_update(p_bot_id bigint,p_update_id bigint,p_lease uuid,p_outcome text,p_document_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE finance_telegram_updates SET state='done',outcome=p_outcome,document_id=p_document_id,updated_at=now()
 WHERE bot_id=p_bot_id AND update_id=p_update_id AND lease=p_lease AND state='processing';
 RETURN FOUND;
END; $$;
CREATE OR REPLACE FUNCTION finance_release_telegram_update(p_bot_id bigint,p_update_id bigint,p_lease uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE finance_telegram_updates SET locked_until=now(),updated_at=now() WHERE bot_id=p_bot_id AND update_id=p_update_id AND lease=p_lease AND state='processing';
 RETURN FOUND;
END; $$;

ALTER TABLE finance_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_documents_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_telegram_pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_telegram_pair_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_telegram_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_telegram_updates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON finance_documents,finance_documents_audit,finance_telegram_pairs,finance_telegram_pair_audit,finance_telegram_codes,finance_telegram_updates FROM PUBLIC,anon,authenticated;
GRANT ALL ON finance_documents,finance_documents_audit,finance_telegram_pairs,finance_telegram_pair_audit,finance_telegram_codes,finance_telegram_updates TO service_role;
GRANT USAGE,SELECT ON SEQUENCE finance_documents_audit_id_seq,finance_telegram_pair_audit_id_seq TO service_role;
REVOKE ALL ON FUNCTION finance_documents_audit_change(),finance_telegram_pair_audit_change(),finance_link_document(uuid,uuid,integer,text),finance_create_document_record(uuid,integer,jsonb,text),finance_issue_telegram_code(bigint,text,uuid,text),finance_consume_telegram_code(bigint,text,bigint,bigint,bigint),finance_claim_telegram_update(bigint,bigint,text,uuid),finance_finish_telegram_update(bigint,bigint,uuid,text,uuid),finance_release_telegram_update(bigint,bigint,uuid),finance_disconnect_telegram(bigint,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION finance_documents_audit_change(),finance_telegram_pair_audit_change(),finance_link_document(uuid,uuid,integer,text),finance_create_document_record(uuid,integer,jsonb,text),finance_issue_telegram_code(bigint,text,uuid,text),finance_consume_telegram_code(bigint,text,bigint,bigint,bigint),finance_claim_telegram_update(bigint,bigint,text,uuid),finance_finish_telegram_update(bigint,bigint,uuid,text,uuid),finance_release_telegram_update(bigint,bigint,uuid),finance_disconnect_telegram(bigint,uuid,text) TO service_role;
-- Reuse the private attachment bucket so linked files retain the existing API.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='finance-private' AND NOT public) THEN RAISE EXCEPTION 'The existing finance-private bucket must be private'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='finance_inbox_server_only') THEN
  CREATE POLICY finance_inbox_server_only ON storage.objects AS RESTRICTIVE FOR ALL TO anon,authenticated
  USING(NOT(bucket_id='finance-private' AND name LIKE 'inbox/%')) WITH CHECK(NOT(bucket_id='finance-private' AND name LIKE 'inbox/%'));
 END IF;
END $$;
COMMIT;
