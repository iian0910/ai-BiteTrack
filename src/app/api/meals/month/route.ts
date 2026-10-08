import { NextResponse, type NextRequest } from "next/server";
import { fromMealDoc, getMealsCollection } from "@/lib/mongodb";
import { MONTH_PATTERN } from "@/lib/meals";

/** 取得整個月的飲食紀錄,month 格式 YYYY-MM */
export async function GET(request: NextRequest) {
  const month = request.nextUrl.searchParams.get("month") ?? "";
  if (!MONTH_PATTERN.test(month)) {
    return NextResponse.json({ error: "月份格式不正確" }, { status: 400 });
  }

  try {
    const collection = await getMealsCollection();
    // date 為 YYYY-MM-DD 字串,依字典序比較即可涵蓋整個月
    const docs = await collection
      .find({ date: { $gte: `${month}-01`, $lte: `${month}-31` } })
      .sort({ date: 1, createdAt: 1 })
      .toArray();
    return NextResponse.json(docs.map(fromMealDoc));
  } catch (err) {
    console.error("讀取當月飲食紀錄失敗", err);
    return NextResponse.json(
      { error: "讀取飲食紀錄失敗,請稍後再試" },
      { status: 500 },
    );
  }
}
