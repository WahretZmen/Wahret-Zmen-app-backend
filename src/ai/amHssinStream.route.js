'use strict';
const express = require('express');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const router = express.Router();

router.post('/chat/stream', async (req, res) => {
  const message = req.body?.message;
  const session_id = req.body?.session_id;
  if (typeof message !== 'string' || !message.trim() || message.length > 2000) {
    return res.status(422).json({ detail: 'Message must contain 1–2000 characters' });
  }
  if (session_id !== undefined && (typeof session_id !== 'string' || session_id.length > 128)) {
    return res.status(422).json({ detail: 'Invalid session ID' });
  }
  const key = process.env.INTERNAL_AI_KEY?.trim();
  if (!key) return res.status(503).json({ detail: 'AI service is not configured' });
  const base = (process.env.AM_HSSIN_AI_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
  const onClose = () => { if (!res.writableEnded) controller.abort(); };
  res.on('close', onClose);
  try {
    const upstream = await fetch(`${base}/chat/stream`, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream', 'X-Internal-AI-Key': key },
      body: JSON.stringify({ message: message.trim(), ...(session_id ? { session_id } : {}) }),
    });
    if (!upstream.ok) {
      const raw = await upstream.text();
      let data;
      try { data = JSON.parse(raw); } catch { data = { detail: `AI service returned HTTP ${upstream.status}` }; }
      return res.status(upstream.status).json({ detail: data.detail || data.error || 'AI service request failed' });
    }
    if (!upstream.body || !upstream.headers.get('content-type')?.includes('text/event-stream')) {
      return res.status(502).json({ detail: 'AI service did not return an SSE stream' });
    }
    res.status(200);
    res.set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no', 'Connection': 'keep-alive' });
    res.flushHeaders();
    await pipeline(Readable.fromWeb(upstream.body), res);
  } catch (error) {
    if (!res.headersSent) {
      res.status(error.name === 'AbortError' ? 504 : 502).json({ detail: error.name === 'AbortError' ? 'AI service timed out' : 'AI service is unreachable' });
    } else if (!res.destroyed && !res.writableEnded) {
      res.write(`event: error\ndata: ${JSON.stringify({ message: 'AI connection interrupted' })}\n\n`);
      res.end();
    }
    if (error.name !== 'AbortError' && error.code !== 'ERR_STREAM_PREMATURE_CLOSE') console.error('[Am Hssin SSE]', error.message);
  } finally {
    clearTimeout(timeout);
    res.off('close', onClose);
  }
});
module.exports = router;
