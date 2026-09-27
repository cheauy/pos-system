import React,{useState} from 'react';
import {Linking,Pressable,ScrollView,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {apiUrl,type Workspace} from './client';
import {useData} from './screens';
import {ProductPanel} from './product-panel';
import {Pagination} from './list-controls';
import {Shimmer} from './loading';
import {Badge,Button,Card,DetailRow,Label,SearchField,styles,useTheme} from './ui';

const menus={Profile:{endpoint:'account-profile',path:'settings/profile',icon:'person-circle-outline'},Users:{endpoint:'account-users',path:'settings/users',icon:'people-outline'},Branches:{endpoint:'account-branches',path:'locations',icon:'business-outline'},Categories:{endpoint:'account-categories',path:'categories',icon:'albums-outline'}} as const;
type Row={id:string;name:string;[key:string]:unknown};
export function AccountMenu({feature,workspace,online}:{feature:keyof typeof menus;workspace:Workspace;online:boolean}){
 const theme=useTheme(),menu=menus[feature];
 const scope={userId:workspace.userId,businessId:workspace.business.id,branchId:workspace.branchId};
 const {data,error,loading,refresh}=useData<{rows:Row[];summary?:string}>(menu.endpoint,scope,online);
 const [search,setSearch]=useState(''),[page,setPage]=useState(1),[selected,setSelected]=useState<Row|null>(null);
 const rows=(data?.rows??[]).filter(row=>[row.name,row.email,row.phone,row.code].some(value=>String(value??'').toLowerCase().includes(search.toLowerCase())));
 const current=Math.min(page,Math.max(1,Math.ceil(rows.length/10)));
 function manage(){theme.alert('Open website?',`Manage ${feature.toLowerCase()} on the TENH POS website. You may need to sign in.`,[{text:'Cancel',style:'cancel'},{text:'Continue',onPress:()=>void Linking.openURL(`${apiUrl}/dashboard/${menu.path}`).catch(()=>theme.alert('Unable to open website'))}]);}
 const details=(row:Row)=><Card>{Object.entries(feature==='Profile'?{name:'Name',email:'Email',business:'Business',role:'Role'}:feature==='Users'?{name:'Name',email:'Email',phone:'Phone',role:'Role',branch:'Branch',status:'Status'}:feature==='Branches'?{name:'Branch',code:'Code',phone:'Phone',address:'Address',city:'City',timezone:'Timezone',notes:'Notes'}:{name:'Category',description:'Description',branches:'Display in branches',online_sort_order:'Sort order'}).map(([key,label])=><DetailRow key={key} label={label} value={row[key]==null||row[key]===''?'—':String(row[key])}/>)}{feature==='Branches'&&<DetailRow label="Status" value={row.is_active?'Active':'Inactive'}/>} {feature==='Categories'&&<DetailRow label="Online Store" value={row.is_online?'Visible':'Hidden'}/>}</Card>;
 return <ScrollView contentContainerStyle={styles.page}>{feature!=='Profile'&&<SearchField placeholder={`Search ${feature.toLowerCase()}`} value={search} onChangeText={value=>{setSearch(value);setPage(1);}}/>}{loading&&!data&&<Shimmer rows={4}/>} {error&&<Card><Label>{error}</Label><Button title="Retry" secondary disabled={!online} onPress={refresh}/></Card>}{data?.summary&&<Badge title={data.summary}/>} {feature==='Profile'&&data?.rows[0]?details(data.rows[0]):rows.slice((current-1)*10,current*10).map(row=><Pressable key={row.id} accessibilityRole="button" onPress={()=>setSelected(row)} style={[styles.row,{padding:14,borderWidth:1,borderColor:theme.border,borderRadius:14,backgroundColor:theme.panel}]}><Ionicons name={menu.icon} color="#5987ed" size={24}/><View style={{flex:1}}><Label>{row.name}</Label><Label muted>{String(row.role||row.code||row.branches||'')}</Label></View><Ionicons name="chevron-forward" size={18} color={theme.muted}/></Pressable>)}{data&&!rows.length&&<Label>No matching records</Label>}{feature!=='Profile'&&<Pagination page={current} total={rows.length} size={10} loading={loading} change={setPage}/>}<Button title={feature==='Profile'?'Edit profile on website':`Manage ${feature.toLowerCase()} on website`} secondary disabled={!online} onPress={manage}/><ProductPanel visible={!!selected} title={selected?.name||feature} close={()=>setSelected(null)}>{selected&&details(selected)}<Button title="Manage on website" disabled={!online} onPress={manage}/></ProductPanel></ScrollView>;
}
