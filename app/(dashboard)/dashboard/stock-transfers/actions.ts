"use server";

import { revalidatePath } from "next/cache";

import { createAuditLog } from "@/lib/audit/create-audit-log";
import { requirePermission } from "@/lib/auth/require-permission";
import { assertBranchOperation } from "@/lib/subscriptions/branch-limits";
import { createClient } from "@/lib/supabase/server";

function getText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

type DraftItemInput = {
  productId: string;
  quantity: number;
};

function getDraftItems(formData: FormData): DraftItemInput[] {
  const itemsJson = getText(formData, "itemsJson");

  if (itemsJson) {
    let parsed: unknown;

    try {
      parsed = JSON.parse(itemsJson);
    } catch {
      throw new Error("Transfer items could not be read. Please add the items again.");
    }

    if (!Array.isArray(parsed)) {
      throw new Error("Transfer items are invalid.");
    }

    const quantities = new Map<string, number>();

    for (const rawItem of parsed) {
      if (!rawItem || typeof rawItem !== "object") {
        throw new Error("Transfer items are invalid.");
      }

      const productId =
        "productId" in rawItem && typeof rawItem.productId === "string"
          ? rawItem.productId.trim()
          : "";
      const quantity =
        "quantity" in rawItem ? Number(rawItem.quantity) : Number.NaN;

      if (!productId || !Number.isInteger(quantity) || quantity <= 0) {
        throw new Error("Each transfer item needs a product and a positive quantity.");
      }

      quantities.set(productId, (quantities.get(productId) ?? 0) + quantity);
    }

    return Array.from(quantities, ([productId, quantity]) => ({
      productId,
      quantity,
    }));
  }

  // Backward-compatible single-item input for any older caller.
  const productId = getText(formData, "productId");
  const quantity = Number(getText(formData, "quantity"));

  if (productId && Number.isInteger(quantity) && quantity > 0) {
    return [{ productId, quantity }];
  }

  return [];
}


async function assertSourceProducts(businessId: string, sourceId: string, destinationId: string, items: DraftItemInput[]) {
  await assertBranchOperation(businessId, sourceId);
  await assertBranchOperation(businessId, destinationId);
  const db = await createClient();
  const {data, error} = await db.from("product_location_stock").select("product_id,quantity").eq("business_id",businessId).eq("location_id",sourceId).in("product_id",items.map(i=>i.productId));
  if(error) throw new Error("Unable to verify stock in the source branch.");
  const stock = new Map((data ?? []).map(row=>[row.product_id, Number(row.quantity)]));
  if(items.some(item=>!stock.has(item.productId) || item.quantity > (stock.get(item.productId) ?? 0))) throw new Error("Choose products with enough stock in the source branch.");
}
export async function createTransfer(formData: FormData) {
  const business = await requirePermission("transfers.manage");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Login required.");
  }

  const sourceLocationId = getText(formData, "sourceLocationId");
  const destinationLocationId = getText(formData, "destinationLocationId");
  const note = getText(formData, "note") || null;
  const items = getDraftItems(formData);

  if (!sourceLocationId || !destinationLocationId) {
    throw new Error("Choose the From Branch and To Branch.");
  }

  if (sourceLocationId === destinationLocationId) {
    throw new Error("From Branch and To Branch must be different.");
  }

  if (items.length === 0) {
    throw new Error("Add at least one product / variant before creating the draft.");
  }

  await assertSourceProducts(business.id, sourceLocationId, destinationLocationId, items);
  const locationIds = [sourceLocationId, destinationLocationId];
  const { data: validLocations, error: locationError } = await supabase
    .from("business_locations")
    .select("id")
    .eq("business_id", business.id)
    .eq("is_active", true)
    .in("id", locationIds);

  if (locationError) {
    throw new Error(locationError.message);
  }

  if ((validLocations ?? []).length !== 2) {
    throw new Error("One of the selected branches is no longer available.");
  }

  const productIds = items.map((item) => item.productId);
  const { data: validProducts, error: productError } = await supabase
    .from("products")
    .select("id")
    .eq("business_id", business.id)
    .eq("is_active", true)
    .in("id", productIds);

  if (productError) {
    throw new Error(productError.message);
  }

  if ((validProducts ?? []).length !== productIds.length) {
    throw new Error("One or more selected products are no longer available.");
  }

  const transferNumber = `TR-${Date.now().toString(36).toUpperCase()}`;
  const { data: transfer, error: transferError } = await supabase
    .from("stock_transfers")
    .insert({
      business_id: business.id,
      transfer_number: transferNumber,
      source_location_id: sourceLocationId,
      destination_location_id: destinationLocationId,
      note,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (transferError) {
    throw new Error(transferError.message);
  }

  const { error: itemError } = await supabase.from("stock_transfer_items").insert(
    items.map((item) => ({
      transfer_id: transfer.id,
      business_id: business.id,
      product_id: item.productId,
      quantity: item.quantity,
    })),
  );

  if (itemError) {
    // Avoid leaving an empty draft when the item insert fails.
    await supabase
      .from("stock_transfers")
      .delete()
      .eq("id", transfer.id)
      .eq("business_id", business.id)
      .eq("status", "draft");

    throw new Error(itemError.message);
  }

  await createAuditLog({
    action: "create",
    entityType: "inventory",
    entityId: transfer.id,
    description: `Created stock transfer ${transferNumber}`,
    metadata: {
      source: sourceLocationId,
      destination: destinationLocationId,
      item_count: items.length,
      total_quantity: items.reduce((sum, item) => sum + item.quantity, 0),
    },
  });

  revalidatePath("/dashboard/stock-transfers");

  return {
    id: transfer.id,
    transferNumber,
  };
}

export async function sendTransfer(formData: FormData) {
  const business = await requirePermission("transfers.manage");
  const transferId = getText(formData, "transferId");
  const supabase = await createClient();
  const { error } = await supabase.rpc("send_stock_transfer", {
    p_business_id: business.id,
    p_transfer_id: transferId,
  });

  if (error) {
    throw new Error(error.message);
  }

  await createAuditLog({
    action: "update",
    entityType: "inventory",
    entityId: transferId,
    description: "Sent stock transfer",
  });

  revalidatePath("/dashboard/stock-transfers");
}

export async function receiveTransfer(formData: FormData) {
  const business = await requirePermission("transfers.manage");
  const transferId = getText(formData, "transferId");
  const supabase = await createClient();
  const { error } = await supabase.rpc("receive_stock_transfer", {
    p_business_id: business.id,
    p_transfer_id: transferId,
  });

  if (error) {
    throw new Error(error.message);
  }

  await createAuditLog({
    action: "update",
    entityType: "inventory",
    entityId: transferId,
    description: "Received stock transfer",
  });

  revalidatePath("/dashboard/stock-transfers");
  revalidatePath("/dashboard/inventory");
}

export async function addTransferItem(formData: FormData) {
  const business = await requirePermission("transfers.manage");
  const transferId = getText(formData, "transferId");
  const productId = getText(formData, "productId");
  const quantity = Number(getText(formData, "quantity"));

  if (!transferId || !productId || !Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("Choose a product and quantity.");
  }

  const supabase = await createClient();
  const { data: transfer } = await supabase
    .from("stock_transfers")
    .select("id,source_location_id,destination_location_id")
    .eq("id", transferId)
    .eq("business_id", business.id)
    .eq("status", "draft")
    .maybeSingle();

  if (!transfer) {
    throw new Error("Draft transfer not found.");
  }

  await assertSourceProducts(business.id, transfer.source_location_id, transfer.destination_location_id, [{productId,quantity}]);
  const { error } = await supabase.from("stock_transfer_items").upsert(
    {
      transfer_id: transferId,
      business_id: business.id,
      product_id: productId,
      quantity,
    },
    { onConflict: "transfer_id,product_id" },
  );

  if (error) {
    throw new Error(error.message);
  }

  await createAuditLog({
    action: "update",
    entityType: "inventory",
    entityId: transferId,
    description: "Added item to stock transfer",
    metadata: { product: productId, quantity },
  });

  revalidatePath("/dashboard/stock-transfers");
}


export async function updateTransferDraft(formData: FormData) {
  const business = await requirePermission("transfers.manage");
  const transferId = getText(formData, "transferId");
  const sourceLocationId = getText(formData, "sourceLocationId");
  const destinationLocationId = getText(formData, "destinationLocationId");
  const note = getText(formData, "note") || null;
  const items = getDraftItems(formData);

  if (!transferId) {
    throw new Error("Transfer ID is required.");
  }

  if (!sourceLocationId || !destinationLocationId) {
    throw new Error("Choose the From Branch and To Branch.");
  }

  if (sourceLocationId === destinationLocationId) {
    throw new Error("From Branch and To Branch must be different.");
  }

  if (items.length === 0) {
    throw new Error("A draft transfer needs at least one product / variant.");
  }

  const supabase = await createClient();

  const { data: transfer, error: transferError } = await supabase
    .from("stock_transfers")
    .select("id, transfer_number, status")
    .eq("id", transferId)
    .eq("business_id", business.id)
    .eq("status", "draft")
    .maybeSingle();

  if (transferError) {
    throw new Error(transferError.message);
  }

  if (!transfer) {
    throw new Error("Only draft transfers can be edited.");
  }

  await assertSourceProducts(business.id, sourceLocationId, destinationLocationId, items);
  const locationIds = [sourceLocationId, destinationLocationId];
  const { data: validLocations, error: locationError } = await supabase
    .from("business_locations")
    .select("id")
    .eq("business_id", business.id)
    .eq("is_active", true)
    .in("id", locationIds);

  if (locationError) {
    throw new Error(locationError.message);
  }

  if ((validLocations ?? []).length !== 2) {
    throw new Error("One of the selected branches is no longer available.");
  }

  const productIds = items.map((item) => item.productId);
  const { data: validProducts, error: productError } = await supabase
    .from("products")
    .select("id")
    .eq("business_id", business.id)
    .eq("is_active", true)
    .in("id", productIds);

  if (productError) {
    throw new Error(productError.message);
  }

  if ((validProducts ?? []).length !== productIds.length) {
    throw new Error("One or more selected products are no longer available.");
  }

  const { data: currentItems, error: currentItemsError } = await supabase
    .from("stock_transfer_items")
    .select("product_id")
    .eq("transfer_id", transferId)
    .eq("business_id", business.id);

  if (currentItemsError) {
    throw new Error(currentItemsError.message);
  }

  const { error: updateTransferError } = await supabase
    .from("stock_transfers")
    .update({
      source_location_id: sourceLocationId,
      destination_location_id: destinationLocationId,
      note,
      updated_at: new Date().toISOString(),
    })
    .eq("id", transferId)
    .eq("business_id", business.id)
    .eq("status", "draft");

  if (updateTransferError) {
    throw new Error(updateTransferError.message);
  }

  const { error: upsertError } = await supabase
    .from("stock_transfer_items")
    .upsert(
      items.map((item) => ({
        transfer_id: transferId,
        business_id: business.id,
        product_id: item.productId,
        quantity: item.quantity,
      })),
      { onConflict: "transfer_id,product_id" },
    );

  if (upsertError) {
    throw new Error(upsertError.message);
  }

  const desiredIds = new Set(productIds);
  const removedIds = (currentItems ?? [])
    .map((item) => item.product_id)
    .filter((productId) => !desiredIds.has(productId));

  if (removedIds.length > 0) {
    const { error: deleteItemsError } = await supabase
      .from("stock_transfer_items")
      .delete()
      .eq("transfer_id", transferId)
      .eq("business_id", business.id)
      .in("product_id", removedIds);

    if (deleteItemsError) {
      throw new Error(deleteItemsError.message);
    }
  }

  await createAuditLog({
    action: "update",
    entityType: "inventory",
    entityId: transferId,
    description: `Updated stock transfer ${transfer.transfer_number}`,
    metadata: {
      source: sourceLocationId,
      destination: destinationLocationId,
      item_count: items.length,
      total_quantity: items.reduce((sum, item) => sum + item.quantity, 0),
    },
  });

  revalidatePath("/dashboard/stock-transfers");
}

export async function deleteDraftTransfer(formData: FormData) {
  const business = await requirePermission("transfers.manage");
  const transferId = getText(formData, "transferId");

  if (!transferId) {
    throw new Error("Transfer ID is required.");
  }

  const supabase = await createClient();

  const { data: transfer, error: transferError } = await supabase
    .from("stock_transfers")
    .select("id, transfer_number, status")
    .eq("id", transferId)
    .eq("business_id", business.id)
    .eq("status", "draft")
    .maybeSingle();

  if (transferError) {
    throw new Error(transferError.message);
  }

  if (!transfer) {
    throw new Error("Only draft transfers can be deleted.");
  }

  const { error: deleteError } = await supabase
    .from("stock_transfers")
    .delete()
    .eq("id", transferId)
    .eq("business_id", business.id)
    .eq("status", "draft");

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  await createAuditLog({
    action: "delete",
    entityType: "inventory",
    entityId: transferId,
    description: `Deleted stock transfer draft ${transfer.transfer_number}`,
  });

  revalidatePath("/dashboard/stock-transfers");
}
