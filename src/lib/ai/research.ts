/**
 * Araştırma Modu: ücretsiz web araması (DuckDuckGo Lite) + sayfa metni çıkarma.
 * Anahtar gerektirmez; kırılgan olduğu için her adım try/catch ile sarılıdır —
 * arama başarısız olursa boş dizi döner ve asistan normal devam eder.
 */

export type ResearchResult = {
  title: string;
  url: string;
  snippet: string;
  body: string;
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ");
}

/** DuckDuckGo Lite araması → başlık/url/snippet listesi. */
async function search(query: string): Promise<{ title: string; url: string; snippet: string }[]> {
  const res = await fetch(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`, {
    headers: { "User-Agent": UA, "Accept-Language": "tr,en;q=0.8" },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`arama HTTP ${res.status}`);
  const html = await res.text();
  const results: { title: string; url: string; snippet: string }[] = [];
  const linkRe = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const snippets: string[] = [];
  const snippetRe = /class="result-snippet"[^>]*>([\s\S]*?)<\/td>/g;
  let sm: RegExpExecArray | null;
  while ((sm = snippetRe.exec(html))) snippets.push(stripTags(sm[1]));
  let lm: RegExpExecArray | null;
  let i = 0;
  while ((lm = linkRe.exec(html)) && results.length < 6) {
    const url = lm[1];
    const title = stripTags(lm[2]);
    if (!title) continue;
    if (/duckduckgo\.com|\/l\/\?uddg=/.test(url)) continue; // reklamlar/ara sayfaları
    results.push({ title, url, snippet: snippets[i] ?? "" });
    i++;
  }
  return results;
}

/** Sayfayı indirip okunur düz metne indirger. */
async function fetchPageText(url: string, maxChars = 3500): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`sayfa HTTP ${res.status}`);
  const html = await res.text();
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  return stripTags(cleaned).slice(0, maxChars);
}

/** Arama + ilk sonuçların gövde metni. Hata olursa boş dizi. */
export async function researchWeb(query: string): Promise<ResearchResult[]> {
  try {
    const hits = await search(query);
    const top = hits.slice(0, 3);
    const withBodies = await Promise.all(
      top.map(async (hit) => {
        let body = "";
        try {
          body = await fetchPageText(hit.url);
        } catch {
          body = hit.snippet;
        }
        return { ...hit, body };
      }),
    );
    return withBodies.filter((r) => r.body.length > 40);
  } catch {
    return [];
  }
}

/** Model bağlamına eklenecek blok. */
export function formatResearchBlock(results: ResearchResult[]): string {
  if (!results.length) return "";
  return (
    "\n\n[WEB ARAŞTIRMASI — güncel kaynaklar]\n" +
    results
      .map(
        (r, i) =>
          `(${i + 1}) ${r.title}\nURL: ${r.url}\n${r.body.slice(0, 1200)}${r.body.length > 1200 ? "…" : ""}`,
      )
      .join("\n\n") +
    "\n\nBu araştırma sonuçlarını kullan; önemli yerlerde (1), (2) biçiminde kaynak numarası ver ve cevabın sonunda 'Kaynaklar:' altında URL'leri listele."
  );
}
