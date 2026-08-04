"use client";

import { useActionState } from "react";
import { createSeasonAction } from "@/app/library/seasons/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  formatSeasonStatus,
  seasonIconOptions,
  seasonStatuses,
  seasonThemeColors
} from "@/lib/season-options";

export function SeasonForm() {
  const [state, formAction, pending] = useActionState(createSeasonAction, {
    ok: true,
    error: ""
  });

  return (
    <form action={formAction} className="space-y-3">
      <Input name="title" placeholder="Season title" required />
      <Textarea
        name="description"
        placeholder="What belongs in this season?"
        rows={3}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Started
          <Input name="startedAt" type="date" />
        </label>
        <label className="grid gap-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Completed
          <Input name="completedAt" type="date" />
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          defaultValue="ACTIVE"
          name="status"
        >
          {seasonStatuses.map((status) => (
            <option key={status} value={status}>
              {formatSeasonStatus(status)}
            </option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          defaultValue="Building"
          name="icon"
        >
          {seasonIconOptions.map((icon) => (
            <option key={icon} value={icon}>
              {icon}
            </option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          defaultValue={seasonThemeColors[0].value}
          name="themeColor"
        >
          {seasonThemeColors.map((color) => (
            <option key={color.value} value={color.value}>
              {color.label}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input className="h-4 w-4" name="isCurrent" type="checkbox" />
        Make this the current season
      </label>
      {!state.ok && <p className="text-sm text-destructive">{state.error}</p>}
      <Button disabled={pending} type="submit">
        Add Season
      </Button>
    </form>
  );
}
