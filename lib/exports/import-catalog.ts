import { exportGroups } from './catalog';

export const csvImportTemplates = {
  products: {
    label: 'Products', table: 'products', match: 'SKU',
    csv: 'name,sku,barcode,description,cost_price,selling_price,low_stock_quantity,is_active\nClassic Tee,TEE-001,TEE-001,Example product,5,12,5,true\n',
    help: 'Name, SKU and selling price are required. Standard products only; starting stock is zero. Use Branch inventory to set stock.',
  },
  inventory: {
    label: 'Branch inventory', table: 'product_location_stock', match: 'Branch code + SKU',
    csv: 'branch_code,sku,quantity,low_stock_threshold\nMAIN,TEE-001,25,5\n',
    help: 'Use an existing SKU and the current branch code. Quantity is the final stock quantity, not an amount to add.',
  },
  customers: {
    label: 'Customers', table: 'customers', match: 'Email or phone in the current branch',
    csv: 'name,email,phone,address,note\nExample Customer,customer@example.com,+85512345678,Phnom Penh,VIP\n',
    help: 'Name and at least one of email or phone are required. Conflicting matches block the import.',
  },
  suppliers: {
    label: 'Suppliers', table: 'suppliers', match: 'Email or name in the current branch',
    csv: 'name,contact_person,phone,email,address,notes,is_active\nExample Supplier,Mr Dara,+85512345678,supplier@example.com,Phnom Penh,Primary supplier,true\n',
    help: 'Name is required. Keep email and name consistent with existing suppliers.',
  },
} as const;

export type CsvImportKind = keyof typeof csvImportTemplates;
export const allImportTables: string[] = exportGroups.flatMap(group => [...group.tables]);
export const editableBackupTables = ['products', 'customers', 'suppliers', 'business_storefronts', 'business_receipt_settings', 'business_customer_settings', 'business_delivery_zones', 'business_tables', 'categories'];

export function csvKindForTable(table: string, productMode = 'standard'): CsvImportKind | undefined {
  if (table === 'products' && productMode !== 'standard') return undefined;
  return (Object.keys(csvImportTemplates) as CsvImportKind[]).find(kind => csvImportTemplates[kind].table === table);
}

export function productImportNotice(productMode: string) {
  return `${productMode === 'variant' ? 'Variant' : 'Configurable'} products need their existing-record template. Download a new Products template to update existing items. Add new products in Products.`;
}

export function importDatasetLabel(table: string) {
  const labels: Record<string, string> = { businesses: 'Business details', business_locations: 'Branches', business_storefronts: 'Online Store settings', business_receipt_settings: 'Printer & receipt settings', business_customer_settings: 'Customer settings', business_delivery_zones: 'Delivery zones', business_tables: 'Store tables', product_location_stock: 'Branch inventory', tenh_pos_holds: 'Held POS orders', tenh_pos_points_used: 'POS loyalty points', audit_logs: 'Audit Logs', business_activity_history: 'Activity History' };
  return labels[table] ?? table.replace(/^business_/, '').split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}
