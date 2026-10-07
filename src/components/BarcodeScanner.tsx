"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Html5Qrcode } from "html5-qrcode";

// 串接所有實例的啟動與關閉,避免 Strict Mode 重複掛載或快速關閉再開啟時,
// 新舊實例同時搶用相機
let lifecycle: Promise<unknown> = Promise.resolve();

function cameraErrorMessage(err: unknown): string {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    return "相機僅能在 HTTPS 或 localhost 下使用";
  }
  // html5-qrcode 會把原始錯誤包成字串,以錯誤名稱判斷
  const text = String(err);
  if (text.includes("NotAllowedError")) return "未取得相機權限,請在瀏覽器設定中允許使用相機";
  if (text.includes("NotFoundError") || text.includes("OverconstrainedError")) {
    return "找不到可用的相機";
  }
  if (text.includes("NotReadableError")) return "相機正被其他程式使用中";
  return "無法啟動相機,請稍後再試";
}

export default function BarcodeScanner({
  onDetected,
  onClose,
}: {
  onDetected: (code: string) => void;
  onClose: () => void;
}) {
  // html5-qrcode 以 id 尋找要掛載畫面的元素
  const elementId = `scanner-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  // 讓掃描 callback 永遠呼叫到最新的 onDetected,而不必在它改變時重啟相機
  const onDetectedRef = useRef(onDetected);
  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    let cancelled = false;
    let scanner: Html5Qrcode | null = null;

    async function start() {
      if (cancelled) return;
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
        if (cancelled) return;
        scanner = new Html5Qrcode(elementId, {
          verbose: false,
          // 台灣商品常見的一維條碼格式
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
          ],
          // 瀏覽器支援時改用內建 BarcodeDetector(Android Chrome 底層為 Google 的條碼引擎)
          useBarCodeDetectorIfSupported: true,
        });

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            // 一維條碼較寬扁,掃描框取畫面寬 80%、高 40%
            qrbox: (w, h) => ({
              width: Math.floor(w * 0.8),
              height: Math.floor(h * 0.4),
            }),
            videoConstraints: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
          },
          (decodedText) => {
            if (cancelled || !/^\d{8,14}$/.test(decodedText)) return;
            cancelled = true;
            onDetectedRef.current(decodedText);
          },
          undefined,
        );
        if (cancelled) return;
        setStarting(false);

        // 支援的裝置開啟連續對焦,近距離拍條碼較不易模糊
        const caps = scanner.getRunningTrackCapabilities() as MediaTrackCapabilities & {
          focusMode?: string[];
        };
        if (caps.focusMode?.includes("continuous")) {
          await scanner
            .applyVideoConstraints({
              advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
            })
            .catch(() => {});
        }
      } catch (err) {
        if (cancelled) return;
        setStarting(false);
        setError(cameraErrorMessage(err));
      }
    }

    async function stop() {
      if (!scanner?.isScanning) return;
      try {
        await scanner.stop();
        scanner.clear();
      } catch {
        // 已停止或尚未完全啟動時忽略
      }
    }

    lifecycle = lifecycle.then(start);
    return () => {
      cancelled = true;
      lifecycle = lifecycle.then(stop);
    };
  }, [elementId]);

  return (
    <div className="flex flex-col gap-2">
      <div className="relative mx-auto w-full max-w-sm overflow-hidden rounded-xl bg-black">
        <div id={elementId} className="w-full [&_video]:!w-full [&_video]:object-cover" />
        {(starting || error) && (
          <p className="flex aspect-video items-center justify-center px-3 text-center text-xs text-white">
            {error ?? "啟動相機中…"}
          </p>
        )}
      </div>
      {!starting && !error && (
        <p className="text-center text-xs text-zinc-500 dark:text-zinc-500">
          將條碼置於框內,保持約 10 公分以上距離
        </p>
      )}
      <button
        type="button"
        onClick={onClose}
        className="self-center rounded-full border border-black/[.08] px-4 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-300 dark:hover:bg-[#1a1a1a]"
      >
        關閉相機
      </button>
    </div>
  );
}
