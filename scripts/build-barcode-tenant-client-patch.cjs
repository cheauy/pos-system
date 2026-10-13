/* eslint-disable @typescript-eslint/no-require-imports -- Builds an unapplied source patch; never edits runtime files. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),ts=require('typescript'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const actionPath='app/(dashboard)/dashboard/products/actions.ts',adminPath='lib/supabase/admin.ts',categoryPath='app/(dashboard)/dashboard/categories/actions.ts';
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const source=read(actionPath),ast=ts.createSourceFile(actionPath,source,ts.ScriptTarget.Latest,true);const edits=[];
function contextAt(node){
 for(let p=node.parent;p;p=p.parent)if(ts.isFunctionLike(p)&&p.body){
  if(p.parameters.some(x=>ts.isIdentifier(x.name)&&x.name.text==='businessId'))return 'businessId';
  const before=source.slice(p.body.getStart(),node.getStart());
  if(/\b(?:const|let)\s+(?:business\b|\{[^}]*\bbusiness\b[^}]*\})/.test(before))return 'business.id';
 }
 throw new Error('No proven business binding at SQL service caller line '+(ast.getLineAndCharacterOfPosition(node.getStart()).line+1));
}
function visit(node){
 if(ts.isIdentifier(node)&&node.text==='supabaseAdmin'&&ts.isPropertyAccessExpression(node.parent)&&node.parent.name.text==='from')edits.push({start:node.getStart(),end:node.getEnd(),text:'createBusinessAdminClient('+contextAt(node)+')'});
 ts.forEachChild(node,visit);
}
visit(ast);let actions=source;
for(const edit of [...edits].sort((a,b)=>b.start-a.start))actions=actions.slice(0,edit.start)+edit.text+actions.slice(edit.end);
actions=actions.replace('import { supabaseAdmin } from "@/lib/supabase/admin";','import { supabaseAdmin, createBusinessAdminClient } from "@/lib/supabase/admin";');
if(actions===source)throw new Error('No service SQL adapters built');
const admin=read(adminPath)+`
// Separate clients keep concurrent requests from mutating shared service headers.
// Business intent is checked independently by SQL ownership/authorization guards.
export function createBusinessAdminClient(businessId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(businessId)) {
    throw new Error("A valid business ID is required.");
  }
  return createClient(supabaseUrl!, serviceRoleKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "x-tenh-business-id": businessId } },
  });
}
`;
const categories=read(categoryPath).replace('const business = await requirePermission("categories.manage");\r\n  const supabase = await createClient();','const business = await requirePermission("categories.manage");\r\n  const supabase = await createClient({ "x-tenh-business-id": business.id });');
if(categories===read(categoryPath))throw new Error('Category authenticated context changed; review source before patching');
const candidates={[adminPath]:admin,[actionPath]:actions,[categoryPath]:categories};
const protectedTables=new Set(require('./build-barcode-tenant-proposal.cjs').evidence.ownership.map(x=>x.name));
const directWrites=[];
function simpleIntent(node){
 if(node&&(ts.isIdentifier(node)||ts.isPropertyAccessExpression(node)))return node.getText();
 if(node&&ts.isBinaryExpression(node)&&node.right.kind===ts.SyntaxKind.NullKeyword&&[ts.SyntaxKind.BarBarToken,ts.SyntaxKind.QuestionQuestionToken].includes(node.operatorToken.kind)&&simpleIntent(node.left))return node.getText();
 return null;
}
function localIntent(node,text){
 for(let p=node.parent;p;p=p.parent)if(ts.isFunctionLike(p)&&p.body){
  if(p.parameters.some(x=>x.name.getText().split(/[^\w]+/).includes('businessId')))return 'businessId';
  const before=text.slice(p.body.getStart(),node.getStart());
  if(/\b(?:const|let)\s+(?:business\b|\{[^}]*\bbusiness\b[^}]*\})/.test(before))return 'business.id';
 }
 return null;
}
function scanDirectWriters(dir){
 for(const item of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){
  const file=dir+'/'+item.name;if(item.isDirectory()){if(!['mobile','.next','node_modules'].includes(item.name))scanDirectWriters(file);continue;}
  if(!/\.tsx?$/.test(item.name)||[actionPath,adminPath,categoryPath].includes(file))continue;
  const text=read(file);if(!/supabase\/(?:server|admin)["']/.test(text))continue;
  const tree=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true),changes=[];
  function inspect(node){
   if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&['insert','update','upsert','delete'].includes(node.expression.name.text)){
    let cursor=node.expression.expression,from;
    while(ts.isCallExpression(cursor)&&ts.isPropertyAccessExpression(cursor.expression)){if(cursor.expression.name.text==='from'){from=cursor;break;}cursor=cursor.expression.expression;}
    const table=from&&from.arguments[0]&&ts.isStringLiteral(from.arguments[0])?from.arguments[0].text:null;
    if(table&&protectedTables.has(table)){
     let outer=node;
     while(ts.isPropertyAccessExpression(outer.parent)&&outer.parent.expression===outer&&ts.isCallExpression(outer.parent.parent))outer=outer.parent.parent;
     let intent=null;const payload=node.arguments[0];
     if(payload&&ts.isObjectLiteralExpression(payload)){
      const field=payload.properties.find(x=>ts.isPropertyAssignment(x)&&x.name.getText(tree).replaceAll('"','').replaceAll("'",'')==='business_id');
      if(field)intent=simpleIntent(field.initializer);
     }
     let chain=outer;
     while(!intent&&ts.isCallExpression(chain)&&ts.isPropertyAccessExpression(chain.expression)){
      if(chain.expression.name.text==='eq'&&chain.arguments[0]&&ts.isStringLiteral(chain.arguments[0])&&['business_id',...(table==='businesses'?['id']:[])].includes(chain.arguments[0].text))intent=simpleIntent(chain.arguments[1]);
      chain=chain.expression.expression;
     }
     if(!intent)intent=localIntent(node,text);
     const line=tree.getLineAndCharacterOfPosition(node.getStart()).line+1;
     if(table==='businesses'&&node.expression.name.text==='insert')directWrites.push({file,line,table,status:'guarded-genesis'});
     else if(file==='lib/auth/create-audit-log.ts'&&table==='audit_logs'&&!intent)directWrites.push({file,line,table,status:'global-own-user-audit-null-tenant-and-location'});
     else if(intent){changes.push({at:node.getEnd(),text:'.setHeader("x-tenh-business-id", ('+intent+') ?? "")'});directWrites.push({file,line,table,status:'request-header-proposed',intent});}
     else if(/from ["']@\/lib\/supabase\/branch-server["']/.test(text)&&from.expression.expression.getText(tree)!=='supabaseAdmin')directWrites.push({file,line,table,status:'existing-branch-header'});
     else directWrites.push({file,line,table,status:'explicit-context-required-no-guess'});
    }
   }
   ts.forEachChild(node,inspect);
  }
  inspect(tree);if(changes.length){let next=text;for(const change of changes.sort((a,b)=>b.at-a.at))next=next.slice(0,change.at)+change.text+next.slice(change.at);candidates[file]=next;}
 }
}
scanDirectWriters('app');scanDirectWriters('lib');
function buildPatch(){
 const tempBase=path.resolve(process.env.TEMP||os.tmpdir()),dir=fs.mkdtempSync(path.join(tempBase,'tenh-client-proposal-'));let patch='';
 try{
  for(const [file,next]of Object.entries(candidates)){
   const oldFile=path.join(dir,'old'),newFile=path.join(dir,'new');fs.writeFileSync(oldFile,read(file));fs.writeFileSync(newFile,next);
   const result=spawnSync('git',['diff','--no-index','--no-ext-diff','--',oldFile,newFile],{encoding:'utf8',windowsHide:true,shell:false});
   if(result.error)throw result.error;if(![0,1].includes(result.status))throw new Error('Cannot build local source diff');
   const lines=result.stdout.replaceAll('\r','').split('\n');const at=lines.findIndex(line=>line.startsWith('@@'));
   if(at>=0)patch+='diff --git a/'+file+' b/'+file+'\n--- a/'+file+'\n+++ b/'+file+'\n'+lines.slice(at).join('\n');
  }
  return patch;
 }finally{
  const resolved=path.resolve(dir),relative=path.relative(tempBase,resolved);
  if(!relative||relative.startsWith('..')||path.isAbsolute(relative)||!path.basename(resolved).startsWith('tenh-client-proposal-'))throw new Error('Unsafe proposal temp cleanup target');
  fs.rmSync(resolved,{recursive:true,force:true});
 }
}
if(require.main===module){
 fs.writeFileSync(path.join(root,'docs/proposed/20261012_barcode_tenant_clients_v3.PROPOSED.patch'),buildPatch());
 fs.writeFileSync(path.join(root,'docs/proposed/20261012_barcode_v3_direct_writer_manifest.json'),JSON.stringify({scope:'Known literal fluent mutations; dynamic builders/RPCs require separate inventory',writers:directWrites},null,2)+'\n');
 console.log(JSON.stringify({runtimeEdits:false,serviceSqlCalls:edits.length,files:Object.keys(candidates),directWrites:directWrites.length,unsupported:directWrites.filter(x=>x.status==='explicit-context-required-no-guess')}));
}
module.exports={candidates,serviceSqlCalls:edits.length,directWrites};
