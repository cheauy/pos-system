import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { api, ApiError, deviceStorage, money, type Scope, type Workspace } from './client';
import { Button, Card, Field, Label, styles, useTheme } from './ui';
import { clearCache, useData } from './screens';

type Product = { id:string; name:string; sku:string; barcode:string|null; description:string|null; category_id:string|null; image_url:string|null; cost_price:number; selling_price:number; low_stock_quantity:number; stock_quantity:number; product_type:string; size:string|null; color:string|null; is_active:boolean; is_pos:boolean; is_online:boolean; updated_at:string|null; items?:{component_product_id:string;name?:string;quantity:number;selected_options?:{id?:string;optionId?:string}[]}[] };
type Variant={sku:string;barcode:string;price:string;cost:string;lowStock:string;size:string;color:string};
type Line={productId:string;name:string;quantity:string;cost:string;optionIds:string[]};
type Group={name:string;required:boolean;options:{name:string;price:string}[]};
type ImageAsset={uri:string;name:string;type:string};
type Pending={requestId:string;operation:string;input:Record<string,unknown>;image:ImageAsset|null};
const blankRow=():Variant=>({sku:'',barcode:'',price:'0',cost:'0',lowStock:'5',size:'',color:''});
export function Toggle({label,value,change,disabled=false}:{label:string;value:boolean;change:(value:boolean)=>void;disabled?:boolean}) {
  return <View style={[styles.row,{justifyContent:'space-between'}]}><View style={{flex:1}}><Label>{label}</Label></View><Switch accessibilityLabel={label} value={value} onValueChange={change} disabled={disabled}/></View>;
}

export function Management({workspace,online,feature}:{workspace:Workspace;online:boolean;feature:'Products'|'Bundles'|'Online Store'}) {
 const theme=useTheme();const scope={userId:workspace.userId,businessId:workspace.business.id,branchId:workspace.branchId};
 const [search,setSearch]=useState(''),[query,setQuery]=useState(''),[page,setPage]=useState(1),[selected,setSelected]=useState<Product|null>(null),[form,setForm]=useState<string|null>(null);
 useEffect(()=>{const timer=setTimeout(()=>{setQuery(search);setPage(1);},300);return()=>clearTimeout(timer);},[search]);
 const {data,loading,error,refresh}=useData<{rows:Product[];total:number;currency:string}>(`catalog?bundles=${feature==='Bundles'}&page=${page}&search=${encodeURIComponent(query)}`,scope,online&&feature!=='Online Store');
 if(feature==='Online Store')return <ManagementForm operation="storefront-save" scope={scope} online={online} workspace={workspace} close={()=>{}} saved={()=>clearCache()} embedded/>;
 return <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
  <Label large>{feature}</Label><Field label="Search name, SKU or barcode" value={search} onChangeText={setSearch}/>
  {workspace.permissions.includes('products.create')&&<Button title={feature==='Bundles'?'New bundle':'Add product'} disabled={!online} onPress={()=>{setSelected(null);setForm(feature==='Bundles'?'bundle-create':'product-create');}}/>}
  {loading&&<ActivityIndicator/>}{error&&<Card><Label>{error}</Label><Button title="Retry" onPress={refresh} disabled={!online}/></Card>}
  {data?.rows.map(product=><Pressable key={product.id} accessibilityRole="button" onPress={()=>setSelected(product)}><Card><View style={styles.row}>{product.image_url&&<Image source={{uri:product.image_url}} style={{width:60,height:60,borderRadius:10}}/>}<View style={{flex:1}}><Label>{product.name}</Label><Label muted>{[product.sku,product.size,product.color].filter(Boolean).join(' · ')}</Label><Label>{`${money(product.selling_price,data?.currency)} · ${product.stock_quantity} ${theme.t('in stock')}`}</Label></View></View><Label muted>{product.is_active?'Active':'Inactive'}</Label></Card></Pressable>)}
  {data?.rows.length===0&&<Card><Label>No records yet</Label></Card>}
  <View style={styles.row}><Button title="Previous" secondary disabled={page===1} onPress={()=>setPage(p=>p-1)}/><Label>{String(page)}</Label><Button title="Next" secondary disabled={!data||page*25>=data.total} onPress={()=>setPage(p=>p+1)}/></View>
  {selected&&!form&&<Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={()=>setSelected(null)}><SafeAreaView style={{flex:1,backgroundColor:theme.background}}><ScrollView contentContainerStyle={styles.page}>
    <Label large>{selected.name}</Label>{selected.image_url&&<Image source={{uri:selected.image_url}} style={{height:240}} resizeMode="contain"/>}
    <Card><Label>{selected.sku}</Label><Label>{`${money(selected.selling_price,data?.currency)} · ${selected.stock_quantity} ${theme.t('in stock')}`}</Label><Label>{selected.description||'No description'}</Label><Label>{[selected.size,selected.color].filter(Boolean).join(' · ')}</Label></Card>
    {workspace.permissions.includes('products.update')&&<Button title="Edit" disabled={!online} onPress={()=>setForm(selected.product_type==='bundle'?'bundle-edit':'product-edit')}/>}
    {selected.product_type==='bundle'&&<>
      {workspace.permissions.includes('products.stock_adjust')&&<Button title="Pack / unpack" secondary disabled={!online} onPress={()=>setForm('bundle-pack')}/>}
      {workspace.permissions.includes('products.update')&&<Button title="Display settings" secondary disabled={!online} onPress={()=>setForm('bundle-toggle')}/>}
      {workspace.permissions.includes('products.disable')&&<Button title="Delete bundle" secondary disabled={!online} onPress={()=>setForm('bundle-delete')}/>}
    </>}<Button title="Close" secondary onPress={()=>setSelected(null)}/>
  </ScrollView></SafeAreaView></Modal>}
  {form&&<ManagementForm operation={form} id={selected?.id} scope={scope} online={online} workspace={workspace} close={()=>setForm(null)} saved={()=>{setForm(null);setSelected(null);clearCache();refresh();}}/>}
 </ScrollView>;
}

export function ManagementForm({operation,id,scope,online,workspace,close,saved,embedded=false}:{operation:string;id?:string;scope:Scope;online:boolean;workspace?:Workspace;close:()=>void;saved:()=>void;embedded?:boolean}) {
 const theme=useTheme();const key=`tenh-manage-${scope.userId}-${scope.businessId}-${scope.branchId}-${operation}-${id||'new'}`;
 const [values,setValues]=useState<Record<string,string>>({name:'',sku:'',price:'0',cost:'0',lowStock:'5',description:'',categoryId:'',type:'standard',note:'',phone:'',address:'',quantity:'1',action:'pos'});
 const [productMode,setProductMode]=useState('');
 const [flags,setFlags]=useState({showPos:true,showOnline:true,active:true,published:false,acceptOrders:false,removeImage:false,enabled:true});
 const [variants,setVariants]=useState<Variant[]>([blankRow()]),[lines,setLines]=useState<Line[]>([]),[groups,setGroups]=useState<Group[]>([]);
 const [categories,setCategories]=useState<{id:string;name:string}[]>([]),[suppliers,setSuppliers]=useState<{id:string;name:string}[]>([]),[chooseCategory,setChooseCategory]=useState(false);
 const [image,setImage]=useState<ImageAsset|null>(null),[imageUrl,setImageUrl]=useState<string|null>(null),[pending,setPending]=useState<Pending|null>(null);
 const [busy,setBusy]=useState(false),[ready,setReady]=useState(false),[error,setError]=useState(''),[picker,setPicker]=useState(false),[reload,setReload]=useState(0);
 const working=useRef(false);const isProduct=operation.startsWith('product-'),isBundle=operation==='bundle-create'||operation==='bundle-edit',isDraft=operation==='purchase-create'||operation==='transfer-save';
 const canSave=operation!=='storefront-save'||!workspace||workspace.permissions.includes('storefront.update');
 const locked=busy||!!pending||!canSave;
 const set=(name:string,value:string)=>setValues(v=>({...v,[name]:value}));
 function restore(request:Pending){
  setValues(v=>({...v,quantity:String(request.input.quantity??1),...Object.fromEntries(Object.entries(request.input).filter((entry):entry is [string,string]=>typeof entry[1]==='string'))}));
  setFlags(v=>({...v,...Object.fromEntries(Object.entries(request.input).filter(([,value])=>typeof value==='boolean'))}));
  if(Array.isArray(request.input.variants))setVariants(request.input.variants as Variant[]);
  if(Array.isArray(request.input.groups))setGroups(request.input.groups as Group[]);
  if(Array.isArray(request.input.items))setLines((request.input.items as {productId:string;quantity:number;cost:number;optionIds:string[]}[]).map(i=>({...i,name:i.productId,quantity:String(i.quantity),cost:String(i.cost||0)})));
  setImage(request.image);
 }
 useEffect(()=>{let active=true;
  void (async()=>{
   const stored=await deviceStorage.getItem(key);if(!active)return;setReady(false);if(stored)setPending(JSON.parse(stored));
   if(!online){if(stored)restore(JSON.parse(stored));setReady(!!stored);return;}
   if(isProduct||isBundle){const options=await api<{categories:{id:string;name:string}[];mode:string}>('catalog-options',scope);if(!active)return;setCategories(options.categories);setProductMode(options.mode);setValues(v=>({...v,type:options.mode||'standard'}));}
   if(operation==='purchase-create'){const options=await api<{suppliers:{id:string;name:string}[]}>('draft-options',scope);if(active)setSuppliers(options.suppliers);}
   if(id&&(isProduct||isBundle||operation.startsWith('bundle-'))){const p=await api<Product>(`catalog-detail?id=${id}`,scope);if(!active)return;setValues(v=>({...v,name:p.name,sku:p.sku||'',barcode:p.barcode||'',price:String(p.selling_price),cost:String(p.cost_price),lowStock:String(p.low_stock_quantity),description:p.description||'',categoryId:p.category_id||'',size:p.size||'',color:p.color||'',expected:p.updated_at||''}));setFlags(v=>({...v,showPos:p.is_pos!==false,showOnline:p.is_online,active:p.is_active,enabled:p.is_pos!==false}));setImageUrl(p.image_url);setLines((p.items||[]).map(i=>({productId:i.component_product_id,name:i.name||i.component_product_id,quantity:String(i.quantity),cost:'0',optionIds:(i.selected_options||[]).map(o=>o.id||o.optionId||'').filter(Boolean)})));}
   if(operation==='storefront-save'){const store=await api<{display_name:string;description:string;phone:string;address:string;is_published:boolean;accept_online_orders:boolean;updated_at:string}>('storefront',scope);if(!active)return;if(!store)throw new Error('Set up your Online Store on the website first.');setValues(v=>({...v,name:store.display_name||'',description:store.description||'',phone:store.phone||'',address:store.address||'',expected:store.updated_at||''}));setFlags(v=>({...v,published:store.is_published,acceptOrders:store.accept_online_orders}));}
   if(operation==='transfer-save'&&id){const transfer=await api<{updated_at:string;destination_location_id:string;note:string;items:{product_id:string;quantity:number}[]}>(`transfer-detail?id=${id}`,scope);if(!active)return;setValues(v=>({...v,expected:transfer.updated_at||'',destinationId:transfer.destination_location_id,note:transfer.note||''}));setLines(transfer.items.map(i=>({productId:i.product_id,name:i.product_id,quantity:String(i.quantity),cost:'0',optionIds:[]})));}
   if(active&&stored)restore(JSON.parse(stored));
   if(active)setReady(true);
  })().catch(e=>{if(active)setError(e.message);});return()=>{active=false;};
 // Scope changes remount the workspace; the durable key identifies the whole form.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[key,online,reload]);
 async function pickImage(){try{const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],quality:0.9,allowsMultipleSelection:false});if(!result.canceled){const a=result.assets[0];if((a.fileSize||0)>5*1024*1024)throw new Error('Choose an image smaller than 5 MB.');setImage({uri:a.uri,name:a.fileName||'product.jpg',type:a.mimeType||'image/jpeg'});setFlags(v=>({...v,removeImage:false}));}}catch(e){setError((e as Error).message);}}
 async function finish(result:{success:boolean;rolledBack?:boolean;message?:string}){
  if(result.success){await deviceStorage.removeItem(key);setPending(null);clearCache();saved();if(embedded){setReload(v=>v+1);theme.alert(theme.t('Saved'));}return;}
  if(result.rolledBack){await deviceStorage.removeItem(key);setPending(null);throw new Error(result.message||'Save failed. Review the form.');}
  throw new Error(result.message||'Save not confirmed. Keep this request and check again.');
 }
 async function submit(){if(working.current||!online||!ready)return;working.current=true;setBusy(true);setError('');try{
  let request=pending;
  if(request){const status=await api<{data:{success:boolean;rolledBack?:boolean;message?:string}|null}>(`management-status?id=${request.requestId}`,scope);if(status.data){await finish(status.data);return;}}
  if(!request){
   const input:Record<string,unknown>={...values,...flags,id,expected:values.expected||null,quantity:Number(values.quantity),variants,groups,items:lines.map(l=>({productId:l.productId,quantity:Number(l.quantity),cost:Number(l.cost),optionIds:l.optionIds}))};
   request={requestId:Crypto.randomUUID(),operation,input,image};await deviceStorage.setItem(key,JSON.stringify(request));setPending(request);
  }
  const form=new FormData();form.append('requestId',request.requestId);form.append('input',JSON.stringify(request.input));if(request.image)form.append('image',request.image as unknown as Blob);
  const result=await api<{success:boolean;rolledBack?:boolean;message?:string}>(operation,scope,form);await finish(result);
 }catch(e){if(e instanceof ApiError&&e.uncertain===false){await deviceStorage.removeItem(key);setPending(null);}setError((e as Error).message);}finally{working.current=false;setBusy(false);}}
 const field=(name:string,label:string,numeric=false)=><Field key={name} label={label} value={values[name]||''} editable={!locked} onChangeText={value=>set(name,value)} keyboardType={numeric?'decimal-pad':'default'} maxLength={name==='description'?500:160}/>;
 const content=<ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
  <Label large>{operation==='product-create'?'Add product':operation==='product-edit'?'Edit product':operation==='bundle-create'?'New bundle':operation==='bundle-edit'?'Edit bundle':operation==='bundle-pack'?'Pack / unpack':operation==='bundle-delete'?'Delete bundle':operation==='bundle-toggle'?'Display settings':operation==='purchase-create'?'New purchase order':operation==='transfer-save'?'Transfer draft':'Online Store'}</Label>
  {!ready&&<ActivityIndicator/>}{error&&<Card><Label>{error}</Label>{!ready&&<Button title="Retry" onPress={()=>setReload(v=>v+1)}/>}</Card>}
  {pending&&<Card><Label>Unconfirmed save</Label><Label muted>Check this request before making another change.</Label></Card>}
  {operation==='bundle-delete'&&<Card><Label>{values.name}</Label><Label>Delete this bundle from this branch? Bundles with stock or transaction history cannot be deleted.</Label></Card>}
  {(isProduct||isBundle||operation==='storefront-save')&&<Card>{field('name','Name *')}{field('description','Description')}</Card>}
  {operation==='product-create'&&productMode==='standard'&&<Card><Label>Product type</Label>{['standard','variant'].map(type=><Button key={type} title={type==='variant'?'Variants':'Standard product'} secondary={values.type!==type} disabled={locked} onPress={()=>{set('type',type);if(type==='standard')setVariants(v=>v.slice(0,1));}}/>)}</Card>}
  {(isProduct||isBundle)&&<>
   <Card><Label>Category</Label><Button title={categories.find(c=>c.id===values.categoryId)?.name||'No category'} secondary disabled={locked} onPress={()=>setChooseCategory(true)}/></Card>
   <Card>{(image?.uri||imageUrl)&&!flags.removeImage&&<Image source={{uri:image?.uri||imageUrl!}} style={{height:180}} resizeMode="contain"/>}<Button title="Choose image" secondary disabled={locked} onPress={()=>void pickImage()}/><Toggle label="Remove image" value={flags.removeImage} disabled={locked} change={value=>{setFlags(v=>({...v,removeImage:value}));if(value)setImage(null);}}/></Card>
   <Card><Toggle label="Show on POS" value={flags.showPos} disabled={locked||operation==='bundle-edit'} change={showPos=>setFlags(v=>({...v,showPos}))}/><Toggle label="Show on Online Store" value={flags.showOnline} disabled={locked||operation==='bundle-edit'} change={showOnline=>setFlags(v=>({...v,showOnline}))}/>{operation==='product-edit'&&<Toggle label="Active" value={flags.active} disabled={locked} change={active=>setFlags(v=>({...v,active}))}/>}</Card>
  </>}
  {operation==='product-create'&&<><Label>{values.type==='variant'?'Variants':values.type==='configurable'?'Configurable product':'Standard product'}</Label>{variants.map((row,index)=><Card key={index}>{(values.type==='variant'?['sku','barcode','size','color','cost','price','lowStock']:['sku','barcode','cost','price','lowStock']).map(k=><Field key={k} label={{sku:'SKU *',barcode:'Barcode',size:'Size *',color:'Colour *',cost:'Cost price',price:'Selling price',lowStock:'Low-stock quantity'}[k]||k} value={row[k as keyof Variant]} editable={!locked} keyboardType={['cost','price','lowStock'].includes(k)?'decimal-pad':'default'} onChangeText={value=>setVariants(v=>v.map((r,i)=>i===index?{...r,[k]:value}:r))}/>)}{variants.length>1&&<Button title="Remove variant" secondary disabled={locked} onPress={()=>setVariants(v=>v.filter((_,i)=>i!==index))}/>}</Card>)}{values.type==='variant'&&variants.length<40&&<Button title="Add variant" secondary disabled={locked} onPress={()=>setVariants(v=>[...v,blankRow()])}/>}<Label muted>New products start with zero stock. Add stock through Inventory or purchase receiving.</Label></>}
  {operation==='product-create'&&values.type==='configurable'&&<><Label large>Option groups</Label>{groups.map((group,index)=><Card key={index}><Field label="Group name" value={group.name} editable={!locked} onChangeText={name=>setGroups(g=>g.map((v,i)=>i===index?{...v,name}:v))}/><Toggle label="Required" value={group.required} disabled={locked} change={required=>setGroups(g=>g.map((v,i)=>i===index?{...v,required}:v))}/>{group.options.map((option,n)=><View key={n}><Field label="Option name" value={option.name} editable={!locked} onChangeText={name=>setGroups(g=>g.map((v,i)=>i===index?{...v,options:v.options.map((o,j)=>j===n?{...o,name}:o)}:v))}/><Field label="Extra price" value={option.price} keyboardType="decimal-pad" editable={!locked} onChangeText={price=>setGroups(g=>g.map((v,i)=>i===index?{...v,options:v.options.map((o,j)=>j===n?{...o,price}:o)}:v))}/></View>)}<Button title="Add option" secondary disabled={locked||group.options.length>=30} onPress={()=>setGroups(g=>g.map((v,i)=>i===index?{...v,options:[...v.options,{name:'',price:'0'}]}:v))}/><Button title="Remove group" secondary disabled={locked} onPress={()=>setGroups(g=>g.filter((_,i)=>i!==index))}/></Card>)}<Button title="Add option group" disabled={locked||groups.length>=12} secondary onPress={()=>setGroups(g=>[...g,{name:'',required:false,options:[{name:'',price:'0'}]}])}/></>}
  {(operation==='product-edit'||isBundle)&&<Card>{field('sku','SKU *')}{field('price','Selling price',true)}{operation==='product-edit'&&<>{field('barcode','Barcode')}{field('cost','Cost price',true)}{field('lowStock','Low-stock quantity',true)}{field('size','Size')}{field('color','Colour')}</>}</Card>}
  {operation==='purchase-create'&&<Card><Label>Supplier *</Label>{suppliers.map(s=><Button key={s.id} title={s.name} secondary={values.supplierId!==s.id} disabled={locked} onPress={()=>set('supplierId',s.id)}/>)}{field('expectedDate','Expected date (YYYY-MM-DD)')}</Card>}
  {operation==='transfer-save'&&<Card><Label>Destination branch *</Label>{workspace?.branches.filter(b=>b.id!==scope.branchId).map(b=><Button key={b.id} title={b.name} secondary={values.destinationId!==b.id} disabled={locked} onPress={()=>set('destinationId',b.id)}/>)}</Card>}
  {(isBundle||isDraft)&&<><Label large>Items</Label>{lines.map((line,index)=><Card key={line.productId}><Label>{line.name}</Label><Field label="Quantity" value={line.quantity} editable={!locked} keyboardType="number-pad" onChangeText={quantity=>setLines(v=>v.map((l,i)=>i===index?{...l,quantity}:l))}/>{operation==='purchase-create'&&<Field label="Unit cost" value={line.cost} keyboardType="decimal-pad" editable={!locked} onChangeText={cost=>setLines(v=>v.map((l,i)=>i===index?{...l,cost}:l))}/>}<Button title="Remove item" secondary disabled={locked} onPress={()=>setLines(v=>v.filter((_,i)=>i!==index))}/></Card>)}<Button title="Choose product / variant" secondary disabled={locked||lines.length>=100} onPress={()=>setPicker(true)}/>{field('note','Note')}</>}
  {operation==='bundle-pack'&&<Card>{field('quantity','Quantity',true)}<Label muted>Positive quantity packs sets. Negative quantity unpacks sets and restores components.</Label></Card>}
  {operation==='bundle-toggle'&&<Card><Button title="Show on POS" secondary={values.action!=='pos'} disabled={locked} onPress={()=>{set('action','pos');setFlags(v=>({...v,enabled:v.showPos}));}}/><Button title="Show on Online Store" secondary={values.action!=='online'} disabled={locked} onPress={()=>{set('action','online');setFlags(v=>({...v,enabled:v.showOnline}));}}/><Toggle label="Enabled" value={flags.enabled} disabled={locked} change={enabled=>setFlags(v=>({...v,enabled}))}/></Card>}
  {operation==='storefront-save'&&<Card><Label muted>Applies to every branch.</Label>{field('phone','Store phone')}{field('address','Store address')}<Toggle label="Publish storefront" value={flags.published} disabled={locked} change={published=>setFlags(v=>({...v,published}))}/><Toggle label="Accept online orders" value={flags.acceptOrders} disabled={locked} change={acceptOrders=>setFlags(v=>({...v,acceptOrders}))}/></Card>}
  <Button title={pending?'Check / retry save':operation==='bundle-delete'?'Delete bundle':'Save'} busy={busy} disabled={!online||!ready||!canSave} onPress={()=>theme.alert(theme.t('Confirm'),theme.t(operation==='bundle-delete'?'Delete this bundle?':'Save these details?'),[{text:theme.t('Cancel'),style:'cancel'},{text:theme.t(operation==='bundle-delete'?'Delete':'Save'),style:operation==='bundle-delete'?'destructive':'default',onPress:()=>void submit()}])}/>
  {!embedded&&<Button title="Close" secondary disabled={busy} onPress={close}/>}<ProductChooser operation={operation} visible={picker} configure={isBundle} scope={scope} online={online} close={()=>setPicker(false)} selected={lines.map(l=>l.productId)} choose={(p,options)=>{setLines(v=>[...v,{productId:p.id,name:[p.name,p.size,p.color].filter(Boolean).join(' · '),quantity:'1',cost:String(p.cost_price),optionIds:options}]);setPicker(false);}}/>
  <Modal visible={chooseCategory} animationType="slide" presentationStyle="pageSheet" onRequestClose={()=>setChooseCategory(false)}><SafeAreaView style={{flex:1,backgroundColor:theme.background}}><ScrollView contentContainerStyle={styles.page}><Label large>Category</Label>{[{id:'',name:'No category'},...categories].map(c=><Button key={c.id} title={c.name} secondary onPress={()=>{set('categoryId',c.id);setChooseCategory(false);}}/>)}<Button title="Close" onPress={()=>setChooseCategory(false)}/></ScrollView></SafeAreaView></Modal>
 </ScrollView>;
 return embedded?content:<Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={()=>{if(!busy)close();}}><SafeAreaView style={{flex:1,backgroundColor:theme.background}}>{content}</SafeAreaView></Modal>;
}

function ProductChooser({visible,scope,online,selected,choose,close,configure,operation}:{visible:boolean;scope:Scope;online:boolean;selected:string[];choose:(product:Product,optionIds:string[])=>void;close:()=>void;configure:boolean;operation:string}){
 const theme=useTheme();const[search,setSearch]=useState(''),[query,setQuery]=useState(''),[page,setPage]=useState(1);
 type Config=Product&{groups:{id:string;name:string;selection_type:string;is_required:boolean;min_selections:number;max_selections:number}[];options:{id:string;group_id:string;name:string;price_adjustment:number}[]};
 const [config,setConfig]=useState<Config|null>(null),[optionIds,setOptionIds]=useState<string[]>([]),[configError,setConfigError]=useState(''),[configBusy,setConfigBusy]=useState(false);
 useEffect(()=>{const timer=setTimeout(()=>{setQuery(search);setPage(1);},300);return()=>clearTimeout(timer);},[search]);
 const endpoint=operation==='purchase-create'?'purchase-products':operation==='transfer-save'?'transfer-products':'catalog';
 const {data,loading,error}=useData<{rows:Product[];total:number;currency:string}>(`${endpoint}?components=true&page=${page}&search=${encodeURIComponent(query)}`,scope,online&&visible);
 async function select(p:Product){if(configBusy)return;if(!configure||p.product_type!=='configurable'){choose(p,[]);return;}setConfigBusy(true);setConfigError('');try{setConfig(await api<Config>(`catalog-detail?id=${p.id}`,scope));setOptionIds([]);}catch(e){setConfigError((e as Error).message);}finally{setConfigBusy(false);}}
 const valid=config?.groups.every(g=>{const count=config.options.filter(o=>o.group_id===g.id&&optionIds.includes(o.id)).length;return count>=Math.max(g.is_required?1:0,g.min_selections||0)&&count<=(g.selection_type==='single'?1:g.max_selections||config.options.length);});
 return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}><SafeAreaView style={{flex:1,backgroundColor:theme.background}}><ScrollView contentContainerStyle={styles.page}>
 <Label large>Choose product / variant</Label>
 {config?<><Label>{config.name}</Label>{config.groups.map(g=><Card key={g.id}><Label>{g.name}</Label>{config.options.filter(o=>o.group_id===g.id).map(o=><Button key={o.id} title={o.name+' · +'+money(o.price_adjustment)} secondary={!optionIds.includes(o.id)} onPress={()=>setOptionIds(ids=>ids.includes(o.id)?ids.filter(id=>id!==o.id):[...ids.filter(id=>g.selection_type!=='single'||!config.options.some(other=>other.id===id&&other.group_id===g.id)),o.id])}/>)}</Card>)}<Button title="Add item" disabled={!valid} onPress={()=>{choose(config,optionIds);setConfig(null);}}/><Button title="Back" secondary onPress={()=>setConfig(null)}/></>
 :<><Field label="Search name, SKU or barcode" value={search} onChangeText={setSearch}/>{(loading||configBusy)&&<ActivityIndicator/>}{(error||configError)&&<Label>{error||configError}</Label>}{data?.rows.map(p=><Button key={p.id} title={[p.name,p.size,p.color,p.sku].filter(Boolean).join(' · ')} secondary disabled={selected.includes(p.id)||configBusy} onPress={()=>void select(p)}/>)}<View style={styles.row}><Button title="Previous" secondary disabled={page===1} onPress={()=>setPage(p=>p-1)}/><Button title="Next" secondary disabled={!data||page*25>=data.total} onPress={()=>setPage(p=>p+1)}/></View></>}
 <Button title="Close" secondary onPress={()=>{setConfig(null);close();}}/></ScrollView></SafeAreaView></Modal>;
}
