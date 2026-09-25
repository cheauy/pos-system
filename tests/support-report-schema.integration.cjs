const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require('./helpers/pglite.cjs');
(async()=>{const db=new PGlite();try{
 await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create table businesses(id uuid primary key);create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);");
 await db.exec(fs.readFileSync('supabase/migrations/20260924021000_super_admin_support.sql','utf8'));
 await db.exec("insert into platform_support_reports(title,description) values('Old report','Existing support report');");
 const migration=fs.readFileSync('supabase/migrations/20260924024000_support_report_images.sql','utf8');await db.exec(migration);await db.exec(migration);
 assert.equal((await db.query('select count(*)::int n from platform_support_reports')).rows[0].n,1);
 await db.exec("insert into platform_support_reports(title,description,reason,image_path) values('New report','','Billing or Payment','private.webp');");
 await assert.rejects(db.exec("insert into platform_support_reports(title,description,reason) values('Invalid report','','Bad reason');"),/reason_check/);
 assert.equal((await db.query("select public from storage.buckets where id='support-report-images'")).rows[0].public,false);
 assert.equal((await db.query("select has_table_privilege('authenticated','platform_support_reports','SELECT') allowed")).rows[0].allowed,false);
 console.log('PASS support migration is repeatable, preserves old reports, validates reasons and keeps images private');
}finally{await db.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
