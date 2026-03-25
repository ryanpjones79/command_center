import { XMLParser } from "fast-xml-parser";

export type DailyNewsItem = {
  title: string;
  link: string;
  source: string;
  publishedAt: Date | null;
};

export type DailyNewsTopic = {
  label: string;
  query: string;
  items: DailyNewsItem[];
};

const parser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true
});

const newsTopics = [
  { label: "Sacramento Kings", query: "Sacramento Kings" },
  { label: "Los Angeles Dodgers", query: "Los Angeles Dodgers" },
  { label: "Oracle Health / Healthcare Analytics", query: '(Cerner OR "Oracle Health" OR "healthcare analytics")' }
] as const;

function buildGoogleNewsUrl(query: string) {
  const params = new URLSearchParams({
    q: query,
    hl: "en-US",
    gl: "US",
    ceid: "US:en"
  });
  return `https://news.google.com/rss/search?${params.toString()}`;
}

function stripSourceSuffix(title: string, source: string) {
  const suffix = ` - ${source}`;
  return title.endsWith(suffix) ? title.slice(0, -suffix.length).trim() : title.trim();
}

function toArray<T>(value: T | T[] | undefined) {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

async function fetchTopic(topic: (typeof newsTopics)[number], limit: number) {
  const response = await fetch(buildGoogleNewsUrl(topic.query), {
    cache: "no-store",
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Google News request failed for ${topic.label} (${response.status})`);
  }

  const xml = await response.text();
  const parsed = parser.parse(xml);
  const channel = parsed?.rss?.channel;
  const items = toArray(channel?.item);
  const seen = new Set<string>();

  return {
    label: topic.label,
    query: topic.query,
    items: items
      .map((item): DailyNewsItem | null => {
        const source = typeof item.source === "object" ? String(item.source["#text"] ?? "").trim() : "";
        const title = stripSourceSuffix(String(item.title ?? ""), source);
        const link = String(item.link ?? "").trim();
        const publishedAtValue = String(item.pubDate ?? "").trim();
        const publishedAt = publishedAtValue ? new Date(publishedAtValue) : null;

        if (!title || !link) {
          return null;
        }

        return {
          title,
          link,
          source,
          publishedAt: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null
        };
      })
      .filter((item): item is DailyNewsItem => Boolean(item))
      .filter((item) => {
        const key = `${item.title}|${item.source}`;
        if (seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      })
      .slice(0, limit)
  };
}

export async function getDailyBriefNews(limit = 3) {
  return Promise.all(newsTopics.map((topic) => fetchTopic(topic, limit)));
}
