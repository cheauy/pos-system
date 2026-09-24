export const exportGroups = [
 {id:'business',label:'Business & settings',tables:['businesses','business_locations','business_storefronts','business_receipt_settings','business_customer_settings','branch_receipt_settings','branch_customer_settings','branch_pos_settings','branch_role_permissions','branch_notification_role_settings','business_delivery_zones','business_tables']},
 {id:'products',label:'Products & inventory',tables:['products','branch_product_details','branch_bundle_recipes','product_variants','categories','product_location_stock','product_option_groups','product_options','bundle_items','inventory_movements','stock_adjustments','stock_transfers','stock_transfer_items']},
 {id:'sales',label:'Orders & returns',tables:['orders','order_items','returns','return_items','tenh_pos_holds','tenh_pos_points_used']},
 {id:'customers',label:'Customers & loyalty',tables:['customers','customer_credit_accounts','customer_credit_ledger','customer_loyalty_transactions','business_coupons','coupon_redemptions']},
 {id:'purchases',label:'Suppliers & purchases',tables:['suppliers','purchases','purchase_items','purchase_orders','purchase_order_items']},
 {id:'finance',label:'Expenses & registers',tables:['expenses','cash_register_shifts','cash_movements']},
 {id:'activity',label:'Activity',tables:['audit_logs','business_activity_history']},
] as const;

export function selectedExportTables(groups: string[], requested?: string[]): string[] {
 if(!Array.isArray(groups)||!groups.length||groups.some(id=>!exportGroups.some(g=>g.id===id)))throw new Error('Select valid data groups.');
 const allowed: string[] = exportGroups.filter(g=>groups.includes(g.id)).flatMap(g=>[...g.tables]);
 if(requested!==undefined && (!Array.isArray(requested)||!requested.length||requested.some(table=>!allowed.includes(table))))throw new Error('Select valid datasets within the chosen groups.');
 return [...new Set(requested??allowed)];
}

// Security and provider credentials never belong in portable business exports.
export function sanitizeExport(value: unknown): unknown {
 if(Array.isArray(value))return value.map(sanitizeExport);
 if(value && typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!/(password|secret|token|credential|api.?key|authorization|fingerprint|raw_payload|provider_response|payway_response)/i.test(key)).map(([key,item])=>[key,sanitizeExport(item)]));
 return value;
}
export function exportCsv(data: Record<string,Record<string,unknown>[]>) {
 const cell=(value:unknown)=>{let text=typeof value==='object'&&value!==null?JSON.stringify(value):String(value??'');if(/^[\s]*[=+@-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
 const columns=Array.from(new Set(Object.values(data).flatMap(rows=>rows.flatMap(row=>Object.keys(row))))).sort();
 return '\uFEFF'+[['dataset',...columns].map(cell).join(','),...Object.entries(data).flatMap(([table,rows])=>rows.map(row=>[table,...columns.map(key=>row[key])].map(cell).join(',')))].join('\r\n');
}
