"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { t } from "../../lib/i18n";

interface ToastItem {
  id: number;
  message: string;
  onUndo?: () => void;
}

interface ToastApi {
  show: (message: string, opts?: { onUndo?: () => void }) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const DURATION_MS = 4000;

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast harus dipakai di dalam ToastProvider");
  return ctx;
}

/**
 * Toast kiri bawah di desktop, atas di mobile; hilang dalam 4 detik (Rancangan §4.6).
 * Diumumkan lewat aria-live="polite". Tombol "Batalkan" hanya bila aksi bisa dibatalkan.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback(
    (id: number) => setItems((cur) => cur.filter((i) => i.id !== id)),
    [],
  );

  const show = useCallback<ToastApi["show"]>(
    (message, opts) => {
      const id = nextId.current++;
      setItems((cur) => [...cur, { id, message, onUndo: opts?.onUndo }]);
      setTimeout(() => dismiss(id), DURATION_MS);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 top-4 z-50 flex flex-col gap-2 lg:inset-x-auto lg:bottom-4 lg:left-4 lg:top-auto lg:w-96"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className="pointer-events-auto flex items-center justify-between gap-3 rounded-sm bg-ink px-4 py-3 text-sm text-white shadow-float"
          >
            <span>{item.message}</span>
            {item.onUndo ? (
              <button
                type="button"
                className="min-h-11 shrink-0 rounded-sm px-2 font-semibold underline"
                onClick={() => {
                  item.onUndo?.();
                  dismiss(item.id);
                }}
              >
                {t("common.undo")}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
