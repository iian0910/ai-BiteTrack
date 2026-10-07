import { NextResponse } from "next/server";
import { fromProductDoc, getProductsCollection } from "@/lib/mongodb";

const OFF_BASE_URL = "https://world.openfoodfacts.org/api/v2/product";
const USER_AGENT = "ai-BiteTrack/0.1 (+https://github.com/ai-bitetrack)";
const FIELDS = [
  "product_name",
  "product_name_zh",
  "brands",
  "quantity",
  "serving_size",
  "image_front_url",
  "nutriscore_grade",
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

// 查詢使用者自行建立的商品,轉成與 OFF 相同的回應格式
async function findSavedProduct(barcode: string) {
  const collection = await getProductsCollection();
  const doc = await collection.findOne(
    { barcode },
    { projection: { _id: 0 } },
  );
  if (!doc) return null;
  const product = fromProductDoc(doc);

  return {
    barcode,
    productName: product.name || "未命名商品",
    brands: null,
    quantity: null,
    servingSize: `${product.totalGrams} g`,
    imageUrl: null,
    nutriscoreGrade: null,
    source: "custom" as const,
    nutriments: {
      energyKcal: product.energyKcal,
      proteins: product.proteins,
      fat: product.fat,
      carbohydrates: product.carbohydrates,
    },
  };
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

  // 先查使用者自建的商品,找不到才查 OFF;資料庫異常時仍改查 OFF,不中斷查詢
  try {
    const saved = await findSavedProduct(barcode);
    if (saved) return NextResponse.json(saved);
  } catch (err) {
    console.error("查詢自建商品失敗", err);
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
      { error: "查無相關資訊", notFound: true },
      { status: 404 },
    );
  }

  const product = data.product;
  const nutriments = product.nutriments ?? {};

  return NextResponse.json({
    barcode,
    productName: product.product_name_zh || product.product_name || "未知商品",
    brands: product.brands ?? null,
    quantity: product.quantity ?? null,
    servingSize: product.serving_size ?? null,
    imageUrl: product.image_front_url ?? null,
    nutriscoreGrade: product.nutriscore_grade ?? null,
    source: "openfoodfacts",
    nutriments: {
      energyKcal: toNumber(nutriments["energy-kcal_serving"]),
      proteins: toNumber(nutriments["proteins_serving"]),
      fat: toNumber(nutriments["fat_serving"]),
      carbohydrates: toNumber(nutriments["carbohydrates_serving"]),
    },
  });
}
