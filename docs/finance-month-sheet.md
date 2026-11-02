# Monthly finance dashboard

The default summary lists service-month income and expenses with their document amount, actual collections/payments, and outstanding balance. Each row expands to show payment dates and accounts and opens the existing record/attachment editor. Pending items use the existing payment form; no new payment endpoint or persistence mechanism is introduced.

- `FinanceReport.monthSheet` reuses the report engine's service-month and exclusion rules. Settlements are current through the supplied reporting date, including payments made in later months, labelled on the row.
- The cash view uses only payments dated in the selected month. Startup investment, contributions, transfers, voids, duplicates, drafts, and review-only records retain their existing treatment.
- The explicit category `Reembolsos de gastos` identifies supplier refunds. These appear in a separate block and are added back in the balance calculation, not presented as customer sales. Titles alone never determine this classification.
- Gross document amounts include recorded VAT. Explicit IRPF reduces settlement amounts and is shown separately. The displayed balance is not labelled net profit.
- Assigned/opening balances are distinguished from real cash. Unpaid forecasts stay in an expandable review block. A partially paid forecast follows the existing proportional gross-recognition rule.
- The pending filter hides settled rows but keeps clearly labelled whole-month totals. On phones each row becomes a card exposing all amount columns without horizontal scrolling.
- Company bank/cash balances remain a current snapshot, explicitly separate from a selected month's closing balance.

Validation: `npm run test:finance` (290 passed, 24 invoice database tests skipped because the optional PGlite dependency is unavailable). Added coverage for salary service/payment months, partial collections, refunds, opening/assigned settlement, IRPF, forecasts, escaped labels, read-only mode, and the live payment-form action. Desktop and 390px mobile views were checked with a private, read-only local snapshot; financial snapshots are not committed.

Implementation branch: `santi/resumen-mensual-claro`. Changed frontend files: `public/app.html`, `public/css/finance-dashboard.css`, `public/js/finance-report.js`, `public/js/modules/money-dashboard.js`. Coordinate concurrent edits to these files before starting another task. No migration or schema change is required.

Follow-up (`santi/movimientos-simples`): the Movements view uses one compact toolbar with Search, View, and Type. The four mode buttons have been replaced by the View select; service-month, cash-date, forecasts, and full archive remain available. No calculation or persistence changes. Validated with the 32 existing finance UI/monthly tests and browser checks for mode switching, type filtering, and searching. Frontend files: `public/app.html`, `public/css/money.css`, `public/js/modules/money.js`.
