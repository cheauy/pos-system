"use server";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import type { CreateBusinessState } from "./state";
export async function createCustomerBusiness(_state: CreateBusinessState, _data: FormData): Promise<CreateBusinessState> {
 void _state; void _data;
 await requireSuperAdmin();
 return {success:false,message:"Creating customer workspaces from Super Admin is no longer available."};
}
