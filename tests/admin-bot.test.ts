import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST as adminBotPOST } from "../app/api/admin/bot/run/route";
import { withAuthGuard } from "../utils/supabase/guard";
import { NextResponse } from "next/server";

// 1. Host variables safely before standard imports/mocks using vi.hoisted
const { 
  mockLaunch, 
  mockNewPage, 
  mockGoto, 
  mockSetViewport, 
  mockScreenshot, 
  mockClose 
} = vi.hoisted(() => {
  const mockScreenshot = vi.fn().mockResolvedValue(Buffer.from("dummy-png-data"));
  const mockGoto = vi.fn();
  const mockSetViewport = vi.fn();
  const mockNewPage = vi.fn().mockResolvedValue({
    setViewport: mockSetViewport,
    goto: mockGoto,
    screenshot: mockScreenshot
  });
  const mockClose = vi.fn();
  const mockLaunch = vi.fn().mockResolvedValue({
    newPage: mockNewPage,
    close: mockClose
  });
  return { mockLaunch, mockNewPage, mockGoto, mockSetViewport, mockScreenshot, mockClose };
});

const { 
  mockSendMessage, 
  mockStartChat, 
  mockGetGenerativeModel,
  MockGoogleGenerativeAI
} = vi.hoisted(() => {
  const mockSendMessage = vi.fn();
  const mockStartChat = vi.fn().mockReturnValue({
    sendMessage: mockSendMessage
  });
  const mockGetGenerativeModel = vi.fn().mockReturnValue({
    startChat: mockStartChat
  });

  class MockGoogleGenerativeAI {
    apiKey: string;
    constructor(apiKey: string) {
      this.apiKey = apiKey;
    }
    getGenerativeModel = mockGetGenerativeModel;
  }

  return { mockSendMessage, mockStartChat, mockGetGenerativeModel, MockGoogleGenerativeAI };
});

// 2. Auth Guard Mocking
vi.mock("../utils/supabase/guard", () => ({
  withAuthGuard: vi.fn(),
}));

// 3. Puppeteer Mocking
vi.mock("puppeteer", () => ({
  default: {
    launch: mockLaunch
  }
}));

// 4. Google Generative AI Mocking
vi.mock("@google/generative-ai", () => {
  return {
    GoogleGenerativeAI: MockGoogleGenerativeAI,
    SchemaType: {
      OBJECT: "OBJECT",
      STRING: "STRING"
    },
    HarmCategory: {
      HARM_CATEGORY_HARASSMENT: "HARM_CATEGORY_HARASSMENT",
      HARM_CATEGORY_HATE_SPEECH: "HARM_CATEGORY_HATE_SPEECH"
    },
    HarmBlockThreshold: {
      BLOCK_NONE: "BLOCK_NONE"
    }
  };
});

describe("🤖 Admin AI Bot API Route (E2E Logic Flow Verification)", () => {
  let mockSupabaseAdmin: any;
  let rawChain: any;
  let cacheChain: any;
  let errorChain: any;
  let postChain: any;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_GEMINI_API_KEY = "dummy-gemini-key";

    // DB 쿼리 체인 초기화
    rawChain = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    };

    cacheChain = {
      select: vi.fn().mockResolvedValue({
        data: [{ coaching_style: "친근한 칭찬형" }, { coaching_style: "팩폭 분석형" }],
        error: null
      })
    };

    errorChain = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [{ status: 500, message: "Internal Server Error" }],
        error: null
      })
    };

    postChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: "new-post-123" },
        error: null
      })
    };

    // Storage mock
    const mockStorageList = vi.fn().mockResolvedValue({ data: [{ name: "map-captures" }], error: null });
    const mockStorageUpload = vi.fn().mockResolvedValue({ data: {}, error: null });
    const mockStorageGetUrl = vi.fn().mockReturnValue({ data: { publicUrl: "https://mock.storage/map-captures/miramar.png" } });

    mockSupabaseAdmin = {
      from: vi.fn((table) => {
        if (table === "match_stats_raw") return rawChain;
        if (table === "match_ai_coaching_cache") return cacheChain;
        if (table === "pubg_api_errors") return errorChain;
        if (table === "posts") return postChain;
        return {};
      }),
      storage: {
        listBuckets: mockStorageList,
        from: vi.fn(() => ({
          upload: mockStorageUpload,
          getPublicUrl: mockStorageGetUrl
        }))
      }
    };
  });

  it("1. 어드민이 아닐 경우 401 Unauthorized 에러를 반환해야 함", async () => {
    (withAuthGuard as any).mockResolvedValue({
      error: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 })
    });

    const req = new Request("http://localhost:3000/api/admin/bot/run", {
      method: "POST",
      body: JSON.stringify({ message: "인사하기" })
    });

    const res = await adminBotPOST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain("로그인이 필요합니다");
  });

  it("2. 정상적인 어드민 세션이고 API Key가 존재할 때, Gemini 스트리밍 응답이 반환되어야 함", async () => {
    (withAuthGuard as any).mockResolvedValue({
      user: { id: "admin-id" },
      supabaseAdmin: mockSupabaseAdmin
    });

    // Gemini 응답 모킹
    mockSendMessage.mockResolvedValueOnce({
      response: {
        text: () => "안녕하세요 관리자님. 무엇을 도울까요?",
        functionCalls: () => undefined
      }
    });

    const req = new Request("http://localhost:3000/api/admin/bot/run", {
      method: "POST",
      body: JSON.stringify({ message: "안녕하세요" })
    });

    const res = await adminBotPOST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/x-ndjson");

    // ReadableStream 읽기
    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    let chunks = "";
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks += decoder.decode(value);
      }
    }

    expect(chunks).toContain("chunk");
    expect(chunks).toContain("안녕하세요 관리자님. 무엇을 도울까요?");
  });

  it("3. AI가 'take_map_screenshot' 도구를 실행하도록 유도될 시, Puppeteer 캡처 로직이 가동되어야 함", async () => {
    (withAuthGuard as any).mockResolvedValue({
      user: { id: "admin-id" },
      supabaseAdmin: mockSupabaseAdmin
    });

    // 1차 응답: take_map_screenshot 도구 호출 요청
    mockSendMessage.mockResolvedValueOnce({
      response: {
        text: () => "",
        functionCalls: () => [
          {
            name: "take_map_screenshot",
            args: { mapName: "miramar", layer: "secret_room" }
          }
        ]
      }
    });

    // 2차 응답 (sendMessage(functionResponses) 후): 최종 텍스트 결과
    mockSendMessage.mockResolvedValueOnce({
      response: {
        text: () => "미라마 비밀의 방 지도를 캡처하여 업로드했습니다. [보기](https://mock.storage/map-captures/miramar.png)",
        functionCalls: () => undefined
      }
    });

    const req = new Request("http://localhost:3000/api/admin/bot/run", {
      method: "POST",
      body: JSON.stringify({ message: "미라마 지도 캡처해줘" })
    });

    const res = await adminBotPOST(req);
    expect(res.status).toBe(200);

    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    let chunks = "";
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks += decoder.decode(value);
      }
    }

    // 도구 시작/종료 로그 확인 및 최종 텍스트 덩어리 확인
    expect(chunks).toContain("tool_start");
    expect(chunks).toContain("take_map_screenshot");
    expect(chunks).toContain("tool_end");
    expect(chunks).toContain("miramar.png");
    
    // Puppeteer 및 Storage 호출 확인
    expect(mockLaunch).toHaveBeenCalled();
    expect(mockNewPage).toHaveBeenCalled();
  });
});
