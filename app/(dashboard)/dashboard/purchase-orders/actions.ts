"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/branch-server";

function text(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" && value.trim()
    ? value.trim()
    : null;
}

export async function createPurchaseOrder(formData: FormData) {
  const business = await requirePermission("purchases.create");
  const supabase = await createClient();

  const supplierId = text(formData, "supplierId");
  const itemsRaw = text(formData, "items");
  const requestedStatus = text(formData, "submissionStatus") ?? "draft";
  const status = requestedStatus === "sent" ? "sent" : "draft";

  if (!supplierId) {
    throw new Error("Select a supplier before creating the purchase order.");
  }

  if (!itemsRaw) {
    throw new Error("Add at least one product.");
  }

  let items: {
    productId: string;
    quantity: number;
    unitCost: number;
  }[];

  try {
    items = JSON.parse(itemsRaw) as typeof items;
  } catch {
    throw new Error("The purchase order items could not be read.");
  }

  if (!Array.isArray(items) || !items.length) {
    throw new Error("Add at least one product.");
  }

  const ids = [...new Set(items.map((item) => item.productId))];

  if (ids.length !== items.length) {
    throw new Error("Each product can only appear once on a purchase order.");
  }

  const { data: products, error: productError } = await supabase
    .from("branch_products")
    .select("id,name,sku")
    .eq("business_id", business.id)
    .in("id", ids);

  if (productError) {
    throw new Error(productError.message);
  }

  const productMap = new Map((products ?? []).map((product) => [product.id, product]));

  const { data: supplier, error: supplierError } = await supabase
    .from("suppliers")
    .select("id,name,is_active")
    .eq("business_id", business.id)
    .eq("id", supplierId)
    .maybeSingle();

  if (supplierError) {
    throw new Error(supplierError.message);
  }

  if (!supplier || !supplier.is_active) {
    throw new Error("Supplier not found or no longer active.");
  }

  const validItems = items.map((item) => {
    const product = productMap.get(item.productId);
    const quantity = Number(item.quantity);
    const unitCost = Number(item.unitCost);

    if (
      !product ||
      !Number.isInteger(quantity) ||
      quantity <= 0 ||
      !Number.isFinite(unitCost) ||
      unitCost < 0
    ) {
      throw new Error("Invalid purchase order line.");
    }

    return {
      product,
      quantity,
      unitCost,
    };
  });

  const subtotal = validItems.reduce(
    (sum, item) => sum + item.quantity * item.unitCost,
    0,
  );

  const poNumber = `PO-${new Date()
    .toISOString()
    .slice(0, 10)
    .replaceAll("-", "")}-${Math.random()
    .toString(36)
    .slice(2, 7)
    .toUpperCase()}`;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: purchaseOrder, error } = await supabase
    .from("purchase_orders")
    .insert({
      business_id: business.id,
      supplier_id: supplierId,
      supplier_name: supplier.name,
      po_number: poNumber,
      reference_number: text(formData, "referenceNumber"),
      order_date:
        text(formData, "orderDate") ?? new Date().toISOString().slice(0, 10),
      expected_date: text(formData, "expectedDate"),
      notes: text(formData, "notes"),
      status,
      subtotal,
      total: subtotal,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const { error: itemError } = await supabase
    .from("purchase_order_items")
    .insert(
      validItems.map((item) => ({
        business_id: business.id,
        purchase_order_id: purchaseOrder.id,
        product_id: item.product.id,
        product_name: item.product.name,
        sku: item.product.sku,
        ordered_quantity: item.quantity,
        unit_cost: item.unitCost,
      })),
    );

  if (itemError) {
    await supabase
      .from("purchase_orders")
      .delete()
      .eq("id", purchaseOrder.id)
      .eq("business_id", business.id);

    throw new Error(itemError.message);
  }

  revalidatePath("/dashboard/purchase-orders");
  redirect(`/dashboard/purchase-orders/${purchaseOrder.id}`);
}

export async function setPurchaseOrderStatus(formData: FormData) {
  const id = text(formData, "id");
  const status = text(formData, "status");

  if (!id || !status || !["draft", "sent", "cancelled"].includes(status)) {
    throw new Error("Invalid status.");
  }

  const business = await requirePermission(status === "cancelled" ? "purchases.cancel" : "purchases.update");

  const supabase = await createClient();
  const { error } = await supabase
    .from("purchase_orders")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("business_id", business.id)
    .in("status", ["draft", "sent"]);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/dashboard/purchase-orders/${id}`);
  revalidatePath("/dashboard/purchase-orders");
}

export async function receivePurchaseOrder(formData: FormData) {
  const business = await requirePermission("purchases.update");
  const id = text(formData, "id");
  const raw = text(formData, "receipts");

  if (!id || !raw) {
    throw new Error("Nothing to receive.");
  }

  const receipts = JSON.parse(raw);
  const supabase = await createClient();
  const { error } = await supabase.rpc("tenh_run_branch_stock", {p_business: business.id, p_operation: "receive_purchase_order", p_payload: {
    p_purchase_order_id: id,
    p_receipts: receipts,
  }});

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/dashboard/purchase-orders/${id}`);
  revalidatePath("/dashboard/purchase-orders");
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/low-stock");
}
