import { NextResponse, type NextRequest } from "next/server";
import { getFoodsCollection } from "@/lib/mongodb";
import {
  fromOffProduct,
  fromSavedFood,
  OFF_BASE_URL,
  OFF_FIELDS,
  USER_AGENT,
  type OffProduct,
} from "@/lib/nutrition";

const SEARCH_A_LICIOUS_URL = "https://search.openfoodfacts.org/search";
// 每次回傳的筆數上限
const LOCAL_LIMIT = 20;
const OFF_LIMIT = 30;

interface OffSearchResponse {
  products?: OffProduct[];
}

// search-a-licious 的 brands 為陣列,其餘欄位與 OFF 商品相同
interface SearchALiciousResponse {
  hits?: (Omit<OffProduct, "brands"> & { brands?: string[] | string })[];
}

type OffError = "rate-limited" | "unreachable" | "failed";

const OFF_ERRORS: Record<OffError, { status: number; body: { error: string } }> = {
  "rate-limited": {
    status: 429,
    body: { error: "查詢次數過於頻繁,請稍候約一分鐘再試" },
  },
  unreachable: {
    status: 502,
    body: { error: "查詢服務暫時無法連線,請稍後再試" },
  },
  failed: {
    status: 502,
    body: { error: "查詢服務發生錯誤,請稍後再試" },
  },
};

// 商品資料很少變動,快取一天;重複查詢同一關鍵字時不必再消耗 OFF 的搜尋次數
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FALLBACK_CACHE_TTL_MS = 10 * 60 * 1000;
// OFF 舊版搜尋 API 每分鐘約只允許 10 次(同一個對外 IP 共用),被擋後這段時間直接改用備援
const RATE_LIMIT_BACKOFF_MS = 60 * 1000;

const globalForSearch = globalThis as typeof globalThis & {
  _offFuzzySearchCache?: Map<string, { expires: number; products: OffProduct[] }>;
  _offRateLimitedUntil?: number;
};
const searchCache = (globalForSearch._offFuzzySearchCache ??= new Map());

async function fetchOff(url: string, timeoutMs = 10000): Promise<Response | OffError> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 429 || res.status === 503) return "rate-limited";
    if (!res.ok) return "failed";
    return res;
  } catch {
    return "unreachable";
  }
}

/** OFF 舊版搜尋 API:可比對中文名稱,也帶有每份營養成分,但每分鐘次數很少 */
async function searchLegacy(keyword: string): Promise<OffProduct[] | OffError> {
  const params = new URLSearchParams({
    search_terms: keyword,
    search_simple: "1",
    json: "1",
    page_size: String(OFF_LIMIT),
    fields: OFF_FIELDS,
  });
  const res = await fetchOff(`${OFF_BASE_URL}/cgi/search.pl?${params}`);
  if (typeof res === "string") return res;

  try {
    const data = (await res.json()) as OffSearchResponse;
    return data.products ?? [];
  } catch {
    return "failed";
  }
}

/** 備援:search-a-licious 次數限制寬鬆,但只有主要語言名稱與每 100g 的數值 */
async function searchFallback(keyword: string): Promise<OffProduct[] | OffError> {
  const params = new URLSearchParams({
    q: keyword,
    page_size: String(OFF_LIMIT),
    fields: OFF_FIELDS,
  });
  const res = await fetchOff(`${SEARCH_A_LICIOUS_URL}?${params}`);
  if (typeof res === "string") return res;

  try {
    const data = (await res.json()) as SearchALiciousResponse;
    return (data.hits ?? []).map((h) => ({
      ...h,
      brands: Array.isArray(h.brands) ? h.brands.join(", ") : h.brands,
    }));
  } catch {
    return "failed";
  }
}

/** 向 OFF 模糊搜尋;舊版 API 被限流時改用備援 */
async function searchOff(keyword: string): Promise<OffProduct[] | OffError> {
  const cached = searchCache.get(keyword);
  if (cached && cached.expires > Date.now()) return cached.products;

  let products: OffProduct[] | OffError = "rate-limited";
  let ttl = CACHE_TTL_MS;
  if ((globalForSearch._offRateLimitedUntil ?? 0) <= Date.now()) {
    products = await searchLegacy(keyword);
    if (products === "rate-limited") {
      globalForSearch._offRateLimitedUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
    }
  }
  if (products === "rate-limited") {
    console.warn("OFF 搜尋 API 被限流,改用 search-a-licious 備援");
    products = await searchFallback(keyword);
    // 備援比不到中文名稱,結果可能不完整,短暫快取即可,之後再給舊版 API 機會
    ttl = FALLBACK_CACHE_TTL_MS;
  }
  if (!Array.isArray(products)) return products;

  // 清掉過期項目,避免快取無限成長
  const now = Date.now();
  for (const [key, entry] of searchCache) {
    if (entry.expires <= now) searchCache.delete(key);
  }
  searchCache.set(keyword, { expires: now + ttl, products });
  return products;
}

type FoodResult = ReturnType<typeof fromSavedFood> | ReturnType<typeof fromOffProduct>;

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 模糊搜尋資料庫中的食物:以空白拆成多個關鍵字,名稱需包含每一個(不分大小寫)。
 * 完全相同的排最前,其次是開頭相同,再來是名稱較短(較接近)的
 */
async function searchLocal(keyword: string): Promise<FoodResult[]> {
  const terms = keyword.split(/\s+/).filter(Boolean);
  try {
    const foods = await getFoodsCollection();
    const saved = await foods
      .find(
        { $and: terms.map((t) => ({ name: { $regex: escapeRegex(t), $options: "i" } })) },
        { projection: { _id: 0 } },
      )
      .sort({ updatedAt: -1 })
      .limit(LOCAL_LIMIT * 5)
      .toArray();

    const lower = keyword.toLowerCase();
    const rank = (name: string) => {
      const n = name.toLowerCase();
      return n === lower ? 0 : n.startsWith(lower) ? 1 : 2;
    };
    return saved
      .sort((a, b) => rank(a.name) - rank(b.name) || a.name.length - b.name.length)
      .slice(0, LOCAL_LIMIT)
      .map(fromSavedFood);
  } catch (err) {
    // 資料庫異常時仍改查 OFF,不中斷查詢
    console.error("查詢資料庫食物失敗", err);
    return [];
  }
}

/**
 * 以關鍵字模糊搜尋商品。預設先查資料庫,有結果就不呼叫 OFF 以節省次數;
 * scope=off 時略過資料庫,直接搜尋 OFF(「搜尋更多」)
 */
export async function GET(request: NextRequest) {
  const keyword = request.nextUrl.searchParams.get("name")?.trim() ?? "";
  const scope = request.nextUrl.searchParams.get("scope");

  if (!keyword) {
    return NextResponse.json({ error: "請輸入商品名稱" }, { status: 400 });
  }

  if (scope !== "off") {
    const local = await searchLocal(keyword);
    if (local.length > 0) return NextResponse.json({ source: "local", results: local });
  }

  const off = await searchOff(keyword);
  if (!Array.isArray(off)) {
    return NextResponse.json(OFF_ERRORS[off].body, { status: OFF_ERRORS[off].status });
  }

  const seen = new Set<string>();
  const results: FoodResult[] = [];
  for (const product of off) {
    if (!product.code || seen.has(product.code)) continue;
    seen.add(product.code);
    results.push(fromOffProduct(product.code, product));
  }

  if (results.length === 0) {
    return NextResponse.json(
      { error: "查無相關資訊", notFound: true },
      { status: 404 },
    );
  }

  // 有營養成分資料的排前面,完全沒資料的放最後(sort 為穩定排序,其餘維持 OFF 的相關度順序)
  const hasData = (r: FoodResult) => Object.values(r.nutriments).some((v) => v !== null);
  results.sort((a, b) => Number(hasData(b)) - Number(hasData(a)));

  return NextResponse.json({ source: "off", results });
}
