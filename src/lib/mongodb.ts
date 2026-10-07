import "server-only";

import { Decimal128, MongoClient, type Collection } from "mongodb";
import type { Product } from "@/lib/products";

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error("缺少環境變數 MONGODB_URI,請在 .env.local 設定");
}

export const AMOUNT_KEYS = [
  "totalGrams",
  "energyKcal",
  "proteins",
  "fat",
  "carbohydrates",
] as const;

type AmountKey = (typeof AMOUNT_KEYS)[number];

// 資料庫中的數值以 Decimal128 儲存;舊資料可能仍是 double
export type ProductDoc = Omit<Product, AmountKey> & Record<AmountKey, Decimal128 | number>;

export function toProductDoc(product: Product): ProductDoc {
  const doc = { ...product } as unknown as ProductDoc;
  for (const key of AMOUNT_KEYS) doc[key] = Decimal128.fromString(product[key]);
  return doc;
}

export function fromProductDoc(doc: ProductDoc): Product {
  const product = { ...doc } as unknown as Product;
  // Decimal128 與 number 的 toString 都會得到對應的十進位字串
  for (const key of AMOUNT_KEYS) product[key] = doc[key].toString();
  return product;
}

// 開發模式下 HMR 會重新載入模組,掛在 globalThis 上避免每次都建立新連線
const globalForMongo = globalThis as typeof globalThis & {
  _mongoClientPromise?: Promise<MongoClient>;
  _productsIndexPromise?: Promise<string>;
};

const clientPromise =
  globalForMongo._mongoClientPromise ??
  (globalForMongo._mongoClientPromise = new MongoClient(uri).connect());

export async function getProductsCollection(): Promise<Collection<ProductDoc>> {
  const client = await clientPromise;
  // 資料庫名稱取自 URI 路徑
  const collection = client.db().collection<ProductDoc>("products");
  globalForMongo._productsIndexPromise ??= collection.createIndex(
    { barcode: 1 },
    { unique: true },
  );
  await globalForMongo._productsIndexPromise;
  return collection;
}
