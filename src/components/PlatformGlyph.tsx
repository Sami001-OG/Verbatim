import type { PlatformType } from '../types/transcript';
import {
  FileAudio,
  Film,
  Globe,
  Mic,
  PlaySquare,
  Radio,
  Share2,
  Video,
} from 'lucide-react';

interface PlatformGlyphProps {
  platform: PlatformType;
  className?: string;
}

export function PlatformGlyph({ platform, className = 'w-4 h-4' }: PlatformGlyphProps) {
  switch (platform) {
    case 'youtube':
      return <PlaySquare className={className} aria-hidden="true" />;
    case 'tiktok':
      return <Film className={className} aria-hidden="true" />;
    case 'instagram':
      return <Video className={className} aria-hidden="true" />;
    case 'facebook':
      return <Share2 className={className} aria-hidden="true" />;
    case 'x':
      return <Radio className={className} aria-hidden="true" />;
    case 'vimeo':
      return <Video className={className} aria-hidden="true" />;
    case 'twitch':
      return <Radio className={className} aria-hidden="true" />;
    case 'podcast':
      return <Mic className={className} aria-hidden="true" />;
    case 'direct-media':
    case 'uploaded-file':
      return <FileAudio className={className} aria-hidden="true" />;
    default:
      return <Globe className={className} aria-hidden="true" />;
  }
}
