import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ withAuthGuard: vi.fn(), fetch: vi.fn() }));

vi.mock("../utils/supabase/guard", () => ({ withAuthGuard: mocks.withAuthGuard }));

import { POST } from "../app/api/posts/promote/route";
import { resolvePromoteExpectedParentRevision } from "../lib/board/promotionRevision";

function createAdmin(result: unknown, error: unknown = null) {
  const rpc = vi.fn(async () => ({ data: result, error }));
  return {
    rpc,
    from: vi.fn(() => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: { role: "admin" }, error: null })) })) })),
    })),
  };
}

function request(body: unknown) {
  return new Request("https://bgms.test/api/posts/promote", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("게시글 초안 승격 이미지 경계", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  it("shadow 초안은 revision을 포함한 단일 RPC가 성공한 뒤에만 Discord 알림을 한 번 보낸다", async () => {
    const admin = createAdmin([{ result_code: "ok", post_id: 20, revision: 4, title: "승격 글", content: "본문", image_url: null }]);
    mocks.withAuthGuard.mockResolvedValue({ user: { id: "11111111-1111-4111-8111-111111111111" }, supabaseAdmin: admin });
    mocks.fetch.mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", mocks.fetch);
    vi.stubEnv("DISCORD_WEBHOOK_URL", "https://discord.test/webhook");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://bgms.test");

    const response = await POST(request({ postId: 21, expectedParentRevision: 3 }));

    expect(response.status).toBe(200);
    expect(admin.rpc).toHaveBeenCalledWith("merge_board_post_draft_with_images", {
      p_draft_post_id: 21,
      p_actor_user_id: "11111111-1111-4111-8111-111111111111",
      p_expected_parent_revision: 3,
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("revision 충돌에서는 Discord와 Storage를 호출하지 않고 409를 반환한다", async () => {
    const admin = createAdmin([{ result_code: "revision_conflict", post_id: 20, revision: 4, title: null, content: null, image_url: null }]);
    mocks.withAuthGuard.mockResolvedValue({ user: { id: "11111111-1111-4111-8111-111111111111" }, supabaseAdmin: admin });

    const response = await POST(request({ postId: 21, expectedParentRevision: 3 }));

    expect(response.status).toBe(409);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(admin).not.toHaveProperty("storage");
  });

  it("성공 결과는 정확히 한 행이며 알림에 필요한 필드를 모두 갖추지 않으면 fail closed 한다", async () => {
    const admin = createAdmin([{ result_code: "ok", post_id: 20, revision: 4, title: "승격 글", content: null, image_url: null }]);
    mocks.withAuthGuard.mockResolvedValue({ user: { id: "11111111-1111-4111-8111-111111111111" }, supabaseAdmin: admin });

    const response = await POST(request({ postId: 21, expectedParentRevision: 3 }));

    expect(response.status).toBe(503);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("RPC가 복수 행을 반환하면 첫 행을 신뢰하지 않고 fail closed 한다", async () => {
    const admin = createAdmin([
      { result_code: "ok", post_id: 20, revision: 4, title: "승격 글", content: "본문", image_url: null },
      { result_code: "ok", post_id: 21, revision: 5, title: "다른 글", content: "본문", image_url: null },
    ]);
    mocks.withAuthGuard.mockResolvedValue({ user: { id: "11111111-1111-4111-8111-111111111111" }, supabaseAdmin: admin });

    const response = await POST(request({ postId: 21, expectedParentRevision: 3 }));

    expect(response.status).toBe(503);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("DB 승격 후 Discord 전송이 실패해도 성공 응답을 유지한다", async () => {
    const admin = createAdmin([{ result_code: "ok", post_id: 20, revision: 4, title: "승격 글", content: "본문", image_url: null }]);
    mocks.withAuthGuard.mockResolvedValue({ user: { id: "11111111-1111-4111-8111-111111111111" }, supabaseAdmin: admin });
    mocks.fetch.mockRejectedValue(new Error("Discord unavailable"));
    vi.stubGlobal("fetch", mocks.fetch);
    vi.stubEnv("DISCORD_WEBHOOK_URL", "https://discord.test/webhook");

    const response = await POST(request({ postId: 21, expectedParentRevision: 3 }));

    expect(response.status).toBe(200);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("Discord fetch가 영구 pending이어도 timeout 뒤 abort하고 승격 성공을 반환한다", async () => {
    vi.useFakeTimers();
    const admin = createAdmin([{ result_code: "ok", post_id: 20, revision: 4, title: "승격 글", content: "본문", image_url: null }]);
    let signal: AbortSignal | undefined;
    mocks.withAuthGuard.mockResolvedValue({ user: { id: "11111111-1111-4111-8111-111111111111" }, supabaseAdmin: admin });
    mocks.fetch.mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => undefined);
    });
    vi.stubGlobal("fetch", mocks.fetch);
    vi.stubEnv("DISCORD_WEBHOOK_URL", "https://discord.test/webhook");

    const responsePromise = POST(request({ postId: 21, expectedParentRevision: 3 }));
    const resolution = Promise.race([
      responsePromise.then((response) => ({ response })),
      new Promise<{ timedOut: true }>((resolve) => setTimeout(() => resolve({ timedOut: true }), 1001)),
    ]);

    await vi.advanceTimersByTimeAsync(1001);
    const result = await resolution;

    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(true);
    expect(result).toHaveProperty("response");
    expect((result as { response: Response }).response.status).toBe(200);
  });

  it("관리형 ref 이전 RPC는 parent와 모든 sibling draft를 순서대로 잠그고 마지막 ref만 삭제 후보로 전이한다", () => {
    const sql = readFileSync(new URL("../supabase/migrations/20260718203104_board_image_storage_ownership.sql", import.meta.url), "utf8");

    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.merge_board_post_draft_with_images(");
    expect(sql).toContain("ORDER BY post_row.id\n    FOR UPDATE");
    expect(sql).toMatch(/WHERE post_row\.parent_id = v_parent\.id\s+AND post_row\.status = 'draft'\s+ORDER BY post_row\.id\s+FOR UPDATE/);
    expect(sql).toContain("DELETE FROM public.board_post_image_refs AS ref_row\n  WHERE ref_row.post_id = v_parent.id");
    expect(sql).toContain("ref_row.post_id = ANY(v_sibling_draft_ids)");
    expect(sql).toContain("AND NOT EXISTS (\n      SELECT 1 FROM public.board_post_image_refs AS ref_row\n      WHERE ref_row.image_id = image_row.id\n    )");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.merge_board_post_draft_with_images(bigint, uuid, bigint) FROM PUBLIC, anon, authenticated");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.merge_board_post_draft_with_images(bigint, uuid, bigint) TO service_role");
  });

  it("route에는 HTML diff, legacy images bucket 삭제, 직접 Storage 삭제가 없다", () => {
    const source = readFileSync(new URL("../app/api/posts/promote/route.ts", import.meta.url), "utf8");

    expect(source).not.toMatch(/oldImages|deletedImages|storage\.from\("images"\)|\.remove\(/);
    expect(source).not.toMatch(/console\.(log|warn|error)/);
  });

  it("shadow draft 승격은 서버가 조회한 실제 부모 revision을 전달하며, 조회 실패 시 승격을 막는다", () => {
    const pageSource = readFileSync(new URL("../app/board/[postId]/page.tsx", import.meta.url), "utf8");
    const clientSource = readFileSync(new URL("../components/board/BoardDetailClient.tsx", import.meta.url), "utf8");

    expect(pageSource).toContain('select("revision")');
    expect(pageSource).toContain("promoteExpectedParentRevision");
    expect(clientSource).toContain("promoteExpectedParentRevision");
    expect(clientSource).not.toContain("expectedParentRevision: (post as Post & { revision?: number }).revision ?? 0");
  });

  it("shadow 초안은 자신의 revision이 아니라 조회한 부모 revision만 승격 조건으로 사용한다", () => {
    expect(resolvePromoteExpectedParentRevision(
      { parent_id: 20, revision: 99 },
      { revision: 4 },
      null,
    )).toBe(4);
  });

  it.each([
    ["부모 조회 오류", { revision: 4 }, { code: "PGRST" }],
    ["부모 누락", null, null],
    ["부모 revision 비정상", { revision: -1 }, null],
  ])("shadow 초안은 %s이면 승격 조건을 null로 막는다", (_caseName, parent, parentError) => {
    expect(resolvePromoteExpectedParentRevision(
      { parent_id: 20, revision: 99 },
      parent,
      parentError,
    )).toBeNull();
  });

  it("신규 draft는 자신의 유효한 revision을 승격 조건으로 사용한다", () => {
    expect(resolvePromoteExpectedParentRevision(
      { parent_id: null, revision: 7 },
      null,
      null,
    )).toBe(7);
  });
});
