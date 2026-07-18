import { readFileSync } from "node:fs";
import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockCreateSupabaseAdminClient,
  mockWithAuthGuard,
  mockPostsMaybeSingle,
  mockCommentsMaybeSingle,
  mockCommentsInsertSingle,
  mockCommentsInsert,
  mockConsumeBoardWriteQuota,
  mockPostsInsertSingle,
  mockCreatePublishedPostComment
} = vi.hoisted(() => {
  const mockPostsMaybeSingle = vi.fn();
  const mockCommentsMaybeSingle = vi.fn();
  const mockCommentsInsertSingle = vi.fn();
  const mockConsumeBoardWriteQuota = vi.fn();
  const mockCommentsEq = vi.fn();
  const mockCommentsGte = vi.fn();
  const mockCommentsLimit = vi.fn();
  const mockCommentsOrder = vi.fn();
  const mockCommentsSelect = vi.fn();
  const mockPostsSelect = vi.fn();
  const mockPostsOrder = vi.fn();
  const mockPostsLimit = vi.fn();
  const mockPostsOr = vi.fn();
  const mockPostsInsertSingle = vi.fn();
  const mockCreatePublishedPostComment = vi.fn();
  const mockPostsInsert = vi.fn(() => ({
    select: vi.fn(() => ({ single: mockPostsInsertSingle }))
  }));

  const postsChain: any = {
    select: mockPostsSelect,
    eq: vi.fn(() => postsChain),
    order: mockPostsOrder,
    limit: mockPostsLimit,
    or: mockPostsOr,
    maybeSingle: mockPostsMaybeSingle,
    insert: mockPostsInsert
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
    rpc: mockCreatePublishedPostComment,
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
    mockCommentsInsert,
    mockConsumeBoardWriteQuota,
    mockPostsInsertSingle,
    mockCreatePublishedPostComment
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

vi.mock("@/lib/board/writeQuota.server", () => ({
  consumeBoardWriteQuota: mockConsumeBoardWriteQuota
}));

import { GET as listPostsGET, POST as createPostPOST } from "../app/api/mobile/board/posts/route";
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
    mockCreatePublishedPostComment.mockResolvedValue({
      data: [{
        id: 99,
        post_id: 10,
        user_id: "user-1",
        author: "Tester",
        content: "댓글",
        parent_id: null,
        created_at: "2026-07-19T00:00:00.000Z",
      }],
      error: null,
    });
    mockPostsInsertSingle.mockResolvedValue({ data: { id: 98 }, error: null });
    mockConsumeBoardWriteQuota.mockResolvedValue({ ok: true });
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

  it("모바일 게시글은 조회 기반 제한 없이 회원 actor로 원자 quota를 소비한다", async () => {
    const response = await createPostPOST(new Request("https://bgms.test/api/mobile/board/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "제목", content: "본문", category: "free" })
    }));

    expect(response.status).toBe(200);
    expect(mockConsumeBoardWriteQuota).toHaveBeenCalledWith({
      supabaseAdmin: expect.anything(), scope: "post", actor: "user-1"
    });
  });

  it("모바일 댓글은 조회 기반 제한 없이 회원 actor로 원자 quota를 소비한다", async () => {
    const response = await createCommentPOST(
      new Request("https://bgms.test/api/mobile/board/posts/10/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "댓글" })
      }),
      { params: Promise.resolve({ postId: "10" }) }
    );

    expect(response.status).toBe(200);
    expect(mockConsumeBoardWriteQuota).toHaveBeenCalledWith({
      supabaseAdmin: expect.anything(), scope: "comment", actor: "user-1"
    });
  });

  it("모바일 댓글은 원자 RPC에만 저장하고 서버 전용 필드를 응답하지 않는다", async () => {
    const response = await createCommentPOST(
      new Request("https://bgms.test/api/mobile/board/posts/10/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "댓글", parent_id: 5 }),
      }),
      { params: Promise.resolve({ postId: "10" }) },
    );
    const payload = JSON.stringify(await response.json());

    expect(response.status).toBe(200);
    expect(mockCreatePublishedPostComment).toHaveBeenCalledWith(
      "create_published_post_comment",
      expect.objectContaining({
        p_post_id: 10,
        p_user_id: "user-1",
        p_content: "댓글",
        p_parent_id: 5,
        p_password_hash: null,
        p_ip_address: "127.0.0.1",
      }),
    );
    expect(mockCommentsInsert).not.toHaveBeenCalled();
    expect(payload).not.toContain("password_hash");
    expect(payload).not.toContain("ip_address");
  });

  it("댓글 RPC migration은 부모 댓글 행에 FOR SHARE 잠금을 사용한다", () => {
    const migration = readFileSync(
      new URL("../supabase/migrations/20260719000000_create_published_post_comment.sql", import.meta.url),
      "utf8",
    );

    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.create_published_post_comment");
    expect(migration).toMatch(/comments\.post_id = p_post_id\s+FOR SHARE;/);
    expect(migration).not.toContain("FOR KEY SHARE");
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
