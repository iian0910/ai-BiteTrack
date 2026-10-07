"use client";

import { useSyncExternalStore } from "react";

// 數值欄位在資料庫中為 Decimal128,傳到前端時以字串表示以保留原本的小數位數
export interface Product {
  barcode: string;
  name: string;
  totalGrams: string;
  energyKcal: string;
  proteins: string;
  fat: string;
  carbohydrates: string;
  createdAt: string;
}

export type NewProduct = Omit<Product, "createdAt">;

const EMPTY: Product[] = [];

const listeners = new Set<() => void>();
let cache: Product[] = EMPTY;
let loadPromise: Promise<void> | null = null;

function emit() {
  listeners.forEach((l) => l());
}

// 第一次有元件訂閱時才向伺服器載入商品清單
function load() {
  loadPromise ??= fetch("/api/products")
    .then((res) => (res.ok ? (res.json() as Promise<Product[]>) : EMPTY))
    .then((products) => {
      // 載入期間若已新增商品,保留在最前面
      const loaded = new Set(products.map((p) => p.barcode));
      cache = [...cache.filter((p) => !loaded.has(p.barcode)), ...products];
      emit();
    })
    .catch(() => {
      // 載入失敗時允許下次訂閱重試
      loadPromise = null;
    });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  load();
  return () => listeners.delete(listener);
}

export function useProducts(): Product[] {
  return useSyncExternalStore(subscribe, () => cache, () => EMPTY);
}

/** 將商品存入資料庫,失敗時回傳錯誤訊息 */
export async function addProduct(product: NewProduct): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(product),
    });
  } catch {
    return "網路連線發生問題,請稍後再試";
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    return (data as { error?: string } | null)?.error ?? "建立商品失敗,請稍後再試";
  }

  cache = [data as Product, ...cache];
  emit();
  return null;
}
