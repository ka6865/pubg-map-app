# 텔레메트리 계약·캐시 Identity 통합 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모든 2D·3D 리플레이가 동일한 presigned payload 계약을 사용하고, R2 지도 캐시를 `match + platform + player + mode + version` identity로 분리한다.

**Architecture:** 브라우저 공용 identity·payload validator와 서버 전용 SHA-256 R2 key builder를 분리한다. 서버 cache service는 R2 본문 identity 검증과 Supabase registry 등록을 책임지고, 공용 client fetcher는 API envelope와 직접 다운로드 payload를 같은 AbortSignal로 검증한다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, Supabase JS, PostgreSQL RLS, Cloudflare R2

## Global Constraints

- 기존 `matchId + mode` 및 `matchId` 단일 R2 키는 읽지 않는다.
- 기존 R2 객체를 복사·일괄 삭제하지 않고 현재 보존 정책에 맡긴다.
- 신규 R2 key는 `telemetry-map/v{TELEMETRY_VERSION}/{platform}/{matchId}/{playerHash}/{mode}.json` 형식을 사용한다.
- `playerHash`는 accountId SHA-256의 앞 32자이며 accountId 평문을 signed URL에 노출하지 않는다.
- 지원 platform은 `steam | kakao`, mode는 `lite | full`뿐이며 누락·미지원 값은 fail-closed한다.
- 캐시 본문 identity가 요청 identity와 완전히 일치할 때만 presigned URL을 반환한다.
- 브라우저는 API envelope와 R2 payload를 모두 검증하고 두 fetch에 같은 AbortSignal을 사용한다.
- `telemetry_map_cache_entries`는 RLS를 활성화하고 공개 정책을 만들지 않는다.
- `telemetry_map_cache_entries`는 `anon`, `authenticated` 권한을 명시 회수하고 `service_role`에 필요한 CRUD 권한만 명시 부여한다.
- 배포 순서는 Supabase migration 적용 후 애플리케이션 배포다. migration 미적용 상태에서 신규 코드나 cleanup을 먼저 실행하지 않는다.
- registry 조회·upsert 오류 또는 테이블 부재는 fail-closed한다. cleanup은 registry 조회가 실패하면 어떤 DB row나 R2 객체도 삭제하지 않는다.
- service-role key, PUBG API key, signed URL, accountId, 외부 오류 stack을 사용자 응답·브라우저 로그에 남기지 않는다.
- 운영 migration 적용, 운영 cleanup 실행, 기존 R2 삭제는 수행하지 않는다.
- 전술 점수, 티어, `RESULT_VERSION`, `TELEMETRY_VERSION` 값은 변경하지 않는다.
- 모든 생산 코드 변경은 의도한 실패 테스트를 먼저 확인한 뒤 구현한다.
- 사용자 소유 `docs/reviews/2026-07-15-feature-code-review.pre-merge-user-backup.md`는 수정·추적하지 않는다.

---

## File Map

- `lib/pubg-analysis/telemetryIdentity.ts`: 브라우저·서버 공용 platform/mode/identity 타입과 검증
- `lib/pubg-analysis/telemetryCacheKey.server.ts`: Node crypto 기반 서버 전용 R2 key 생성
- `lib/pubg-analysis/telemetryPayload.ts`: payload/envelope schema와 identity 검증
- `lib/pubg-analysis/telemetryMapCache.ts`: R2 읽기·쓰기·presigned URL·registry 등록
- `lib/pubg-analysis/fetchTelemetryPayload.ts`: 브라우저 공용 API→R2 두 단계 fetch
- `lib/pubg-analysis/telemetryCleanup.ts`: cleanup 활성 경로·매치별 registry 경로 순수 계산
- `supabase/migrations/20260718152309_telemetry_map_cache_entries.sql`: service-role 전용 registry
- `app/api/pubg/telemetry/route.ts`: 검증된 새 cache service 사용
- `app/api/pubg/match/route.ts`: lite mapData를 같은 identity cache에 저장
- `hooks/useTelemetry.ts`: 공용 fetch와 platform·AbortSignal 사용
- `app/replay/3d/page.tsx`: 공용 full payload fetch 사용
- `components/stat/Squad2DMap.tsx`: 공용 full payload fetch 사용
- `components/stat/MatchCard.tsx`: 두 2D URL에 platform 전달
- `components/map/MapShell.tsx`: platform query 검증·hook 전달·닫기 정리
- `scripts/cleanup_telemetry.ts`: 신규 registry 활성 경로와 만료 객체 포함
- `tests/telemetry-identity.test.ts`: identity/key/payload/migration 계약
- `tests/telemetry-map-cache.test.ts`: cache service와 route source boundary
- `tests/telemetry-client.test.ts`: 공용 fetch·AbortSignal·오류 계약
- `tests/telemetry-consumers.test.ts`: 세 소비자와 platform 연결 경계
- `tests/telemetry-cleanup.test.ts`: registry cleanup 순수 계약

---

### Task 1: Identity·Payload·Registry 기반 구축

**Files:**
- Create: `lib/pubg-analysis/telemetryIdentity.ts`
- Create: `lib/pubg-analysis/telemetryCacheKey.server.ts`
- Create: `lib/pubg-analysis/telemetryPayload.ts`
- Create via Supabase CLI then normalize path: `supabase/migrations/20260718152309_telemetry_map_cache_entries.sql`
- Create: `tests/telemetry-identity.test.ts`

**Interfaces:**
- Produces: `parseTelemetryPlatform(value): TelemetryPlatform`
- Produces: `parseTelemetryMode(value): TelemetryMode`
- Produces: `createTelemetryIdentity(input): TelemetryIdentity`
- Produces: `telemetryIdentityEquals(left, right): boolean`
- Produces: `buildTelemetryCacheKey(identity): string`
- Produces: `createTelemetryPayload(input): TelemetryPayload`
- Produces: `parseTelemetryPayload(value, expectedIdentity?): TelemetryPayload`
- Produces: `parseTelemetryEnvelope(value): TelemetryEnvelope`

- [ ] **Step 1: identity·payload·migration 실패 테스트 작성**

`tests/telemetry-identity.test.ts`에 다음 계약을 작성한다.

```ts
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createTelemetryIdentity,
  parseTelemetryMode,
  parseTelemetryPlatform,
  telemetryIdentityEquals,
} from "../lib/pubg-analysis/telemetryIdentity";
import { buildTelemetryCacheKey } from "../lib/pubg-analysis/telemetryCacheKey.server";
import {
  createTelemetryPayload,
  parseTelemetryEnvelope,
  parseTelemetryPayload,
} from "../lib/pubg-analysis/telemetryPayload";

vi.mock("server-only", () => ({}));

const identity = createTelemetryIdentity({
  matchId: "match-1",
  platform: "kakao",
  playerId: "account.player-1",
  mode: "full",
  telemetryVersion: 60,
});

describe("telemetry identity", () => {
  it("지원 platform과 mode만 허용한다", () => {
    expect(parseTelemetryPlatform("steam")).toBe("steam");
    expect(parseTelemetryPlatform("kakao")).toBe("kakao");
    expect(() => parseTelemetryPlatform(undefined)).toThrow("platform");
    expect(() => parseTelemetryPlatform("xbox")).toThrow("platform");
    expect(parseTelemetryMode("lite")).toBe("lite");
    expect(parseTelemetryMode("full")).toBe("full");
    expect(() => parseTelemetryMode("raw")).toThrow("mode");
  });

  it("player 평문 없이 identity별 R2 key를 분리한다", () => {
    const first = buildTelemetryCacheKey(identity);
    const otherPlayer = buildTelemetryCacheKey({ ...identity, playerId: "account.player-2" });
    const otherPlatform = buildTelemetryCacheKey({ ...identity, platform: "steam" });
    const otherMode = buildTelemetryCacheKey({ ...identity, mode: "lite" });
    expect(first).toMatch(/^telemetry-map\/v60\/kakao\/match-1\/[a-f0-9]{32}\/full\.json$/);
    expect(first).not.toContain("account.player-1");
    expect(new Set([first, otherPlayer, otherPlatform, otherMode]).size).toBe(4);
  });

  it("payload와 envelope identity를 완전 검증한다", () => {
    const payload = createTelemetryPayload({
      identity,
      startTime: "2026-07-18T00:00:00.000Z",
      teammates: [],
      teamNames: ["Player"],
      events: [],
      zoneEvents: [],
      mapName: "Desert_Main",
    });
    expect(parseTelemetryPayload(payload, identity)).toEqual(payload);
    expect(telemetryIdentityEquals(payload.identity, identity)).toBe(true);
    expect(() => parseTelemetryPayload({ ...payload, identity: undefined }, identity)).toThrow();
    expect(() => parseTelemetryPayload(payload, { ...identity, playerId: "other" })).toThrow();
    expect(parseTelemetryEnvelope({
      downloadUrl: "https://r2.example/signed",
      identity,
    }).identity).toEqual(identity);
  });

  it("registry migration은 RLS와 service-role 전용 계약을 고정한다", () => {
    const sql = fs.readFileSync(
      path.resolve("supabase/migrations/20260718152309_telemetry_map_cache_entries.sql"),
      "utf8",
    );
    expect(sql).toContain("create table if not exists public.telemetry_map_cache_entries");
    expect(sql).toContain("unique (match_id, platform, player_id, mode, telemetry_version)");
    expect(sql).toContain("enable row level security");
    expect(sql).not.toMatch(/create policy/i);
    expect(sql).toContain("revoke all on table public.telemetry_map_cache_entries from anon, authenticated");
    expect(sql).toContain("grant select, insert, update, delete on table public.telemetry_map_cache_entries to service_role");
  });
});
```

- [ ] **Step 2: RED 확인**

Run:

```bash
npx vitest run tests/telemetry-identity.test.ts
```

Expected: 신규 모듈 또는 migration 파일을 찾지 못해 실패한다.

- [ ] **Step 3: 공용 identity와 payload 최소 구현**

`lib/pubg-analysis/telemetryIdentity.ts`:

```ts
export type TelemetryPlatform = "steam" | "kakao";
export type TelemetryMode = "lite" | "full";

export type TelemetryIdentity = {
  matchId: string;
  platform: TelemetryPlatform;
  playerId: string;
  mode: TelemetryMode;
  telemetryVersion: number;
};

const MATCH_ID = /^[A-Za-z0-9._-]{1,160}$/;
const PLAYER_ID = /^[A-Za-z0-9._:-]{1,200}$/;

export function parseTelemetryPlatform(value: unknown): TelemetryPlatform {
  if (value === "steam" || value === "kakao") return value;
  throw new Error("지원하지 않는 telemetry platform입니다.");
}

export function parseTelemetryMode(value: unknown): TelemetryMode {
  if (value === "lite" || value === "full") return value;
  throw new Error("지원하지 않는 telemetry mode입니다.");
}

export function createTelemetryIdentity(input: TelemetryIdentity): TelemetryIdentity {
  if (!MATCH_ID.test(input.matchId)) throw new Error("유효하지 않은 matchId입니다.");
  if (!PLAYER_ID.test(input.playerId)) throw new Error("유효하지 않은 playerId입니다.");
  if (!Number.isFinite(input.telemetryVersion) || input.telemetryVersion <= 0) {
    throw new Error("유효하지 않은 telemetryVersion입니다.");
  }
  return {
    matchId: input.matchId,
    platform: parseTelemetryPlatform(input.platform),
    playerId: input.playerId,
    mode: parseTelemetryMode(input.mode),
    telemetryVersion: input.telemetryVersion,
  };
}

export function telemetryIdentityEquals(a: TelemetryIdentity, b: TelemetryIdentity) {
  return a.matchId === b.matchId &&
    a.platform === b.platform &&
    a.playerId === b.playerId &&
    a.mode === b.mode &&
    a.telemetryVersion === b.telemetryVersion;
}
```

`lib/pubg-analysis/telemetryCacheKey.server.ts`:

```ts
import "server-only";
import { createHash } from "node:crypto";
import { createTelemetryIdentity, type TelemetryIdentity } from "./telemetryIdentity";

export function buildTelemetryCacheKey(input: TelemetryIdentity): string {
  const identity = createTelemetryIdentity(input);
  const playerHash = createHash("sha256").update(identity.playerId).digest("hex").slice(0, 32);
  return [
    "telemetry-map",
    `v${identity.telemetryVersion}`,
    identity.platform,
    identity.matchId,
    playerHash,
    `${identity.mode}.json`,
  ].join("/");
}
```

`lib/pubg-analysis/telemetryPayload.ts`는 `TelemetryPayload`, `TelemetryEnvelope` 타입과 위 테스트를 만족하는 수동 schema validator를 구현한다. validator는 `identity`, `startTime`, `mapName`, 네 배열을 직접 검사하며 `any`를 사용하지 않는다.

- [ ] **Step 4: Supabase CLI로 migration 생성 후 SQL 작성**

먼저 CLI가 생성한 migration을 사용한다.

```bash
npx supabase migration new telemetry_map_cache_entries
```

생성 파일을 `supabase/migrations/20260718152309_telemetry_map_cache_entries.sql`로 이름을 정규화하고 다음 SQL을 적용한다.

```sql
create table if not exists public.telemetry_map_cache_entries (
  id bigint generated by default as identity primary key,
  match_id text not null,
  platform text not null check (platform in ('steam', 'kakao')),
  player_id text not null,
  mode text not null check (mode in ('lite', 'full')),
  telemetry_version numeric not null,
  storage_path text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, platform, player_id, mode, telemetry_version)
);

create index if not exists telemetry_map_cache_entries_match_id_idx
  on public.telemetry_map_cache_entries (match_id);

create index if not exists telemetry_map_cache_entries_updated_at_idx
  on public.telemetry_map_cache_entries (updated_at);

alter table public.telemetry_map_cache_entries enable row level security;
revoke all on table public.telemetry_map_cache_entries from anon, authenticated;
grant select, insert, update, delete on table public.telemetry_map_cache_entries to service_role;
```

운영 DB에는 적용하지 않는다. 실제 배포 시에는 이 migration을 먼저 적용한 뒤 애플리케이션을 배포해야 한다.

- [ ] **Step 5: GREEN과 정적 검증**

Run:

```bash
npx vitest run tests/telemetry-identity.test.ts
npx tsc --noEmit --pretty false
npx eslint lib/pubg-analysis/telemetryIdentity.ts lib/pubg-analysis/telemetryCacheKey.server.ts lib/pubg-analysis/telemetryPayload.ts tests/telemetry-identity.test.ts
git diff --check
```

Expected: 테스트와 정적 검증이 모두 종료 코드 0이다.

- [ ] **Step 6: 커밋**

```bash
git add lib/pubg-analysis/telemetryIdentity.ts lib/pubg-analysis/telemetryCacheKey.server.ts lib/pubg-analysis/telemetryPayload.ts tests/telemetry-identity.test.ts supabase/migrations/20260718152309_telemetry_map_cache_entries.sql
git commit -m "feat: 텔레메트리 캐시 identity 기반 구축"
```

---

### Task 2: 서버 R2 캐시 서비스와 Route 통합

**Files:**
- Create: `lib/pubg-analysis/telemetryMapCache.ts`
- Modify: `app/api/pubg/telemetry/route.ts`
- Modify: `app/api/pubg/match/route.ts`
- Create: `tests/telemetry-map-cache.test.ts`

**Interfaces:**
- Consumes: Task 1 `TelemetryIdentity`, `TelemetryPayload`, `buildTelemetryCacheKey`
- Produces: `readTelemetryMapCache(identity, deps): Promise<TelemetryCacheHit | null>`
- Produces: `writeTelemetryMapCache(identity, payload, deps): Promise<TelemetryCacheHit>`
- Produces: route envelope `{ downloadUrl, identity }`

- [ ] **Step 1: cache service와 route boundary 실패 테스트 작성**

`tests/telemetry-map-cache.test.ts`는 실제 R2·DB 대신 아래 dependency를 주입한다.

```ts
type CacheDeps = {
  download: (key: string) => Promise<string | null>;
  upload: (key: string, body: string, contentType: string) => Promise<void>;
  sign: (key: string, expires: number) => Promise<string>;
  register: (row: {
    match_id: string;
    platform: string;
    player_id: string;
    mode: string;
    telemetry_version: number;
    storage_path: string;
    updated_at: string;
  }) => Promise<void>;
  now: () => Date;
};
```

다음 케이스를 각각 별도 테스트로 작성한다.

```ts
it("identity가 일치하는 새 key 본문만 cache hit로 반환한다");
it("identity가 없거나 다른 본문은 cache miss로 처리하고 sign하지 않는다");
it("write는 R2 업로드 후 registry를 등록하고 등록 실패를 전파한다");
it("match와 telemetry route는 legacy map key 문자열을 만들지 않는다");
it("telemetry route는 platform과 mode 누락·미지원 값을 400으로 거부한다");
it("nickname은 정규화 비교하고 canonical name으로 engine을 실행한다");
```

route boundary는 source를 읽어 legacy 패턴
`_v${TELEMETRY_VERSION}_map`, `platform || "steam"`, 직접 `downloadFromR2` 조립이 남지 않았는지 확인하고, 두 route가 `telemetryMapCache`를 import하는지 고정한다.

- [ ] **Step 2: RED 확인**

Run:

```bash
npx vitest run tests/telemetry-map-cache.test.ts
```

Expected: cache service 미존재와 기존 route legacy key 때문에 실패한다.

- [ ] **Step 3: cache service 최소 구현**

`lib/pubg-analysis/telemetryMapCache.ts`:

```ts
import "server-only";
import { buildTelemetryCacheKey } from "./telemetryCacheKey.server";
import {
  parseTelemetryPayload,
  type TelemetryPayload,
} from "./telemetryPayload";
import type { TelemetryIdentity } from "./telemetryIdentity";

export type TelemetryMapCacheDependencies = {
  download: (key: string) => Promise<string | null>;
  upload: (key: string, body: string, contentType: string) => Promise<void>;
  sign: (key: string, expiresInSeconds: number) => Promise<string>;
  register: (row: {
    match_id: string;
    platform: string;
    player_id: string;
    mode: string;
    telemetry_version: number;
    storage_path: string;
    updated_at: string;
  }) => Promise<void>;
  now: () => Date;
};

export type TelemetryCacheHit = {
  payload: TelemetryPayload;
  downloadUrl: string;
  storagePath: string;
};

export async function readTelemetryMapCache(
  identity: TelemetryIdentity,
  deps: TelemetryMapCacheDependencies,
): Promise<TelemetryCacheHit | null> {
  const storagePath = buildTelemetryCacheKey(identity);
  const body = await deps.download(storagePath);
  if (!body) return null;
  try {
    const payload = parseTelemetryPayload(JSON.parse(body), identity);
    return {
      payload,
      downloadUrl: await deps.sign(storagePath, 1800),
      storagePath,
    };
  } catch {
    return null;
  }
}

export async function writeTelemetryMapCache(
  identity: TelemetryIdentity,
  value: TelemetryPayload,
  deps: TelemetryMapCacheDependencies,
): Promise<TelemetryCacheHit> {
  const payload = parseTelemetryPayload(value, identity);
  const storagePath = buildTelemetryCacheKey(identity);
  await deps.upload(storagePath, JSON.stringify(payload), "application/json");
  await deps.register({
    match_id: identity.matchId,
    platform: identity.platform,
    player_id: identity.playerId,
    mode: identity.mode,
    telemetry_version: identity.telemetryVersion,
    storage_path: storagePath,
    updated_at: deps.now().toISOString(),
  });
  return {
    payload,
    storagePath,
    downloadUrl: await deps.sign(storagePath, 1800),
  };
}
```

- [ ] **Step 4: telemetry route 통합**

`app/api/pubg/telemetry/route.ts`는 다음 순서로 재구성한다.

1. `matchId`, `nickname` 길이·형식 검증
2. `parseTelemetryPlatform(searchParams.get("platform"))`
3. `parseTelemetryMode(searchParams.get("mode"))`
4. PUBG match에서 `normalizeName(stats.name) === normalizeName(nickname)`으로 participant 확정
5. accountId 기반 identity 생성
6. `readTelemetryMapCache` hit면 `{ downloadUrl, identity }`
7. miss면 engine 실행, `createTelemetryPayload`, `writeTelemetryMapCache`
8. 사용자 오류는 400/404, 외부·저장 오류는 제한된 500 메시지

Supabase registry adapter는 `.upsert(row, { onConflict: "match_id,platform,player_id,mode,telemetry_version" })`의 반환 `error`를 검사하고 있으면 throw한다.

- [ ] **Step 5: match route 통합**

`app/api/pubg/match/route.ts`의 legacy map upload를 제거하고, 이미 확정한 `myAccountId`로 `mode: "lite"` identity와 payload를 만든 뒤 `writeTelemetryMapCache`를 호출한다.

`match_master_telemetry`의 기존 upsert는 매치 메타데이터를 유지한다. `storage_path`에는 방금 생성한 lite `storagePath`를 넣되, 모든 플레이어별 경로의 source of truth는 신규 registry임을 주석 없이 코드 구조로 표현한다.

R2 upload, registry upsert, processed telemetry upsert의 오류를 빈 catch로 숨기지 않는다.

- [ ] **Step 6: GREEN과 호출부·선언부 검증**

Run:

```bash
npx vitest run tests/telemetry-identity.test.ts tests/telemetry-map-cache.test.ts
npx tsc --noEmit --pretty false
npx eslint lib/pubg-analysis/telemetryMapCache.ts app/api/pubg/telemetry/route.ts app/api/pubg/match/route.ts tests/telemetry-map-cache.test.ts
rg -n '_v\\$\\{TELEMETRY_VERSION\\}_map|platform.*\\|\\|.*steam' app/api/pubg/telemetry/route.ts app/api/pubg/match/route.ts
git diff --check
```

Expected: 테스트·정적 검증 종료 코드 0, 마지막 `rg` 결과 0건이다.

- [ ] **Step 7: 커밋**

```bash
git add lib/pubg-analysis/telemetryMapCache.ts app/api/pubg/telemetry/route.ts app/api/pubg/match/route.ts tests/telemetry-map-cache.test.ts
git commit -m "fix: 텔레메트리 서버 캐시 경계 통합"
```

---

### Task 3: 공용 Client Fetch와 2D·3D Platform 전달

**Files:**
- Create: `lib/pubg-analysis/fetchTelemetryPayload.ts`
- Modify: `hooks/useTelemetry.ts`
- Modify: `app/replay/3d/page.tsx`
- Modify: `components/stat/Squad2DMap.tsx`
- Modify: `components/stat/MatchCard.tsx`
- Modify: `components/map/MapShell.tsx`
- Create: `tests/telemetry-client.test.ts`
- Create: `tests/telemetry-consumers.test.ts`

**Interfaces:**
- Consumes: Task 1 `TelemetryPlatform`, `TelemetryMode`, `TelemetryPayload`, envelope validator
- Produces: `fetchTelemetryPayload(request, options): Promise<TelemetryPayload>`
- Changes: `useTelemetry(matchId, nickname, platform, mapName)`

- [ ] **Step 1: 공용 client fetch 실패 테스트 작성**

`tests/telemetry-client.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { fetchTelemetryPayload } from "../lib/pubg-analysis/fetchTelemetryPayload";

it("API와 R2 fetch에 같은 AbortSignal을 전달하고 identity를 검증한다", async () => {
  const signal = new AbortController().signal;
  const identity = {
    matchId: "match-1",
    platform: "kakao" as const,
    playerId: "account.player",
    mode: "full" as const,
    telemetryVersion: 60,
  };
  const payload = {
    identity,
    startTime: "2026-07-18T00:00:00.000Z",
    teammates: [],
    teamNames: ["Player"],
    events: [],
    zoneEvents: [],
    mapName: "Desert_Main",
  };
  const fetchFn = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({
      downloadUrl: "https://r2.example/signed",
      identity,
    }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200 }));

  await expect(fetchTelemetryPayload({
    matchId: "match-1",
    nickname: "Player",
    platform: "kakao",
    mode: "full",
  }, { fetchFn, signal })).resolves.toEqual(payload);

  expect(fetchFn).toHaveBeenCalledTimes(2);
  expect(fetchFn.mock.calls[0][1]?.signal).toBe(signal);
  expect(fetchFn.mock.calls[1][1]?.signal).toBe(signal);
  expect(String(fetchFn.mock.calls[0][0])).toContain("platform=kakao");
});

it("envelope와 payload identity가 다르면 제한된 오류로 거부한다");
it("API와 R2 status 오류에 signed URL이나 외부 오류 원문을 노출하지 않는다");
it("platform 누락과 미지원 값은 fetch 전에 거부한다");
```

- [ ] **Step 2: 소비자 source boundary 실패 테스트 작성**

`tests/telemetry-consumers.test.ts`는 source를 읽어 다음을 검증한다.

```ts
expect(useTelemetrySource).toContain("fetchTelemetryPayload");
expect(replay3dSource).toContain("fetchTelemetryPayload");
expect(squad2dSource).toContain("fetchTelemetryPayload");
expect(replay3dSource).not.toMatch(/fetch\\(.*api\\/pubg\\/telemetry/);
expect(squad2dSource).not.toMatch(/fetch\\(.*api\\/pubg\\/telemetry/);
expect(mapShellSource).toContain("playbackPlatform");
expect(mapShellSource).toMatch(/useTelemetry\\(playbackId, playbackNickname, playbackPlatform, activeMapId\\)/);
expect(matchCardSource.match(/platform=\\$\\{encodeURIComponent\\(platform\\)\\}/g)).toHaveLength(2);
```

Kakao URL과 누락 platform 거부, close 시 네 query 제거도 source 계약으로 고정한다.

- [ ] **Step 3: RED 확인**

Run:

```bash
npx vitest run tests/telemetry-client.test.ts tests/telemetry-consumers.test.ts
```

Expected: 공용 fetch 모듈 미존재와 기존 소비자 직접 fetch 때문에 실패한다.

- [ ] **Step 4: 공용 fetch 최소 구현**

`lib/pubg-analysis/fetchTelemetryPayload.ts`:

```ts
import getApiUrl from "../api-config";
import {
  parseTelemetryMode,
  parseTelemetryPlatform,
  telemetryIdentityEquals,
  type TelemetryMode,
  type TelemetryPlatform,
} from "./telemetryIdentity";
import {
  parseTelemetryEnvelope,
  parseTelemetryPayload,
  type TelemetryPayload,
} from "./telemetryPayload";

type Request = {
  matchId: string;
  nickname: string;
  platform: TelemetryPlatform;
  mapName?: string;
  mode: TelemetryMode;
};

type Options = {
  signal?: AbortSignal;
  fetchFn?: typeof fetch;
};

export async function fetchTelemetryPayload(
  request: Request,
  options: Options = {},
): Promise<TelemetryPayload> {
  const platform = parseTelemetryPlatform(request.platform);
  const mode = parseTelemetryMode(request.mode);
  const query = new URLSearchParams({
    matchId: request.matchId,
    nickname: request.nickname,
    platform,
    mode,
  });
  if (request.mapName) query.set("mapName", request.mapName);
  const fetchFn = options.fetchFn ?? fetch;

  const apiResponse = await fetchFn(
    getApiUrl(`/api/pubg/telemetry?${query.toString()}`),
    { signal: options.signal, cache: "no-store" },
  );
  if (!apiResponse.ok) throw new Error("텔레메트리 요청에 실패했습니다.");
  const envelope = parseTelemetryEnvelope(await apiResponse.json());

  const directResponse = await fetchFn(envelope.downloadUrl, {
    signal: options.signal,
    cache: "no-store",
  });
  if (!directResponse.ok) throw new Error("텔레메트리 다운로드에 실패했습니다.");
  const payload = parseTelemetryPayload(await directResponse.json(), envelope.identity);
  if (!telemetryIdentityEquals(payload.identity, envelope.identity)) {
    throw new Error("텔레메트리 identity 검증에 실패했습니다.");
  }
  return payload;
}
```

- [ ] **Step 5: hook·3D·Squad 2D 통합**

- `useTelemetry`은 `platform`을 세 번째 인자로 받고 effect마다 `AbortController`를 생성한다.
- `fetchTelemetry`은 mode에 맞춰 공용 함수를 호출하고 기존 state 조립만 유지한다.
- effect cleanup은 controller를 abort하고 animation 상태를 정리한다.
- 3D는 query platform을 `parseTelemetryPlatform`으로 검증하고 `mode: "full"` 공용 fetch를 사용한다.
- Squad 2D는 prop platform과 `mode: "full"` 공용 fetch를 사용하며 effect cleanup에서 abort한다.
- 세 소비자에서 직접 `/api/pubg/telemetry` fetch와 `downloadUrl` 분기를 삭제한다.
- 브라우저 catch에서 외부 Error 객체를 `console.error`로 출력하지 않는다.

- [ ] **Step 6: MatchCard·MapShell platform 동기화**

- 간이 2D와 고정밀 2D `router.push` URL에 `platform=${encodeURIComponent(platform)}`을 추가한다.
- `MapShell`은 `searchParams.get("platform")`이 `steam|kakao`일 때만 `playbackPlatform`을 만들고, playback 중 누락·미지원이면 hook을 호출하지 않고 사용자 오류를 표시한다.
- `useTelemetry(playbackId, playbackNickname, playbackPlatform, activeMapId)`로 호출한다.
- 닫기 동작에서 `playback`, `nickname`, `platform`, `mode`를 제거한다.

- [ ] **Step 7: GREEN과 호출부 전수 검사**

Run:

```bash
npx vitest run tests/telemetry-client.test.ts tests/telemetry-consumers.test.ts
rg -n 'useTelemetry\\(' hooks components app
rg -n '/api/pubg/telemetry' hooks/useTelemetry.ts app/replay/3d/page.tsx components/stat/Squad2DMap.tsx
npx tsc --noEmit --pretty false
npx eslint lib/pubg-analysis/fetchTelemetryPayload.ts hooks/useTelemetry.ts app/replay/3d/page.tsx components/stat/Squad2DMap.tsx components/stat/MatchCard.tsx components/map/MapShell.tsx tests/telemetry-client.test.ts tests/telemetry-consumers.test.ts
git diff --check
```

Expected: 신규 테스트·정적 검증 종료 코드 0, 직접 telemetry fetch 검색 결과 0건, 모든 hook 호출이 새 4인자 시그니처와 일치한다.

- [ ] **Step 8: 커밋**

```bash
git add lib/pubg-analysis/fetchTelemetryPayload.ts hooks/useTelemetry.ts app/replay/3d/page.tsx components/stat/Squad2DMap.tsx components/stat/MatchCard.tsx components/map/MapShell.tsx tests/telemetry-client.test.ts tests/telemetry-consumers.test.ts
git commit -m "fix: 2D 3D 리플레이 공용 계약 적용"
```

---

### Task 4: Registry Cleanup 정합성

**Files:**
- Create: `lib/pubg-analysis/telemetryCleanup.ts`
- Modify: `scripts/cleanup_telemetry.ts`
- Create: `tests/telemetry-cleanup.test.ts`

**Interfaces:**
- Produces: `mergeActiveTelemetryPaths(masterRows, cacheRows): Set<string>`
- Produces: `selectTelemetryCachePathsForMatches(cacheRows, matchIds): string[]`
- Consumes: `telemetry_map_cache_entries.match_id/storage_path`

- [ ] **Step 1: cleanup 순수 계약 실패 테스트 작성**

`tests/telemetry-cleanup.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  mergeActiveTelemetryPaths,
  selectTelemetryCachePathsForMatches,
} from "../lib/pubg-analysis/telemetryCleanup";

describe("telemetry cleanup registry", () => {
  it("master와 player cache registry 경로를 모두 활성 경로로 보존한다", () => {
    expect([...mergeActiveTelemetryPaths(
      [{ storage_path: "legacy/master.json" }],
      [{ storage_path: "telemetry-map/v60/steam/match/a/lite.json" }],
    )]).toEqual([
      "legacy/master.json",
      "telemetry-map/v60/steam/match/a/lite.json",
    ]);
  });

  it("만료 match에 연결된 모든 player/mode 경로를 선택한다", () => {
    expect(selectTelemetryCachePathsForMatches([
      { match_id: "m1", storage_path: "m1/player-a/lite.json" },
      { match_id: "m1", storage_path: "m1/player-b/full.json" },
      { match_id: "m2", storage_path: "m2/player-c/lite.json" },
    ], ["m1"])).toEqual([
      "m1/player-a/lite.json",
      "m1/player-b/full.json",
    ]);
  });
});
```

source boundary로 `scripts/cleanup_telemetry.ts`가 신규 테이블을 조회하고 신규 registry row 삭제 오류를 검사하며, `smartCleanup()`을 import 시 실행하지 않는 direct-run guard를 갖는지 검증한다.
또한 registry 전체 조회 또는 match별 조회가 오류를 반환하면 cleanup이 예외로 중단되고, R2 삭제와 master·registry row 삭제가 모두 0회인지 검증한다.

- [ ] **Step 2: RED 확인**

Run:

```bash
npx vitest run tests/telemetry-cleanup.test.ts
```

Expected: helper 미존재와 cleanup script 신규 registry 미연동으로 실패한다.

- [ ] **Step 3: helper와 script 최소 구현**

`lib/pubg-analysis/telemetryCleanup.ts`:

```ts
type StorageRow = { storage_path: string | null };
type CacheRow = StorageRow & { match_id: string };

export function mergeActiveTelemetryPaths(
  masterRows: StorageRow[],
  cacheRows: StorageRow[],
): Set<string> {
  return new Set(
    [...masterRows, ...cacheRows]
      .map((row) => row.storage_path)
      .filter((value): value is string => Boolean(value)),
  );
}

export function selectTelemetryCachePathsForMatches(
  rows: CacheRow[],
  matchIds: string[],
): string[] {
  const targets = new Set(matchIds);
  return rows
    .filter((row) => targets.has(row.match_id))
    .map((row) => row.storage_path)
    .filter((value): value is string => Boolean(value));
}
```

`scripts/cleanup_telemetry.ts`는 다음을 구현한다.

1. 만료 master batch의 `matchIds`로 신규 registry rows 조회
2. master path와 registry path를 합쳐 R2 삭제
3. R2 삭제 후 registry rows를 `match_id.in(...)`으로 삭제하고 error 검사
4. orphan scan 활성 경로는 master와 registry 전체 경로 합집합
5. 환경변수 검증과 실행은 `runTelemetryCleanup()` 함수로 분리하고 direct-run에서만 호출
6. registry 전체 조회와 match별 조회를 모든 삭제보다 먼저 수행하고, 어느 하나라도 실패하면 예외를 전파해 R2·DB 삭제를 전부 건너뜀

테스트에서는 실제 deletion 함수를 호출하지 않는다.

- [ ] **Step 4: GREEN과 안전 경계 검사**

Run:

```bash
npx vitest run tests/telemetry-cleanup.test.ts
npx tsc --noEmit --pretty false
npx eslint lib/pubg-analysis/telemetryCleanup.ts scripts/cleanup_telemetry.ts tests/telemetry-cleanup.test.ts
git diff --check
```

Expected: 종료 코드 0. 운영 R2·Supabase에는 접근하지 않는다.

- [ ] **Step 5: 커밋**

```bash
git add lib/pubg-analysis/telemetryCleanup.ts scripts/cleanup_telemetry.ts tests/telemetry-cleanup.test.ts
git commit -m "fix: 텔레메트리 캐시 정리 registry 연동"
```

---

### Task 5: 필수 Gate와 리뷰·프로젝트 문서 현행화

**Files:**
- Modify: `package.json`
- Modify: `docs-private/.project_context.md`
- Modify: `docs-private/.pubg-telemetry-guide.md`
- Modify: `docs/reviews/2026-07-15-feature-code-review.md`

**Interfaces:**
- Consumes: Task 1~4의 신규 테스트 5개와 실제 검증 결과
- Produces: `verify:analysis` 필수 gate와 P1 해결 추적

- [ ] **Step 1: verify gate에 신규 테스트 추가**

`package.json`의 `verify:analysis` 끝에 다음 파일을 정확히 추가한다.

```text
tests/telemetry-identity.test.ts
tests/telemetry-map-cache.test.ts
tests/telemetry-client.test.ts
tests/telemetry-consumers.test.ts
tests/telemetry-cleanup.test.ts
```

- [ ] **Step 2: 프로젝트 문서의 캐시 계약 통일**

`docs-private/.project_context.md`와 `docs-private/.pubg-telemetry-guide.md`의 지도 캐시 설명을 다음 사실로 통일한다.

```text
R2 지도 캐시 identity:
matchId + platform + playerId(accountId) + mode + TELEMETRY_VERSION

R2 key:
telemetry-map/v{TELEMETRY_VERSION}/{platform}/{matchId}/{sha256(playerId)[0:32]}/{mode}.json

클라이언트 계약:
API {downloadUrl, identity} → R2 payload → schema/identity 검증

기존 matchId 단일 키:
신규 코드에서 읽지 않고 운영 보존 정책에 따라 자연 정리
```

전술 계산식과 원본 이벤트 의미는 변경하지 않았음을 명시한다.

- [ ] **Step 3: 통합 코드리뷰 보고서 갱신**

`docs/reviews/2026-07-15-feature-code-review.md`에서 P1 1~3을 해결 상태로 표시하고 다음 근거를 기록한다.

- 공용 fetch SDK 적용
- cache identity·본문 검증
- Kakao platform 필수 전달
- registry·cleanup 정합성
- 운영 migration 미적용·운영 삭제 없음
- 운영 적용 순서는 migration 선적용 후 애플리케이션 배포이며 registry 조회 실패 시 cleanup 전체 중단

기존 미해결 P1 11건에서 해결 3건을 차감해 실제 미해결 P1을 8건으로 기록한다. 다른 P1/P2는 해결 처리하지 않는다.

- [ ] **Step 4: fresh 전체 검증**

Run:

```bash
npm run verify:analysis
npm run verify:admin
env DOTENV_CONFIG_PATH=.env.local node --require ./node_modules/dotenv/config node_modules/vitest/vitest.mjs run
npm test -- --runInBand
npm run verify:core
npx eslint lib/pubg-analysis/telemetryIdentity.ts lib/pubg-analysis/telemetryCacheKey.server.ts lib/pubg-analysis/telemetryPayload.ts lib/pubg-analysis/telemetryMapCache.ts lib/pubg-analysis/fetchTelemetryPayload.ts lib/pubg-analysis/telemetryCleanup.ts app/api/pubg/telemetry/route.ts app/api/pubg/match/route.ts hooks/useTelemetry.ts app/replay/3d/page.tsx components/stat/Squad2DMap.tsx components/stat/MatchCard.tsx components/map/MapShell.tsx scripts/cleanup_telemetry.ts tests/telemetry-identity.test.ts tests/telemetry-map-cache.test.ts tests/telemetry-client.test.ts tests/telemetry-consumers.test.ts tests/telemetry-cleanup.test.ts
git diff --check
```

각 명령의 실제 파일·테스트 수, skip 수, ESLint 오류·경고, TypeScript 오류를 보고서에 기록한다. 실행하지 않은 운영 항목은 통과로 적지 않는다.

- [ ] **Step 5: 금지 경계 확인**

Run:

```bash
rg -n '_v\\$\\{TELEMETRY_VERSION\\}_map|platform.*\\|\\|.*steam' app/api/pubg/telemetry/route.ts app/api/pubg/match/route.ts
rg -n '/api/pubg/telemetry' hooks/useTelemetry.ts app/replay/3d/page.tsx components/stat/Squad2DMap.tsx
rg -n 'telemetry_map_cache_entries' supabase/migrations/20260718152309_telemetry_map_cache_entries.sql lib scripts tests
git status --short
```

Expected:

- 첫 두 검색 결과 0건
- registry 사용처는 migration, cache service, cleanup, 테스트에만 존재
- 사용자 backup 파일만 untracked이며 변경 파일은 커밋 대상과 일치

- [ ] **Step 6: 커밋**

```bash
git add package.json docs-private/.project_context.md docs-private/.pubg-telemetry-guide.md docs/reviews/2026-07-15-feature-code-review.md
git commit -m "docs: 텔레메트리 P1 조치 결과 반영"
```

---

## Self-Review 결과

- 설계의 기존 R2 무삭제·구 키 미사용 정책을 Task 2와 Task 5에 연결했다.
- 공용 identity 타입과 Node crypto key builder를 분리해 브라우저 bundle 경계를 보존했다.
- 서버 cache 본문 검증과 브라우저 direct payload 검증을 각각 Task 2와 Task 3에 연결했다.
- `match_master_telemetry.storage_path` 단일성 문제를 신규 registry와 cleanup 합집합으로 해결했다.
- Kakao platform은 MatchCard URL부터 MapShell, hook, 공용 fetch, API까지 전 경로를 포함했다.
- Task 4 테스트는 운영 cleanup을 실행하지 않고 순수 helper와 source boundary만 검증한다.
- migration은 local 파일만 생성하며 운영 적용·삭제 명령을 포함하지 않는다.
- registry 권한은 공개 role을 명시 폐쇄하고 service role만 명시 허용하며, cleanup은 registry 조회 실패 시 삭제를 시작하지 않는다.
- 신규 테스트 5개가 Task 5의 `verify:analysis`에 편입된다.
- P1 미해결 수는 11건에서 세 항목만 차감한 8건이며 다른 항목은 유지한다.
- placeholder, 미정 요구사항, 다른 Task의 정의에 의존하는 불명확한 함수 시그니처가 없다.
