# 게시판 Turnstile 쓰기 경계 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 비회원 Turnstile 토큰을 실제 게시글·댓글 저장 요청 안에서 한 번만 검증하고, Supabase 원자적 quota로 분산 Vercel 환경의 쓰기 남용을 차단한다.

**Architecture:** 공유 계약·서버 검증 helper와 service-role 전용 quota RPC를 먼저 만든다. 모든 웹 게시판 쓰기 route가 해당 경계를 거치게 하고, 클라이언트의 `sessionStorage` 인증 면제와 회원 댓글 직접 Supabase INSERT를 제거한다. migration은 앱보다 먼저 배포하며 운영 데이터는 삭제하지 않는다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, Supabase PostgreSQL/RPC, Cloudflare Turnstile Siteverify

## Global Constraints

- Vercel, Supabase, Cloudflare R2 무료 플랜만 사용하고 외부 유료 rate-limit 서비스를 추가하지 않는다.
- Cloudflare 토큰은 실제 쓰기 요청 body로 전달하고 같은 route에서 Siteverify하며 브라우저 저장소·DB·로그에 저장하지 않는다.
- `guest_post`, `guest_comment` action을 구분하고 Siteverify 응답 action까지 검증한다.
- token·secret·IP·Cloudflare 원본 오류·Supabase 원본 오류를 사용자 응답이나 로그에 노출하지 않는다.
- quota RPC 오류와 migration 미적용은 503으로 fail-closed 처리한다.
- 공개 schema 신규 table은 RLS를 활성화하고 공개 policy를 만들지 않는다.
- 함수는 `SECURITY INVOKER`, `SET search_path=''`, 완전 한정 이름을 사용하고 `service_role`만 실행할 수 있다.
- 회원 댓글의 서버 이전 후 기존 notification 동작을 유지한다.
- 기존 운영 데이터 삭제, 운영 migration 적용, 운영 게시글·댓글 생성은 이번 로컬 구현에서 수행하지 않는다.
- 함수·컴포넌트 변경 시 모든 caller의 인자·타입과 import 경로를 전수 검사한다.
- 변경 파일에서 `console.log`, unused import, 주석 처리 코드를 남기지 않는다.

---

### Task 1: Turnstile 공유 계약과 서버 검증

**Files:**
- Create: `lib/board/turnstileContract.ts`
- Create: `lib/board/turnstile.server.ts`
- Modify: `components/board/TurnstileWidget.tsx`
- Modify: `tests/board-guest-turnstile.test.ts`
- Modify: `app/api/board/turnstile/route.ts`

**Interfaces:**
- Produces: `type TurnstileAction = "guest_post" | "guest_comment"`
- Produces: `verifyTurnstileToken(input): Promise<TurnstileVerificationResult>`
- Produces: `<TurnstileWidget action onVerify onError />`
- Produces: Task 4 전까지 `guest_comment` action을 강제하는 호환 `POST /api/board/turnstile`
- Defers: standalone route와 `sessionStorage` preverify 제거는 실제 댓글 저장 route 결합을 완료하는 Task 4에서 수행

- [ ] **Step 1: 서버 검증 실패 테스트 작성**

`tests/board-guest-turnstile.test.ts`에서 기존 route import·route 테스트를 제거하고 다음 계약을 추가한다.

```ts
import { verifyTurnstileToken } from "../lib/board/turnstile.server";

it("secret 누락 시 외부 호출 전에 503으로 차단한다", async () => {
  delete process.env.TURNSTILE_SECRET_KEY;
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

it("2,048자를 넘는 token을 외부 호출 전에 거부한다", async () => {
  process.env.TURNSTILE_SECRET_KEY = "test-secret";
  const fetchImpl = vi.fn();
  const result = await verifyTurnstileToken({
    token: "x".repeat(2049),
    remoteIp: "203.0.113.10",
    expectedAction: "guest_post",
    fetchImpl,
  });
  expect(result.ok).toBe(false);
  expect(result.status).toBe(400);
  expect(fetchImpl).not.toHaveBeenCalled();
});

it("success와 action이 일치할 때만 통과하고 remoteip을 전달한다", async () => {
  process.env.TURNSTILE_SECRET_KEY = "test-secret";
  const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    success: true,
    action: "guest_comment",
  }), { status: 200 }));
  const result = await verifyTurnstileToken({
    token: "valid-token",
    remoteIp: "203.0.113.10",
    expectedAction: "guest_comment",
    fetchImpl,
  });
  expect(result).toEqual({ ok: true });
  const body = fetchImpl.mock.calls[0][1].body as FormData;
  expect(body.get("response")).toBe("valid-token");
  expect(body.get("remoteip")).toBe("203.0.113.10");
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
});
```

- [ ] **Step 2: RED 확인**

Run:

```bash
npx vitest run tests/board-guest-turnstile.test.ts
```

Expected: `lib/board/turnstile.server` 미존재로 실패한다.

- [ ] **Step 3: 공유 계약과 서버 helper 구현**

`lib/board/turnstileContract.ts`:

```ts
export const TURNSTILE_ACTIONS = {
  post: "guest_post",
  comment: "guest_comment",
} as const;

export type TurnstileAction = typeof TURNSTILE_ACTIONS[keyof typeof TURNSTILE_ACTIONS];
```

`lib/board/turnstile.server.ts`:

```ts
import type { TurnstileAction } from "./turnstileContract";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TOKEN_MAX_LENGTH = 2048;
const VERIFY_TIMEOUT_MS = 5000;

type FetchLike = typeof fetch;
type TurnstileVerificationResult =
  | { ok: true }
  | { ok: false; status: 400 | 503; error: string };

export async function verifyTurnstileToken(input: {
  token: unknown;
  remoteIp: string;
  expectedAction: TurnstileAction;
  fetchImpl?: FetchLike;
}): Promise<TurnstileVerificationResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) return { ok: false, status: 503, error: "보안 인증을 사용할 수 없습니다." };

  const token = typeof input.token === "string" ? input.token.trim() : "";
  if (!token || token.length > TOKEN_MAX_LENGTH) {
    return { ok: false, status: 400, error: "보안 인증 토큰이 올바르지 않습니다." };
  }

  const form = new FormData();
  form.set("secret", secret);
  form.set("response", token);
  form.set("remoteip", input.remoteIp);

  try {
    const response = await (input.fetchImpl ?? fetch)(SITEVERIFY_URL, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error("turnstile_upstream");
    const outcome: unknown = await response.json();
    if (!outcome || typeof outcome !== "object") throw new Error("turnstile_payload");
    const value = outcome as { success?: unknown; action?: unknown };
    if (value.success === true && value.action === input.expectedAction) return { ok: true };
    return { ok: false, status: 400, error: "보안 인증에 실패했습니다. 다시 시도해주세요." };
  } catch {
    return { ok: false, status: 503, error: "보안 인증 서버에 연결하지 못했습니다." };
  }
}
```

- [ ] **Step 4: 위젯 action·callback 안정화와 standalone route 호환 경계 고정**

`TurnstileWidget`에 `action: TurnstileAction` prop을 추가한다. `onVerify`와 `onError`는 ref로 최신 callback을 읽어 부모 rerender 때 widget이 재생성되지 않게 한다.

```ts
const onVerifyRef = useRef(onVerify);
const onErrorRef = useRef(onError);
useEffect(() => { onVerifyRef.current = onVerify; }, [onVerify]);
useEffect(() => { onErrorRef.current = onError; }, [onError]);

window.turnstile.render(containerRef.current, {
  sitekey,
  action,
  callback: (token) => onVerifyRef.current(token),
  "error-callback": () => onErrorRef.current?.(),
  "expired-callback": resetCurrentWidget,
  theme: "dark",
  language: "ko",
});
```

`TurnstileOptions`에 `action: TurnstileAction`을 추가하고 `NEXT_PUBLIC_TURNSTILE_SITE_KEY`가 비어 있으면 `onError`만 호출하고 render하지 않는다. `app/api/board/turnstile/route.ts`는 Task 4 전 기능 보존을 위해 새 helper에 `guest_comment`를 전달하는 호환 wrapper로 유지하고, Task 4에서 모든 caller를 실제 저장 요청으로 전환한 후 삭제한다.

- [ ] **Step 5: GREEN·정적 검사·커밋**

Run:

```bash
npx vitest run tests/board-guest-turnstile.test.ts
npx eslint lib/board/turnstileContract.ts lib/board/turnstile.server.ts components/board/TurnstileWidget.tsx tests/board-guest-turnstile.test.ts
npx tsc --noEmit --pretty false
rg -n '/api/board/turnstile|turnstile_verified' app components lib tests
git diff --check
```

Expected: 테스트·정적 검사 0이다. 마지막 검색은 Task 4에서 제거할 호환 route·`BoardDetailClient` caller·`sessionStorage` 잔여만 보고하며, 이 범위 외 새 사용처는 0건이어야 한다.

```bash
git add lib/board/turnstileContract.ts lib/board/turnstile.server.ts components/board/TurnstileWidget.tsx tests/board-guest-turnstile.test.ts app/api/board/turnstile/route.ts
git commit -m "fix: Turnstile 서버 쓰기 검증 기반 구축"
```

---

### Task 2: Supabase 원자적 게시판 쓰기 quota

**Files:**
- Modify: `supabase/migrations/20260718122322_board_turnstile_write_boundary.sql`
- Create: `lib/board/writeQuota.server.ts`
- Create: `tests/board-write-quota.test.ts`

**Interfaces:**
- Produces: `consume_board_write_quota(text,text,integer,integer): boolean`
- Produces: `consumeBoardWriteQuota({ supabaseAdmin, scope, actor }): Promise<BoardWriteQuotaResult>`
- Consumes: server-only Supabase admin client

- [x] **Step 1: migration·helper 실패 테스트 작성**

`tests/board-write-quota.test.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildBoardWriteActorHash, consumeBoardWriteQuota } from "../lib/board/writeQuota.server";

const migration = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260718122322_board_turnstile_write_boundary.sql"), "utf8");

it("동일 actor를 결정적 64자리 hex로 가명화한다", () => {
  expect(buildBoardWriteActorHash("post", "203.0.113.10")).toMatch(/^[a-f0-9]{64}$/);
  expect(buildBoardWriteActorHash("post", "203.0.113.10")).toBe(buildBoardWriteActorHash("post", "203.0.113.10"));
  expect(buildBoardWriteActorHash("comment", "203.0.113.10")).not.toBe(buildBoardWriteActorHash("post", "203.0.113.10"));
});

it("RPC 오류와 비정상 반환은 503으로 fail-closed 한다", async () => {
  for (const response of [{ data: null, error: { message: "missing" } }, { data: null, error: null }]) {
    const supabaseAdmin = { rpc: vi.fn().mockResolvedValue(response) } as never;
    await expect(consumeBoardWriteQuota({ supabaseAdmin, scope: "post", actor: "actor" }))
      .resolves.toEqual({ ok: false, status: 503, error: "게시판 요청 제한을 확인하지 못했습니다." });
  }
});

it("false는 429, true는 허용으로 변환한다", async () => {
  const denied = { rpc: vi.fn().mockResolvedValue({ data: false, error: null }) } as never;
  const allowed = { rpc: vi.fn().mockResolvedValue({ data: true, error: null }) } as never;
  await expect(consumeBoardWriteQuota({ supabaseAdmin: denied, scope: "comment", actor: "actor" }))
    .resolves.toEqual({ ok: false, status: 429, error: "댓글은 10초에 한 번만 작성할 수 있습니다." });
  await expect(consumeBoardWriteQuota({ supabaseAdmin: allowed, scope: "post", actor: "actor" }))
    .resolves.toEqual({ ok: true });
});

it("migration은 공개 권한을 닫고 원자적 조건부 upsert를 사용한다", () => {
  expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
  expect(migration).toMatch(/REVOKE ALL[\s\S]+FROM PUBLIC, anon, authenticated/i);
  expect(migration).toMatch(/GRANT EXECUTE[\s\S]+TO service_role/i);
  expect(migration).toContain("SECURITY INVOKER");
  expect(migration).toContain("SET search_path = ''");
  expect(migration).toContain("ON CONFLICT (scope, actor_hash) DO UPDATE");
  expect(migration).toMatch(/WHERE[\s\S]+request_count < p_limit/i);
});
```

- [x] **Step 2: RED 확인**

Run: `npx vitest run tests/board-write-quota.test.ts`

Expected: helper 미존재와 빈 migration으로 실패한다.

- [x] **Step 3: migration 구현**

`supabase/migrations/20260718122322_board_turnstile_write_boundary.sql`에 다음 객체를 작성한다.

```sql
CREATE TABLE IF NOT EXISTS public.board_write_rate_limits (
  scope text NOT NULL CHECK (scope IN ('post', 'comment')),
  actor_hash text NOT NULL CHECK (actor_hash ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  request_count integer NOT NULL DEFAULT 1 CHECK (request_count > 0),
  PRIMARY KEY (scope, actor_hash)
);

ALTER TABLE public.board_write_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.board_write_rate_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.board_write_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.consume_board_write_quota(
  p_scope text,
  p_actor_hash text,
  p_window_seconds integer,
  p_limit integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_allowed boolean;
BEGIN
  IF p_scope IS NULL
     OR p_actor_hash IS NULL
     OR p_window_seconds IS NULL
     OR p_limit IS NULL
     OR p_scope NOT IN ('post', 'comment')
     OR p_actor_hash !~ '^[a-f0-9]{64}$'
     OR p_window_seconds NOT BETWEEN 1 AND 3600
     OR p_limit NOT BETWEEN 1 AND 100 THEN
    RETURN false;
  END IF;

  INSERT INTO public.board_write_rate_limits AS current_limit (
    scope, actor_hash, window_started_at, request_count
  ) VALUES (
    p_scope, p_actor_hash, statement_timestamp(), 1
  )
  ON CONFLICT (scope, actor_hash) DO UPDATE
  SET
    window_started_at = CASE
      WHEN current_limit.window_started_at <= statement_timestamp() - make_interval(secs => p_window_seconds)
        THEN statement_timestamp()
      ELSE current_limit.window_started_at
    END,
    request_count = CASE
      WHEN current_limit.window_started_at <= statement_timestamp() - make_interval(secs => p_window_seconds)
        THEN 1
      ELSE current_limit.request_count + 1
    END
  WHERE current_limit.window_started_at <= statement_timestamp() - make_interval(secs => p_window_seconds)
     OR current_limit.request_count < p_limit
  RETURNING true INTO v_allowed;

  RETURN COALESCE(v_allowed, false);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_board_write_quota(text, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_board_write_quota(text, text, integer, integer)
  TO service_role;
```

- [x] **Step 4: server helper 구현**

`lib/board/writeQuota.server.ts`는 `node:crypto` SHA-256과 다음 고정 설정을 사용한다.

```ts
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

type BoardWriteScope = "post" | "comment";
type BoardWriteQuotaResult =
  | { ok: true }
  | { ok: false; status: 429 | 503; error: string };

const QUOTAS = {
  post: { windowSeconds: 60, limit: 1, error: "게시글은 1분에 한 번만 작성할 수 있습니다." },
  comment: { windowSeconds: 10, limit: 1, error: "댓글은 10초에 한 번만 작성할 수 있습니다." },
} as const;

export function buildBoardWriteActorHash(scope: BoardWriteScope, actor: string): string {
  return createHash("sha256").update(`${scope}:${actor}`).digest("hex");
}

export async function consumeBoardWriteQuota(input: {
  supabaseAdmin: SupabaseClient;
  scope: BoardWriteScope;
  actor: string;
}): Promise<BoardWriteQuotaResult> {
  const quota = QUOTAS[input.scope];
  const { data, error } = await input.supabaseAdmin.rpc("consume_board_write_quota", {
    p_scope: input.scope,
    p_actor_hash: buildBoardWriteActorHash(input.scope, input.actor),
    p_window_seconds: quota.windowSeconds,
    p_limit: quota.limit,
  });
  if (error || typeof data !== "boolean") {
    return { ok: false, status: 503, error: "게시판 요청 제한을 확인하지 못했습니다." };
  }
  return data ? { ok: true } : { ok: false, status: 429, error: quota.error };
}
```

- [x] **Step 5: GREEN·migration 정적 검증·커밋**

Run:

```bash
npx vitest run tests/board-write-quota.test.ts
npx eslint lib/board/writeQuota.server.ts tests/board-write-quota.test.ts
npx tsc --noEmit --pretty false
git diff --check
```

Expected: 종료 코드 0. 운영 Supabase에는 적용하지 않는다.

```bash
git add supabase/migrations/20260718122322_board_turnstile_write_boundary.sql lib/board/writeQuota.server.ts tests/board-write-quota.test.ts
git commit -m "fix: 게시판 쓰기 요청 제한 원자화"
```

---

### Task 3: 게시글 route와 작성 화면 결합

**Files:**
- Modify: `app/api/posts/write/route.ts`
- Modify: `app/api/board/posts/route.ts`
- Modify: `components/board/BoardWriteClient.tsx`
- Create: `tests/board-post-write-boundary.test.ts`
- Modify: `tests/security.test.ts`

**Interfaces:**
- Consumes: Task 1 `verifyTurnstileToken`, `TURNSTILE_ACTIONS.post`
- Consumes: Task 2 `consumeBoardWriteQuota`
- Produces: guest post payload `turnstileToken: string`

- [ ] **Step 1: 게시글 direct-call 실패 테스트 작성**

`tests/board-post-write-boundary.test.ts`는 route dependency를 mock하되 DB insert 호출 여부를 실제 chain에서 검사한다.

```ts
it("비회원 신규 글은 token 없이 quota·bcrypt·insert에 도달하지 않는다", async () => {
  mockOptionalAuth.mockResolvedValue({ user: null, supabaseAdmin });
  const response = await postsWritePOST(makePostRequest({ turnstileToken: undefined }));
  expect(response.status).toBe(400);
  expect(mockConsumeQuota).not.toHaveBeenCalled();
  expect(mockVerifyTurnstile).not.toHaveBeenCalled();
  expect(mockHash).not.toHaveBeenCalled();
  expect(insert).not.toHaveBeenCalled();
});

it("quota 거부 시 Siteverify와 저장을 호출하지 않는다", async () => {
  mockConsumeQuota.mockResolvedValue({ ok: false, status: 429, error: "게시글은 1분에 한 번만 작성할 수 있습니다." });
  const response = await postsWritePOST(makePostRequest({ turnstileToken: "token" }));
  expect(response.status).toBe(429);
  expect(mockVerifyTurnstile).not.toHaveBeenCalled();
  expect(insert).not.toHaveBeenCalled();
});

it("valid guest_post token만 비회원 insert를 허용한다", async () => {
  mockConsumeQuota.mockResolvedValue({ ok: true });
  mockVerifyTurnstile.mockResolvedValue({ ok: true });
  const response = await postsWritePOST(makePostRequest({ turnstileToken: "token" }));
  expect(response.status).toBe(200);
  expect(mockVerifyTurnstile).toHaveBeenCalledWith(expect.objectContaining({ expectedAction: "guest_post" }));
  expect(insert).toHaveBeenCalledTimes(1);
});

it("회원 신규 글은 user quota를 사용하고 Turnstile을 호출하지 않는다", async () => {
  mockOptionalAuth.mockResolvedValue({ user: { id: "user-a" }, supabaseAdmin });
  mockConsumeQuota.mockResolvedValue({ ok: true });
  const response = await postsWritePOST(makeMemberPostRequest());
  expect(response.status).toBe(200);
  expect(mockConsumeQuota).toHaveBeenCalledWith(expect.objectContaining({ actor: "user-a", scope: "post" }));
  expect(mockVerifyTurnstile).not.toHaveBeenCalled();
});
```

`/api/board/posts`에도 token 누락, quota 429, valid token insert를 같은 방식으로 고정한다.

- [ ] **Step 2: RED 확인**

Run: `npx vitest run tests/board-post-write-boundary.test.ts tests/security.test.ts`

Expected: 현재 route가 token 없이 insert 경계까지 진행해 실패한다.

- [ ] **Step 3: 두 게시글 route 서버 결합**

두 route 모두 malformed 필드를 먼저 검사한 뒤 다음 helper를 사용한다.

```ts
const quota = await consumeBoardWriteQuota({
  supabaseAdmin,
  scope: "post",
  actor: user?.id ?? clientIp,
});
if (!quota.ok) return NextResponse.json({ error: quota.error }, { status: quota.status });

if (!user) {
  const turnstile = await verifyTurnstileToken({
    token: turnstileToken,
    remoteIp: clientIp,
    expectedAction: TURNSTILE_ACTIONS.post,
  });
  if (!turnstile.ok) {
    return NextResponse.json({ error: turnstile.error }, { status: turnstile.status });
  }
}
```

`/api/posts/write`에서는 이 경계를 신규 작성 분기에서 Discord 외부 검증·bcrypt·DB insert보다 먼저 실행한다. 수정 분기는 quota·Turnstile 대상이 아니다. `/api/board/posts`는 항상 guest IP quota와 Turnstile을 적용한다. 변경 파일의 `console.log`, 사용하지 않는 admin client 상수·import, 사실과 다른 로그인 전용 주석을 제거한다.

- [ ] **Step 4: 작성 화면 token 메모리 결합**

`BoardWriteClient`에 guest token과 widget generation을 추가한다.

```ts
const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
const [turnstileGeneration, setTurnstileGeneration] = useState(0);

if (!user && !editPostId && !turnstileToken) {
  toast.warning("비회원 글쓰기를 위해 보안 인증을 완료해주세요.");
  return false;
}

const payload = {
  // 기존 필드 유지
  turnstileToken: user || editPostId ? null : turnstileToken,
};

finally {
  if (!user && !editPostId) {
    setTurnstileToken(null);
    setTurnstileGeneration((value) => value + 1);
  }
}
```

`BoardWrite` 위에 guest 신규 작성일 때만 다음 위젯을 렌더한다.

```tsx
{!user && !editPostId && (
  <section aria-label="비회원 보안 인증" className="mb-3 rounded-lg border border-white/10 bg-[#1a1a1a] p-3">
    <TurnstileWidget
      key={turnstileGeneration}
      action={TURNSTILE_ACTIONS.post}
      onVerify={setTurnstileToken}
      onError={() => setTurnstileToken(null)}
    />
  </section>
)}
```

- [ ] **Step 5: GREEN·caller 검사·커밋**

Run:

```bash
npx vitest run tests/board-post-write-boundary.test.ts tests/security.test.ts tests/board-guest-turnstile.test.ts tests/board-write-quota.test.ts
npx eslint app/api/posts/write/route.ts app/api/board/posts/route.ts components/board/BoardWriteClient.tsx tests/board-post-write-boundary.test.ts tests/security.test.ts
npx tsc --noEmit --pretty false
rg -n 'TurnstileWidget' components app
rg -n 'console\.log|turnstile_verified|/api/board/turnstile' app/api/posts/write/route.ts app/api/board/posts/route.ts components/board/BoardWriteClient.tsx
git diff --check
```

Expected: 종료 코드 0, 금지 검색 0건, 모든 `TurnstileWidget` caller에 `action`이 있다.

```bash
git add app/api/posts/write/route.ts app/api/board/posts/route.ts components/board/BoardWriteClient.tsx tests/board-post-write-boundary.test.ts tests/security.test.ts
git commit -m "fix: 비회원 게시글 Turnstile 저장 경계 결합"
```

---

### Task 4: 댓글 route와 회원·비회원 클라이언트 통합

**Files:**
- Modify: `app/api/board/comments/route.ts`
- Modify: `components/board/BoardDetailClient.tsx`
- Delete: `app/api/board/turnstile/route.ts`
- Create: `tests/board-comment-write-boundary.test.ts`
- Create: `tests/board-turnstile-client.test.ts`

**Interfaces:**
- Consumes: Task 1 `verifyTurnstileToken`, `TURNSTILE_ACTIONS.comment`
- Consumes: Task 2 `consumeBoardWriteQuota`
- Produces: 회원·비회원 공용 `POST /api/board/comments`
- Preserves: 댓글 작성 후 대상 user notification

- [ ] **Step 1: 댓글 서버·클라이언트 실패 테스트 작성**

`tests/board-comment-write-boundary.test.ts`:

```ts
it("guest comment는 token 없이 quota·bcrypt·insert를 호출하지 않는다", async () => {
  mockOptionalAuth.mockResolvedValue({ user: null, supabaseAdmin });
  const response = await commentsPOST(makeCommentRequest({ turnstileToken: undefined }));
  expect(response.status).toBe(400);
  expect(mockConsumeQuota).not.toHaveBeenCalled();
  expect(mockVerifyTurnstile).not.toHaveBeenCalled();
  expect(insertComment).not.toHaveBeenCalled();
});

it("valid guest_comment token만 guest insert를 허용한다", async () => {
  mockConsumeQuota.mockResolvedValue({ ok: true });
  mockVerifyTurnstile.mockResolvedValue({ ok: true });
  const response = await commentsPOST(makeCommentRequest({ turnstileToken: "token" }));
  expect(response.status).toBe(200);
  expect(mockVerifyTurnstile).toHaveBeenCalledWith(expect.objectContaining({ expectedAction: "guest_comment" }));
});

it("회원 댓글은 JWT user와 profile nickname을 사용하고 notification을 유지한다", async () => {
  mockOptionalAuth.mockResolvedValue({ user: { id: "member-a" }, supabaseAdmin });
  mockConsumeQuota.mockResolvedValue({ ok: true });
  const response = await commentsPOST(makeCommentRequest({ author: "spoofed", user_id: "victim" }));
  expect(response.status).toBe(200);
  expect(insertComment).toHaveBeenCalledWith(expect.arrayContaining([
    expect.objectContaining({ user_id: "member-a", author: "서버닉네임" }),
  ]));
  expect(insertNotification).toHaveBeenCalledTimes(1);
  expect(mockVerifyTurnstile).not.toHaveBeenCalled();
});
```

`tests/board-turnstile-client.test.ts`는 source boundary로 다음을 고정한다.

```ts
expect(detailSource).not.toContain("turnstile_verified");
expect(detailSource).not.toContain('supabase.from("comments").insert');
expect(detailSource).toContain("turnstileToken");
expect(detailSource).toContain("TURNSTILE_ACTIONS.comment");
expect(writeSource).toContain("TURNSTILE_ACTIONS.post");
```

- [ ] **Step 2: RED 확인**

Run: `npx vitest run tests/board-comment-write-boundary.test.ts tests/board-turnstile-client.test.ts`

Expected: guest token 미검증, 회원 direct insert, sessionStorage 문자열로 실패한다.

- [ ] **Step 3: 댓글 route 공용 서버 저장 구현**

요청 body의 `post_id`, `content`, `parent_id`를 유한 양의 정수·1~5,000자 규칙으로 먼저 검증한다. 인증 후 actor quota를 소비하고 guest만 Turnstile·비밀번호·비속어를 검증한다.

```ts
const clientIp = extractClientIp(request);
const quota = await consumeBoardWriteQuota({
  supabaseAdmin,
  scope: "comment",
  actor: user?.id ?? clientIp,
});
if (!quota.ok) return jsonError(quota.error, quota.status);

if (!user) {
  const turnstile = await verifyTurnstileToken({
    token: turnstileToken,
    remoteIp: clientIp,
    expectedAction: TURNSTILE_ACTIONS.comment,
  });
  if (!turnstile.ok) return jsonError(turnstile.error, turnstile.status);
}
```

회원은 `profiles.nickname`을 서버에서 읽고 `user.id`를 사용한다. 댓글 insert 후 parent comment 또는 post의 `user_id`와 preview를 조회하고 대상이 작성자와 다르면 기존 `notifications` row를 만든다. notification 실패는 댓글 성공을 되돌리지 않으며 고정 오류 문구만 기록한다.

- [ ] **Step 4: BoardDetailClient 단일 route·single-use token 적용**

`captchaVerified`, `captchaPendingAction`, `sessionStorage.turnstile_verified`, 회원 direct insert 분기를 제거한다. 회원과 guest 모두 같은 fetch를 사용하되 guest만 token을 요구한다.

```ts
const handleSaveComment = async (verifiedToken?: string) => {
  if (!user && !verifiedToken) {
    setShowCaptcha(true);
    return;
  }
  const response = await fetch("/api/board/comments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      post_id: post.id,
      content: newComment.trim(),
      parent_id: replyingTo?.id ?? null,
      author: user ? null : guestNickname.trim(),
      password: user ? null : guestPassword,
      turnstileToken: user ? null : verifiedToken,
    }),
  });
  // 기존 toast·상태 reset·fetchComments 유지
};

const handleTurnstileVerify = (token: string) => {
  setShowCaptcha(false);
  void handleSaveComment(token);
};
```

modal 문구는 “비회원 댓글을 등록하려면 보안 인증을 완료해주세요.”로 바꾸고 위젯에 `action={TURNSTILE_ACTIONS.comment}`를 전달한다. 요청 이후 modal이 unmount되어 사용한 token이 재사용되지 않게 한다.

- [ ] **Step 5: GREEN·호출부 검사·커밋**

Run:

```bash
npx vitest run tests/board-comment-write-boundary.test.ts tests/board-turnstile-client.test.ts tests/board-post-write-boundary.test.ts tests/board-guest-turnstile.test.ts tests/board-write-quota.test.ts
npx eslint app/api/board/comments/route.ts components/board/BoardDetailClient.tsx tests/board-comment-write-boundary.test.ts tests/board-turnstile-client.test.ts
npx tsc --noEmit --pretty false
rg -n 'supabase\.from\("comments"\)\.insert|turnstile_verified|/api/board/turnstile' components/board/BoardDetailClient.tsx app components tests
rg -n 'TurnstileWidget' components app
git diff --check
```

Expected: 첫 검색 0건, 모든 widget caller action 전달, 종료 코드 0.

```bash
git add app/api/board/comments/route.ts components/board/BoardDetailClient.tsx tests/board-comment-write-boundary.test.ts tests/board-turnstile-client.test.ts
git commit -m "fix: 댓글 Turnstile 및 회원 저장 경계 서버 통합"
```

---

### Task 5: 필수 gate·보고서·배포 검증 문서 갱신

**Files:**
- Modify: `package.json`
- Modify: `docs/reviews/2026-07-15-feature-code-review.md`
- Modify: `docs/superpowers/specs/2026-07-18-board-turnstile-write-boundary-design.md`
- Modify: `docs/superpowers/plans/2026-07-18-board-turnstile-write-boundary.md`
- Modify: `docs/superpowers/specs/2026-07-18-p1-release-gate-design.md`

**Interfaces:**
- Consumes: Task 1~4 테스트 5개
- Produces: `verify:admin` 필수 회귀와 P1 해결 추적

- [ ] **Step 1: verify:admin에 신규 보안 테스트 편입**

`package.json`의 `verify:admin`에 다음을 추가한다.

```text
tests/board-guest-turnstile.test.ts
tests/board-write-quota.test.ts
tests/board-post-write-boundary.test.ts
tests/board-comment-write-boundary.test.ts
tests/board-turnstile-client.test.ts
```

- [ ] **Step 2: 통합 리뷰 보고서 갱신**

P1 10번을 해결로 표시하고 다음 근거를 기록한다.

- standalone verify route와 sessionStorage 면제 제거
- 실제 post/comment write 요청의 single-use token·action 검증
- 회원 댓글 서버 route 통합과 notification 보존
- Supabase 원자적 post 60초/comment 10초 quota
- RLS·grant·RPC 권한과 migration 선적용
- 운영 migration·운영 쓰기 미실행

P1 미해결 수는 8건에서 Turnstile 한 건만 차감해 7건으로 기록한다. 다른 P1/P2는 해결 처리하지 않는다.

- [ ] **Step 3: fresh 전체 검증**

Run:

```bash
npm run verify:core
npm run verify:analysis
npm run verify:admin
npm test -- --runInBand
env DOTENV_CONFIG_PATH=.env.local node --require ./node_modules/dotenv/config node_modules/vitest/vitest.mjs run
npx eslint lib/board/turnstileContract.ts lib/board/turnstile.server.ts lib/board/writeQuota.server.ts app/api/posts/write/route.ts app/api/board/posts/route.ts app/api/board/comments/route.ts components/board/TurnstileWidget.tsx components/board/BoardWriteClient.tsx components/board/BoardDetailClient.tsx tests/board-guest-turnstile.test.ts tests/board-write-quota.test.ts tests/board-post-write-boundary.test.ts tests/board-comment-write-boundary.test.ts tests/board-turnstile-client.test.ts
git diff --check
```

실제 파일·테스트 수, skip 수, ESLint 오류·경고, TypeScript 결과를 보고서에 기록한다. 실행하지 않은 운영 항목은 통과로 표시하지 않는다.

- [ ] **Step 4: 실제 Chrome 안전 회귀**

로컬 서버를 띄우고 actual Chrome에서 다음을 확인한다.

1. guest 게시글 작성 화면에 widget container와 인증 안내가 렌더됨
2. token 없이 저장할 때 API 요청 없이 안내됨
3. 게시글 상세 guest 댓글에서 modal과 `guest_comment` widget 렌더됨
4. 회원 로그인 상태가 준비된 경우 댓글 UI가 widget 없이 route를 사용함
5. 브라우저 console error 0

실제 Siteverify 성공은 공식 test key가 로컬 env에 이미 명시된 경우에만 실행한다. 운영 key·운영 DB로 글이나 댓글을 만들지 않는다.

- [ ] **Step 5: 금지 경계·migration 검증**

Run:

```bash
rg -n 'turnstile_verified|/api/board/turnstile' app components lib tests
rg -n 'supabase\.from\("comments"\)\.insert' components/board/BoardDetailClient.tsx
rg -n 'console\.log' lib/board app/api/posts/write/route.ts app/api/board/posts/route.ts app/api/board/comments/route.ts components/board/TurnstileWidget.tsx components/board/BoardWriteClient.tsx components/board/BoardDetailClient.tsx
git status --short
```

임시 PostgreSQL에서 migration을 적용해 첫 요청 true, 같은 window 두 번째 false, window 만료 후 true, invalid scope false, anon/authenticated execute false, service_role execute true를 확인한다.

- [ ] **Step 6: 문서 커밋 및 fresh 리뷰**

```bash
git add package.json docs/reviews/2026-07-15-feature-code-review.md docs/superpowers/specs/2026-07-18-board-turnstile-write-boundary-design.md docs/superpowers/plans/2026-07-18-board-turnstile-write-boundary.md docs/superpowers/specs/2026-07-18-p1-release-gate-design.md
git commit -m "docs: 게시판 Turnstile P1 조치 결과 반영"
```

Task 1~5 전체 diff를 fresh 서브에이전트가 보안·동시성·무료 플랜·회귀 관점으로 리뷰한다. Critical·Important는 같은 작업 범위에서 수정하고 재리뷰한다.

---

## Plan Self-Review

- 설계의 동일 요청 Siteverify, single-use token, action 검증을 Task 1·3·4에 연결했다.
- 분산 Vercel quota, RLS·권한·원자적 SQL을 Task 2와 PostgreSQL 실행 검증에 연결했다.
- 모든 웹 guest write route와 회원 댓글 direct insert 제거를 Task 3·4에 포함했다.
- 기존 notification 보존을 Task 4 행위 테스트에 포함했다.
- 무료 플랜에서 외부 유료 dependency와 per-request cleanup scan을 추가하지 않는다.
- P1 해결 수는 Turnstile 한 건만 차감한다.
- 운영 migration·운영 DB 쓰기·운영 key Siteverify를 로컬 완료 증거로 사용하지 않는다.
