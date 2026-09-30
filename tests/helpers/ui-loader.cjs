// Execute actual local components in tests, replacing only explicitly named services.
const path = require('node:path');
const fs = require('node:fs');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
function uiLoader(services = {}) {
  const cache = new Map();
  function load(file) {
    const full = path.isAbsolute(file) ? file : path.join(root, file);
    if (cache.has(full)) return cache.get(full).exports;
    const mod = { exports: {} }; cache.set(full, mod);
    const code = ts.transpileModule(fs.readFileSync(full, 'utf8'), {
      fileName: full, compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    new Function('require', 'module', 'exports', code)(id => {
      if (Object.hasOwn(services, id)) return services[id];
      if (id.startsWith('.') || id.startsWith('@/')) {
        const base = id.startsWith('@/') ? path.join(root, id.slice(2)) : path.resolve(path.dirname(full), id);
        const target = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')].find(p => fs.existsSync(p) && fs.statSync(p).isFile());
        if (!target) throw Error(`Missing local import ${id} in ${file}`);
        return load(target);
      }
      return require(id);
    }, mod, mod.exports);
    return mod.exports;
  }
  return load;
}
module.exports = { uiLoader };
