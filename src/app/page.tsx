"use client";

import { useState } from "react";
import BarcodeScanner from "@/components/BarcodeScanner";
import CreateProductModal from "@/components/CreateProductModal";
import { useProducts } from "@/lib/products";

// OFF 回傳 number;自建商品為 Decimal128 轉成的字串,原樣顯示以保留小數位數
interface Nutriments {
  energyKcal: number | string | null;
  proteins: number | string | null;
  fat: number | string | null;
  carbohydrates: number | string | null;
}

interface NutritionResult {
  barcode: string;
  productName: string;
  brands: string | null;
  quantity: string | null;
  servingSize: string | null;
  imageUrl: string | null;
  nutriscoreGrade: string | null;
  isTaiwan: boolean;
  source: "openfoodfacts" | "custom";
  nutriments: Nutriments;
}

const NUTRIENT_ROWS: { key: keyof Nutriments; label: string; unit: string }[] = [
  { key: "energyKcal", label: "熱量", unit: "kcal" },
  { key: "proteins", label: "蛋白質", unit: "g" },
  { key: "fat", label: "脂肪", unit: "g" },
  { key: "carbohydrates", label: "碳水化合物", unit: "g" },
];

export default function Home() {
  const [barcodeInput, setBarcodeInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<NutritionResult | null>(null);
  // 查無資料時記下條碼,供「新增」帶入建立表單
  const [notFoundBarcode, setNotFoundBarcode] = useState<string | null>(null);
  // null 表示建立視窗關閉;字串為預先帶入的條碼
  const [createBarcode, setCreateBarcode] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const products = useProducts();

  async function handleSearch(target = barcodeInput.trim()) {
    if (!/^\d{8,14}$/.test(target)) {
      setError("請輸入 8 到 14 位數字的條碼");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setNotFoundBarcode(null);

    try {
      const res = await fetch(`/api/nutrition/${target}`);
      const data = await res.json();
      if (res.status === 404 && data.notFound) {
        setNotFoundBarcode(target);
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "查詢失敗,請稍後再試");
        return;
      }
      setResult(data as NutritionResult);
    } catch {
      setError("網路連線發生問題,請稍後再試");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-10 font-sans dark:bg-black sm:px-8">
      <div className="flex w-full max-w-xl flex-col gap-6">
        <header className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              ai-BiteTrack
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              輸入或掃描條碼,查詢台灣販售商品的營養成分
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreateBarcode("")}
            className="shrink-0 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            + 建立
          </button>
        </header>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSearch();
          }}
          className="flex flex-col gap-3 rounded-2xl border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-zinc-900"
        >
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              pattern="\d*"
              placeholder="輸入條碼,例如 4710088425556"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value.replace(/\D/g, ""))}
              className="flex-1 rounded-full border border-black/[.08] bg-transparent px-4 py-2.5 text-sm text-zinc-950 outline-none focus:border-zinc-950 dark:border-white/[.145] dark:text-zinc-50 dark:focus:border-zinc-50"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
            >
              {loading ? "查詢中…" : "查詢"}
            </button>
          </div>

          {scanning ? (
            <BarcodeScanner
              onClose={() => setScanning(false)}
              onDetected={(code) => {
                setScanning(false);
                setBarcodeInput(code);
                void handleSearch(code);
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setScanning(true);
              }}
              className="self-start rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-300 dark:hover:bg-[#1a1a1a]"
            >
              使用相機掃描
            </button>
          )}
        </form>

        {error && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
            {error}
          </p>
        )}

        {notFoundBarcode && (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-zinc-100 px-4 py-3 text-sm text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
            <p>查無相關資訊, 請問要新增嗎?</p>
            <button
              type="button"
              onClick={() => setCreateBarcode(notFoundBarcode)}
              className="shrink-0 rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
            >
              新增
            </button>
          </div>
        )}

        {result && (
          <div className="flex flex-col gap-4 rounded-2xl border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-zinc-900">
            <div className="flex items-start gap-4">
              {result.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={result.imageUrl}
                  alt={result.productName}
                  className="h-20 w-20 rounded-lg object-cover"
                />
              )}
              <div className="flex flex-col gap-0.5">
                <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                  {result.productName}
                </h2>
                {result.brands && (
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {result.brands}
                  </p>
                )}
                {result.quantity && (
                  <p className="text-sm text-zinc-500 dark:text-zinc-500">
                    {result.quantity}
                  </p>
                )}
              </div>
            </div>

            {result.source === "custom" && (
              <p className="rounded-xl bg-zinc-100 px-4 py-3 text-sm text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                此為自行建立的商品資料
              </p>
            )}

            {!result.isTaiwan && (
              <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
                此商品未標註為台灣販售,營養資訊僅供參考
              </p>
            )}

            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
                每份{result.servingSize ? `(${result.servingSize})` : ""} 營養成分
              </p>
              <table className="w-full text-sm">
                <tbody>
                  {NUTRIENT_ROWS.map(({ key, label, unit }) => (
                    <tr
                      key={key}
                      className="border-b border-black/[.06] last:border-none dark:border-white/[.08]"
                    >
                      <td className="py-2 text-zinc-600 dark:text-zinc-400">
                        {label}
                      </td>
                      <td className="py-2 text-right font-medium text-zinc-950 dark:text-zinc-50">
                        {result.nutriments[key] !== null
                          ? `${result.nutriments[key]} ${unit}`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {products.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
              我建立的商品
            </h2>
            <ul className="flex flex-col gap-3">
              {products.map((p) => (
                <li
                  key={p.barcode}
                  className="flex flex-col gap-2 rounded-2xl border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-zinc-900"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-medium text-zinc-950 dark:text-zinc-50">
                      {p.name || "未命名商品"}
                    </p>
                    <p className="font-mono text-xs text-zinc-500">{p.barcode}</p>
                  </div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {p.totalGrams} g · {p.energyKcal} kcal · 蛋白質 {p.proteins} g · 脂肪 {p.fat} g · 碳水 {p.carbohydrates} g
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* 每次開啟都重新掛載,才能帶入對應的條碼 */}
      {createBarcode !== null && (
        <CreateProductModal
          open
          initialBarcode={createBarcode}
          onClose={() => setCreateBarcode(null)}
          onCreated={(code) => {
            // 剛新增的正是查無資料的條碼時,直接重新查詢顯示結果
            if (code === notFoundBarcode) void handleSearch(code);
          }}
        />
      )}
    </div>
  );
}
