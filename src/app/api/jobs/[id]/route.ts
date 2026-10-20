import { NextResponse } from "next/server";
import { db } from "@/db";
import { scrapeJobs, products } from "@/db/schema";
import { eq, asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const [job] = await db.select().from(scrapeJobs).where(eq(scrapeJobs.id, id)).limit(1);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  const items = await db.select().from(products).where(eq(products.jobId, id)).orderBy(asc(products.position));
  return NextResponse.json({ job: { ...job, productCount: items.length }, products: items });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await db.delete(products).where(eq(products.jobId, id));
  await db.delete(scrapeJobs).where(eq(scrapeJobs.id, id));
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const b = await req.json().catch(() => ({}));
  const [job] = await db.select().from(scrapeJobs).where(eq(scrapeJobs.id, id)).limit(1);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (b.action === "resume") {
    if (job.status === "done") return NextResponse.json({ error: "This run is already complete." }, { status: 400 });
    await db.update(scrapeJobs).set({ status: "running", phase: job.phase === "failed" || job.phase === "done" ? "listing" : job.phase, error: null, updatedAt: new Date() }).where(eq(scrapeJobs.id, id));
  }
  if (b.action === "pause") await db.update(scrapeJobs).set({ status: "paused", updatedAt: new Date() }).where(eq(scrapeJobs.id, id));
  const [updated] = await db.select().from(scrapeJobs).where(eq(scrapeJobs.id, id));
  return NextResponse.json(updated);
}
