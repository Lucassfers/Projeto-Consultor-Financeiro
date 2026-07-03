"use client";

import { useEffect, useMemo, useRef } from "react";
import { formatCurrency, monthLabel, transactionMonth } from "@/lib/store";
import type { CategorySummary, Transaction } from "@/types";

function setup(canvas: HTMLCanvasElement, height: number): { context: CanvasRenderingContext2D; width: number } {
  const ratio = devicePixelRatio || 1;
  const width = canvas.clientWidth;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  canvas.style.height = `${height}px`;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D nao esta disponivel.");
  context.scale(ratio, ratio);
  return { context, width };
}

interface DashboardChartProps { mode: "bar" | "line"; categories: CategorySummary[]; months: string[]; transactions: Transaction[]; }
interface GridOptions { left: number; right: number; top: number; areaW: number; areaH: number; width: number; max: number; }
interface Point { x: number; y: number; }
interface LineSeries { name: string; color: string; months: string[]; values: number[]; total: number; }

const fallbackColors = ["#6d5dfc", "#00a878", "#7b61ff", "#ef3e8b", "#0ea5e9", "#ef4444", "#f59e0b", "#10b981", "#8b5cf6", "#f97316"];

export function DashboardChart({ mode, categories, months, transactions }: DashboardChartProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const lineSeries = useMemo(() => buildLineSeries(months, transactions, categories), [months, transactions, categories]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || (!categories.length && !transactions.length)) return;
    const draw = () => {
      const height = 420;
      const { context, width } = setup(canvas, height);
      const left = 74, right = 30, top = 30, areaH = 332, areaW = width - left - right;
      const drawableW = Math.max(areaW, 1);
      context.clearRect(0, 0, width, height);
      context.font = "12px Arial";
      context.lineCap = "round";
      context.lineJoin = "round";

      const values = mode === "bar" ? categories.map((x) => x.value) : lineSeries.flatMap((series) => series.values);
      const max = niceMax(Math.max(...values, 1));
      drawGrid(context, { left, right, top, areaW: drawableW, areaH, width, max });

      if (mode === "bar") {
        const gap = Math.max(12, Math.min(22, drawableW / Math.max(categories.length, 1) * .16));
        const barW = Math.max(20, (drawableW - gap * Math.max(categories.length - 1, 0)) / Math.max(categories.length, 1));
        categories.forEach((item, index) => {
          const h = item.value / max * areaH, x = left + index * (barW + gap), y = top + areaH - h;
          context.fillStyle = item.color;
          roundRect(context, x, y, barW, h, 8);
          context.fill();
          context.fillStyle = "#607169";
          context.textAlign = "center";
          context.fillText(shortText(item.name, 12), x + barW / 2, height - 20);
          context.fillStyle = "#173d34";
          context.font = "bold 11px Arial";
          context.fillText(compactCurrency(item.value), x + barW / 2, Math.max(top + 12, y - 8));
          context.font = "12px Arial";
        });
      } else {
        lineSeries.forEach((series) => {
          const points = series.values.map((value, index) => ({
            x: left + (series.months.length === 1 ? drawableW / 2 : index * drawableW / (series.months.length - 1)),
            y: top + areaH - value / max * areaH,
          }));
          context.strokeStyle = series.color;
          context.lineWidth = 3;
          drawSmoothLine(context, points);
          points.forEach((point) => {
            context.beginPath();
            context.fillStyle = "#fffdf8";
            context.strokeStyle = series.color;
            context.lineWidth = 2;
            context.arc(point.x, point.y, 4, 0, Math.PI * 2);
            context.fill();
            context.stroke();
          });
        });
        [...months].reverse().forEach((month, index, ordered) => {
          const x = left + (ordered.length === 1 ? drawableW / 2 : index * drawableW / (ordered.length - 1));
          context.fillStyle = "#607169";
          context.textAlign = "center";
          context.fillText(monthLabel(month, true), x, height - 20);
        });
      }
    };
    draw(); addEventListener("resize", draw); return () => removeEventListener("resize", draw);
  }, [mode, categories, months, transactions, lineSeries]);

  return <div>
    <canvas ref={ref} className="w-full" />
    {mode === "line" && lineSeries.length > 0 && <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-2 px-3 text-xs text-ink">
      {lineSeries.map((series) => <span key={series.name} className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <span className="size-2 rounded-full" style={{ backgroundColor: series.color }} />{series.name}
      </span>)}
    </div>}
  </div>;
}

function buildLineSeries(months: string[], transactions: Transaction[], categories: CategorySummary[]): LineSeries[] {
  const orderedMonths = [...months].reverse();
  const colorByName = new Map(categories.map((category) => [category.name, category.color]));
  const names = [...new Set(transactions.filter((item) => item.type === "expense").map((item) => item.category || "Outros"))];
  return names.map((name, index) => {
    const values = orderedMonths.map((month) => transactions
      .filter((item) => item.type === "expense" && (item.category || "Outros") === name && transactionMonth(item) === month)
      .reduce((sum, item) => sum + Number(item.amount), 0));
    return { name, color: colorByName.get(name) || fallbackColors[index % fallbackColors.length], months: orderedMonths, values, total: values.reduce((sum, value) => sum + value, 0) };
  }).filter((series) => series.total > 0).sort((a, b) => b.total - a.total).slice(0, 10);
}

function drawGrid(context: CanvasRenderingContext2D, options: GridOptions) {
  const { left, right, top, areaW, areaH, width, max } = options;
  context.strokeStyle = "#e8e3d8";
  context.fillStyle = "#607169";
  context.lineWidth = 1;
  context.setLineDash([4, 5]);
  context.textAlign = "right";
  for (let i = 0; i <= 4; i++) {
    const value = max - max * i / 4;
    const y = top + areaH * i / 4;
    context.beginPath();
    context.moveTo(left, y);
    context.lineTo(width - right, y);
    context.stroke();
    context.fillText(compactCurrency(value), left - 10, y + 4);
  }
  context.setLineDash([]);
  context.strokeStyle = "#d8d2c4";
  context.beginPath();
  context.moveTo(left, top + areaH);
  context.lineTo(left + areaW, top + areaH);
  context.stroke();
}

function drawSmoothLine(context: CanvasRenderingContext2D, points: Point[]) {
  if (!points.length) return;
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  if (points.length === 1) {
    context.lineTo(points[0].x + .01, points[0].y);
  } else {
    for (let i = 0; i < points.length - 1; i++) {
      const current = points[i], next = points[i + 1];
      const midX = (current.x + next.x) / 2;
      context.bezierCurveTo(midX, current.y, midX, next.y, next.x, next.y);
    }
  }
  context.stroke();
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height);
  context.lineTo(x, y + height);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

function niceMax(value: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude * 1.15) * magnitude;
}

function compactCurrency(value: number): string {
  return formatCurrency(value).replace(/\s/g, " ");
}

function shortText(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
}
