import { NextResponse } from "next/server";
import { getSettings } from "@/lib/store";
import { bootSession, usesProxy } from "@/lib/scraper";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  const s = await getSettings();
  const logs: string[] = [];
  const t0 = Date.now();
  try {
    const session = await bootSession({ ...s, retries: Math.min(s.retries, 1) }, (m) => logs.push(m));
    return NextResponse.json({ ok: true, reachable: true, latencyMs: Date.now() - t0, zip: s.zip, zipApplied: session.zipApplied, cookieCount: session.cookieCount, marketplace: s.marketplace, proxy: usesProxy(s), logs, message: session.zipApplied ? `Connected to ${session.domain} · ZIP ${s.zip} active · ${session.cookieCount} cookies` : `Connected to ${session.domain} · ZIP confirmation not returned (continuing)` });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, reachable: false, latencyMs: Date.now() - t0, zip: s.zip, zipApplied: false, cookieCount: 0, marketplace: s.marketplace, proxy: usesProxy(s), logs, message: `Amazon is not reachable cleanly from this deployment IP: ${msg}. Add a US residential proxy / unblocker in Settings → Network (or set SCRAPERAPI_KEY / SCRAPINGBEE_API_KEY / ZENROWS_API_KEY) and test again.` });
  }
}
