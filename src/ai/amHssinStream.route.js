"use strict";

const express = require("express");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const crypto = require("node:crypto");

const router = express.Router();
const clean = (value) => typeof value === "string" ? value.trim() : "";
const timeoutMs = () => {
  const configured = Number(process.env.AM_HSSIN_STREAM_TIMEOUT_MS || process.env.AM_HSSIN_TIMEOUT_MS || 100000);
  return Number.isFinite(configured) ? Math.max(10000, Math.min(120000, Math.round(configured))) : 100000;
};
const getBase = () => clean(process.env.AI_SERVICE_URL || process.env.AM_HSSIN_API_URL || process.env.AM_HSSIN_AI_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

function classify(status, detail) {
  const message = typeof detail === "string" ? detail : "AI service request failed";
  if (status === 404 && /conversation not found|session not found|expired/i.test(message))
    return { status: 404, code: "AI_SESSION_NOT_FOUND", message };
  if (status === 401 || status === 403)
    return { status: 502, code: "AI_INTERNAL_AUTH_FAILED", message: "Internal AI authentication failed." };
  if (status === 404) return { status: 502, code: "AI_UPSTREAM_ROUTE_MISSING", message: "AI streaming route is unavailable." };
  if (status === 408 || status === 504) return { status: 504, code: "AI_TIMEOUT", message: "Am Hssin took too long to respond." };
  if (status === 429) return { status: 503, code: "AI_UNAVAILABLE", message: "AI service is temporarily busy." };
  if (status >= 500) return { status: 502, code: "AI_UPSTREAM_ERROR", message: "AI service is temporarily unavailable." };
  return { status, code: "AI_UPSTREAM_ERROR", message };
}

function respond(res, status, code, message) {
  return res.status(status).json({ success: false, code, detail: message, message });
}

router.post("/chat/stream", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const message = req.body?.message;
  const sessionId = req.body?.session_id;
  if (typeof message !== "string" || !message.trim() || message.length > 2000)
    return respond(res, 422, "AI_INVALID_MESSAGE", "Message must contain 1–2000 characters.");
  if (sessionId !== undefined && (typeof sessionId !== "string" || !/^[A-Za-z0-9_-]{32,128}$/.test(sessionId)))
    return respond(res, 422, "AI_INVALID_SESSION", "Invalid session ID.");

  const key = clean(process.env.INTERNAL_AI_KEY);
  if (!key) return respond(res, 503, "AI_UNAVAILABLE", "AI service is not configured.");
  const base = getBase();
  if (!/^https?:\/\/[^\s]+$/i.test(base))
    return respond(res, 503, "AI_UNAVAILABLE", "AI service URL is invalid.");

  const controller = new AbortController();
  const duration = timeoutMs();
  let timedOut = false;
  let clientClosed = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, duration);
  const onClose = () => {
    if (!res.writableEnded) { clientClosed = true; controller.abort(); }
  };
  res.on("close", onClose);
  const requestId = crypto.randomUUID();
  const started = Date.now();

  try {
    const upstream = await fetch(`${base}/chat/stream`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        "X-Internal-AI-Key": key,
        "X-Request-ID": requestId,
      },
      body: JSON.stringify({ message: message.trim(), ...(sessionId ? { session_id: sessionId } : {}) }),
    });

    if (!upstream.ok) {
      const raw = (await upstream.text().catch(() => "")).slice(0, 4096);
      let data = {};
      try { data = JSON.parse(raw); } catch { /* HTML error */ }
      const detail = [data.detail, data.message, data.error].find((v) => typeof v === "string") || `HTTP ${upstream.status}`;
      const mapped = classify(upstream.status, detail);
      console.warn("[AmHssin SSE upstream]", { requestId, upstreamStatus: upstream.status, code: mapped.code, elapsedMs: Date.now() - started });
      return respond(res, mapped.status, mapped.code, mapped.message);
    }
    if (!upstream.body || !(upstream.headers.get("content-type") || "").toLowerCase().includes("text/event-stream")) {
      if (upstream.body) await upstream.body.cancel().catch(() => {});
      return respond(res, 502, "AI_UPSTREAM_ERROR", "AI service did not return an SSE stream.");
    }

    res.status(200).set({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    });
    res.flushHeaders();
    await pipeline(Readable.fromWeb(upstream.body), res);
  } catch (error) {
    if (clientClosed) return;
    const code = timedOut ? "AI_TIMEOUT" : "AI_CONNECTION_INTERRUPTED";
    const messageText = timedOut ? "Am Hssin took too long to respond." : "AI streaming connection interrupted.";
    console.error("[AmHssin SSE]", { requestId, code, elapsedMs: Date.now() - started, errorName: error?.name });
    if (!res.headersSent) {
      return respond(res, timedOut ? 504 : 502, code, messageText);
    }
    if (!res.destroyed && !res.writableEnded) {
      res.write(`event: error\ndata: ${JSON.stringify({ code, status: timedOut ? 504 : 502, message: messageText })}\n\n`);
      res.end();
    }
  } finally {
    clearTimeout(timer);
    res.off("close", onClose);
  }
});

module.exports = router;
