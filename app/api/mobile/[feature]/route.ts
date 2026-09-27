import { mobileRequest, mobileSelection, MobileSelectionError } from '@/lib/mobile/request-context';
import { createClient as baseClient } from '@/lib/supabase/server';
import { createClient as branchClient } from '@/lib/supabase/branch-server';
import { getCurrentBusinessForSubscription } from '@/lib/business/get-current-business';
import { getBranchContext } from '@/lib/branches/context';
import { getEffectivePermissions } from '@/lib/auth/effective-permissions';
import type { Permission } from '@/lib/auth/permissions';
import { loadWorkspace, loadOrderDetail } from '@/app/(dashboard)/dashboard/orders/order-workspace-data';
import { parseFilters } from '@/app/(dashboard)/dashboard/orders/order-workspace-types';
import { changeOrderWorkspaceStatus } from '@/app/(dashboard)/dashboard/orders/order-workspace-actions';
import { markNotificationsRead } from '@/app/(dashboard)/dashboard/notifications/read-actions';
import { loadPosWorkspace, completePosSale, checkPosSale, savePosHold, deletePosHold } from '@/app/(dashboard)/dashboard/pos/pos-workspace-actions';
import { configuredLine, cartIssue, stockFor, totals, uuid, shippingIssue, orderDetailsIssue, discountIssue } from '@/app/(dashboard)/dashboard/pos/pos-workspace-helpers';
import { couponPreview } from '@/lib/promotions/pricing';
import { createExpense } from '@/app/(dashboard)/dashboard/expenses/actions';
import { CATEGORIES } from '@/app/(dashboard)/dashboard/expenses/expense-model';
import { submitCustomerBugReport } from '@/app/(dashboard)/dashboard/settings/support/actions';
import { createPosCustomer } from '@/app/(dashboard)/dashboard/pos/pos-customer-actions';
import { openRegisterShift, closeRegisterShift } from '@/app/(dashboard)/dashboard/register/actions';
import { loadDetailedOrder } from '@/app/(dashboard)/dashboard/orders/[id]/order-detail-data';
import { recordReceipt, one } from '@/app/(dashboard)/dashboard/orders/[id]/order-detail-model';
import { loadReceiptContext } from '@/lib/receipts/load-receipt-context';
import { mobileReceiptHtml } from '@/lib/mobile/receipt-html';
import { submitStockAdjustment } from '@/app/(dashboard)/dashboard/inventory/adjustments/actions';
import { getIncomingOrders } from '@/lib/branches/incoming-orders';
import { setIncomingOrderScope, updateOnlineOrderStatus, updateOnlinePaymentStatus } from '@/app/(dashboard)/dashboard/online-orders/actions';
import { GET as getOrderProof } from '@/app/api/online-orders/[orderId]/proof/route';
import { loadMobileReports } from '@/lib/mobile/reports';
import { loadShippingSettings } from '@/lib/receipts/shipping-design-store';
import { mobileShippingHtml } from '@/lib/mobile/shipping-html';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { managementAccess, managementRead, managementWrite } from '@/lib/mobile/management';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const response = (data: unknown, status = 200) => Response.json(data, {
  status, headers: { 'Cache-Control': 'private, no-store', 'Vary': 'Authorization, X-Business-Id, X-Branch-Id' },
});
class RequestError extends Error { constructor(message: string, public status = 400) { super(message); } }
async function boundedBody(request: Request, limit: number) {
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError('Request body is required.');
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > limit) { await reader.cancel(); throw new RequestError('Request too large.', 413); }
      parts.push(next.value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(parts);
}
const access: Record<string, Permission> = {
  ...managementAccess,
  purchases: 'purchases.view', 'purchase-detail': 'purchases.view',
  'purchase-receive': 'purchases.update', 'purchase-receipt-status': 'purchases.update',
  transfers: 'transfers.manage', 'transfer-detail': 'transfers.manage', 'transfer-action': 'transfers.manage',
  reports: 'reports.view',
  orders: 'orders.view', order: 'orders.view', stock: 'inventory.view',
  customers: 'customers.view', expenses: 'expenses.manage', register: 'register.manage',
  pos: 'pos.access', quote: 'pos.access', sale: 'pos.access', 'sale-status': 'pos.access',
  hold: 'pos.access', 'delete-hold': 'pos.access',
  returns: 'orders.return', 'return-status': 'orders.return',
  receipt: 'orders.view', 'shipping-label': 'orders.view',
  adjustment: 'products.stock_adjust',
  incoming: 'orders.view', 'incoming-detail': 'orders.view', 'incoming-scope': 'orders.view',
  'incoming-status': 'orders.update', payment: 'orders.update', proof: 'orders.view',
};

async function handle(request: Request, feature: string) {
  const bearer = request.headers.get('authorization');
  if (!bearer?.startsWith('Bearer ') || bearer.length > 16384) return response({ error: 'Sign in to continue.' }, 401);
  try {
    const context = {
      token: bearer.slice(7),
      businessId: mobileSelection(request.headers.get('x-business-id')),
      branchId: mobileSelection(request.headers.get('x-branch-id')),
    };
    return await mobileRequest.run(context, async () => {
      const base = await baseClient();
      const { data: { user }, error } = await base.auth.getUser(context.token);
      if (error || !user) return response({ error: 'Your session expired. Sign in again.' }, 401);
      if(feature==='push-unregister'&&request.method==='POST') {
        const body=JSON.parse((await boundedBody(request,1024)).toString('utf8'));
        if(!uuid(body.deviceId))throw new RequestError('Invalid device.');
        const result=await base.rpc('tenh_mobile_push_device',{p_device_id:body.deviceId,p_business_id:null,p_branch_id:null,p_token:null,p_enabled:false});
        if(result.error)throw new RequestError('Unable to turn off notifications.',503);
        return response({success:true});
      }
      if (feature === 'businesses' && request.method === 'GET') {
        const result = await base.from('business_members').select('business_id,businesses(id,name)')
          .eq('user_id', user.id).eq('is_active', true).order('business_id');
        if (result.error) throw new RequestError('Unable to load your businesses.', 503);
        return response(result.data);
      }
      const business = await getCurrentBusinessForSubscription({ startTrial: false });
      if (business.subscriptionLocked) {
        return response({ error: 'Your subscription needs attention. Open Subscription on the website.', code: 'subscription_locked' }, 403);
      }
      const scope = await getBranchContext();
      const permissions = await getEffectivePermissions(business.id, business.role);
      if (feature === 'session' && request.method === 'GET') return response({
        userId: user.id,
        business: { id: business.id, name: business.name, role: business.role, subscriptionStatus: business.subscriptionStatus,
          expiresAt: business.subscriptionExpiresAt },
        branchId: scope.branchId, branches: scope.branches, permissions,
      });
      if (access[feature] && !permissions.includes(access[feature])) throw new RequestError('You do not have access to this feature.', 403);
      const db = await branchClient();
      const url = new URL(request.url);
      const page = Math.max(1, Math.min(10000, Number(url.searchParams.get('page')) || 1));
      if (!Number.isInteger(page)) throw new RequestError('Invalid page.');
      const from = (page - 1) * 25;
      const search = (url.searchParams.get('search') ?? '').trim().slice(0, 100);
      // PostgREST filter syntax must never come from unescaped search input.
      const term = search.replace(/[^\p{L}\p{N}\s_-]/gu, '');
      if (request.method === 'GET') {
        if(feature==='management-status') {
          const id=mobileSelection(url.searchParams.get('id')); if(!id) throw new RequestError('Choose a save request.');
          const result=await db.rpc('tenh_mobile_management_status',{p_business_id:business.id,p_branch_id:scope.branchId,p_request_id:id});
          if(result.error) throw new RequestError('Unable to check save status. Keep this request.',503);
          return response({data:result.data});
        }
        if (feature in managementAccess) return response(await managementRead(db,feature,business.id,scope.branchId,url));
        if (feature === 'purchase-receipt-status') {
          const id = mobileSelection(url.searchParams.get('id'));
          if (!id) throw new RequestError('Choose a receiving request.');
          const result = await db.rpc('tenh_mobile_purchase_receipt_status', { p_business_id: business.id, p_branch_id: scope.branchId, p_request_id: id });
          if (result.error) throw new RequestError('Unable to confirm receiving. Keep this request and try again.', 503);
          return response({ data: result.data });
        }
        if (feature === 'purchases') {
          let query = db.from('purchase_orders').select('id,po_number,supplier_name,status,order_date,expected_date', { count: 'exact' })
            .eq('business_id', business.id).eq('location_id', scope.branchId);
          if (term) query = query.or(`po_number.ilike.%${term}%,supplier_name.ilike.%${term}%`);
          const result = await query.order('created_at', { ascending: false }).order('id').range(from, from + 24);
          if (result.error) throw new RequestError('Unable to load purchase orders.', 503);
          return response({ rows: result.data ?? [], total: result.count ?? 0 });
        }
        if (feature === 'purchase-detail') {
          const id = mobileSelection(url.searchParams.get('id'));
          if (!id) throw new RequestError('Choose a purchase order.');
          const result = await db.from('purchase_orders').select('id,po_number,supplier_name,status,order_date,expected_date,notes')
            .eq('business_id', business.id).eq('location_id', scope.branchId).eq('id', id).maybeSingle();
          if (result.error) throw new RequestError('Unable to load purchase order.', 503);
          if (!result.data) throw new RequestError('Purchase order not found in this branch.', 404);
          const items = await db.from('purchase_order_items').select('id,product_name,sku,ordered_quantity,received_quantity')
            .eq('business_id', business.id).eq('purchase_order_id', id).order('id').limit(101);
          if (items.error) throw new RequestError('Unable to load received quantities.', 503);
          if ((items.data?.length ?? 0) > 100) throw new RequestError('Open this large purchase order on the website.', 409);
          const ready = permissions.includes('purchases.update') ? await db.rpc('tenh_mobile_purchase_receipt_status', { p_business_id: business.id, p_branch_id: scope.branchId, p_request_id: null }) : null;
          return response({ ...result.data, items: items.data ?? [], canReceive: ready !== null && !ready.error });
        }
        if (feature === 'transfers' || feature === 'transfer-detail') {
          let query = db.from('stock_transfers').select('id,transfer_number,status,source_location_id,destination_location_id,note,created_at,updated_at', { count: 'exact' })
            .eq('business_id', business.id).or(`source_location_id.eq.${scope.branchId},destination_location_id.eq.${scope.branchId}`);
          if (feature === 'transfer-detail') {
            const id = mobileSelection(url.searchParams.get('id'));
            if (!id) throw new RequestError('Choose a stock transfer.');
            const result = await query.eq('id', id).maybeSingle();
            if (result.error) throw new RequestError('Unable to load stock transfer.', 503);
            if (!result.data) throw new RequestError('Transfer not found in this branch.', 404);
            const items = await db.from('stock_transfer_items').select('product_id,quantity,products(name,sku,size,color)')
              .eq('business_id', business.id).eq('transfer_id', id).order('product_id').limit(101);
            if (items.error) throw new RequestError('Unable to load transfer items.', 503);
            if ((items.data?.length ?? 0) > 100) throw new RequestError('Open this large transfer on the website.', 409);
            const ready = await db.rpc('tenh_mobile_transfer_action', { p_business_id: business.id, p_branch_id: scope.branchId, p_transfer_id: null, p_action: 'check', p_expected: null, p_items: null });
            return response({ ...result.data, canAct: !ready.error && ready.data?.ready === true, direction: result.data.source_location_id === scope.branchId ? 'Outgoing' : 'Incoming', items: items.data ?? [] });
          }
          if (term) query = query.ilike('transfer_number', `%${term}%`);
          const result = await query.order('created_at', { ascending: false }).order('id').range(from, from + 24);
          if (result.error) throw new RequestError('Unable to load stock transfers.', 503);
          return response({ rows: (result.data ?? []).map(row => ({ ...row, direction: row.source_location_id === scope.branchId ? 'Outgoing' : 'Incoming' })), total: result.count ?? 0 });
        }
        if (feature === 'return-status') {
          const requestId = mobileSelection(url.searchParams.get('id'));
          if (!requestId) throw new RequestError('Choose a refund request.');
          const result = await db.rpc('tenh_mobile_return_status', { p_business_id: business.id, p_branch_id: scope.branchId, p_request_id: requestId });
          if (result.error) throw new RequestError('Unable to confirm this refund. Keep the request and try again.', 503);
          return response({ data: result.data });
        }
        if (feature === 'returns') {
          const orderId = mobileSelection(url.searchParams.get('id'));
          if (!orderId) throw new RequestError('Choose an order.');
          const ready = await db.rpc('tenh_mobile_return_status', { p_business_id: business.id, p_branch_id: scope.branchId, p_request_id: null });
          if (ready.error) throw new RequestError('Mobile refunds are unavailable until the refund-safety database update is applied.', 503);
          const order = await loadOrderDetail(business.id, orderId);
          if (order.branchId !== scope.branchId || order.returnsUnavailable) throw new RequestError('Return history is unavailable in this branch. Refresh before continuing.', 409);
          return response(order);
        }
        if (feature === 'reports') {
          const range = url.searchParams.get('range') || 'yesterday';
          if (!['today', 'yesterday', '7days', '30days'].includes(range)) throw new RequestError('Choose a report period.');
          return response(await loadMobileReports(db, business.id, scope.branchId, range));
        }
        if (feature === 'proof') {
          const id = mobileSelection(url.searchParams.get('id'));
          if (!id) throw new RequestError('Choose an order.');
          const proof = await getOrderProof(request, { params: Promise.resolve({ orderId: id }) });
          const location = proof.headers.get('location');
          if (!location) throw new RequestError('Payment proof is unavailable.', 404);
          return response({ url: location });
        }
        if (feature === 'incoming') {
          const result = await getIncomingOrders(business.id);
          const filtered = result.orders.filter(order => `${order.order_number} ${order.guest_name || ''} ${order.guest_phone || ''}`.toLowerCase().includes(search.toLowerCase()));
          const store = await db.from('business_storefronts').select('currency').eq('business_id', business.id).maybeSingle();
          if (store.error) throw new RequestError('Unable to load store currency.', 503);
          return response({ receiveAll: result.receiveAll, currency: store.data?.currency || 'USD', total: filtered.length, page,
            rows: filtered.slice(from, from + 25).map(order => ({ id: order.id, orderNumber: order.order_number, customerName: order.guest_name || 'Customer', total: order.total,
              status: order.payment_status === 'refunded' ? 'refunded' : order.online_status === 'rejected' ? 'cancelled' : order.online_status === 'completed' ? 'completed' : 'pending',
              paymentState: order.payment_status, onlineStatus: order.online_status, branchName: order.branch_name })) });
        }
        if (feature === 'incoming-detail') {
          const id = mobileSelection(url.searchParams.get('id'));
          if (!id) throw new RequestError('Choose an order.');
          const order = await loadDetailedOrder(business.id, id);
          if (!order || !['online', 'qr'].includes(order.order_source)) throw new RequestError('Online order not found.', 404);
          const customer = one(order.customers);
          return response({ id: order.id, orderNumber: order.order_number, customerName: order.guest_name || customer?.name || 'Customer',
            customerPhone: order.guest_phone || customer?.phone, customerAddress: order.guest_address || customer?.address,
            total: order.total, status: order.status, onlineStatus: order.online_status, paymentState: order.payment_status,
            paymentMethod: order.payment_method, source: order.order_source, updatedAt: order.updated_at, createdAt: order.created_at,
            items: order.order_items.map(item => ({ id: item.id, name: item.product_name, quantity: item.quantity, subtotal: item.subtotal, variant: item.variant_label, imageUrl: one(item.products)?.image_url })) });
        }
        if (feature === 'receipt' || feature === 'shipping-label') {
          const id = mobileSelection(url.searchParams.get('id'));
          if (!id) throw new RequestError('Choose an order.');
          const order = await loadDetailedOrder(business.id, id);
          if (!order) throw new RequestError('Order not found.', 404);
          const receiptContext = await loadReceiptContext(business.id, business.name, id);
          const store = await db.from('business_storefronts').select('currency').eq('business_id', business.id).maybeSingle();
          if (store.error) throw new RequestError('Unable to load receipt currency.', 503);
          if (feature === 'shipping-label') {
            const customer = Array.isArray(order.customers) ? order.customers[0] : order.customers;
            if (!(order.guest_address || customer?.address || '').trim()) throw new RequestError('Add the delivery address before printing a shipping label.');
            const [saved, custom] = await Promise.all([
              supabaseAdmin.from('branch_receipt_settings').select('font_size,density,shipping_label_size,shipping_show_sender,shipping_show_phone,shipping_show_order_number,shipping_show_cod,shipping_show_item_count,shipping_show_barcode')
                .eq('business_id', business.id).eq('location_id', receiptContext.branchId).maybeSingle(),
              loadShippingSettings(business.id, id),
            ]);
            if (saved.error) throw new RequestError('Unable to load shipping printer settings.', 503);
            return response({ ...mobileShippingHtml(order, receiptContext, { ...saved.data, ...custom }, store.data?.currency || 'USD'), orderNumber: order.order_number });
          }
          const branch = scope.branches.find(branch => branch.id === order.location_id);
          const receipt = recordReceipt(order, business.name, store.data?.currency || 'USD', branch?.name || '');
          return response({ html: mobileReceiptHtml(receipt, receiptContext, url.origin), orderNumber: receipt.orderNumber });
        }
        if (feature === 'pos') {
          const result = await loadPosWorkspace(business.id, scope.branchId);
          if (!result.success) return response(result, 409);
          const data = result.data;
          return response({ products: data.products.map(product => ({ ...product, available: stockFor(product, scope.branchId, data) })),
            groups: data.groups, options: data.options, customers: data.customers, holds: data.holds, settings: data.settings, shift: data.shift });
        }
        if (feature === 'sale-status') {
          const id = mobileSelection(url.searchParams.get('id'));
          if (!id) throw new RequestError('Choose a sale request.');
          const result = await checkPosSale(business.id, id);
          return response(result, result.success ? 200 : 409);
        }
        if (feature === 'orders') return response(await loadWorkspace(business.id, parseFilters({
          search, page: String(page), limit: '20', branch: scope.branchId,
          status: url.searchParams.get('status') ?? 'all',
        })));
        if (feature === 'order') {
          const id = mobileSelection(url.searchParams.get('id'));
          if (!id) throw new RequestError('Choose an order.');
          return response(await loadOrderDetail(business.id, id));
        }
        if (feature === 'stock') {
          let query = db.from('branch_products').select('id,name,sku,barcode,image_url,variant_image_url,size,color,selling_price,stock_quantity,low_stock_quantity', { count: 'exact' })
            .eq('business_id', business.id).eq('is_active', true);
          if (term) query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%,barcode.ilike.%${term}%`);
          const result = await query.order('name').order('id').range(from, from + 24);
          if (result.error) throw new RequestError('Unable to load stock. Please retry.', 503);
          return response({ rows: result.data, total: result.count, page });
        }
        if (feature === 'customers') {
          let query = db.from('customers').select('id,name,phone,email,address,loyalty_points', { count: 'exact' })
            .eq('business_id', business.id).eq('location_id', scope.branchId);
          if (term) query = query.or(`name.ilike.%${term}%,phone.ilike.%${term}%`);
          const result = await query.order('name').order('id').range(from, from + 24);
          if (result.error) throw new RequestError('Unable to load customers.', 503);
          return response({ rows: result.data, total: result.count, page });
        }
        if (feature === 'expenses') {
          const result = await db.from('expenses').select('id,category,description,amount,expense_date,payee', { count: 'exact' })
            .eq('business_id', business.id).eq('location_id', scope.branchId)
            .order('expense_date', { ascending: false }).order('id').range(from, from + 24);
          if (result.error) throw new RequestError('Unable to load expenses.', 503);
          return response({ rows: result.data, total: result.count, page, categories: CATEGORIES });
        }
        if (feature === 'register') {
          const result = await db.from('cash_register_shifts').select('id,status,opening_cash,opened_at,closed_at', { count: 'exact' })
            .eq('business_id', business.id).eq('location_id', scope.branchId)
            .order('opened_at', { ascending: false }).order('id').range(from, from + 24);
          if (result.error) throw new RequestError('Unable to load register shifts.', 503);
          return response({ rows: result.data, total: result.count, page });
        }
        if (feature === 'alerts') {
          const refresh = await db.rpc('refresh_business_notifications', { p_business_id: business.id });
          if (refresh.error) throw new RequestError('Unable to refresh notifications.', 503);
          const result = await db.rpc('tenh_branch_notifications', { p_business: business.id, p_branch: scope.branchId });
          if (result.error) throw new RequestError('Unable to load notifications.', 503);
          const notifications = ((result.data ?? []) as { id: string; is_active: boolean }[]).filter(item => item.is_active !== false);
          const ids = notifications.map(item => item.id);
          const reads = ids.length ? await db.from('business_notification_reads').select('notification_id').eq('user_id', user.id).in('notification_id', ids) : { data: [], error: null };
          if (reads.error) throw new RequestError('Unable to load read status.', 503);
          const read = new Set((reads.data ?? []).map(item => item.notification_id));
          return response({ rows: notifications.slice(from, from + 25).map(item => ({ ...item, read: read.has(item.id) })), total: notifications.length, unread: notifications.filter(item => !read.has(item.id)).length, page });
        }
      }
      if (request.method === 'POST') {
        // Require an explicit branch for mutations; never fall back to another branch.
        if (!context.businessId || !context.branchId) throw new RequestError('Select a business and branch before continuing.');
        if (request.headers.get('content-type')?.startsWith('multipart/form-data')) {
          if (!['expenses', 'support', ...Object.keys(managementAccess).filter(key=>key.includes('-')&&!['catalog-detail','catalog-options','draft-options'].includes(key))].includes(feature)) throw new RequestError('Invalid upload target.');
          const bytes = await boundedBody(request, 6 * 1024 * 1024);
          const form = await new Response(bytes, { headers: { 'Content-Type': request.headers.get('content-type')! } }).formData();
          if(feature in managementAccess) {
            const result=await managementWrite(db,feature,business.id,scope.branchId,user.id,form);
            return response(result,result.success?200:409);
          }
          if (feature === 'support') {
            const result = await submitCustomerBugReport(form);
            return response({ success: result.ok, message: result.message }, result.ok ? 200 : 400);
          }
          form.set('locationId', scope.branchId);
          await createExpense(form);
          return response({ success: true });
        }
        const bodyText = (await boundedBody(request, 16384)).toString('utf8');
        let body;
        try { body = JSON.parse(bodyText); } catch { throw new RequestError('Invalid request.'); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new RequestError('Invalid request.');
        if(feature==='push-register') {
          if(!uuid(body.deviceId)||typeof body.token!=='string'||body.token.length>300)throw new RequestError('Invalid device.');
          const result=await db.rpc('tenh_mobile_push_device',{p_device_id:body.deviceId,p_business_id:business.id,p_branch_id:scope.branchId,p_token:body.token,p_enabled:true});
          if(result.error)throw new RequestError('Unable to enable notifications.',503);
          return response({success:true});
        }
        if (feature === 'transfer-action') {
          if (!uuid(body.id) || !['send','receive'].includes(body.action) || !Object.hasOwn(body, 'expected')
            || (body.expected !== null && (typeof body.expected !== 'string' || !Number.isFinite(Date.parse(body.expected))))
            || !Array.isArray(body.items) || !body.items.length || body.items.length > 100
            || body.items.some((item: { productId?: string; quantity?: number }) => !item || !uuid(item.productId) || !Number.isSafeInteger(item.quantity) || Number(item.quantity)<1 || Number(item.quantity)>999999)
            || new Set(body.items.map((item: { productId: string }) => item.productId)).size !== body.items.length) throw new RequestError('Reload the transfer and review its items.');
          const result = await db.rpc('tenh_mobile_transfer_action', { p_business_id: business.id, p_branch_id: scope.branchId, p_transfer_id: body.id, p_action: body.action, p_expected: body.expected, p_items: body.items });
          if (result.error) return response({ success:false, message:result.error.message, uncertain:true },409);
          if (result.data?.transferId !== body.id) return response({ success:false, message:'Check the transfer status before trying again.', uncertain:true },503);
          return response({ success:true, data:result.data });
        }
        if (feature === 'purchase-receive') {
          if (!uuid(body.requestId) || !uuid(body.orderId) || !Array.isArray(body.items) || !body.items.length || body.items.length > 100
            || body.items.some((item: { itemId?: string; quantity?: number; expectedReceived?: number }) => !item || !uuid(item.itemId)
              || !Number.isSafeInteger(item.quantity) || Number(item.quantity) < 1 || Number(item.quantity) > 999999
              || !Number.isSafeInteger(item.expectedReceived) || Number(item.expectedReceived) < 0)
            || new Set(body.items.map((item: { itemId: string }) => item.itemId)).size !== body.items.length) throw new RequestError('Review the received quantities and reload the purchase order.');
          const result = await db.rpc('tenh_mobile_receive_purchase', { p_business_id: business.id, p_branch_id: scope.branchId, p_request_id: body.requestId, p_order_id: body.orderId, p_items: body.items });
          if (result.error) return response({ success: false, message: result.error.message, uncertain: true }, 409);
          if (result.data?.rolledBack === true) return response({ success: false, message: result.data.error || 'Stock was not received. Review the quantities.', uncertain: false }, 409);
          if (!result.data?.purchaseOrderId) return response({ success: false, message: 'Receiving is not confirmed. Keep this request.', uncertain: true }, 503);
          return response({ success: true, data: result.data });
        }
        if (feature === 'returns') {
          if (!uuid(body.requestId) || !uuid(body.orderId) || typeof body.reason !== 'string' || body.reason.trim().length < 3 || body.reason.length > 500
            || !['cash', 'bank_transfer', 'other'].includes(body.refundMethod) || !Array.isArray(body.items) || !body.items.length || body.items.length > 100
            || body.items.some((item: { order_item_id?: string; quantity?: number }) => !item || !uuid(item.order_item_id) || !Number.isSafeInteger(item.quantity) || Number(item.quantity) < 1 || Number(item.quantity) > 999999)
            || new Set(body.items.map((item: { order_item_id: string }) => item.order_item_id)).size !== body.items.length) throw new RequestError('Review the return items, reason and refund method.');
          const result = await db.rpc('tenh_mobile_return', { p_business_id: business.id, p_branch_id: scope.branchId, p_request_id: body.requestId,
            p_order_id: body.orderId, p_reason: body.reason.trim(), p_items: body.items, p_refund_method: body.refundMethod });
          if (result.error) return response({ success: false, message: result.error.message, uncertain: true }, 409);
          if (result.data?.rolledBack === true) return response({ success: false, message: result.data.error || 'Refund not saved. Review the details.', uncertain: false }, 409);
          if (!result.data?.returnId) return response({ success: false, message: 'Refund result is not confirmed. Keep this request.', uncertain: true }, 503);
          return response({ success: true, data: result.data });
        }
        if (feature === 'incoming-scope') {
          if (typeof body.receiveAll !== 'boolean') throw new RequestError('Choose the incoming order scope.');
          const result = await setIncomingOrderScope(body.receiveAll);
          return response(result, result.success ? 200 : 409);
        }
        if (feature === 'incoming-status' || feature === 'payment') {
          const id = mobileSelection(typeof body.id === 'string' ? body.id : null);
          if (!id) throw new RequestError('Choose an order.');
          if (feature === 'payment' && body.status !== 'paid') throw new RequestError('Invalid payment update.');
          if (feature === 'incoming-status' && !['accepted', 'preparing', 'ready', 'completed'].includes(body.status)) throw new RequestError('Invalid order status.');
          const result = feature === 'payment' ? await updateOnlinePaymentStatus(id, 'paid') : await updateOnlineOrderStatus(id, body.status);
          return response(result, result.success ? 200 : 409);
        }
        if (feature === 'adjustment') {
          const form = new FormData();
          for (const key of ['requestId', 'productId', 'mode', 'quantity', 'expectedQuantity', 'reason', 'reference', 'notes']) {
            if (body[key] !== undefined && typeof body[key] !== 'string') throw new RequestError('Invalid adjustment field.');
            if (body[key] !== undefined) form.set(key, body[key]);
          }
          form.set('locationId', scope.branchId);
          const result = await submitStockAdjustment({ success: false, message: '', submittedAt: 0 }, form);
          return response(result, result.success ? 200 : 409);
        }
        if (feature === 'customers') {
          if (!permissions.includes('customers.create') || !permissions.includes('pos.access')) throw new RequestError('You cannot create customers.', 403);
          if (typeof body.address !== 'string' || !body.address.trim()) throw new RequestError('Address is required.');
          const result = await createPosCustomer(business.id, { ...body, branchId: scope.branchId });
          return response(result, result.success ? 200 : 409);
        }
        if (feature === 'register') {
          const form = new FormData();
          for (const key of ['openingCash', 'closingCash', 'shiftId', 'note']) {
            if (body[key] !== undefined && typeof body[key] !== 'string') throw new RequestError('Invalid register field.');
            if (body[key] !== undefined) form.set(key, body[key]);
          }
          form.set('locationId', scope.branchId);
          if (body.action === 'open') await openRegisterShift(form);
          else if (body.action === 'close') await closeRegisterShift(form);
          else throw new RequestError('Choose a register action.');
          return response({ success: true });
        }
        if (feature === 'sale') {
          if (body.branchId !== scope.branchId) throw new RequestError('The sale branch changed. Review checkout again.');
          const result = await completePosSale(business.id, body);
          return response(result, result.success ? 200 : 409);
        }
        if (feature === 'delete-hold') {
          if (!uuid(body.id) || !Number.isSafeInteger(body.version)) throw new RequestError('Choose a saved held order.');
          const catalog = await loadPosWorkspace(business.id, scope.branchId);
          if (!catalog.success) return response(catalog, 409);
          const held = catalog.data.holds.find(hold => hold.id === body.id);
          if (!held || held.version !== body.version || held.draft.branchId !== scope.branchId) throw new RequestError('This held order changed or is unavailable. Reload held orders.', 409);
          const result = await deletePosHold(business.id, held.id, held.version);
          return response(result, result.success ? 200 : 409);
        }
        if (feature === 'quote' || feature === 'hold') {
          if (!uuid(body.requestId) || !Array.isArray(body.items) || !body.items.length || body.items.length > 100) throw new RequestError('Add 1–100 items.');
          const catalog = await loadPosWorkspace(business.id, scope.branchId);
          if (!catalog.success) return response(catalog, 409);
          const data = catalog.data;
          const holdId = body.holdId ?? null;
          const holdVersion = body.holdVersion ?? null;
          if (holdId !== null) {
            const held = data.holds.find(hold => hold.id === holdId);
            if (!uuid(holdId) || !held || held.version !== holdVersion || held.draft.branchId !== scope.branchId) throw new RequestError('This held order changed or is unavailable. Reload held orders.');
            if (held.draft.baseCurrency && held.draft.baseCurrency !== data.settings.currency) throw new RequestError('The held order currency changed. Review this order on the website.');
          } else if (holdVersion !== null) throw new RequestError('Invalid held order version.');
          const customerId = body.customerId || null;
          if (customerId !== null && (!uuid(customerId) || !data.customers.some(customer => customer.id === customerId))) throw new RequestError('Choose a customer from this branch.');
          const shipping = body.shipping || { method: 'in_store', recipientName: '', phone: '', address: '' };
          const deliveryFee = body.deliveryFee ?? 0;
          if (typeof deliveryFee !== 'number' || !Number.isFinite(deliveryFee) || deliveryFee < 0 || deliveryFee > 999999999 || Math.abs(deliveryFee * 100 - Math.round(deliveryFee * 100)) > 0.000001) throw new RequestError('Enter a valid delivery fee.');
          const shippingError = shippingIssue(shipping, deliveryFee) || orderDetailsIssue(shipping, false, customerId);
          if (shippingError) throw new RequestError(shippingError);
          const paymentMethod = body.paymentMethod || 'cash';
          if (!['cash', 'bank_transfer', 'cod', 'split', 'deposit'].includes(paymentMethod)) throw new RequestError('Choose a supported payment method.');
          const lines = body.items.map((item: { productId: string; quantity: number; optionIds: string[] }) => {
            if (!item || !uuid(item.productId) || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 999 || !Array.isArray(item.optionIds) || item.optionIds.length > 50 || !item.optionIds.every(uuid)) throw new RequestError('Invalid cart item.');
            const product = data.products.find(product => product.id === item.productId);
            if (!product) throw new RequestError('This product is unavailable. Refresh your catalog.');
            return { ...configuredLine(product, item.optionIds, data), quantity: item.quantity };
          });
          const invalid = cartIssue(lines, scope.branchId, data);
          if (invalid) throw new RequestError(invalid);
          const subtotal = totals(lines, 0, 0, 0, 0, 0).subtotal;
          let discount = body.discount ?? 0;
          let discountType = body.discountType ?? 'amount';
          if (typeof discount !== 'number') throw new RequestError('Enter a valid discount.');
          const invalidDiscount = discountIssue(discount, discountType, subtotal);
          if (invalidDiscount) throw new RequestError(invalidDiscount);
          const couponCode = body.couponCode ?? '';
          if (typeof couponCode !== 'string' || (couponCode && !/^[A-Z0-9_-]{3,30}$/.test(couponCode))) throw new RequestError('Enter a valid coupon code.');
          if (couponCode) {
            if (!data.settings.couponsEnabled) throw new RequestError('POS coupon codes are disabled.');
            if (discount !== 0) throw new RequestError('Use a coupon or a manual discount, not both.');
            const campaign = data.coupons?.find(coupon => coupon.code.toUpperCase() === couponCode);
            const preview = couponPreview(campaign, lines, 'pos');
            if (preview.error) throw new RequestError(preview.error);
            if (campaign?.per_customer_limit && !customerId) throw new RequestError('Select a customer for this coupon.');
            discount = preview.discount; discountType = 'amount';
          }
          const redeemPoints = body.redeemPoints ?? 0;
          if (!Number.isSafeInteger(redeemPoints) || redeemPoints < 0 || redeemPoints > 1000000) throw new RequestError('Enter whole loyalty points.');
          if (redeemPoints && (!data.settings.loyaltyEnabled || !customerId || redeemPoints > Number(data.customers.find(customer => customer.id === customerId)?.loyalty_points ?? 0))) throw new RequestError('Loyalty points are unavailable or exceed this customer’s balance.');
          if (redeemPoints && ['cod', 'deposit'].includes(paymentMethod)) throw new RequestError('Redeem points on a fully paid sale.');
          const total = totals(lines, discount, deliveryFee, redeemPoints, data.settings.taxRate, data.settings.pointValue, discountType);
          if (total.discount > subtotal) throw new RequestError('Discount and points exceed the merchandise subtotal.');
          if (feature === 'hold') {
            if (typeof body.label !== 'string' || !body.label.trim() || body.label.trim().length > 80 || body.currency !== data.settings.currency) throw new RequestError('Enter a hold name and refresh currency settings.');
            const result = await savePosHold(business.id, holdId || body.requestId, holdId ? holdVersion : null, body.label, {
              branchId: scope.branchId, customerId: customerId || '', lines,
              discount: String(body.discount ?? 0), discountType: body.discountType ?? 'amount',
              deliveryFee: String(deliveryFee), points: String(redeemPoints), couponCode,
              paymentMethod, shipping, note: '', baseCurrency: data.settings.currency,
            });
            return response(result, result.success ? 200 : 409);
          }
          return response({ lines, total, input: {
            requestId: body.requestId, branchId: scope.branchId, customerId,
            items: lines.map((line: { productId: string; quantity: number; optionIds: string[]; unitPrice: number }) => ({ productId: line.productId, quantity: line.quantity, optionIds: line.optionIds, expectedUnitPrice: line.unitPrice })),
            uiVersion: 3, currencyQuote: { baseCurrency: data.settings.currency, displayCurrency: data.settings.currency, usdKhrRate: data.settings.usdKhrRate ?? 4000, enabled: data.settings.dualCurrencyEnabled === true, currencyFormat: data.settings.currencyFormat },
            paymentMethod, amountPaid: paymentMethod === 'cod' ? 0 : total.total, tenders: [], paymentsConfirmed: false,
            couponCode: couponCode || undefined, discount: total.manualDiscount, discountType, discountValue: discount,
            shipping,
            deliveryFee, redeemPoints, note: '', expectedTotal: total.total,
            expectedTaxRate: data.settings.taxRate, holdId, holdVersion,
          } });
        }
        if (feature === 'alerts') {
          if (!Array.isArray(body.ids) || body.ids.length > 25 || body.ids.some((id: unknown) => typeof id !== 'string')) throw new RequestError('Invalid notification selection.');
          await markNotificationsRead(body.ids);
          return response({ success: true });
        }
        if (feature === 'order') {
          if (!permissions.includes('orders.update')) throw new RequestError('You cannot update orders.', 403);
          const id = mobileSelection(typeof body.id === 'string' ? body.id : null);
          if (!id || typeof body.status !== 'string' || !['accepted', 'preparing', 'ready', 'completed'].includes(body.status)
            || typeof body.updatedAt !== 'string' || !Number.isFinite(Date.parse(body.updatedAt))) throw new RequestError('Invalid order update. Refresh this order.');
          const result = await changeOrderWorkspaceStatus(id, body.updatedAt, body.status, '', business.id);
          return response(result, result.success ? 200 : 409);
        }
      }
      return response({ error: 'Feature not found.' }, 404);
    });
  } catch (error) {
    if (error instanceof MobileSelectionError) return response({ error: error.message }, 400);
    if (error instanceof RequestError) return response({ error: error.message }, error.status);
    const digest = (error as { digest?: string })?.digest;
    if (digest?.startsWith('NEXT_REDIRECT')) return response({ error: 'Workspace access is unavailable. Check your account and subscription on the website.' }, 403);
    console.error('Mobile request failed:', error instanceof Error ? error.message : 'Unknown error');
    return response({ error: 'Unable to load this workspace. Check your branch access or try again.' }, 503);
  }
}
export async function GET(request: Request, context: { params: Promise<{ feature: string }> }) {
  return handle(request, (await context.params).feature);
}
export async function POST(request: Request, context: { params: Promise<{ feature: string }> }) {
  return handle(request, (await context.params).feature);
}
