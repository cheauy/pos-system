"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { createAuditLog } from "@/lib/audit/create-audit-log";
import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/branch-server";

const RETURN_IMPORT_HEADERS = [
  "order_number",
  "return_type",
  "reason",
  "status",
  "refund_amount",
  "product_name",
  "quantity",
  "returned_at",
] as const;

const MAX_IMPORT_ROWS = 1000;
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["refund", "exchange"]);
const ALLOWED_STATUSES = new Set(["pending", "approved", "refunded", "exchanged", "rejected"]);

export async function exportReturnsCsv() {
  const business = await requirePermission("orders.view");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("returns")
    .select(`
      return_number,
      reason,
      refund_amount,
      created_at,
      status,
      return_type,
      import_product_name,
      import_quantity,
      orders (order_number),
      return_items (product_name, quantity)
    `)
    .eq("business_id", business.id)
    .order("created_at", { ascending: true })
    .limit(10000);

  if (error) throw new Error(error.message);

  const lines = [RETURN_IMPORT_HEADERS.join(",")];

  for (const record of data ?? []) {
    const order = Array.isArray(record.orders) ? record.orders[0] : record.orders;
    const firstItem = Array.isArray(record.return_items) ? record.return_items[0] : null;
    lines.push(
      [
        order?.order_number ?? "",
        record.return_type ?? "refund",
        record.reason,
        record.status ?? "refunded",
        Number(record.refund_amount ?? 0).toFixed(2),
        record.import_product_name ?? firstItem?.product_name ?? "",
        record.import_quantity ?? firstItem?.quantity ?? "",
        record.created_at,
      ]
        .map(csvEscape)
        .join(","),
    );
  }

  return {
    filename: `tenh-returns-${new Date().toISOString().slice(0, 10)}.csv`,
    content: lines.join("\r\n"),
  };
}

export async function importReturnsCsv(formData: FormData) {
  const business = await requirePermission("orders.return");
  const file = formData.get("file");

  if (!(file instanceof File)) throw new Error("Choose a CSV file to import.");
  if (file.size === 0) throw new Error("The selected CSV file is empty.");
  if (file.size > MAX_IMPORT_BYTES) throw new Error("CSV file must be 2 MB or smaller.");

  const text = (await file.text()).replace(/^\uFEFF/, "");
  const parsed = parseCsv(text);
  if (parsed.length < 2) throw new Error("CSV must include the template header and at least one return row.");

  const header = parsed[0].map((value) => value.trim().toLowerCase());
  if (
    header.length !== RETURN_IMPORT_HEADERS.length ||
    RETURN_IMPORT_HEADERS.some((expected, index) => header[index] !== expected)
  ) {
    throw new Error(`CSV columns must match exactly: ${RETURN_IMPORT_HEADERS.join(", ")}.`);
  }

  const rows = parsed.slice(1).filter((row) => row.some((value) => value.trim()));
  if (rows.length === 0) throw new Error("CSV does not contain any return rows.");
  if (rows.length > MAX_IMPORT_ROWS) throw new Error(`Import supports up to ${MAX_IMPORT_ROWS} returns at a time.`);

  const supabase = await createClient();
  const orderNumbers = [...new Set(rows.map((row) => row[0]?.trim()).filter(Boolean))];
  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select("id,order_number")
    .eq("business_id", business.id)
    .in("order_number", orderNumbers);

  if (ordersError) throw new Error(ordersError.message);
  const orderMap = new Map((orders ?? []).map((order) => [order.order_number, order.id]));

  const inserts = rows.map((row, index) => {
    const rowNumber = index + 2;
    const values = [...row];
    while (values.length < RETURN_IMPORT_HEADERS.length) values.push("");
    if (values.length > RETURN_IMPORT_HEADERS.length) throw new Error(`Row ${rowNumber} contains too many columns.`);

    const [orderNumberRaw, typeRaw, reasonRaw, statusRaw, refundRaw, productRaw, quantityRaw, dateRaw] = values;
    const orderNumber = orderNumberRaw.trim();
    const orderId = orderMap.get(orderNumber);
    if (!orderNumber || !orderId) throw new Error(`Row ${rowNumber}: order_number does not match an order in this business.`);

    const returnType = (typeRaw.trim().toLowerCase() || "refund");
    if (!ALLOWED_TYPES.has(returnType)) throw new Error(`Row ${rowNumber}: return_type must be refund or exchange.`);

    const status = (statusRaw.trim().toLowerCase() || (returnType === "exchange" ? "exchanged" : "refunded"));
    if (!ALLOWED_STATUSES.has(status)) throw new Error(`Row ${rowNumber}: invalid status.`);

    const reason = reasonRaw.trim();
    if (reason.length < 2 || reason.length > 300) throw new Error(`Row ${rowNumber}: reason must contain 2-300 characters.`);

    const refundAmount = Number(refundRaw.trim() || 0);
    if (!Number.isFinite(refundAmount) || refundAmount < 0 || refundAmount > 1000000) throw new Error(`Row ${rowNumber}: invalid refund_amount.`);

    const quantity = Number(quantityRaw.trim() || 1);
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 10000) throw new Error(`Row ${rowNumber}: quantity must be a positive whole number.`);

    const returnedAt = dateRaw.trim() || new Date().toISOString();
    const parsedDate = new Date(returnedAt);
    if (Number.isNaN(parsedDate.getTime())) throw new Error(`Row ${rowNumber}: returned_at is invalid.`);

    return {
      business_id: business.id,
      order_id: orderId,
      return_number: `IMP-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`,
      reason,
      refund_amount: Math.round(refundAmount * 100) / 100,
      created_at: parsedDate.toISOString(),
      status,
      return_type: returnType,
      source: "import",
      import_product_name: productRaw.trim() || null,
      import_quantity: productRaw.trim() ? quantity : null,
      refund_method: "historical_import",
      restock_status: "not_applicable",
    };
  });

  const { error } = await supabase.from("returns").insert(inserts);
  if (error) throw new Error(error.message);

  await createAuditLog({
    action: "return",
    entityType: "order",
    description: `Imported ${inserts.length} historical return records from CSV`,
    metadata: { imported: inserts.length, source: "csv" },
  });

  revalidatePath("/dashboard/returns");
  revalidatePath("/dashboard/reports");

  return { imported: inserts.length };
}

function csvEscape(value: unknown) {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) text = `"${text.replaceAll('"', '""')}"`;
  return text;
}

function parseCsv(input: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }

  if (quoted) throw new Error("CSV contains an unclosed quoted field.");
  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}
