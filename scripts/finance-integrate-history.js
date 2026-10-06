'use strict';
// Offline only: reviewed rules contain source IDs and corrections; keep them private.
const fs=require('fs');const {integrate}=require('../lib/finance-import');
const [base,history,rules,output]=process.argv.slice(2);
if(!output)throw new Error('Usage: node scripts/finance-integrate-history.js <base.json> <history.json> <rules.json> <output.json>');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const result=integrate(read(history),read(base),read(rules));
fs.writeFileSync(output,JSON.stringify(result,null,2));
console.log(JSON.stringify({sources:result.coverage.length,records:result.records.length}));
