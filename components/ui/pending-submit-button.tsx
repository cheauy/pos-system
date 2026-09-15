"use client";

import type {
  ButtonHTMLAttributes,
  ReactNode,
} from "react";

import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";

type PendingSubmitButtonProps =
  ButtonHTMLAttributes<HTMLButtonElement> & {
    children: ReactNode;
    pendingText?: string;
    icon?: ReactNode;
  };

export function PendingSubmitButton({
  children,
  pendingText = "Processing...",
  icon,
  className = "",
  disabled,
  ...props
}: PendingSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={`
        inline-flex items-center justify-center gap-2
        transition
        disabled:cursor-not-allowed
        disabled:opacity-60
        ${className}
      `}
      {...props}
    >
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          {pendingText}
        </>
      ) : (
        <>
          {icon}
          {children}
        </>
      )}
    </button>
  );
}