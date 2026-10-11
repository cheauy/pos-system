/* eslint-disable @typescript-eslint/no-require-imports -- Executes actual TS with explicit service doubles. */
const test=require('node:test'),assert=require('node:assert/strict');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const {loadTs}=require('./helpers/load-ts.cjs');
const {routeSkeletonKind}=loadTs('lib/navigation/loading-shape.ts');

test('store catalog shows skeleton only without usable data and keeps loaded tabs immediate',()=>{
  function Skeleton(){} function Manager(){}
  let values=[],index=0,pending=false,requests=0;
  const Panel=loadTs('app/(dashboard)/dashboard/online-store/catalog-panel.tsx',{
    react:{useState:()=>[values[index++],()=>{}],useEffect:()=>{},useTransition:()=>[pending,fn=>fn()]},
    'react/jsx-runtime':require('react/jsx-runtime'),
    'next/navigation':{useSearchParams:()=>new URLSearchParams('section=product')},
    '@/components/ui/content-skeleton':{default:Skeleton},
    './catalog-manager':{default:Manager},
    './catalog-actions':{loadOnlineCatalog:()=>{requests++;throw Error('unexpected read');}},
  }).default;
  function render(catalog,error='',loading=false){index=0;values=[catalog,error,true];pending=loading;return Panel({currency:'USD',canEdit:false});}
  assert.equal(render(null).type,Skeleton);
  assert.equal(render(null,'Load failed',true).type,Skeleton);
  assert.equal(render(null,'Load failed').props.role,'alert');
  const catalog={products:[],categories:[],featuredIds:[]};
  assert.equal(render(catalog,'',true).props.children.type,Manager);
  assert.equal(render(catalog).props.children.props.products,catalog.products);
  assert.equal(requests,0,'rendering or switching a loaded tab does not fetch');
});

test('route loading matches list, analysis, POS, detail, document and form destinations',()=>{
  const expected={
    '/dashboard':'analytics','/dashboard/reports':'analytics','/dashboard/staff-report':'analytics',
    '/dashboard/pos':'pos','/dashboard/pos/receipt/order-1':'document',
    '/dashboard/orders':'table','/dashboard/orders/order-1':'detail','/dashboard/orders/order-1/shipping-label':'document',
    '/dashboard/purchase-orders/new':'form','/dashboard/purchase-orders/order-1':'detail',
    '/dashboard/products':'table','/dashboard/products/product-1/edit':'form',
    '/dashboard/settings':'cards','/dashboard/settings/users':'table','/dashboard/settings/printers':'form',
    '/super-admin':'analytics','/super-admin/health':'analytics','/super-admin/manual-payments':'table',
    '/super-admin/businesses/business-1':'detail','/super-admin/businesses/business-1/edit-subscription':'form',
    '/auth/mfa':'form','/register':'form','/get-started':'form','/storefront/store-1':'catalog','/order/token-1':'detail',
  };
  for(const [path,kind] of Object.entries(expected))assert.equal(routeSkeletonKind(path),kind,path);
});

test('every skeleton shape exposes translated loading status and hides decorative blocks',()=>{
  const translations=loadTs('lib/i18n/translations.ts');
  const Skeleton=loadTs('components/ui/content-skeleton.tsx',{
    'react/jsx-runtime':require('react/jsx-runtime'),
    '@/components/providers/language-provider':{useLanguage:()=>({t:text=>translations.translateUiText(text,'km')})},
  }).default;
  for(const kind of ['table','form','analytics','pos','detail','cards','catalog','document']){
    const html=renderToStaticMarkup(React.createElement(Skeleton,{kind}));
    assert.match(html,/aria-busy="true"/);assert.match(html,/role="status"/);assert.match(html,/aria-hidden="true"/);
    assert.ok(html.includes(translations.translateUiText('Loading…','km')));
    assert.ok(!html.includes('Loading…'));assert.ok(!html.includes('fixed'));
  }
});

test('route fallback uses the current target and cannot initiate fetches or navigation',()=>{
  let path='/dashboard/pos';
  const Skeleton=()=>null;
  const Route=loadTs('components/ui/route-skeleton.tsx',{
    'react/jsx-runtime':require('react/jsx-runtime'),
    'next/navigation':{usePathname:()=>path},
    '@/lib/navigation/loading-shape':{routeSkeletonKind},
    './activity-link':{ActivitySignal:()=>null},'./content-skeleton':{default:Skeleton},
  }).default;
  for(const [target,kind] of [['/dashboard/pos','pos'],['/dashboard/suppliers','table'],['/dashboard/reports','analytics']]){
    path=target;
    assert.equal(React.Children.toArray(Route({fallbackPath:'/dashboard'}).props.children).find(node=>node.type===Skeleton).props.kind,kind);
  }
});

test('permission tabs show loading only for a missing member snapshot and clear it after failure or success',async()=>{
  let cursor=0,slots=[],effects=[],requests=[];
  const react={
    useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next;}];},
    useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,n)=>!Object.is(v,old.deps[n]))){slots[i]={deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}},
  };
  const Skeleton=()=>null;
  const Editor=loadTs('app/(dashboard)/dashboard/settings/users/role-permissions-editor.tsx',{
    react,'react/jsx-runtime':require('react/jsx-runtime'),
    'lucide-react':new Proxy({},{get:()=>()=>null}),
    '@/lib/auth/permissions':{editablePermissionRoles:['manager'],permissionGroups:[],permissionLabels:{},permissionDescriptions:{},rolePermissions:{manager:[]},normalizePermissionSelection:v=>v,removePermissionWithDependents:v=>v},
    '@/lib/users/team-model':{TEAM_ROLE_LABELS:{staff:'Staff',manager:'Manager'}},
    './users-workspace-actions':{},'./member-permission-actions':{loadMemberPermissions:()=>new Promise((resolve,reject)=>requests.push({resolve,reject}))},
    '@/components/providers/language-provider':{useLanguage:()=>({t:v=>v})},
    '@/components/ui/content-skeleton':{default:Skeleton},
  }).default;
  const props={businessId:'business-1',branchId:'branch-1',actorRole:'owner',matrix:{manager:[]},users:[{id:'member-1',role:'staff',name:'User'}],onChange(){},onMemberChange(){}};
  function render(){cursor=0;effects=[];const tree=Editor(props);effects.forEach(fn=>fn());return tree;}
  function find(node,predicate,found=[]){if(Array.isArray(node))node.forEach(n=>find(n,predicate,found));else if(node?.props){if(predicate(node))found.push(node);find(node.props.children,predicate,found);}return found;}
  assert.equal(find(render(),n=>n.type===Skeleton).length,1);render();assert.equal(requests.length,1);
  requests[0].reject(Error('Unable to read permissions'));await new Promise(setImmediate);
  let tree=render();assert.equal(find(tree,n=>n.type===Skeleton).length,0);assert.equal(find(tree,n=>n.props.role==='alert').length,1);
  find(tree,n=>n.type==='button'&&n.props.role==='tab'&&n.props['aria-selected']===false)[0].props.onClick();
  tree=render();assert.equal(requests.length,1,'loaded role defaults are immediate');assert.equal(find(tree,n=>n.type===Skeleton).length,0);
  find(tree,n=>n.type==='button'&&n.props.role==='tab'&&n.props['aria-selected']===false)[0].props.onClick();
  tree=render();assert.equal(find(tree,n=>n.type===Skeleton).length,1);
  requests[1].resolve({role:'staff',selected:[],baseline:[],revision:1});await new Promise(setImmediate);
  assert.equal(find(render(),n=>n.type===Skeleton).length,0);
});
