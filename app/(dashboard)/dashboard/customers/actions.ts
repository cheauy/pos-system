"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAuditLog } from "@/lib/audit/create-audit-log";
import { requirePermission } from "@/lib/auth/require-permission";
import { getCustomerFieldSettings } from "@/lib/customers/get-customer-field-settings";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/branch-server";

const CUSTOMER_IMPORT_HEADERS = ["name", "phone", "address", "email", "birthday"] as const;
const MAX_IMPORT_ROWS = 1000;
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

function optionalText(formData: FormData, field: string): string | null {
  const value = formData.get(field);

  if (typeof value !== "string") {
    return null;
  }

  const cleanedValue = value.trim();
  return cleanedValue || null;
}

function requiredText(formData: FormData, field: string, label: string): string {
  const value = optionalText(formData, field);
  if (!value) {
    throw new Error(`${label} is required.`);
  }
  return value;
}

function optionalDate(formData: FormData, field: string): string | null {
  const value = optionalText(formData, field);
  if (!value) return null;

  if (!isValidIsoDate(value)) {
    throw new Error("Invalid date.");
  }

  return value;
}

function isValidIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validateCustomerFields({
  name,
  phone,
  address,
  email,
  birthday,
}: {
  name: string;
  phone: string;
  address?: string | null;
  email?: string | null;
  birthday?: string | null;
}) {
  if (name.length < 2 || name.length > 120) {
    throw new Error("Customer name must contain 2–120 characters.");
  }
  if (phone.length < 3 || phone.length > 50) {
    throw new Error("Phone must contain 3–50 characters.");
  }
  if (address && address.length > 500) {
    throw new Error("Address must be 500 characters or fewer.");
  }
  if (email) {
    if (email.length > 254 || !isValidEmail(email)) {
      throw new Error("Email is invalid.");
    }
  }
  if (birthday) {
    if (!isValidIsoDate(birthday)) {
      throw new Error("Birthday must use a valid YYYY-MM-DD date.");
    }
    const today = new Date().toISOString().slice(0, 10);
    if (birthday > today) {
      throw new Error("Birthday cannot be in the future.");
    }
  }
}

export async function createCustomer(formData: FormData) {
  const name = requiredText(formData, "name", "Customer name");
  const phone = requiredText(formData, "phone", "Phone");
  const business = await requirePermission("customers.create");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const fieldSettings = await getCustomerFieldSettings(business.id);
  const address = optionalText(formData, "address");
  const email = fieldSettings.emailEnabled ? optionalText(formData, "email") : null;
  const birthday = fieldSettings.birthdayEnabled
    ? optionalDate(formData, "birthday")
    : null;

  validateCustomerFields({ name, phone, address, email, birthday });

  const { data: inserted, error } = await supabase
    .from("customers")
    .insert({
      owner_id: user.id,
      business_id: business.id,
      name,
      phone,
      email,
      birthday,
      address,
      note: null,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await createAuditLog({
    action: "create",
    entityType: "customer",
    entityId: inserted.id,
    description: "Created customer",
  });

  revalidatePath("/dashboard/customers");
  revalidatePath("/dashboard/pos");
}

export async function deleteCustomer(formData: FormData) {
  const customerId = formData.get("customerId");
  const business = await requirePermission("customers.update");

  if (typeof customerId !== "string" || !customerId) {
    throw new Error("Invalid customer ID.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: deleted, error } = await supabase
    .from("customers")
    .delete()
    .eq("id", customerId)
    .eq("business_id", business.id)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!deleted) {
    throw new Error("Customer not found or already deleted.");
  }

  await createAuditLog({
    action: "delete",
    entityType: "customer",
    entityId: customerId,
    description: "Deleted customer",
  });

  revalidatePath("/dashboard/customers");
  revalidatePath("/dashboard/pos");
}

export async function updateCustomer(formData: FormData) {
  const customerId = formData.get("customerId");
  const name = requiredText(formData, "name", "Customer name");
  const phone = requiredText(formData, "phone", "Phone");
  const business = await requirePermission("customers.update");

  if (typeof customerId !== "string" || customerId.length === 0) {
    throw new Error("Invalid customer ID.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const fieldSettings = await getCustomerFieldSettings(business.id);

  const address = optionalText(formData, "address");
  const email = fieldSettings.emailEnabled ? optionalText(formData, "email") : null;
  const birthday = fieldSettings.birthdayEnabled
    ? optionalDate(formData, "birthday")
    : null;

  validateCustomerFields({ name, phone, address, email, birthday });

  const updates: Record<string, string | null> = {
    name,
    phone,
    address,
    updated_at: new Date().toISOString(),
  };

  if (fieldSettings.emailEnabled) {
    updates.email = email;
  }

  if (fieldSettings.birthdayEnabled) {
    updates.birthday = birthday;
  }

  const { data: updated, error } = await supabase
    .from("customers")
    .update(updates)
    .eq("id", customerId)
    .eq("business_id", business.id)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!updated) {
    throw new Error("Customer not found or no longer available.");
  }

  await createAuditLog({
    action: "update",
    entityType: "customer",
    entityId: customerId,
    description: "Updated customer",
  });

  revalidatePath("/dashboard/customers");
  revalidatePath(`/dashboard/customers/${customerId}`);
  revalidatePath("/dashboard/pos");

  redirect(`/dashboard/customers/${customerId}`);
}

export async function exportCustomersCsv() {
  const business = await requirePermission("customers.view");
  const fieldSettings = await getCustomerFieldSettings(business.id);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("customers")
    .select("name,phone,address,email,birthday,created_at")
    .eq("business_id", business.id)
    .order("created_at", { ascending: true })
    .limit(10000);

  if (error) {
    throw new Error(error.message);
  }

  const rows = data ?? [];
  const lines = [CUSTOMER_IMPORT_HEADERS.join(",")];

  for (const row of rows) {
    lines.push(
      [
        row.name,
        row.phone,
        row.address,
        fieldSettings.emailEnabled ? row.email : null,
        fieldSettings.birthdayEnabled ? row.birthday : null,
      ]
        .map(csvEscape)
        .join(","),
    );
  }

  return {
    filename: `tenh-customers-${new Date().toISOString().slice(0, 10)}.csv`,
    content: lines.join("\r\n"),
  };
}

export async function importCustomersCsv(formData: FormData) {
  const business = await requirePermission("customers.create");
  const file = formData.get("file");

  if (!(file instanceof File)) {
    throw new Error("Choose a CSV file to import.");
  }
  if (file.size === 0) {
    throw new Error("The selected CSV file is empty.");
  }
  if (file.size > MAX_IMPORT_BYTES) {
    throw new Error("CSV file must be 2 MB or smaller.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const text = (await file.text()).replace(/^\uFEFF/, "");
  const parsed = parseCsv(text);

  if (parsed.length < 2) {
    throw new Error("CSV must include the template header and at least one customer row.");
  }

  const header = parsed[0].map((value) => value.trim().toLowerCase());
  if (
    header.length !== CUSTOMER_IMPORT_HEADERS.length ||
    CUSTOMER_IMPORT_HEADERS.some((expected, index) => header[index] !== expected)
  ) {
    throw new Error(
      "CSV columns must match the TENH template exactly: name, phone, address, email, birthday.",
    );
  }

  const rawRows = parsed
    .slice(1)
    .filter((row) => row.some((value) => value.trim().length > 0));

  if (rawRows.length === 0) {
    throw new Error("CSV does not contain any customer rows.");
  }
  if (rawRows.length > MAX_IMPORT_ROWS) {
    throw new Error(`Import supports up to ${MAX_IMPORT_ROWS} customers at a time.`);
  }

  const fieldSettings = await getCustomerFieldSettings(business.id);
  const inserts = rawRows.map((row, index) => {
    const rowNumber = index + 2;
    const values = [...row];
    while (values.length < CUSTOMER_IMPORT_HEADERS.length) values.push("");

    if (values.length > CUSTOMER_IMPORT_HEADERS.length) {
      throw new Error(`Row ${rowNumber} contains too many columns.`);
    }

    const [nameValue, phoneValue, addressValue, emailValue, birthdayValue] = values;
    const name = nameValue.trim();
    const phone = phoneValue.trim();
    const address = addressValue.trim() || null;
    const email = emailValue.trim() || null;
    const birthday = birthdayValue.trim() || null;

    if (!phone) {
      throw new Error(`Row ${rowNumber}: phone is required.`);
    }

    try {
      validateCustomerFields({ name, phone, address, email, birthday });
    } catch (error) {
      throw new Error(
        `Row ${rowNumber}: ${error instanceof Error ? error.message : "Invalid customer data."}`,
      );
    }

    return {
      owner_id: user.id,
      business_id: business.id,
      name,
      phone,
      address,
      email: fieldSettings.emailEnabled ? email : null,
      birthday: fieldSettings.birthdayEnabled ? birthday : null,
      note: null,
    };
  });

  const { error } = await supabase.from("customers").insert(inserts);
  if (error) {
    throw new Error(error.message);
  }

  await createAuditLog({
    action: "create",
    entityType: "customer",
    description: `Imported ${inserts.length} customers from CSV`,
    metadata: { imported: inserts.length },
  });

  revalidatePath("/dashboard/customers");
  revalidatePath("/dashboard/pos");

  return { imported: inserts.length };
}

function csvEscape(value: unknown) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replaceAll('"', '""')}"`;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) {
    throw new Error("CSV contains an unclosed quoted value.");
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }

  return rows;
}

// Kept for compatibility with existing historical routes, but the new
// Customers UI no longer exposes loyalty controls.
export async function adjustCustomerLoyalty(formData: FormData) {
  const business = await requirePermission("customers.update");
  const customerId = formData.get("customerId");
  const pointsValue = formData.get("points");
  const noteValue = formData.get("note");

  if (typeof customerId !== "string" || !customerId) {
    throw new Error("Invalid customer ID.");
  }

  const points = Number(pointsValue);
  if (!Number.isInteger(points) || points === 0 || Math.abs(points) > 1000000) {
    throw new Error("Points must be a non-zero whole number.");
  }

  const note =
    typeof noteValue === "string" && noteValue.trim()
      ? noteValue.trim().slice(0, 300)
      : "Manual loyalty adjustment";

  const scopedDb=await createClient();
  const customer=await scopedDb.from("customers").select("id").eq("business_id",business.id).eq("id",customerId).single();
  if(customer.error) throw new Error("Customer not found in this branch.");
  const { data, error } = await supabaseAdmin.rpc("adjust_customer_loyalty_points", {
    p_business_id: business.id,
    p_customer_id: customerId,
    p_points: points,
    p_note: note,
  });

  if (error) {
    throw new Error(error.message);
  }

  await createAuditLog({
    action: "update",
    entityType: "customer",
    entityId: customerId,
    description: `Adjusted customer loyalty by ${points} points`,
    metadata: { points, balance: data, note },
  });

  revalidatePath("/dashboard/customers");
  revalidatePath(`/dashboard/customers/${customerId}`);
}
