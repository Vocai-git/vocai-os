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

## Parallel review before cutover

The sidebar preserves Finanzas, Inversión and Facturas, and adds Finanzas V2 and
Inversión V2. `FINANCE_V2=true` makes V2 available; it defaults to READ ONLY.
Keep `FINANCE_V2_LIVE` unset/false until Santiago and Agustín approve cutover.
In this review mode all V2 mutations (including file uploads and recurrence) are
rejected server-side, while legacy editing and its existing automation continue.
Dashboard and Goals continue using the original ledger during review.

V2 displays the reviewed snapshot and the full original expenses/invoices via
an authenticated, paginated API, with month/type/search filters. The local demo
embeds a private snapshot from ignored `config/finance-history.private.json`.
Original records include forecasts and incorrect payer/payment labels: they are
not confirmed cash flows. Monthly cards show known reviewed payment dates, with
an explicit partial-history warning through the opening month. This is NOT a
complete reconciled monthly income statement for the historical period.
Changes in legacy after the opening snapshot are not silently synchronized into
V2 balances. Reconcile the delta and complete payment evidence before cutover.

Only after approval and reconciliation set `FINANCE_V2_LIVE=true`. That freezes
legacy writes and its recurring copier and activates V2 financial reporting.
The old screens and data remain available for reference; removal is a separate
user decision. Never run two writable financial ledgers independently.
Switching off flags after live entries is not a rollback: preserve V2 records,
freeze writes and reconcile before any return to legacy.

Monthly batch preparation, statement import, a persisted monthly close, invoice
OCR, email and messaging intake are future steps, not implemented features.

## Validation

`node --test tests/finance.test.js tests/finance-api.test.js tests/finance-monthly.test.js`

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
