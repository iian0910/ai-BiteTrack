"use client";

import { useEffect, useRef, useState } from "react";
import { backCameras, pickMainCamera } from "@/lib/camera";

const SCAN_INTERVAL_MS = 100;
// 記住使用者手動選的鏡頭,下次開啟直接使用
const CAMERA_STORAGE_KEY = "bitetrack:cameraId";
// 只辨識畫面中央、與掃描框相同比例的區域,減少雜訊也加快速度
const CROP_WIDTH_RATIO = 0.8;
const CROP_HEIGHT_RATIO = 0.4;
// 裁切後的寬度上限,過大的影像解碼較慢但對辨識率幫助有限
const MAX_DECODE_WIDTH = 1280;

function cameraErrorMessage(err: unknown): string {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    return "相機僅能在 HTTPS 或 localhost 下使用";
  }
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError") return "未取得相機權限,請在瀏覽器設定中允許使用相機";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "找不到可用的相機";
  if (name === "NotReadableError") return "相機正被其他程式使用中";
  return "無法啟動相機,請稍後再試";
}

function readSavedCamera(): string | null {
  try {
    return localStorage.getItem(CAMERA_STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveCamera(deviceId: string | null) {
  try {
    if (deviceId) localStorage.setItem(CAMERA_STORAGE_KEY, deviceId);
    else localStorage.removeItem(CAMERA_STORAGE_KEY);
  } catch {
    // 無痕模式等無法使用 localStorage 時略過
  }
}

/** 開啟指定鏡頭;未指定或指定的鏡頭已不存在時改開後鏡頭 */
async function openCamera(deviceId: string | null): Promise<MediaStream> {
  const base: MediaTrackConstraints = {
    // 720p 對焦速度較快,解析度也足夠辨識一維條碼
    width: { ideal: 1280 },
    height: { ideal: 720 },
    // 連續對焦,近距離拍條碼較不易模糊;放在 advanced 中,不支援的裝置會略過而不會開啟失敗
    advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
  };
  if (deviceId) {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { ...base, deviceId: { exact: deviceId } },
      });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name !== "OverconstrainedError" && name !== "NotFoundError") throw err;
      saveCamera(null);
    }
  }
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { ...base, facingMode: "environment" },
  });
}

export default function BarcodeScanner({
  onDetected,
  onClose,
}: {
  onDetected: (code: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  // 要開啟的鏡頭;null 表示自動挑選主鏡頭
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [activeId, setActiveId] = useState("");
  // 讓掃描迴圈永遠呼叫到最新的 callback,而不必在 callback 改變時重啟相機
  const onDetectedRef = useRef(onDetected);
  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function start() {
      try {
        const [{ createBarcodeDecoder }, media] = await Promise.all([
          import("@/lib/barcode-decoder"),
          // 立即記下串流,元件卸載時才關得掉相機
          openCamera(deviceId ?? readSavedCamera()).then((s) => (stream = s)),
        ]);
        if (cancelled) return;

        const [track] = media.getVideoTracks();
        const currentId = track.getSettings().deviceId ?? "";

        // 鏡頭名稱要取得相機權限後才讀得到,所以先開相機再列出鏡頭
        if (deviceId === null) {
          const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
            (d) => d.kind === "videoinput",
          );
          if (cancelled) return;
          setCameras(backCameras(devices));

          // 使用者選過的鏡頭優先,否則挑主鏡頭;與目前開啟的不同時切換過去
          const saved = readSavedCamera();
          const target = devices.some((d) => d.deviceId === saved)
            ? saved
            : pickMainCamera(devices)?.deviceId;
          if (target && target !== currentId) {
            media.getTracks().forEach((t) => t.stop());
            setDeviceId(target);
            return;
          }
        }
        setActiveId(currentId);

        // 部分瀏覽器開啟相機時不套用 focusMode,串流啟動後再設定一次
        const caps = track.getCapabilities?.() as
          | (MediaTrackCapabilities & { focusMode?: string[] })
          | undefined;
        if (caps?.focusMode?.includes("continuous")) {
          await track
            .applyConstraints({
              advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
            })
            .catch(() => {});
        }

        const video = videoRef.current!;
        video.srcObject = media;
        await video.play();
        if (cancelled) return;
        setStarting(false);

        const decode = createBarcodeDecoder();
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

        // 以 setTimeout 串接,確保上一張辨識完才處理下一張
        const tick = () => {
          if (cancelled) return;
          const vw = video.videoWidth;
          const vh = video.videoHeight;
          if (vw > 0 && vh > 0) {
            const sw = Math.floor(vw * CROP_WIDTH_RATIO);
            const sh = Math.floor(vh * CROP_HEIGHT_RATIO);
            const scale = Math.min(1, MAX_DECODE_WIDTH / sw);
            canvas.width = Math.floor(sw * scale);
            canvas.height = Math.floor(sh * scale);
            ctx.drawImage(
              video,
              (vw - sw) / 2,
              (vh - sh) / 2,
              sw,
              sh,
              0,
              0,
              canvas.width,
              canvas.height,
            );
            const { data, width, height } = ctx.getImageData(
              0,
              0,
              canvas.width,
              canvas.height,
            );
            const code = decode(data, width, height);
            if (code) {
              cancelled = true;
              onDetectedRef.current(code);
              return;
            }
          }
          timer = setTimeout(tick, SCAN_INTERVAL_MS);
        };
        tick();
      } catch (err) {
        if (cancelled) return;
        setStarting(false);
        setError(cameraErrorMessage(err));
      }
    }

    void start();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [deviceId]);

  function handleCameraChange(id: string) {
    if (id === activeId) return;
    saveCamera(id);
    setError(null);
    setStarting(true);
    setDeviceId(id);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative mx-auto w-full max-w-sm overflow-hidden rounded-xl bg-black">
        <video
          ref={videoRef}
          className="aspect-video w-full object-cover"
          muted
          playsInline
        />
        {!error && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-[40%] w-[80%] rounded-lg border-2 border-emerald-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]" />
          </div>
        )}
        <p className="pointer-events-none absolute bottom-2 left-0 right-0 px-3 text-center text-xs text-white">
          {error ?? (starting ? "啟動相機中…" : "將條碼置於框內,保持約 10 公分以上距離")}
        </p>
      </div>
      {cameras.length > 1 && (
        <label className="flex items-center justify-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
          鏡頭
          <select
            value={activeId}
            onChange={(e) => handleCameraChange(e.target.value)}
            className="max-w-[16rem] rounded-full border border-black/[.08] bg-transparent px-3 py-1.5 text-xs text-zinc-950 outline-none focus:border-zinc-950 dark:border-white/[.145] dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-zinc-50"
          >
            {/* 鏡頭尚未開啟完成時 activeId 為空,保留一個佔位選項 */}
            {!activeId && <option value="">偵測中…</option>}
            {cameras.map((c, i) => (
              <option key={c.deviceId} value={c.deviceId}>
                {c.label || `鏡頭 ${i + 1}`}
              </option>
            ))}
          </select>
        </label>
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
