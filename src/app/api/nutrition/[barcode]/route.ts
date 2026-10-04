import { NextResponse } from "next/server";

const OFF_BASE_URL = "https://tw.openfoodfacts.org/api/v2/product";
const USER_AGENT = "ai-BiteTrack/0.1 (+https://github.com/ai-bitetrack)";
const FIELDS = [
  "product_name",
  "product_name_zh",
  "brands",
  "quantity",
  "serving_size",
  "image_front_url",
  "nutriscore_grade",
  "countries_tags",
  "nutriments",
].join(",");

type OffNutriments = Record<string, number | string | undefined>;

interface OffProduct {
  product_name?: string;
  product_name_zh?: string;
  brands?: string;
  quantity?: string;
  serving_size?: string;
  image_front_url?: string;
  nutriscore_grade?: string;
  countries_tags?: string[];
  nutriments?: OffNutriments;
}

interface OffResponse {
  status: number;
  status_verbose?: string;
  product?: OffProduct;
}

function toNumber(value: unknown): number | null {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

// OFF 的 sodium_100g 單位是公克,換算成毫克以符合台灣營養標示慣例
function gramsToMilligrams(value: number | null): number | null {
  return value === null ? null : Math.round(value * 1000 * 100) / 100;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ barcode: string }> },
) {
  const { barcode } = await params;

  if (!/^\d{8,14}$/.test(barcode)) {
    return NextResponse.json(
      { error: "條碼格式不正確,請輸入 8 到 14 位數字" },
      { status: 400 },
    );
  }

  let offResponse: Response;
  try {
    offResponse = await fetch(`${OFF_BASE_URL}/${barcode}.json?fields=${FIELDS}`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return NextResponse.json(
      { error: "查詢服務暫時無法連線,請稍後再試" },
      { status: 502 },
    );
  }

  if (!offResponse.ok && offResponse.status !== 404) {
    return NextResponse.json(
      { error: "查詢服務發生錯誤,請稍後再試" },
      { status: 502 },
    );
  }

  const data = (await offResponse.json()) as OffResponse;

  if (data.status !== 1 || !data.product) {
    if (data.status_verbose?.includes("different product type")) {
      return NextResponse.json(
        { error: "此條碼非食品類條碼,請重新輸入(掃描)" },
        { status: 422 },
      );
    }
    return NextResponse.json(
      { error: "查無此條碼對應的商品" },
      { status: 404 },
    );
  }

  const product = data.product;
  const nutriments = product.nutriments ?? {};
  const isTaiwan = (product.countries_tags ?? []).includes("en:taiwan");

  return NextResponse.json({
    barcode,
    productName: product.product_name_zh || product.product_name || "未知商品",
    brands: product.brands ?? null,
    quantity: product.quantity ?? null,
    servingSize: product.serving_size ?? null,
    imageUrl: product.image_front_url ?? null,
    nutriscoreGrade: product.nutriscore_grade ?? null,
    isTaiwan,
    nutriments: {
      energyKcal: toNumber(nutriments["energy-kcal_serving"]),
      proteins: toNumber(nutriments["proteins_serving"]),
      fat: toNumber(nutriments["fat_serving"]),
      saturatedFat: toNumber(nutriments["saturated-fat_serving"]),
      carbohydrates: toNumber(nutriments["carbohydrates_serving"]),
      sugars: toNumber(nutriments["sugars_serving"]),
      fiber: toNumber(nutriments["fiber_serving"]),
      salt: toNumber(nutriments["salt_serving"]),
      sodium: gramsToMilligrams(toNumber(nutriments["sodium_serving"])),
    },
  });
}
