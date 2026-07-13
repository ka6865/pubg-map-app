import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockCreateSupabaseAdminClient,
  mockWithAuthGuard,
  mockPostsMaybeSingle,
  mockCommentsMaybeSingle,
  mockCommentsInsertSingle,
  mockCommentsInsert
} = vi.hoisted(() => {
  const mockPostsMaybeSingle = vi.fn();
  const mockCommentsMaybeSingle = vi.fn();
  const mockCommentsInsertSingle = vi.fn();
  const mockCommentsEq = vi.fn();
  const mockCommentsGte = vi.fn();
  const mockCommentsLimit = vi.fn();
  const mockCommentsOrder = vi.fn();
  const mockCommentsSelect = vi.fn();
  const mockPostsSelect = vi.fn();
  const mockPostsOrder = vi.fn();
  const mockPostsLimit = vi.fn();
  const mockPostsOr = vi.fn();

  const postsChain: any = {
    select: mockPostsSelect,
    eq: vi.fn(() => postsChain),
    order: mockPostsOrder,
    limit: mockPostsLimit,
    or: mockPostsOr,
    maybeSingle: mockPostsMaybeSingle
  };
  mockPostsSelect.mockReturnValue(postsChain);
  mockPostsOrder.mockReturnValue(postsChain);
  mockPostsLimit.mockResolvedValue({
    data: [
      { id: 20, title: "공지", author: "Admin", user_id: null, category: "공지", image_url: null, is_notice: true, created_at: "2026-01-02T00:00:00.000Z", views: 1, likes: 0, comments: [{ count: 0 }] },
      { id: 19, title: "일반", author: "User", user_id: null, category: "자유", image_url: null, is_notice: false, created_at: "2026-01-01T00:00:00.000Z", views: 1, likes: 0, comments: [{ count: 0 }] }
    ],
    error: null
  });
  mockPostsOr.mockReturnValue(postsChain);

  const commentsSelectChain: any = {
    eq: mockCommentsEq,
    gte: mockCommentsGte,
    order: mockCommentsOrder,
    limit: mockCommentsLimit,
    maybeSingle: mockCommentsMaybeSingle
  };
  mockCommentsSelect.mockReturnValue(commentsSelectChain);
  mockCommentsEq.mockReturnValue(commentsSelectChain);
  mockCommentsGte.mockReturnValue(commentsSelectChain);
  mockCommentsOrder.mockReturnValue(commentsSelectChain);
  mockCommentsLimit.mockReturnValue(commentsSelectChain);

  const mockCommentsInsert = vi.fn(() => ({
    select: vi.fn(() => ({
      single: mockCommentsInsertSingle
    }))
  }));

  const commentsTable = {
    select: mockCommentsSelect,
    insert: mockCommentsInsert
  };

  const mockCreateSupabaseAdminClient = vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === "posts") return postsChain;
      if (table === "comments") return commentsTable;
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { nickname: "Tester" }, error: null })
        };
      }
      if (table === "ip_blacklist") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
        };
      }
      return {};
    })
  }));

  const mockWithAuthGuard = vi.fn().mockResolvedValue({
    user: { id: "user-1", email: "user@example.com" },
    supabaseAdmin: mockCreateSupabaseAdminClient()
  });

  return {
    mockCreateSupabaseAdminClient,
    mockWithAuthGuard,
    mockPostsMaybeSingle,
    mockCommentsMaybeSingle,
    mockCommentsInsertSingle,
    mockCommentsInsert
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: mockCreateSupabaseAdminClient
}));

vi.mock("@/utils/supabase/guard", () => ({
  withAuthGuard: mockWithAuthGuard
}));

vi.mock("@/lib/board/ipUtils", () => ({
  extractClientIp: vi.fn(() => "127.0.0.1"),
  checkIpBlacklist: vi.fn().mockResolvedValue(false)
}));

vi.mock("@/lib/board/profanityFilter", () => ({
  checkProfanity: vi.fn(() => ({ blocked: false }))
}));

import { GET as listPostsGET } from "../app/api/mobile/board/posts/route";
import { GET as detailPostGET } from "../app/api/mobile/board/posts/[postId]/route";
import { POST as createCommentPOST } from "../app/api/mobile/board/posts/[postId]/comments/route";

describe("mobile board API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    mockPostsMaybeSingle.mockResolvedValue({ data: { id: 10, status: "published" }, error: null });
    mockCommentsMaybeSingle.mockResolvedValue({ data: { id: 5, post_id: 10 }, error: null });
    mockCommentsInsertSingle.mockResolvedValue({ data: { id: 99 }, error: null });
  });

  it("댓글 parent_id가 같은 게시글 댓글이 아니면 저장하지 않는다", async () => {
    mockCommentsMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const response = await createCommentPOST(
      new Request("https://bgms.test/api/mobile/board/posts/10/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "reply", parent_id: 5 })
      }),
      { params: Promise.resolve({ postId: "10" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("부모 댓글");
    expect(mockCommentsInsert).not.toHaveBeenCalled();
  });

  it("목록 nextCursor는 공지 여부와 id를 포함한 복합 커서로 반환한다", async () => {
    const response = await listPostsGET(new Request("https://bgms.test/api/mobile/board/posts?limit=1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.hasMore).toBe(true);
    expect(JSON.parse(Buffer.from(body.nextCursor, "base64url").toString("utf8"))).toEqual({
      isNotice: true,
      createdAt: "2026-01-02T00:00:00.000Z",
      id: 20
    });
  });

  it("모바일 게시글 목록은 60초 CDN 캐시 헤더를 반환한다", async () => {
    const response = await listPostsGET(new Request("https://bgms.test/api/mobile/board/posts?limit=1"));

    expect(response.headers.get("Cache-Control")).toBe("public, s-maxage=60, stale-while-revalidate=180");
  });

  it("모바일 게시글 상세는 짧은 CDN 캐시 헤더를 반환한다", async () => {
    mockPostsMaybeSingle.mockResolvedValueOnce({
      data: {
        id: 10,
        title: "테스트 글",
        content: "본문",
        author: "Tester",
        user_id: "user-1",
        category: "자유",
        image_url: null,
        is_notice: false,
        created_at: "2026-01-01T00:00:00.000Z",
        views: 1,
        likes: 0,
        status: "published",
        profiles: { nickname: "Tester" }
      },
      error: null
    });

    const response = await detailPostGET(
      new Request("https://bgms.test/api/mobile/board/posts/10"),
      { params: Promise.resolve({ postId: "10" }) }
    );

    expect(response.headers.get("Cache-Control")).toBe("public, s-maxage=30, stale-while-revalidate=120");
  });

  it("refresh=1 상세 요청은 작성 직후 최신 조회를 위해 캐시하지 않는다", async () => {
    mockPostsMaybeSingle.mockResolvedValueOnce({
      data: {
        id: 10,
        title: "테스트 글",
        content: "본문",
        author: "Tester",
        user_id: "user-1",
        category: "자유",
        image_url: null,
        is_notice: false,
        created_at: "2026-01-01T00:00:00.000Z",
        views: 1,
        likes: 0,
        status: "published",
        profiles: { nickname: "Tester" }
      },
      error: null
    });

    const response = await detailPostGET(
      new Request("https://bgms.test/api/mobile/board/posts/10?refresh=1"),
      { params: Promise.resolve({ postId: "10" }) }
    );

    expect(response.headers.get("Cache-Control")).toBe("no-store, max-age=0, must-revalidate");
  });
});
