import * as React from "react";
import { cn } from "@/lib/utils";

type SwitchProps = {
  checked: boolean;
  name: string;
  label?: string;
};

export function Switch({ checked, name, label }: SwitchProps) {
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <input type="hidden" name={name} value={checked ? "true" : "false"} />
      <span
        className={cn(
          "inline-flex h-6 w-11 items-center rounded-full border p-1",
          checked ? "bg-primary/30" : "bg-muted"
        )}
      >
        <span className={cn("h-4 w-4 rounded-full bg-white transition-transform", checked ? "translate-x-5" : "")} />
      </span>
      {label ? <span>{label}</span> : null}
    </label>
  );
}
