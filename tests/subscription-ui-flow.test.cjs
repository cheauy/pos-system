const test=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('./helpers/load-ts.cjs');
const plans=loadTs('lib/subscriptions/plans.ts');
const promotions=loadTs('lib/subscriptions/promotions.ts',{'./plans':plans});
function hooks(){
  const state=[];let cursor=0;
  return {reset(){cursor=0;},react:{useState(initial){const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return [state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v;}];},useMemo:f=>f(),useRef:()=>({current:null}),useEffect:()=>{}}};
}
function nodes(root){if(!root||typeof root!=='object')return [];if(Array.isArray(root))return root.flatMap(nodes);return [root,...nodes(root.props?.children)];}
const base={'react/jsx-runtime':require('react/jsx-runtime'),'lucide-react':require('lucide-react'),'next/image':{default:()=>null}};
test('Custom Upgrade defaults to current expiry, then allows a duration-only checkout',()=>{
  const h=hooks();const applied=[];
  const Component=loadTs('app/(dashboard)/dashboard/settings/subscription/custom-plan-dialog.tsx',{...base,react:h.react,'@/lib/subscriptions/plans':plans,'@/lib/subscriptions/promotions':promotions}).default;
  const props={mode:'upgrade',users:5,branches:1,minimumUsers:5,minimumBranches:1,months:12,pricePreviewAt:0,currentMonthlyPrice:18,onApply:(...args)=>applied.push(args),onClose(){}};
  const render=()=>{h.reset();return nodes(Component(props));};
  let tree=render();assert.equal(tree.find(n=>n.type==='select').props.value,0);
  const button=items=>items.find(n=>n.type==='button'&&n.props.children==='Continue to payment');
  assert.equal(button(tree).props.disabled,true);
  tree.find(n=>n.type==='select').props.onChange({target:{value:'3'}});
  tree=render();assert.equal(button(tree).props.disabled,false);button(tree).props.onClick();
  assert.deepEqual(applied,[[5,1,3]]);
});
test('Custom Upgrade can keep expiry while increasing capacity',()=>{
  const h=hooks();let applied;
  const Component=loadTs('app/(dashboard)/dashboard/settings/subscription/custom-plan-dialog.tsx',{...base,react:h.react,'@/lib/subscriptions/plans':plans,'@/lib/subscriptions/promotions':promotions}).default;
  const tree=nodes(Component({mode:'upgrade',users:6,branches:2,minimumUsers:5,minimumBranches:1,months:12,pricePreviewAt:0,onApply:(...args)=>{applied=args;},onClose(){}}));
  const button=tree.find(n=>n.type==='button'&&n.props.children==='Continue to payment');
  assert.equal(button.props.disabled,false);button.props.onClick();assert.deepEqual(applied,[6,2,0]);
});
test('payment cards switch locally without starting either payment route',()=>{
  const h=hooks();let serverCalls=0;
  const Component=loadTs('app/(dashboard)/dashboard/settings/subscription/payment/[orderId]/payment-method-selector.tsx',{...base,react:h.react,'react-dom':{useFormStatus:()=>({pending:false})},'../../actions':{selectSubscriptionPaymentMethod:()=>{serverCalls++;}},'./payway-checkout-button':{default:()=>null}}).default;
  const render=()=>{h.reset();return nodes(Component({orderId:'order',manualAvailable:true,initialMethod:null}));};
  for(const index of [0,1,0,1]){let tree=render();const cards=tree.filter(n=>n.type==='button'&&n.props['aria-pressed']!==undefined);cards[index].props.onClick();tree=render();assert.equal(tree.filter(n=>n.type==='button'&&n.props['aria-pressed']!==undefined)[index].props['aria-pressed'],true);}
  assert.equal(serverCalls,0);
});
