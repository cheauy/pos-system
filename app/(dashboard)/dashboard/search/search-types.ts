export type GlobalSearchKind =
  | "order"
  | "product"
  | "customer"
  | "supplier"
  | "purchase_order"
  | "transfer"
  | "credit"
  | "setting";

export type GlobalSearchResult = {
  id: string;
  kind: GlobalSearchKind;
  title: string;
  subtitle: string;
  href: string;
  badge: string;
  branchId: string | null;
  branchName: string | null;
  status: string | null;
  createdAt: string | null;
  amount: number | null;
  details: Array<{ label: string; value: string }>;
};

export type GlobalSearchBranch = {
  id: string;
  name: string;
};

export type GlobalSearchResponse = {
  query: string;
  results: GlobalSearchResult[];
  branches: GlobalSearchBranch[];
  warnings: string[];
};

export type GlobalSearchInput = {
  query: string;
};
