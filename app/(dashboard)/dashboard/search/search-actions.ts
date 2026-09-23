"use server";

import { getCurrentBusiness } from "@/lib/business/get-current-business";
import { getEffectivePermissions } from "@/lib/auth/effective-permissions";
import { createClient } from "@/lib/supabase/server";
import type {
  GlobalSearchBranch,
  GlobalSearchInput,
  GlobalSearchKind,
  GlobalSearchResponse,
  GlobalSearchResult,
} from "./search-types";

const MAX_RESULTS_PER_TYPE = 30;

function safeTerm(value: string) {
  return value
    .slice(0, 100)
    .replace(/[,%()_*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function text(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function money(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }).format(amount)
    : "$0.00";
}

function addDetail(
  details: Array<{ label: string; value: string }>,
  label: string,
  value: unknown,
) {
  const normalized = text(value);
  if (normalized) details.push({ label, value: normalized });
}

function uniqueResults(results: GlobalSearchResult[]) {
  const seen = new Set<string>();
  return results.filter((result) => {
    const key = `${result.kind}:${result.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function settingResults(
  query: string,
  allowed: Array<{ kind: GlobalSearchKind; title: string; subtitle: string; href: string; keywords: string[] }>,
): GlobalSearchResult[] {
  const needle = query.toLowerCase();
  return allowed
    .filter((item) =>
      [item.title, item.subtitle, ...item.keywords]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    )
    .map((item, index) => ({
      id: `setting-${index}-${item.href}`,
      kind: item.kind,
      title: item.title,
      subtitle: item.subtitle,
      href: item.href,
      badge: "Setting",
      branchId: null,
      branchName: null,
      status: null,
      createdAt: null,
      amount: null,
      details: [
        { label: "Section", value: item.title },
        { label: "Description", value: item.subtitle },
      ],
    }));
}

export async function runGlobalSearch(
  input: GlobalSearchInput,
): Promise<GlobalSearchResponse> {
  const business = await getCurrentBusiness();
  const allowed = new Set(await getEffectivePermissions(business.id, business.role));
  const db = await createClient();
  const query = safeTerm(input?.query ?? "");
  const warnings: string[] = [];

  const { data: branchRows, error: branchError } = await db
    .from("business_locations")
    .select("id,name")
    .eq("business_id", business.id)
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });

  if (branchError) warnings.push("Branches could not be loaded for filtering.");
  const branches: GlobalSearchBranch[] = (branchRows ?? []).map((branch) => ({
    id: branch.id,
    name: branch.name,
  }));
  const branchMap = new Map(branches.map((branch) => [branch.id, branch.name]));

  if (!query) return { query, results: [], branches, warnings };

  const orderTerm = safeTerm(query.replace(/^order\s*#?/i, "")) || query;
  const productTerm = safeTerm(query.replace(/^(sku|barcode|product)\s*:?[ ]*/i, "")) || query;
  const purchaseOrderTerm = safeTerm(query.replace(/^purchase\s+order\s*:?[ ]*/i, "")) || query;
  const transferTerm = safeTerm(query.replace(/^transfer\s*:?[ ]*/i, "")) || query;
  const wantsLowStock = /^low\s+stock(?:\s+products?)?$/i.test(query);

  const results: GlobalSearchResult[] = [];
  const tasks: Promise<void>[] = [];

  let matchedCustomerIds: string[] = [];

  if (allowed.has("customers.view")) {
    tasks.push(
      (async () => {
        const { data, error } = await db
          .from("customers")
          .select("id,name,phone,email,address,created_at,loyalty_points")
          .eq("business_id", business.id)
          .or(
            `name.ilike.%${query}%,phone.ilike.%${query}%,email.ilike.%${query}%,address.ilike.%${query}%`,
          )
          .order("created_at", { ascending: false })
          .limit(MAX_RESULTS_PER_TYPE);

        if (error) {
          warnings.push("Customers could not be searched.");
          return;
        }
        matchedCustomerIds = (data ?? []).map((customer) => customer.id);
        for (const customer of data ?? []) {
          const details: Array<{ label: string; value: string }> = [];
          addDetail(details, "Phone", customer.phone);
          addDetail(details, "Email", customer.email);
          addDetail(details, "Address", customer.address);
          addDetail(details, "Loyalty points", customer.loyalty_points);
          results.push({
            id: customer.id,
            kind: "customer",
            title: customer.name || "Customer",
            subtitle: [customer.phone, customer.email].filter(Boolean).join(" · ") || "Customer account",
            href: `/dashboard/customers/${customer.id}`,
            badge: "Customer",
            branchId: null,
            branchName: null,
            status: null,
            createdAt: customer.created_at,
            amount: null,
            details,
          });
        }
      })(),
    );
  }

  if (allowed.has("products.view")) {
    tasks.push(
      (async () => {
        const productQuery = db
          .from("products")
          .select(
            "id,name,sku,barcode,size,color,selling_price,stock_quantity,low_stock_quantity,is_active,created_at",
          )
          .eq("business_id", business.id);
        const { data: productRows, error } = wantsLowStock
          ? await productQuery.order("stock_quantity", { ascending: true }).limit(100)
          : await productQuery
              .or(
                `name.ilike.%${productTerm}%,sku.ilike.%${productTerm}%,barcode.ilike.%${productTerm}%,color.ilike.%${productTerm}%,size.ilike.%${productTerm}%`,
              )
              .order("created_at", { ascending: false })
              .limit(MAX_RESULTS_PER_TYPE);
        const data = wantsLowStock
          ? (productRows ?? [])
              .filter((product) => Number(product.stock_quantity ?? 0) <= Number(product.low_stock_quantity ?? 0))
              .slice(0, MAX_RESULTS_PER_TYPE)
          : productRows ?? [];

        if (error) {
          warnings.push("Products could not be searched.");
          return;
        }
        for (const product of data ?? []) {
          const price = Number(product.selling_price ?? 0);
          const details: Array<{ label: string; value: string }> = [];
          addDetail(details, "SKU", product.sku);
          addDetail(details, "Barcode", product.barcode);
          addDetail(details, "Variant", [product.color, product.size].filter(Boolean).join(" / "));
          addDetail(details, "Stock", product.stock_quantity);
          addDetail(details, "Price", money(price));
          results.push({
            id: product.id,
            kind: "product",
            title: product.name || "Product",
            subtitle: [product.sku, `${Number(product.stock_quantity ?? 0)} in stock`, money(price)]
              .filter(Boolean)
              .join(" · "),
            href: allowed.has("products.update")
              ? `/dashboard/products/${product.id}/edit`
              : "/dashboard/products",
            badge: "Product",
            branchId: null,
            branchName: null,
            status: product.is_active ? "active" : "inactive",
            createdAt: product.created_at,
            amount: price,
            details,
          });
        }
      })(),
    );
  }

  if (allowed.has("suppliers.manage")) {
    tasks.push(
      (async () => {
        const { data, error } = await db
          .from("suppliers")
          .select("id,name,contact_person,phone,email,address,is_active,created_at")
          .eq("business_id", business.id)
          .or(
            `name.ilike.%${query}%,contact_person.ilike.%${query}%,phone.ilike.%${query}%,email.ilike.%${query}%`,
          )
          .order("created_at", { ascending: false })
          .limit(MAX_RESULTS_PER_TYPE);

        if (error) {
          warnings.push("Suppliers could not be searched.");
          return;
        }
        for (const supplier of data ?? []) {
          const details: Array<{ label: string; value: string }> = [];
          addDetail(details, "Contact", supplier.contact_person);
          addDetail(details, "Phone", supplier.phone);
          addDetail(details, "Email", supplier.email);
          addDetail(details, "Address", supplier.address);
          results.push({
            id: supplier.id,
            kind: "supplier",
            title: supplier.name || "Supplier",
            subtitle: [supplier.phone, supplier.contact_person].filter(Boolean).join(" · ") || "Supplier account",
            href: "/dashboard/suppliers",
            badge: "Supplier",
            branchId: null,
            branchName: null,
            status: supplier.is_active ? "active" : "inactive",
            createdAt: supplier.created_at,
            amount: null,
            details,
          });
        }
      })(),
    );
  }

  if (allowed.has("purchases.view")) {
    tasks.push(
      (async () => {
        const { data, error } = await db
          .from("purchase_orders")
          .select(
            "id,po_number,supplier_name,status,reference_number,total,order_date,created_at",
          )
          .eq("business_id", business.id)
          .or(
            `po_number.ilike.%${purchaseOrderTerm}%,supplier_name.ilike.%${purchaseOrderTerm}%,reference_number.ilike.%${purchaseOrderTerm}%`,
          )
          .order("created_at", { ascending: false })
          .limit(MAX_RESULTS_PER_TYPE);

        if (error) {
          warnings.push("Purchase orders could not be searched.");
          return;
        }
        for (const order of data ?? []) {
          const amount = Number(order.total ?? 0);
          const details: Array<{ label: string; value: string }> = [];
          addDetail(details, "Supplier", order.supplier_name);
          addDetail(details, "Reference", order.reference_number);
          addDetail(details, "Status", order.status);
          addDetail(details, "Order date", order.order_date);
          addDetail(details, "Total", money(amount));
          results.push({
            id: order.id,
            kind: "purchase_order",
            title: order.po_number || "Purchase order",
            subtitle: [order.supplier_name, order.order_date, money(amount)].filter(Boolean).join(" · "),
            href: `/dashboard/purchase-orders/${order.id}`,
            badge: "Purchase Order",
            branchId: null,
            branchName: null,
            status: order.status,
            createdAt: order.created_at,
            amount,
            details,
          });
        }
      })(),
    );
  }

  if (allowed.has("transfers.manage")) {
    tasks.push(
      (async () => {
        const { data, error } = await db
          .from("stock_transfers")
          .select(
            "id,transfer_number,status,note,source_location_id,destination_location_id,created_at",
          )
          .eq("business_id", business.id)
          .or(`transfer_number.ilike.%${transferTerm}%,note.ilike.%${transferTerm}%`)
          .order("created_at", { ascending: false })
          .limit(MAX_RESULTS_PER_TYPE);

        if (error) {
          warnings.push("Stock transfers could not be searched.");
          return;
        }
        for (const transfer of data ?? []) {
          const sourceName = branchMap.get(transfer.source_location_id) || "Unknown branch";
          const destinationName = branchMap.get(transfer.destination_location_id) || "Unknown branch";
          const details: Array<{ label: string; value: string }> = [];
          addDetail(details, "From", sourceName);
          addDetail(details, "To", destinationName);
          addDetail(details, "Status", transfer.status);
          addDetail(details, "Note", transfer.note);
          results.push({
            id: transfer.id,
            kind: "transfer",
            title: transfer.transfer_number || "Stock transfer",
            subtitle: `${sourceName} → ${destinationName} · ${transfer.status || ""}`,
            href: "/dashboard/stock-transfers",
            badge: "Transfer",
            branchId: transfer.source_location_id,
            branchName: sourceName,
            status: transfer.status,
            createdAt: transfer.created_at,
            amount: null,
            details,
          });
        }
      })(),
    );
  }

  if (allowed.has("credit.manage")) {
    tasks.push(
      (async () => {
        const { data, error } = await db
          .from("customers")
          .select(
            "id,name,phone,customer_credit_accounts(balance,credit_limit,payment_due_date,updated_at)",
          )
          .eq("business_id", business.id)
          .or(`name.ilike.%${query}%,phone.ilike.%${query}%`)
          .limit(MAX_RESULTS_PER_TYPE);

        if (error) {
          warnings.push("Credit accounts could not be searched.");
          return;
        }
        for (const customer of data ?? []) {
          const account = Array.isArray(customer.customer_credit_accounts)
            ? customer.customer_credit_accounts[0]
            : customer.customer_credit_accounts;
          if (!account || Number(account.balance ?? 0) <= 0) continue;
          const balance = Number(account.balance ?? 0);
          const details: Array<{ label: string; value: string }> = [];
          addDetail(details, "Customer", customer.name);
          addDetail(details, "Phone", customer.phone);
          addDetail(details, "Balance", money(balance));
          addDetail(details, "Credit limit", money(account.credit_limit));
          addDetail(details, "Payment due", account.payment_due_date);
          results.push({
            id: customer.id,
            kind: "credit",
            title: `${customer.name || "Customer"} credit account`,
            subtitle: `Balance ${money(balance)}${account.payment_due_date ? ` · Due ${account.payment_due_date}` : ""}`,
            href: `/dashboard/customers/${customer.id}`,
            badge: "Credit",
            branchId: null,
            branchName: null,
            status: balance > 0 ? "open" : "settled",
            createdAt: account.updated_at ?? null,
            amount: balance,
            details,
          });
        }
      })(),
    );
  }

  await Promise.all(tasks);

  if (allowed.has("orders.view")) {
    const directQuery = db
      .from("orders")
      .select(
        "id,order_number,customer_id,guest_name,guest_phone,total,status,payment_status,order_source,created_at,location_id",
      )
      .eq("business_id", business.id)
      .is("archived_at", null)
      .or(
        `order_number.ilike.%${orderTerm}%,guest_name.ilike.%${orderTerm}%,guest_phone.ilike.%${orderTerm}%`,
      )
      .order("created_at", { ascending: false })
      .limit(MAX_RESULTS_PER_TYPE);

    const customerOrderQuery = matchedCustomerIds.length
      ? db
          .from("orders")
          .select(
            "id,order_number,customer_id,guest_name,guest_phone,total,status,payment_status,order_source,created_at,location_id",
          )
          .eq("business_id", business.id)
          .is("archived_at", null)
          .in("customer_id", matchedCustomerIds.slice(0, 30))
          .order("created_at", { ascending: false })
          .limit(MAX_RESULTS_PER_TYPE)
      : Promise.resolve({ data: [], error: null });

    const [direct, byCustomer] = await Promise.all([directQuery, customerOrderQuery]);
    if (direct.error || byCustomer.error) warnings.push("Some orders could not be searched.");

    const customersById = new Map(
      results
        .filter((result) => result.kind === "customer")
        .map((result) => [result.id, result.title]),
    );

    const rows = [...(direct.data ?? []), ...(byCustomer.data ?? [])];
    const seenOrders = new Set<string>();
    for (const order of rows) {
      if (seenOrders.has(order.id)) continue;
      seenOrders.add(order.id);
      const customerName =
        (order.customer_id ? customersById.get(order.customer_id) : null) ||
        order.guest_name ||
        "Walk-in customer";
      const total = Number(order.total ?? 0);
      const branchName = order.location_id ? branchMap.get(order.location_id) || "Unknown branch" : "Unassigned";
      const details: Array<{ label: string; value: string }> = [];
      addDetail(details, "Customer", customerName);
      addDetail(details, "Phone", order.guest_phone);
      addDetail(details, "Status", order.status);
      addDetail(details, "Payment", order.payment_status);
      addDetail(details, "Source", order.order_source);
      addDetail(details, "Branch", branchName);
      addDetail(details, "Total", money(total));
      results.push({
        id: order.id,
        kind: "order",
        title: order.order_number || "Order",
        subtitle: `${customerName} · ${order.status || ""} · ${money(total)}`,
        href: `/dashboard/orders/${order.id}`,
        badge: "Order",
        branchId: order.location_id,
        branchName,
        status: order.status,
        createdAt: order.created_at,
        amount: total,
        details,
      });
    }
  }

  const allowedSettings: Array<{
    kind: GlobalSearchKind;
    title: string;
    subtitle: string;
    href: string;
    keywords: string[];
  }> = [];

  if (allowed.has("business.view")) {
    allowedSettings.push({
      kind: "setting",
      title: "Settings: General",
      subtitle: "Business, appearance and account settings",
      href: "/dashboard/settings",
      keywords: ["settings", "business", "general", "appearance"],
    });
  }
  if (business.role === "owner") {
    allowedSettings.push(
      {
        kind: "setting",
        title: "Settings: POS Currency",
        subtitle: "Configure POS currency and exchange-rate display",
        href: "/dashboard/settings/pos-currency",
        keywords: ["currency", "exchange", "usd", "khr", "riel", "dollar"],
      },
      {
        kind: "setting",
        title: "Settings: Tax & POS Rates",
        subtitle: "Configure tax rate and POS loyalty redemption values",
        href: "/dashboard/pos",
        keywords: ["tax", "tax rate", "pos rate", "loyalty rate"],
      },
    );
  }
  if (allowed.has("locations.manage")) {
    allowedSettings.push({
      kind: "setting",
      title: "Settings: Branches",
      subtitle: "Manage branches and operating locations",
      href: "/dashboard/locations",
      keywords: ["branch", "location", "store"],
    });
  }
  if (allowed.has("users.view")) {
    allowedSettings.push({
      kind: "setting",
      title: "Settings: User & Manage User",
      subtitle: "Manage team members, roles and access",
      href: "/dashboard/settings/users",
      keywords: ["user", "staff", "cashier", "manager", "permissions", "role"],
    });
  }
  if (allowed.has("business.update")) {
    allowedSettings.push(
      {
        kind: "setting",
        title: "Settings: Printer",
        subtitle: "Manage receipt and label printer preferences",
        href: "/dashboard/settings/printers",
        keywords: ["printer", "receipt printer", "label printer"],
      },
      {
        kind: "setting",
        title: "Settings: Receipt",
        subtitle: "Customize receipt template, logo and printed information",
        href: "/dashboard/settings/receipts",
        keywords: ["receipt", "logo", "template", "print"],
      },
    );
  }

  results.push(...settingResults(query, allowedSettings));

  const normalized = uniqueResults(results).sort((a, b) => {
    const priority: Record<GlobalSearchKind, number> = {
      order: 0,
      product: 1,
      customer: 2,
      supplier: 3,
      purchase_order: 4,
      transfer: 5,
      credit: 6,
      setting: 7,
    };
    const byKind = priority[a.kind] - priority[b.kind];
    if (byKind) return byKind;
    return (b.createdAt || "").localeCompare(a.createdAt || "");
  });

  return { query, results: normalized.slice(0, 180), branches, warnings };
}
