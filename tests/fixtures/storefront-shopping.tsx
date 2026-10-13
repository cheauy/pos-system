// Real shopping components; the local runner supplies only isolated API failures.
import React from "react";
import {createRoot} from "react-dom/client";
import Shop from "../../app/_sites/[slug]/storefront-shop";
import Footer from "../../app/_sites/[slug]/storefront-contact";
import {StorefrontLanguage} from "../../app/_sites/[slug]/storefront-language";
import {storefrontTheme} from "../../lib/storefront/theme";
import type {StorefrontSettings} from "../../lib/storefront/types";
import type {StorefrontCatalogProduct} from "../../lib/storefront/catalog-types";
import type {StorefrontBrand} from "../../app/_sites/[slug]/storefront-hero";
import {defaultOpeningHours} from "../../lib/storefront/profile";

// The fixture replaces next/image without making remote requests.
// eslint-disable-next-line @next/next/no-img-element
export default function Image({alt="",...props}:React.ImgHTMLAttributes<HTMLImageElement>){return <img alt={alt} {...props}/>;}
export const toast={success(){},error(){}};
const query=new URLSearchParams(location.search),lang=query.get("lang")||"en";
const name=lang==="km"?"ហាងសម្រាប់ការធ្វើតេស្តចំណងជើងខ្មែរវែងនៅរាជធានីភ្នំពេញ":"Fixture Trading";
const color=query.get("color")||"#14532d",currency=query.get("currency")||"USD";
const missing=query.has("missing"),disabled=query.has("closed");
const first:StorefrontCatalogProduct={key:"style-one",name:lang==="km"?"អាវសម្រាប់ធ្វើតេស្តឈ្មោះវែងដែលមានពណ៌និងទំហំច្រើន":"Fixture cotton style",categoryId:"clothes",productType:"variant",description:"Fixture description with readable product information.",imageUrl:"/fixture-item.svg",images:["/fixture-item.svg","/fixture-white.svg"],priceFrom:19.95,totalStock:5,isNewArrival:true,variants:[{id:"black-m",sku:"FIX-B-M",size:"M",color:"Black",imageUrl:"/fixture-item.svg",sellingPrice:19.95,stockQuantity:3},{id:"black-l",sku:"FIX-B-L",size:"L",color:"Black",imageUrl:"/fixture-item.svg",sellingPrice:19.95,stockQuantity:0},{id:"white-m",sku:"FIX-W-M",size:"M",color:"White",imageUrl:"/fixture-white.svg",sellingPrice:24.6,stockQuantity:2}],optionGroups:[]};
const products:StorefrontCatalogProduct[]=[first,{...first,key:"sold-out",name:"Fixture sold-out style",variants:first.variants.map(v=>({...v,id:"empty-"+v.id,stockQuantity:0})),totalStock:0,isNewArrival:false},{...first,key:"standard",name:"Fixture standard item",productType:"standard",variants:[{...first.variants[0],id:"standard-id",size:null,color:null,sellingPrice:7.8,stockQuantity:4}],priceFrom:7.8,totalStock:4,isNewArrival:false,images:[]}];
if(query.has("many"))for(let i=0;i<30;i++)products.push({...products[2],key:"item-"+i,name:"Fixture item "+i,variants:[{...products[2].variants[0],id:"many-"+i}]});
const brand:StorefrontBrand={name,businessType:"fashion",businessTypeLabel:"Fashion",logoUrl:missing?null:"/fixture-logo.svg",bannerUrl:missing?null:"/fixture-banner.svg",description:missing?null:"A real fixture branding description.",newArrivalsEnabled:true,ownerUrl:"/owner",orderingEnabled:!disabled,allowDelivery:true,allowPickup:true,address:missing?null:"Fixture address",socialLinks:missing?{}:{telegram:"https://example.test/fixture-contact"}};
const settings={businessType:"fashion",currency,primaryColor:color,orderingEnabled:!disabled,allowPickup:true,allowDelivery:true,allowDineIn:false,minimumOrder:0,deliveryFee:3.5,checkoutMessage:"Fixture instructions for the buyer.",acceptCod:!query.has("no-payment"),acceptKhqr:!query.has("no-payment"),khqrImageUrl:"/fixture-qr.svg",khqrAccountName:"Fixture account",khqrInstructions:"Fixture proof instructions",allowScheduledOrders:true,minScheduleLeadMinutes:15,maxScheduleDays:2,couponsEnabled:true,loyaltyEnabled:true,loyaltySpendPerPoint:1,loyaltyMinimumOrder:0,deliveryZones:[{id:"zone-one",name:"Fixture local area",fee:4.25,minimumOrder:0}]};
const footer={logo_url:brand.logoUrl,description:brand.description,phone:missing?null:"012345678",address:brand.address,social_links:missing?{}:{telegram:"https://example.test/fixture-contact",facebook:"https://example.test/fixture-social",profile:{contactEmail:"fixture@example.test",openingHours:{...defaultOpeningHours(),enabled:true}}}} as StorefrontSettings;
window.print=()=>{throw Error("Physical printing is disabled");};
createRoot(document.getElementById("root")!).render(<StorefrontLanguage storeId="fixture-shop" initialLanguage={lang}><main className={"public-store"+(query.has("simple")?" store-style-simple":"")} id="store-home" style={storefrontTheme(color)}><div className="store-shell"><Shop brand={brand} slug="fixture-shop" categories={[{id:"clothes",name:lang==="km"?"សម្លៀកបំពាក់":"Clothing"}]} products={query.has("empty")?[]:products} settings={settings} tableToken={null} productKey={query.get("product")||undefined}/><Footer name={name} settings={footer}/></div></main></StorefrontLanguage>);
