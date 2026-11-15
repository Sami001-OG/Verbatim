import 'dotenv/config';
import express from 'express';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import {
  TranscriptionError,
  transcribeAudioBufferWithGemini,
  transcribeFromLink,
  translateTranscriptWithGemini,
} from './src/server/transcribeService.ts';
import type { TranscriptResult } from './src/types/transcript.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveRequestOrigin(req: express.Request): string {
  const configured = process.env.APP_URL?.trim().replace(/\/+$/, '');
  if (configured && /^https?:\/\//i.test(configured)) {
    return configured;
  }
  const protoHeader = req.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const proto = protoHeader || req.protocol || 'http';
  const host = req.get('x-forwarded-host')?.split(',')[0]?.trim() || req.get('host') || 'localhost:3000';
  return `${proto}://${host}`;
}

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  app.set('trust proxy', true);
  app.use(express.json({ limit: '35mb' }));

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
      if (buffer.byteLength > 24 * 1024 * 1024) {
        res.status(413).json({ error: 'File exceeds the 24 MB upload limit.' });
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

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    app.use(vite.middlewares);

    app.get('*', async (req, res, next) => {
      try {
        const template = await fs.readFile(path.join(__dirname, 'index.html'), 'utf-8');
        const origin = resolveRequestOrigin(req);
        const withOrigin = template.replace(/__APP_ORIGIN__/g, origin);
        const html = await vite.transformIndexHtml(req.originalUrl, withOrigin);
        res.status(200).set({ 'Content-Type': 'text/html; charset=utf-8' }).end(html);
      } catch (err) {
        next(err);
      }
    });
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir, { index: false }));
    app.get('*', async (req, res, next) => {
      try {
        const template = await fs.readFile(path.join(distDir, 'index.html'), 'utf-8');
        const origin = resolveRequestOrigin(req);
        const html = template.replace(/__APP_ORIGIN__/g, origin);
        res.status(200).set({ 'Content-Type': 'text/html; charset=utf-8' }).end(html);
      } catch (err) {
        next(err);
      }
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Verbatim server listening on http://localhost:${port}`);
  });
}

startServer();
