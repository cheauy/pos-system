/* eslint-disable @typescript-eslint/no-require-imports -- Executes proposed TS using explicit synthetic configuration and SDK doubles. */
const test=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),path=require('node:path'),fs=require('node:fs');
const {candidates,serviceSqlCalls,directWrites}=require('../scripts/build-barcode-tenant-client-patch.cjs');
test('proposed service clients preserve singleton config and isolate each business header',()=>{
 const calls=[];const {outputText,diagnostics}=ts.transpileModule(candidates['lib/supabase/admin.ts'],{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020},reportDiagnostics:true});
 assert.ok(!diagnostics?.some(x=>x.category===ts.DiagnosticCategory.Error));
 const fixtureModule={exports:{}};
 new Function('process','require','module','exports',outputText)({env:{NEXT_PUBLIC_SUPABASE_URL:'https://synthetic.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-not-a-credential'}},name=>{
  if(name==='server-only')return{};
  if(name==='@supabase/supabase-js')return{createClient:(url,key,options)=>{const client={options};calls.push({url,key,client});return client;}};
  throw new Error('Unmocked dependency '+name);
 },fixtureModule,fixtureModule.exports);
 const A='10000000-0000-4000-8000-000000000001',B='10000000-0000-4000-8000-000000000002';
 const a=fixtureModule.exports.createBusinessAdminClient(A),b=fixtureModule.exports.createBusinessAdminClient(B);
 assert.notEqual(a,b);assert.equal(a.options.global.headers['x-tenh-business-id'],A);assert.equal(b.options.global.headers['x-tenh-business-id'],B);
 assert.equal(fixtureModule.exports.supabaseAdmin.options.global,undefined);
 assert.equal(a.options.auth.persistSession,false);assert.equal(a.options.auth.autoRefreshToken,false);
 assert.throws(()=>fixtureModule.exports.createBusinessAdminClient('invalid'),/valid business/);assert.equal(calls.length,3);
});
test('proposed direct writer intent is explicit, and the installed SDK clones request headers',()=>{
 assert.ok(directWrites.length>=60);
 assert.deepEqual(directWrites.filter(x=>x.status==='explicit-context-required-no-guess'),[]);
 assert.deepEqual(JSON.parse(fs.readFileSync('docs/proposed/20261012_barcode_v3_direct_writer_manifest.json','utf8')).writers,directWrites);
 const sdk=fs.readFileSync('node_modules/@supabase/postgrest-js/src/PostgrestBuilder.ts','utf8');
 const method=/setHeader\(name: string, value: string\): this \{([\s\S]*?)\n  \}/.exec(sdk);
 assert.ok(method);const setHeader=new Function('name','value',method[1]);
 const shared=new Headers({'existing':'keep'}),a={headers:shared},b={headers:shared};
 setHeader.call(a,'x-tenh-business-id','business-a');setHeader.call(b,'x-tenh-business-id','business-b');
 assert.equal(shared.get('x-tenh-business-id'),null);assert.equal(a.headers.get('x-tenh-business-id'),'business-a');assert.equal(b.headers.get('x-tenh-business-id'),'business-b');
});
test('every existing service SQL call gets a proven local business binding; shared headers never mutate',()=>{
 const actions=candidates['app/(dashboard)/dashboard/products/actions.ts'];
 assert.ok(serviceSqlCalls>10);assert.equal((actions.match(/createBusinessAdminClient\((?:business\.id|businessId)\)\.from|createBusinessAdminClient\((?:business\.id|businessId)\)\s*\n\s*\.from/g)||[]).length,serviceSqlCalls);
 assert.doesNotMatch(actions,/supabaseAdmin\s*\.from/);assert.doesNotMatch(actions,/setHeader/);
 assert.match(candidates['app/(dashboard)/dashboard/categories/actions.ts'],/requirePermission\("categories.manage"\);\s*const supabase = await createClient\(\{ "x-tenh-business-id": business.id \}\)/);
});
test('the unapplied client candidates typecheck together against the current workspace',()=>{
 const configPath=path.resolve('tsconfig.json'),config=ts.readConfigFile(configPath,ts.sys.readFile);
 assert.equal(config.error,undefined);
 const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,path.dirname(configPath),{noEmit:true,incremental:false});
 const host=ts.createCompilerHost(parsed.options),originalGet=host.getSourceFile.bind(host);
 const overrides=new Map(Object.entries(candidates).map(([file,text])=>[path.resolve(file).toLowerCase(),text]));
 host.getSourceFile=(file,languageVersion,onError,shouldCreateNewSourceFile)=>{
  const text=overrides.get(path.resolve(file).toLowerCase());
  return text===undefined?originalGet(file,languageVersion,onError,shouldCreateNewSourceFile):ts.createSourceFile(file,text,languageVersion,true);
 };
 const program=ts.createProgram(parsed.fileNames,parsed.options,host);
 const errors=ts.getPreEmitDiagnostics(program).filter(x=>x.category===ts.DiagnosticCategory.Error);
 assert.equal(errors.length,0,ts.formatDiagnosticsWithColorAndContext(errors,{getCanonicalFileName:file=>file,getCurrentDirectory:()=>process.cwd(),getNewLine:()=> '\n'}));
});
