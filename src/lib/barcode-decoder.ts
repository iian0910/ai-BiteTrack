import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatOneDReader,
  RGBLuminanceSource,
} from "@zxing/library";

// 同一個結果需連續辨識到幾次才採用,避免雜訊造成的誤判
const REQUIRED_MATCHES = 2;

/**
 * 建立食品條碼解碼器,傳入 RGBA 像素(例如 canvas 的 ImageData)回傳條碼數字,
 * 尚未確定時回傳 null。不依賴 DOM,連續掃描時重複使用同一個實例。
 */
export function createBarcodeDecoder() {
  const hints = new Map<DecodeHintType, unknown>([
    // 食品包裝常見的一維條碼格式
    [
      DecodeHintType.POSSIBLE_FORMATS,
      [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
      ],
    ],
    // 多花一些運算換取更高的辨識率,對模糊或略為傾斜的畫面較有幫助
    [DecodeHintType.TRY_HARDER, true],
  ]);
  // 直接使用一維條碼 reader:MultiFormatReader 在每張找不到條碼的畫面都會 console.warn
  const reader = new MultiFormatOneDReader(hints);

  let gray = new Uint8ClampedArray(0);
  let lastText: string | null = null;
  let matches = 0;

  return (rgba: Uint8ClampedArray, width: number, height: number): string | null => {
    const size = width * height;
    if (gray.length !== size) gray = new Uint8ClampedArray(size);
    // 轉成灰階,權重偏重綠色,與 ZXing 內部的換算方式相同
    for (let i = 0, p = 0; i < size; i++, p += 4) {
      gray[i] = (rgba[p] + 2 * rgba[p + 1] + rgba[p + 2]) >> 2;
    }

    let text: string | null = null;
    try {
      const bitmap = new BinaryBitmap(
        new HybridBinarizer(new RGBLuminanceSource(gray, width, height)),
      );
      text = reader.decode(bitmap, hints).getText();
    } catch {
      // 這張畫面中找不到條碼或校驗碼不符
    }

    if (!text || !/^\d{8,14}$/.test(text)) {
      lastText = null;
      matches = 0;
      return null;
    }
    matches = text === lastText ? matches + 1 : 1;
    lastText = text;
    return matches >= REQUIRED_MATCHES ? text : null;
  };
}
