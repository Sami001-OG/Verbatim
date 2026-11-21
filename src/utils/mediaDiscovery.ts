import type { PlatformType } from '../types/transcript.ts';
import { decodeHtmlEntities } from './transcriptParser.ts';

export interface DiscoveredMedia {
  subtitleUrls: string[];
  audioUrls: string[];
  mediaUrls: string[];
  title?: string;
  author?: string;
}

const GENERIC_TITLES = new Set([
  'facebook',
  'instagram',
  'tiktok',
  'tiktok - make your day',
  'log in or sign up to view',
  'login • instagram',
  'watch',
  'x',
  'twitter',
]);

export function unescapeEmbeddedUrl(raw: string): string {
  return raw
    .trim()
    .replace(/\\+u0026/gi, '&')
    .replace(/\\+u002F/gi, '/')
    .replace(/\\+u003D/gi, '=')
    .replace(/\\+u003F/gi, '?')
    .replace(/\\+\//g, '/')
    .replace(/&amp;/g, '&')
    .trim();
}

export function extractInstagramShortcode(rawUrl: string): string | undefined {
  try {
    const parsed = new URL(rawUrl);
    const match = /^\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i.exec(parsed.pathname);
    return match?.[1];
  } catch {
    return undefined;
  }
}

export function buildPlatformFetchCandidates(
  normalizedUrl: string,
  platform: PlatformType,
): string[] {
  const candidates: string[] = [normalizedUrl];

  if (platform === 'instagram') {
    const shortcode = extractInstagramShortcode(normalizedUrl);
    if (shortcode) {
      candidates.push(
        `https://www.instagram.com/p/${shortcode}/embed/captioned/`,
        `https://www.instagram.com/reel/${shortcode}/embed/`,
      );
    }
  } else if (platform === 'facebook') {
    try {
      const u = new URL(normalizedUrl);
      if (u.hostname !== 'm.facebook.com') {
        const mobile = new URL(normalizedUrl);
        mobile.hostname = 'm.facebook.com';
        candidates.push(mobile.toString());
      }
    } catch {
      // Ignore invalid URL
    }
  }

  return Array.from(new Set(candidates));
}

function extractHtmlMeta(html: string, propertyOrName: string): string | undefined {
  const regex = new RegExp(
    `<meta[^>]+(?:property|name)=["']${propertyOrName}["'][^>]+content=["']([^"']+)["']`,
    'i',
  );
  const reverseRegex = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${propertyOrName}["']`,
    'i',
  );
  const match = regex.exec(html) || reverseRegex.exec(html);
  return match?.[1] ? decodeHtmlEntities(match[1]) : undefined;
}

function cleanSocialMetadata(
  rawTitle: string | undefined,
  rawAuthor: string | undefined,
  platform?: PlatformType,
): { title?: string; author?: string } {
  let title = rawTitle?.replace(/\s+/g, ' ').trim();
  let author = rawAuthor?.replace(/\s+/g, ' ').trim();

  if (title && GENERIC_TITLES.has(title.toLowerCase())) {
    title = undefined;
  }

  if (title && platform === 'facebook') {
    // Facebook og:title format: "2.2K reactions · 283 shares | Post caption... | Page Name"
    const parts = title.split(/\s*\|\s*/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      if (parts[parts.length - 1].toLowerCase() === 'facebook') {
        parts.pop();
      }
      if (parts.length >= 2 && /\b(?:reactions?|views?|likes?|comments?|shares?)\b/i.test(parts[0])) {
        parts.shift();
      }
      if (parts.length >= 2 && (!author || author.toLowerCase() === 'facebook')) {
        author = parts.pop();
      }
      title = parts.join(' | ').trim() || title;
    }
  }

  if (title && platform === 'instagram') {
    // Instagram og:title format: 'Creator on Instagram: "Caption text..."'
    const igMatch = /^(.+?)\s+on\s+Instagram:\s*["“]?([\s\S]+?)["”]?\s*$/i.exec(title);
    if (igMatch) {
      if (!author || author.toLowerCase() === 'instagram') {
        author = igMatch[1].trim();
      }
      title = igMatch[2].trim();
    }
  }

  if (title && title.length > 140) {
    title = `${title.slice(0, 137).trimEnd()}...`;
  }

  if (author && GENERIC_TITLES.has(author.toLowerCase())) {
    author = undefined;
  }

  return { title: title || undefined, author: author || undefined };
}

function extractDashAudioUrls(html: string): string[] {
  const results: string[] = [];
  const markerRegex = /audio\\?\/mp4/gi;
  let m: RegExpExecArray | null;

  while ((m = markerRegex.exec(html)) !== null) {
    const slice = html
      .slice(m.index, m.index + 2000)
      .replace(/\\u003C/gi, '<')
      .replace(/\\u003E/gi, '>')
      .replace(/\\\//g, '/');
    const baseMatch = /<BaseURL[^>]*>(https?:[^<]+)<\/BaseURL>/i.exec(slice);
    if (baseMatch?.[1]) {
      const url = unescapeEmbeddedUrl(baseMatch[1]);
      if (url.startsWith('http') && !url.includes('.m3u8')) {
        results.push(url);
      }
    }
    if (results.length >= 3) break;
  }

  return Array.from(new Set(results));
}

function extractInstagramVideoVersions(html: string): string[] {
  const results: string[] = [];
  const regex = /"video_versions"\s*:\s*(\[[\s\S]{10,4000}?\])/g;
  let m: RegExpExecArray | null;

  while ((m = regex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1]) as Array<{ url?: string; width?: number }>;
      if (Array.isArray(parsed)) {
        // Prefer smaller width / lower bandwidth entries first (same audio, faster download)
        const sorted = [...parsed].sort((a, b) => (a.width ?? 9999) - (b.width ?? 9999));
        for (const item of sorted) {
          if (typeof item?.url === 'string' && item.url.startsWith('http') && !item.url.includes('.m3u8')) {
            results.push(unescapeEmbeddedUrl(item.url));
          }
        }
      }
    } catch {
      // Fallback regex inside the matched slice
      const urlRegex = /"url"\s*:\s*"(https?:[^"]+)"/g;
      let um: RegExpExecArray | null;
      while ((um = urlRegex.exec(m[1])) !== null) {
        const u = unescapeEmbeddedUrl(um[1]);
        if (u.startsWith('http') && !u.includes('.m3u8')) {
          results.push(u);
        }
      }
    }
    if (results.length >= 4) break;
  }

  return Array.from(new Set(results));
}

function extractDoubleEscapedVideoUrls(html: string): string[] {
  const results: string[] = [];
  const marker = '\\"video_url\\":\\"';
  let searchFrom = 0;

  while (results.length < 3) {
    const idx = html.indexOf(marker, searchFrom);
    if (idx === -1) break;
    const start = idx + marker.length;
    const end = html.indexOf('\\"', start);
    if (end === -1) break;
    const raw = html.slice(start, end);
    const url = unescapeEmbeddedUrl(raw);
    if (url.startsWith('http') && !url.includes('.m3u8')) {
      results.push(url);
    }
    searchFrom = end + 2;
  }

  return Array.from(new Set(results));
}

export function discoverMediaUrlsFromHtml(
  html: string,
  platform?: PlatformType,
): DiscoveredMedia {
  const subtitleUrls: string[] = [];
  const audioUrls: string[] = extractDashAudioUrls(html);
  const mediaUrls: string[] = [];

  const rawTitle =
    extractHtmlMeta(html, 'og:title') ||
    extractHtmlMeta(html, 'twitter:title') ||
    decodeHtmlEntities((/<title[^>]*>([^<]+)<\/title>/i.exec(html)?.[1] ?? '').trim());

  const rawAuthor =
    extractHtmlMeta(html, 'og:site_name') ||
    extractHtmlMeta(html, 'author') ||
    undefined;

  const { title, author } = cleanSocialMetadata(rawTitle, rawAuthor, platform);

  // 1. Prefer smaller SD progressive streams first (same audio track, 4x faster and lighter for serverless)
  const sdPatterns = [
    /"(?:browser_native_sd_url|sd_src|playable_url)"\s*:\s*"(https?:[^"]+)"/gi,
  ];
  for (const pattern of sdPatterns) {
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(html)) !== null) {
      const u = unescapeEmbeddedUrl(m[1]);
      if (u.startsWith('http') && !u.includes('.m3u8')) {
        mediaUrls.push(u);
      }
      if (mediaUrls.length >= 3) break;
    }
  }

  // 2. Instagram desktop video_versions & embed double-escaped video_url
  mediaUrls.push(...extractInstagramVideoVersions(html));
  mediaUrls.push(...extractDoubleEscapedVideoUrls(html));

  // 3. OpenGraph & Twitter player streams (e.g. m.facebook.com og:video)
  const metaCandidates = [
    extractHtmlMeta(html, 'og:video:secure_url'),
    extractHtmlMeta(html, 'og:video:url'),
    extractHtmlMeta(html, 'og:video'),
    extractHtmlMeta(html, 'og:audio'),
    extractHtmlMeta(html, 'twitter:player:stream'),
  ].filter((u): u is string => Boolean(u && u.startsWith('http')));

  for (const url of metaCandidates) {
    if (!url.includes('.m3u8')) {
      mediaUrls.push(unescapeEmbeddedUrl(url));
    }
  }

  // 4. HD & other embedded JSON / HTML5 video & audio streams (TikTok, Facebook, Instagram, Vimeo, X)
  const otherPatterns = [
    /"(?:browser_native_hd_url|playable_url_quality_hd|hd_src|playAddr|downloadAddr|contentUrl|video_url)"\s*:\s*"(https?:[^"]+)"/gi,
    /<(?:video|audio|source)[^>]+src=["'](https?:[^"']+)["']/gi,
  ];

  for (const pattern of otherPatterns) {
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(html)) !== null) {
      const u = unescapeEmbeddedUrl(m[1]);
      if (u.startsWith('http') && !u.includes('.m3u8')) {
        mediaUrls.push(u);
      }
      if (mediaUrls.length >= 12) break;
    }
  }

  const subtitlePatterns = [
    /"(?:url|baseUrl|src|captions?_url|subtitles?_url)"\s*:\s*"(https?:[^"]+\.(?:vtt|srt)[^"]*)"/gi,
    /<track[^>]+src=["'](https?:[^"']+\.(?:vtt|srt)[^"']*)["']/gi,
  ];

  for (const pattern of subtitlePatterns) {
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(html)) !== null) {
      const u = unescapeEmbeddedUrl(m[1]);
      if (u.startsWith('http')) {
        subtitleUrls.push(u);
      }
    }
  }

  return {
    subtitleUrls: Array.from(new Set(subtitleUrls)),
    audioUrls: Array.from(new Set(audioUrls)),
    mediaUrls: Array.from(new Set(mediaUrls)),
    title,
    author,
  };
}
