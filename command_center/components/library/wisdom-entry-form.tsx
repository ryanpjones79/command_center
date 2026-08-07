"use client";

import { useActionState } from "react";
import { createWisdomEntryAction } from "@/app/library/wisdom/actions";
import { Button } from "@/components/ui/button";
import { wisdomCategories, wisdomSourceTypes } from "@/lib/wisdom-options";

export function WisdomEntryForm() {
  const [state, formAction, pending] = useActionState(
    createWisdomEntryAction,
    { ok: true, error: "" }
  );

  return (
    <form action={formAction} className="grid gap-4">
      <input name="status" type="hidden" value="library" />
      <label className="grid gap-2 text-sm font-medium">
        Short title / principle
        <input
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          name="title"
          placeholder="Control what you can control"
          required
        />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Main idea or quote
        <textarea
          className="min-h-28 rounded-md border border-input bg-background px-3 py-2 text-sm"
          name="idea"
          placeholder="The idea worth carrying forward."
          required
        />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        My Takeaway
        <textarea
          className="min-h-24 rounded-md border border-input bg-background px-3 py-2 text-sm"
          name="takeaway"
          placeholder="What this means in my own words."
        />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        How I Can Use This
        <textarea
          className="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm"
          name="application"
          placeholder="Optional practical application."
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          Source type
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            defaultValue="book"
            name="sourceType"
          >
            {wisdomSourceTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Category
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            defaultValue="Mindset"
            name="category"
          >
            {wisdomCategories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          Source name/title
          <input
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            name="sourceName"
            placeholder="Meditations, podcast episode, etc."
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Author/person
          <input
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            name="author"
            placeholder="Marcus Aurelius, friend, customer"
          />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-2 text-sm font-medium">
          Page/reference
          <input
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            name="reference"
            placeholder="p. 42"
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Date captured
          <input
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            name="capturedAt"
            type="date"
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Tags
          <input
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            name="tags"
            placeholder="attention, patience"
          />
        </label>
      </div>
      <label className="grid gap-2 text-sm font-medium">
        Photo/reference URL
        <input
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          name="photoUrl"
          placeholder="Optional image URL or file reference"
        />
      </label>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="inline-flex items-center gap-2">
          <input className="h-4 w-4" name="favorite" type="checkbox" />
          Favorite / starred
        </label>
        <label className="inline-flex items-center gap-2">
          <input className="h-4 w-4" name="active" type="checkbox" />
          Active principle
        </label>
      </div>
      {!state.ok && <p className="text-sm text-destructive">{state.error}</p>}
      {state.ok && !pending && <p className="text-sm text-muted-foreground">Wisdom becomes useful when it resurfaces.</p>}
      <Button disabled={pending} type="submit">
        Save Principle
      </Button>
    </form>
  );
}
