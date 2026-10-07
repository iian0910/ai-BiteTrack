import "server-only";

import { MACRO_KEYS, type MacroKey, type Macros, type SavedFood } from "@/lib/meals";

export const OFF_BASE_URL = "https://world.openfoodfacts.org";
export const USER_AGENT = "ai-BiteTrack/0.1 (+https://github.com/ai-bitetrack)";
export const OFF_FIELDS = [
  "code",
  "product_name",
  "product_name_zh",
  "brands",
  "quantity",
  "serving_size",
  "serving_quantity",
  "image_front_url",
  "nutriscore_grade",
  "nutriments",
].join(",");

type OffNutriments = Record<string, number | string | undefined>;

export interface OffProduct {
  code?: string;
  product_name?: string;
  product_name_zh?: string;
  brands?: string;
  quantity?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  image_front_url?: string;
  nutriscore_grade?: string;
  nutriments?: OffNutriments;
}

function toNumber(value: unknown): number | null {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

// 存在 foods 中的食物(查詢到後加入過或手動新增的),轉成與 OFF 相同的回應格式
export function fromSavedFood(food: SavedFood) {
  return {
    barcode: food.barcode,
    productName: food.name,
    brands: food.brands,
    quantity: food.quantity,
    servingSize: food.servingSize,
    imageUrl: food.imageUrl,
    nutriscoreGrade: null,
    source: food.source,
    nutriments: food.nutriments,
  };
}

// OFF 的營養素欄位名稱;熱量缺 kcal 時改用 kJ 換算
const OFF_NUTRIENTS: Record<MacroKey, string> = {
  energyKcal: "energy-kcal",
  proteins: "proteins",
  fat: "fat",
  carbohydrates: "carbohydrates",
};
const KJ_PER_KCAL = 4.184;

function readNutrient(nutriments: OffNutriments, key: MacroKey, basis: "serving" | "100g") {
  const value = toNumber(nutriments[`${OFF_NUTRIENTS[key]}_${basis}`]);
  if (value !== null || key !== "energyKcal") return value;
  const kj = toNumber(nutriments[`energy-kj_${basis}`]);
  return kj === null ? null : kj / KJ_PER_KCAL;
}

/** 四捨五入到小數兩位,避免換算後出現很長的小數 */
function round2(n: number | null) {
  return n === null ? null : Math.round(n * 100) / 100;
}

/**
 * 取每份的營養成分。許多商品只有每 100g 的數值:
 * 知道每份重量時依比例換算;連每份重量都沒有時,改以 100 g(ml)為一份
 */
function offMacros(product: OffProduct): { servingSize: string | null; nutriments: Macros } {
  const raw = product.nutriments ?? {};
  const servingQty = toNumber(product.serving_quantity);
  const nutriments = {} as Macros;
  let hasServingData = servingQty !== null && servingQty > 0;

  for (const key of MACRO_KEYS) {
    let value = readNutrient(raw, key, "serving");
    if (value !== null) hasServingData = true;
    if (value === null && servingQty !== null && servingQty > 0) {
      const per100 = readNutrient(raw, key, "100g");
      value = per100 === null ? null : (per100 * servingQty) / 100;
    }
    nutriments[key] = round2(value);
  }
  if (hasServingData) return { servingSize: product.serving_size ?? null, nutriments };

  for (const key of MACRO_KEYS) nutriments[key] = round2(readNutrient(raw, key, "100g"));
  // 飲料類以 100 ml 為準,其餘以 100 g 為準
  const unit = /\d\s*(ml|cl|l)\b|毫升|公升/i.test(product.quantity ?? "") ? "ml" : "g";
  return { servingSize: `100 ${unit}`, nutriments };
}

export function fromOffProduct(barcode: string, product: OffProduct) {
  const { servingSize, nutriments } = offMacros(product);

  return {
    barcode,
    productName: product.product_name_zh || product.product_name || "未知商品",
    brands: product.brands ?? null,
    quantity: product.quantity ?? null,
    servingSize,
    imageUrl: product.image_front_url ?? null,
    nutriscoreGrade: product.nutriscore_grade ?? null,
    source: "openfoodfacts" as const,
    nutriments,
  };
}
