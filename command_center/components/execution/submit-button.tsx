"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useFormStatus } from "react-dom";

type SubmitButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  pendingLabel?: ReactNode;
};

export function SubmitButton({
  children,
  disabled,
  pendingLabel = "Saving...",
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button disabled={disabled || pending} {...props}>
      {pending ? pendingLabel : children}
    </button>
  );
}
