import * as cheerio from "cheerio";
import { pickAgent, browserHeaders, MARKETPLACES, type AgentProfile } from "./agents";

export interface ListingStub { asin: string; title: string; link: string; image: string; price: string; rating: string; reviews: string; sponsored: boolean; }
export interface Session { cookies: string; booted: boolean; zipApplied: boolean; cookieCount: number; domain: string; }
export interface SettingsLike { zip: string; marketplace: string; delayMin: number; delayMax: number; retries: number; detailBatch: number; includeSponsored: boolean; extraColumns: string[]; userAgents: string[]; proxyTemplate: string; }

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const jitter = (s: SettingsLike) => sleep(s.delayMin + Math.random() * Math.max(0, s.delayMax - s.delayMin));

function wrapProxy(url: string, s: SettingsLike): string {
  const tpl = (s.proxyTemplate || "").trim();
  if (tpl) return tpl.includes("{url}") ? tpl.replace("{url}", encodeURIComponent(url)) : tpl + encodeURIComponent(url);
  if (process.env.SCRAPERAPI_KEY) return `https://api.scraperapi.com/?api_key=${process.env.SCRAPERAPI_KEY}&url=${encodeURIComponent(url)}&country_code=us`;
  if (process.env.SCRAPINGBEE_API_KEY) return `https://app.scrapingbee.com/api/v1/?api_key=${process.env.SCRAPINGBEE_API_KEY}&url=${encodeURIComponent(url)}&render_js=false`;
  if (process.env.ZENROWS_API_KEY) return `https://api.zenrows.com/v1/?apikey=${process.env.ZENROWS_API_KEY}&url=${encodeURIComponent(url)}`;
  return url;
}
export function usesProxy(s: SettingsLike) { return !!(s.proxyTemplate?.trim() || process.env.SCRAPERAPI_KEY || process.env.SCRAPINGBEE_API_KEY || process.env.ZENROWS_API_KEY); }

function mergeCookies(existing: string, res: Response): string {
  const jar = new Map<string, string>();
  (existing || "").split(";").map((x) => x.trim()).filter(Boolean).forEach((kv) => { const i = kv.indexOf("="); if (i > 0) jar.set(kv.slice(0, i), kv.slice(i + 1)); });
  // Node fetch exposes set-cookie via getSetCookie where available
  const anyHeaders = res.headers as unknown as { getSetCookie?: () => string[] };
  let raw: string[] = [];
  if (typeof anyHeaders.getSetCookie === "function") raw = anyHeaders.getSetCookie();
  else { const single = res.headers.get("set-cookie"); if (single) raw = [single]; }
  raw.forEach((line) => { const first = line.split(";")[0]; const i = first.indexOf("="); if (i > 0) jar.set(first.slice(0, i).trim(), first.slice(i + 1).trim()); });
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

export function isBlocked(html: string, status: number): string | null {
  if (status === 429 || status === 503) return `Amazon returned HTTP ${status} (rate-limited)`;
  if (/captcha|enter the characters you see below|api-services-support@amazon|Sorry, we just need to make sure you're not a robot/i.test(html)) return "Amazon served a captcha / robot check";
  if (status >= 400) return `HTTP ${status}`;
  return null;
}

export async function fetchPage(url: string, s: SettingsLike, session?: Session): Promise<{ html: string; status: number; cookies: string; ms: number; agent: AgentProfile }> {
  const agent = pickAgent(s.userAgents);
  const target = wrapProxy(url, s);
  const proxied = target !== url;
  const t0 = Date.now();
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 45000);
  try {
    const res = await fetch(target, { headers: browserHeaders(agent, session?.cookies && !proxied ? { cookie: session.cookies } : {}), redirect: "follow", signal: ctrl.signal, cache: "no-store" });
    const html = await res.text();
    return { html, status: res.status, cookies: session ? mergeCookies(session.cookies, res) : mergeCookies("", res), ms: Date.now() - t0, agent };
  } finally { clearTimeout(timer); }
}

export async function fetchWithRetry(url: string, s: SettingsLike, session: Session | undefined, onLog: (m: string) => void): Promise<{ html: string; status: number; cookies: string }> {
  let lastErr = "";
  for (let attempt = 0; attempt <= Math.max(0, s.retries); attempt++) {
    try {
      const r = await fetchPage(url, s, session);
      if (session) session.cookies = r.cookies;
      const blocked = isBlocked(r.html, r.status);
      if (!blocked) return r;
      lastErr = blocked;
      onLog(`Attempt ${attempt + 1}: ${blocked} — ${attempt < s.retries ? "retrying with a fresh user-agent…" : "giving up"}`);
      if (attempt < s.retries) await sleep(1200 + attempt * 1500);
    } catch (e) { lastErr = e instanceof Error ? e.message : String(e); onLog(`Attempt ${attempt + 1} network error: ${lastErr}`); if (attempt < s.retries) await sleep(1000); }
  }
  throw new Error(lastErr || "Fetch failed");
}

export async function bootSession(s: SettingsLike, onLog: (m: string) => void): Promise<Session> {
  const domain = MARKETPLACES[s.marketplace]?.domain || "www.amazon.com";
  const session: Session = { cookies: "", booted: false, zipApplied: false, cookieCount: 0, domain };
  onLog(`Booting session on ${domain} (proxy ${usesProxy(s) ? "ON" : "direct"})…`);
  const home = await fetchWithRetry(`https://${domain}/`, s, session, onLog);
  session.cookies = home.cookies; session.booted = true;
  session.cookieCount = session.cookies ? session.cookies.split(";").filter(Boolean).length : 0;
  onLog(`Homepage reached (HTTP ${home.status}) · ${session.cookieCount} cookies jarred`);
  // Apply ZIP via Amazon's glow address-change endpoint (POST portal-migration)
  if (s.zip) {
    try {
      const agent = pickAgent(s.userAgents);
      const proxied = usesProxy(s);
      const target = wrapProxy(`https://${domain}/portal-migration/hz/glow/address-change`, s);
      const body = new URLSearchParams({ locationType: "LOCATION_INPUT", zipCode: s.zip, storeContext: "generic", deviceType: "desktop", pageType: "Search", actionSource: "glow" }).toString();
      const res = await fetch(target, { method: "POST", headers: browserHeaders(agent, { "content-type": "application/x-www-form-urlencoded", "x-requested-with": "XMLHttpRequest", ...(session.cookies && !proxied ? { cookie: session.cookies } : {}) }), body: proxied ? undefined : body, redirect: "follow", cache: "no-store" });
      const text = await res.text();
      session.cookies = mergeCookies(session.cookies, res);
      session.zipApplied = /"successful"\s*:\s*1/.test(text) || /isAddressUpdated\D+1/.test(text);
      if (!session.zipApplied) { // legacy GET fallback
        const r = await fetchPage(`https://${domain}/gp/delivery/ajax/address-change.html?locationType=LOCATION_INPUT&zipCode=${encodeURIComponent(s.zip)}&storeContext=generic&deviceType=web&pageType=Search&actionSource=glow`, s, session);
        session.cookies = r.cookies;
        if (r.status < 400 && !isBlocked(r.html, r.status)) session.zipApplied = true;
      }
    } catch { /* non-fatal */ }
    session.cookieCount = session.cookies ? session.cookies.split(";").filter(Boolean).length : 0;
    onLog(session.zipApplied ? `ZIP ${s.zip} applied via glow address-change endpoint ✓ (${session.cookieCount} cookies)` : `ZIP ${s.zip} glow call did not confirm — continuing (location cookie may still be set)`);
  }
  return session;
}

export function withPage(url: string, page: number): { url: string; startPage: number } {
  try {
    const u = new URL(url);
    const existing = parseInt(u.searchParams.get("page") || "1", 10);
    const startPage = Number.isFinite(existing) && existing > 0 ? existing : 1;
    if (page !== startPage || u.searchParams.has("page")) u.searchParams.set("page", String(page));
    return { url: u.toString(), startPage };
  } catch { return { url, startPage: 1 }; }
}
export function startPageOf(url: string): number { try { const p = parseInt(new URL(url).searchParams.get("page") || "1", 10); return Number.isFinite(p) && p > 0 ? p : 1; } catch { return 1; } }

export function forceHiRes(src: string): string {
  if (!src) return "";
  let u = src.replace(/\._[^./]+_\.(jpg|jpeg|png)/i, "._AC_SL1500_.$1");
  if (!/\._AC_/.test(u)) u = u.replace(/\.(jpg|jpeg|png)(\?.*)?$/i, "._AC_SL1500_.$1$2");
  return u.startsWith("//") ? "https:" + u : u;
}

// True exact-listing cutoff markers only. Note: Amazon interleaves a benign
// "More results" divider mid-listing (genuine exact results continue after
// it), so that phrase must NOT halt the harvest.
const CUTOFF = /no exact matches|products related to this|related searches|similar products|inspired by your|best sellers in|customers also|frequently bought/i;

export function parseListing(html: string, base: string, includeSponsored: boolean): { items: ListingStub[]; selectedPage: number | null; totalHints: string; cutOff: boolean } {
  const $ = cheerio.load(html);
  const selectedRaw = $(".s-pagination-selected").first().text().trim();
  const selectedPage = selectedRaw ? parseInt(selectedRaw, 10) || null : null;
  const totalHints = $('[data-component-type="s-result-info-bar"]').text().replace(/\s+/g, " ").trim().slice(0, 160);
  const items: ListingStub[] = []; const seen = new Set<string>(); let cutOff = false;
  const slot = $(".s-main-slot").first();
  // Walk every result item in document order — cards, ad holders, widget
  // carousels and section headings all surface as .s-result-item siblings,
  // which preserves the exact-listing cutoff semantics.
  const ordered: ReturnType<typeof $>[] = [];
  const seenEl = new Set<unknown>();
  const scope = slot.length ? slot : $("body");
  scope.find('.s-result-item, [data-component-type="s-search-result"]').each((_, el) => { if (!seenEl.has(el)) { seenEl.add(el); ordered.push($(el)); } });
  if (!ordered.length) slot.children().each((_, el) => { ordered.push($(el)); });
  for (const node of ordered) {
    if (cutOff) break;
    const isCard = node.is('[data-component-type="s-search-result"]') || !!node.attr("data-asin");
    if (!isCard) {
      // section heading / widget / carousel / ad holder — check cutoff, then skip
      if (CUTOFF.test(node.text())) { cutOff = true; break; }
      continue;
    }
    const card = node;
    const asin = (card.attr("data-asin") || "").trim();
    if (!asin || seen.has(asin)) continue;
    const cardText = card.text();
    const isSponsored = /Sponsored/i.test(cardText) || card.find(".puis-sponsored-label-text, [data-component-type='sp-sponsored-result']").length > 0 || !!card.attr("data-component-type")?.includes("sp-");
    if (isSponsored && !includeSponsored) continue;
    const title = card.find("h2 span, h2 a span, .a-size-medium.a-color-base.a-text-normal, .a-size-base-plus.a-color-base.a-text-normal").first().text().trim() || card.find("img.s-image").attr("alt") || "";
    const href = card.find("h2 a, a.a-link-normal.s-no-outline").first().attr("href") || `/dp/${asin}`;
    const link = href.startsWith("http") ? href : `https://${base}${href.startsWith("/") ? "" : "/"}${href}`;
    const image = forceHiRes(card.find("img.s-image").first().attr("src") || "");
    const price = card.find(".a-price .a-offscreen").first().text().trim();
    const rating = card.find(".a-icon-alt").first().text().replace(/\s+/g, " ").trim();
    const reviews = card.find('[aria-label$="ratings"], .s-link-style .a-size-base').first().text().trim();
    seen.add(asin);
    items.push({ asin, title, link: link.split("/ref=")[0], image, price, rating, reviews, sponsored: isSponsored });
  }
  return { items, selectedPage, totalHints, cutOff };
}

export function parseProduct(html: string, fallback: ListingStub, domain: string): { title: string; description: string; image1: string; image2: string; price: string; rating: string; reviews: string } {
  const $ = cheerio.load(html);
  const title = $("#productTitle").text().replace(/\s+/g, " ").trim() || fallback.title;
  const descParts: string[] = [];
  const pd = $("#productDescription p, #productDescription").first().text().replace(/\s+/g, " ").trim();
  if (pd) descParts.push(pd);
  const bullets = $("#feature-bullets li span.a-list-item").map((_, el) => $(el).text().replace(/\s+/g, " ").trim()).get().filter((x) => x && !/make sure this fits/i.test(x));
  if (bullets.length) descParts.push(bullets.join(" • "));
  const detail = $("#detailBullets_feature_div li, #productDetails_detailBullets_sections1 td, #productDetails_techSpec_section_1 td").map((_, el) => $(el).text().replace(/\s+/g, " ").trim()).get().filter(Boolean).slice(0, 6);
  if (!descParts.length && detail.length) descParts.push(detail.join(" • "));
  // images — hiRes from embedded JSON first
  const imgs: string[] = [];
  const hiRes = [...html.matchAll(/"hiRes"\s*:\s*"(https:[^"]+)"/g)].map((m) => m[1].replace(/\\u0026/g, "&"));
  hiRes.forEach((u) => { if (!imgs.includes(u)) imgs.push(u); });
  if (!imgs.length) {
    try { const dyn = $("#landingImage, #imgBlkFront").attr("data-a-dynamic-image"); if (dyn) Object.keys(JSON.parse(dyn)).forEach((u) => imgs.push(u)); } catch { /* noop */ }
  }
  if (!imgs.length) $("#altImages img, #landingImage").each((_, el) => { const src = $(el).attr("src") || ""; if (src && !/sprite|play-icon/.test(src)) imgs.push(forceHiRes(src)); });
  const uniq = [...new Set(imgs.map(forceHiRes))].filter(Boolean);
  const price = $(".a-price .a-offscreen").first().text().trim() || fallback.price;
  const rating = $("#acrPopover").attr("title") || fallback.rating || "";
  const reviews = $("#acrCustomerReviewText").first().text().trim() || fallback.reviews;
  void domain;
  return { title, description: descParts.join("\n").slice(0, 4000), image1: uniq[0] || fallback.image, image2: uniq[1] || uniq[0] || fallback.image, price, rating: String(rating).replace(/\s+/g, " ").trim(), reviews };
}

export function toProductLink(link: string, asin: string, domain: string): string {
  if (asin) return `https://${domain}/dp/${asin}`;
  return link || "";
}
