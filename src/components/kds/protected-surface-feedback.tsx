"use client";

import { ShieldAlert } from "lucide-react";
import Link from "next/link";

import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import type { ProtectedRouteFeedback } from "@/src/lib/fetch-json";

export function ProtectedSurfaceBanner({
  feedback,
}: {
  feedback: ProtectedRouteFeedback;
}) {
  return (
    <Card className="border-[color-mix(in_oklab,var(--accent-warm)_44%,white)] bg-[color-mix(in_oklab,var(--accent-warm)_12%,white)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 text-[color-mix(in_oklab,var(--accent-warm)_84%,black)]">
            <ShieldAlert className="size-4" />
            <p className="font-semibold uppercase tracking-[0.16em]">
              {feedback.title}
            </p>
          </div>
          <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
            {feedback.description}
          </p>
        </div>
        <Button asChild size="sm" variant="secondary">
          <Link href={feedback.actionHref}>{feedback.actionLabel}</Link>
        </Button>
      </div>
    </Card>
  );
}

export function ProtectedSurfaceFallback({
  feedback,
}: {
  feedback: ProtectedRouteFeedback;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <Card className="w-full max-w-xl space-y-4 p-8 text-center">
        <div className="flex items-center justify-center gap-2 text-[var(--accent-hot)]">
          <ShieldAlert className="size-5" />
          <p className="font-mono text-sm uppercase tracking-[0.26em]">
            {feedback.title}
          </p>
        </div>
        <p className="text-sm leading-6 text-[var(--ink-soft)]">
          {feedback.description}
        </p>
        <Button asChild>
          <Link href={feedback.actionHref}>{feedback.actionLabel}</Link>
        </Button>
      </Card>
    </main>
  );
}
