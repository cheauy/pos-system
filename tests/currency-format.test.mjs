import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const compiled=ts.transpileModule(readFileSync('lib/currency-format.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const mod={exports:{}};new Function('module','exports',compiled)(mod,mod.exports);
const {currencyFormat,validCurrencyFormat,formatStoreMoney}=mod.exports;
test('USD defaults and saved currency formats apply to real amounts',()=>{
 const defaults=currencyFormat();assert.equal(formatStoreMoney(1234.56,defaults),'$1,234.56');
 assert.equal(currencyFormat({},'KHR').symbol,'៛');
 assert.equal(formatStoreMoney(1234.56,{...defaults,symbol:'៛',position:'after',format:'de-DE'}),'1.234,56 ៛');
 assert.equal(formatStoreMoney(10.555,defaults),'$10.56');
 assert.equal(formatStoreMoney(10.551,{...defaults,rounding:'up'}),'$10.56');
 assert.equal(formatStoreMoney(10.559,{...defaults,rounding:'down'}),'$10.55');
 assert.equal(formatStoreMoney(1234.56,{...defaults,decimals:0}),'$1,235');
 assert.equal(formatStoreMoney(-10.555,defaults),'$-10.56');
});
test('format validation rejects invalid values',()=>{
 const defaults=currencyFormat();assert.ok(validCurrencyFormat(defaults));
 for(const invalid of [{symbol:''},{symbol:'<script>'},{position:'middle'},{decimals:9},{rounding:'unknown'},{format:'unknown'}])assert.equal(validCurrencyFormat({...defaults,...invalid}),false);
});
