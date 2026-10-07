"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import AddFoodModal from "@/components/AddFoodModal";
import {
  entryAmount,
  MEALS,
  round1,
  todayString,
  type MacroKey,
  type MealEntry,
  type MealType,
} from "@/lib/meals";

const SUMMARY: { key: MacroKey; label: string; unit: string }[] = [
  { key: "carbohydrates", label: "碳水化合物", unit: "g" },
  { key: "fat", label: "脂肪", unit: "g" },
  { key: "proteins", label: "蛋白質", unit: "g" },
  { key: "energyKcal", label: "熱量", unit: "kcal" },
];

const noopSubscribe = () => () => {};

function total(entries: MealEntry[], key: MacroKey): number {
  return round1(entries.reduce((sum, e) => sum + entryAmount(e, key), 0));
}

export default function Home() {
  // 以使用者裝置的時區決定「今天」;伺服器端時區可能不同,先回傳空字串避免 hydration 不一致
  const date = useSyncExternalStore(noopSubscribe, todayString, () => "");
  const [entries, setEntries] = useState<MealEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // null 表示新增視窗關閉;否則為要新增到哪一餐
  const [addingTo, setAddingTo] = useState<MealType | null>(null);

  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    fetch(`/api/meals?date=${date}`)
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) setError(data.error ?? "讀取飲食紀錄失敗");
        else setEntries(data as MealEntry[]);
      })
      .catch(() => {
        if (!cancelled) setError("網路連線發生問題,請重新整理頁面");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date]);

  async function handleDelete(entry: MealEntry) {
    // 先從畫面移除,失敗再放回去
    setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    setError(null);
    try {
      const res = await fetch(`/api/meals/${entry.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) throw new Error();
    } catch {
      setEntries((prev) =>
        [...prev, entry].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      );
      setError("刪除紀錄失敗,請稍後再試");
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-10 font-sans dark:bg-black sm:px-8">
      <div className="flex w-full max-w-xl flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            ai-BiteTrack
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {date} · 今日飲食紀錄
          </p>
        </header>

        <section className="flex flex-col gap-3 rounded-2xl border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-zinc-900">
          <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            今日攝取
          </h2>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {SUMMARY.map(({ key, label, unit }) => (
              <div
                key={key}
                className="flex flex-col gap-0.5 rounded-xl bg-zinc-100 px-3 py-2.5 dark:bg-zinc-800"
              >
                <dt className="text-xs text-zinc-600 dark:text-zinc-400">{label}</dt>
                <dd className="text-xl font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
                  {total(entries, key)}
                  <span className="ml-1 text-xs font-normal text-zinc-500">{unit}</span>
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {error && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
            {error}
          </p>
        )}

        {MEALS.map(({ key: meal, label }) => {
          const items = entries.filter((e) => e.meal === meal);
          return (
            <section
              key={meal}
              className="flex flex-col gap-3 rounded-2xl border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-zinc-900"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col">
                  <h2 className="font-semibold text-zinc-950 dark:text-zinc-50">{label}</h2>
                  <p className="text-xs tabular-nums text-zinc-500">
                    {total(items, "energyKcal")} kcal · 碳水 {total(items, "carbohydrates")} g · 脂肪 {total(items, "fat")} g · 蛋白質 {total(items, "proteins")} g
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAddingTo(meal)}
                  className="shrink-0 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
                >
                  + 新增
                </button>
              </div>

              {loading ? (
                <p className="text-sm text-zinc-500">載入中…</p>
              ) : items.length === 0 ? (
                <p className="text-sm text-zinc-500">尚未記錄</p>
              ) : (
                <ul className="flex flex-col divide-y divide-black/[.06] dark:divide-white/[.08]">
                  {items.map((entry) => (
                    <li key={entry.id} className="flex items-center gap-3 py-2.5">
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <p className="truncate text-sm font-medium text-zinc-950 dark:text-zinc-50">
                          {entry.name}
                          {entry.servings !== 1 && (
                            <span className="ml-1.5 font-normal text-zinc-500">
                              × {entry.servings}
                            </span>
                          )}
                        </p>
                        <p className="text-xs tabular-nums text-zinc-500">
                          {round1(entryAmount(entry, "energyKcal"))} kcal · 碳水 {round1(entryAmount(entry, "carbohydrates"))} g · 脂肪 {round1(entryAmount(entry, "fat"))} g · 蛋白質 {round1(entryAmount(entry, "proteins"))} g
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleDelete(entry)}
                        aria-label={`刪除 ${entry.name}`}
                        className="shrink-0 rounded-full px-2 text-xl leading-none text-zinc-400 hover:text-red-600 dark:hover:text-red-400"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {addingTo !== null && (
        <AddFoodModal
          meal={addingTo}
          date={date}
          onClose={() => setAddingTo(null)}
          onAdded={(entry) => setEntries((prev) => [...prev, entry])}
        />
      )}
    </div>
  );
}
