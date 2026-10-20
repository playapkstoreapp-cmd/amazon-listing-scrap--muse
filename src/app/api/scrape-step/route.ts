import { NextResponse } from "next/server";
import { db } from "@/db";
import { scrapeJobs, products } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { bootSession, fetchWithRetry, jitter, parseListing, parseProduct, withPage, toProductLink, type ListingStub, type Session } from "@/lib/scraper";
import { MARKETPLACES } from "@/lib/agents";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Log = { t: string; msg: string };

async function persist(id: string, patch: Partial<typeof scrapeJobs.$inferInsert>, logs: Log[]) {
  await db.update(scrapeJobs).set({ ...patch, logs: logs.slice(-400), updatedAt: new Date() }).where(eq(scrapeJobs.id, id));
}

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const jobId = String(b.jobId || "");
  const [job] = await db.select().from(scrapeJobs).where(eq(scrapeJobs.id, jobId)).limit(1);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (job.status !== "running") return NextResponse.json({ job, done: job.status === "done", products: await db.select().from(products).where(eq(products.jobId, jobId)).orderBy(asc(products.position)) });

  const s = job.settingsSnapshot as Parameters<typeof bootSession>[0];
  const logs: Log[] = ((job.logs as Log[]) || []).slice();
  const log = (msg: string) => logs.push({ t: new Date().toISOString(), msg });
  const collected: ListingStub[] = ((job.collected as ListingStub[]) || []).slice();
  let session = (job.sessionData || {}) as Partial<Session>;
  const domain = MARKETPLACES[job.marketplace]?.domain || "www.amazon.com";
  const fail = async (phase: string, msg: string) => {
    log(`FAILED — ${msg}`);
    await persist(jobId, { status: "failed", phase: "failed", error: msg, collected, sessionData: session, cursor: job.cursor }, logs);
    const [j] = await db.select().from(scrapeJobs).where(eq(scrapeJobs.id, jobId));
    return NextResponse.json({ job: j, done: false, failed: true, products: await db.select().from(products).where(eq(products.jobId, jobId)).orderBy(asc(products.position)) });
  };
  const respond = async (patch: Partial<typeof scrapeJobs.$inferInsert>) => {
    await persist(jobId, { ...patch, collected, sessionData: session }, logs);
    const [j] = await db.select().from(scrapeJobs).where(eq(scrapeJobs.id, jobId));
    const items = await db.select().from(products).where(eq(products.jobId, jobId)).orderBy(asc(products.position));
    return NextResponse.json({ job: { ...j, productCount: items.length }, done: j.status === "done", products: items });
  };

  try {
    // ── Phase: boot ──────────────────────────────────────────────────────────
    if (job.phase === "queued" || job.phase === "boot" || !session.booted) {
      const sess = await bootSession(s, log);
      session = sess;
      return respond({ phase: "listing", status: "running" });
    }

    // ── Phase: listing (one page per step) ───────────────────────────────────
    if (job.phase === "listing") {
      if (collected.length >= job.targetCount) { log(`Target reached in listing phase (${collected.length} ASINs queued) — moving to product pages`); return respond({ phase: "details" }); }
      const page = job.currentPage;
      const { url } = withPage(job.url, page);
      log(`Fetching listing page ${page}: ${url.slice(0, 110)}${url.length > 110 ? "…" : ""}`);
      await jitter(s);
      const sess = session as Session;
      const r = await fetchWithRetry(url, s, sess, log);
      session = sess;
      const parsed = parseListing(r.html, domain, !!s.includeSponsored);
      if (parsed.selectedPage !== null && parsed.selectedPage !== page) {
        log(`Pagination clamp detected: requested page ${page}, Amazon served page ${parsed.selectedPage} (.s-pagination-selected) — halting pagination with ${collected.length} ASINs`);
        return respond({ phase: "details" });
      }
      const seen = new Set(collected.map((c) => c.asin));
      const fresh = parsed.items.filter((i) => !seen.has(i.asin));
      fresh.forEach((i) => collected.push(i));
      const kept = collected.slice(0, Math.max(job.targetCount, collected.length));
      log(`Page ${page} verified${parsed.selectedPage ? ` (.s-pagination-selected = ${parsed.selectedPage})` : ""} · ${fresh.length} new organic ASINs (${parsed.items.length} cards on page) · total queued ${Math.min(collected.length, job.targetCount)}/${job.targetCount}${parsed.totalHints ? ` · “${parsed.totalHints.slice(0, 80)}”` : ""}${parsed.cutOff ? " · cutoff marker reached" : ""}`);
      if (!fresh.length || parsed.cutOff || collected.length >= job.targetCount) {
        if (!fresh.length && page > job.startPage && collected.length === 0) return fail("listing", "Amazon returned no organic results for this listing from the deployment IP — it may be rate-limiting datacenter traffic. Add a US residential proxy / unblocker in Settings → Network and resume this run.");
        log(collected.length >= job.targetCount ? "Queue full — switching to product detail pages" : "No more exact-listing pages — switching to product detail pages");
        return respond({ phase: "details", collected: kept, currentPage: page + 1 });
      }
      return respond({ phase: "listing", collected: kept, currentPage: page + 1 });
    }

    // ── Phase: details (one batch per step) ──────────────────────────────────
    if (job.phase === "details") {
      const queue = collected.slice(0, job.targetCount);
      let cursor = job.cursor;
      if (cursor >= queue.length) {
        log(`Run complete — ${queue.length} products harvested. CSV is ready in History.`);
        return respond({ phase: "done", status: "done", completedAt: new Date() });
      }
      const batch = queue.slice(cursor, cursor + Math.max(1, s.detailBatch || 4));
      log(`Parsing product pages ${cursor + 1}–${cursor + batch.length} of ${queue.length} (batch size ${s.detailBatch})…`);
      for (const stub of batch) {
        const sess = session as Session;
        try {
          await jitter(s);
          const detailUrl = stub.link || toProductLink("", stub.asin, domain);
          const r = await fetchWithRetry(detailUrl, s, sess, log);
          session = sess;
          const p = parseProduct(r.html, stub, domain);
          await db.insert(products).values({ jobId, asin: stub.asin, position: cursor + 1, title: p.title || stub.title, link: toProductLink(stub.link, stub.asin, domain), description: p.description, image1: p.image1, image2: p.image2, price: p.price, rating: p.rating, reviews: p.reviews })
            .onConflictDoNothing();
          log(`✓ ${stub.asin} — ${(p.title || stub.title).slice(0, 70)}`);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          // Keep listing-level data so a blocked detail page never loses the product
          await db.insert(products).values({ jobId, asin: stub.asin, position: cursor + 1, title: stub.title, link: toProductLink(stub.link, stub.asin, domain), description: "Detail page could not be parsed in this pass (" + msg.slice(0, 80) + "). Title, link and image were preserved from the listing card.", image1: stub.image, image2: stub.image, price: stub.price, rating: stub.rating, reviews: stub.reviews }).onConflictDoNothing();
          log(`Detail fetch failed for ${stub.asin} (${msg.slice(0, 80)}) — listing data preserved`);
        }
        cursor++;
      }
      const doneNow = cursor >= queue.length;
      if (doneNow) log(`Run complete — ${queue.length} products harvested. Download the CSV from History.`);
      return respond({ phase: doneNow ? "done" : "details", status: doneNow ? "done" : "running", completedAt: doneNow ? new Date() : undefined, cursor });
    }

    return respond({});
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const friendly = /captcha|robot|rate|429|503/i.test(msg)
      ? `${msg}. Amazon is rate-limiting this deployment's datacenter IP. Drop a US residential proxy / unblocker URL template into Settings → Network (or set SCRAPERAPI_KEY / SCRAPINGBEE_API_KEY / ZENROWS_API_KEY as a secret), then Resume this run — progress is saved.`
      : msg;
    return fail(job.phase, friendly);
  }
}
