import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST as postsWritePOST } from "../app/api/posts/write/route";
import { withAuthGuard } from "../utils/supabase/guard";
import { NextResponse } from "next/server";

// withAuthGuard 모듈 mock
vi.mock("../utils/supabase/guard", () => ({
  withAuthGuard: vi.fn(),
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
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: [{ id: "new-post-id", title: "My Post" }], error: null }),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { user_id: "user-A", content: "" }, error: null }),
    };

    // supabaseAdmin DB 쿼리 mock 설정
    mockSupabaseAdmin = {
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
    it("1. 비로그인 유저가 접근할 경우 401 Unauthorized 에러를 반환해야 함", async () => {
      // withAuthGuard가 401 NextResponse를 리턴하도록 mock 설정
      (withAuthGuard as any).mockResolvedValue({
        error: NextResponse.json(
          { error: "로그인이 필요합니다. 로그인 후 다시 시도해주세요." },
          { status: 401 }
        ),
      });

      const mockRequest = new Request("http://localhost:3000/api/posts/write", {
        method: "POST",
        body: JSON.stringify({
          title: "Test Title",
          content: "Test Content",
          user_id: "any-user",
        }),
      });

      const response = await postsWritePOST(mockRequest);
      expect(response.status).toBe(401);

      const json = await response.json();
      expect(json.error).toContain("로그인이 필요합니다");
    });

    it("2. 로그인 상태에서 타인의 user_id를 사칭하여 글을 쓰려고 시도할 경우 403 Forbidden을 반환해야 함 (일반 사용자)", async () => {
      // 로그인된 사용자 id = "user-A"
      (withAuthGuard as any).mockResolvedValue({
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
      (withAuthGuard as any).mockResolvedValue({
        user: { id: "user-A", email: "userA@test.com" },
        supabaseAdmin: mockSupabaseAdmin,
      });

      // DB에서 user-A는 "user" 권한을 가졌다고 응답
      profileChain.single.mockResolvedValueOnce({
        data: { role: "user" },
        error: null,
      });

      // 신규 게시글 삽입 결과 mock
      postChain.select.mockResolvedValueOnce({
        data: [{ id: "new-post-id", title: "My Post" }],
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
      expect(json.data.title).toBe("My Post");
    });

    it("4. 관리자(role = admin)는 타인의 user_id로 글을 작성하거나 대리 수정하는 것이 허용되어야 함", async () => {
      // 로그인된 사용자 id = "admin-user"
      (withAuthGuard as any).mockResolvedValue({
        user: { id: "admin-user", email: "admin@test.com" },
        supabaseAdmin: mockSupabaseAdmin,
      });

      // DB에서 admin-user는 "admin" 권한을 가졌다고 응답
      profileChain.single.mockResolvedValueOnce({
        data: { role: "admin" },
        error: null,
      });

      // 신규 게시글 삽입 결과 mock
      postChain.select.mockResolvedValueOnce({
        data: [{ id: "post-id", title: "Admin Edited" }],
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
});
