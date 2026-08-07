"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  addWisdomReflectionAction,
  shuffleTodayPrincipleAction,
  toggleWisdomActiveAction,
  toggleWisdomFavoriteAction
} from "@/app/library/wisdom/actions";
import { Button } from "@/components/ui/button";
import { formatWisdomSourceType, parseWisdomTags } from "@/lib/wisdom-options";

type TodayPrinciple = {
  id: string;
  title: string;
  idea: string;
  takeaway: string | null;
  application: string | null;
  category: string;
  sourceType: string;
  sourceName: string | null;
  favorite: boolean;
  active: boolean;
  tags: string | null;
  reflections: { id: string; text: string; createdAt: Date }[];
};

function ReflectionForm({ wisdomId }: { wisdomId: string }) {
  const [state, formAction, pending] = useActionState(
    addWisdomReflectionAction.bind(null, wisdomId),
    { ok: true, error: "" }
  );

  return (
    <form action={formAction} className="mt-3 grid gap-2">
      <textarea
        className="min-h-20 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-white placeholder:text-slate-500"
        name="text"
        placeholder="What does this mean for me today?"
        required
      />
      {!state.ok && <p className="text-xs text-red-300">{state.error}</p>}
      <div className="flex justify-end">
        <Button className="h-8 rounded-xl text-xs" disabled={pending} type="submit">
          Save Reflection
        </Button>
      </div>
    </form>
  );
}

export function TodayPrincipleCard({
  principle
}: {
  principle: TodayPrinciple | null;
}) {
  const [reflectOpen, setReflectOpen] = useState(false);

  if (!principle) {
    return (
      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950 p-4 text-white">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200/80">
          Today&apos;s Principle
        </p>
        <p className="mt-2 text-sm text-slate-300">
          No active principles yet. Capture one in Library when an idea is worth
          carrying forward.
        </p>
        <Button asChild className="mt-3 h-8 rounded-xl text-xs" variant="outline">
          <Link href="/library/wisdom">Open Wisdom</Link>
        </Button>
      </section>
    );
  }

  const tags = parseWisdomTags(principle.tags);

  return (
    <section className="rounded-[1.5rem] border border-emerald-200/15 bg-slate-950 p-4 text-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200/80">
            Today&apos;s Principle
          </p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight">
            {principle.title}
          </h3>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <form action={shuffleTodayPrincipleAction.bind(null, principle.id)}>
            <Button className="h-8 rounded-xl text-xs" type="submit" variant="outline">
              Next
            </Button>
          </form>
          <form action={toggleWisdomFavoriteAction.bind(null, principle.id)}>
            <Button className="h-8 rounded-xl text-xs" type="submit" variant="outline">
              {principle.favorite ? "Starred" : "Favorite"}
            </Button>
          </form>
        </div>
      </div>

      <p className="mt-3 text-sm leading-6 text-slate-200">{principle.idea}</p>
      {principle.takeaway && (
        <p className="mt-2 text-sm leading-6 text-slate-400">
          {principle.takeaway}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
        <span>{principle.category}</span>
        <span>{formatWisdomSourceType(principle.sourceType)}</span>
        {principle.sourceName && <span>{principle.sourceName}</span>}
        {tags.slice(0, 2).map((tag) => (
          <span key={tag}>#{tag}</span>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <form action={toggleWisdomActiveAction.bind(null, principle.id)}>
          <Button className="h-8 rounded-xl text-xs" type="submit" variant="outline">
            {principle.active ? "Active" : "Keep Active"}
          </Button>
        </form>
        <Button
          className="h-8 rounded-xl text-xs"
          onClick={() => setReflectOpen((current) => !current)}
          type="button"
          variant="outline"
        >
          Reflect
        </Button>
        <Button asChild className="h-8 rounded-xl text-xs" variant="outline">
          <Link href={`/library/wisdom?entry=${principle.id}`}>Open full entry</Link>
        </Button>
      </div>

      {reflectOpen && <ReflectionForm wisdomId={principle.id} />}

      {principle.reflections[0] && (
        <p className="mt-3 border-t border-white/10 pt-3 text-xs leading-5 text-slate-400">
          Last reflection: {principle.reflections[0].text}
        </p>
      )}
    </section>
  );
}
