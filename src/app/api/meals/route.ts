import { NextResponse, type NextRequest } from "next/server";
import { fromMealDoc, getMealsCollection, saveFood, type MealDoc } from "@/lib/mongodb";
import {
  BARCODE_PATTERN,
  DATE_PATTERN,
  MACRO_KEYS,
  MEAL_KEYS,
  type FoodDetails,
  type Macros,
  type MealType,
  type NewMealEntry,
} from "@/lib/meals";

function isAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// 食物的附加資訊只用於存入 foods,格式不對時以 null 帶過,不影響新增紀錄
function parseFoodDetails(body: unknown): FoodDetails {
  const b = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const imageUrl = optionalString(b.imageUrl);
  return {
    brands: optionalString(b.brands),
    quantity: optionalString(b.quantity),
    imageUrl: imageUrl?.startsWith("https://") ? imageUrl : null,
    source: b.source === "custom" ? "custom" : "openfoodfacts",
  };
}

// 前端已驗證過,這裡再驗一次避免直接呼叫 API 寫入不合法的資料
function parseEntry(body: unknown): NewMealEntry | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;

  if (typeof b.date !== "string" || !DATE_PATTERN.test(b.date)) return null;
  if (typeof b.meal !== "string" || !MEAL_KEYS.includes(b.meal)) return null;
  // 自建商品可能沒有條碼
  if (b.barcode !== null && (typeof b.barcode !== "string" || !BARCODE_PATTERN.test(b.barcode))) {
    return null;
  }
  if (typeof b.name !== "string" || !b.name.trim()) return null;
  if (!isAmount(b.servings) || b.servings === 0) return null;
  if (b.servingSize !== null && typeof b.servingSize !== "string") return null;
  if (typeof b.nutriments !== "object" || b.nutriments === null) return null;

  const raw = b.nutriments as Record<string, unknown>;
  const nutriments = {} as Macros;
  for (const key of MACRO_KEYS) {
    const value = raw[key];
    if (value !== null && !isAmount(value)) return null;
    nutriments[key] = value;
  }

  return {
    date: b.date,
    meal: b.meal as MealType,
    barcode: b.barcode,
    name: b.name.trim(),
    servings: b.servings,
    servingSize: b.servingSize,
    nutriments,
  };
}

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date") ?? "";
  if (!DATE_PATTERN.test(date)) {
    return NextResponse.json({ error: "日期格式不正確" }, { status: 400 });
  }

  try {
    const collection = await getMealsCollection();
    const docs = await collection.find({ date }).sort({ createdAt: 1 }).toArray();
    return NextResponse.json(docs.map(fromMealDoc));
  } catch (err) {
    console.error("讀取飲食紀錄失敗", err);
    return NextResponse.json(
      { error: "讀取飲食紀錄失敗,請稍後再試" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "資料格式不正確" }, { status: 400 });
  }

  const parsed = parseEntry(body);
  if (!parsed) {
    return NextResponse.json({ error: "紀錄資料不完整或格式不正確" }, { status: 400 });
  }

  const doc: MealDoc = { ...parsed, createdAt: new Date().toISOString() };

  try {
    const collection = await getMealsCollection();
    // insertOne 會在傳入的物件上加 _id,傳入副本以免影響 doc
    const { insertedId } = await collection.insertOne({ ...doc });

    // 不論是查詢到的或手動新增的,都存一份到 foods,下次查詢可直接從資料庫找到;
    // 存檔失敗不影響這筆紀錄
    try {
      await saveFood({
        barcode: parsed.barcode,
        name: parsed.name,
        servingSize: parsed.servingSize,
        nutriments: parsed.nutriments,
        ...parseFoodDetails(body),
      });
    } catch (err) {
      console.error("儲存食物資料失敗", err);
    }

    return NextResponse.json(
      fromMealDoc({ _id: insertedId, ...doc }),
      { status: 201 },
    );
  } catch (err) {
    console.error("新增飲食紀錄失敗", err);
    return NextResponse.json(
      { error: "新增紀錄失敗,請稍後再試" },
      { status: 500 },
    );
  }
}
