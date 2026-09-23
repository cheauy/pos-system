"use client";

import {
  useMemo,
  useState,
} from "react";
import {
  Activity,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Download,
  Eye,
  FileClock,
  FileText,
  FilterX,
  Info,
  ListFilter,
  LockKeyhole,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";

import type { AuditBranch, AuditLog } from "./page";

type AuditLogsTableProps = {
  logs: AuditLog[];
  branches: AuditBranch[];
  branchLoadError?: string | null;
};

type Severity = "info" | "warning" | "success" | "critical";
type DateRangeKey = "today" | "7d" | "30d" | "all";

type NormalizedAuditLog = AuditLog & {
  severity: Severity;
  branchId: string | null;
  branchName: string;
  userName: string;
  moduleName: string;
};

const severityOrder: Severity[] = [
  "info",
  "warning",
  "success",
  "critical",
];

export default function AuditLogsTable({
  logs,
  branches,
  branchLoadError,
}: AuditLogsTableProps) {
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [dateRange, setDateRange] = useState<DateRangeKey>("7d");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedLog, setSelectedLog] = useState<NormalizedAuditLog | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showDateMenu, setShowDateMenu] = useState(false);

  const branchMap = useMemo(
    () => new Map(branches.map((branch) => [branch.id, branch.name])),
    [branches],
  );

  const normalizedLogs = useMemo<NormalizedAuditLog[]>(
    () =>
      logs.map((log) => {
        const branchId = readBranchId(log.metadata);
        return {
          ...log,
          severity: inferSeverity(log),
          branchId,
          branchName: resolveBranchName(log.metadata, branchId, branchMap),
          userName: log.profiles?.full_name?.trim() || "System",
          moduleName: formatLabel(log.entity_type || "system"),
        };
      }),
    [branchMap, logs],
  );

  const todayStart = startOfDay(new Date());
  const tomorrowStart = addDays(todayStart, 1);
  const yesterdayStart = addDays(todayStart, -1);

  const todayLogs = useMemo(
    () =>
      normalizedLogs.filter((log) => {
        const created = new Date(log.created_at);
        return created >= todayStart && created < tomorrowStart;
      }),
    [normalizedLogs, todayStart, tomorrowStart],
  );

  const yesterdayLogs = useMemo(
    () =>
      normalizedLogs.filter((log) => {
        const created = new Date(log.created_at);
        return created >= yesterdayStart && created < todayStart;
      }),
    [normalizedLogs, yesterdayStart, todayStart],
  );

  const stats = useMemo(() => {
    const highRiskToday = todayLogs.filter(
      (log) => log.severity === "critical" || log.severity === "warning",
    ).length;
    const highRiskYesterday = yesterdayLogs.filter(
      (log) => log.severity === "critical" || log.severity === "warning",
    ).length;

    const activeToday = uniqueUsers(todayLogs);
    const activeYesterday = uniqueUsers(yesterdayLogs);
    const failedToday = todayLogs.filter(isFailedSignIn).length;
    const failedYesterday = yesterdayLogs.filter(isFailedSignIn).length;

    return [
      {
        title: "Total events today",
        value: todayLogs.length,
        previous: yesterdayLogs.length,
        icon: FileText,
        tone: "blue" as const,
        comparison: "vs. yesterday",
      },
      {
        title: "High-risk actions",
        value: highRiskToday,
        previous: highRiskYesterday,
        icon: ShieldAlert,
        tone: "red" as const,
        comparison: "vs. yesterday",
      },
      {
        title: "Staff activity",
        value: activeToday,
        previous: activeYesterday,
        icon: UsersRound,
        tone: "blue" as const,
        comparison: "active users today",
      },
      {
        title: "Failed sign-in attempts",
        value: failedToday,
        previous: failedYesterday,
        icon: LockKeyhole,
        tone: "amber" as const,
        comparison: "vs. yesterday",
      },
    ];
  }, [todayLogs, yesterdayLogs]);

  const modules = useMemo(
    () => uniqueSorted(normalizedLogs.map((log) => log.moduleName)),
    [normalizedLogs],
  );
  const users = useMemo(
    () => uniqueSorted(normalizedLogs.map((log) => log.userName)),
    [normalizedLogs],
  );
  const actions = useMemo(
    () => uniqueSorted(normalizedLogs.map((log) => log.action)),
    [normalizedLogs],
  );

  const filteredLogs = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const dateStart = getRangeStart(dateRange, todayStart);

    return normalizedLogs.filter((log) => {
      const created = new Date(log.created_at);
      const matchesDate = !dateStart || created >= dateStart;
      const matchesSearch =
        !keyword ||
        [
          log.userName,
          log.action,
          log.moduleName,
          log.branchName,
          log.description ?? "",
          log.entity_id ?? "",
          log.ip_address ?? "",
        ].some((value) => value.toLowerCase().includes(keyword));

      const matchesModule =
        moduleFilter === "all" || log.moduleName === moduleFilter;
      const matchesUser = userFilter === "all" || log.userName === userFilter;
      const matchesAction = actionFilter === "all" || log.action === actionFilter;
      const matchesBranch =
        branchFilter === "all" ||
        (branchFilter === "business" && !log.branchId) ||
        log.branchId === branchFilter;
      const matchesSeverity =
        severityFilter === "all" || log.severity === severityFilter;

      return (
        matchesDate &&
        matchesSearch &&
        matchesModule &&
        matchesUser &&
        matchesAction &&
        matchesBranch &&
        matchesSeverity
      );
    });
  }, [
    actionFilter,
    branchFilter,
    dateRange,
    moduleFilter,
    normalizedLogs,
    search,
    severityFilter,
    todayStart,
    userFilter,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const pagedLogs = filteredLogs.slice(pageStart, pageStart + pageSize);

  function changeFilter(callback: () => void) {
    callback();
    setPage(1);
  }

  function resetFilters() {
    setSearch("");
    setModuleFilter("all");
    setUserFilter("all");
    setActionFilter("all");
    setBranchFilter("all");
    setSeverityFilter("all");
    setDateRange("7d");
    setPage(1);
  }

  function exportLogs(format: "csv" | "json") {
    const stamp = new Date().toISOString().slice(0, 10);
    const rows = filteredLogs.map((log) => ({
      date_time: log.created_at,
      user: log.userName,
      action: formatLabel(log.action),
      module: log.moduleName,
      branch: log.branchName,
      severity: formatLabel(log.severity),
      description: log.description ?? "",
      entity_id: log.entity_id ?? "",
      ip_address: log.ip_address ?? "",
      user_agent: log.user_agent ?? "",
      metadata: log.metadata,
    }));

    if (format === "json") {
      downloadText(
        `tenh-pos-audit-logs-${stamp}.json`,
        JSON.stringify(rows, null, 2),
        "application/json",
      );
    } else {
      const headers = [
        "Date & Time",
        "User",
        "Action",
        "Module / Entity",
        "Branch",
        "Severity",
        "Description",
        "Entity ID",
        "IP Address",
        "User Agent",
      ];
      const csv = [
        headers,
        ...rows.map((row) => [
          row.date_time,
          row.user,
          row.action,
          row.module,
          row.branch,
          row.severity,
          row.description,
          row.entity_id,
          row.ip_address,
          row.user_agent,
        ]),
      ]
        .map((row) => row.map(csvCell).join(","))
        .join("\n");
      downloadText(`tenh-pos-audit-logs-${stamp}.csv`, csv, "text/csv;charset=utf-8");
    }

    setShowExportMenu(false);
  }

  const dateLabel = formatDateRangeLabel(dateRange, todayStart);

  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-4 pb-8">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950 dark:text-white">
            Audit Logs
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Review important activity performed in the POS system.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowExportMenu((open) => !open)}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              <Download className="h-4 w-4" />
              Export logs
              <ChevronDown className="h-4 w-4" />
            </button>
            {showExportMenu ? (
              <div className="absolute right-0 z-30 mt-2 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                <button
                  type="button"
                  onClick={() => exportLogs("csv")}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <FileText className="h-4 w-4" /> Export CSV
                </button>
                <button
                  type="button"
                  onClick={() => exportLogs("json")}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <FileClock className="h-4 w-4" /> Export JSON
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <StatCard key={stat.title} {...stat} />
        ))}
      </section>

      <section className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="space-y-3 border-b border-slate-100 p-4 dark:border-slate-800">
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(event) => changeFilter(() => setSearch(event.target.value))}
                placeholder="Search audit logs (user, action, description, etc)..."
                className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-blue-950/30"
              />
            </div>
            <FilterSelect
              value={moduleFilter}
              onChange={(value) => changeFilter(() => setModuleFilter(value))}
              className="lg:w-[180px]"
            >
              <option value="all">All modules</option>
              {modules.map((module) => (
                <option key={module} value={module}>{module}</option>
              ))}
            </FilterSelect>
          </div>

          <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center">
            <div className="relative min-w-[260px] flex-1 2xl:max-w-[330px]">
              <button
                type="button"
                onClick={() => setShowDateMenu((open) => !open)}
                className="flex h-11 w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 text-left text-sm font-medium text-slate-700 transition hover:border-blue-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              >
                <CalendarDays className="h-4 w-4 text-slate-500" />
                <span className="min-w-0 flex-1 truncate">{dateLabel}</span>
                <ChevronDown className="h-4 w-4 text-slate-400" />
              </button>
              {showDateMenu ? (
                <div className="absolute left-0 z-30 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                  {([
                    ["today", "Today"],
                    ["7d", "Last 7 days"],
                    ["30d", "Last 30 days"],
                    ["all", "All time"],
                  ] as Array<[DateRangeKey, string]>).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        setDateRange(value);
                        setPage(1);
                        setShowDateMenu(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                        dateRange === value
                          ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                          : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                      }`}
                    >
                      {label}
                      {dateRange === value ? <CircleCheck className="h-4 w-4" /> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="grid flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <FilterSelect value={userFilter} onChange={(value) => changeFilter(() => setUserFilter(value))}>
                <option value="all">All users</option>
                {users.map((user) => <option key={user} value={user}>{user}</option>)}
              </FilterSelect>
              <FilterSelect value={actionFilter} onChange={(value) => changeFilter(() => setActionFilter(value))}>
                <option value="all">All actions</option>
                {actions.map((action) => <option key={action} value={action}>{formatLabel(action)}</option>)}
              </FilterSelect>
              <FilterSelect value={branchFilter} onChange={(value) => changeFilter(() => setBranchFilter(value))}>
                <option value="all">All branches</option>
                <option value="business">Business-wide</option>
                {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </FilterSelect>
              <FilterSelect value={severityFilter} onChange={(value) => changeFilter(() => setSeverityFilter(value))}>
                <option value="all">All severity</option>
                {severityOrder.map((severity) => <option key={severity} value={severity}>{formatLabel(severity)}</option>)}
              </FilterSelect>
            </div>

            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold text-blue-600 transition hover:bg-blue-50 dark:hover:bg-blue-950/30"
            >
              <FilterX className="h-4 w-4" />
              Reset filters
            </button>
          </div>

          {branchLoadError ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Branch names could not be loaded. Audit events remain available and are shown as business-wide when no branch metadata is present.
            </p>
          ) : null}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1280px] table-fixed">
            <thead className="bg-slate-50/90 dark:bg-slate-950/70">
              <tr>
                <TableHeading className="w-[170px]">Date &amp; time</TableHeading>
                <TableHeading className="w-[170px]">User</TableHeading>
                <TableHeading className="w-[120px]">Action</TableHeading>
                <TableHeading className="w-[170px]">Module / Entity</TableHeading>
                <TableHeading className="w-[150px]">Branch</TableHeading>
                <TableHeading className="w-[135px]">Severity</TableHeading>
                <TableHeading>Description</TableHeading>
                <TableHeading className="w-[82px] text-center">Details</TableHeading>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {pagedLogs.map((log) => (
                <tr key={log.id} className="group transition hover:bg-blue-50/35 dark:hover:bg-blue-950/10">
                  <TableCell>{formatDate(log.created_at)}</TableCell>
                  <TableCell>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white shadow-sm">
                        {initials(log.userName)}
                      </span>
                      <span className="truncate font-medium text-slate-800 dark:text-slate-100">{log.userName}</span>
                    </div>
                  </TableCell>
                  <TableCell><ActionBadge action={log.action} /></TableCell>
                  <TableCell><span className="font-medium text-slate-700 dark:text-slate-200">{log.moduleName}</span></TableCell>
                  <TableCell><span className="truncate text-slate-600 dark:text-slate-300">{log.branchName}</span></TableCell>
                  <TableCell><SeverityBadge severity={log.severity} /></TableCell>
                  <TableCell><p className="truncate text-slate-600 dark:text-slate-300" title={log.description ?? ""}>{log.description ?? "—"}</p></TableCell>
                  <TableCell className="text-center">
                    <button
                      type="button"
                      onClick={() => setSelectedLog(log)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-blue-100 hover:text-blue-700 dark:hover:bg-blue-950/50 dark:hover:text-blue-300"
                      aria-label="View audit log details"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  </TableCell>
                </tr>
              ))}

              {pagedLogs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center">
                    <div className="mx-auto flex max-w-sm flex-col items-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800">
                        <Search className="h-5 w-5" />
                      </div>
                      <p className="mt-3 font-semibold text-slate-800 dark:text-slate-100">No audit logs found</p>
                      <p className="mt-1 text-sm text-slate-500">Try another date range or reset the filters.</p>
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Showing {filteredLogs.length === 0 ? 0 : pageStart + 1}–{Math.min(pageStart + pageSize, filteredLogs.length)} of {filteredLogs.length} results
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-blue-200 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
              {safePage}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-blue-200 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <FilterSelect
              value={String(pageSize)}
              onChange={(value) => {
                setPageSize(Number(value));
                setPage(1);
              }}
              className="w-[128px]"
            >
              <option value="10">10 per page</option>
              <option value="25">25 per page</option>
              <option value="50">50 per page</option>
            </FilterSelect>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-blue-100 bg-white px-5 py-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="grid gap-5 lg:grid-cols-[1.15fr_repeat(4,minmax(0,1fr))] lg:items-center">
          <div className="flex items-start gap-3 lg:border-r lg:border-slate-100 lg:pr-5 dark:lg:border-slate-800">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
              <Info className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">What do audit logs track?</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                Audit logs record important activity in your POS system to support security, accountability, and troubleshooting.
              </p>
            </div>
          </div>
          <TrackItem icon={UserRound} title="User actions" description="Logins, logouts, and staff activity" />
          <TrackItem icon={FileText} title="Data changes" description="Create, edit, and delete records" />
          <TrackItem icon={Download} title="Exports & reports" description="Data exports and report generation" />
          <TrackItem icon={ShieldCheck} title="Security events" description="Failed logins, permission changes, and more" />
        </div>
      </section>

      {selectedLog ? <AuditLogDialog log={selectedLog} onClose={() => setSelectedLog(null)} /> : null}
    </main>
  );
}

function StatCard({
  title,
  value,
  previous,
  icon: Icon,
  tone,
  comparison,
}: {
  title: string;
  value: number;
  previous: number;
  icon: typeof FileText;
  tone: "blue" | "red" | "amber";
  comparison: string;
}) {
  const trend = percentChange(value, previous);
  const iconClass =
    tone === "red"
      ? "bg-red-50 text-red-500 dark:bg-red-950/30"
      : tone === "amber"
        ? "bg-amber-50 text-amber-500 dark:bg-amber-950/30"
        : "bg-blue-50 text-blue-600 dark:bg-blue-950/40";

  return (
    <article className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start gap-4">
        <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${iconClass}`}>
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <strong className="text-3xl font-bold tracking-tight text-slate-950 dark:text-white">{value}</strong>
            <TrendPill trend={trend} />
          </div>
          <p className="mt-1 text-xs text-slate-400">{comparison}</p>
        </div>
      </div>
    </article>
  );
}

function TrendPill({ trend }: { trend: number | null }) {
  if (trend === null) {
    return <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500 dark:bg-slate-800">—</span>;
  }
  const positive = trend >= 0;
  return (
    <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${positive ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400" : "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400"}`}>
      {positive ? "↗" : "↘"} {positive ? "+" : ""}{trend}%
    </span>
  );
}

function FilterSelect({
  value,
  onChange,
  children,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <ListFilter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white pl-9 pr-9 text-sm font-medium text-slate-700 outline-none transition hover:border-blue-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:focus:ring-blue-950/30"
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
  );
}

function TableHeading({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th className={`px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 ${className}`}>
      {children}
    </th>
  );
}

function TableCell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-4 py-3 text-sm text-slate-600 dark:text-slate-300 ${className}`}>{children}</td>;
}

function ActionBadge({ action }: { action: string }) {
  const normalized = action.toLowerCase();
  const className =
    normalized.includes("delete") || normalized.includes("login") || normalized.includes("fail")
      ? "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-300"
      : normalized.includes("create") || normalized.includes("export") || normalized.includes("complete")
        ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300"
        : "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300";

  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${className}`}>{formatLabel(action)}</span>;
}

function SeverityBadge({ severity }: { severity: Severity }) {
  const config = {
    info: { icon: Info, label: "Info", className: "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300" },
    warning: { icon: ShieldAlert, label: "Warning", className: "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-300" },
    success: { icon: CircleCheck, label: "Success", className: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300" },
    critical: { icon: ShieldAlert, label: "Critical", className: "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-300" },
  }[severity];
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${config.className}`}>
      <Icon className="h-3.5 w-3.5" /> {config.label}
    </span>
  );
}

function TrackItem({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Activity;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 lg:border-r lg:border-slate-100 lg:pr-4 last:lg:border-r-0 dark:lg:border-slate-800">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</p>
        <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>
      </div>
    </div>
  );
}

function AuditLogDialog({
  log,
  onClose,
}: {
  log: NormalizedAuditLog;
  onClose: () => void;
}) {
  return (
    <Modal onClose={onClose} title="Audit Log Details" subtitle={formatDate(log.created_at)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Detail label="User">{log.userName}</Detail>
        <Detail label="Severity"><SeverityBadge severity={log.severity} /></Detail>
        <Detail label="Action">{formatLabel(log.action)}</Detail>
        <Detail label="Module / Entity">{log.moduleName}</Detail>
        <Detail label="Branch">{log.branchName}</Detail>
        <Detail label="Entity ID"><span className="break-all">{log.entity_id ?? "—"}</span></Detail>
        <div className="sm:col-span-2"><Detail label="Description">{log.description ?? "—"}</Detail></div>
        <Detail label="IP address">{log.ip_address ?? "—"}</Detail>
        <Detail label="User agent"><span className="break-all text-xs">{log.user_agent ?? "—"}</span></Detail>
      </div>

      <div className="mt-5">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Metadata</p>
        <div className="max-h-56 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950">
          {log.metadata && Object.keys(log.metadata).length > 0 ? (
            <pre className="whitespace-pre-wrap break-words text-xs leading-5 text-slate-700 dark:text-slate-300">{JSON.stringify(log.metadata, null, 2)}</pre>
          ) : (
            <p className="text-sm text-slate-500">No metadata recorded.</p>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Modal({
  onClose,
  title,
  subtitle,
  children,
}: {
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]" onMouseDown={onClose}>
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-slate-950 dark:text-white">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <div className="mt-1.5 text-sm font-medium text-slate-800 dark:text-slate-100">{children}</div>
    </div>
  );
}

function inferSeverity(log: AuditLog): Severity {
  const text = `${log.action} ${log.entity_type} ${log.description ?? ""}`.toLowerCase();

  if (
    text.includes("failed login") ||
    text.includes("failed sign") ||
    text.includes("login failed") ||
    text.includes("invalid password") ||
    text.includes("unauthorized") ||
    text.includes("permission denied") ||
    text.includes("security breach")
  ) return "critical";

  if (
    text.includes("delete") ||
    text.includes("remove") ||
    text.includes("price") ||
    text.includes("permission") ||
    text.includes("stock_adjustment") ||
    text.includes("stock adjustment") ||
    text.includes("cancel") ||
    text.includes("refund")
  ) return "warning";

  if (
    text.includes("export") ||
    text.includes("backup") ||
    text.includes("complete") ||
    text.includes("success")
  ) return "success";

  return "info";
}

function isFailedSignIn(log: NormalizedAuditLog) {
  const text = `${log.action} ${log.entity_type} ${log.description ?? ""}`.toLowerCase();
  return (
    text.includes("failed login") ||
    text.includes("failed sign") ||
    text.includes("login failed") ||
    text.includes("invalid password")
  );
}

function readBranchId(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata) return null;
  const candidates = [metadata.branch_id, metadata.location_id, metadata.business_location_id];
  const match = candidates.find((value) => typeof value === "string" && value.trim());
  return typeof match === "string" ? match : null;
}

function resolveBranchName(
  metadata: Record<string, unknown> | null | undefined,
  branchId: string | null,
  branchMap: Map<string, string>,
) {
  if (metadata) {
    const direct = [metadata.branch_name, metadata.location_name].find(
      (value) => typeof value === "string" && value.trim(),
    );
    if (typeof direct === "string") return direct;
  }
  if (branchId) return branchMap.get(branchId) ?? "Unknown branch";
  return "Business-wide";
}

function formatLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "SY";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function uniqueSorted(values: string[]) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function uniqueUsers(logs: NormalizedAuditLog[]) {
  return new Set(
    logs
      .map((log) => log.user_id || log.userName)
      .filter(Boolean),
  ).size;
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function getRangeStart(range: DateRangeKey, today: Date) {
  if (range === "all") return null;
  if (range === "today") return today;
  if (range === "30d") return addDays(today, -29);
  return addDays(today, -6);
}

function formatDateRangeLabel(range: DateRangeKey, today: Date) {
  if (range === "all") return "All time";
  if (range === "today") return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(today);
  const start = getRangeStart(range, today) ?? today;
  const formatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${formatter.format(start)} – ${formatter.format(today)}`;
}

function percentChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadText(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
