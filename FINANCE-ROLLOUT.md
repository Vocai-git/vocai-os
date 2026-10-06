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
Keep `FINANCE_V2_LIVE` unset/false until the owner authorizes live activation.
In this review mode all V2 mutations (including file uploads and recurrence) are
rejected server-side, while legacy editing and its existing automation continue.
Dashboard and Goals continue using the original ledger during review.

V2 displays the reviewed snapshot and the full original expenses/invoices via
an authenticated, paginated API, with month/type/search filters. The local demo
embeds a private snapshot from ignored `config/finance-history.private.json`.
Original records include forecasts and incorrect payer/payment labels. The
offline importer requires a reviewed rule for every source before integrating
it. Monthly reporting uses those classifications and preserves the original
record for inspection. A source count confirms coverage, not bank reconciliation.
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

`npm run test:finance`

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
recurring-expense automation. The pronósticos branch remains separate and must not be merged as part of this
rollout. Activation state and private backup paths are recorded in the workspace
handoff, outside this public repository.


## Integrated historical ledger

Build the reviewed full seed offline with:
`node scripts/finance-integrate-history.js config/finance-base.private.json config/finance-history.private.json config/finance-rules.private.json config/finance-opening.private.json`.
All these inputs and the generated output are private and ignored by Git.
Every source needs an explicit reviewed rule. The importer maps originals to an
existing corrected record, or creates a stable read-only historical record with
original fields and provenance. No legacy database records are modified.
Historical paid records without an exact payment date use the original recorded
month for monthly reporting and explicitly say so. They never invent bank dates.
Assigned personal compensation, drafts, duplicates, startup investment and an
unresolved possible duplicate are separate from operating receipts/payments.
Assigned customer revenue remains business income even without a cash receipt.
Its agreed reduction of the partner balance is already in the opening position;
do not subtract it again when the customer settles privately with that partner.
Historical references are excluded from opening balance arithmetic. Reviewed
live/pending records retain their source metadata on edits. Investment details
appear in the contributions view. Raw source records remain separately accessible.
The opening SQL generator now preserves history metadata. This is a pre-activation
seed, not a live overwrite/migration: do not run against an already active ledger
without checking changes and a separately reviewed update plan.

## Monthly overview and drill-down

The opening view is the business result: recorded income less confirmed expenses
for the service month. A single-month service period takes priority over the
document date; a multi-month period retains the document month until allocation
is explicitly reviewed. The original document and payment dates are preserved.
Historical payroll with an explicit prior service month in its source notes is
normalized in the private import rules, without changing its payment month.

The separate cash view uses actual payments, including partial payments and money
received or paid personally by partners. It covers operating client receipts and
expense payments. Investment, capital and transfers remain visible in All
movements and are not part of the operating result. No invoice, cash collection
or payment is invented to make a balance match.

`public/js/finance-report.js` supplies both card totals and the included amount of
each drill-down row. The business table shows only that month's confirmed amount;
the cash table shows only payments in that month, rather than the full invoice.
Forecasts have a separate filter and do not appear as confirmed unpaid invoices.
Source duplicates, drafts and review exceptions remain consultable in All.

The overview separates the business result, actual cash movements and forecasts,
with links to each exact breakdown. Saldos is the last navigation item;
its calculation expands to the contributing payments, receipts and assignments.
The original VOCAI fonts, surfaces and theme colors are retained.

## Finance dashboard

The redesigned overview adds available company money, a six-month comparison,
current receivables/payables, confirmed expense categories and direct record
access. Its renderer/styles are isolated in `money-dashboard.js` and
`finance-dashboard.css`, retaining the original VOCAI theme.

The operating result stays provisional for an open month, review exceptions or
outstanding forecasts. A conditional result subtracting those forecasts is
explicitly labelled as conditional, rather than presenting expected costs as
actual payments. The dashboard never claims a monthly close has been completed.

Company cash and outstanding documents describe the current reviewed snapshot,
with its date displayed independently of the selected reporting month. Forecasts
are not confirmed payables, and customer income assigned to a partner is excluded
from company receivables. The chart and categories use the same monthly engine
as the drill-down lists. Original categories may be reused only when source
categories agree; explicit reviewed categories take priority. Unknown/conflicting
categories stay unclassified. A category filter retains the exact contributing
record IDs and can be cleared without changing data.

Desktop, narrow-panel and mobile layouts were inspected. No production data,
schema, activation flag or deployment was changed by this dashboard redesign.


## Live entry and preservation of the original version

The V2 navigation is available to the same authenticated users as the existing
platform. The original finance, investment and invoice pages remain consultable,
with a notice directing changes to V2 once live mode is active. Legacy writes and
the old recurring copier stay frozen while `FINANCE_V2_LIVE=true`, even if V2
visibility is temporarily switched off. Hiding V2 is not a rollback.

Live capture supports new documents, document edits, partial payments, private
attachments, transfers and partner contributions. Imported opening amounts remain
locked; their original records, attachments and audit history are available.
Correcting an opening amount needs a reviewed opening correction rather than a
second payment. Recurrence creates a forecast in the next month, with no inherited
payments or historical assignment. It cannot copy a month already in the opening.

Confirmed payment entries are append-only within a document. Correct a mistaken
payment by voiding the document with a reason and creating its replacement. These
operations retain audit history. Attachment retries after a successful document
save reuse that document rather than creating another expense.

The dashboard and revenue goals use the same reporting model as V2. Assigned
income remains revenue without a fabricated receipt. Forecasts are separate from
confirmed payables. The styles inherit the existing theme colors, including green
income and coral expense borders, in both light and dark themes.
