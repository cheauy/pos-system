const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('./helpers/load-ts.cjs');
const {compareSizes,compareVariants}=loadTs('mobile/src/variant-selection.ts');
test('variant sizes use clothing and numeric order',()=>{
 assert.deepEqual(['XL','M','XS','S','L','XXL'].sort(compareSizes),['XS','S','M','L','XL','XXL']);
 assert.deepEqual(['40','9','38','10','39'].sort(compareSizes),['9','10','38','39','40']);
 assert.equal(compareSizes('2XL','XXL'),0);
});
test('details sort size, color and available stock without changing the input',()=>{
 const rows=[{size:'L',color:'Blue',available:1},{size:'S',color:'Red',available:3},{size:'S',color:'Blue',available:0},{size:'S',color:'Blue',available:4}];
 assert.deepEqual([...rows].sort(compareVariants),[rows[3],rows[2],rows[1],rows[0]]);
 assert.equal(rows[0].size,'L');
});
