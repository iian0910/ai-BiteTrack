"use client";

import { useEffect, useRef } from "react";
import { monthDates, parseDate } from "@/lib/meals";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

interface Props {
  today: string;
  selected: string;
  /** 每天攝取的總熱量;null 表示尚在載入 */
  kcalByDate: Record<string, number> | null;
  onSelect: (date: string) => void;
}

/** 本月日期的橫向選單,顯示每天的熱量;未來的日期不可選 */
export default function DateStrip({ today, selected, kcalByDate, onSelect }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  // 第一次定位直接跳到選取的日期,之後切換才用平滑捲動
  const scrolledRef = useRef(false);

  useEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!list || !el) return;
    // 只捲動選單本身,用 scrollIntoView 會連帶捲動整個頁面
    list.scrollTo({
      left: el.offsetLeft - (list.clientWidth - el.offsetWidth) / 2,
      behavior: scrolledRef.current ? "smooth" : "instant",
    });
    scrolledRef.current = true;
  }, [selected]);

  const month = parseDate(today).getMonth() + 1;

  return (
    <nav aria-label="選擇日期" className="flex flex-col gap-2">
      <p className="text-xs font-medium text-zinc-500">{month} 月</p>
      <div
        ref={listRef}
        className="relative -mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {monthDates(today).map((date) => {
          const d = parseDate(date);
          const isSelected = date === selected;
          const isToday = date === today;
          const isFuture = date > today;
          const kcal = kcalByDate?.[date];
          return (
            <button
              key={date}
              type="button"
              disabled={isFuture}
              aria-pressed={isSelected}
              aria-label={isToday ? `${date}(今天)` : date}
              onClick={() => onSelect(date)}
              className={`flex w-14 shrink-0 snap-center flex-col items-center gap-0.5 rounded-xl border py-2 transition-colors ${
                isSelected
                  ? "border-transparent bg-foreground text-background"
                  : "border-black/[.08] bg-white text-zinc-950 hover:bg-zinc-100 disabled:opacity-40 disabled:hover:bg-white dark:border-white/[.145] dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800 dark:disabled:hover:bg-zinc-900"
              }`}
            >
              <span className={`text-[11px] ${isSelected ? "opacity-70" : "text-zinc-500"}`}>
                {isToday ? "今天" : WEEKDAYS[d.getDay()]}
              </span>
              <span className="text-base font-semibold tabular-nums">{d.getDate()}</span>
              {/* 沒有紀錄時保留高度,避免載入後版面跳動 */}
              <span
                className={`h-4 text-[10px] tabular-nums ${isSelected ? "opacity-70" : "text-zinc-500"}`}
              >
                {kcal !== undefined ? Math.round(kcal) : isFuture || !kcalByDate ? "" : "–"}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
