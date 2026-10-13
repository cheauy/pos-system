/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS test harness. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const {loadTs}=require('./helpers/load-ts.cjs');
const shared={react:React,'react/jsx-runtime':require('react/jsx-runtime'),'lucide-react':require('lucide-react')};
let language='en';
const DateHeading=loadTs('app/(dashboard)/dashboard/notifications/notification-date.tsx',{...shared,'@/components/providers/language-provider':{useLanguage:()=>({language})}}).default;
const notices=loadTs('app/(dashboard)/dashboard/notifications/notifications-list.tsx',{
 ...shared,'./notification-date':{default:DateHeading},'./notifications-responsive.module.css':{default:{}},'./notification-link':{default:({children,...props})=>React.createElement('a',props,children)},
});
test('notification date groups retain every event and input order, including repeated subjects',()=>{
 const row=(id,date)=>({id,occurred_at:date,title:'Same product',message:'Same subject',notification_type:'low_stock',severity:'warning',href:'#',is_active:false});
 const rows=[row('1','2026-10-11T00:00:00Z'),row('2','2026-10-11T01:00:00Z'),row('3','2026-10-10T00:00:00Z')];
 const groups=notices.groupNotifications(rows);assert.equal(groups.length,2);assert.deepEqual(groups.flatMap(([,items])=>items.map(n=>n.id)),['1','2','3']);
 assert.match(notices.groupNotifications(rows,'km-KH')[0][0],/តុលា/);
 const html=renderToStaticMarkup(React.createElement(notices.default,{items:rows,read:new Set(['2'])}));
 assert.equal((html.match(/aria-label="Unread"/g)||[]).length,2);assert.equal((html.match(/>Resolved</g)||[]).length,3);
 assert.ok(html.includes('dateTime="2026-10-10T00:00:00Z"'));assert.equal((html.match(/Same product/g)||[]).length,3);
});
test('notification empty and error states remain available',()=>{
 assert.match(renderToStaticMarkup(React.createElement(notices.default,{items:[],read:new Set()})),/No notifications yet/);
 assert.match(renderToStaticMarkup(React.createElement(notices.default,{items:[],read:new Set(),error:'Safe failure'})),/role="alert"/);
});
test('unsupported Khmer date locale falls back to readable numeric dates',()=>{
 const NativeDate=global.Date;
 global.Date=class extends NativeDate{toLocaleDateString(_locale,options){return options.month==='long'?'October 11, 2026':'10/11/2026';}};
 try{assert.equal(notices.groupNotifications([{id:'fixture',occurred_at:'2026-10-11T03:00:00Z'}],'km-KH')[0][0],'10/11/2026');}
 finally{global.Date=NativeDate;}
});
test('date headings switch language using server-formatted values without recalculating timezones',()=>{
 const props={date:'October 11, 2026',khmerDate:'១១ តុលា ២០២៦',className:'fixture-date'};
 assert.match(renderToStaticMarkup(React.createElement(DateHeading,props)),/October 11, 2026/);
 language='km';try{assert.match(renderToStaticMarkup(React.createElement(DateHeading,props)),/១១ តុលា ២០២៦/);}finally{language='en';}
});
test('Profile uses one identity/photo/name form, keeps both tab panels mounted and security links separate',()=>{
 const Form=loadTs('app/(dashboard)/dashboard/settings/profile/profile-form.tsx',{...shared,'./profile-responsive.module.css':{default:{}},'./actions':{updateProfile:async()=>({success:true,message:'Saved'})}}).default;
 const html=renderToStaticMarkup(React.createElement(Form,{showIdentity:true,defaultFullName:'Fixture Owner',email:'fixture@example.test',role:'owner',lastUpdated:'Last updated today',security:React.createElement('aside',{id:'profile-security'},React.createElement('a',{href:'/dashboard/settings/security'},'Change password'))}));
 assert.equal((html.match(/type="file"/g)||[]).length,1);assert.equal((html.match(/<form/g)||[]).length,1);assert.equal((html.match(/type="submit"/g)||[]).length,1);
 assert.ok(html.includes('role="tablist"'));assert.ok(html.includes('aria-controls="profile-personal"'));assert.ok(html.includes('aria-controls="profile-security"'));
 assert.ok(html.includes('name="full_name"'));assert.ok(html.includes('minLength="2"'));assert.ok(html.includes('maxLength="100"'));assert.ok(html.includes('Change password'));
});
