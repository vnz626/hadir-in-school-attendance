"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { X } from "lucide-react";
import { api } from "../../lib/api";
import { t } from "../../lib/i18n";
import { REF_SOURCES, type RefKey, type Row } from "../../lib/resources";
import { cn } from "../../lib/cn";

interface Page {
  data: Row[];
}

/**
 * Pemilih rujukan dengan pencarian (siswa bisa ratusan, jadi bukan <select> penuh). Berperan sebagai
 * combobox: ketik untuk mencari, pilih dari daftar, Esc menutup.
 */
export function RefPicker({
  source,
  label,
  value,
  valueLabel,
  onChange,
  required,
  error,
}: {
  source: RefKey;
  label: string;
  value: string | null;
  valueLabel: string | null;
  onChange: (id: string | null, label: string | null) => void;
  required?: boolean;
  error?: string;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const def = REF_SOURCES[source];

  useEffect(() => {
    const h = setTimeout(() => setDebounced(term), 250);
    return () => clearTimeout(h);
  }, [term]);

  const results = useQuery({
    queryKey: ["ref", source, debounced],
    queryFn: () => api<Page>(def.path, { query: { q: debounced, pageSize: 8 } }),
    enabled: open,
    staleTime: 10_000,
  });

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm text-ink">
        {label}
        {required ? null : (
          <span className="text-ink-2"> ({t("common.optional").toLowerCase()})</span>
        )}
      </label>

      {value && !open ? (
        <div className="flex h-11 items-center justify-between gap-2 rounded-sm border border-line-strong bg-surface px-3 text-base">
          <span className="truncate">{valueLabel ?? value}</span>
          <span className="flex items-center">
            <button
              type="button"
              className="min-h-11 px-2 text-sm font-semibold text-primary"
              onClick={() => {
                setTerm("");
                setOpen(true);
              }}
            >
              {t("common.edit")}
            </button>
            {!required ? (
              <button
                type="button"
                aria-label={t("common.delete")}
                className="flex size-11 items-center justify-center text-ink-2"
                onClick={() => onChange(null, null)}
              >
                <X aria-hidden className="size-4" />
              </button>
            ) : null}
          </span>
        </div>
      ) : (
        <div className="relative">
          <input
            id={id}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-invalid={error ? true : undefined}
            autoComplete="off"
            placeholder={t("master.searchRef")}
            value={term}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setTerm(e.target.value);
              setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
            }}
            className={cn(
              "h-11 w-full rounded-sm border bg-surface px-3 text-base placeholder:text-ink-3",
              error ? "border-status-absent-fg" : "border-line-strong",
            )}
          />
          {open ? (
            <ul
              id={listId}
              role="listbox"
              className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-sm border border-line bg-surface shadow-float"
            >
              {results.isLoading ? (
                <li className="px-3 py-3 text-sm text-ink-2">{t("common.loading")}</li>
              ) : results.data && results.data.data.length > 0 ? (
                results.data.data.map((row) => (
                  <li key={row.id} role="option" aria-selected={row.id === value}>
                    <button
                      type="button"
                      className="flex min-h-11 w-full items-center px-3 text-left text-sm hover:bg-primary-tint"
                      onClick={() => {
                        onChange(row.id, def.label(row));
                        setOpen(false);
                        setTerm("");
                      }}
                    >
                      {def.label(row)}
                    </button>
                  </li>
                ))
              ) : (
                <li className="px-3 py-3 text-sm text-ink-2">{t("common.noResults")}</li>
              )}
            </ul>
          ) : null}
        </div>
      )}
      <p aria-live="polite" className="text-caption text-status-absent-fg">
        {error}
      </p>
    </div>
  );
}
