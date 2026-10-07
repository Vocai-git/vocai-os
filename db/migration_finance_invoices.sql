-- Private invoice drafts and explicit issuance. No existing financial data is
-- imported, renumbered or paid by this migration. Initialize each year's last
-- real issued number separately after checking the source invoices.
BEGIN;

CREATE TABLE IF NOT EXISTS finance_invoice_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 issuer jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(issuer)='object'),
 version integer NOT NULL DEFAULT 1 CHECK(version>0), actor text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS finance_invoice_series (
 year integer PRIMARY KEY CHECK(year BETWEEN 2000 AND 9999),
 last_number integer NOT NULL CHECK(last_number BETWEEN 0 AND 999999999),
 last_date date, actor text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((last_number=0 AND last_date IS NULL) OR (last_number>0 AND last_date IS NOT NULL AND extract(year FROM last_date)=year))
);
CREATE TABLE IF NOT EXISTS finance_invoices (
 id uuid PRIMARY KEY, document jsonb NOT NULL CHECK(jsonb_typeof(document)='object'),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','issued','imported')),
 number text UNIQUE, series_year integer REFERENCES finance_invoice_series(year), sequence_number integer,
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 record_id uuid REFERENCES finance_records(id), record_version integer,
 new_record_id uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
 issuer_snapshot jsonb, pdf_path text UNIQUE,
 actor text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(), issued_at timestamptz,
 CHECK((record_id IS NULL AND record_version IS NULL) OR (record_id IS NOT NULL AND record_version>0)),
 CHECK(pdf_path IS NULL OR pdf_path ~ '^issued-invoices/[a-zA-Z0-9/_-]+\.pdf$'),
 CHECK((status='draft' AND number IS NULL AND series_year IS NULL AND sequence_number IS NULL AND issuer_snapshot IS NULL AND issued_at IS NULL AND pdf_path IS NULL)
  OR (status IN ('issued','imported') AND length(number)>0 AND series_year IS NOT NULL AND sequence_number>0
   AND jsonb_typeof(issuer_snapshot)='object' AND issued_at IS NOT NULL
   AND number=series_year::text||'-'||lpad(sequence_number::text,greatest(3,length(sequence_number::text)),'0')
   AND (status<>'issued' OR record_id IS NOT NULL) AND (status<>'imported' OR pdf_path IS NOT NULL)))
);
CREATE UNIQUE INDEX IF NOT EXISTS finance_invoice_unique_sequence ON finance_invoices(series_year,sequence_number) WHERE status<>'draft';
CREATE UNIQUE INDEX IF NOT EXISTS finance_invoice_unique_issued_record ON finance_invoices(record_id) WHERE status IN ('issued','imported');
CREATE INDEX IF NOT EXISTS finance_invoices_created ON finance_invoices(created_at DESC,id);
CREATE TABLE IF NOT EXISTS finance_invoice_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 entity text NOT NULL, entity_id text NOT NULL, actor text NOT NULL,
 before_row jsonb, after_row jsonb NOT NULL, at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION finance_invoice_audit_change() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 INSERT INTO finance_invoice_audit(entity,entity_id,actor,before_row,after_row)
 VALUES(TG_TABLE_NAME,coalesce(to_jsonb(NEW)->>'id',to_jsonb(NEW)->>'year'),NEW.actor,
  CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,to_jsonb(NEW));
 RETURN NEW;
END; $$;

-- Verify canonical arithmetic again inside the issuance transaction. The API
-- additionally validates text, types and drafts; client-provided totals never
-- choose a number or determine the financial movement.
CREATE OR REPLACE FUNCTION finance_invoice_assert_document(p_document jsonb) RETURNS void
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE line jsonb; field text; quantity bigint; price bigint; base bigint:=0; line_base bigint;
 vat_rate integer; irpf_rate integer; vat bigint; irpf bigint; cumulative_vat bigint:=0;
 previous_vat bigint:=0; invoice_date date; required text[]:=ARRAY['name','tax_id','address','postal_code','city','country'];
BEGIN
 IF jsonb_typeof(p_document)<>'object' OR jsonb_typeof(p_document->'lines')<>'array'
  OR jsonb_array_length(p_document->'lines') NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'La factura necesita entre 1 y 50 conceptos'; END IF;
 IF coalesce(p_document->>'date','')!~'^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Fecha de factura no válida'; END IF;
 invoice_date:=(p_document->>'date')::date;
 IF invoice_date>(now() AT TIME ZONE 'Europe/Madrid')::date THEN RAISE EXCEPTION 'La fecha de emisión no puede estar en el futuro'; END IF;
 IF p_document->>'due' IS NOT NULL AND (p_document->>'due')::date<invoice_date THEN RAISE EXCEPTION 'El vencimiento no puede ser anterior a la factura'; END IF;
 IF (p_document->>'period_start' IS NULL)<>(p_document->>'period_end' IS NULL)
  OR (p_document->>'period_end')::date<(p_document->>'period_start')::date THEN RAISE EXCEPTION 'El período del servicio no es válido'; END IF;
 FOREACH field IN ARRAY required LOOP
  IF jsonb_typeof(p_document->'customer'->field)<>'string' OR coalesce(length(btrim(p_document->'customer'->>field)),0)=0 THEN RAISE EXCEPTION 'Completa los datos fiscales del cliente'; END IF;
 END LOOP;
 IF coalesce(p_document->>'vat_rate','')!~'^\d+$' OR coalesce(p_document->>'irpf_rate','')!~'^\d+$' THEN RAISE EXCEPTION 'Porcentajes fiscales no válidos'; END IF;
 vat_rate:=(p_document->>'vat_rate')::integer; irpf_rate:=(p_document->>'irpf_rate')::integer;
 IF vat_rate NOT BETWEEN 0 AND 10000 OR irpf_rate NOT BETWEEN 0 AND 10000 THEN RAISE EXCEPTION 'Porcentajes fiscales fuera del límite'; END IF;
 FOR line IN SELECT value FROM jsonb_array_elements(p_document->'lines') LOOP
  IF jsonb_typeof(line)<>'object' OR coalesce(length(btrim(line->>'description')),0) NOT BETWEEN 1 AND 180
   OR coalesce(length(line->>'detail'),0)>500 OR coalesce(line->>'quantity','')!~'^\d+$'
   OR coalesce(line->>'unit_price','')!~'^\d+$' THEN RAISE EXCEPTION 'Revisa los conceptos de la factura'; END IF;
  quantity:=(line->>'quantity')::bigint; price:=(line->>'unit_price')::bigint;
  IF quantity NOT BETWEEN 1 AND 100000000 OR price NOT BETWEEN 0 AND 1000000000 THEN RAISE EXCEPTION 'Cantidad o precio fuera del límite'; END IF;
  line_base:=(quantity*price+500)/1000; base:=base+line_base;
  IF base>1000000000 THEN RAISE EXCEPTION 'La factura supera el importe máximo'; END IF;
  cumulative_vat:=(base*vat_rate+5000)/10000;
  IF line->'base' IS DISTINCT FROM to_jsonb(line_base) OR line->'vat' IS DISTINCT FROM to_jsonb(cumulative_vat-previous_vat)
   OR line->'total' IS DISTINCT FROM to_jsonb(line_base+cumulative_vat-previous_vat) THEN RAISE EXCEPTION 'Los importes de los conceptos no coinciden'; END IF;
  previous_vat:=cumulative_vat;
 END LOOP;
 vat:=(base*vat_rate+5000)/10000; irpf:=(base*irpf_rate+5000)/10000;
 IF base<=0 OR base+vat>1000000000 OR base+vat-irpf<=0 THEN RAISE EXCEPTION 'El total neto de la factura no es válido'; END IF;
 IF p_document->'totals' IS DISTINCT FROM jsonb_build_object('base',base,'vat',vat,'irpf',irpf,'gross',base+vat,'net',base+vat-irpf) THEN RAISE EXCEPTION 'Los totales de la factura no coinciden'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION finance_initialize_invoice_series(p_year integer,p_last_number integer,p_last_date date,p_actor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE existing finance_invoice_series%ROWTYPE;
BEGIN
 IF p_year NOT BETWEEN 2000 AND 9999 OR p_last_number NOT BETWEEN 0 AND 999999999 OR p_year IS NULL OR p_last_number IS NULL
  OR (p_last_number=0 AND p_last_date IS NOT NULL) OR (p_last_number>0 AND (p_last_date IS NULL OR extract(year FROM p_last_date)<>p_year))
  OR p_last_date>(now() AT TIME ZONE 'Europe/Madrid')::date OR coalesce(length(btrim(p_actor)),0)=0 THEN RAISE EXCEPTION 'Revisa el último número y fecha de la serie'; END IF;
 -- This singleton lock also serializes issuer changes and actual issuance.
 PERFORM 1 FROM finance_invoice_settings WHERE id=true FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Falta configurar la emisión de facturas'; END IF;
 SELECT * INTO existing FROM finance_invoice_series WHERE year=p_year FOR UPDATE;
 IF FOUND THEN
  IF existing.last_number=p_last_number AND existing.last_date IS NOT DISTINCT FROM p_last_date THEN RETURN to_jsonb(existing); END IF;
  RAISE EXCEPTION 'La serie ya está inicializada; no se puede reiniciar su numeración';
 END IF;
 IF EXISTS(SELECT 1 FROM finance_invoices WHERE series_year=p_year AND status<>'draft') THEN RAISE EXCEPTION 'Ya existen facturas en esa serie'; END IF;
 INSERT INTO finance_invoice_series(year,last_number,last_date,actor) VALUES(p_year,p_last_number,p_last_date,p_actor) RETURNING * INTO existing;
 RETURN to_jsonb(existing);
END; $$;

CREATE OR REPLACE FUNCTION finance_issue_invoice(p_invoice_id uuid,p_version integer,p_issuer_version integer,p_actor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE inv finance_invoices%ROWTYPE; settings finance_invoice_settings%ROWTYPE; series finance_invoice_series%ROWTYPE;
 rec finance_records%ROWTYPE; next_number integer; official_number text; invoice_date date; invoice_year integer;
 totals jsonb; tax_data jsonb; row_data jsonb; field text; title text; internal_reference boolean;
BEGIN
 IF p_version IS NULL OR p_version<1 OR coalesce(length(btrim(p_actor)),0)=0 THEN RAISE EXCEPTION 'Emisión no válida'; END IF;
 SELECT * INTO inv FROM finance_invoices WHERE id=p_invoice_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;
 IF inv.status='issued' THEN
  IF p_version NOT IN (inv.version,inv.version-1) THEN RAISE EXCEPTION 'La factura cambió. Recarga antes de continuar'; END IF;
  RETURN to_jsonb(inv);
 END IF;
 IF inv.status<>'draft' OR inv.version<>p_version THEN RAISE EXCEPTION 'La factura cambió o ya está emitida'; END IF;
 PERFORM finance_invoice_assert_document(inv.document);
 SELECT * INTO settings FROM finance_invoice_settings WHERE id=true FOR UPDATE;
 IF NOT FOUND OR settings.version IS DISTINCT FROM p_issuer_version THEN RAISE EXCEPTION 'Los datos del emisor cambiaron. Revisa la factura antes de emitir'; END IF;
 FOREACH field IN ARRAY ARRAY['name','tax_id','address','postal_code','city','country'] LOOP
  IF jsonb_typeof(settings.issuer->field)<>'string' OR coalesce(length(btrim(settings.issuer->>field)),0)=0 THEN RAISE EXCEPTION 'Completa los datos fiscales del emisor'; END IF;
 END LOOP;
 invoice_date:=(inv.document->>'date')::date; invoice_year:=extract(year FROM invoice_date)::integer;
 SELECT * INTO series FROM finance_invoice_series WHERE year=invoice_year FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Revisa e inicializa el último número real de este año antes de emitir'; END IF;
 IF series.last_date IS NOT NULL AND invoice_date<series.last_date THEN RAISE EXCEPTION 'La fecha no puede ser anterior a la última factura de la serie'; END IF;
 IF series.last_number>=999999999 THEN RAISE EXCEPTION 'La serie ha alcanzado su límite de numeración'; END IF;
 next_number:=series.last_number+1;
 official_number:=invoice_year::text||'-'||lpad(next_number::text,greatest(3,length(next_number::text)),'0');
 totals:=inv.document->'totals';
 tax_data:=jsonb_build_object('vat',jsonb_build_object('mode',CASE WHEN (inv.document->>'vat_rate')::integer=0 THEN 'none' ELSE 'added' END,
  'input',totals->'base','rate',inv.document->'vat_rate','base',totals->'base','tax',totals->'vat','total',totals->'gross'));
 IF (inv.document->>'irpf_rate')::integer>0 THEN tax_data:=tax_data||jsonb_build_object('irpf',jsonb_build_object('rate',inv.document->'irpf_rate','base',totals->'base','tax',totals->'irpf')); END IF;
 IF inv.record_id IS NOT NULL THEN
  SELECT * INTO rec FROM finance_records WHERE id=inv.record_id FOR UPDATE;
  IF NOT FOUND OR rec.voided OR rec.version IS DISTINCT FROM inv.record_version OR rec.data->>'kind'<>'income' THEN RAISE EXCEPTION 'El ingreso cambió. Recarga y revisa la vinculación'; END IF;
  IF coalesce(rec.data->'history'->>'status','') IN ('assigned','draft','duplicate','review') OR rec.data->'history'->>'classification'='startup' THEN RAISE EXCEPTION 'El ingreso no puede vincularse a una factura emitida'; END IF;
  IF rec.data->>'stage'='forecast' THEN RAISE EXCEPTION 'Confirma primero el ingreso previsto antes de emitir su factura'; END IF;
  IF EXISTS(SELECT 1 FROM finance_invoices WHERE record_id=rec.id AND status IN ('issued','imported')) THEN RAISE EXCEPTION 'El ingreso ya tiene una factura emitida'; END IF;
  internal_reference:=coalesce(rec.data->>'number','')~'^VOCAI-\d{4}-\d{3,}$' AND EXISTS(
   SELECT 1 FROM jsonb_array_elements(coalesce(rec.data->'history'->'sources','[]'::jsonb)) source
   WHERE source->>'table'='invoices' AND source->'original'->>'numero'=rec.data->>'number');
  IF coalesce(rec.data->>'number','')<>'' AND NOT internal_reference THEN RAISE EXCEPTION 'El ingreso ya tiene número de factura; conserva el documento existente'; END IF;
  FOREACH field IN ARRAY ARRAY['date','period_start','period_end','due'] LOOP
   IF nullif(rec.data->>field,'') IS DISTINCT FROM nullif(inv.document->>field,'') THEN RAISE EXCEPTION 'La fecha, el período y el vencimiento deben coincidir con el ingreso vinculado'; END IF;
  END LOOP;
  IF rec.data->'amount' IS DISTINCT FROM totals->'gross'
   OR (rec.data->>'amount')::bigint-coalesce((rec.data->'irpf'->>'tax')::bigint,0)<>(totals->>'net')::bigint THEN RAISE EXCEPTION 'El total y el neto no coinciden con el ingreso vinculado'; END IF;
  IF rec.data ? 'vat' AND (rec.data->'vat'->'base' IS DISTINCT FROM totals->'base' OR rec.data->'vat'->'tax' IS DISTINCT FROM totals->'vat' OR rec.data->'vat'->'rate' IS DISTINCT FROM inv.document->'vat_rate') THEN RAISE EXCEPTION 'El IVA no coincide con el ingreso vinculado'; END IF;
  IF rec.data ? 'irpf' AND (rec.data->'irpf'->'base' IS DISTINCT FROM totals->'base' OR rec.data->'irpf'->'tax' IS DISTINCT FROM totals->'irpf' OR rec.data->'irpf'->'rate' IS DISTINCT FROM inv.document->'irpf_rate') THEN RAISE EXCEPTION 'El IRPF no coincide con el ingreso vinculado'; END IF;
  IF (SELECT coalesce(sum((p->>'amount')::bigint),0) FROM jsonb_array_elements(coalesce(rec.data->'payments','[]'::jsonb)) p)>(totals->>'net')::bigint THEN RAISE EXCEPTION 'Los cobros superan el neto de la factura'; END IF;
  -- Retain original history, actual payments, service periods and opening
  -- inclusion. Only the official number and an equivalent tax breakdown change.
  row_data:=rec.data||tax_data||jsonb_build_object('number',official_number);
  UPDATE finance_records SET data=row_data,version=version+1,actor=p_actor,updated_at=now() WHERE id=rec.id RETURNING * INTO rec;
 ELSE
  SELECT left(string_agg(line->>'description',' · ' ORDER BY ord),180) INTO title FROM jsonb_array_elements(inv.document->'lines') WITH ORDINALITY AS lines(line,ord);
  row_data:=jsonb_build_object('kind','income','title',title,'amount',totals->'gross','date',inv.document->'date','party',inv.document->'customer'->'name',
   'number',official_number,'notes',inv.document->'notes','category','','period_start',inv.document->'period_start','period_end',inv.document->'period_end','due',inv.document->'due',
   'repeat','none','group',NULL,'source',NULL,'target',NULL,'stage','document','payments','[]'::jsonb)||tax_data;
  INSERT INTO finance_records(id,data,actor) VALUES(inv.new_record_id,row_data,p_actor) RETURNING * INTO rec;
 END IF;
 UPDATE finance_invoice_series SET last_number=next_number,last_date=invoice_date,actor=p_actor,updated_at=now() WHERE year=invoice_year;
 UPDATE finance_invoices SET status='issued',number=official_number,series_year=invoice_year,sequence_number=next_number,
  record_id=rec.id,record_version=rec.version,issuer_snapshot=settings.issuer,issued_at=now(),updated_at=now(),actor=p_actor,version=version+1
  WHERE id=inv.id RETURNING * INTO inv;
 RETURN to_jsonb(inv);
END; $$;

CREATE OR REPLACE FUNCTION finance_invoice_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF OLD.status<>'draft' AND (TG_OP='DELETE' OR NEW IS DISTINCT FROM OLD) THEN RAISE EXCEPTION 'La factura emitida se conserva sin cambios; su corrección requiere otro documento'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END; $$;
CREATE OR REPLACE FUNCTION finance_invoice_guard_record() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM finance_invoices WHERE record_id=OLD.id AND status IN ('issued','imported')) THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'La factura emitida impide borrar el ingreso vinculado'; END IF;
  -- Notes, categorization and payment append operations remain available. A
  -- receipt must not silently alter the issued invoice's identity or figures.
  IF (NEW.data-ARRAY['payments','notes','category']) IS DISTINCT FROM (OLD.data-ARRAY['payments','notes','category'])
   OR NEW.voided IS DISTINCT FROM OLD.voided OR NEW.included_in_opening IS DISTINCT FROM OLD.included_in_opening
   OR NEW.origin_key IS DISTINCT FROM OLD.origin_key THEN RAISE EXCEPTION 'La factura emitida protege los importes y datos del ingreso; registra el cobro sin cambiar la factura'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(OLD.data->'payments','[]'::jsonb)) old_payment
   WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(NEW.data->'payments','[]'::jsonb)) new_payment WHERE new_payment=old_payment)) THEN RAISE EXCEPTION 'La factura emitida conserva los cobros anteriores; no se pueden borrar ni sustituir'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END; $$;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='finance_invoices_audit_trigger' AND tgrelid='public.finance_invoices'::regclass) THEN
  CREATE TRIGGER finance_invoices_audit_trigger AFTER INSERT OR UPDATE ON finance_invoices FOR EACH ROW EXECUTE FUNCTION finance_invoice_audit_change();
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='finance_invoice_settings_audit_trigger' AND tgrelid='public.finance_invoice_settings'::regclass) THEN
  CREATE TRIGGER finance_invoice_settings_audit_trigger AFTER INSERT OR UPDATE ON finance_invoice_settings FOR EACH ROW EXECUTE FUNCTION finance_invoice_audit_change();
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='finance_invoice_series_audit_trigger' AND tgrelid='public.finance_invoice_series'::regclass) THEN
  CREATE TRIGGER finance_invoice_series_audit_trigger AFTER INSERT OR UPDATE ON finance_invoice_series FOR EACH ROW EXECUTE FUNCTION finance_invoice_audit_change();
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='finance_invoices_immutable_trigger' AND tgrelid='public.finance_invoices'::regclass) THEN
  CREATE TRIGGER finance_invoices_immutable_trigger BEFORE UPDATE OR DELETE ON finance_invoices FOR EACH ROW EXECUTE FUNCTION finance_invoice_immutable();
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='finance_invoice_record_guard' AND tgrelid='public.finance_records'::regclass) THEN
  CREATE TRIGGER finance_invoice_record_guard BEFORE UPDATE OR DELETE ON finance_records FOR EACH ROW EXECUTE FUNCTION finance_invoice_guard_record();
 END IF;
END $$;

INSERT INTO finance_invoice_settings(id,issuer,actor) VALUES(true,
 '{"name":"","tax_id":"","address":"","postal_code":"","city":"","country":"","email":"","website":"","iban":"","payment_method":""}'::jsonb,'Configuración inicial') ON CONFLICT(id) DO NOTHING;
ALTER TABLE finance_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_invoice_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_invoice_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_invoice_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON finance_invoices,finance_invoice_settings,finance_invoice_series,finance_invoice_audit FROM PUBLIC,anon,authenticated;
GRANT ALL ON finance_invoices,finance_invoice_settings,finance_invoice_series,finance_invoice_audit TO service_role;
REVOKE ALL ON SEQUENCE finance_invoice_audit_id_seq FROM PUBLIC,anon,authenticated;
GRANT USAGE,SELECT ON SEQUENCE finance_invoice_audit_id_seq TO service_role;
REVOKE ALL ON FUNCTION finance_invoice_audit_change(),finance_invoice_assert_document(jsonb),finance_initialize_invoice_series(integer,integer,date,text),finance_issue_invoice(uuid,integer,integer,text),finance_invoice_immutable(),finance_invoice_guard_record() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION finance_initialize_invoice_series(integer,integer,date,text),finance_issue_invoice(uuid,integer,integer,text),finance_invoice_assert_document(jsonb),finance_invoice_audit_change(),finance_invoice_immutable(),finance_invoice_guard_record() TO service_role;
COMMIT;
