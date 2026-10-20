import { NextResponse } from "next/server";
import { db } from "@/db";
import { scrapeJobs } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { products } from "@/db/schema";
import { getSettings, ensureSeed } from "@/lib/store";
import { startPageOf } from "@/lib/scraper";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSeed();
  const jobs = await db.select().from(scrapeJobs).orderBy(desc(scrapeJobs.createdAt));
  const out = [];
  for (const j of jobs) {
    const c = await db.select({ c: sql<number>`count(*)::int` }).from(products).where(eq(products.jobId, j.id));
    const preview = await db.select({ image: products.image1 }).from(products).where(eq(products.jobId, j.id)).orderBy(products.position).limit(6);
    out.push({ ...j, productCount: c[0]?.c || 0, previewImages: preview.map((p) => p.image).filter(Boolean) });
  }
  return NextResponse.json(out);
}

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const url = String(b.url || "").trim();
  if (!url || !/^https?:\/\/(www\.)?amazon\./i.test(url)) return NextResponse.json({ error: "Paste a valid Amazon listing URL (amazon.*) to start a harvest." }, { status: 400 });
  const targetCount = Math.min(500, Math.max(10, Number(b.targetCount) || 24));
  const s = await getSettings();
  const id = randomUUID();
  const sp = startPageOf(url);
  const snapshot = { ...s, marketplace: b.marketplace ? String(b.marketplace) : s.marketplace, zip: b.zip ? String(b.zip) : s.zip };
  await db.insert(scrapeJobs).values({
    id, url, marketplace: snapshot.marketplace, zip: snapshot.zip, targetCount, status: "running", phase: "queued", startPage: sp, currentPage: sp,
    collected: [], cursor: 0, settingsSnapshot: snapshot, sessionData: {}, logs: [{ t: new Date().toISOString(), msg: `Job created · target ${targetCount} products · start page ${sp} · ${snapshot.marketplace} · ZIP ${snapshot.zip}` }],
  });
  const [job] = await db.select().from(scrapeJobs).where(eq(scrapeJobs.id, id));
  return NextResponse.json(job);
}
