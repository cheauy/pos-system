// PGlite is test-only. No database URL or credentials are read by this loader.
const path=require('node:path');
const os=require('node:os');
function load(){
  const candidates=[process.env.TENH_PGLITE_PATH,'@electric-sql/pglite',path.join(os.tmpdir(),'tenh-branch-sql-check/node_modules/@electric-sql/pglite')].filter(Boolean);
  for(const name of candidates){
    let target;
    try{target=require.resolve(name);}catch(error){if(error.code==='MODULE_NOT_FOUND')continue;throw error;}
    return require(target);
  }
  throw new Error('PGlite test dependency not installed. Install @electric-sql/pglite in a separate test-tools directory and set TENH_PGLITE_PATH to its package folder, or install it locally without saving. See docs/codex-continuation.md. No SQL test has run.');
}
module.exports=load();
