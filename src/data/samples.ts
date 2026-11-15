import type { TranscriptResult } from '../types/transcript';

export interface SamplePreset {
  id: string;
  label: string;
  platformLabel: string;
  url: string;
  result: TranscriptResult;
}

export const SAMPLE_PRESETS: SamplePreset[] = [
  {
    id: 'sample-youtube',
    label: 'YouTube Talk',
    platformLabel: 'YouTube',
    url: 'https://www.youtube.com/watch?v=demo-design-systems',
    result: {
      id: 'sample-youtube-1',
      sourceUrl: 'https://www.youtube.com/watch?v=demo-design-systems',
      normalizedUrl: 'https://www.youtube.com/watch?v=demo-design-systems',
      platform: 'youtube',
      title: 'How High-Contrast Typography Shapes Product Trust',
      author: 'Studio Systems Conference',
      language: 'English',
      durationSec: 118,
      extractionMethod: 'sample',
      createdAt: '2026-11-14T18:30:00.000Z',
      segments: [
        {
          id: 'seg-1',
          startSec: 0,
          endSec: 6.4,
          speaker: 'Elena Vance',
          text: 'Every interface makes a promise in the first three hundred milliseconds, long before a visitor reads a single headline.',
        },
        {
          id: 'seg-2',
          startSec: 6.8,
          endSec: 14.2,
          speaker: 'Elena Vance',
          text: 'When spacing, contrast, and typographic rhythm align, the tool recedes and the user feels immediate control.',
        },
        {
          id: 'seg-3',
          startSec: 18.0,
          endSec: 25.5,
          speaker: 'Elena Vance',
          text: 'Look closely at how tabular numerals behave inside a live transcript or financial ledger.',
        },
        {
          id: 'seg-4',
          startSec: 25.9,
          endSec: 34.1,
          speaker: 'Elena Vance',
          text: 'If digits shift horizontally as seconds tick upward, your eye loses its anchor on the left margin.',
        },
        {
          id: 'seg-5',
          startSec: 38.5,
          endSec: 47.0,
          speaker: 'Marcus Chen',
          text: 'That is why we separate metadata from prose cleanly rather than wrapping every label inside a bright pill.',
        },
        {
          id: 'seg-6',
          startSec: 47.4,
          endSec: 56.2,
          speaker: 'Marcus Chen',
          text: 'Unboxed inline separators keep the reading flow calm, especially when someone scans a forty-minute interview.',
        },
        {
          id: 'seg-7',
          startSec: 60.0,
          endSec: 71.5,
          speaker: 'Elena Vance',
          text: 'Let us also talk about export ergonomics: editors want SRT for captions, plain paragraphs for newsletters, and timestamped bullets for show notes.',
        },
        {
          id: 'seg-8',
          startSec: 72.0,
          endSec: 84.3,
          speaker: 'Marcus Chen',
          text: 'Once the underlying segment model stores exact start and end seconds, switching between timestamped lines and clean prose is instantaneous.',
        },
      ],
    },
  },
  {
    id: 'sample-tiktok',
    label: 'TikTok Clip',
    platformLabel: 'TikTok',
    url: 'https://www.tiktok.com/@audiofoundry/video/7419283746152',
    result: {
      id: 'sample-tiktok-1',
      sourceUrl: 'https://www.tiktok.com/@audiofoundry/video/7419283746152',
      normalizedUrl: 'https://www.tiktok.com/@audiofoundry/video/7419283746152',
      platform: 'tiktok',
      title: 'Three Microphone Placement Tricks for Crisp Room Audio',
      author: '@audiofoundry',
      language: 'English',
      durationSec: 42,
      extractionMethod: 'sample',
      createdAt: '2026-11-14T19:05:00.000Z',
      segments: [
        {
          id: 'seg-1',
          startSec: 0,
          endSec: 4.8,
          text: 'Stop pointing your dynamic mic straight at your mouth if you record without a pop filter.',
        },
        {
          id: 'seg-2',
          startSec: 5.1,
          endSec: 11.4,
          text: 'Angle it forty-five degrees off-axis and place it roughly six inches from the corner of your jaw.',
        },
        {
          id: 'seg-3',
          startSec: 12.0,
          endSec: 19.6,
          text: 'Plosives drop immediately, room echo stays low, and your vocal warmth comes through without heavy EQ.',
        },
        {
          id: 'seg-4',
          startSec: 23.2,
          endSec: 31.8,
          text: 'Second tip: hang a heavy blanket behind your camera, not behind your chair, because directional mics reject rear noise.',
        },
        {
          id: 'seg-5',
          startSec: 32.3,
          endSec: 41.5,
          text: 'Try a ten-second test clip with both positions and listen on headphones—the difference is night and day.',
        },
      ],
    },
  },
  {
    id: 'sample-instagram',
    label: 'Instagram Reel',
    platformLabel: 'Instagram',
    url: 'https://www.instagram.com/reel/Cx92FieldNotes/',
    result: {
      id: 'sample-instagram-1',
      sourceUrl: 'https://www.instagram.com/reel/Cx92FieldNotes/',
      normalizedUrl: 'https://www.instagram.com/reel/Cx92FieldNotes/',
      platform: 'instagram',
      title: 'Morning Pour-Over Extraction Ratios Explained in 45 Seconds',
      author: '@fieldnotes.coffee',
      language: 'English',
      durationSec: 46,
      extractionMethod: 'sample',
      createdAt: '2026-11-14T19:40:00.000Z',
      segments: [
        {
          id: 'seg-1',
          startSec: 0,
          endSec: 5.5,
          text: 'Most bitter pour-overs happen because water temperature drops too fast or the bloom gets skipped.',
        },
        {
          id: 'seg-2',
          startSec: 6.0,
          endSec: 14.3,
          text: 'Start with eighteen grams of medium-fine coffee and pour forty grams of ninety-four degree water to wet every ground evenly.',
        },
        {
          id: 'seg-3',
          startSec: 15.0,
          endSec: 23.8,
          text: 'Wait thirty-five seconds while carbon dioxide escapes so the main pour flows uniformly through the bed.',
        },
        {
          id: 'seg-4',
          startSec: 28.0,
          endSec: 37.5,
          text: 'Finish pouring in two steady concentric spirals until your scale reads three hundred grams total.',
        },
        {
          id: 'seg-5',
          startSec: 38.0,
          endSec: 45.8,
          text: 'Aim for a total drawdown around two minutes and forty-five seconds for clean sweetness and clarity.',
        },
      ],
    },
  },
];
