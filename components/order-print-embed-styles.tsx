export default function OrderPrintEmbedStyles(){
 return <style>{`@media screen{
 html,body{background:white!important;min-width:0!important}
 body *:has(#order-print-preview){display:block!important;position:static!important;margin:0!important;padding:0!important;height:auto!important;min-height:0!important;overflow:visible!important;transform:none!important}
 body *:not(:has(#order-print-preview)):not(#order-print-preview):not(#order-print-preview *){display:none!important}
 #order-print-preview{margin:0 auto!important;padding:20px!important;background:white!important;color:black!important;min-width:0!important}
 #order-print-preview .no-print{display:none!important}
 }`}</style>;
}
