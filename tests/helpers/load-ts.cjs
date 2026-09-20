// Execute real TS module code while explicitly replacing external services.
// This is not a database, React, or Next.js integration harness.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function loadTs(relativePath, dependencies = {}) {
  const filename = path.resolve(__dirname, '../..', relativePath);
  const {outputText, diagnostics} = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename, reportDiagnostics: true,
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, jsx: ts.JsxEmit.ReactJSX},
  });
  if (diagnostics?.some(d => d.category === ts.DiagnosticCategory.Error)) throw new Error(`TS syntax: ${relativePath}`);
  const module = {exports: {}};
  new Function('require', 'module', 'exports', outputText)(id => {
    if (!Object.prototype.hasOwnProperty.call(dependencies, id)) throw new Error(`Unmocked import ${id} in ${relativePath}`);
    return dependencies[id];
  }, module, module.exports);
  return module.exports;
}
// A recorded fluent query double, not a substitute for RLS/PostgreSQL execution.
function queryDouble(table, result, log) {
  const call = {table, steps: []};
  log.push(call);
  const query = {};
  for (const name of ['select','eq','in','order','range','or','limit','single','maybeSingle','update']) {
    query[name] = (...args) => {call.steps.push([name, ...args]); return query;};
  }
  query.then = (ok, fail) => Promise.resolve(typeof result === 'function' ? result(call) : result).then(ok, fail);
  return query;
}
module.exports = {loadTs, queryDouble};
