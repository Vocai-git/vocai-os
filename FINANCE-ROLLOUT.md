# Finanzas prácticas

## Behavior

The legacy expense type combines recurrence and investment. The new workspace
separates a purchase/sale document from its actual payments. An unpaid forecast
has no effect on cash or the amount owed to a partner. A purchase paid personally
increases that partner's operating balance; client money received personally
reduces it. Transfers reimburse advances without creating a second expense.

Contributions are independent: startup and company capital each show what each
partner contributed, their half and the remaining personal equalization payment.
That settlement never moves company cash or its operating debts.

The capture screen accepts a quick entry or a private PDF/JPG/PNG attachment.
Supplier, invoice number, service period and recurrence are optional details.
Attachments are preserved originals; no OCR or tax calculation is performed.
Partial payments are supported. Monthly recurrence is an explicit “prepare next
month” action, creating an unpaid forecast with no copied payments or invoice
number. It is not a bank debit or an automatic confirmed charge.

## Private opening position

Start with a reviewed opening snapshot, retained separately from historical
documents. The private JSON and generated SQL are ignored by Git. Never commit
real financial values, documents, access tokens or screenshots to this public
repository. Test fixtures are fictional.

`config/finance-opening.private.json` is an installation input, not an application
dependency. It contains the reviewed baseline and unpaid documents. Closed
references may retain receipts and prepare future forecasts without being counted
twice. They cannot be edited/voided through the normal form: changing the opening
position requires a separate review. A payment on the cutoff day can still be new;
check that it was not already included in the opening snapshot.

## Activation (explicit approval required)

1. Back up existing expenses, invoices, notes and the private opening JSON to a
   private destination. Reconcile changes since the snapshot with the user: do not
   silently start from an outdated balance.
2. Apply `db/migration_finance_workspace.sql` using the authorized database admin
   channel. It adds four RLS-enabled tables, audit trigger and a private bucket.
   Existing expenses, invoices, notes and buckets are not altered.
3. Generate private seed SQL:
   `node scripts/finance-opening-sql.js config/finance-opening.private.json`.
   Review it and apply it in a transaction. Re-running never overwrites an existing
   opening position or record. Keep that SQL private.
4. Verify counts, balances, RLS, audit insert and the private storage bucket in a
   staging/authorized environment. Unit/HTTP tests do not execute PostgreSQL.
5. Deploy this branch only after authorized merge to `main`. Ensure
   `SUPABASE_SERVICE_KEY` is configured, then set `FINANCE_V2=true` in Railway.
   The application must not create buckets or run migrations at startup.
6. Verify authenticated receipt upload/download and unauthenticated denial in the
   deployed environment; verify summary and pending documents against the opening
   snapshot. These live checks remain required before declaring activation done.

With the flag off the original screens and routes remain active. With it on,
legacy writes are rejected, the old automatic copier is disabled, and original
expenses/invoices are available under a clearly labeled read-only history. The
Dashboard uses the new cash and pending totals; current Goals uses real payment
dates. Legacy read APIs remain original historical data for backwards
compatibility, not the current ledger. Any outside consumer must be moved to
`/api/finance` before it is used for new financial reporting.

After live entries exist, turning the flag off is NOT a data rollback: new records
remain in the new tables. Freeze writes and reconcile before switching back. Never
resume the old monthly copier on top of a live new ledger.

## Validation

`node --test tests/finance.test.js tests/finance-api.test.js`

Tests cover integer-cent balances, partial payments, personal/company accounts,
reimbursements, contributions, private settlements, ignored closed references,
future/pre-close payments, recurrence, stale edits, retry idempotency, voids,
authentication and attachment content checks. HTTP tests use an in-memory database
double and no production credentials. SQL migration/storage behavior must be
verified separately during the authorized activation.

`node scripts/finance-preview.js <output.html> [private-opening.json]` builds a
standalone offline review page. Inputs only change browser memory and reset on
reload. It shares the production renderer and calculation engine; it is not a
substitute for a live integration test. Omit the private file for fictional data.

## Current branch handoff

Branch: `santi/finanzas-practicas`, based on `origin/main`. Do not concurrently edit
`public/js/app.js`, `public/app.html`, `public/js/modules/{money,dashboard,goals}.js`,
`public/css/money.css`, `routes/finance.js`, `lib/finance.js`, `server.js`, or the
recurring-expense automation. The pronósticos branch remains separate and was not
merged. No schema migration, seed, production deployment or change of the Railway
flag was performed while implementing this branch.
