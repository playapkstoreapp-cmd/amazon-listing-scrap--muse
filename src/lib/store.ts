import { db } from "@/db";
import { appSettings, scrapeJobs, products } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { DEFAULT_USER_AGENTS } from "./agents";
import type { SettingsLike } from "./scraper";

export type Settings = SettingsLike & { extraColumns: string[] };

export const DEFAULT_SETTINGS: Settings = {
  zip: "90009", marketplace: "amazon.com", delayMin: 800, delayMax: 2200, retries: 2, detailBatch: 4,
  includeSponsored: false, extraColumns: ["price", "rating", "reviews"], userAgents: DEFAULT_USER_AGENTS, proxyTemplate: "",
};

export async function getSettings(): Promise<Settings> {
  const rows = await db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);
  if (!rows.length) { await db.insert(appSettings).values({ id: 1, ...DEFAULT_SETTINGS, userAgents: DEFAULT_USER_AGENTS }).onConflictDoNothing(); return DEFAULT_SETTINGS; }
  const r = rows[0];
  return { zip: r.zip, marketplace: r.marketplace, delayMin: r.delayMin, delayMax: r.delayMax, retries: r.retries, detailBatch: r.detailBatch, includeSponsored: r.includeSponsored, extraColumns: (r.extraColumns as string[]) || [], userAgents: ((r.userAgents as string[])?.length ? (r.userAgents as string[]) : DEFAULT_USER_AGENTS), proxyTemplate: r.proxyTemplate || "" };
}

export async function jobWithCount(job: typeof scrapeJobs.$inferSelect) {
  const rows = await db.select({ c: sql<number>`count(*)::int` }).from(products).where(eq(products.jobId, job.id));
  return { ...job, productCount: rows[0]?.c || 0 };
}

export async function ensureSeed() {
  const existing = await db.select({ id: scrapeJobs.id }).from(scrapeJobs).limit(1);
  if (existing.length) return;
  const now = new Date();
  const id = "sample-ceramic-mugs";
  const imgs = [
    ["https://images.pexels.com/photos/7828279/pexels-photo-7828279.jpeg?auto=compress&cs=tinysrgb&w=1200", "https://images.pexels.com/photos/8533852/pexels-photo-8533852.jpeg?auto=compress&cs=tinysrgb&w=1200"],
    ["https://images.pexels.com/photos/207950/pexels-photo-207950.jpeg?auto=compress&cs=tinysrgb&w=1200", "https://images.pexels.com/photos/7828522/pexels-photo-7828522.jpeg?auto=compress&cs=tinysrgb&w=1200"],
    ["https://images.pexels.com/photos/7828522/pexels-photo-7828522.jpeg?auto=compress&cs=tinysrgb&w=1200", "https://images.pexels.com/photos/7828279/pexels-photo-7828279.jpeg?auto=compress&cs=tinysrgb&w=1200"],
    ["https://images.pexels.com/photos/8533852/pexels-photo-8533852.jpeg?auto=compress&cs=tinysrgb&w=1200", "https://images.pexels.com/photos/207950/pexels-photo-207950.jpeg?auto=compress&cs=tinysrgb&w=1200"],
    ["https://images.pexels.com/photos/8472572/pexels-photo-8472572.jpeg?auto=compress&cs=tinysrgb&w=1200", "https://images.pexels.com/photos/19479558/pexels-photo-19479558.jpeg?auto=compress&cs=tinysrgb&w=1200"],
    ["https://images.pexels.com/photos/19479558/pexels-photo-19479558.jpeg?auto=compress&cs=tinysrgb&w=1200", "https://images.pexels.com/photos/8472572/pexels-photo-8472572.jpeg?auto=compress&cs=tinysrgb&w=1200"],
    ["https://images.pexels.com/photos/31203631/pexels-photo-31203631.jpeg?auto=compress&cs=tinysrgb&w=1200", "https://images.pexels.com/photos/15440831/pexels-photo-15440831.jpeg?auto=compress&cs=tinysrgb&w=1200"],
    ["https://images.pexels.com/photos/15440831/pexels-photo-15440831.jpeg?auto=compress&cs=tinysrgb&w=1200", "https://images.pexels.com/photos/31203631/pexels-photo-31203631.jpeg?auto=compress&cs=tinysrgb&w=1200"],
  ];
  const titles = [
    "Handmade Ceramic Coffee Mug 12oz — Speckled Stoneware Tea Cup with Comfort Handle, Microwave & Dishwasher Safe",
    "Rustic Ceramic Mug Set of 2, 14oz — Reactive Glaze Stoneware Coffee Cups for Home & Office",
    "Matte Ceramic Mug 11oz — Minimalist Stoneware Cup for Coffee, Tea, Cocoa, Modern Kitchen",
    "Artisan Pottery Mug 16oz Large — Hand-Thrown Look Ceramic Coffee Cup, Lead-Free Glaze",
    "Ceramic Travel-Style Mug 13oz — Studio Pottery Cup with Speckled Finish, Gift-Ready Box",
    "Stoneware Mug with Heart Motif 12oz — Handmade Ceramic Cup for Lattes & Herbal Tea",
    "Rustic Pottery Coffee Mug 15oz — Earth-Tone Ceramic Cup, Oven & Microwave Safe",
    "Speckled Campfire Ceramic Mug 14oz — Vintage-Style Stoneware Cup, Set-Ready Single",
    "Glazed Ceramic Mug Duo 12oz — Two-Tone Stoneware Cups for Espresso Bar & Breakfast Table",
    "Handcrafted Ceramic Mug 11oz — Wabi-Sabi Pottery Cup, Each Piece Slightly Unique",
    "Classic White Ceramic Mug 12oz — Restaurant-Grade Stoneware Coffee Cup, Stackable",
    "Terracotta Ceramic Mug 13oz — Warm Clay Stoneware Cup with Unglazed Base, Artisan Finish",
  ];
  await db.insert(scrapeJobs).values({
    id, url: "https://www.amazon.com/s?k=ceramic+mugs&crid=2KXAMPLE&sprefix=ceramic+mugs%2Caps%2C120&ref=nb_sb_noss",
    marketplace: "amazon.com", zip: "90009", targetCount: 12, status: "done", phase: "done", startPage: 1, currentPage: 1,
    collected: titles.map((t, i) => ({ asin: `B0CMUG${String(i + 1).padStart(4, "0")}`, title: t, link: `https://www.amazon.com/dp/B0CMUG${String(i + 1).padStart(4, "0")}`, image: imgs[i % imgs.length][0], price: `$${(12 + i * 1.5).toFixed(2)}`, rating: `${(4.2 + (i % 6) * 0.1).toFixed(1)} out of 5 stars`, reviews: `${120 + i * 47}`, sponsored: false })),
    cursor: 12, isSample: true,
    logs: [
      { t: new Date(now.getTime() - 42 * 60000).toISOString(), msg: "Session booted on www.amazon.com · 11 cookies jarred" },
      { t: new Date(now.getTime() - 42 * 60000).toISOString(), msg: "ZIP 90009 applied via glow address-change endpoint" },
      { t: new Date(now.getTime() - 41 * 60000).toISOString(), msg: "Listing page 1 verified (.s-pagination-selected = 1) · 12 organic cards kept, 3 sponsored skipped" },
      { t: new Date(now.getTime() - 40 * 60000).toISOString(), msg: "Detail pages parsed · CSV columns ready" },
      { t: new Date(now.getTime() - 40 * 60000).toISOString(), msg: "Run complete — 12 products harvested" },
    ],
    settingsSnapshot: DEFAULT_SETTINGS, sessionData: {}, createdAt: new Date(now.getTime() - 42 * 60000), updatedAt: now, completedAt: now,
  }).onConflictDoNothing();
  for (let i = 0; i < titles.length; i++) {
    const asin = `B0CMUG${String(i + 1).padStart(4, "0")}`;
    await db.insert(products).values({
      jobId: id, asin, position: i + 1, title: titles[i], link: `https://www.amazon.com/dp/${asin}`,
      description: `${titles[i].split("—")[1]?.trim() || "Premium stoneware mug."} Crafted from high-fired ceramic for everyday coffee, tea and cocoa. Comfort-grip handle, smooth glazed interior for easy cleaning, and a balanced weight that feels substantial without being heavy. Microwave and dishwasher safe. A thoughtful gift for home, office and studio use.`,
      image1: imgs[i % imgs.length][0], image2: imgs[i % imgs.length][1],
      price: `$${(12 + i * 1.5).toFixed(2)}`, rating: `${(4.2 + (i % 6) * 0.1).toFixed(1)} out of 5 stars`, reviews: `${120 + i * 47}`,
    });
  }
}

export { desc };
