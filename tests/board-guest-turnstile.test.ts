// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { checkProfanity } from "../lib/board/profanityFilter";
import { extractClientIp, maskIp } from "../lib/board/ipUtils";
import { verifyTurnstileToken } from "../lib/board/turnstile.server";
import TurnstileWidget from "../components/board/TurnstileWidget";
import { TURNSTILE_ACTIONS } from "../lib/board/turnstileContract";

describe("비속어 필터 (profanityFilter)", () => {
  it("정상적인 텍스트는 차단되지 않아야 한다", () => {
    const result = checkProfanity("오늘 배틀그라운드 맵 너무 예쁘네요!");
    expect(result.blocked).toBe(false);
  });

  it("비속어 사전에 포함된 단어는 차단되어야 한다", () => {
    const result1 = checkProfanity("이거 완전 시발 게임이네");
    expect(result1.blocked).toBe(true);
    expect(result1.matchedWord).toBe("시발");

    const result2 = checkProfanity("개새끼야 저리 가");
    expect(result2.blocked).toBe(true);
    expect(result2.matchedWord).toBe("개새끼");
  });

  it("유사 문자 및 특수문자 우회 처리가 정상 작동해야 한다", () => {
    // 공백 삽입
    const result1 = checkProfanity("시   발");
    expect(result1.blocked).toBe(true);

    // 특수문자 삽입
    const result2 = checkProfanity("씨_발");
    expect(result2.blocked).toBe(true);

    const result3 = checkProfanity("시1발");
    expect(result3.blocked).toBe(true);

    // leetspeak 치환
    const result4 = checkProfanity("byungsin");
    expect(result4.blocked).toBe(true);
  });

  it("한글 자모 초성 비속어(ㅅㅂ, ㅂㅅ 등)를 감지해야 한다", () => {
    const result1 = checkProfanity("아 ㅅㅂ 죽었네");
    expect(result1.blocked).toBe(true);

    const result2 = checkProfanity("야 ㅂㅅ아");
    expect(result2.blocked).toBe(true);
  });
});

describe("IP 유틸리티 (ipUtils)", () => {
  describe("extractClientIp", () => {
    it("x-forwarded-for 헤더가 있을 때 첫 번째 IP를 반환해야 한다", () => {
      const req = new Request("https://example.com/api", {
        headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
      });
      expect(extractClientIp(req)).toBe("1.2.3.4");
    });

    it("x-forwarded-for 헤더가 없고 x-real-ip가 있을 때 해당 IP를 반환해야 한다", () => {
      const req = new Request("https://example.com/api", {
        headers: { "x-real-ip": "9.10.11.12" },
      });
      expect(extractClientIp(req)).toBe("9.10.11.12");
    });

    it("헤더 정보가 없을 경우 fallback으로 0.0.0.0을 반환해야 한다", () => {
      const req = new Request("https://example.com/api");
      expect(extractClientIp(req)).toBe("0.0.0.0");
    });
  });

  describe("maskIp", () => {
    it("IPv4 주소의 경우 앞 두 세그먼트만 노출하고 나머지는 제거해야 한다", () => {
      expect(maskIp("121.130.45.89")).toBe("121.130");
      expect(maskIp("8.8.8.8")).toBe("8.8");
    });

    it("IPv6 주소의 경우 앞 두 그룹만 노출해야 한다", () => {
      expect(maskIp("2001:0db8:85a3:0000:0000:8a2e:0370:7334")).toBe("2001:0db8");
    });

    it("잘못된 IP 형식이나 빈 문자열의 경우 0.0을 반환하거나 원본을 반환해야 한다", () => {
      expect(maskIp("")).toBe("0.0");
      expect(maskIp("unknown")).toBe("unknown");
    });
  });
});

describe("Cloudflare Turnstile Siteverify 검증", () => {
  const originalSecret = process.env.TURNSTILE_SECRET_KEY;

  beforeEach(() => {
    delete process.env.TURNSTILE_SECRET_KEY;
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.TURNSTILE_SECRET_KEY;
    } else {
      process.env.TURNSTILE_SECRET_KEY = originalSecret;
    }
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("secret 누락 시 외부 호출 전에 503으로 차단한다", async () => {
    const fetchImpl = vi.fn();
    const result = await verifyTurnstileToken({
      token: "token",
      remoteIp: "203.0.113.10",
      expectedAction: "guest_post",
      fetchImpl,
    });
    expect(result).toEqual({ ok: false, status: 503, error: "보안 인증을 사용할 수 없습니다." });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([undefined, null, "", "   ", "x".repeat(2049)])("잘못된 token %j을 외부 호출 전에 거부한다", async (token) => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    const fetchImpl = vi.fn();
    const result = await verifyTurnstileToken({
      token,
      remoteIp: "203.0.113.10",
      expectedAction: "guest_post",
      fetchImpl,
    });
    expect(result).toEqual({ ok: false, status: 400, error: "보안 인증 토큰이 올바르지 않습니다." });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("success와 action이 일치할 때만 통과하고 trim token과 remoteip을 전달한다", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      action: "guest_comment",
    }), { status: 200 }));
    const result = await verifyTurnstileToken({
      token: "  valid-token  ",
      remoteIp: "203.0.113.10",
      expectedAction: "guest_comment",
      fetchImpl,
    });
    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const options = fetchImpl.mock.calls[0][1] as RequestInit;
    const body = options.body as FormData;
    expect(body.get("secret")).toBe("test-secret");
    expect(body.get("response")).toBe("valid-token");
    expect(body.get("remoteip")).toBe("203.0.113.10");
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(timeoutSpy).toHaveBeenCalledOnce();
    expect(timeoutSpy).toHaveBeenCalledWith(5000);
  });

  it("remoteIp가 빈 경우 remoteip 필드를 전송하지 않는다", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, action: "guest_post" })));
    await verifyTurnstileToken({ token: "token", expectedAction: "guest_post", fetchImpl });
    const body = (fetchImpl.mock.calls[0][1] as RequestInit).body as FormData;
    expect(body.has("remoteip")).toBe(false);
  });

  it.each([
    { success: false, "error-codes": ["timeout-or-duplicate"] },
    { success: true, action: "guest_post" },
  ])("duplicate 또는 action mismatch를 고정 400으로 거부한다", async (outcome) => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    const result = await verifyTurnstileToken({
      token: "token",
      remoteIp: "203.0.113.10",
      expectedAction: "guest_comment",
      fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify(outcome), { status: 200 })),
    });
    expect(result).toEqual({ ok: false, status: 400, error: "보안 인증에 실패했습니다. 다시 시도해주세요." });
  });

  it.each([
    vi.fn().mockRejectedValue(new Error("network")),
    vi.fn().mockResolvedValue(new Response("bad", { status: 502 })),
    vi.fn().mockResolvedValue(new Response("not-json", { status: 200 })),
  ])("Siteverify 장애를 고정 503으로 처리한다", async (fetchImpl) => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    const result = await verifyTurnstileToken({
      token: "token",
      remoteIp: "203.0.113.10",
      expectedAction: "guest_post",
      fetchImpl,
    });
    expect(result).toEqual({ ok: false, status: 503, error: "보안 인증 서버에 연결하지 못했습니다." });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("Siteverify 요청이 abort되면 retry 없이 고정 503을 반환한다", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    const fetchImpl = vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError"));

    const result = await verifyTurnstileToken({
      token: "token",
      remoteIp: "203.0.113.10",
      expectedAction: "guest_post",
      fetchImpl,
    });

    expect(result).toEqual({ ok: false, status: 503, error: "보안 인증 서버에 연결하지 못했습니다." });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("Cloudflare Turnstile 위젯", () => {
  const originalSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "test-site-key";
  });

  afterEach(() => {
    cleanup();
    delete window.turnstile;
    if (originalSiteKey === undefined) {
      delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    } else {
      process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = originalSiteKey;
    }
  });

  it("게스트 action을 Turnstile render 설정에 전달한다", () => {
    const renderTurnstile = vi.fn().mockReturnValue("widget-a");
    window.turnstile = {
      render: renderTurnstile,
      reset: vi.fn(),
      remove: vi.fn(),
    };

    render(createElement(TurnstileWidget, {
      action: TURNSTILE_ACTIONS.comment,
      onVerify: vi.fn(),
    }));

    expect(renderTurnstile).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({
      sitekey: "test-site-key",
      action: "guest_comment",
    }));
  });

  it("부모 callback이 바뀌어도 widget을 재생성하지 않고 최신 callback을 호출한다", () => {
    const renderTurnstile = vi.fn().mockReturnValue("widget-a");
    window.turnstile = {
      render: renderTurnstile,
      reset: vi.fn(),
      remove: vi.fn(),
    };
    const firstCallback = vi.fn();
    const latestCallback = vi.fn();
    const view = render(createElement(TurnstileWidget, {
      action: TURNSTILE_ACTIONS.post,
      onVerify: firstCallback,
    }));

    view.rerender(createElement(TurnstileWidget, {
      action: TURNSTILE_ACTIONS.post,
      onVerify: latestCallback,
    }));
    const options = renderTurnstile.mock.calls[0][1] as { callback: (token: string) => void };
    options.callback("fresh-token");

    expect(renderTurnstile).toHaveBeenCalledTimes(1);
    expect(firstCallback).not.toHaveBeenCalled();
    expect(latestCallback).toHaveBeenCalledWith("fresh-token");
  });

  it("토큰이 만료되면 부모 token을 지운 후 widget을 reset한다", () => {
    const renderTurnstile = vi.fn().mockReturnValue("widget-a");
    const callbackOrder: string[] = [];
    const resetTurnstile = vi.fn(() => {
      callbackOrder.push("reset");
    });
    window.turnstile = {
      render: renderTurnstile,
      reset: resetTurnstile,
      remove: vi.fn(),
    };
    let parentToken: string | null = null;

    render(createElement(TurnstileWidget, {
      action: TURNSTILE_ACTIONS.post,
      onVerify: (token) => {
        parentToken = token;
      },
      onError: () => {
        parentToken = null;
        callbackOrder.push("clear");
      },
    }));

    const options = renderTurnstile.mock.calls[0][1] as {
      callback: (token: string) => void;
      "expired-callback": () => void;
    };
    options.callback("stale-token");
    expect(parentToken).toBe("stale-token");

    options["expired-callback"]();

    expect(parentToken).toBeNull();
    expect(resetTurnstile).toHaveBeenCalledWith("widget-a");
    expect(callbackOrder).toEqual(["clear", "reset"]);
  });

  it("site key가 비어 있으면 render 없이 onError를 호출한다", () => {
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = " ";
    const renderTurnstile = vi.fn().mockReturnValue("widget-a");
    window.turnstile = {
      render: renderTurnstile,
      reset: vi.fn(),
      remove: vi.fn(),
    };
    const onError = vi.fn();

    render(createElement(TurnstileWidget, {
      action: TURNSTILE_ACTIONS.post,
      onVerify: vi.fn(),
      onError,
    }));

    expect(renderTurnstile).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
