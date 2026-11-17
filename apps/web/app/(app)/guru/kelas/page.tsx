"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { EmptyState } from "../../../../components/ui/empty-state";
import { SkeletonRows } from "../../../../components/ui/skeleton";
import { ErrorState } from "../../../../components/ui/state-panels";
import { api } from "../../../../lib/api";
import { t } from "../../../../lib/i18n";

interface ClassRow {
  id: string;
  name: string;
  grade: number;
  homeroomTeacherName: string | null;
  studentCount: number;
}

/** Kelas yang boleh dilihat guru: kelas perwalian dan kelas yang diajar (disaring server oleh AccessPolicy). */
export default function TeacherClassesPage() {
  const query = useQuery({
    queryKey: ["teacher-classes"],
    queryFn: () => api<{ data: ClassRow[] }>("/classes", { query: { pageSize: 100 } }),
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-h1">{t("teacher.classesTitle")}</h1>
      {query.isLoading ? (
        <SkeletonRows rows={4} />
      ) : query.isError ? (
        <ErrorState onRetry={() => void query.refetch()} />
      ) : query.data!.data.length === 0 ? (
        <EmptyState title={t("home.comingTitle")} description={t("teacher.classesEmpty")} />
      ) : (
        <ul className="border-y border-line bg-surface">
          {query.data!.data.map((c) => (
            <li key={c.id} className="border-b border-line last:border-b-0">
              <Link
                href={`/guru/kelas/${c.id}`}
                className="flex min-h-14 items-center justify-between gap-4 px-4 py-3 hover:bg-primary-tint"
              >
                <span className="flex flex-col">
                  <span className="text-body font-semibold">{c.name}</span>
                  <span className="text-sm text-ink-2">
                    {c.homeroomTeacherName ?? "-"} · {c.studentCount}
                  </span>
                </span>
                <ChevronRight aria-hidden className="size-5 text-ink-2" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
