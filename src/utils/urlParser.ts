import type { PlatformType, ParsedUrlInfo } from '../types/transcript.ts';

const DIRECT_MEDIA_EXTENSIONS = [
  '.mp3',
  '.mp4',
  '.m4a',
  '.wav',
  '.webm',
  '.ogg',
  '.oga',
  '.ogv',
  '.aac',
  '.flac',
  '.mov',
  '.mkv',
  '.m3u8',
];

const PLATFORM_LABELS: Record<PlatformType, string> = {
  youtube: 'YouTube',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  facebook: 'Facebook',
  x: 'X (Twitter)',
  vimeo: 'Vimeo',
  twitch: 'Twitch',
  podcast: 'Podcast',
  'direct-media': 'Direct Media',
  'uploaded-file': 'Uploaded Media',
  web: 'Web Link',
};

export function getPlatformLabel(platform: PlatformType): string {
  return PLATFORM_LABELS[platform] ?? 'Web Link';
}

export function extractYouTubeVideoId(url: URL): string | undefined {
  const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '').toLowerCase();

  if (host === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0];
    return id && /^[a-zA-Z0-9_-]{6,15}$/.test(id) ? id : undefined;
  }

  if (host === 'youtube.com' || host === 'music.youtube.com' || host === 'youtube-nocookie.com') {
    const vParam = url.searchParams.get('v');
    if (vParam && /^[a-zA-Z0-9_-]{6,15}$/.test(vParam)) {
      return vParam;
    }

    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length >= 2 && ['shorts', 'live', 'embed', 'v'].includes(parts[0])) {
      const id = parts[1];
      if (/^[a-zA-Z0-9_-]{6,15}$/.test(id)) {
        return id;
      }
    }
  }

  return undefined;
}

export function detectPlatform(url: URL): PlatformType {
  const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '').toLowerCase();
  const pathLower = url.pathname.toLowerCase();

  if (
    host === 'youtube.com' ||
    host === 'youtu.be' ||
    host === 'music.youtube.com' ||
    host === 'youtube-nocookie.com'
  ) {
    return 'youtube';
  }
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) {
    return 'tiktok';
  }
  if (host === 'instagram.com' || host === 'instagr.am' || host.endsWith('.instagram.com')) {
    return 'instagram';
  }
  if (
    host === 'facebook.com' ||
    host === 'fb.watch' ||
    host === 'fb.com' ||
    host.endsWith('.facebook.com')
  ) {
    return 'facebook';
  }
  if (host === 'x.com' || host === 'twitter.com' || host.endsWith('.twitter.com')) {
    return 'x';
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    return 'vimeo';
  }
  if (host === 'twitch.tv' || host === 'clips.twitch.tv' || host.endsWith('.twitch.tv')) {
    return 'twitch';
  }
  if (
    host.includes('spotify.com') ||
    host.includes('podcasts.apple.com') ||
    host.includes('soundcloud.com') ||
    host.includes('pocketcasts.com')
  ) {
    return 'podcast';
  }

  if (DIRECT_MEDIA_EXTENSIONS.some((ext) => pathLower.endsWith(ext))) {
    return 'direct-media';
  }

  return 'web';
}

export function parseSourceUrl(rawInput: string): ParsedUrlInfo {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return {
      valid: false,
      normalizedUrl: '',
      platform: 'web',
      displayHost: '',
      error: 'Paste a video, audio, or social link to extract its transcript.',
    };
  }

  if (/\s/.test(trimmed)) {
    return {
      valid: false,
      normalizedUrl: '',
      platform: 'web',
      displayHost: '',
      error: 'The link contains spaces. Paste a single valid URL.',
    };
  }

  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed);
  const candidate = hasScheme ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return {
      valid: false,
      normalizedUrl: '',
      platform: 'web',
      displayHost: '',
      error: 'Enter a valid URL such as https://www.youtube.com/watch?v=... or https://www.tiktok.com/...',
    };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      valid: false,
      normalizedUrl: '',
      platform: 'web',
      displayHost: '',
      error: 'Only http:// and https:// links are supported.',
    };
  }

  if (!parsed.hostname.includes('.') && parsed.hostname !== 'localhost') {
    return {
      valid: false,
      normalizedUrl: '',
      platform: 'web',
      displayHost: '',
      error: 'Enter a complete domain link (for example, youtube.com, tiktok.com, or instagram.com).',
    };
  }

  const platform = detectPlatform(parsed);
  const videoId = platform === 'youtube' ? extractYouTubeVideoId(parsed) : undefined;
  const normalizedUrl =
    platform === 'youtube' && videoId
      ? `https://www.youtube.com/watch?v=${videoId}`
      : parsed.toString();

  return {
    valid: true,
    normalizedUrl,
    platform,
    videoId,
    displayHost: parsed.hostname.replace(/^www\./, ''),
  };
}
