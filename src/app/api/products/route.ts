import { MongoServerError } from "mongodb";
import { NextResponse } from "next/server";
import { normalizeDecimal } from "@/lib/decimal";
import {
  AMOUNT_KEYS,
  fromProductDoc,
  getProductsCollection,
  toProductDoc,
} from "@/lib/mongodb";
import type { NewProduct, Product } from "@/lib/products";

// 前端已驗證過,這裡再驗一次避免直接呼叫 API 寫入不合法的資料
function parseProduct(body: unknown): NewProduct | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;

  if (typeof b.barcode !== "string" || !/^\d{8,14}$/.test(b.barcode)) return null;
  if (b.name !== undefined && typeof b.name !== "string") return null;

  const amounts = {} as Record<(typeof AMOUNT_KEYS)[number], string>;
  for (const key of AMOUNT_KEYS) {
    const value = normalizeDecimal(b[key]);
    if (value === null) return null;
    amounts[key] = value;
  }

  return { barcode: b.barcode, name: (b.name ?? "").trim(), ...amounts };
}

export async function GET() {
  try {
    const collection = await getProductsCollection();
    const products = await collection
      .find({}, { projection: { _id: 0 } })
      .sort({ createdAt: -1 })
      .toArray();
    return NextResponse.json(products.map(fromProductDoc));
  } catch (err) {
    console.error("讀取商品失敗", err);
    return NextResponse.json(
      { error: "讀取商品失敗,請稍後再試" },
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

  const parsed = parseProduct(body);
  if (!parsed) {
    return NextResponse.json({ error: "商品資料不完整或格式不正確" }, { status: 400 });
  }

  const product: Product = { ...parsed, createdAt: new Date().toISOString() };

  try {
    const collection = await getProductsCollection();
    // insertOne 會在傳入的物件上加 _id,傳入轉換後的副本以免回傳內容夾帶 ObjectId
    await collection.insertOne(toProductDoc(product));
  } catch (err) {
    if (err instanceof MongoServerError && err.code === 11000) {
      return NextResponse.json({ error: "此條碼已建立過" }, { status: 409 });
    }
    console.error("建立商品失敗", err);
    return NextResponse.json(
      { error: "建立商品失敗,請稍後再試" },
      { status: 500 },
    );
  }

  return NextResponse.json(product, { status: 201 });
}
