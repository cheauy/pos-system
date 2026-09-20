// Cross-platform test discovery (no shell glob expansion required on Windows).
import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sql=process.argv.includes('--sql'), continuation=process.argv.includes('--continuation');
const selected=new Set(['pos-branch-recovery.test.mjs','online-status-atomic.test.mjs','register-precision.test.mjs','register.test.mjs']);
const names=readdirSync(path.join(root,'tests')).filter(n=>sql?n.endsWith('.integration.cjs'):n.endsWith('.test.mjs')&&(!continuation||selected.has(n))).sort();
if(!names.length)throw new Error('No tests found; nothing was verified.');
if(sql){
  console.log('SQL tests use a disposable local PGlite instance with fixture schemas. They never connect to Supabase.');
  let failures=0;
  for(const name of names){const r=spawnSync(process.execPath,[path.join('tests',name)],{cwd:root,stdio:'inherit'});if(r.error)console.error(r.error.message);if(r.status!==0)failures++;}
  process.exitCode=failures?1:0;
}else{
  const [major,minor]=process.versions.node.split('.').map(Number);
  const strip=major>22||(major===22&&minor>=6);
  if(!strip&&!continuation)throw new Error('The existing .ts-import tests need Node 22.6+; use that Node version or run test:continuation for the transpiled focused tests.');
  const args=[...(strip?['--experimental-strip-types']:[]),'--test',...names.map(n=>path.join('tests',n))];
  console.log(`Running ${names.length} test files. Missing dependencies are failures, not skipped passes.`);
  const r=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit'});
  if(r.error)console.error(r.error.message);
  process.exitCode=r.status??1;
}
