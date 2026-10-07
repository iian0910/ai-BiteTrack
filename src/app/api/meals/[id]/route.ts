import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { getMealsCollection } from "@/lib/mongodb";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "紀錄編號不正確" }, { status: 400 });
  }

  try {
    const collection = await getMealsCollection();
    const { deletedCount } = await collection.deleteOne({ _id: new ObjectId(id) });
    if (deletedCount === 0) {
      return NextResponse.json({ error: "找不到這筆紀錄" }, { status: 404 });
    }
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("刪除飲食紀錄失敗", err);
    return NextResponse.json(
      { error: "刪除紀錄失敗,請稍後再試" },
      { status: 500 },
    );
  }
}
