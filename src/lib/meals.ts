export const MEALS = [
  { key: "breakfast", label: "早餐" },
  { key: "lunch", label: "午餐" },
  { key: "dinner", label: "晚餐" },
] as const;

export type MealType = (typeof MEALS)[number]["key"];

export const MEAL_KEYS: readonly string[] = MEALS.map((m) => m.key);

export const MACRO_KEYS = ["energyKcal", "proteins", "fat", "carbohydrates"] as const;

export type MacroKey = (typeof MACRO_KEYS)[number];

// 每份的營養成分;OFF 可能缺資料,以 null 表示
export type Macros = Record<MacroKey, number | null>;

export interface MealEntry {
  id: string;
  /** 使用者當地的日期,格式 YYYY-MM-DD */
  date: string;
  meal: MealType;
  barcode: string | null;
  name: string;
  /** 吃了幾份 */
  servings: number;
  servingSize: string | null;
  nutriments: Macros;
  createdAt: string;
}

export type NewMealEntry = Omit<MealEntry, "id" | "createdAt">;

export type FoodSource = "openfoodfacts" | "custom";

/** 加入餐點時一併送出的食物資訊,伺服器會存入 foods 以便之後直接從資料庫查到 */
export interface FoodDetails {
  brands: string | null;
  quantity: string | null;
  imageUrl: string | null;
  source: FoodSource;
}

export type AddMealRequest = NewMealEntry & FoodDetails;

/** 存在 foods 集合中、加入過餐點的食物 */
export interface SavedFood extends FoodDetails {
  barcode: string | null;
  name: string;
  servingSize: string | null;
  nutriments: Macros;
  updatedAt: string;
}

// /api/nutrition 的查詢結果;OFF 回傳 number,自建商品為 Decimal128 轉成的字串
export interface FoodResult {
  barcode: string | null;
  productName: string;
  brands: string | null;
  quantity: string | null;
  servingSize: string | null;
  imageUrl: string | null;
  source: FoodSource;
  nutriments: Record<MacroKey, number | string | null>;
}

export function toMacros(raw: FoodResult["nutriments"]): Macros {
  const macros = {} as Macros;
  for (const key of MACRO_KEYS) {
    const n = raw[key] === null ? NaN : Number(raw[key]);
    macros[key] = Number.isFinite(n) ? n : null;
  }
  return macros;
}

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const BARCODE_PATTERN = /^\d{8,14}$/;

/** 以使用者裝置的時區取得今天的日期 */
export function todayString(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 一筆紀錄實際攝取的量(每份 × 份數),缺資料以 0 計 */
export function entryAmount(entry: MealEntry, key: MacroKey): number {
  return (entry.nutriments[key] ?? 0) * entry.servings;
}

/** 四捨五入到小數一位,避免浮點數加總出現很長的小數 */
export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
