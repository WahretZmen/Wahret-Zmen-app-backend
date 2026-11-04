
"use strict";

/* ============================================================
   WAHRET ZMEN BY SABRI
   PUBLIC AM HSSIN AI PROXY
   NODE.JS / EXPRESS / VERCEL

   POST /api/ai/chat
   POST /api/ai/chat/stream

   FASTAPI / RENDER:
   POST /chat
   POST /chat/stream
============================================================ */

const { Router } = require("express");
const { randomUUID } = require("node:crypto");

const router = Router();

/* ============================================================
   1. CONFIGURATION
============================================================ */

const MAX_MESSAGE_LENGTH = 2000;

const SESSION_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

const JSON_TIMEOUT_MS = 50000;
const STREAM_TIMEOUT_MS = 55000;
const FIRST_RESPONSE_TIMEOUT_MS = 20000;
const STREAM_IDLE_TIMEOUT_MS = 18000;

const clean = (value) =>
  typeof value === "string" ? value.trim() : "";

function getConfiguration() {
  const rawBase = clean(
    process.env.AI_SERVICE_URL ||
    process.env.AM_HSSIN_API_URL ||
    process.env.AM_HSSIN_AI_URL ||
    (
      process.env.NODE_ENV === "production"
        ? ""
        : "http://127.0.0.1:8000"
    )
  );

  const internalKey = clean(process.env.INTERNAL_AI_KEY);

  if (!rawBase) {
    throw Object.assign(
      new Error("AI_SERVICE_URL is missing"),
      { code: "AI_NOT_CONFIGURED" }
    );
  }

  if (!internalKey) {
    throw Object.assign(
      new Error("INTERNAL_AI_KEY is missing"),
      { code: "AI_NOT_CONFIGURED" }
    );
  }

  let base;

  try {
    base = new URL(rawBase);
  } catch {
    throw Object.assign(
      new Error("Invalid AI_SERVICE_URL"),
      { code: "AI_NOT_CONFIGURED" }
    );
  }

  if (
    !["http:", "https:"].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    (
      process.env.NODE_ENV === "production" &&
      base.protocol !== "https:"
    )
  ) {
    throw Object.assign(
      new Error("Unsafe AI_SERVICE_URL"),
      { code: "AI_NOT_CONFIGURED" }
    );
  }

  // FastAPI endpoints are located at the service root.
  // Never append /api/ai to the Render URL.
  const origin = base.origin;

  if (base.pathname !== "/") {
    console.warn(
      "[AmHssin] Ignoring AI service URL path:",
      base.pathname
    );
  }

  return {
    origin,
    internalKey,
  };
}

/* ============================================================
   2. REQUEST VALIDATION
============================================================ */

function validatePayload(body) {
  const message = clean(body?.message);

  if (
    !message ||
    message.length > MAX_MESSAGE_LENGTH
  ) {
    return {
      error: "Message must contain 1–2000 characters.",
    };
  }

  const sessionId =
    body?.session_id ?? body?.sessionId ?? null;

  if (
    sessionId !== null &&
    (
      typeof sessionId !== "string" ||
      !SESSION_PATTERN.test(sessionId)
    )
  ) {
    return {
      error: "Invalid session ID.",
    };
  }

  const payload = {
    message,
  };

  if (sessionId) {
    payload.session_id = sessionId;
  }

  // Do not forward arbitrary client-supplied fields.
  return { payload };
}

/* ============================================================
   3. ERROR HELPERS
============================================================ */

function sendError(res, status, code, message) {
  if (res.destroyed || res.writableEnded) {
    return;
  }

  const data = {
    success: false,
    code,
    message,
    detail: message,
  };

  if (res.headersSent) {
    res.write(
      `event: error\ndata: ${JSON.stringify(data)}\n\n`
    );

    res.end();
    return;
  }

  res.setHeader("Cache-Control", "no-store");

  res.status(status).json(data);
}

function mapUpstreamError(status, detail) {
  if (status === 401 || status === 403) {
    return {
      status: 502,
      code: "AI_INTERNAL_AUTH_FAILED",
      message:
        "Internal AI authentication failed. Verify INTERNAL_AI_KEY on Vercel and Render.",
    };
  }

  if (status === 404) {
    // Session loss is recoverable by the browser. A missing route is not.
    if (/conversation not found|session not found|expired/i.test(String(detail || ""))) {
      return {
        status: 404,
        code: "AI_SESSION_NOT_FOUND",
        message: "Conversation not found or expired",
      };
    }
    return {
      status: 502,
      code: "AI_UPSTREAM_ROUTE_MISSING",
      message: "The FastAPI route was not found.",
    };
  }

  if (status === 422) {
    return {
      status: 422,
      code: "AI_INVALID_REQUEST",
      message: "FastAPI rejected the request.",
    };
  }

  if (status === 429) {
    return {
      status: 503,
      code: "AI_RATE_LIMITED",
      message: "AI service is temporarily busy.",
    };
  }

  if (status === 504) {
    return {
      status: 504,
      code: "AI_TIMEOUT",
      message: "AI service timed out.",
    };
  }

  return {
    status: 502,
    code: "AI_UPSTREAM_ERROR",
    message: `AI service returned HTTP ${status}.`,
  };
}

async function readErrorDetail(response) {
  try {
    const text = (await response.text()).slice(0, 1000);

    if (!text) return "";

    const data = JSON.parse(text);

    if (typeof data.detail === "string") {
      return data.detail;
    }

    if (typeof data.message === "string") {
      return data.message;
    }

    return "";
  } catch {
    return "";
  }
}

/* ============================================================
   4. ABORT AND TIMEOUT MANAGEMENT
============================================================ */

function createRequestState(
  req,
  res,
  maximumMs,
  firstResponseMs,
  idleMs = 0
) {
  const controller = new AbortController();

  let reason = null;
  let idleTimer = null;

  const abort = (why) => {
    if (controller.signal.aborted) return;

    reason = why;
    controller.abort(new Error(why));
  };

  const maximumTimer = setTimeout(
    () => abort("timeout"),
    maximumMs
  );

  const firstTimer = setTimeout(
    () => abort("timeout"),
    firstResponseMs
  );

  const onResponseClose = () => {
    if (!res.writableEnded) {
      abort("client_disconnected");
    }
  };

  const onRequestAbort = () => {
    abort("client_disconnected");
  };

  res.once("close", onResponseClose);
  req.once("aborted", onRequestAbort);

  return {
    controller,

    get reason() {
      return reason;
    },

    activity() {
      clearTimeout(firstTimer);

      if (idleMs > 0) {
        clearTimeout(idleTimer);

        idleTimer = setTimeout(
          () => abort("timeout"),
          idleMs
        );
      }
    },

    cleanup() {
      clearTimeout(maximumTimer);
      clearTimeout(firstTimer);
      clearTimeout(idleTimer);

      res.off("close", onResponseClose);
      req.off("aborted", onRequestAbort);
    },
  };
}

/* ============================================================
   5. FETCH FASTAPI
============================================================ */

async function fetchAI(endpoint, payload, signal) {
  const { origin, internalKey } = getConfiguration();

  // Confirmed FastAPI paths:
  // /chat
  // /chat/stream
  const url = new URL(endpoint, `${origin}/`);

  const requestId = randomUUID();

  console.info("[AmHssin Upstream]", {
    requestId,
    endpoint,
    host: url.host,
    pathname: url.pathname,
  });

  return fetch(url, {
    method: "POST",
    signal,

    headers: {
      "Content-Type": "application/json",

      Accept:
        endpoint === "/chat/stream"
          ? "text/event-stream"
          : "application/json",

      "X-Internal-AI-Key": internalKey,
      "X-Request-ID": requestId,
    },

    body: JSON.stringify(payload),
    cache: "no-store",
  });
}

/* ============================================================
   6. HANDLE PROXY EXCEPTIONS
============================================================ */

function handleProxyException(res, error, state) {
  console.error("[AmHssin Proxy Error]", {
    code: error?.code,
    name: error?.name,
    message: error?.message,
    reason: state.reason,
  });

  if (
    state.reason === "client_disconnected" ||
    res.destroyed ||
    res.writableEnded
  ) {
    return;
  }

  if (error?.code === "AI_NOT_CONFIGURED") {
    return sendError(
      res,
      503,
      "AI_NOT_CONFIGURED",
      "Public AI service is not configured."
    );
  }

  if (
    state.reason === "timeout" ||
    error?.name === "TimeoutError"
  ) {
    return sendError(
      res,
      504,
      "AI_TIMEOUT",
      "Am Hssin took too long to respond."
    );
  }

  return sendError(
    res,
    503,
    "AI_UNAVAILABLE",
    "Am Hssin is temporarily unavailable."
  );
}

/* ============================================================
   7. JSON CHAT

   POST /api/ai/chat
============================================================ */

router.post("/chat", async (req, res) => {
  const validation = validatePayload(req.body);

  if (validation.error) {
    return sendError(
      res,
      422,
      "AI_INVALID_REQUEST",
      validation.error
    );
  }

  const state = createRequestState(
    req,
    res,
    JSON_TIMEOUT_MS,
    JSON_TIMEOUT_MS
  );

  try {
    const upstream = await fetchAI(
      "/chat",
      validation.payload,
      state.controller.signal
    );

    state.activity();

    if (!upstream.ok) {
      const detail = await readErrorDetail(upstream);

      const mapped = mapUpstreamError(
        upstream.status,
        detail
      );

      console.error("[AmHssin JSON Upstream Error]", {
        status: upstream.status,
        detail,
      });

      return sendError(
        res,
        mapped.status,
        mapped.code,
        mapped.message
      );
    }

    const contentType =
      upstream.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
      return sendError(
        res,
        502,
        "AI_INVALID_RESPONSE",
        "FastAPI returned an unexpected content type."
      );
    }

    const data = await upstream.json();

    res.setHeader("Cache-Control", "no-store");

    return res.status(200).json(data);
  } catch (error) {
    handleProxyException(res, error, state);
  } finally {
    state.cleanup();
  }
});

/* ============================================================
   8. STREAM BACKPRESSURE
============================================================ */

function waitForDrain(res, signal) {
  return new Promise((resolve, reject) => {
    if (
      res.destroyed ||
      res.writableEnded ||
      signal.aborted
    ) {
      reject(new Error("Stream closed"));
      return;
    }

    const cleanup = () => {
      res.off("drain", onDrain);
      res.off("close", onClose);
      signal.removeEventListener("abort", onAbort);
    };

    const onDrain = () => {
      cleanup();
      resolve();
    };

    const onClose = () => {
      cleanup();
      reject(new Error("Client disconnected"));
    };

    const onAbort = () => {
      cleanup();
      reject(new Error("Stream aborted"));
    };

    res.once("drain", onDrain);
    res.once("close", onClose);

    signal.addEventListener(
      "abort",
      onAbort,
      { once: true }
    );
  });
}

/* ============================================================
   9. SSE STREAM

   POST /api/ai/chat/stream
============================================================ */

router.post("/chat/stream", async (req, res) => {
  const validation = validatePayload(req.body);

  if (validation.error) {
    return sendError(
      res,
      422,
      "AI_INVALID_REQUEST",
      validation.error
    );
  }

  const state = createRequestState(
    req,
    res,
    STREAM_TIMEOUT_MS,
    FIRST_RESPONSE_TIMEOUT_MS,
    STREAM_IDLE_TIMEOUT_MS
  );

  let reader = null;
  let eventBuffer = "";
  let receivedDone = false;

  try {
    const upstream = await fetchAI(
      "/chat/stream",
      validation.payload,
      state.controller.signal
    );

    state.activity();

    if (!upstream.ok) {
      const detail = await readErrorDetail(upstream);

      const mapped = mapUpstreamError(
        upstream.status,
        detail
      );

      console.error("[AmHssin SSE Upstream Error]", {
        status: upstream.status,
        detail,
      });

      return sendError(
        res,
        mapped.status,
        mapped.code,
        mapped.message
      );
    }

    const contentType =
      upstream.headers.get("content-type") || "";

    if (
      !upstream.body ||
      !contentType.includes("text/event-stream")
    ) {
      return sendError(
        res,
        502,
        "AI_INVALID_STREAM",
        "FastAPI did not return an SSE stream."
      );
    }

    /* --------------------------------------------------------
       SSE HEADERS
    -------------------------------------------------------- */

    res.status(200);

    res.setHeader(
      "Content-Type",
      "text/event-stream; charset=utf-8"
    );

    res.setHeader(
      "Cache-Control",
      "no-cache, no-transform"
    );

    res.setHeader(
      "Connection",
      "keep-alive"
    );

    res.setHeader(
      "X-Accel-Buffering",
      "no"
    );

    res.flushHeaders?.();

    /* --------------------------------------------------------
       FORWARD SSE DATA
    -------------------------------------------------------- */

    reader = upstream.body.getReader();

    const decoder = new TextDecoder();

    function inspectEvents(chunk) {
      eventBuffer += chunk;

      // Normalize line endings for event inspection.
      eventBuffer = eventBuffer.replace(/\r\n/g, "\n");

      let boundary;

      while (
        (boundary = eventBuffer.indexOf("\n\n")) !== -1
      ) {
        const event = eventBuffer.slice(0, boundary);

        eventBuffer = eventBuffer.slice(boundary + 2);

        if (
          event.split("\n").some(
            (line) => /^event:\s*done\s*$/.test(line)
          )
        ) {
          receivedDone = true;
        }
      }

      if (eventBuffer.length > 65536) {
        eventBuffer = eventBuffer.slice(-8192);
      }
    }

    while (!state.controller.signal.aborted) {
      const { done, value } = await reader.read();

      if (done) break;

      if (
        res.destroyed ||
        res.writableEnded
      ) {
        return;
      }

      if (!value?.length) continue;

      state.activity();

      inspectEvents(
        decoder.decode(value, { stream: true })
      );

      const writable = res.write(
        Buffer.from(value)
      );

      if (!writable) {
        await waitForDrain(
          res,
          state.controller.signal
        );
      }
    }

    if (state.controller.signal.aborted) {
      throw state.controller.signal.reason;
    }

    // A clean upstream EOF is not proof of successful
    // AI completion unless FastAPI emitted "done".
    if (!receivedDone) {
      return sendError(
        res,
        502,
        "AI_STREAM_INCOMPLETE",
        "AI stream ended before completion."
      );
    }

    if (
      !res.destroyed &&
      !res.writableEnded
    ) {
      res.end();
    }
  } catch (error) {
    handleProxyException(res, error, state);
  } finally {
    state.cleanup();

    if (reader) {
      try {
        await reader.cancel();
      } catch {
        // Already closed.
      }

      try {
        reader.releaseLock();
      } catch {
        // Already released.
      }
    }
  }
});

/* ============================================================
   10. EXPORT
============================================================ */

module.exports = router;
