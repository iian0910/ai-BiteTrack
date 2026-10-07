import { NextResponse } from "next/server";
import { getFoodsCollection } from "@/lib/mongodb";
import {
  fromOffProduct,
  fromSavedFood,
  OFF_BASE_URL,
  OFF_FIELDS,
  USER_AGENT,
  type OffProduct,
} from "@/lib/nutrition";

interface OffResponse {
  status: number;
  status_verbose?: string;
  product?: OffProduct;
}

// 查詢存在資料庫中的食物(查詢到後加入過或手動新增的)
async function findSavedFood(barcode: string) {
  const foods = await getFoodsCollection();
  const food = await foods.findOne({ barcode }, { projection: { _id: 0 } });
  return food ? fromSavedFood(food) : null;
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

  // 先查資料庫中的食物,找不到才查 OFF;資料庫異常時仍改查 OFF,不中斷查詢
  try {
    const saved = await findSavedFood(barcode);
    if (saved) return NextResponse.json(saved);
  } catch (err) {
    console.error("查詢資料庫食物失敗", err);
  }

  let offResponse: Response;
  try {
    offResponse = await fetch(
      `${OFF_BASE_URL}/api/v2/product/${barcode}.json?fields=${OFF_FIELDS}`,
      {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(8000),
      },
    );
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

  return NextResponse.json(fromOffProduct(barcode, data.product));
}
