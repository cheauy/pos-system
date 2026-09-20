// Read-only syntax/internal-import audit. Does NOT replace `tsc --noEmit` or Next build.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const root=process.cwd(), files=[];
function walk(dir){
  for(const item of fs.readdirSync(dir,{withFileTypes:true})){
    if(['node_modules','.git','.next','dist','coverage'].includes(item.name))continue;
    const f=path.join(dir,item.name);
    if(item.isDirectory())walk(f);
    else if(/\.tsx?$/.test(f)&&!f.endsWith('.d.ts'))files.push(f);
  }
}
for(const dir of ['app','components','lib'])if(fs.existsSync(path.join(root,dir)))walk(path.join(root,dir));
for(const f of ['proxy.ts','middleware.ts'])if(fs.existsSync(path.join(root,f)))files.push(path.join(root,f));
const errors=[];
const program=ts.createProgram(files,{target:ts.ScriptTarget.ES2017,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,jsx:ts.JsxEmit.ReactJSX,baseUrl:root,paths:{'@/*':['./*']},skipLibCheck:true,noEmit:true});
const checker=program.getTypeChecker();
const modifier=(n,kind)=>n.modifiers?.some(m=>m.kind===kind);
function locate(importer,id){
  const base=id.startsWith('@/')?path.join(root,id.slice(2)):path.resolve(path.dirname(importer),id);
  return [base,...['.ts','.tsx','.js','.jsx','.json','.css'].map(e=>base+e),...['index.ts','index.tsx','index.js'].map(n=>path.join(base,n))].find(f=>fs.existsSync(f)&&fs.statSync(f).isFile());
}
let imports=0;
for(const f of files){
  const text=fs.readFileSync(f,'utf8'),sf=program.getSourceFile(f);
  const result=ts.transpileModule(text,{fileName:f,compilerOptions:{target:ts.ScriptTarget.ES2017,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX},reportDiagnostics:true});
  for(const d of result.diagnostics||[])if(d.category===ts.DiagnosticCategory.Error)errors.push(`${path.relative(root,f)}: ${ts.flattenDiagnosticMessageText(d.messageText,' ')}`);
  const serverOnly=sf.statements.some(n=>ts.isExpressionStatement(n)&&ts.isStringLiteral(n.expression)&&n.expression.text==='use server');
  for(const n of sf.statements){
    if(serverOnly&&modifier(n,ts.SyntaxKind.ExportKeyword)){
      if(ts.isFunctionDeclaration(n)&&!modifier(n,ts.SyntaxKind.AsyncKeyword))errors.push(`${path.relative(root,f)}: Server Action ${n.name?.text||'default'} is not async.`);
      if(ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>!d.initializer||!(ts.isArrowFunction(d.initializer)||ts.isFunctionExpression(d.initializer))||!modifier(d.initializer,ts.SyntaxKind.AsyncKeyword)))errors.push(`${path.relative(root,f)}: non-async runtime export in use-server file.`);
    }
    if(!(ts.isImportDeclaration(n)||ts.isExportDeclaration(n))||!n.moduleSpecifier||!ts.isStringLiteral(n.moduleSpecifier))continue;
    const id=n.moduleSpecifier.text;
    if(!id.startsWith('.')&&!id.startsWith('@/'))continue;
    imports++;
    const dest=locate(f,id);
    if(!dest){errors.push(`${path.relative(root,f)}: missing internal module ${id}`);continue;}
    if(!/\.tsx?$/.test(dest))continue;
    const moduleFile=program.getSourceFile(dest),symbol=moduleFile&&checker.getSymbolAtLocation(moduleFile);
    if(!symbol)continue;
    const exported=new Set(checker.getExportsOfModule(symbol).map(s=>s.name));
    if(ts.isImportDeclaration(n)&&n.importClause){
      const clause=n.importClause;
      if(clause.name&&!exported.has('default'))errors.push(`${path.relative(root,f)}: default export missing from ${id}`);
      if(clause.namedBindings&&ts.isNamedImports(clause.namedBindings))for(const s of clause.namedBindings.elements){
        const name=(s.propertyName||s.name).text;
        if(!exported.has(name))errors.push(`${path.relative(root,f)}: ${name} missing from ${id}`);
      }
    }
  }
}
console.log(JSON.stringify({scope:'Syntax, internal module/export names, async Server Action declarations only; not a full type or build check',sourceFiles:files.length,internalImports:imports,errors},null,2));
if(errors.length)process.exitCode=1;
