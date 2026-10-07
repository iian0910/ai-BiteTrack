type VideoDevice = Pick<MediaDeviceInfo, "deviceId" | "label">;

// iOS 標籤如 "Back Camera"、"後置相機";Android Chrome 如 "camera2 0, facing back"
const BACK_PATTERN = /back|rear|environment|後/i;
// 超廣角、望遠、微距等鏡頭無法近距離對焦;iOS 的雙/三鏡頭虛擬相機在網頁上也不會自動切換鏡頭
const NON_MAIN_PATTERN = /ultra|tele|depth|macro|dual|triple|超廣角|望遠|微距|景深|雙|三/i;

// 取標籤中獨立的編號,例如 "camera2 0, facing back" 取 0 而非 camera2 的 2
function cameraNumber(label: string): number {
  const match = label.match(/\b\d+\b/);
  return match ? Number(match[0]) : Number.POSITIVE_INFINITY;
}

/** 後鏡頭清單;無法從標籤判斷時回傳全部鏡頭 */
export function backCameras<T extends VideoDevice>(devices: T[]): T[] {
  const backs = devices.filter((d) => BACK_PATTERN.test(d.label));
  return backs.length > 0 ? backs : devices;
}

/**
 * 從鏡頭清單中挑出主鏡頭(一般廣角)。
 * 排除超廣角、望遠等鏡頭;Android 的主鏡頭通常是編號最小的後鏡頭。
 */
export function pickMainCamera<T extends VideoDevice>(devices: T[]): T | null {
  const backs = backCameras(devices);
  const candidates = backs.filter((d) => !NON_MAIN_PATTERN.test(d.label));
  const pool = candidates.length > 0 ? candidates : backs;
  return [...pool].sort((a, b) => cameraNumber(a.label) - cameraNumber(b.label))[0] ?? null;
}
