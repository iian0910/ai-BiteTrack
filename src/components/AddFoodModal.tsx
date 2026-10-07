"use client";

import { useEffect, useRef, useState } from "react";
import BarcodeScanner from "@/components/BarcodeScanner";
import ManualFoodModal from "@/components/ManualFoodModal";
import {
  MEALS,
  round1,
  toMacros,
  type AddMealRequest,
  type FoodResult,
  type MealEntry,
  type MealType,
} from "@/lib/meals";

// 查無資料時記下查詢條件,供「手動新增」帶入表單
type Query = { barcode: string; name: string };

const inputClass =
  "rounded-full border border-black/[.08] bg-transparent px-4 py-2.5 text-sm text-zinc-950 outline-none focus:border-zinc-950 dark:border-white/[.145] dark:text-zinc-50 dark:focus:border-zinc-50";

const secondaryButtonClass =
  "rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-300 dark:hover:bg-[#1a1a1a]";

function macroSummary(food: FoodResult): string {
  const m = toMacros(food.nutriments);
  const fmt = (n: number | null) => (n === null ? "—" : round1(n));
  return `${fmt(m.energyKcal)} kcal · 碳水 ${fmt(m.carbohydrates)} g · 脂肪 ${fmt(m.fat)} g · 蛋白質 ${fmt(m.proteins)} g`;
}

export default function AddFoodModal({
  meal,
  date,
  onClose,
  onAdded,
}: {
  meal: MealType;
  date: string;
  onClose: () => void;
  onAdded: (entry: MealEntry) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [nameInput, setNameInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<FoodResult[]>([]);
  const [notFound, setNotFound] = useState<Query | null>(null);
  const [scanning, setScanning] = useState(false);
  // null 表示手動新增視窗關閉
  const [createInitial, setCreateInitial] = useState<Query | null>(null);
  const [selected, setSelected] = useState<FoodResult | null>(null);
  // 上次名稱查詢的結果只來自資料庫時記下關鍵字,供「搜尋更多」使用
  const [localOnlyKeyword, setLocalOnlyKeyword] = useState<string | null>(null);
  const [servings, setServings] = useState("1");
  const [saving, setSaving] = useState(false);

  const mealLabel = MEALS.find((m) => m.key === meal)?.label ?? "";

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  function handleClose() {
    if (saving) return;
    onClose();
  }

  async function runSearch(url: string, query: Query) {
    setLoading(true);
    setError(null);
    setResults([]);
    setNotFound(null);
    setSelected(null);
    setLocalOnlyKeyword(null);

    try {
      const res = await fetch(url);
      const data = await res.json();
      if (res.status === 404 && data.notFound) {
        setNotFound(query);
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "查詢失敗,請稍後再試");
        return;
      }
      // 名稱查詢回傳 { source, results };條碼查詢回傳單一商品
      const list: FoodResult[] = Array.isArray(data.results) ? data.results : [data];
      setResults(list);
      // 結果只來自資料庫時,提供「搜尋更多」改查線上資料庫
      setLocalOnlyKeyword(data.source === "local" ? query.name : null);
      // 只有一筆時直接選取,少點一下
      if (list.length === 1) setSelected(list[0]);
    } catch {
      setError("網路連線發生問題,請稍後再試");
    } finally {
      setLoading(false);
    }
  }

  /** 模糊搜尋;online 為 true 時略過資料庫,直接搜尋線上資料庫 */
  function searchByName(target = nameInput.trim(), online = false) {
    if (!target) {
      setError("請輸入商品名稱");
      return;
    }
    const scope = online ? "&scope=off" : "";
    void runSearch(`/api/nutrition?name=${encodeURIComponent(target)}${scope}`, {
      barcode: "",
      name: target,
    });
  }

  function searchByBarcode(code: string) {
    void runSearch(`/api/nutrition/${code}`, { barcode: code, name: "" });
  }

  /**
   * 將食物加入這一餐,成功後關閉視窗;失敗時回傳錯誤訊息。
   * 伺服器會同時把食物存入 foods,之後以名稱或條碼都能直接從資料庫查到
   */
  async function saveToMeal(food: FoodResult, count: number): Promise<string | null> {
    const entry: AddMealRequest = {
      date,
      meal,
      barcode: food.barcode,
      name: food.productName,
      servings: count,
      servingSize: food.servingSize,
      nutriments: toMacros(food.nutriments),
      brands: food.brands,
      quantity: food.quantity,
      imageUrl: food.imageUrl,
      source: food.source,
    };

    setSaving(true);
    try {
      const res = await fetch("/api/meals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        return (data as { error?: string } | null)?.error ?? "新增紀錄失敗,請稍後再試";
      }
      onAdded(data as MealEntry);
      onClose();
      return null;
    } catch {
      return "網路連線發生問題,請稍後再試";
    } finally {
      setSaving(false);
    }
  }

  /** 將選取的查詢結果以下方填寫的份數加入 */
  async function handleAddSelected() {
    if (!selected) return;
    const count = Number(servings);
    if (!Number.isFinite(count) || count <= 0) {
      setError("份數須為大於 0 的數字");
      return;
    }
    setError(null);
    setError(await saveToMeal(selected, count));
  }

  return (
    <>
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
        <div className="flex max-h-[85vh] flex-col">
          <header className="flex items-center justify-between border-b border-black/[.08] px-5 py-4 dark:border-white/[.145]">
            <h2 className="text-lg font-semibold">新增{mealLabel}</h2>
            <button
              type="button"
              onClick={handleClose}
              aria-label="關閉"
              className="rounded-full px-2 text-xl leading-none text-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-50"
            >
              ×
            </button>
          </header>

          <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                searchByName();
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                placeholder="輸入商品名稱關鍵字"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className={`min-w-0 flex-1 ${inputClass}`}
              />
              <button
                type="submit"
                disabled={loading}
                className="shrink-0 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
              >
                {loading ? "查詢中…" : "查詢"}
              </button>
            </form>

            {scanning ? (
              <BarcodeScanner
                onClose={() => setScanning(false)}
                onDetected={(code) => {
                  setScanning(false);
                  searchByBarcode(code);
                }}
              />
            ) : (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setScanning(true);
                  }}
                  className={secondaryButtonClass}
                >
                  使用相機掃描
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setCreateInitial({ barcode: "", name: nameInput.trim() });
                  }}
                  className={secondaryButtonClass}
                >
                  手動新增
                </button>
              </div>
            )}

            {notFound && (
              <div className="flex items-center justify-between gap-3 rounded-xl bg-zinc-100 px-4 py-3 text-sm text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                <p>查無相關資訊, 要手動新增嗎?</p>
                <button
                  type="button"
                  onClick={() => setCreateInitial(notFound)}
                  className="shrink-0 rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
                >
                  手動新增
                </button>
              </div>
            )}

            {results.length > 0 && (
              <ul className="flex flex-col gap-2">
                {results.map((food, i) => {
                  // 自建商品可能沒有條碼,以物件本身判斷是否選取
                  const active = selected === food;
                  return (
                    <li key={`${food.barcode ?? food.source}-${i}`}>
                      <button
                        type="button"
                        onClick={() => setSelected(food)}
                        aria-pressed={active}
                        className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                          active
                            ? "border-zinc-950 bg-zinc-100 dark:border-zinc-50 dark:bg-zinc-800"
                            : "border-black/[.08] hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
                        }`}
                      >
                        {food.imageUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={food.imageUrl}
                            alt=""
                            className="h-12 w-12 shrink-0 rounded-lg object-cover"
                          />
                        )}
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="font-medium">{food.productName}</span>
                          <span className="text-xs text-zinc-500">
                            {[food.brands, food.quantity, food.barcode].filter(Boolean).join(" · ")}
                          </span>
                          <span className="text-xs text-zinc-600 dark:text-zinc-400">
                            每份{food.servingSize ? `(${food.servingSize})` : ""}:{macroSummary(food)}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {localOnlyKeyword && !loading && (
              <div className="flex items-center justify-between gap-3 text-sm text-zinc-500">
                <p>以上為資料庫中的結果</p>
                <button
                  type="button"
                  onClick={() => searchByName(localOnlyKeyword, true)}
                  className={secondaryButtonClass}
                >
                  搜尋更多
                </button>
              </div>
            )}

            {error && (
              <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
                {error}
              </p>
            )}
          </div>

          <footer className="flex items-center justify-end gap-2 border-t border-black/[.08] px-5 py-4 dark:border-white/[.145]">
            <label className="mr-auto flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              份數
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={servings}
                onChange={(e) => setServings(e.target.value)}
                className="w-20 rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-950 dark:border-white/[.145] dark:text-zinc-50 dark:focus:border-zinc-50"
              />
            </label>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-full border border-black/[.08] px-5 py-2.5 text-sm font-medium hover:bg-zinc-100 dark:border-white/[.145] dark:hover:bg-zinc-800"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void handleAddSelected()}
              disabled={!selected || saving}
              className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
            >
              {saving ? "加入中…" : "加入"}
            </button>
          </footer>
        </div>
      </dialog>

      {/* 放在外層 dialog 之外,避免點擊與 Esc 事件冒泡到外層而關閉整個視窗 */}
      {/* 每次開啟都重新掛載,才能帶入對應的條碼與名稱 */}
      {createInitial !== null && (
        <ManualFoodModal
          title={`手動新增到${mealLabel}`}
          initialBarcode={createInitial.barcode}
          initialName={createInitial.name}
          onClose={() => setCreateInitial(null)}
          onSubmit={saveToMeal}
        />
      )}
    </>
  );
}
