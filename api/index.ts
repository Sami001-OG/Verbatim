import 'dotenv/config';
import express from 'express';
import {
  TranscriptionError,
  transcribeAudioBufferWithGemini,
  transcribeFromLink,
  translateTranscriptWithGemini,
} from '../src/server/transcribeService.ts';
import type { TranscriptResult } from '../src/types/transcript.ts';

const app = express();
app.use(express.json({ limit: '25mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/transcribe', async (req, res) => {
  try {
    const { url, language, includeSpeakers } = req.body as {
      url?: string;
      language?: string;
      includeSpeakers?: boolean;
    };

    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'Please provide a valid link to transcribe.' });
      return;
    }

    const result = await transcribeFromLink({
      url,
      language,
      includeSpeakers: Boolean(includeSpeakers),
    });

    res.json(result);
  } catch (error) {
    if (error instanceof TranscriptionError) {
      res.status(error.statusCode).json({
        error: error.message,
        suggestion: error.suggestion,
      });
      return;
    }
    const message = error instanceof Error ? error.message : 'Unexpected transcription error.';
    res.status(500).json({ error: message });
  }
});

app.post('/api/transcribe-file', async (req, res) => {
  try {
    const { filename, mimeType, dataBase64, language, includeSpeakers } = req.body as {
      filename?: string;
      mimeType?: string;
      dataBase64?: string;
      language?: string;
      includeSpeakers?: boolean;
    };

    if (!dataBase64 || typeof dataBase64 !== 'string') {
      res.status(400).json({ error: 'Missing media file data.' });
      return;
    }

    const buffer = Buffer.from(dataBase64, 'base64');
    if (buffer.byteLength === 0) {
      res.status(400).json({ error: 'Uploaded file is empty.' });
      return;
    }

    const cleanTitle = (filename || 'Uploaded Media').replace(/\.[^.]+$/, '');
    const result = await transcribeAudioBufferWithGemini(
      buffer,
      mimeType || 'audio/mp3',
      {
        sourceUrl: `file://${filename || 'media'}`,
        normalizedUrl: `file://${filename || 'media'}`,
        platform: 'uploaded-file',
        title: cleanTitle,
        languageHint: language,
        includeSpeakers: Boolean(includeSpeakers),
      },
    );

    res.json(result);
  } catch (error) {
    if (error instanceof TranscriptionError) {
      res.status(error.statusCode).json({
        error: error.message,
        suggestion: error.suggestion,
      });
      return;
    }
    const message = error instanceof Error ? error.message : 'Failed to transcribe uploaded file.';
    res.status(500).json({ error: message });
  }
});

app.post('/api/translate', async (req, res) => {
  try {
    const { transcript, targetLanguage } = req.body as {
      transcript?: TranscriptResult;
      targetLanguage?: string;
    };

    if (!transcript || !Array.isArray(transcript.segments)) {
      res.status(400).json({ error: 'Valid transcript payload is required.' });
      return;
    }

    if (!targetLanguage || typeof targetLanguage !== 'string') {
      res.status(400).json({ error: 'Target language is required.' });
      return;
    }

    const translated = await translateTranscriptWithGemini(transcript, targetLanguage);
    res.json(translated);
  } catch (error) {
    if (error instanceof TranscriptionError) {
      res.status(error.statusCode).json({
        error: error.message,
        suggestion: error.suggestion,
      });
      return;
    }
    const message = error instanceof Error ? error.message : 'Failed to translate transcript.';
    res.status(500).json({ error: message });
  }
});

export default app;
