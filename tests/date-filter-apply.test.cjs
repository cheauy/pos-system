/* eslint-disable @typescript-eslint/no-require-imports -- Isolated actual-source date boundary checks. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const {loadTs}=require('./helpers/load-ts.cjs');

function functions(file,names,now,constants='') {
  const source=fs.readFileSync(file,'utf8');
  const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const definitions=ast.statements.filter(node=>ts.isFunctionDeclaration(node)&&names.includes(node.name?.text)).map(node=>node.getText(ast));
  assert.equal(definitions.length,names.length,'boundary functions must be extracted from the actual page');
  const code=ts.transpileModule(constants+definitions.join('\n')+'\nmodule.exports={'+names.join(',')+'};',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const OriginalDate=Date;
  class FixtureDate extends OriginalDate { constructor(...args){super(...(args.length?args:[now]));}static now(){return OriginalDate.parse(now);} }
  const loaded={exports:{}};new Function('module','exports','Date',code)(loaded,loaded.exports,FixtureDate);return loaded.exports;
}

test('Dashboard preserves Cambodia midnight, exclusive end and rolling presets across year boundaries',()=>{
  const api=functions('app/(dashboard)/dashboard/page.tsx',['resolvePeriod','makePeriod','dateKeySpan','localDateKey','localDateStartIso','addDateKeyDays','firstParam','isDashboardRange','isDateKey','longDateLabel'],'2026-01-04T17:00:00Z','const UTC_OFFSET_MINUTES=420;');
  const leap=api.resolvePeriod({range:'custom',from:'2024-02-29',to:'2024-02-29'});
  assert.equal(leap.startIso,'2024-02-28T17:00:00.000Z');assert.equal(leap.endIso,'2024-02-29T17:00:00.000Z');assert.equal(leap.days,1);
  const inside=time=>Date.parse(time)>=Date.parse(leap.startIso)&&Date.parse(time)<Date.parse(leap.endIso);
  assert.equal(inside('2024-02-28T16:59:59.999Z'),false);assert.equal(inside(leap.startIso),true);assert.equal(inside('2024-02-29T16:59:59.999Z'),true);assert.equal(inside(leap.endIso),false);
  const week=api.resolvePeriod({range:'7d'});assert.equal(week.selectedFrom,'2025-12-30');assert.equal(week.selectedTo,'2026-01-05');assert.equal(week.days,7);
});

test('Reports retains its existing host-local inclusive dates, Monday weeks and leap days',()=>{
  const saved=process.env.TZ;process.env.TZ='UTC';
  try {
    const api=functions('app/(dashboard)/dashboard/reports/page.tsx',['getDateRange','startOfWeek','startOfDay','endOfDay','isValidDate','getLocalDateString'],'2026-01-04T12:00:00Z');
    const leap=api.getDateRange('custom','2024-02-29','2024-03-01');
    assert.equal(leap.startIso,'2024-02-29T00:00:00.000Z');assert.equal(leap.endIso,'2024-03-01T23:59:59.999Z');
    const week=api.getDateRange('week');assert.equal(week.startDate,'2025-12-29');assert.equal(week.endDate,'2026-01-04');
  }finally{if(saved===undefined)delete process.env.TZ;else process.env.TZ=saved;}
});

test('Staff Report retains UTC+7 inclusive bounds and rejects malformed, reversed and oversized ranges',()=>{
  const {staffReportDates}=loadTs('lib/analytics/staff-report.ts');
  const range=staffReportDates('custom','2024-02-29','2024-03-01',new Date('2026-10-10T17:00:00Z'));
  assert.equal(range.start,'2024-02-29T00:00:00+07:00');assert.equal(range.end,'2024-03-01T23:59:59.999+07:00');
  assert.equal(staffReportDates('today',undefined,undefined,new Date('2026-10-10T17:00:00Z')).from,'2026-10-11');
  for(const [from,to]of [['2026-02-30','2026-03-01'],['2026-10-11','2026-10-10'],['2024-01-01','2025-01-01']])assert.throws(()=>staffReportDates('custom',from,to));
});
