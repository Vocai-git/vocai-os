'use strict';
// Prints reviewable SQL only. Does not load .env or connect to any database.
const fs = require('fs');
const source = process.argv[2];
if (!source) throw new Error('Usage: node scripts/finance-opening-sql.js <private-opening.json>');
const { baseline, records } = JSON.parse(fs.readFileSync(source, 'utf8'));
const { validate } = require('../lib/finance');
const sql = value => "'" + String(value).replace(/'/g, "''") + "'";
console.log('-- Private reviewed opening position. Execute once after the schema migration.');
console.log('BEGIN;');
console.log(`INSERT INTO finance_settings(id,baseline) VALUES (true,${sql(JSON.stringify(baseline))}::jsonb) ON CONFLICT(id) DO NOTHING;`);
for (const r of records) {
  const data = validate(r.data, r.included_in_opening ? '2000-01-01' : baseline.cutoff, baseline.cutoff);
  if(r.data.history) data.history=r.data.history;
  console.log(`INSERT INTO finance_records(id,data,origin_key,actor,included_in_opening) VALUES (${sql(r.id)},${sql(JSON.stringify(data))}::jsonb,${sql(r.origin_key)},${sql(r.actor)},${r.included_in_opening?'true':'false'}) ON CONFLICT(id) DO NOTHING;`);
}
console.log('COMMIT;');
