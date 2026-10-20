"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/* ── types ─────────────────────────────────────────────────────────────── */
type Job = { id: string; url: string; marketplace: string; zip: string; targetCount: number; status: string; phase: string; startPage: number; currentPage: number; collected: unknown[]; cursor: number; logs: { t: string; msg: string }[]; error?: string | null; isSample?: boolean; createdAt: string; completedAt?: string | null; productCount?: number; previewImages?: string[] };
type Product = { id: number; asin: string; position: number; title: string; link: string; description: string; image1: string; image2: string; price: string; rating: string; reviews: string };
type Settings = { zip: string; marketplace: string; delayMin: number; delayMax: number; retries: number; detailBatch: number; includeSponsored: boolean; extraColumns: string[]; userAgents: string[]; proxyTemplate: string };

const MARKETPLACES = ["amazon.com", "amazon.co.uk", "amazon.de", "amazon.ca", "amazon.com.au", "amazon.in", "amazon.fr", "amazon.it", "amazon.es", "amazon.co.jp"];
const PRESETS = [10, 24, 48, 100, 200, 500];
const EXTRA_COLS = [{ key: "price", label: "Price" }, { key: "rating", label: "Rating" }, { key: "reviews", label: "Review Count" }, { key: "asin", label: "ASIN" }];
const DEFAULT_UAS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
];

/* ── tiny svg icons ────────────────────────────────────────────────────── */
const I = ({ d, className = "w-4 h-4" }: { d: string; className?: string }) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d={d} /></svg>);
const IconSprout = (p: { className?: string }) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={p.className || "w-5 h-5"}><path d="M7 20h10M12 20v-9M12 11a5 5 0 0 0-5-5H3v1a5 5 0 0 0 5 5h4Zm0 0a5 5 0 0 1 5-5h4v1a5 5 0 0 1-5 5h-4Z" /></svg>);

function statusChip(s: string) {
  const map: Record<string, string> = { done: "bg-emerald-100 text-emerald-800 border-emerald-200", running: "bg-amber-100 text-amber-900 border-amber-200", failed: "bg-red-100 text-red-800 border-red-200", paused: "bg-stone-200 text-stone-700 border-stone-300", pending: "bg-stone-100 text-stone-600 border-stone-200" };
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${map[s] || map.pending}`}>{s === "running" && <span className="live-dot h-1.5 w-1.5 rounded-full bg-amber-600" />}{s}</span>;
}
const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const csvUrl = (id: string) => `/api/jobs/${id}/export`;

/* ═════════════════════════ APP SHELL ═══════════════════════════════════ */
export default function App() {
  const [view, setView] = useState<"dashboard" | "history" | "settings" | "detail">("dashboard");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [historyTick, setHistoryTick] = useState(0);
  const [resumeJob, setResumeJob] = useState<Job | null>(null);

  useEffect(() => { fetch("/api/settings").then((r) => r.json()).then(setSettings).catch(() => {}); }, []);

  const openDetail = (id: string) => { setDetailId(id); setView("detail"); };
  const handleResume = (job: Job) => { setResumeJob(job); setView("dashboard"); };

  const nav = [
    { key: "dashboard" as const, label: "Dashboard", icon: "M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10" },
    { key: "history" as const, label: "Scrape History", icon: "M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 3" },
    { key: "settings" as const, label: "Settings", icon: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" },
  ];

  return (
    <div className="min-h-screen lg:flex">
      {/* sidebar */}
      <aside className="lg:fixed lg:inset-y-0 lg:w-64 bg-[#20180f] text-[#f3ead9] flex flex-col shrink-0">
        <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#e07b0f] text-white"><IconSprout className="w-6 h-6" /></span>
          <div><p className="font-[family-name:var(--font-display)] text-lg font-700 leading-none font-bold tracking-tight">Listing Harvest</p><p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-[#cbbfa5]">Amazon extractor</p></div>
        </div>
        <nav className="flex lg:flex-col gap-1 p-3 overflow-x-auto">
          {nav.map((n) => (
            <button key={n.key} onClick={() => setView(n.key)} className={`flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-semibold whitespace-nowrap transition ${view === n.key || (view === "detail" && n.key === "history") ? "bg-[#e07b0f] text-white" : "text-[#e8dcc3] hover:bg-white/10"}`}>
              <I d={n.icon} /> {n.label}
            </button>
          ))}
        </nav>
        <div className="mt-auto hidden lg:block p-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-[#e8b34b]">Exact-listing fidelity</p>
            <p className="mt-2 text-[13px] leading-relaxed text-[#d9cdb2]">Only organic cards inside <span className="font-mono text-[12px]">s-main-slot</span> before the related / no-exact-match cutoff. Sponsored cards &amp; widget carousels are skipped, ASINs de-duplicated.</p>
          </div>
          <p className="mt-4 px-1 text-[11px] text-[#9a8d70]">Chunked engine · resumable runs · hi-res CSV export</p>
        </div>
      </aside>

      <main className="flex-1 lg:ml-64 min-w-0">
        {view === "dashboard" && <Dashboard settings={settings} onOpenDetail={openDetail} resumeJob={resumeJob} onConsumedResume={() => setResumeJob(null)} onFinished={() => setHistoryTick((t) => t + 1)} />}
        {view === "history" && <History tick={historyTick} onOpen={openDetail} onResume={handleResume} />}
        {view === "settings" && <SettingsView settings={settings} onSaved={setSettings} />}
        {view === "detail" && detailId && <JobDetail id={detailId} onBack={() => setView("history")} onResume={handleResume} />}
      </main>
    </div>
  );
}

/* ═════════════════════════ DASHBOARD ═══════════════════════════════════ */
function Dashboard({ settings, onOpenDetail, resumeJob, onConsumedResume, onFinished }: { settings: Settings | null; onOpenDetail: (id: string) => void; resumeJob: Job | null; onConsumedResume: () => void; onFinished: () => void }) {
  const [url, setUrl] = useState("");
  const [target, setTarget] = useState(24);
  const [job, setJob] = useState<Job | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const runningRef = useRef(false);
  const logRef = useRef<HTMLDivElement>(null);

  const stepLoop = useCallback(async (jobId: string) => {
    if (runningRef.current) return;
    runningRef.current = true; setBusy(true);
    try {
      for (let i = 0; i < 600; i++) {
        if (!runningRef.current) break;
        const r = await fetch("/api/scrape-step", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId }) });
        const data = await r.json();
        if (!r.ok) { setErr(data.error || "Engine error"); break; }
        if (data.job) setJob(data.job);
        if (Array.isArray(data.products)) setProducts(data.products);
        if (data.done || data.failed || data.job?.status !== "running") { onFinished(); break; }
        await new Promise((res) => setTimeout(res, 350));
      }
    } catch (e) { setErr(e instanceof Error ? e.message : "Network error while running the engine"); }
    finally { runningRef.current = false; setBusy(false); }
  }, [onFinished]);

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [job?.logs?.length]);

  useEffect(() => {
    if (!resumeJob) return;
    (async () => {
      onConsumedResume();
      const d = await (await fetch(`/api/jobs/${resumeJob.id}`)).json();
      setJob(d.job); setProducts(d.products || []); setUrl(resumeJob.url); setTarget(resumeJob.targetCount);
      if (resumeJob.status !== "done") stepLoop(resumeJob.id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeJob]);

  const start = async () => {
    setErr(""); setProducts([]);
    if (!/^https?:\/\/(www\.)?amazon\./i.test(url.trim())) { setErr("Paste a valid Amazon listing URL first — search pages, category pages and storefronts all work. Every query parameter is preserved and ?page=N is respected as the start page."); return; }
    const r = await fetch("/api/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: url.trim(), targetCount: target }) });
    const data = await r.json();
    if (!r.ok) { setErr(data.error || "Could not create the job"); return; }
    setJob(data); stepLoop(data.id);
  };

  const pause = async () => { if (!job) return; runningRef.current = false; await fetch(`/api/jobs/${job.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "pause" }) }); setJob({ ...job, status: "paused" }); setBusy(false); };
  const resume = async () => { if (!job) return; await fetch(`/api/jobs/${job.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "resume" }) }); setJob({ ...job, status: "running" }); stepLoop(job.id); };

  const parsed = products.length;
  const queued = Math.min(job?.collected?.length || 0, job?.targetCount || 0);
  const pct = job ? Math.min(100, Math.round((parsed / Math.max(1, job.targetCount)) * 100)) : 0;
  const phases = ["boot", "listing", "details", "done"];
  const phaseIdx = job ? (job.phase === "queued" ? 0 : job.phase === "failed" ? 1 : phases.indexOf(job.phase)) : -1;

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
      <header className="rise">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#b85e08]">Amazon listing-page extractor</p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl sm:text-5xl font-bold tracking-tight">Harvest a listing.<br className="hidden sm:block" /> Ship a clean CSV.</h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-stone-600">Paste any Amazon search, category or storefront URL. The engine boots a real session, applies your ZIP, walks the exact listing page by page, parses each product page, and exports titles, links, descriptions and hi-res images.</p>
      </header>

      {/* harvest form */}
      <section className="rise mt-7 rounded-2xl border border-[#e3dcc9] bg-[#fffdf8] p-5 sm:p-6 shadow-[0_2px_20px_rgba(27,23,18,0.05)]">
        <label className="text-xs font-bold uppercase tracking-widest text-stone-500">Amazon listing URL</label>
        <div className="mt-2 flex flex-col sm:flex-row gap-2.5">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.amazon.com/s?k=ceramic+mugs&crid=…&page=1" className="flex-1 rounded-xl border border-[#d8cfb6] bg-white px-4 py-3 font-mono text-[13px] outline-none focus:border-[#e07b0f] focus:ring-2 focus:ring-[#e07b0f]/25" />
          <button onClick={start} disabled={busy} className="rounded-xl bg-[#e07b0f] px-6 py-3 text-sm font-bold text-white hover:bg-[#b85e08] disabled:opacity-50 transition whitespace-nowrap">{busy ? "Harvesting…" : "Start Harvest"}</button>
        </div>
        {err && <p className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3.5 py-2.5 text-[13px] text-red-800">{err}</p>}

        <div className="mt-6 grid gap-6 md:grid-cols-[1fr_auto] items-end">
          <div>
            <div className="flex items-baseline justify-between"><label className="text-xs font-bold uppercase tracking-widest text-stone-500">Products to harvest</label><span className="font-[family-name:var(--font-display)] text-2xl font-bold">{target}<span className="text-sm text-stone-400 font-sans font-medium"> / 500</span></span></div>
            <input type="range" min={10} max={500} step={2} value={target} onChange={(e) => setTarget(Number(e.target.value))} className="mt-2 w-full" />
            <div className="mt-2 flex flex-wrap gap-1.5">{PRESETS.map((p) => (<button key={p} onClick={() => setTarget(p)} className={`rounded-full border px-3 py-1 text-xs font-bold ${target === p ? "bg-[#1b1712] text-white border-[#1b1712]" : "border-[#d8cfb6] hover:border-[#1b1712]"}`}>{p}</button>))}</div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[["Marketplace", settings?.marketplace || "amazon.com"], ["ZIP", settings?.zip || "90009"], ["Detail batch", String(settings?.detailBatch ?? 4)]].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-[#f6f2ea] border border-[#e3dcc9] px-3.5 py-2.5"><p className="text-[10px] font-bold uppercase tracking-widest text-stone-500">{k}</p><p className="mt-0.5 font-mono text-[13px] font-semibold truncate">{v}</p></div>
            ))}
          </div>
        </div>
        <p className="mt-4 text-xs text-stone-500">Tip: include <span className="font-mono">?page=2</span> (or any page) in the URL to start harvesting from that page — useful for continuing a listing in slices. Sponsored handling, delays, retries, user-agents and proxy live in Settings.</p>
      </section>

      {/* active job */}
      {job && (
        <section className="rise mt-6 rounded-2xl border border-[#e3dcc9] bg-[#fffdf8] p-5 sm:p-6 shadow-[0_2px_20px_rgba(27,23,18,0.05)]">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div className="flex items-center gap-3 min-w-0">{statusChip(job.status)}<p className="font-mono text-xs text-stone-500 truncate max-w-[420px]">{job.url}</p></div>
            <div className="flex gap-2">
              {job.status === "running" && <button onClick={pause} className="rounded-lg border border-[#d8cfb6] px-3.5 py-2 text-xs font-bold hover:bg-[#f6f2ea]">Pause</button>}
              {(job.status === "paused" || job.status === "failed") && <button onClick={resume} className="rounded-lg bg-[#1e6b4f] px-3.5 py-2 text-xs font-bold text-white hover:opacity-90">Resume run</button>}
              {job.status === "done" && <a href={csvUrl(job.id)} className="rounded-lg bg-[#1b1712] px-3.5 py-2 text-xs font-bold text-white hover:opacity-90">Download CSV</a>}
              <button onClick={() => onOpenDetail(job.id)} className="rounded-lg border border-[#d8cfb6] px-3.5 py-2 text-xs font-bold hover:bg-[#f6f2ea]">Full results</button>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-2">
            {["Session boot", "Listing pages", "Product pages", "CSV ready"].map((label, i) => (
              <div key={label} className="flex items-center gap-2 flex-1 last:flex-none">
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold ${phaseIdx > i || job.status === "done" ? "bg-[#1e6b4f] text-white" : phaseIdx === i ? "bg-[#e07b0f] text-white" : "bg-[#ece5d3] text-stone-500"}`}>{phaseIdx > i || job.status === "done" ? "✓" : i + 1}</span>
                <span className={`hidden sm:block text-xs font-semibold ${phaseIdx === i ? "text-[#1b1712]" : "text-stone-400"}`}>{label}</span>
                {i < 3 && <span className={`h-px flex-1 ${phaseIdx > i ? "bg-[#1e6b4f]" : "bg-[#e3dcc9]"}`} />}
              </div>
            ))}
          </div>

          <div className="mt-5">
            <div className="flex justify-between text-xs font-semibold text-stone-500"><span>{parsed} parsed · {queued} ASINs queued · page {job.currentPage}</span><span>{pct}%</span></div>
            <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-[#ece5d3]"><div className="h-full rounded-full bg-[#e07b0f] transition-all duration-500" style={{ width: `${pct}%` }} /></div>
          </div>
          {job.error && <p className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3.5 py-2.5 text-[13px] leading-relaxed text-red-800">{job.error}</p>}

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-stone-500 mb-2">Live activity</p>
              <div ref={logRef} className="h-64 overflow-y-auto rounded-xl bg-[#1b1712] p-3.5 font-mono text-[11.5px] leading-relaxed text-[#e8dcc3]">
                {(job.logs || []).map((l, i) => (<p key={i} className="log-line"><span className="text-[#8a7c5c]">{new Date(l.t).toLocaleTimeString([], { hour12: false })}</span> <span className={/FAILED|failed/i.test(l.msg) ? "text-red-300" : /complete|verified|✓/i.test(l.msg) ? "text-emerald-300" : ""}>{l.msg}</span></p>))}
                {busy && <p className="text-[#e8b34b]">▸ engine working…</p>}
                {!job.logs?.length && <p className="text-stone-400">Waiting for first engine step…</p>}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-stone-500 mb-2">Product preview {products.length > 0 && `(${products.length})`}</p>
              <div className="h-64 overflow-y-auto pr-1">
                {products.length === 0 ? <div className="grid h-full place-items-center rounded-xl border border-dashed border-[#d8cfb6] text-center px-6"><p className="text-sm text-stone-500">Products will appear here as their detail pages are parsed — title, price and hi-res image, as they land.</p></div> : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {products.map((p) => (<ProductCard key={p.id} p={p} />))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* how it works */}
      <section className="mt-8 grid gap-3 sm:grid-cols-3 pb-10">
        {[["1 · Exact listing only", "Cards are read strictly from s-main-slot, in order, stopping at the related / similar / no-exact-match cutoff. Carousel widgets never enter the queue."], ["2 · Real session, your ZIP", "A browser-like session boots with a random user-agent from your pool, matching sec-ch-ua headers, and your ZIP applied via Amazon's glow endpoint."], ["3 · Hi-res CSV, resumable", "Every product page is parsed for description and gallery images forced to _AC_SL1500_. Runs chunk safely and resume exactly where they stopped."]].map(([t, d]) => (
          <article key={t} className="rounded-2xl border border-[#e3dcc9] bg-[#fffdf8] p-5"><h3 className="font-[family-name:var(--font-display)] font-bold">{t}</h3><p className="mt-2 text-[13px] leading-relaxed text-stone-600">{d}</p></article>
        ))}
      </section>
    </div>
  );
}

function ProductCard({ p }: { p: Product }) {
  return (
    <a href={p.link} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-xl border border-[#e3dcc9] bg-white hover:border-[#e07b0f] transition">
      <div className="aspect-square bg-[#f6f2ea] overflow-hidden">{p.image1 ? <img src={p.image1} alt="" className="h-full w-full object-cover group-hover:scale-105 transition duration-500" loading="lazy" /> : <span className="grid h-full place-items-center text-stone-400 text-xs">no image</span>}</div>
      <div className="p-2.5"><p className="line-clamp-2 text-[11.5px] font-semibold leading-snug">{p.title}</p><p className="mt-1.5 flex justify-between font-mono text-[10.5px] text-stone-500"><span className="text-[#b85e08] font-bold">{p.price || ""}</span><span>{p.asin}</span></p></div>
    </a>
  );
}

/* ═════════════════════════ HISTORY ═════════════════════════════════════ */
function History({ tick, onOpen, onResume }: { tick: number; onOpen: (id: string) => void; onResume: (j: Job) => void }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const load = useCallback(() => { fetch("/api/jobs").then((r) => r.json()).then((d) => { setJobs(Array.isArray(d) ? d : []); setLoading(false); }).catch(() => setLoading(false)); }, []);
  useEffect(() => { load(); }, [load, tick]);

  const del = async (id: string) => { if (!confirm("Delete this run and all of its products?")) return; await fetch(`/api/jobs/${id}`, { method: "DELETE" }); load(); };
  const resume = async (j: Job) => { await fetch(`/api/jobs/${j.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "resume" }) }); onResume({ ...j, status: "running" }); };

  const filtered = jobs.filter((j) => (j.url + j.marketplace + j.status).toLowerCase().includes(query.toLowerCase()));
  const stats = { runs: jobs.length, products: jobs.reduce((a, j) => a + (j.productCount || 0), 0), done: jobs.filter((j) => j.status === "done").length };

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
      <header className="rise flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#b85e08]">Every run, kept</p><h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-bold tracking-tight">Scrape History</h1></div>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search runs…" className="rounded-xl border border-[#d8cfb6] bg-white px-4 py-2.5 text-sm outline-none focus:border-[#e07b0f] w-64" />
      </header>
      <div className="mt-5 grid grid-cols-3 gap-3 max-w-lg">
        {[["Total runs", stats.runs], ["Products harvested", stats.products], ["Completed", stats.done]].map(([k, v]) => (<div key={k as string} className="rounded-xl border border-[#e3dcc9] bg-[#fffdf8] px-4 py-3"><p className="text-[10px] font-bold uppercase tracking-widest text-stone-500">{k}</p><p className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold">{v}</p></div>))}
      </div>

      <div className="mt-6 space-y-3 pb-10">
        {loading && <p className="text-sm text-stone-500">Loading history…</p>}
        {!loading && filtered.length === 0 && <div className="rounded-2xl border border-dashed border-[#d8cfb6] p-10 text-center text-sm text-stone-500">No runs match. Start a harvest from the Dashboard.</div>}
        {filtered.map((j) => (
          <article key={j.id} className="rise rounded-2xl border border-[#e3dcc9] bg-[#fffdf8] p-4 sm:p-5 hover:border-[#cbbd97] transition">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex gap-1.5 shrink-0">
                {(j.previewImages || []).slice(0, 4).map((src, i) => (<span key={i} className="h-16 w-14 overflow-hidden rounded-lg bg-[#f6f2ea] border border-[#e3dcc9]"><img src={src} alt="" className="h-full w-full object-cover" loading="lazy" /></span>))}
                {(j.previewImages || []).length === 0 && <span className="grid h-16 w-14 place-items-center rounded-lg border border-dashed border-[#d8cfb6] font-mono text-[10px] text-stone-400">0 img</span>}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">{statusChip(j.status)}{j.isSample && <span className="rounded-full bg-[#1b1712] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Sample run</span>}<span className="font-mono text-[11px] text-stone-400">{j.id.slice(0, 8)}</span></div>
                <p className="mt-2 font-mono text-[12.5px] leading-relaxed break-all text-stone-700">{j.url}</p>
                <p className="mt-2 text-xs text-stone-500">{j.productCount || 0} of {j.targetCount} products · {j.marketplace} · ZIP {j.zip} · page {j.currentPage} · created {fmtDate(j.createdAt)}{j.completedAt ? ` · finished ${fmtDate(j.completedAt)}` : ""}</p>
                {j.error && <p className="mt-2 line-clamp-2 text-xs text-red-700">{j.error}</p>}
              </div>
              <div className="flex md:flex-col flex-wrap gap-2 shrink-0">
                <button onClick={() => onOpen(j.id)} className="rounded-lg bg-[#1b1712] px-4 py-2 text-xs font-bold text-white hover:opacity-90">View results</button>
                {j.status !== "done" && <button onClick={() => resume(j)} className="rounded-lg bg-[#1e6b4f] px-4 py-2 text-xs font-bold text-white hover:opacity-90">Resume</button>}
                <a href={csvUrl(j.id)} className={`rounded-lg border px-4 py-2 text-xs font-bold text-center ${(j.productCount || 0) ? "border-[#e07b0f] text-[#b85e08] hover:bg-amber-50" : "border-[#e3dcc9] text-stone-400 pointer-events-none"}`}>Download CSV</a>
                <button onClick={() => del(j.id)} className="rounded-lg border border-[#e3dcc9] px-4 py-2 text-xs font-bold text-stone-500 hover:bg-red-50 hover:text-red-700 hover:border-red-200">Delete</button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

/* ═════════════════════════ JOB DETAIL ══════════════════════════════════ */
function JobDetail({ id, onBack, onResume }: { id: string; onBack: () => void; onResume: (j: Job) => void }) {
  const [job, setJob] = useState<Job | null>(null);
  const [items, setItems] = useState<Product[]>([]);
  const [mode, setMode] = useState<"grid" | "sheet">("grid");
  const [q, setQ] = useState("");
  useEffect(() => { fetch(`/api/jobs/${id}`).then((r) => r.json()).then((d) => { setJob(d.job); setItems(d.products || []); }).catch(() => {}); }, [id]);
  if (!job) return <div className="p-10 text-sm text-stone-500">Loading run…</div>;
  const filtered = items.filter((p) => (p.title + p.asin).toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
      <button onClick={onBack} className="text-sm font-bold text-[#b85e08] hover:underline">← Back to history</button>
      <header className="rise mt-4 rounded-2xl border border-[#e3dcc9] bg-[#fffdf8] p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-3">{statusChip(job.status)}<span className="font-mono text-xs text-stone-400">{job.id}</span></div>
        <p className="mt-3 font-mono text-[13px] break-all text-stone-700">{job.url}</p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-stone-600">
          {[`${items.length} products`, `${job.marketplace}`, `ZIP ${job.zip}`, `Target ${job.targetCount}`, `Created ${fmtDate(job.createdAt)}`].map((x) => (<span key={x} className="rounded-full bg-[#f6f2ea] border border-[#e3dcc9] px-3 py-1">{x}</span>))}
          <span className="ml-auto flex gap-2">
            {job.status !== "done" && <button onClick={async () => { await fetch(`/api/jobs/${job.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "resume" }) }); onResume(job); }} className="rounded-full bg-[#1e6b4f] px-4 py-1.5 text-white">Resume run</button>}
            <a href={csvUrl(job.id)} className="rounded-full bg-[#e07b0f] px-4 py-1.5 text-white">Download CSV ({items.length})</a>
          </span>
        </div>
        {job.error && <p className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3.5 py-2.5 text-[13px] text-red-800">{job.error}</p>}
        {(job.logs || []).length > 0 && <details className="mt-4"><summary className="cursor-pointer text-xs font-bold uppercase tracking-widest text-stone-500">Run log ({job.logs.length})</summary><div className="mt-2 max-h-52 overflow-y-auto rounded-xl bg-[#1b1712] p-3.5 font-mono text-[11.5px] text-[#e8dcc3]">{job.logs.map((l, i) => (<p key={i}><span className="text-[#8a7c5c]">{new Date(l.t).toLocaleTimeString([], { hour12: false })}</span> {l.msg}</p>))}</div></details>}
      </header>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-[#d8cfb6] bg-white p-1">
          {(["grid", "sheet"] as const).map((m) => (<button key={m} onClick={() => setMode(m)} className={`rounded-lg px-4 py-1.5 text-xs font-bold capitalize ${mode === m ? "bg-[#1b1712] text-white" : "text-stone-500"}`}>{m === "grid" ? "Grid" : "Spreadsheet"}</button>))}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by title or ASIN…" className="rounded-xl border border-[#d8cfb6] bg-white px-4 py-2 text-sm outline-none focus:border-[#e07b0f] w-64" />
        <span className="text-xs text-stone-500">{filtered.length} shown</span>
      </div>

      {mode === "grid" ? (
        <div className="mt-4 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 pb-10">
          {filtered.map((p) => (
            <article key={p.id} className="overflow-hidden rounded-2xl border border-[#e3dcc9] bg-[#fffdf8] hover:border-[#e07b0f] transition">
              <div className="relative aspect-[4/3] bg-[#f6f2ea]">{p.image1 && <img src={p.image1} alt="" className="h-full w-full object-cover" loading="lazy" />}<span className="absolute left-2 top-2 rounded-md bg-[#1b1712]/85 px-2 py-0.5 font-mono text-[10px] font-bold text-white">#{p.position}</span>{p.image2 && p.image2 !== p.image1 && <span className="absolute right-2 bottom-2 h-11 w-11 overflow-hidden rounded-md border-2 border-white shadow"><img src={p.image2} alt="" className="h-full w-full object-cover" loading="lazy" /></span>}</div>
              <div className="p-3.5">
                <a href={p.link} target="_blank" rel="noreferrer" className="line-clamp-3 text-[13px] font-semibold leading-snug hover:text-[#b85e08]">{p.title}</a>
                <p className="mt-2 line-clamp-3 text-[12px] leading-relaxed text-stone-500">{p.description}</p>
                <p className="mt-2.5 flex items-center justify-between font-mono text-[11px]"><span className="font-bold text-[#b85e08]">{p.price}</span><span className="text-stone-400">{p.asin}</span></p>
                {(p.rating || p.reviews) && <p className="mt-1 text-[11px] text-stone-500">{p.rating}{p.reviews ? ` · ${p.reviews} ratings` : ""}</p>}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-[#e3dcc9] bg-white pb-0 mb-10">
          <table className="w-full min-w-[900px] text-left text-[12.5px]">
            <thead><tr className="border-b border-[#e3dcc9] bg-[#f6f2ea] text-[11px] uppercase tracking-wide text-stone-500">{["#", "Image", "Full Product Title", "Product amazon link", "Product Description", "First Image", "Second Image (Hi-Res)", "Price"].map((h) => (<th key={h} className="px-3 py-3 font-bold">{h}</th>))}</tr></thead>
            <tbody>{filtered.map((p) => (
              <tr key={p.id} className="border-b border-[#f0ead9] align-top hover:bg-[#fffdf8]">
                <td className="px-3 py-3 font-mono text-stone-400">{p.position}</td>
                <td className="px-3 py-3"><span className="block h-12 w-12 overflow-hidden rounded-lg bg-[#f6f2ea]">{p.image1 && <img src={p.image1} alt="" className="h-full w-full object-cover" loading="lazy" />}</span></td>
                <td className="px-3 py-3 max-w-[280px] font-semibold leading-snug">{p.title}<span className="block mt-1 font-mono text-[10.5px] font-normal text-stone-400">{p.asin} · {p.rating}</span></td>
                <td className="px-3 py-3 max-w-[180px]"><a href={p.link} target="_blank" rel="noreferrer" className="font-mono text-[11px] text-[#b85e08] break-all hover:underline">{p.link}</a></td>
                <td className="px-3 py-3 max-w-[320px] text-stone-500 leading-relaxed"><span className="line-clamp-4">{p.description}</span></td>
                <td className="px-3 py-3 max-w-[140px]"><a href={p.image1} target="_blank" rel="noreferrer" className="font-mono text-[10.5px] text-stone-500 break-all hover:underline">{p.image1}</a></td>
                <td className="px-3 py-3 max-w-[140px]"><a href={p.image2} target="_blank" rel="noreferrer" className="font-mono text-[10.5px] text-stone-500 break-all hover:underline">{p.image2}</a></td>
                <td className="px-3 py-3 font-mono font-bold">{p.price}</td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ═════════════════════════ SETTINGS ════════════════════════════════════ */
function SettingsView({ settings, onSaved }: { settings: Settings | null; onSaved: (s: Settings) => void }) {
  const [form, setForm] = useState<Settings | null>(null);
  const [uaText, setUaText] = useState("");
  const [saved, setSaved] = useState("");
  const [test, setTest] = useState<{ loading: boolean; data: Record<string, unknown> | null }>({ loading: false, data: null });

  useEffect(() => { if (settings && !form) { setForm(settings); setUaText(settings.userAgents.join("\n")); } }, [settings, form]);
  if (!form) return <div className="p-10 text-sm text-stone-500">Loading settings…</div>;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setForm({ ...form, [k]: v });

  const save = async () => {
    const payload = { ...form, userAgents: uaText.split("\n").map((x) => x.trim()).filter(Boolean) };
    const r = await fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const data = await r.json(); onSaved(data); setForm(data); setUaText(data.userAgents.join("\n")); setSaved("Settings saved — new runs (and resumed runs) will use them."); setTimeout(() => setSaved(""), 3500);
  };
  const runTest = async () => { setTest({ loading: true, data: null }); try { const r = await fetch("/api/test-connection", { method: "POST" }); setTest({ loading: false, data: await r.json() }); } catch { setTest({ loading: false, data: { ok: false, message: "Connection test request failed." } }); } };

  const num = "w-full rounded-xl border border-[#d8cfb6] bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[#e07b0f]";
  const label = "text-xs font-bold uppercase tracking-widest text-stone-500";

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-8 pb-14">
      <header className="rise"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#b85e08]">Engine tuning</p><h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-bold tracking-tight">Settings</h1><p className="mt-2 text-sm text-stone-600">Applied to every new run and snapshotted into each job, so old exports stay reproducible.</p></header>
      {saved && <p className="mt-4 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm text-emerald-800">{saved}</p>}

      <section className="mt-6 rounded-2xl border border-[#e3dcc9] bg-[#fffdf8] p-5 sm:p-6">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-bold">Marketplace &amp; delivery</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div><label className={label}>Marketplace</label><select value={form.marketplace} onChange={(e) => set("marketplace", e.target.value)} className={`${num} mt-1.5`}>{MARKETPLACES.map((m) => (<option key={m}>{m}</option>))}</select></div>
          <div><label className={label}>Delivery ZIP / postcode</label><input value={form.zip} onChange={(e) => set("zip", e.target.value)} className={`${num} mt-1.5 font-mono`} placeholder="90009" /><p className="mt-1.5 text-[11px] text-stone-500">Applied at session boot via Amazon&apos;s glow address-change endpoint (default 90009, Los Angeles).</p></div>
        </div>
        <div className="mt-5 rounded-xl bg-[#f6f2ea] border border-[#e3dcc9] p-4">
          <div className="flex flex-wrap items-center gap-3 justify-between"><div><p className="text-sm font-bold">Live connection test</p><p className="text-xs text-stone-500 mt-0.5">Boots a real session: reachability, ZIP status, cookie jar and latency.</p></div>
            <button onClick={runTest} disabled={test.loading} className="rounded-lg bg-[#1b1712] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{test.loading ? "Testing…" : "Test connection"}</button></div>
          {test.data && (
            <div className={`mt-3 rounded-lg border px-4 py-3 text-[13px] leading-relaxed ${test.data.ok ? "bg-emerald-50 border-emerald-200 text-emerald-900" : "bg-red-50 border-red-200 text-red-900"}`}>
              <p className="font-semibold">{String(test.data.message || "")}</p>
              <p className="mt-1.5 font-mono text-[11.5px]">reachable: {String(test.data.reachable)} · ZIP {String(test.data.zip)} applied: {String(test.data.zipApplied)} · cookies: {String(test.data.cookieCount)} · latency: {String(test.data.latencyMs)}ms · proxy: {String(test.data.proxy)}</p>
              {Array.isArray(test.data.logs) && <div className="mt-2 font-mono text-[11px] opacity-80">{(test.data.logs as string[]).map((l, i) => (<p key={i}>{l}</p>))}</div>}
            </div>
          )}
        </div>
      </section>

      <section className="mt-5 rounded-2xl border border-[#e3dcc9] bg-[#fffdf8] p-5 sm:p-6">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-bold">Pacing &amp; fidelity</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div><label className={label}>Delay min (ms)</label><input type="number" value={form.delayMin} onChange={(e) => set("delayMin", Number(e.target.value))} className={`${num} mt-1.5`} /></div>
          <div><label className={label}>Delay max (ms)</label><input type="number" value={form.delayMax} onChange={(e) => set("delayMax", Number(e.target.value))} className={`${num} mt-1.5`} /></div>
          <div><label className={label}>Retries / request</label><input type="number" min={0} max={5} value={form.retries} onChange={(e) => set("retries", Number(e.target.value))} className={`${num} mt-1.5`} /></div>
          <div><label className={label}>Detail batch / step</label><input type="number" min={1} max={12} value={form.detailBatch} onChange={(e) => set("detailBatch", Number(e.target.value))} className={`${num} mt-1.5`} /></div>
        </div>
        <label className="mt-5 flex cursor-pointer items-center gap-3 rounded-xl border border-[#e3dcc9] bg-[#f6f2ea] px-4 py-3">
          <input type="checkbox" checked={form.includeSponsored} onChange={(e) => set("includeSponsored", e.target.checked)} className="h-4 w-4 accent-[#e07b0f]" />
          <span className="text-sm"><span className="font-bold">Include sponsored cards</span><span className="block text-xs text-stone-500">Off by default — only purely organic listing positions are harvested.</span></span>
        </label>
        <div className="mt-5"><p className={label}>Extra CSV columns</p><div className="mt-2 flex flex-wrap gap-2">{EXTRA_COLS.map((c) => { const on = form.extraColumns.includes(c.key); return (<button key={c.key} onClick={() => set("extraColumns", on ? form.extraColumns.filter((x) => x !== c.key) : [...form.extraColumns, c.key])} className={`rounded-full border px-3.5 py-1.5 text-xs font-bold ${on ? "bg-[#1b1712] text-white border-[#1b1712]" : "border-[#d8cfb6] text-stone-500"}`}>{c.label}</button>); })}</div>
          <p className="mt-2 text-[11px] text-stone-500">Base columns are always: Full Product Title · Product amazon link · Product Description · First Product Image Link · Second Product Image Link (High Resolution, forced to _AC_SL1500_).</p></div>
      </section>

      <section className="mt-5 rounded-2xl border border-[#e3dcc9] bg-[#fffdf8] p-5 sm:p-6">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-bold">Network &amp; identity</h2>
        <div className="mt-4"><label className={label}>Proxy / unblocker URL template (optional)</label>
          <input value={form.proxyTemplate} onChange={(e) => set("proxyTemplate", e.target.value)} placeholder="https://api.scraperapi.com/?api_key=KEY&url={url}" className={`${num} mt-1.5 font-mono text-[12px]`} />
          <p className="mt-1.5 text-[11px] leading-relaxed text-stone-500">Use {"{url}"} as the placeholder for the encoded target URL. If left empty, the engine checks server secrets SCRAPERAPI_KEY, SCRAPINGBEE_API_KEY and ZENROWS_API_KEY automatically. A US residential proxy is recommended if Amazon rate-limits datacenter IPs.</p></div>
        <div className="mt-5">
          <div className="flex items-center justify-between"><label className={label}>User-agent pool — one random per request ({uaText.split("\n").filter((x) => x.trim()).length} active)</label><button onClick={() => setUaText(DEFAULT_UAS.join("\n"))} className="text-xs font-bold text-[#b85e08] hover:underline">Reset to 7 defaults</button></div>
          <textarea value={uaText} onChange={(e) => setUaText(e.target.value)} rows={7} spellCheck={false} className="mt-2 w-full rounded-xl border border-[#d8cfb6] bg-[#1b1712] px-4 py-3 font-mono text-[11.5px] leading-relaxed text-[#e8dcc3] outline-none focus:border-[#e07b0f]" />
          <p className="mt-1.5 text-[11px] text-stone-500">One string per line. Matching sec-ch-ua, platform and mobile client hints are derived automatically for Chromium agents.</p>
        </div>
      </section>

      <button onClick={save} className="mt-6 w-full rounded-xl bg-[#e07b0f] py-3.5 text-sm font-bold text-white hover:bg-[#b85e08] transition">Save settings</button>
    </div>
  );
}
