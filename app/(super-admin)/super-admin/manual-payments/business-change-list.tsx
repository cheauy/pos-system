import ManualPaymentApprovalDashboard, {
  type ManualPaymentViewRow,
} from "@/components/super-admin/manual-payment-approval-dashboard";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { getBusinessModePreset } from "@/lib/business/business-mode-presets";
import { supabaseAdmin } from "@/lib/supabase/admin";

type OrderRow = {
  id: string;
  business_id: string;
  requested_by_user_id: string | null;
  old_slug: string;
  requested_slug: string;
  old_business_type: string | null;
  requested_business_type: string;
  change_url: boolean;
  change_business_mode: boolean;
  unit_price: number | string;
  total_amount: number | string;
  currency: string;
  status: string;
  payment_provider: string | null;
  payment_reference: string | null;
  payment_note: string | null;
  proof_bucket: string | null;
  proof_path: string | null;
  proof_file_name: string | null;
  proof_mime_type: string | null;
  proof_size_bytes: number | string | null;
  proof_uploaded_at: string | null;
  reviewed_at: string | null;
  reviewed_by_email: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
};

type BusinessRow = {
  id: string;
  name: string;
  slug: string;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
};

function isVisibleManualOrder(order: OrderRow) {
  return (
    order.status === "payment_submitted" ||
    (Boolean(order.reviewed_at) && ["applied", "cancelled"].includes(order.status))
  );
}

function statusOf(order: OrderRow): ManualPaymentViewRow["status"] {
  if (order.status === "payment_submitted") return "waiting";
  if (order.status === "applied" && order.reviewed_at) return "approved";
  return "rejected";
}

export default async function BusinessChangePaymentList() {
  await requireSuperAdmin();

  const { data: rawOrders, error } = await supabaseAdmin
    .from("business_change_orders")
    .select(
      "id,business_id,requested_by_user_id,old_slug,requested_slug,old_business_type,requested_business_type,change_url,change_business_mode,unit_price,total_amount,currency,status,payment_provider,payment_reference,payment_note,proof_bucket,proof_path,proof_file_name,proof_mime_type,proof_size_bytes,proof_uploaded_at,reviewed_at,reviewed_by_email,review_note,created_at,updated_at",
    )
    .in("status", ["payment_submitted", "applied", "cancelled"])
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    throw new Error(`Unable to load manual business-change payments: ${error.message}`);
  }

  const orders = ((rawOrders ?? []) as OrderRow[]).filter(isVisibleManualOrder);
  const businessIds = Array.from(new Set(orders.map((order) => order.business_id)));
  const requesterIds = Array.from(
    new Set(
      orders
        .map((order) => order.requested_by_user_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  let businesses: BusinessRow[] = [];
  let profiles: ProfileRow[] = [];

  if (businessIds.length > 0) {
    const { data, error: businessError } = await supabaseAdmin
      .from("businesses")
      .select("id,name,slug")
      .in("id", businessIds);

    if (businessError) {
      throw new Error(`Unable to load businesses: ${businessError.message}`);
    }

    businesses = (data ?? []) as BusinessRow[];
  }

  if (requesterIds.length > 0) {
    const { data, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id,full_name,email")
      .in("id", requesterIds);

    if (profileError) {
      throw new Error(`Unable to load requesters: ${profileError.message}`);
    }

    profiles = (data ?? []) as ProfileRow[];
  }

  const businessMap = new Map(businesses.map((business) => [business.id, business]));
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));

  const rows: ManualPaymentViewRow[] = orders.map((order) => {
    const business = businessMap.get(order.business_id);
    const requester = order.requested_by_user_id
      ? profileMap.get(order.requested_by_user_id)
      : null;
    const oldMode = getBusinessModePreset(order.old_business_type ?? "");
    const newMode = getBusinessModePreset(order.requested_business_type);

    return {
      id: order.id,
      businessId: order.business_id,
      businessName: business?.name ?? "Unknown business",
      customerName: requester?.full_name ?? "Business owner",
      customerEmail: requester?.email ?? "",
      status: statusOf(order),
      changeUrl: order.change_url,
      changeBusinessMode: order.change_business_mode,
      oldUrl: `${order.old_slug}.tenh-pos.com`,
      requestedUrl: `${order.requested_slug}.tenh-pos.com`,
      oldBusinessType: oldMode?.label ?? order.old_business_type ?? "Current mode",
      requestedBusinessType:
        newMode?.label ?? order.requested_business_type,
      unitPrice: Number(order.unit_price),
      amount: Number(order.total_amount),
      currency: order.currency,
      paymentProvider: order.payment_provider ?? "Manual payment",
      paymentReference: order.payment_reference ?? "",
      paymentNote: order.payment_note ?? "",
      proofAvailable: Boolean(order.proof_bucket && order.proof_path),
      proofUrl:
        order.proof_bucket && order.proof_path
          ? `/api/super-admin/business-change-orders/${order.id}/proof`
          : null,
      proofFileName: order.proof_file_name,
      proofMimeType: order.proof_mime_type,
      proofSizeBytes:
        order.proof_size_bytes == null ? null : Number(order.proof_size_bytes),
      proofUploadedAt: order.proof_uploaded_at,
      submittedAt: order.updated_at,
      createdAt: order.created_at,
      reviewedAt: order.reviewed_at,
      reviewedByEmail: order.reviewed_by_email,
      reviewNote: order.review_note,
    };
  });

  // One server timestamp is passed to the client so both render the same age labels.
  // eslint-disable-next-line react-hooks/purity
  const referenceNow = Date.now();
  return (
    <ManualPaymentApprovalDashboard
      rows={rows}
      referenceNow={referenceNow}
    />
  );
}
