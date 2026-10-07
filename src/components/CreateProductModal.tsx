"use client";

import { useEffect, useRef, useState } from "react";
import { normalizeDecimal } from "@/lib/decimal";
import { addProduct } from "@/lib/products";

const FIXED_FIELDS = [
  { key: "totalGrams", label: "總克數", unit: "g" },
  { key: "energyKcal", label: "熱量", unit: "kcal" },
  { key: "proteins", label: "蛋白質", unit: "g" },
  { key: "fat", label: "脂肪", unit: "g" },
  { key: "carbohydrates", label: "碳水化合物", unit: "g" },
] as const;

type FixedKey = (typeof FIXED_FIELDS)[number]["key"];

const EMPTY_FIXED: Record<FixedKey, string> = {
  totalGrams: "",
  energyKcal: "",
  proteins: "",
  fat: "",
  carbohydrates: "",
};

const inputClass =
  "w-full rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-950 dark:border-white/[.145] dark:text-zinc-50 dark:focus:border-zinc-50";

export default function CreateProductModal({
  open,
  onClose,
  initialBarcode = "",
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  initialBarcode?: string;
  onCreated?: (barcode: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [barcode, setBarcode] = useState(initialBarcode);
  const [name, setName] = useState("");
  const [fixed, setFixed] = useState(EMPTY_FIXED);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function reset() {
    setBarcode("");
    setName("");
    setFixed(EMPTY_FIXED);
    setError(null);
  }

  function handleClose() {
    if (saving) return;
    reset();
    onClose();
  }

  async function handleSubmit() {
    const code = barcode.trim();
    if (!/^\d{8,14}$/.test(code)) {
      setError("請輸入 8 到 14 位數字的條碼");
      return;
    }

    // 以字串送出,保留使用者輸入的小數位數
    const amounts = {} as Record<FixedKey, string>;
    for (const { key, label } of FIXED_FIELDS) {
      const n = normalizeDecimal(fixed[key]);
      if (n === null) {
        setError(`請填寫「${label}」,須為不小於 0 的數字`);
        return;
      }
      amounts[key] = n;
    }

    // 重複條碼由伺服器端的唯一索引把關
    setSaving(true);
    setError(null);
    const saveError = await addProduct({
      barcode: code,
      name: name.trim(),
      ...amounts,
    });
    setSaving(false);
    if (saveError) {
      setError(saveError);
      return;
    }
    reset();
    onClose();
    onCreated?.(code);
  }

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault();
        handleClose();
      }}
      onClick={(e) => {
        // 點擊背景遮罩時關閉
        if (e.target === e.currentTarget) handleClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl bg-white p-0 text-zinc-950 backdrop:bg-black/50 dark:bg-zinc-900 dark:text-zinc-50"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit();
        }}
        className="flex max-h-[85vh] flex-col"
      >
        <header className="flex items-center justify-between border-b border-black/[.08] px-5 py-4 dark:border-white/[.145]">
          <h2 className="text-lg font-semibold">建立商品</h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="關閉"
            className="rounded-full px-2 text-xl leading-none text-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-50"
          >
            ×
          </button>
        </header>

        <div className="flex flex-col gap-5 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-600 dark:text-zinc-400">商品條碼 *</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="例如 4710088425556"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value.replace(/\D/g, ""))}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-600 dark:text-zinc-400">商品名稱</span>
              <input
                type="text"
                placeholder="選填"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
              />
            </label>
          </div>

          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              營養成分
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {FIXED_FIELDS.map(({ key, label, unit }) => (
                <label key={key} className="flex flex-col gap-1 text-sm">
                  <span className="text-zinc-600 dark:text-zinc-400">
                    {label} ({unit}) *
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    value={fixed[key]}
                    onChange={(e) =>
                      setFixed((prev) => ({ ...prev, [key]: e.target.value }))
                    }
                    className={inputClass}
                  />
                </label>
              ))}
            </div>
          </section>

          {error && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
              {error}
            </p>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-black/[.08] px-5 py-4 dark:border-white/[.145]">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-full border border-black/[.08] px-5 py-2.5 text-sm font-medium hover:bg-zinc-100 dark:border-white/[.145] dark:hover:bg-zinc-800"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
          >
            {saving ? "建立中…" : "建立"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
