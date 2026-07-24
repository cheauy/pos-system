"use client";

import { useMemo, useState } from "react";
import {
  Eye,
  Search,
  X,
} from "lucide-react";

import type { AuditLog } from "./page";

type AuditLogsTableProps = {
  logs: AuditLog[];
};

export default function AuditLogsTable({
  logs,
}: AuditLogsTableProps) {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] =
    useState("all");

  const [selectedLog, setSelectedLog] =
    useState<AuditLog | null>(null);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const searchValue = search.toLowerCase();

      const matchesSearch =
        log.description
          ?.toLowerCase()
          .includes(searchValue) ||
        log.entity_type
          .toLowerCase()
          .includes(searchValue) ||
        log.action
          .toLowerCase()
          .includes(searchValue) ||
        log.profiles?.full_name
          ?.toLowerCase()
          .includes(searchValue) 
        
          
        ;

      const matchesAction =
        actionFilter === "all" ||
        log.action === actionFilter;

      return matchesSearch && matchesAction;
    });
  }, [logs, search, actionFilter]);

  const actions = Array.from(
    new Set(logs.map((log) => log.action)),
  );

  return (
    <>
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row dark:border-slate-800">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

            <input
              type="search"
              placeholder="Search audit logs..."
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <select
            value={actionFilter}
            onChange={(event) =>
              setActionFilter(event.target.value)
            }
            className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          >
            <option value="all">
              All actions
            </option>

            {actions.map((action) => (
              <option key={action} value={action}>
                {formatLabel(action)}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead className="bg-slate-50 dark:bg-slate-950">
              <tr>
                <TableHeading>Date</TableHeading>
                <TableHeading>User</TableHeading>
                <TableHeading>Action</TableHeading>
                <TableHeading>Entity</TableHeading>
                <TableHeading>Description</TableHeading>
                <TableHeading>
                  <span className="sr-only">
                    Details
                  </span>
                </TableHeading>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {filteredLogs.map((log) => (
                <tr
                  key={log.id}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <TableCell>
                    {formatDate(log.created_at)}
                  </TableCell>

                  <TableCell>
                    <div>
                      <p className="font-medium text-slate-900 dark:text-slate-100">
                        {log.profiles?.full_name ??
                          "Unknown user"}
                      </p>

                      
                    </div>
                  </TableCell>

                  <TableCell>
                    <ActionBadge action={log.action} />
                  </TableCell>

                  <TableCell>
                    {formatLabel(log.entity_type)}
                  </TableCell>

                  <TableCell>
                    <p className="max-w-md truncate">
                      {log.description ?? "—"}
                    </p>
                  </TableCell>

                  <TableCell>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedLog(log)
                      }
                      className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-800"
                      aria-label="View audit log"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  </TableCell>
                </tr>
              ))}

              {filteredLogs.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-sm text-slate-500"
                  >
                    No audit logs found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedLog && (
        <AuditLogDialog
          log={selectedLog}
          onClose={() => setSelectedLog(null)}
        />
      )}
    </>
  );
}

function TableHeading({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
      {children}
    </th>
  );
}

function TableCell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
      {children}
    </td>
  );
}

function ActionBadge({
  action,
}: {
  action: string;
}) {
  const styles: Record<string, string> = {
    create:
      "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300",

    update:
      "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",

    delete:
      "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",

    cancel:
      "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",

    return:
      "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300",

    stock_adjustment:
      "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
        styles[action] ??
        "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
      }`}
    >
      {formatLabel(action)}
    </span>
  );
}

function AuditLogDialog({
  log,
  onClose,
}: {
  log: AuditLog;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Audit Log Details
            </h2>

            <p className="text-sm text-slate-500">
              {formatDate(log.created_at)}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <Detail label="User">
            {log.profiles?.full_name ??
              "Unknown user"}
          </Detail>

          <Detail label="Action">
            {formatLabel(log.action)}
          </Detail>

          <Detail label="Entity">
            {formatLabel(log.entity_type)}
          </Detail>

          <Detail label="Description">
            {log.description ?? "—"}
          </Detail>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Metadata
            </p>

           <div className="space-y-3">
  {log.metadata &&
    Object.entries(log.metadata as Record<string, unknown>).map(
      ([key, value]) => (
        <div
          key={key}
          className="flex items-center justify-between border-b py-2"
        >
          <span className="font-medium capitalize">
            {key.replace(/_/g, " ")}
          </span>

          <span className="text-gray-600">
            {String(value)}
          </span>
        </div>
      )
    )}
</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>

      <div className="mt-1 text-sm text-slate-900 dark:text-slate-100">
        {children}
      </div>
    </div>
  );
}

function formatLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase(),
    );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}