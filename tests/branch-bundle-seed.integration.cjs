// Disposable PostgreSQL only: no live database or credentials.
const { PGlite } = require('./helpers/pglite.cjs');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const migration = fs.readFileSync('supabase/migrations/20260930004000_restore_branch_bundle_recipe_seed.sql','utf8');
(async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table products(id int primary key,business_id int,product_type text,image_urls text[] default '{}');
      create table branch_product_details(id int,business_id int,product_type text,location_id int,branch_archived boolean,image_urls text[],primary key(location_id,id));
      create table product_location_stock(business_id int,product_id int,location_id int,quantity int default 0,primary key(location_id,product_id));
      create table bundle_items(id int primary key,business_id int,bundle_product_id int,component_product_id int,quantity int,selected_options jsonb);
      create table branch_bundle_recipes(like bundle_items,location_id int,primary key(location_id,id));
      insert into products values(1,10,'bundle',array['cover.jpg','detail.jpg']),(2,10,'bundle','{}'),(3,10,'bundle','{}');
      insert into bundle_items values(101,10,1,20,2,'[{"name":"Large"}]'),(102,10,1,21,1,'[]'),(103,10,2,20,3,'[]'),(104,10,3,21,1,'[]');
      insert into product_location_stock values(10,1,100,7),(10,1,200,5),(10,3,100,0);
      insert into branch_product_details values(1,10,'bundle',100,false,'{}'),(1,10,'bundle',200,false,'{}'),(3,10,'bundle',100,true,'{}');
      insert into branch_bundle_recipes values(101,10,1,20,9,'[]',200);
    `);
    await db.exec(migration);
    const recipe = async (product,branch) => (await db.query('select component_product_id,quantity,selected_options from branch_bundle_recipes where bundle_product_id=$1 and location_id=$2 order by id',[product,branch])).rows;
    assert.deepEqual(await recipe(1,100),[
      {component_product_id:20,quantity:2,selected_options:[{name:'Large'}]},
      {component_product_id:21,quantity:1,selected_options:[]},
    ],'backfill restores the full original recipe');
    assert.deepEqual(await recipe(1,200),[{component_product_id:20,quantity:9,selected_options:[]}],'edited branch is not overwritten or appended to');
    assert.deepEqual(await recipe(3,100),[],'archived bundles stay untouched');
    await db.exec('create trigger seed after insert on product_location_stock for each row execute function tenh_seed_branch_product(); insert into product_location_stock values(10,2,100,0),(10,1,300,0);');
    assert.equal((await recipe(2,100))[0].quantity,3,'another new bundle gets its items immediately');
    assert.deepEqual(await recipe(1,300),await recipe(1,100),'new branch receives all quantities and options');
    assert.deepEqual((await db.query('select image_urls,branch_archived from branch_product_details where id=1 and location_id=300')).rows[0],{image_urls:['cover.jpg','detail.jpg'],branch_archived:false},'gallery-safe seeding preserved');
    await db.exec(migration);
    assert.equal((await recipe(1,100)).length,2,'rerun does not duplicate items');
    assert.equal((await recipe(1,200))[0].quantity,9);
    assert.equal((await db.query('select quantity from product_location_stock where product_id=1 and location_id=100')).rows[0].quantity,7,'stock remains unchanged');
    console.log('PASS: bundle creation seeding, missing recipe recovery, edited/archived branch preservation, gallery mapping and rerun safety');
  } finally { await db.close(); }
})().catch(error => { console.error(error);process.exitCode=1; });
