"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";

import { updateOrderStatus } from "@/app/(dashboard)/dashboard/orders/actions";

type OrderStatus =
  | "new"
  | "pending"
  | "completed"
  | "cancelled"
  | "refunded";

const editableStatuses: OrderStatus[] = [
  "new",
  "pending",
  "completed",
];

export default function OrderStatusSelect({
  orderId,
  status,
}: {
  orderId: string;
  status: OrderStatus;
}) {
  const formRef =
    useRef<HTMLFormElement>(null);

  const [selectedStatus, setSelectedStatus] =
    useState(status);

  const [isPending, startTransition] =
    useTransition();

  useEffect(() => {
    setSelectedStatus(status);
  }, [status]);

  const isLocked =
    status === "cancelled" ||
    status === "refunded";

  function handleChange(
    event: React.ChangeEvent<HTMLSelectElement>,
  ) {
    const nextStatus =
      event.target.value as OrderStatus;

    setSelectedStatus(nextStatus);

    const formData = new FormData();
    formData.set("orderId", orderId);
    formData.set("status", nextStatus);

    startTransition(async () => {
      try {
        await updateOrderStatus(formData);
      } catch (error) {
        setSelectedStatus(status);

        alert(
          error instanceof Error
            ? error.message
            : "Unable to update status.",
        );
      }
    });
  }

  return (
    <form ref={formRef}>
      <input
        type="hidden"
        name="orderId"
        value={orderId}
      />

      <select
        name="status"
        value={selectedStatus}
        onChange={handleChange}
        disabled={isPending || isLocked}
        aria-label="Change order status"
        className={`cursor-pointer rounded-full border px-3 py-2 text-sm font-semibold outline-none transition disabled:cursor-not-allowed disabled:opacity-70 ${
          selectedStatus === "completed"
            ? "border-green-200 bg-green-50 text-green-700"
            : selectedStatus === "cancelled"
              ? "border-red-200 bg-red-50 text-red-700"
              : selectedStatus === "pending"
                ? "border-amber-200 bg-amber-50 text-amber-700"
                : selectedStatus === "refunded"
                  ? "border-purple-200 bg-purple-50 text-purple-700"
                  : "border-blue-200 bg-blue-50 text-blue-700"
        }`}
      >
        {editableStatuses.map((item) => (
          <option key={item} value={item}>
            {item.charAt(0).toUpperCase() +
              item.slice(1)}
          </option>
        ))}

        {status === "cancelled" && (
          <option value="cancelled">
            Cancelled
          </option>
        )}

        {status === "refunded" && (
          <option value="refunded">
            Refunded
          </option>
        )}
      </select>
    </form>
  );
}