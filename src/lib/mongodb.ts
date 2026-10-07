import "server-only";

import { MongoClient, type Collection, type WithId } from "mongodb";
import type { MealEntry, SavedFood } from "@/lib/meals";

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error("缺少環境變數 MONGODB_URI,請在 .env.local 設定");
}

// 開發模式下 HMR 會重新載入模組,掛在 globalThis 上避免每次都建立新連線
const globalForMongo = globalThis as typeof globalThis & {
  _mongoClientPromise?: Promise<MongoClient>;
  _mealsIndexPromise?: Promise<string>;
  _foodsIndexPromise?: Promise<string[]>;
};

const clientPromise =
  globalForMongo._mongoClientPromise ??
  (globalForMongo._mongoClientPromise = new MongoClient(uri).connect());

export type MealDoc = Omit<MealEntry, "id">;

export function fromMealDoc(doc: WithId<MealDoc>): MealEntry {
  const { _id, ...rest } = doc;
  return { id: _id.toHexString(), ...rest };
}

export async function getMealsCollection(): Promise<Collection<MealDoc>> {
  const client = await clientPromise;
  const collection = client.db().collection<MealDoc>("meals");
  // 頁面以日期查詢當天的紀錄
  globalForMongo._mealsIndexPromise ??= collection.createIndex({ date: 1, createdAt: 1 });
  await globalForMongo._mealsIndexPromise;
  return collection;
}

export async function getFoodsCollection(): Promise<Collection<SavedFood>> {
  const client = await clientPromise;
  const collection = client.db().collection<SavedFood>("foods");
  globalForMongo._foodsIndexPromise ??= Promise.all([
    // 有條碼的以條碼識別同一食物;沒有條碼的以名稱識別(由 upsert 的條件保證)
    collection.createIndex(
      { barcode: 1 },
      { unique: true, partialFilterExpression: { barcode: { $type: "string" } } },
    ),
    collection.createIndex({ name: 1 }),
  ]).catch((err) => {
    globalForMongo._foodsIndexPromise = undefined;
    throw err;
  });
  await globalForMongo._foodsIndexPromise;
  return collection;
}

/**
 * 將加入餐點的食物(不論查詢到的或手動輸入的)存入或更新 foods,之後查詢可直接從資料庫找到。
 * 同一條碼(或無條碼時同一名稱)只存一筆,以最新加入的資料為準
 */
export async function saveFood(food: Omit<SavedFood, "updatedAt">) {
  const collection = await getFoodsCollection();
  const filter = food.barcode ? { barcode: food.barcode } : { barcode: null, name: food.name };
  await collection.updateOne(
    filter,
    { $set: { ...food, updatedAt: new Date().toISOString() } },
    { upsert: true },
  );
}
