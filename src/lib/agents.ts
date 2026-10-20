export interface AgentProfile { ua: string; secChUa: string; platform: string; mobile: string; }

export const DEFAULT_USER_AGENTS: string[] = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
];

export function profileFor(ua: string): AgentProfile {
  const isMac = /Macintosh/.test(ua); const isLinux = /Linux/.test(ua) && !isMac;
  const chrome = ua.match(/Chrome\/(\d+)/); const isEdge = /Edg\//.test(ua); const isFirefox = /Firefox/.test(ua); const isSafariOnly = /Safari/.test(ua) && !chrome;
  let secChUa = "";
  if (chrome && !isFirefox && !isSafariOnly) {
    const v = chrome[1]; secChUa = isEdge ? `"Microsoft Edge";v="${v}", "Chromium";v="${v}", "Not.A/Brand";v="24"` : `"Google Chrome";v="${v}", "Chromium";v="${v}", "Not.A/Brand";v="24"`;
  }
  return { ua, secChUa, platform: isMac ? '"macOS"' : isLinux ? '"Linux"' : '"Windows"', mobile: "?0" };
}

export function pickAgent(list?: string[]): AgentProfile {
  const pool = (list && list.filter(Boolean).length ? list.filter(Boolean) : DEFAULT_USER_AGENTS);
  return profileFor(pool[Math.floor(Math.random() * pool.length)]);
}

export function browserHeaders(p: AgentProfile, extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = {
    "user-agent": p.ua,
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9",
    "accept-encoding": "gzip, deflate, br",
    "upgrade-insecure-requests": "1",
    ...extra,
  };
  if (p.secChUa) { h["sec-ch-ua"] = p.secChUa; h["sec-ch-ua-mobile"] = p.mobile; h["sec-ch-ua-platform"] = p.platform; h["sec-fetch-dest"] = "document"; h["sec-fetch-mode"] = "navigate"; h["sec-fetch-site"] = "none"; h["sec-fetch-user"] = "?1"; }
  return h;
}

export const MARKETPLACES: Record<string, { domain: string; label: string; currency: string }> = {
  "amazon.com": { domain: "www.amazon.com", label: "United States", currency: "USD" },
  "amazon.co.uk": { domain: "www.amazon.co.uk", label: "United Kingdom", currency: "GBP" },
  "amazon.de": { domain: "www.amazon.de", label: "Germany", currency: "EUR" },
  "amazon.ca": { domain: "www.amazon.ca", label: "Canada", currency: "CAD" },
  "amazon.com.au": { domain: "www.amazon.com.au", label: "Australia", currency: "AUD" },
  "amazon.in": { domain: "www.amazon.in", label: "India", currency: "INR" },
  "amazon.fr": { domain: "www.amazon.fr", label: "France", currency: "EUR" },
  "amazon.it": { domain: "www.amazon.it", label: "Italy", currency: "EUR" },
  "amazon.es": { domain: "www.amazon.es", label: "Spain", currency: "EUR" },
  "amazon.co.jp": { domain: "www.amazon.co.jp", label: "Japan", currency: "JPY" },
};
