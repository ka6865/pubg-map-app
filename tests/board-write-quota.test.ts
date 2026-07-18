import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  buildBoardWriteActorHash,
  consumeBoardWriteQuota,
} from "../lib/board/writeQuota.server";

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260718122322_board_turnstile_write_boundary.sql",
  ),
  "utf8",
);

describe("board write quota helper", () => {
  it("IPv6 actor는 동일 /64 prefix로 정규화하지만 IPv4와 회원 actor는 보존한다", () => {
    expect(buildBoardWriteActorHash("post", "2001:db8:1234:5678::1")).toBe(
      buildBoardWriteActorHash("post", "2001:db8:1234:5678:abcd:ef01:2345:6789"),
    );
    expect(buildBoardWriteActorHash("post", "203.0.113.10")).not.toBe(
      buildBoardWriteActorHash("post", "203.0.113.11"),
    );
    expect(buildBoardWriteActorHash("post", "user-1")).not.toBe(
      buildBoardWriteActorHash("post", "user-2"),
    );
  });

  it("동일 actor를 scope별 결정적 64자리 hex로 가명화한다", () => {
    const postHash = buildBoardWriteActorHash("post", "203.0.113.10");

    expect(postHash).toMatch(/^[a-f0-9]{64}$/);
    expect(postHash).toBe(buildBoardWriteActorHash("post", "203.0.113.10"));
    expect(buildBoardWriteActorHash("comment", "203.0.113.10")).not.toBe(
      postHash,
    );
  });

  it("scope별 고정 quota를 해시된 actor와 RPC에 전달한다", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const supabaseAdmin = { rpc } as never;

    await consumeBoardWriteQuota({
      supabaseAdmin,
      scope: "post",
      actor: "user-1",
    });
    await consumeBoardWriteQuota({
      supabaseAdmin,
      scope: "comment",
      actor: "user-1",
    });

    expect(rpc).toHaveBeenNthCalledWith(1, "consume_board_write_quota", {
      p_scope: "post",
      p_actor_hash: buildBoardWriteActorHash("post", "user-1"),
      p_window_seconds: 60,
      p_limit: 1,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "consume_board_write_quota", {
      p_scope: "comment",
      p_actor_hash: buildBoardWriteActorHash("comment", "user-1"),
      p_window_seconds: 10,
      p_limit: 1,
    });
  });

  it("빈 actor는 RPC를 호출하지 않고 503으로 차단한다", async () => {
    const rpc = vi.fn();
    const supabaseAdmin = { rpc } as never;

    await expect(
      consumeBoardWriteQuota({ supabaseAdmin, scope: "post", actor: "  " }),
    ).resolves.toEqual({
      ok: false,
      status: 503,
      error: "게시판 요청 제한을 확인하지 못했습니다.",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("RPC 오류·예외과 비정상 반환은 503으로 fail-closed 한다", async () => {
    const responses = [
      vi.fn().mockResolvedValue({ data: null, error: { message: "missing" } }),
      vi.fn().mockResolvedValue({ data: null, error: null }),
      vi.fn().mockRejectedValue(new Error("connection details")),
    ];

    for (const rpc of responses) {
      const supabaseAdmin = { rpc } as never;
      await expect(
        consumeBoardWriteQuota({
          supabaseAdmin,
          scope: "post",
          actor: "actor",
        }),
      ).resolves.toEqual({
        ok: false,
        status: 503,
        error: "게시판 요청 제한을 확인하지 못했습니다.",
      });
    }
  });

  it("false는 429, true는 허용으로 변환한다", async () => {
    const denied = {
      rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
    } as never;
    const allowed = {
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    } as never;

    await expect(
      consumeBoardWriteQuota({
        supabaseAdmin: denied,
        scope: "comment",
        actor: "actor",
      }),
    ).resolves.toEqual({
      ok: false,
      status: 429,
      error: "댓글은 10초에 한 번만 작성할 수 있습니다.",
    });
    await expect(
      consumeBoardWriteQuota({
        supabaseAdmin: allowed,
        scope: "post",
        actor: "actor",
      }),
    ).resolves.toEqual({ ok: true });
  });
});

describe("board write quota migration", () => {
  it("복합 PK·입력 CHECK·RLS로 row 경계를 고정한다", () => {
    expect(migration).toContain("PRIMARY KEY (scope, actor_hash)");
    expect(migration).toMatch(/scope IN \('post', 'comment'\)/i);
    expect(migration).toMatch(/actor_hash ~ '\^\[a-f0-9\]\{64\}\$'/i);
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).not.toMatch(/CREATE\s+POLICY/i);
  });

  it("공개 table·function 권한을 닫고 service_role 최소 권한만 연다", () => {
    expect(migration).toMatch(
      /REVOKE ALL ON TABLE public\.board_write_rate_limits FROM PUBLIC, anon, authenticated/i,
    );
    expect(migration).toMatch(
      /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.board_write_rate_limits TO service_role/i,
    );
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.consume_board_write_quota\(text, text, integer, integer\)[\s\S]+FROM PUBLIC, anon, authenticated/i,
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.consume_board_write_quota\(text, text, integer, integer\)[\s\S]+TO service_role/i,
    );
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.cleanup_board_write_rate_limits\(timestamptz, integer\)[\s\S]+FROM PUBLIC, anon, authenticated/i,
    );
  });

  it("함수는 invoker·빈 search_path·완전 한정 relation을 사용한다", () => {
    expect(migration).toContain("SECURITY INVOKER");
    expect(migration).toContain("SET search_path = ''");
    expect(migration).toContain("INSERT INTO public.board_write_rate_limits");
    expect(migration).not.toContain("SECURITY DEFINER");
  });

  it("scope·actor hash·window·limit을 DB에서도 검증한다", () => {
    expect(migration).toMatch(/p_scope NOT IN \('post', 'comment'\)/i);
    expect(migration).toMatch(/p_actor_hash !~ '\^\[a-f0-9\]\{64\}\$'/i);
    expect(migration).toMatch(/p_window_seconds NOT BETWEEN 1 AND 3600/i);
    expect(migration).toMatch(/p_limit NOT BETWEEN 1 AND 100/i);
  });

  it("조건부 upsert로 동일 window quota를 원자적으로 소비한다", () => {
    expect(migration).toContain(
      "ON CONFLICT (scope, actor_hash) DO UPDATE",
    );
    expect(migration).toMatch(/WHERE[\s\S]+request_count < p_limit/i);
    expect(migration).toMatch(/RETURNING true INTO v_allowed/i);
  });
});
