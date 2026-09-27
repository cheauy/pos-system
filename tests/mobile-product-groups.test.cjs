const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');
const { groupProducts } = loadTs('mobile/src/product-groups.ts');
const { mobileProductPage } = loadTs('lib/mobile/product-page.ts');

test('variants share a card without combining unrelated products with identical names', () => {
  const rows = [{id:'s',name:'Tee',variant_group_id:'tee',size:'S'}, {id:'l',name:'Tee',variant_group_id:'tee',size:'L'}, {id:'other',name:'Tee'}];
  const groups = groupProducts(rows);
  assert.deepEqual(groups.map(group=>group.map(row=>row.id)), [['s','l'],['other']]);
  assert.equal(groups[0][1], rows[1], 'selected variant retains its exact inventory identity');
});

// Query double exercises grouping/paging; it does not replace live RLS tests.
function client(rows, calls) {
  return { from(table) {
    assert.equal(table, 'branch_products');
    let result = [...rows], range;
    const call = []; calls.push(call);
    const q = {
      select(){return q;},
      eq(key,value){call.push([key,value]);result=result.filter(row=>row[key]===value);return q;},
      neq(key,value){result=result.filter(row=>row[key]!==value);return q;},
      order(){return q;},
      or(value){
        const keyword = /name.ilike.%([^%]*)%/.exec(value)?.[1];
        if(keyword) result=result.filter(row=>[row.name,row.sku,row.barcode,row.size,row.color].some(value=>String(value||'').includes(keyword)));
        else {
          const groups=/variant_group_id.in.\(([^)]*)\)/.exec(value)?.[1].split(',')||[];
          const ids=/(?:^|,)id.in.\(([^)]*)\)/.exec(value)?.[1].split(',')||[];
          result=result.filter(row=>groups.includes(row.variant_group_id)||ids.includes(row.id));
        }
        return q;
      },
      range(from,to){range=[from,to];return q;},
      then(resolve,reject){return Promise.resolve({data:result.slice(range[0],range[1]+1),error:null}).then(resolve,reject);},
    };
    return q;
  }};
}

test('group pagination keeps all variants together and SKU search loads the whole matching family', async () => {
  const rows = Array.from({length:1050},(_,index)=>({id:`v${index}`,name:'Tee',sku:`SKU-${index}`,variant_group_id:'family',business_id:'business',is_active:true}));
  rows.push(...Array.from({length:26},(_,index)=>({id:`p${index}`,name:`Z${index}`,business_id:'business',is_active:true})));
  rows.push({id:'foreign',variant_group_id:'family',business_id:'another-business',is_active:true});
  const calls=[],db=client(rows,calls);
  const first=await mobileProductPage(db,'business','*',1,{term:'',active:true});
  const second=await mobileProductPage(db,'business','*',2,{term:'',active:true});
  assert.equal(first.total,27);
  assert.equal(groupProducts(first.rows).length,25);
  assert.equal(first.rows.filter(row=>row.variant_group_id==='family').length,1050);
  assert.equal(second.rows.length,2);
  const compact=await mobileProductPage(db,'business','*',1,{term:'',active:true,pageSize:10});
  const compactNext=await mobileProductPage(db,'business','*',2,{term:'',active:true,pageSize:10});
  assert.equal(groupProducts(compact.rows).length,10);
  assert.equal(groupProducts(compactNext.rows).length,10);
  for(const size of [4,8,9]){
    const grid=await mobileProductPage(db,'business','*',1,{term:'',active:true,pageSize:size});
    assert.equal(groupProducts(grid.rows).length,size);
  }
  assert.ok(!compactNext.rows.some(row=>compact.rows.some(other=>other.id===row.id)));
  assert.ok(!second.rows.some(row=>first.rows.some(other=>other.id===row.id)));
  const search=await mobileProductPage(db,'business','*',1,{term:'SKU-1049',active:true});
  assert.equal(search.total,1);
  assert.equal(search.rows.length,1050);
  assert.ok(calls.every(call=>call.some(([key,value])=>key==='business_id'&&value==='business')));
  assert.ok(!search.rows.some(row=>row.id==='foreign'));
});
