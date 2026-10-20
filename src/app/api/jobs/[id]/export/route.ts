import { NextResponse } from "next/server";
import { db } from "@/db";
import { scrapeJobs, products } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { buildCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const [job] = await db.select().from(scrapeJobs).where(eq(scrapeJobs.id, id)).limit(1);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  const items = await db.select().from(products).where(eq(products.jobId, id)).orderBy(asc(products.position));
  const snap = (job.settingsSnapshot || {}) as { extraColumns?: string[] };
  const csv = buildCsv(items, snap.extraColumns || []);
  const name = `listing-harvest-${job.id.slice(0, 8)}-${items.length}-products.csv`;
  return new Response("\uFEFF" + csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"` } });
}
