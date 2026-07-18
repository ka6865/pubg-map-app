import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withOptionalAuth: vi.fn(),
  extractClientIp: vi.fn(() => "203.0.113.10"),
  checkIpBlacklist: vi.fn(async () => false),
  checkProfanity: vi.fn((value: string) => {
    void value;
    return { blocked: false };
  }),
  consumeQuota: vi.fn(),
  verifyTurnstile: vi.fn(),
  hash: vi.fn(async () => "password-hash"),
}));

vi.mock("../utils/supabase/guard", () => ({
  withOptionalAuth: mocks.withOptionalAuth,
}));

vi.mock("../lib/board/ipUtils", () => ({
  extractClientIp: mocks.extractClientIp,
  checkIpBlacklist: mocks.checkIpBlacklist,
}));

vi.mock("../lib/board/profanityFilter", () => ({
  checkProfanity: mocks.checkProfanity,
}));

vi.mock("../lib/board/writeQuota.server", () => ({
  consumeBoardWriteQuota: mocks.consumeQuota,
}));

vi.mock("../lib/board/turnstile.server", () => ({
  verifyTurnstileToken: mocks.verifyTurnstile,
}));

vi.mock("bcryptjs", () => ({
  default: {
    hash: mocks.hash,
  },
}));

import { POST as commentsPOST } from "../app/api/board/comments/route";

type AdminOptions = {
  profile?: { nickname: string | null } | null;
  profileError?: unknown;
  parent?: {
    id: number;
    user_id: string | null;
    author: string;
    content: string;
    post_id: number;
  } | null;
  parentError?: unknown;
  post?: { user_id: string | null; title: string } | null;
  postError?: unknown;
  commentError?: unknown;
  notificationError?: unknown;
};

function createAdmin(options: AdminOptions = {}) {
  const profileSingle = vi.fn(async () => ({
    data: options.profile === undefined ? { nickname: "서버닉네임" } : options.profile,
    error: options.profileError ?? null,
  }));
  const parentSingle = vi.fn(async () => ({
    data: options.parent === undefined
      ? {
          id: 15,
          user_id: "parent-user",
          author: "부모작성자",
          content: "부모 댓글",
          post_id: 7,
        }
      : options.parent,
    error: options.parentError ?? null,
  }));
  const postSingle = vi.fn(async () => ({
    data: options.post === undefined
      ? { user_id: "post-owner", title: "게시글 제목" }
      : options.post,
    error: options.postError ?? null,
  }));
  const commentSingle = vi.fn(async () => ({
    data: options.commentError ? null : { id: 91, post_id: 7, content: "댓글" },
    error: options.commentError ?? null,
  }));
  const insertComment = vi.fn(() => ({
    select: vi.fn(() => ({ single: commentSingle })),
  }));
  const insertNotification = vi.fn(async () => ({
    error: options.notificationError ?? null,
  }));

  const supabaseAdmin = {
    rpc: vi.fn(),
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ single: profileSingle })),
          })),
        };
      }
      if (table === "comments") {
        return {
          insert: insertComment,
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: parentSingle,
              maybeSingle: parentSingle,
            })),
          })),
        };
      }
      if (table === "posts") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ single: postSingle })),
          })),
        };
      }
      if (table === "notifications") {
        return { insert: insertNotification };
      }
      throw new Error(`unexpected table: ${table}`);
    }),
  };

  return {
    supabaseAdmin,
    insertComment,
    insertNotification,
    profileSingle,
    parentSingle,
    postSingle,
  };
}

function makeCommentRequest(overrides: Record<string, unknown> = {}) {
  return new Request("https://bgms.test/api/board/comments", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.10, 198.51.100.20",
    },
    body: JSON.stringify({
      post_id: 7,
      content: "댓글 내용",
      parent_id: null,
      author: "비회원",
      password: "password",
      turnstileToken: "valid-token",
      ...overrides,
    }),
  });
}

describe("댓글 Turnstile 저장 경계", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.extractClientIp.mockReturnValue("203.0.113.10");
    mocks.checkIpBlacklist.mockResolvedValue(false);
    mocks.checkProfanity.mockReturnValue({ blocked: false });
    mocks.consumeQuota.mockResolvedValue({ ok: true });
    mocks.verifyTurnstile.mockResolvedValue({ ok: true });
    mocks.hash.mockResolvedValue("password-hash");
  });

  it("잘못된 JSON은 인증과 quota 전에 400으로 거부한다", async () => {
    const response = await commentsPOST(new Request("https://bgms.test/api/board/comments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    }));

    expect(response.status).toBe(400);
    expect(mocks.withOptionalAuth).not.toHaveBeenCalled();
    expect(mocks.consumeQuota).not.toHaveBeenCalled();
  });

  it.each([
    ["게시글 ID 문자열", { post_id: "7" }],
    ["게시글 ID 0", { post_id: 0 }],
    ["본문 객체", { content: { text: "댓글" } }],
    ["빈 본문", { content: "   " }],
    ["본문 5,000자 초과", { content: "댓".repeat(5001) }],
    ["부모 ID 문자열", { parent_id: "1" }],
    ["부모 ID 음수", { parent_id: -1 }],
    ["작성자 객체", { author: { name: "닉네임" } }],
    ["작성자 공백", { author: "   " }],
    ["작성자 20자 초과", { author: "닉".repeat(21) }],
    ["비밀번호 배열", { password: ["password"] }],
    ["비밀번호 4자 미만", { password: "abc" }],
    ["비밀번호 공백", { password: "    " }],
    ["비밀번호 20자 초과", { password: "p".repeat(21) }],
    ["토큰 객체", { turnstileToken: { token: "token" } }],
    ["토큰 공백", { turnstileToken: "   " }],
    ["토큰 2,048자 초과", { turnstileToken: "t".repeat(2049) }],
    ["위조 user_id 객체", { user_id: { id: "victim" } }],
  ])("%s payload는 인증·quota·Siteverify·bcrypt·DB 전에 400으로 거부한다", async (_name, overrides) => {
    const admin = createAdmin();
    mocks.withOptionalAuth.mockResolvedValue({ user: null, supabaseAdmin: admin.supabaseAdmin });

    const response = await commentsPOST(makeCommentRequest(overrides));

    expect(response.status).toBe(400);
    expect(mocks.withOptionalAuth).not.toHaveBeenCalled();
    expect(mocks.consumeQuota).not.toHaveBeenCalled();
    expect(mocks.verifyTurnstile).not.toHaveBeenCalled();
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(admin.insertComment).not.toHaveBeenCalled();
  });

  it("guest comment는 token 없이 quota·Siteverify·bcrypt·insert를 호출하지 않는다", async () => {
    const admin = createAdmin();
    mocks.withOptionalAuth.mockResolvedValue({ user: null, supabaseAdmin: admin.supabaseAdmin });

    const response = await commentsPOST(makeCommentRequest({ turnstileToken: undefined }));

    expect(response.status).toBe(400);
    expect(mocks.consumeQuota).not.toHaveBeenCalled();
    expect(mocks.verifyTurnstile).not.toHaveBeenCalled();
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(admin.insertComment).not.toHaveBeenCalled();
  });

  it("guest는 IP quota 다음 guest_comment Siteverify와 bcrypt를 거쳐 insert한다", async () => {
    const admin = createAdmin();
    mocks.withOptionalAuth.mockResolvedValue({ user: null, supabaseAdmin: admin.supabaseAdmin });

    const response = await commentsPOST(makeCommentRequest());

    expect(response.status).toBe(200);
    expect(mocks.consumeQuota).toHaveBeenCalledWith({
      supabaseAdmin: admin.supabaseAdmin,
      scope: "comment",
      actor: "203.0.113.10",
    });
    expect(mocks.verifyTurnstile).toHaveBeenCalledWith({
      token: "valid-token",
      remoteIp: "203.0.113.10",
      expectedAction: "guest_comment",
    });
    expect(mocks.hash).toHaveBeenCalledWith("password", 10);
    expect(admin.insertComment).toHaveBeenCalledWith([expect.objectContaining({
      post_id: 7,
      user_id: null,
      author: "비회원",
      password_hash: "password-hash",
      ip_address: "203.0.113.10",
    })]);
    expect(mocks.consumeQuota.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.verifyTurnstile.mock.invocationCallOrder[0],
    );
    expect(mocks.verifyTurnstile.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.hash.mock.invocationCallOrder[0],
    );
  });

  it.each([
    [{ ok: false, status: 429, error: "댓글은 10초에 한 번만 작성할 수 있습니다." }, 429],
    [{ ok: false, status: 503, error: "게시판 요청 제한을 확인하지 못했습니다." }, 503],
  ] as const)("quota·RPC 거부를 고정 상태로 fail-closed 처리한다", async (quotaResult, status) => {
    const admin = createAdmin();
    mocks.withOptionalAuth.mockResolvedValue({ user: null, supabaseAdmin: admin.supabaseAdmin });
    mocks.consumeQuota.mockResolvedValue(quotaResult);

    const response = await commentsPOST(makeCommentRequest());

    expect(response.status).toBe(status);
    expect(mocks.verifyTurnstile).not.toHaveBeenCalled();
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(admin.insertComment).not.toHaveBeenCalled();
  });

  it("Turnstile 거부 시 외부 오류와 token을 노출하지 않고 저장을 중단한다", async () => {
    const admin = createAdmin();
    mocks.withOptionalAuth.mockResolvedValue({ user: null, supabaseAdmin: admin.supabaseAdmin });
    mocks.verifyTurnstile.mockResolvedValue({
      ok: false,
      status: 503,
      error: "보안 인증 서버에 연결하지 못했습니다.",
    });

    const response = await commentsPOST(makeCommentRequest({ turnstileToken: "raw-secret-token" }));
    const payload = JSON.stringify(await response.json());

    expect(response.status).toBe(503);
    expect(payload).not.toContain("raw-secret-token");
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(admin.insertComment).not.toHaveBeenCalled();
  });

  it("guest 본문 비속어는 bcrypt와 insert 전에 거부한다", async () => {
    const admin = createAdmin();
    mocks.withOptionalAuth.mockResolvedValue({ user: null, supabaseAdmin: admin.supabaseAdmin });
    mocks.checkProfanity.mockImplementation((value: string) => ({
      blocked: value === "차단 본문",
    }));

    const response = await commentsPOST(makeCommentRequest({ content: "차단 본문" }));

    expect(response.status).toBe(400);
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(admin.insertComment).not.toHaveBeenCalled();
  });

  it("cross-post parent는 quota·Siteverify 후 bcrypt·insert·notification 전에 400으로 거부한다", async () => {
    const admin = createAdmin({
      parent: {
        id: 15,
        user_id: "other-owner",
        author: "다른글작성자",
        content: "다른 게시글 댓글",
        post_id: 999,
      },
    });
    mocks.withOptionalAuth.mockResolvedValue({ user: null, supabaseAdmin: admin.supabaseAdmin });

    const response = await commentsPOST(makeCommentRequest({ parent_id: 15 }));

    expect(response.status).toBe(400);
    expect(mocks.consumeQuota).toHaveBeenCalledOnce();
    expect(mocks.verifyTurnstile).toHaveBeenCalledOnce();
    expect(admin.parentSingle).toHaveBeenCalledOnce();
    expect(mocks.consumeQuota.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.verifyTurnstile.mock.invocationCallOrder[0],
    );
    expect(mocks.verifyTurnstile.mock.invocationCallOrder[0]).toBeLessThan(
      admin.parentSingle.mock.invocationCallOrder[0],
    );
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(admin.insertComment).not.toHaveBeenCalled();
    expect(admin.insertNotification).not.toHaveBeenCalled();
  });

  it("parent 댓글이 없으면 insert 전에 고정 404를 반환한다", async () => {
    const admin = createAdmin({ parent: null });
    mocks.withOptionalAuth.mockResolvedValue({ user: null, supabaseAdmin: admin.supabaseAdmin });

    const response = await commentsPOST(makeCommentRequest({ parent_id: 15 }));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "부모 댓글을 찾을 수 없습니다." });
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(admin.insertComment).not.toHaveBeenCalled();
  });

  it("parent 조회 오류는 원본 오류를 노출하지 않고 insert 전 503으로 fail-closed 처리한다", async () => {
    const admin = createAdmin({
      parent: null,
      parentError: { message: "raw parent lookup failure" },
    });
    mocks.withOptionalAuth.mockResolvedValue({ user: null, supabaseAdmin: admin.supabaseAdmin });

    const response = await commentsPOST(makeCommentRequest({ parent_id: 15 }));
    const payload = JSON.stringify(await response.json());

    expect(response.status).toBe(503);
    expect(payload).not.toContain("raw parent lookup failure");
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(admin.insertComment).not.toHaveBeenCalled();
  });

  it("회원은 user quota와 서버 profile 닉네임을 사용하고 게시글 작성자 알림을 유지한다", async () => {
    const admin = createAdmin();
    mocks.withOptionalAuth.mockResolvedValue({
      user: { id: "member-a" },
      supabaseAdmin: admin.supabaseAdmin,
    });

    const response = await commentsPOST(makeCommentRequest({
      author: "spoofed",
      user_id: "victim",
      password: null,
      turnstileToken: null,
    }));

    expect(response.status).toBe(200);
    expect(mocks.consumeQuota).toHaveBeenCalledWith({
      supabaseAdmin: admin.supabaseAdmin,
      scope: "comment",
      actor: "member-a",
    });
    expect(mocks.verifyTurnstile).not.toHaveBeenCalled();
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(admin.insertComment).toHaveBeenCalledWith([expect.objectContaining({
      user_id: "member-a",
      author: "서버닉네임",
      password_hash: null,
      ip_address: null,
    })]);
    expect(admin.insertNotification).toHaveBeenCalledWith([{
      user_id: "post-owner",
      sender_id: "member-a",
      sender_name: "서버닉네임",
      type: "comment",
      post_id: 7,
      preview_text: "게시글 제목",
    }]);
  });

  it("회원 대댓글은 parent user와 content를 알림 대상·preview로 사용한다", async () => {
    const admin = createAdmin();
    mocks.withOptionalAuth.mockResolvedValue({
      user: { id: "member-a" },
      supabaseAdmin: admin.supabaseAdmin,
    });

    const response = await commentsPOST(makeCommentRequest({
      parent_id: 15,
      author: null,
      password: null,
      turnstileToken: null,
    }));

    expect(response.status).toBe(200);
    expect(admin.parentSingle).toHaveBeenCalledOnce();
    expect(admin.parentSingle.mock.invocationCallOrder[0]).toBeLessThan(
      admin.insertComment.mock.invocationCallOrder[0],
    );
    expect(admin.insertComment).toHaveBeenCalledWith([expect.objectContaining({
      content: "@부모작성자 댓글 내용",
    })]);
    expect(admin.insertNotification).toHaveBeenCalledWith([expect.objectContaining({
      user_id: "parent-user",
      type: "reply",
      preview_text: "부모 댓글",
    })]);
  });

  it("회원 대댓글에 서버 parent author 접두어가 이미 있으면 중복 저장하지 않는다", async () => {
    const admin = createAdmin();
    mocks.withOptionalAuth.mockResolvedValue({
      user: { id: "member-a" },
      supabaseAdmin: admin.supabaseAdmin,
    });

    const response = await commentsPOST(makeCommentRequest({
      parent_id: 15,
      content: "@부모작성자 이미 있는 답글",
      author: null,
      password: null,
      turnstileToken: null,
    }));

    expect(response.status).toBe(200);
    expect(admin.insertComment).toHaveBeenCalledWith([expect.objectContaining({
      content: "@부모작성자 이미 있는 답글",
    })]);
  });

  it("회원 대댓글은 서버 접두어를 포함해 5,000자를 넘으면 insert 전에 거부한다", async () => {
    const admin = createAdmin();
    mocks.withOptionalAuth.mockResolvedValue({
      user: { id: "member-a" },
      supabaseAdmin: admin.supabaseAdmin,
    });

    const response = await commentsPOST(makeCommentRequest({
      parent_id: 15,
      content: "댓".repeat(5000),
      author: null,
      password: null,
      turnstileToken: null,
    }));

    expect(response.status).toBe(400);
    expect(admin.insertComment).not.toHaveBeenCalled();
  });

  it("회원 대댓글의 parent author HTML은 서버에서 실행하지 않고 text로 그대로 저장한다", async () => {
    const admin = createAdmin({
      parent: {
        id: 15,
        user_id: "parent-user",
        author: "<script>alert(1)</script>",
        content: "부모 댓글",
        post_id: 7,
      },
    });
    mocks.withOptionalAuth.mockResolvedValue({
      user: { id: "member-a" },
      supabaseAdmin: admin.supabaseAdmin,
    });

    const response = await commentsPOST(makeCommentRequest({
      parent_id: 15,
      author: null,
      password: null,
      turnstileToken: null,
    }));

    expect(response.status).toBe(200);
    expect(admin.insertComment).toHaveBeenCalledWith([expect.objectContaining({
      content: "@<script>alert(1)</script> 댓글 내용",
    })]);
  });

  it("guest 대댓글은 기존처럼 parent author 접두어 없이 본문을 저장한다", async () => {
    const admin = createAdmin();
    mocks.withOptionalAuth.mockResolvedValue({ user: null, supabaseAdmin: admin.supabaseAdmin });

    const response = await commentsPOST(makeCommentRequest({ parent_id: 15 }));

    expect(response.status).toBe(200);
    expect(admin.insertComment).toHaveBeenCalledWith([expect.objectContaining({
      content: "댓글 내용",
    })]);
  });

  it("회원 자신이 알림 대상이면 notification을 생성하지 않는다", async () => {
    const admin = createAdmin({ post: { user_id: "member-a", title: "내 글" } });
    mocks.withOptionalAuth.mockResolvedValue({
      user: { id: "member-a" },
      supabaseAdmin: admin.supabaseAdmin,
    });

    const response = await commentsPOST(makeCommentRequest({
      author: null,
      password: null,
      turnstileToken: null,
    }));

    expect(response.status).toBe(200);
    expect(admin.insertNotification).not.toHaveBeenCalled();
  });

  it("notification 저장 실패는 댓글 성공을 되돌리지 않고 내부 오류를 응답에 노출하지 않는다", async () => {
    const admin = createAdmin({ notificationError: { message: "raw notification failure" } });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.withOptionalAuth.mockResolvedValue({
      user: { id: "member-a" },
      supabaseAdmin: admin.supabaseAdmin,
    });

    const response = await commentsPOST(makeCommentRequest({
      author: null,
      password: null,
      turnstileToken: null,
    }));
    const payload = JSON.stringify(await response.json());

    expect(response.status).toBe(200);
    expect(payload).not.toContain("raw notification failure");
    expect(errorSpy).toHaveBeenCalledWith("[Board Comment] 알림 저장에 실패했습니다.");
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("raw notification failure");
    errorSpy.mockRestore();
  });
});
