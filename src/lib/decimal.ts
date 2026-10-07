const DECIMAL_PATTERN = /^(\d+(\.\d+)?|\.\d+)$/;

/**
 * 驗證並整理非負的十進位數字字串,不合法時回傳 null。
 * 數值全程以字串傳遞,避免轉成浮點數後失去精度或尾端的 0。
 */
export function normalizeDecimal(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (!DECIMAL_PATTERN.test(s)) return null;
  return s.startsWith(".") ? `0${s}` : s;
}
