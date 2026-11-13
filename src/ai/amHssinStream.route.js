"use strict";
// Mount at /api/ai. Keep public routes independent of Admin authentication.
const express = require("express");
const crypto = require("node:crypto");
const router = express.Router();
const clean = value => typeof value === "string" ? value.trim() : "";
const baseUrl = () => clean(process.env.AI_SERVICE_URL || process.env.AM_HSSIN_API_URL || process.env.AM_HSSIN_AI_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
const timeoutMs = () => Math.max(15000, Math.min(115000, Number(process.env.AM_HSSIN_STREAM_TIMEOUT_MS || 100000) || 100000));
function failure(res, status, code, message) {
  return res.status(status).json({ success: false, code, detail: message, message });
}
function classify(status, detail) {
  if (status === 404 && /conversation not found|session not found|expired/i.test(detail))
    return { status: 404, code: "AI_SESSION_NOT_FOUND", message: detail };
  if (status === 401 || status === 403)
    return { status: 502, code: "AI_INTERNAL_AUTH_FAILED", message: "Internal AI authentication failed." };
  if (status === 404) return { status: 502, code: "AI_UPSTREAM_ROUTE_MISSING", message: "AI streaming route is unavailable." };
  if (status === 429) return { status: 503, code: "AI_RATE_LIMITED", message: "AI is busy. Please retry shortly." };
  if (status === 503 || status === 504) return { status: 503, code: "AI_UNAVAILABLE", message: "AI service is starting or temporarily unavailable." };
  return { status: 502, code: "AI_UPSTREAM_ERROR", message: "AI service request failed." };
}
router.post("/chat/stream", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const message = req.body?.message;
  const sessionId = req.body?.session_id;
  if (typeof message !== "string" || !message.trim() || message.length > 2000)
    return failure(res, 422, "AI_INVALID_MESSAGE", "Message must contain 1–2000 characters.");
  if (sessionId !== undefined && (typeof sessionId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(sessionId)))
    return failure(res, 422, "AI_INVALID_SESSION", "Invalid session ID.");
  const key = clean(process.env.INTERNAL_AI_KEY);
  if (!key) return failure(res, 503, "AI_UNAVAILABLE", "AI service is not configured.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());
  let clientDisconnected = false;
  const onClose = () => { if (!res.writableEnded) { clientDisconnected = true; controller.abort(); } };
  res.on("close", onClose);
  let reader;
  try {
    const upstream = await fetch(`${baseUrl()}/chat/stream`, {
      method: "POST", signal: controller.signal,
      headers: { "Content-Type": "application/json", Accept: "text/event-stream", "X-Internal-AI-Key": key, "X-Request-ID": crypto.randomUUID() },
      body: JSON.stringify({ message: message.trim(), ...(sessionId ? { session_id: sessionId } : {}) }),
    });
    if (!upstream.ok) {
      const raw = (await upstream.text().catch(() => "")).slice(0, 1500);
      let detail = "";
      try { const parsed = JSON.parse(raw); detail = typeof parsed.detail === "string" ? parsed.detail : typeof parsed.message === "string" ? parsed.message : ""; } catch { /* Ignore HTML error pages */ }
      const mapped = classify(upstream.status, detail);
      console.warn("[AmHssin SSE upstream]", { status: upstream.status, code: mapped.code });
      return failure(res, mapped.status, mapped.code, mapped.message);
    }
    if (!upstream.body || !String(upstream.headers.get("content-type") || "").toLowerCase().includes("text/event-stream"))
      return failure(res, 502, "AI_INVALID_STREAM", "AI service did not return an SSE stream.");
    res.status(200).set({ "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no", "Connection": "keep-alive" });
    res.flushHeaders();
    reader = upstream.body.getReader();
    while (!controller.signal.aborted) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value?.length && !res.write(Buffer.from(value))) {
        await new Promise(resolve => res.once("drain", resolve));
      }
    }
    if (!res.writableEnded && !res.destroyed) res.end();
  } catch (error) {
    if (clientDisconnected) return;
    const timedOut = controller.signal.aborted;
    const code = timedOut ? "AI_TIMEOUT" : "AI_UPSTREAM_ERROR";
    const status = timedOut ? 504 : 502;
    const messageText = timedOut ? "Am Hssin took too long to respond." : "AI streaming connection interrupted.";
    console.warn("[AmHssin SSE failure]", { code, name: error?.name });
    if (!res.headersSent) failure(res, status, code, messageText);
    else if (!res.destroyed && !res.writableEnded) {
      res.write(`event: error\ndata: ${JSON.stringify({ code, status, message: messageText })}\n\n`);
      res.end();
    }
  } finally {
    clearTimeout(timer);
    res.off("close", onClose);
    if (reader) { try { await reader.cancel(); } catch { /* stream already closed */ } try { reader.releaseLock(); } catch { /* ignored */ } }
  }
});
module.exports = router;
