"use client";

import { useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import type { DecodeHintType } from "@zxing/library";

interface Nutriments {
  energyKcal: number | null;
  proteins: number | null;
  fat: number | null;
  saturatedFat: number | null;
  carbohydrates: number | null;
  sugars: number | null;
  fiber: number | null;
  salt: number | null;
  sodium: number | null;
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
  nutriments: Nutriments;
}

const NUTRIENT_ROWS: { key: keyof Nutriments; label: string; unit: string }[] = [
  { key: "energyKcal", label: "熱量", unit: "kcal" },
  { key: "proteins", label: "蛋白質", unit: "g" },
  { key: "fat", label: "脂肪", unit: "g" },
  { key: "saturatedFat", label: "飽和脂肪", unit: "g" },
  { key: "carbohydrates", label: "碳水化合物", unit: "g" },
  { key: "sugars", label: "糖", unit: "g" },
  { key: "fiber", label: "膳食纖維", unit: "g" },
  { key: "sodium", label: "鈉", unit: "mg" },
];

export default function Home() {
  const [barcodeInput, setBarcodeInput] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<NutritionResult | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);

  useEffect(() => {
    return () => {
      controlsRef.current?.stop();
    };
  }, []);

  async function handleSearch(code?: string) {
    const target = (code ?? barcodeInput).trim();
    if (!/^\d{8,14}$/.test(target)) {
      setError("請輸入 8 到 14 位數字的條碼");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`/api/nutrition/${target}`);
      const data = await res.json();
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

  function stopScanning() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setIsScanning(false);
  }

  async function startScanning() {
    setError(null);
    setIsScanning(true);

    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const { BarcodeFormat, DecodeHintType } = await import("@zxing/library");
      const hints = new Map<DecodeHintType, unknown>();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
      ]);
      const reader = new BrowserMultiFormatReader(hints);
      const controls = await reader.decodeFromConstraints(
        {
          video: {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        videoRef.current!,
        (scanResult) => {
          if (scanResult) {
            const text = scanResult.getText();
            stopScanning();
            setBarcodeInput(text);
            void handleSearch(text);
          }
        },
      );
      controlsRef.current = controls;

      const selectAllTracks = (track: MediaStreamTrack) => [track];
      const capabilities = controls.streamVideoCapabilitiesGet?.(
        selectAllTracks,
      ) as (MediaTrackCapabilities & { focusMode?: string[] }) | undefined;

      if (capabilities?.focusMode?.includes("continuous")) {
        controls.streamVideoConstraintsApply?.(
          { advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] },
          selectAllTracks,
        );
      }
    } catch {
      setError("無法啟動相機,請確認已授權相機權限");
      setIsScanning(false);
    }
  }

  function toggleScanning() {
    if (isScanning) {
      stopScanning();
    } else {
      void startScanning();
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-10 font-sans dark:bg-black sm:px-8">
      <div className="flex w-full max-w-xl flex-col gap-6">
        <header className="flex flex-col gap-1 text-center sm:text-left">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            ai-BiteTrack
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            輸入或掃描條碼,查詢台灣販售商品的營養成分
          </p>
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

          <button
            type="button"
            onClick={toggleScanning}
            className="self-start rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-300 dark:hover:bg-[#1a1a1a]"
          >
            {isScanning ? "關閉相機" : "使用相機掃描"}
          </button>

          {isScanning && (
            <div className="relative mx-auto w-full max-w-sm overflow-hidden rounded-xl bg-black">
              <video
                ref={videoRef}
                className="aspect-video w-full object-cover"
                muted
                playsInline
              />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-[38%] w-[82%] rounded-lg border-2 border-emerald-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]" />
              </div>
              <p className="pointer-events-none absolute bottom-2 left-0 right-0 text-center text-xs text-white">
                將條碼置於框內,保持適當距離
              </p>
            </div>
          )}
        </form>

        {error && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
            {error}
          </p>
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
      </div>
    </div>
  );
}
