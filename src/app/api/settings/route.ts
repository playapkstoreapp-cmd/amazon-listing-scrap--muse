import { NextResponse } from "next/server";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { getSettings } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() { return NextResponse.json(await getSettings()); }

export async function PUT(req: Request) {
  const b = await req.json().catch(() => ({}));
  const clean = {
    zip: String(b.zip ?? "90009").slice(0, 12), marketplace: String(b.marketplace ?? "amazon.com"),
    delayMin: Math.min(10000, Math.max(0, Number(b.delayMin) || 0)), delayMax: Math.min(15000, Math.max(0, Number(b.delayMax) || 0)),
    retries: Math.min(5, Math.max(0, Number(b.retries) || 0)), detailBatch: Math.min(12, Math.max(1, Number(b.detailBatch) || 4)),
    includeSponsored: !!b.includeSponsored, extraColumns: Array.isArray(b.extraColumns) ? b.extraColumns.map(String) : [],
    userAgents: Array.isArray(b.userAgents) ? b.userAgents.map(String).filter(Boolean).slice(0, 20) : [],
    proxyTemplate: String(b.proxyTemplate ?? ""), updatedAt: new Date(),
  };
  if (clean.delayMax < clean.delayMin) clean.delayMax = clean.delayMin;
  await db.insert(appSettings).values({ id: 1, ...clean }).onConflictDoUpdate({ target: appSettings.id, set: clean });
  return NextResponse.json(await getSettings());
}
