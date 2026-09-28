const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');

test('shared mobile data and dependent screens do not import the screen entry point',()=>{
 const entry=path.resolve('mobile/src/screens.tsx');
 const seen=new Set();
 function visit(file,chain=[]){
  assert.notEqual(file,entry,`Circular screen import: ${[...chain,file].map(p=>path.basename(p)).join(' -> ')}`);
  if(seen.has(file))return;
  seen.add(file);
  const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
  for(const node of source.statements){
   if(!ts.isImportDeclaration(node)&&!ts.isExportDeclaration(node))continue;
   if(node.isTypeOnly||node.importClause?.isTypeOnly||!node.moduleSpecifier)continue;
   const bindings=node.importClause?.namedBindings;
   if(!node.importClause?.name&&bindings&&ts.isNamedImports(bindings)&&bindings.elements.every(item=>item.isTypeOnly))continue;
   const name=node.moduleSpecifier.text;
   if(!name.startsWith('.'))continue;
   const base=path.resolve(path.dirname(file),name);
   const target=['.ts','.tsx','/index.ts','/index.tsx'].map(ext=>base+ext).find(p=>fs.existsSync(p));
   if(target)visit(target,[...chain,file]);
  }
 }
 for(const name of ['data','expense-analytics','register-detail','management','account-menu','pos'])visit(path.resolve(`mobile/src/${name}.${name==='data'?'ts':'tsx'}`));
});
