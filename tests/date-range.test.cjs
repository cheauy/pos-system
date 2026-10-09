// Draft date filters are applied only when this check passes.
const {test}=require('node:test'),assert=require('node:assert/strict'),{loadTs}=require('./helpers/load-ts.cjs');
test('draft date ranges reject reversed and over-long spans, allow open ends',()=>{
 const {dateRangeError}=loadTs('lib/date-range.ts');
 assert.equal(dateRangeError('',''),'');
 assert.equal(dateRangeError('2026-10-01',''),'');
 assert.equal(dateRangeError('2026-10-08','2026-10-08'),'');
 assert.match(dateRangeError('2026-10-09','2026-10-08'),/on or before/);
 assert.equal(dateRangeError('2025-10-08','2026-10-08',365),'');
 assert.match(dateRangeError('2025-10-07','2026-10-08',365),/366 days/);
});
