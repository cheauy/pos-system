"use server";

import { parseCsv } from "@/lib/exports/import-files";
import { csvImportTemplates } from "@/lib/exports/import-catalog";
import { exportGroups } from "@/lib/exports/catalog";
import { exportBusinessData } from "./full-export-actions";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/branch-server";
import { getBranchContext } from "@/lib/branches/context";

export type ExportEntity =
  | "products"
  | "inventory"
  | "customers"
  | "orders"
  | "expenses"
  | "suppliers"
  | "shifts"
  | "credit";

export type ImportEntity = "products" | "inventory" | "customers" | "suppliers";
export type ImportMode = "insert" | "merge" | "update";

type ExportFormat = "csv" | "json";
type Row = Record<string, unknown>;

type ExportResult =
  | { ok: true; filename: string; mime: string; content: string; rowCount: number }
  | { ok: false; message: string };

export type ImportPreviewResult = {
  ok: boolean;
  message: string;
  rowCount: number;
  headers: string[];
  preview: Record<string, string | number | boolean | null>[];
  errors: string[];
  fingerprint?: string;
  inserted?: number;
  updated?: number;
  skipped?: number;
};

export type ImportCommitResult = {
  ok: boolean;
  message: string;
  inserted: number;
  updated: number;
  skipped: number;
};

const MAX_EXPORT_ROWS = 10_000;
const MAX_IMPORT_ROWS = 1_000;
const MAX_IMPORT_CHARS = 750_000;

function isRecord(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toRecords(value: unknown): Row[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
}

function csvEscape(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function recordsToCsv(rows: Row[]) {
  if (!rows.length) return "";
  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  return [
    keys.map(csvEscape).join(","),
    ...rows.map((row) => keys.map((key) => csvEscape(row[key])).join(",")),
  ].join("\n");
}

async function currentUserId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, userId: user.id };
}

async function recordTransfer(input: {
  businessId: string;
  direction: "export" | "import";
  entity: string;
  format: string;
  mode?: string | null;
  filename?: string | null;
  rowCount: number;
  status: "completed" | "failed";
  summary?: Row;
  errorMessage?: string | null;
}) {
  try {
    const { supabase, userId } = await currentUserId();
    const { error } = await supabase.from("data_transfer_jobs").insert({
      business_id: input.businessId,
      user_id: userId,
      direction: input.direction,
      entity: input.entity,
      format: input.format,
      mode: input.mode ?? null,
      filename: input.filename ?? null,
      row_count: Math.max(0, Math.trunc(input.rowCount)),
      status: input.status,
      summary: input.summary ?? {},
      error_message: input.errorMessage ?? null,
    });
    if (error && error.code !== "42P01") {
      console.error("Unable to record data transfer:", error.message);
    }
  } catch (error) {
    console.error("Unable to record data transfer:", error);
  }
}

async function fetchExportRows(entity: ExportEntity, businessId: string) {
  const supabase = await createClient();

  if (entity === "products") {
    const { data, error } = await supabase
      .from("branch_products")
      .select("id,name,sku,barcode,description,size,color,cost_price,selling_price,stock_quantity,low_stock_quantity,is_active,created_at,updated_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(MAX_EXPORT_ROWS);
    if (error) throw new Error(error.message);
    return toRecords(data);
  }

  if (entity === "inventory") {
    const [{ data: stock, error: stockError }, { data: products, error: productError }, { data: locations, error: locationError }] = await Promise.all([
      supabase.from("product_location_stock").select("location_id,product_id,quantity,low_stock_threshold,updated_at").eq("business_id", businessId).limit(MAX_EXPORT_ROWS),
      supabase.from("branch_products").select("id,sku,name,size,color").eq("business_id", businessId).limit(MAX_EXPORT_ROWS),
      supabase.from("business_locations").select("id,code,name,is_active").eq("business_id", businessId).limit(500),
    ]);
    if (stockError) throw new Error(stockError.message);
    if (productError) throw new Error(productError.message);
    if (locationError) throw new Error(locationError.message);
    const productMap = new Map((products ?? []).map((product) => [product.id, product]));
    const locationMap = new Map((locations ?? []).map((location) => [location.id, location]));
    return (stock ?? []).map((row) => {
      const product = productMap.get(row.product_id);
      const location = locationMap.get(row.location_id);
      return {
        branch_code: location?.code ?? "",
        branch_name: location?.name ?? "",
        sku: product?.sku ?? "",
        product_name: product?.name ?? "",
        size: product?.size ?? null,
        color: product?.color ?? null,
        quantity: row.quantity,
        low_stock_threshold: row.low_stock_threshold,
        updated_at: row.updated_at,
      } satisfies Row;
    });
  }

  if (entity === "customers") {
    const { data, error } = await supabase
      .from("customers")
      .select("id,name,phone,email,address,note,created_at,updated_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(MAX_EXPORT_ROWS);
    if (error) throw new Error(error.message);
    return toRecords(data);
  }

  if (entity === "orders") {
    const { data, error } = await supabase
      .from("orders")
      .select("id,order_number,total,status,payment_method,payment_status,amount_paid,credit_amount,location_id,created_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(MAX_EXPORT_ROWS);
    if (error) throw new Error(error.message);
    return toRecords(data);
  }

  if (entity === "expenses") {
    const { data, error } = await supabase
      .from("expenses")
      .select("id,category,description,amount,expense_date,payee,payment_method,reference,location_id,created_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(MAX_EXPORT_ROWS);
    if (error) throw new Error(error.message);
    return toRecords(data);
  }

  if (entity === "suppliers") {
    const { data, error } = await supabase
      .from("suppliers")
      .select("id,name,contact_person,phone,email,address,notes,is_active,created_at,updated_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(MAX_EXPORT_ROWS);
    if (error) throw new Error(error.message);
    return toRecords(data);
  }

  if (entity === "shifts") {
    const { data, error } = await supabase
      .from("cash_register_shifts")
      .select("id,location_id,status,opening_cash,closing_cash,expected_cash,variance,opened_at,closed_at")
      .eq("business_id", businessId)
      .order("opened_at", { ascending: false })
      .limit(MAX_EXPORT_ROWS);
    if (error) throw new Error(error.message);
    return toRecords(data);
  }

  const { data, error } = await supabase
    .from("customer_credit_ledger")
    .select("id,customer_id,entry_type,amount,balance_after,note,reference,created_at")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(MAX_EXPORT_ROWS);
  if (error) throw new Error(error.message);
  return toRecords(data);
}

export async function buildExport(entity: ExportEntity, format: ExportFormat = "csv"): Promise<ExportResult> {
  const business = await requirePermission("exports.manage");
  const filename = `tenh-${entity}-${new Date().toISOString().slice(0, 10)}.${format}`;
  try {
    const rows = await fetchExportRows(entity, business.id);
    const result = format === "json"
      ? { ok: true as const, filename, mime: "application/json", content: JSON.stringify(rows, null, 2), rowCount: rows.length }
      : { ok: true as const, filename, mime: "text/csv;charset=utf-8", content: recordsToCsv(rows), rowCount: rows.length };
    await recordTransfer({ businessId: business.id, direction: "export", entity, format, filename, rowCount: rows.length, status: "completed" });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to export data.";
    await recordTransfer({ businessId: business.id, direction: "export", entity, format, filename, rowCount: 0, status: "failed", errorMessage: message });
    return { ok: false, message };
  }
}

export async function buildExportAll(): Promise<ExportResult> {
  try { return {ok:true,...await exportBusinessData(exportGroups.map(group=>group.id),"json")}; }
  catch(error) {return {ok:false,message:error instanceof Error?error.message:"Export failed."};}
}

function normalizeHeader(value: string) {
  return value.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[\s-]+/g, "_").replace(/[^a-z0-9_]/g, "");
}

function boolValue(value: string, fallback = true) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "y", "active"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "inactive"].includes(normalized)) return false;
  throw new Error(`Invalid boolean value "${value}".`);
}

function numberValue(value: string, field: string, rowNumber: number, options: { integer?: boolean; min?: number } = {}) {
  const number = Number(value);
  if (!value?.trim() || !Number.isFinite(number) || (options.integer && !Number.isInteger(number)) || (options.min !== undefined && number < options.min)) {
    throw new Error(`Row ${rowNumber}: ${field} is invalid.`);
  }
  return number;
}

function optionalNumber(value: string, field: string, rowNumber: number, options: { integer?: boolean; min?: number } = {}) {
  if (!value.trim()) return null;
  return numberValue(value, field, rowNumber, options);
}

function sanitizeText(value = "", max = 500) {
  const cleaned = value.trim();
  if (cleaned.length > max) throw new Error(`Text exceeds ${max} characters.`);
  return cleaned || null;
}

function validateCsv(entity: ImportEntity, csvText: string, businessId: string, branchId: string): ImportPreviewResult & { rows: Record<string, string | number | boolean | null>[] } {
  const base = { ok: false, message: "", rowCount: 0, headers: [] as string[], preview: [] as Record<string, string | number | boolean | null>[], errors: [] as string[], rows: [] as Record<string, string | number | boolean | null>[] };
  if (!["products", "customers", "suppliers", "inventory"].includes(entity) || typeof csvText !== "string") return { ...base, message: "Invalid import options.", errors: ["Invalid import options."] };
  if (!csvText.trim()) return { ...base, message: "Choose a CSV file first.", errors: ["The CSV file is empty."] };
  if (csvText.length > MAX_IMPORT_CHARS) return { ...base, message: "CSV file is too large.", errors: [`Keep imports below ${Math.round(MAX_IMPORT_CHARS / 1000)} KB.`] };

  let matrix: string[][];
  try {
    matrix = parseCsv(csvText);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to parse CSV.";
    return { ...base, message, errors: [message] };
  }
  if (matrix.length < 2) return { ...base, message: "CSV has no data rows.", errors: ["Add a header row and at least one data row."] };

  const headers = matrix[0].map(normalizeHeader);
  if (new Set(headers).size !== headers.length) return { ...base, headers, message: "CSV has duplicate column names.", errors: ["Each CSV column must have a unique header."] };
  const accepted = [...csvImportTemplates[entity].csv.split("\n")[0].split(","), "id", "business_id", "location_id", "owner_id", "created_at", "updated_at"];
  const unexpected = headers.filter(header => !accepted.includes(header));
  if (unexpected.length) return { ...base, headers, message: "Columns do not match this feature.", errors: [`Unsupported columns: ${unexpected.join(", ")}. Use this feature's template.`] };
  const required: Record<ImportEntity, string[]> = {
    products: ["name", "sku", "selling_price"],
    customers: ["name"],
    suppliers: ["name"],
    inventory: ["sku", "branch_code", "quantity"],
  };
  const missing = required[entity].filter((key) => !headers.includes(key));
  if (missing.length) return { ...base, headers, message: "CSV is missing required columns.", errors: [`Missing: ${missing.join(", ")}`] };

  const dataRows = matrix.slice(1);
  if (dataRows.length > MAX_IMPORT_ROWS) return { ...base, headers, rowCount: dataRows.length, message: "Too many import rows.", errors: [`Maximum ${MAX_IMPORT_ROWS.toLocaleString()} rows per import.`] };

  const errors: string[] = [];
  const normalizedRows: Record<string, string | number | boolean | null>[] = [];
  const uniqueKeys = new Set<string>();

  dataRows.forEach((cells, index) => {
    const rowNumber = index + 2;
    const source: Record<string, string> = {};
    headers.forEach((header, column) => { source[header] = cells[column] ?? ""; });
    try {
      if (cells.length !== headers.length) throw new Error(`Row ${rowNumber}: column count does not match the header.`);
      if (source.business_id && source.business_id !== businessId) throw new Error(`Row ${rowNumber}: this record belongs to another business.`);
      if (source.location_id && source.location_id !== branchId) throw new Error(`Row ${rowNumber}: this record belongs to another branch.`);
      if (entity === "products") {
        const name = sanitizeText(source.name, 200);
        const sku = sanitizeText(source.sku, 100)?.toUpperCase() ?? null;
        if (!name || name.length < 2) throw new Error(`Row ${rowNumber}: product name is required.`);
        if (!sku) throw new Error(`Row ${rowNumber}: SKU is required.`);
        if (uniqueKeys.has(sku)) throw new Error(`Row ${rowNumber}: duplicate SKU ${sku} in this CSV.`);
        uniqueKeys.add(sku);
        normalizedRows.push({
          name,
          sku,
          barcode: sanitizeText(source.barcode || source.sku, 100),
          description: sanitizeText(source.description, 2000),
          cost_price: optionalNumber(source.cost_price ?? "", "cost_price", rowNumber, { min: 0 }) ?? 0,
          selling_price: numberValue(source.selling_price, "selling_price", rowNumber, { min: 0 }),
          low_stock_quantity: optionalNumber(source.low_stock_quantity ?? "", "low_stock_quantity", rowNumber, { integer: true, min: 0 }) ?? 0,
          is_active: boolValue(source.is_active ?? "", true),
        });
      } else if (entity === "customers") {
        const name = sanitizeText(source.name, 200);
        if (!name || name.length < 2) throw new Error(`Row ${rowNumber}: customer name is required.`);
        const email = sanitizeText(source.email, 320)?.toLowerCase() ?? null;
        const phone = sanitizeText(source.phone, 80);
        if (email && !email.includes("@")) throw new Error(`Row ${rowNumber}: email is invalid.`);
        const key = email ? `email:${email}` : phone ? `phone:${phone}` : `name:${name.toLowerCase()}:${rowNumber}`;
        if ((email || phone) && uniqueKeys.has(key)) throw new Error(`Row ${rowNumber}: duplicate customer match key in this CSV.`);
        uniqueKeys.add(key);
        normalizedRows.push({ name, email, phone, address: sanitizeText(source.address, 1000), note: sanitizeText(source.note, 2000) });
      } else if (entity === "suppliers") {
        const name = sanitizeText(source.name, 200);
        if (!name || name.length < 2) throw new Error(`Row ${rowNumber}: supplier name is required.`);
        const email = sanitizeText(source.email, 320)?.toLowerCase() ?? null;
        if (email && !email.includes("@")) throw new Error(`Row ${rowNumber}: email is invalid.`);
        const key = email ? `email:${email}` : `name:${name.toLowerCase()}`;
        if (uniqueKeys.has(key)) throw new Error(`Row ${rowNumber}: duplicate supplier in this CSV.`);
        uniqueKeys.add(key);
        normalizedRows.push({
          name,
          contact_person: sanitizeText(source.contact_person, 200),
          phone: sanitizeText(source.phone, 80),
          email,
          address: sanitizeText(source.address, 1000),
          notes: sanitizeText(source.notes, 2000),
          is_active: boolValue(source.is_active ?? "", true),
        });
      } else {
        const sku = sanitizeText(source.sku, 100)?.toUpperCase() ?? null;
        const branchCode = sanitizeText(source.branch_code, 100)?.toUpperCase() ?? null;
        if (!sku) throw new Error(`Row ${rowNumber}: SKU is required.`);
        if (!branchCode) throw new Error(`Row ${rowNumber}: branch_code is required.`);
        const key = `${branchCode}:${sku}`;
        if (uniqueKeys.has(key)) throw new Error(`Row ${rowNumber}: duplicate ${key} inventory row.`);
        uniqueKeys.add(key);
        normalizedRows.push({
          sku,
          branch_code: branchCode,
          quantity: numberValue(source.quantity, "quantity", rowNumber, { integer: true, min: 0 }),
          low_stock_threshold: optionalNumber(source.low_stock_threshold ?? "", "low_stock_threshold", rowNumber, { integer: true, min: 0 }),
        });
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `Row ${rowNumber}: invalid data.`);
    }
  });

  return {
    ok: errors.length === 0,
    message: errors.length ? `${errors.length} validation issue${errors.length === 1 ? "" : "s"} found.` : `${normalizedRows.length.toLocaleString()} row${normalizedRows.length === 1 ? "" : "s"} ready to import.`,
    rowCount: dataRows.length,
    headers,
    preview: normalizedRows.slice(0, 5),
    errors: errors.slice(0, 20),
    rows: normalizedRows,
  };
}

export async function previewCsvImport(entity: ImportEntity, csvText: string, mode: ImportMode = "merge"): Promise<ImportPreviewResult> {
  const business = await requirePermission("exports.manage");
  const context = await getBranchContext();
  const result = validateCsv(entity, csvText, business.id, context.branchId);
  const publicResult: ImportPreviewResult = { ok: result.ok, message: result.message, rowCount: result.rowCount, headers: result.headers, preview: result.preview, errors: result.errors };
  if (!result.ok) return publicResult;
  try {
    if (business.role !== "owner") throw new Error("Only the business owner can import data.");
    const db = await createClient();
    const { data, error } = await db.rpc("tenh_import_business_safe", { p_business_id: business.id, p_kind: entity, p_mode: mode, p_payload: result.rows, p_branch_id: context.branchId });
    if (error) throw new Error(error.message);
    return { ...publicResult, ...data, message: `${data.inserted} added, ${data.updated} updated, ${data.skipped} unchanged or skipped. Review before confirming.` };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Validation failed.";
    return { ...publicResult, ok: false, message, errors: [message] };
  }
}

export async function commitCsvImport(entity: ImportEntity, mode: ImportMode, csvText: string, filename?: string, confirmation?: { fingerprint: string; requestId: string }): Promise<ImportCommitResult> {
  const business = await requirePermission("exports.manage");
  const context = await getBranchContext();
  const validated = validateCsv(entity, csvText, business.id, context.branchId);
  if (!validated.ok) {
    return { ok: false, message: validated.errors[0] ?? validated.message, inserted: 0, updated: 0, skipped: validated.rowCount };
  }
  try {
    if (business.role !== "owner") throw new Error("Only the business owner can import data.");
    if (!confirmation) throw new Error("Validate and confirm the file first.");
    const db = await createClient();
    const { data, error } = await db.rpc("tenh_import_business_safe", {
      p_business_id: business.id, p_kind: entity, p_mode: mode, p_payload: validated.rows, p_branch_id: context.branchId,
      p_commit: true, p_expected: confirmation.fingerprint, p_request_id: confirmation.requestId, p_filename: filename ?? null,
    });
    if (error) throw new Error(error.message);
    const result = { inserted: Number(data.inserted), updated: Number(data.updated), skipped: Number(data.skipped) };
    revalidatePath("/dashboard", "layout");
    return { ok: true, message: `Import completed: ${result.inserted} added, ${result.updated} updated, ${result.skipped} skipped.`, ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to import data.";
    await recordTransfer({ businessId: business.id, direction: "import", entity, format: "csv", mode, filename: filename?.slice(0, 255) ?? null, rowCount: validated.rows.length, status: "failed", errorMessage: message });
    revalidatePath("/dashboard/exports");
    return { ok: false, message, inserted: 0, updated: 0, skipped: validated.rows.length };
  }
}
