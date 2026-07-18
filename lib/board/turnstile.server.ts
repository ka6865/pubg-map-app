import type { TurnstileAction } from "./turnstileContract";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TOKEN_MAX_LENGTH = 2048;
const VERIFY_TIMEOUT_MS = 5000;
const HOSTNAME_MISMATCH_ERROR = "보안 인증 도메인이 일치하지 않습니다.";

type FetchLike = typeof fetch;

export type TurnstileVerificationResult =
  | { ok: true }
  | { ok: false; status: 400 | 503; error: string };

function getAllowedHostnames(): Set<string> {
  return new Set(
    (process.env.TURNSTILE_ALLOWED_HOSTNAMES ?? "")
      .split(",")
      .map((hostname) => hostname.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function verifyTurnstileToken(input: {
  token: unknown;
  remoteIp?: string;
  expectedAction: TurnstileAction;
  fetchImpl?: FetchLike;
}): Promise<TurnstileVerificationResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    return { ok: false, status: 503, error: "보안 인증을 사용할 수 없습니다." };
  }

  const token = typeof input.token === "string" ? input.token.trim() : "";
  if (!token || token.length > TOKEN_MAX_LENGTH) {
    return { ok: false, status: 400, error: "보안 인증 토큰이 올바르지 않습니다." };
  }

  const form = new FormData();
  form.set("secret", secret);
  form.set("response", token);
  const remoteIp = input.remoteIp?.trim();
  if (remoteIp) {
    form.set("remoteip", remoteIp);
  }

  try {
    const response = await (input.fetchImpl ?? fetch)(SITEVERIFY_URL, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error("turnstile_upstream");
    }

    const outcome: unknown = await response.json();
    if (!outcome || typeof outcome !== "object") {
      throw new Error("turnstile_payload");
    }

    const value = outcome as { success?: unknown; action?: unknown; hostname?: unknown };
    if (value.success !== true || value.action !== input.expectedAction) {
      return { ok: false, status: 400, error: "보안 인증에 실패했습니다. 다시 시도해주세요." };
    }

    const allowedHostnames = getAllowedHostnames();
    if (allowedHostnames.size > 0) {
      const hostname = typeof value.hostname === "string" ? value.hostname.trim().toLowerCase() : "";
      if (!hostname || !allowedHostnames.has(hostname)) {
        return { ok: false, status: 400, error: HOSTNAME_MISMATCH_ERROR };
      }
    }

    if (value.success === true) {
      return { ok: true };
    }
    return { ok: false, status: 400, error: "보안 인증에 실패했습니다. 다시 시도해주세요." };
  } catch {
    return { ok: false, status: 503, error: "보안 인증 서버에 연결하지 못했습니다." };
  }
}
