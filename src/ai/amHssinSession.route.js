
import express from "express";

const router = express.Router();

const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

function getAiUrl(endpoint) {
  const base = String(
    process.env.AM_HSSIN_API_URL ||
    process.env.AM_HSSIN_AI_URL ||
    "http://127.0.0.1:8000"
  )
    .trim()
    .replace(/\/+$/, "");

  const prefix = String(
    process.env.AM_HSSIN_API_PREFIX ?? ""
  )
    .trim()
    .replace(/^\/+|\/+$/g, "");

  if (!/^https?:\/\//i.test(base)) {
    throw new Error("Invalid AM_HSSIN_API_URL");
  }

  return `${base}${prefix ? `/${prefix}` : ""}${endpoint}`;
}

function getErrorMessage(data, status) {
  const detail = data?.detail || data?.error || data?.message;

  if (typeof detail === "string") {
    return detail;
  }

  if (Array.isArray(detail)) {
    return detail
      .map((item) => item?.msg || JSON.stringify(item))
      .join("; ");
  }

  return `AI service returned HTTP ${status}`;
}

router.post("/chat", async (req, res) => {
  const message = req.body?.message;
  const sessionId = req.body?.session_id;

  if (
    typeof message !== "string" ||
    !message.trim() ||
    message.length > 2000
  ) {
    return res.status(422).json({
      detail: "Message must contain 1–2000 characters",
    });
  }

  if (
    sessionId !== undefined &&
    (
      typeof sessionId !== "string" ||
      !SESSION_ID_PATTERN.test(sessionId)
    )
  ) {
    return res.status(422).json({
      detail: "Invalid session ID",
    });
  }

  const internalKey = String(
    process.env.INTERNAL_AI_KEY || ""
  ).trim();

  if (!internalKey) {
    console.error("[Am Hssin Chat] Missing INTERNAL_AI_KEY");

    return res.status(503).json({
      detail: "AI service is not configured",
    });
  }

  let url;

  try {
    url = getAiUrl("/chat");
  } catch (error) {
    console.error("[Am Hssin Chat]", error.message);

    return res.status(503).json({
      detail: "Invalid AI service configuration",
    });
  }

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 90000);

  try {
    console.log("[Am Hssin Chat] Request", {
      endpoint: url,
      hasSession: Boolean(sessionId),
    });

    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Internal-AI-Key": internalKey,
      },
      body: JSON.stringify({
        message: message.trim(),
        ...(sessionId ? { session_id: sessionId } : {}),
      }),
    });

    const raw = await response.text();

    let data = null;

    try {
      data = JSON.parse(raw);
    } catch {
      // An upstream proxy may return HTML or plain text.
    }

    if (!response.ok) {
      const detail = getErrorMessage(data, response.status);

      console.error("[Am Hssin Chat] Upstream error", {
        status: response.status,
        endpoint: url,
        detail,
      });

      return res.status(response.status).json({
        detail:
          process.env.NODE_ENV === "production"
            ? "AI service request failed"
            : detail,
      });
    }

    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data)
    ) {
      console.error(
        "[Am Hssin Chat] Invalid JSON response from FastAPI"
      );

      return res.status(502).json({
        detail: "Invalid AI service response",
      });
    }

    return res.status(200).json(data);
  } catch (error) {
    const timedOut =
      controller.signal.aborted ||
      error?.name === "AbortError" ||
      error?.name === "TimeoutError";

    console.error("[Am Hssin Chat] Proxy failure", {
      name: error?.name,
      message: error?.message,
      cause: error?.cause?.message,
    });

    return res.status(timedOut ? 504 : 502).json({
      detail: timedOut
        ? "AI service request timed out"
        : "Cannot reach Am Hssin FastAPI service",
    });
  } finally {
    clearTimeout(timeout);
  }
});

export default router;
