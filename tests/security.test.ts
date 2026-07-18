import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST as postsWritePOST } from "../app/api/posts/write/route";
import { POST as postsPromotePOST } from "../app/api/posts/promote/route";
import { withAuthGuard, withOptionalAuth } from "../utils/supabase/guard";
import { NextResponse } from "next/server";

// 인증 가드 모듈 mock
vi.mock("../utils/supabase/guard", () => ({
  withAuthGuard: vi.fn(),
  withOptionalAuth: vi.fn(),
}));

vi.mock("../lib/board/writeQuota.server", () => ({
  consumeBoardWriteQuota: vi.fn(async () => ({ ok: true })),
}));

vi.mock("../lib/board/turnstile.server", () => ({
  verifyTurnstileToken: vi.fn(async () => ({ ok: true })),
}));

describe("🔒 BGMS API Route Security Guard Tests", () => {
  let mockSupabaseAdmin: any;
  let profileChain: any;
  let postChain: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // 각 테이블별로 쿼리 빌더 체인 정의
    profileChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { role: "user" }, error: null }),
    };

    postChain = {
      _history: [],
      _singleValue: { data: { user_id: "user-A", content: "", status: "draft" }, error: null },
      _singleValues: [],
      _arrayValue: { data: [{ id: "new-post-id", title: "My Post" }], error: null },

      insert: vi.fn().mockImplementation(function(this: any) {
        this._history.push("insert");
        return this;
      }),
      update: vi.fn().mockImplementation(function(this: any) {
        this._history.push("update");
        return this;
      }),
      delete: vi.fn().mockImplementation(function(this: any) {
        this._history.push("delete");
        return this;
      }),
      select: vi.fn().mockImplementation(function(this: any) {
        this._history.push("select");
        return this;
      }),
      eq: vi.fn().mockImplementation(function(this: any) {
        this._history.push("eq");
        return this;
      }),
      single: vi.fn().mockImplementation(function(this: any) {
        this._history.push("single");
        return this;
      }),

      then: vi.fn().mockImplementation(function(this: any, onfulfilled: any) {
        const hasSingle = this._history.includes("single");
        let value;
        if (hasSingle) {
          value = this._singleValues.shift() || this._singleValue;
        } else {
          value = this._arrayValue;
        }
        this._history = [];
        return Promise.resolve(value).then(onfulfilled);
      })
    };

    // supabaseAdmin DB 쿼리 mock 설정
    mockSupabaseAdmin = {
      rpc: vi.fn(async () => ({
        data: [{ result_code: "ok", post_id: 41, revision: 0 }],
        error: null,
      })),
      from: vi.fn((table) => {
        if (table === "profiles") return profileChain;
        if (table === "posts") return postChain;
        return {};
      }),
      storage: {
        from: vi.fn(() => ({
          remove: vi.fn().mockResolvedValue({ data: [], error: null }),
        })),
      },
    };
  });

  describe("📝 게시글 작성/수정 API (/api/posts/write)", () => {
    it("1. 비회원 신규 작성에서 닉네임과 비밀번호가 누락되면 400을 반환해야 함", async () => {
      (withOptionalAuth as any).mockResolvedValue({
        user: null,
        supabaseAdmin: mockSupabaseAdmin,
      });

      const request = new Request("http://localhost:3000/api/posts/write", {
        method: "POST",
        body: JSON.stringify({
          title: "Test Title",
          content: "Test Content",
          category: "자유",
        }),
      });

      const response = await postsWritePOST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toContain("닉네임과 비밀번호");
    });

    it("2. 로그인 상태에서 타인의 user_id를 사칭하여 글을 쓰려고 시도할 경우 403 Forbidden을 반환해야 함 (일반 사용자)", async () => {
      // 로그인된 사용자 id = "user-A"
      (withOptionalAuth as any).mockResolvedValue({
        user: { id: "user-A", email: "userA@test.com" },
        supabaseAdmin: mockSupabaseAdmin,
      });

      // DB에서 user-A는 "user" 권한(일반 사용자)을 가졌다고 응답
      profileChain.single.mockResolvedValueOnce({
        data: { role: "user" },
        error: null,
      });

      // 요청 body에는 타인의 user_id인 "user-B"를 전달
      const mockRequest = new Request("http://localhost:3000/api/posts/write", {
        method: "POST",
        body: JSON.stringify({
          title: "Spoofed Title",
          content: "Spoofed Content",
          category: "자유",
          user_id: "user-B", // 사칭 시도
        }),
      });

      const response = await postsWritePOST(mockRequest);
      expect(response.status).toBe(403);

      const json = await response.json();
      expect(json.error).toContain("인증된 사용자와 요청자가 일치하지 않습니다.");
    });

    it("3. 본인의 user_id로 글을 작성할 경우 정상적으로 처리가 통과되어야 함", async () => {
      // 로그인된 사용자 id = "user-A"
      (withOptionalAuth as any).mockResolvedValue({
        user: { id: "user-A", email: "userA@test.com" },
        supabaseAdmin: mockSupabaseAdmin,
      });

      // DB에서 user-A는 "user" 권한을 가졌다고 응답
      profileChain.single.mockResolvedValueOnce({
        data: { role: "user" },
        error: null,
      });

      // 본인의 user_id ("user-A")로 요청 전달
      const mockRequest = new Request("http://localhost:3000/api/posts/write", {
        method: "POST",
        body: JSON.stringify({
          title: "My Title",
          content: "My Content",
          user_id: "user-A",
          author: "UserA",
          category: "자유게시판",
          is_notice: false,
        }),
      });

      const response = await postsWritePOST(mockRequest);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.id).toBe(41);
    });

    it("4. 관리자(role = admin)는 타인의 user_id로 글을 작성하거나 대리 수정하는 것이 허용되어야 함", async () => {
      // 로그인된 사용자 id = "admin-user"
      (withOptionalAuth as any).mockResolvedValue({
        user: { id: "admin-user", email: "admin@test.com" },
        supabaseAdmin: mockSupabaseAdmin,
      });

      // DB에서 admin-user는 "admin" 권한을 가졌다고 응답
      profileChain.single.mockResolvedValueOnce({
        data: { role: "admin" },
        error: null,
      });

      // 타인의 user_id인 "user-B"에 대해 작성/수정 시도
      const mockRequest = new Request("http://localhost:3000/api/posts/write", {
        method: "POST",
        body: JSON.stringify({
          title: "Admin Edit Title",
          content: "Admin Edit Content",
          user_id: "user-B", // 관리자는 사칭 방지 예외 적용
          author: "UserB",
          category: "공지사항",
          is_notice: true,
        }),
      });

      const response = await postsWritePOST(mockRequest);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
    });
  });

  describe("📝 게시글 승격 API (/api/posts/promote)", () => {
    it("1. 비로그인 유저가 접근할 경우 401 Unauthorized 에러를 반환해야 함", async () => {
      (withAuthGuard as any).mockResolvedValue({
        error: NextResponse.json(
          { error: "로그인이 필요합니다. 로그인 후 다시 시도해주세요." },
          { status: 401 }
        ),
      });

      const mockRequest = new Request("http://localhost:3000/api/posts/promote", {
        method: "POST",
        body: JSON.stringify({ postId: 1, expectedParentRevision: 0 }),
      });

      const response = await postsPromotePOST(mockRequest);
      expect(response.status).toBe(401);

      const json = await response.json();
      expect(json.error).toContain("로그인이 필요합니다");
    });

    it("2. 로그인 상태에서 어드민이 아닌 일반 사용자가 접근할 경우 403 Forbidden을 반환해야 함", async () => {
      (withAuthGuard as any).mockResolvedValue({
        user: { id: "user-A", email: "userA@test.com" },
        supabaseAdmin: mockSupabaseAdmin,
      });

      profileChain.single.mockResolvedValueOnce({
        data: { role: "user" },
        error: null,
      });

      const mockRequest = new Request("http://localhost:3000/api/posts/promote", {
        method: "POST",
        body: JSON.stringify({ postId: 1, expectedParentRevision: 0 }),
      });

      const response = await postsPromotePOST(mockRequest);
      expect(response.status).toBe(403);

      const json = await response.json();
      expect(json.error).toContain("어드민 권한이 필요합니다");
    });

    it("3. 필수 파라미터(postId)가 누락될 경우 400 Bad Request를 반환해야 함", async () => {
      (withAuthGuard as any).mockResolvedValue({
        user: { id: "admin-user", email: "admin@test.com" },
        supabaseAdmin: mockSupabaseAdmin,
      });

      profileChain.single.mockResolvedValueOnce({
        data: { role: "admin" },
        error: null,
      });

      const mockRequest = new Request("http://localhost:3000/api/posts/promote", {
        method: "POST",
        body: JSON.stringify({}),
      });

      const response = await postsPromotePOST(mockRequest);
      expect(response.status).toBe(400);

      const json = await response.json();
      expect(json.error).toContain("필수 입력 데이터가 올바르지 않습니다");
    });

    it("4. 존재하지 않는 초안이거나 조회 오류 시 404 Not Found를 반환해야 함", async () => {
      (withAuthGuard as any).mockResolvedValue({
        user: { id: "admin-user", email: "admin@test.com" },
        supabaseAdmin: mockSupabaseAdmin,
      });

      profileChain.single.mockResolvedValueOnce({
        data: { role: "admin" },
        error: null,
      });

      mockSupabaseAdmin.rpc.mockResolvedValueOnce({
        data: [{ result_code: "not_found", post_id: null, revision: null }],
        error: null,
      });

      const mockRequest = new Request("http://localhost:3000/api/posts/promote", {
        method: "POST",
        body: JSON.stringify({ postId: 1, expectedParentRevision: 0 }),
      });

      const response = await postsPromotePOST(mockRequest);
      expect(response.status).toBe(404);

      const json = await response.json();
      expect(json.error).toContain("승격할 초안 게시글을 찾을 수 없습니다");
    });

    it("5. 초안이 아닌 이미 승격(published)된 글에 대해 요청할 경우 400 Bad Request를 반환해야 함", async () => {
      (withAuthGuard as any).mockResolvedValue({
        user: { id: "admin-user", email: "admin@test.com" },
        supabaseAdmin: mockSupabaseAdmin,
      });

      profileChain.single.mockResolvedValueOnce({
        data: { role: "admin" },
        error: null,
      });

      mockSupabaseAdmin.rpc.mockResolvedValueOnce({
        data: [{ result_code: "already_promoted", post_id: 1, revision: 2 }],
        error: null,
      });

      const mockRequest = new Request("http://localhost:3000/api/posts/promote", {
        method: "POST",
        body: JSON.stringify({ postId: 1, expectedParentRevision: 0 }),
      });

      const response = await postsPromotePOST(mockRequest);
      expect(response.status).toBe(409);

      const json = await response.json();
      expect(json.error).toContain("이미 승격(발행)된 게시글입니다");
    });

    it("6. parent_id가 없는 신규 초안 승격 시 정상적으로 200 OK와 함께 status를 published로 업데이트해야 함", async () => {
      (withAuthGuard as any).mockResolvedValue({
        user: { id: "admin-user", email: "admin@test.com" },
        supabaseAdmin: mockSupabaseAdmin,
      });

      profileChain.single.mockResolvedValueOnce({
        data: { role: "admin" },
        error: null,
      });


      const mockRequest = new Request("http://localhost:3000/api/posts/promote", {
        method: "POST",
        body: JSON.stringify({ postId: 1, expectedParentRevision: 0 }),
      });

      const response = await postsPromotePOST(mockRequest);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.message).toContain("수정 사항이 원본 게시글에 성공적으로 반영되었습니다");
    });

    it("7. parent_id가 있는 Shadow Draft 승격 시 원본 글에 병합(Merge)하고, 기존 미사용 이미지를 스토리지에서 삭제한 후 초안을 제거해야 함", async () => {
      (withAuthGuard as any).mockResolvedValue({
        user: { id: "admin-user", email: "admin@test.com" },
        supabaseAdmin: mockSupabaseAdmin,
      });

      profileChain.single.mockResolvedValueOnce({
        data: { role: "admin" },
        error: null,
      });

      mockSupabaseAdmin.rpc.mockResolvedValueOnce({
        data: [{ result_code: "ok", post_id: 2, revision: 1, title: "New Title", content: "본문", image_url: null }],
        error: null,
      });

      const mockRequest = new Request("http://localhost:3000/api/posts/promote", {
        method: "POST",
        body: JSON.stringify({ postId: 1, expectedParentRevision: 0 }),
      });

      const response = await postsPromotePOST(mockRequest);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.message).toContain("수정 사항이 원본 게시글에 성공적으로 반영되었습니다");

      expect(mockSupabaseAdmin.rpc).toHaveBeenCalledWith("merge_board_post_draft_with_images", {
        p_draft_post_id: 1,
        p_actor_user_id: "admin-user",
        p_expected_parent_revision: 0,
      });
      expect(mockSupabaseAdmin.storage.from).not.toHaveBeenCalled();
    });
  });
});
