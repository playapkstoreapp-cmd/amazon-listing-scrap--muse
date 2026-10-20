export interface CsvProduct { title: string; link: string; description: string; image1: string; image2: string; price?: string; rating?: string; reviews?: string; asin?: string; }
const esc = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
export function buildCsv(list: CsvProduct[], extraColumns: string[]): string {
  const headers = ["Full Product Title", "Product amazon link", "Product Description", "First Product Image Link", "Second Product Image Link (High Resolution)"];
  const extraMap: Record<string, { h: string; get: (p: CsvProduct) => string }> = {
    price: { h: "Price", get: (p) => p.price || "" }, rating: { h: "Rating", get: (p) => p.rating || "" },
    reviews: { h: "Review Count", get: (p) => p.reviews || "" }, asin: { h: "ASIN", get: (p) => p.asin || "" },
  };
  const extras = (extraColumns || []).filter((c) => extraMap[c]);
  const head = [...headers, ...extras.map((c) => extraMap[c].h)];
  const lines = [head.map(esc).join(",")];
  list.forEach((p) => lines.push([p.title, p.link, p.description, p.image1, p.image2, ...extras.map((c) => extraMap[c].get(p))].map(esc).join(",")));
  return lines.join("\n");
}
export const EXTRA_COLUMN_OPTIONS = [
  { key: "price", label: "Price" }, { key: "rating", label: "Rating" }, { key: "reviews", label: "Review Count" }, { key: "asin", label: "ASIN" },
];
