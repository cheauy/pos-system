'use server';
import { requirePermission } from '@/lib/auth/require-permission';
import { createClient } from '@/lib/supabase/branch-server';
import { getBranchContext } from '@/lib/branches/context';
import { selectedExportTables, exportCsv, sanitizeExport } from '@/lib/exports/catalog';
import { exportWorkbook } from '@/lib/exports/workbook';

export async function exportBusinessData(groups: string[], format: 'json'|'csv'|'xlsx', selectedTables?: string[], allBranches = false) {
 const business=await requirePermission('exports.manage');
 if(business.role!=='owner')throw new Error('Only the Owner can export the complete business across all branches.');
 if(!['json','csv','xlsx'].includes(format))throw new Error('Select a valid file format.');
 const tables=selectedExportTables(groups,selectedTables);
 const db=await createClient();
 const {branchId}=await getBranchContext();
 const {data,error}=await db.rpc('tenh_export_business',{p_business_id:business.id,p_tables:tables,p_all_branches:allBranches===true});
 if(error)throw new Error('Export could not complete. No partial file was downloaded. '+error.message);
 if(!data||tables.some(t=>!Array.isArray(data[t])))throw new Error('Export returned incomplete data. Please retry.');
 const cleaned=sanitizeExport(data) as Record<string,Record<string,unknown>[]>;
 const rowCount=Object.values(cleaned).reduce((sum,rows)=>sum+rows.length,0);
 const content=format==='xlsx'?await exportWorkbook(cleaned):format==='csv'?exportCsv(cleaned):JSON.stringify({version:2,businessId:business.id,exportedAt:new Date().toISOString(),branchId:allBranches?null:branchId,scope:allBranches?'All branches of this business':'Current branch; shared Online Store included',excluded:'Login credentials, security tokens, platform administration and binary uploads. File references are included.',tables:Object.fromEntries(Object.entries(cleaned).map(([key,rows])=>[key,rows.length])),data:cleaned},null,2);
 const filename=`tenh-${allBranches?'business':branchId}-${new Date().toISOString().slice(0,10)}.${format}`;
 const {data:{user}}=await db.auth.getUser();
 if(user) await db.from('data_transfer_jobs').insert({business_id:business.id,user_id:user.id,direction:'export',entity:'all',format,filename,row_count:rowCount,status:'completed',summary:{groups,tables,branchId,allBranches}});
 return {filename,mime:format==='xlsx'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':format==='json'?'application/json':'text/csv;charset=utf-8',content,rowCount,encoding:format==='xlsx'?'base64':'text',sheetCount:format==='xlsx'?tables.length:0};
}
