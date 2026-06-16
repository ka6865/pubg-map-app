import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { checkProfanity } from "../lib/board/profanityFilter";
import { extractClientIp, maskIp } from "../lib/board/ipUtils";
import { POST as verifyTurnstile } from "../app/api/board/turnstile/route";

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

describe("Cloudflare Turnstile API 검증 (POST /api/board/turnstile)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("토큰이 누락된 요청의 경우 400 에러를 반환해야 한다", async () => {
    const req = new Request("https://example.com/api/board/turnstile", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await verifyTurnstile(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe("토큰이 없습니다.");
  });

  it("서버에 SECRET KEY 설정이 누락되었을 경우 500 에러를 반환해야 한다", async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    const req = new Request("https://example.com/api/board/turnstile", {
      method: "POST",
      body: JSON.stringify({ token: "test-token" }),
    });
    const res = await verifyTurnstile(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe("서버 설정 오류");
  });

  it("Turnstile 검증이 성공했을 때 success: true를 반환해야 한다", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret-key";

    // fetch mocking
    const mockFetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        json: () => Promise.resolve({ success: true }),
      })
    );
    vi.stubGlobal("fetch", mockFetch);

    const req = new Request("https://example.com/api/board/turnstile", {
      method: "POST",
      body: JSON.stringify({ token: "valid-token" }),
    });

    const res = await verifyTurnstile(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      expect.any(Object)
    );
  });

  it("Turnstile 검증이 실패했을 때 400 에러를 반환해야 한다", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret-key";

    // fetch mocking
    const mockFetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        json: () => Promise.resolve({ success: false, "error-codes": ["invalid-input-response"] }),
      })
    );
    vi.stubGlobal("fetch", mockFetch);

    const req = new Request("https://example.com/api/board/turnstile", {
      method: "POST",
      body: JSON.stringify({ token: "invalid-token" }),
    });

    const res = await verifyTurnstile(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain("보안 인증에 실패했습니다");
  });
});
