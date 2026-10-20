import { pgTable, text, integer, boolean, jsonb, timestamp, serial, uniqueIndex } from "drizzle-orm/pg-core";

export const scrapeJobs = pgTable("scrape_jobs", {
  id: text("id").primaryKey(),
  url: text("url").notNull(),
  marketplace: text("marketplace").notNull().default("amazon.com"),
  zip: text("zip").notNull().default("90009"),
  targetCount: integer("target_count").notNull().default(24),
  status: text("status").notNull().default("pending"), // pending|running|paused|done|failed
  phase: text("phase").notNull().default("queued"), // queued|boot|listing|details|done|failed
  startPage: integer("start_page").notNull().default(1),
  currentPage: integer("current_page").notNull().default(1),
  collected: jsonb("collected").notNull().default([]), // listing stubs [{asin,title,link,image,price,rating,reviews,sponsored}]
  cursor: integer("cursor").notNull().default(0), // index into collected for details phase
  logs: jsonb("logs").notNull().default([]),
  settingsSnapshot: jsonb("settings_snapshot").notNull().default({}),
  sessionData: jsonb("session_data").notNull().default({}),
  error: text("error"),
  isSample: boolean("is_sample").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  jobId: text("job_id").notNull(),
  asin: text("asin").notNull(),
  position: integer("position").notNull().default(0),
  title: text("title").notNull().default(""),
  link: text("link").notNull().default(""),
  description: text("description").notNull().default(""),
  image1: text("image1").notNull().default(""),
  image2: text("image2").notNull().default(""),
  price: text("price").notNull().default(""),
  rating: text("rating").notNull().default(""),
  reviews: text("reviews").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("products_job_asin_idx").on(t.jobId, t.asin)]);

export const appSettings = pgTable("app_settings", {
  id: integer("id").primaryKey().default(1),
  zip: text("zip").notNull().default("90009"),
  marketplace: text("marketplace").notNull().default("amazon.com"),
  delayMin: integer("delay_min").notNull().default(800),
  delayMax: integer("delay_max").notNull().default(2200),
  retries: integer("retries").notNull().default(2),
  detailBatch: integer("detail_batch").notNull().default(4),
  includeSponsored: boolean("include_sponsored").notNull().default(false),
  extraColumns: jsonb("extra_columns").notNull().default(["price", "rating", "reviews"]),
  userAgents: jsonb("user_agents").notNull().default([]),
  proxyTemplate: text("proxy_template").notNull().default(""),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
