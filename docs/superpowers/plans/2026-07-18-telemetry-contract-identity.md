# 텔레메트리 계약·캐시 Identity 통합 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모든 2D·3D 리플레이가 동일한 presigned payload 계약을 사용하고, R2 지도 캐시를 `match + platform + player + mode + version` identity로 분리한다.

**Architecture:** 원본 accountId를 갖는 서버 identity와 SHA-256 `playerKey`만 갖는 공개 identity를 분리한다. 서버 cache service는 R2 본문 공개 identity 검증과 Supabase registry 등록을 책임지고, 공용 client fetcher는 API envelope와 직접 다운로드 payload를 같은 AbortSignal로 검증한다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, Supabase JS, PostgreSQL RLS, Cloudflare R2

## Global Constraints

- Vercel, Supabase, Cloudflare R2 무료 플랜 범위에서 동작해야 하며 유료 기능이나 상시 실행 worker를 전제하지 않는다.
- 요청당 DB·R2 왕복과 저장 중복을 최소화하고 대량 migration·전체 R2 반복 스캔을 수행하지 않는다.
- 변동 가능한 무료 한도 수치를 코드에 하드코딩하지 않는다.
- 기존 `matchId + mode` 및 `matchId` 단일 R2 키는 읽지 않는다.
- 기존 R2 객체를 복사·일괄 삭제하지 않고 현재 보존 정책에 맡긴다.
- 신규 R2 key는 `telemetry-map/v{TELEMETRY_VERSION}/{platform}/{matchId}/{playerHash}/{mode}.json` 형식을 사용한다.
- `playerHash`는 accountId SHA-256의 앞 32자이며 accountId 평문을 signed URL에 노출하지 않는다.
- API envelope와 브라우저 전달용 R2 지도 payload는 원본 accountId/`playerId` 대신 동일한 SHA-256 앞 32자인 `playerKey`만 포함한다.
- 서버 전용 private `_analyze.json` 중간 캐시는 raw identity를 유지할 수 있지만 signed URL이나 API 응답으로 반환하지 않는다.
- 지원 platform은 `steam | kakao`, mode는 `lite | full`뿐이며 누락·미지원 값은 fail-closed한다.
- 캐시 본문 identity가 요청 identity와 완전히 일치할 때만 presigned URL을 반환한다.
- 브라우저는 API envelope와 R2 payload를 모두 검증하고 두 fetch에 같은 AbortSignal을 사용한다.
- `telemetry_map_cache_entries`는 RLS를 활성화하고 공개 정책을 만들지 않는다.
- `telemetry_map_cache_entries`는 `anon`, `authenticated` 권한을 명시 회수하고 `service_role`에 필요한 CRUD 권한만 명시 부여한다.
- 배포 순서는 Supabase migration 적용 후 애플리케이션 배포다. migration 미적용 상태에서 신규 코드나 cleanup을 먼저 실행하지 않는다.
- registry 조회·upsert 오류 또는 테이블 부재는 fail-closed한다. cleanup은 registry 조회가 실패하면 어떤 DB row나 R2 객체도 삭제하지 않는다.
- R2 payload 파싱·공개 identity 불일치만 cache miss로 처리하며 signer 실패는 전파한다.
- telemetry map cache write는 R2 필수 설정이 없으면 fail-closed한다.
- 유효한 기존 분석 캐시는 먼저 반환하되, 새 분석은 R2 미설정을 PUBG telemetry fetch·AnalysisEngine 실행 전에 503으로 차단한다.
- 분석 엔진은 PUBG participant의 canonical nickname을 사용하고 background 재분석은 Next.js `after()`로 등록하며 실패를 sanitized 운영 기록으로 남긴다.
- raw accountId는 값 형식과 무관하게 항상 해시하고, 신규 match 응답에는 raw `mapData`를 포함하지 않는다.
- service-role key, PUBG API key, signed URL, accountId, 외부 오류 stack을 사용자 응답·브라우저 로그에 남기지 않는다.
- 운영 migration 적용, 운영 cleanup 실행, 기존 R2 삭제는 수행하지 않는다.
- 전술 점수, 티어, `RESULT_VERSION`, `TELEMETRY_VERSION` 값은 변경하지 않는다.
- 모든 생산 코드 변경은 의도한 실패 테스트를 먼저 확인한 뒤 구현한다.
- 사용자 소유 `docs/reviews/2026-07-15-feature-code-review.pre-merge-user-backup.md`는 수정·추적하지 않는다.

---

## File Map

- `lib/pubg-analysis/telemetryIdentity.ts`: platform/mode와 서버·공개 identity 타입, 공개 identity 검증
- `lib/pubg-analysis/telemetryCacheKey.server.ts`: Node crypto 기반 서버 전용 R2 key와 공개 `playerKey` 생성
- `lib/pubg-analysis/telemetryPayload.ts`: payload/envelope schema와 identity 검증
- `lib/pubg-analysis/telemetryMapCache.ts`: R2 읽기·쓰기·presigned URL·registry 등록
- `lib/pubg-analysis/fetchTelemetryPayload.ts`: 브라우저 공용 API→R2 두 단계 fetch
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
- Produces: `createTelemetryIdentity(input): TelemetryIdentity` (서버용 원본 accountId)
- Produces: `createTelemetryPublicIdentity(input): TelemetryPublicIdentity`
- Produces: `telemetryPublicIdentityEquals(left, right): boolean`
- Produces: `buildTelemetryPlayerKey(playerId): string`
- Produces: `buildTelemetryCacheKey(identity): string`
- Produces: `createTelemetryPayload(input): TelemetryPayload`
- Produces: `parseTelemetryPayload(value, expectedIdentity?): TelemetryPayload`
- Produces: `parseTelemetryEnvelope(value): TelemetryEnvelope`

- [x] **Step 1: identity·payload·migration 실패 테스트 작성**

`tests/telemetry-identity.test.ts`에 다음 계약을 작성한다.

```ts
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createTelemetryIdentity,
  createTelemetryPublicIdentity,
  parseTelemetryMode,
  parseTelemetryPlatform,
  telemetryPublicIdentityEquals,
} from "../lib/pubg-analysis/telemetryIdentity";
import {
  buildTelemetryCacheKey,
  buildTelemetryPlayerKey,
} from "../lib/pubg-analysis/telemetryCacheKey.server";
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
const publicIdentity = createTelemetryPublicIdentity({
  matchId: identity.matchId,
  platform: identity.platform,
  playerKey: buildTelemetryPlayerKey(identity.playerId),
  mode: identity.mode,
  telemetryVersion: identity.telemetryVersion,
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

  it("payload와 envelope의 공개 identity를 완전 검증한다", () => {
    const payload = createTelemetryPayload({
      identity: publicIdentity,
      startTime: "2026-07-18T00:00:00.000Z",
      teammates: [],
      teamNames: ["Player"],
      events: [],
      zoneEvents: [],
      mapName: "Desert_Main",
    });
    expect(parseTelemetryPayload(payload, publicIdentity)).toEqual(payload);
    expect(telemetryPublicIdentityEquals(payload.identity, publicIdentity)).toBe(true);
    expect(() => parseTelemetryPayload({ ...payload, identity: undefined }, publicIdentity)).toThrow();
    expect(() => parseTelemetryPayload(payload, { ...publicIdentity, playerKey: "0".repeat(32) })).toThrow();
    expect(JSON.stringify(payload)).not.toContain(identity.playerId);
    expect(parseTelemetryEnvelope({
      downloadUrl: "https://r2.example/signed",
      identity: publicIdentity,
    }).identity).toEqual(publicIdentity);
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

- [x] **Step 2: RED 확인**

Run:

```bash
npx vitest run tests/telemetry-identity.test.ts
```

Expected: 신규 모듈 또는 migration 파일을 찾지 못해 실패한다.

- [x] **Step 3: 공용 identity와 payload 최소 구현**

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

export function telemetryPublicIdentityEquals(
  a: TelemetryPublicIdentity,
  b: TelemetryPublicIdentity,
) {
  return a.matchId === b.matchId &&
    a.platform === b.platform &&
    a.playerKey === b.playerKey &&
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

- [x] **Step 4: Supabase CLI로 migration 생성 후 SQL 작성**

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

- [x] **Step 5: GREEN과 정적 검증**

Run:

```bash
npx vitest run tests/telemetry-identity.test.ts
npx tsc --noEmit --pretty false
npx eslint lib/pubg-analysis/telemetryIdentity.ts lib/pubg-analysis/telemetryCacheKey.server.ts lib/pubg-analysis/telemetryPayload.ts tests/telemetry-identity.test.ts
git diff --check
```

Expected: 테스트와 정적 검증이 모두 종료 코드 0이다.

- [x] **Step 6: 커밋**

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
- Produces: route envelope `{ downloadUrl, identity: TelemetryPublicIdentity }`

- [x] **Step 1: cache service와 route boundary 실패 테스트 작성**

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
it("sign 실패는 cache miss로 숨기지 않고 전파한다");
it("write는 R2 업로드 후 registry를 등록하고 등록 실패를 전파한다");
it("R2 필수 설정이 없으면 write를 시작하지 않는다");
it("envelope과 payload에는 원본 accountId가 없고 playerKey만 있다");
it("match와 telemetry route는 legacy map key 문자열을 만들지 않는다");
it("telemetry route는 platform과 mode 누락·미지원 값을 400으로 거부한다");
it("nickname은 정규화 비교하고 canonical name으로 engine을 실행한다");
```

route boundary는 source를 읽어 legacy 패턴
`_v${TELEMETRY_VERSION}_map`, `platform || "steam"`, 직접 `downloadFromR2` 조립이 남지 않았는지 확인하고, 두 route가 `telemetryMapCache`를 import하는지 고정한다.

- [x] **Step 2: RED 확인**

Run:

```bash
npx vitest run tests/telemetry-map-cache.test.ts
```

Expected: cache service 미존재와 기존 route legacy key 때문에 실패한다.

- [x] **Step 3: cache service 최소 구현**

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

- [x] **Step 4: telemetry route 통합**

`app/api/pubg/telemetry/route.ts`는 다음 순서로 재구성한다.

1. `matchId`, `nickname` 길이·형식 검증
2. `parseTelemetryPlatform(searchParams.get("platform"))`
3. `parseTelemetryMode(searchParams.get("mode"))`
4. PUBG match에서 `normalizeName(stats.name) === normalizeName(nickname)`으로 participant 확정
5. accountId 기반 서버 identity와 공개 `playerKey` 생성
6. `readTelemetryMapCache` hit면 `{ downloadUrl, identity: publicIdentity }`
7. miss면 engine 실행, `createTelemetryPayload`, `writeTelemetryMapCache`
8. 사용자 오류는 400/404, 외부·저장 오류는 제한된 500 메시지

Supabase registry adapter는 `.upsert(row, { onConflict: "match_id,platform,player_id,mode,telemetry_version" })`의 반환 `error`를 검사하고 있으면 throw한다.

- [x] **Step 5: match route 통합**

`app/api/pubg/match/route.ts`의 legacy map upload를 제거하고, 이미 확정한 `myAccountId`로 `mode: "lite"` 서버 identity와 공개 identity payload를 만든 뒤 `writeTelemetryMapCache`를 호출한다. `AnalysisEngine`에는 PUBG participant의 canonical nickname을 전달하고 background 재분석 오류는 sanitized 운영 기록으로 남긴다.

`match_master_telemetry`의 기존 upsert는 매치 메타데이터를 유지한다. `storage_path`에는 방금 생성한 lite `storagePath`를 넣되, 모든 플레이어별 경로의 source of truth는 신규 registry임을 주석 없이 코드 구조로 표현한다.

R2 upload, registry upsert, processed telemetry upsert의 오류를 빈 catch로 숨기지 않는다.

- [x] **Step 6: GREEN과 호출부·선언부 검증**

Run:

```bash
npx vitest run tests/telemetry-identity.test.ts tests/telemetry-map-cache.test.ts
npx tsc --noEmit --pretty false
npx eslint lib/pubg-analysis/telemetryMapCache.ts app/api/pubg/telemetry/route.ts app/api/pubg/match/route.ts tests/telemetry-map-cache.test.ts
rg -n '_v\\$\\{TELEMETRY_VERSION\\}_map|platform.*\\|\\|.*steam' app/api/pubg/telemetry/route.ts app/api/pubg/match/route.ts
git diff --check
```

Expected: 테스트·정적 검증 종료 코드 0, 마지막 `rg` 결과 0건이다.

- [x] **Step 7: 커밋**

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

- [x] **Step 1: 공용 client fetch 실패 테스트 작성**

`tests/telemetry-client.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { fetchTelemetryPayload } from "../lib/pubg-analysis/fetchTelemetryPayload";

it("API와 R2 fetch에 같은 AbortSignal을 전달하고 identity를 검증한다", async () => {
  const signal = new AbortController().signal;
  const identity = {
    matchId: "match-1",
    platform: "kakao" as const,
    playerKey: "a".repeat(32),
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

- [x] **Step 2: 소비자 source boundary 실패 테스트 작성**

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

- [x] **Step 3: RED 확인**

Run:

```bash
npx vitest run tests/telemetry-client.test.ts tests/telemetry-consumers.test.ts
```

Expected: 공용 fetch 모듈 미존재와 기존 소비자 직접 fetch 때문에 실패한다.

- [x] **Step 4: 공용 fetch 최소 구현**

`lib/pubg-analysis/fetchTelemetryPayload.ts`:

```ts
import getApiUrl from "../api-config";
import {
  parseTelemetryMode,
  parseTelemetryPlatform,
  telemetryPublicIdentityEquals,
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
  if (!telemetryPublicIdentityEquals(payload.identity, envelope.identity)) {
    throw new Error("텔레메트리 identity 검증에 실패했습니다.");
  }
  return payload;
}
```

- [x] **Step 5: hook·3D·Squad 2D 통합**

- `useTelemetry`은 `platform`을 세 번째 인자로 받고 effect마다 `AbortController`를 생성한다.
- `fetchTelemetry`은 mode에 맞춰 공용 함수를 호출하고 기존 state 조립만 유지한다.
- effect cleanup은 controller를 abort하고 animation 상태를 정리한다.
- 3D는 query platform을 `parseTelemetryPlatform`으로 검증하고 `mode: "full"` 공용 fetch를 사용한다.
- 3D 자동·수동 요청은 같은 request controller/ref를 사용해 새 요청이 이전 요청을 취소하며, 전환·invalid 시 이전 replay state를 즉시 초기화한다.
- `/replay/3d` 완전 무쿼리 접근만 명시적 Steam 데모를 허용하고 일부 query만 전달되면 fail-closed한다.
- Squad 2D는 prop platform과 `mode: "full"` 공용 fetch를 사용하며 effect cleanup에서 abort한다.
- 세 소비자에서 직접 `/api/pubg/telemetry` fetch와 `downloadUrl` 분기를 삭제한다.
- 브라우저 catch에서 외부 Error 객체를 `console.error`로 출력하지 않는다.
- 공용 fetcher는 선택적 `mapName`의 길이와 제어문자를 fetch 전에 검증한다.

- [x] **Step 6: MatchCard·MapShell platform 동기화**

- 간이 2D와 고정밀 2D `router.push` URL에 `platform=${encodeURIComponent(platform)}`을 추가한다.
- `MapShell`은 `searchParams.get("platform")`이 `steam|kakao`일 때만 `playbackPlatform`을 만들고, playback 중 누락·미지원이면 hook을 호출하지 않고 사용자 오류를 표시한다.
- `useTelemetry(playbackId, playbackNickname, playbackPlatform, activeMapId)`로 호출한다.
- 닫기 동작에서 `playback`, `nickname`, `platform`, `mode`를 제거한다.

- [x] **Step 7: GREEN과 호출부 전수 검사**

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

- [x] **Step 8: 커밋**

```bash
git add lib/pubg-analysis/fetchTelemetryPayload.ts hooks/useTelemetry.ts app/replay/3d/page.tsx components/stat/Squad2DMap.tsx components/stat/MatchCard.tsx components/map/MapShell.tsx tests/telemetry-client.test.ts tests/telemetry-consumers.test.ts
git commit -m "fix: 2D 3D 리플레이 공용 계약 적용"
```

---

### Task 4: Registry Cleanup 정합성

**Files:**
- Modify: `scripts/cleanup_telemetry.ts`
- Modify: `supabase/migrations/20260718152309_telemetry_map_cache_entries.sql`
- Create: `tests/telemetry-cleanup.test.ts`

**Interfaces:**
- Produces: `cleanup_expired_telemetry_matches(text[], timestamptz, numeric)` RPC
- Consumes: `match_master_telemetry` 만료 후보와 `telemetry_map_cache_entries.updated_at`
- Produces: `{ deletedMatchCount, r2DeletionDeferred: true }`

- [x] **Step 1: cleanup 트랜잭션 계약 실패 테스트 작성**

`tests/telemetry-cleanup.test.ts`는 1,000행 초과 pagination, null-data fail-closed, 50개 RPC batch 상한, 최근 writer 보존, 비정상 RPC 반환, direct-run guard를 검증한다. migration source boundary는 table lock, cutoff 재검증, 순차 삭제, master 삭제 직전 `NOT EXISTS registry`, RPC 권한을 검증한다.

애플리케이션 R2 orphan 삭제는 stale `LastModified` 스냅샷으로 동일 deterministic key의 신규 업로드를 지울 수 있어 전면 비활성화한다. 무료 R2 저장량 누적은 후속 모니터링·immutable key 과제로 남긴다.

- [x] **Step 2: RED 확인**

Run:

```bash
npx vitest run tests/telemetry-cleanup.test.ts
```

Expected: cleanup RPC 미연동·R2 즉시 삭제·동시성 경계 부재로 실패한다.

- [x] **Step 3: RPC와 script 최소 구현**

`scripts/cleanup_telemetry.ts`는 다음을 구현한다.

1. master 만료 후보를 안정적으로 pagination 조회
2. 최대 50개 `matchIds`를 Supabase 트랜잭션 RPC에 전달
3. RPC에서 registry table lock·cutoff 재검증·관련 DB 순차 삭제 수행
4. 실제 master 삭제 성공 ID만 반환해 카운트
5. R2 삭제·목록 조회는 수행하지 않고 `r2DeletionDeferred: true` 보고
6. 환경변수 검증과 실행은 direct-run에서만 호출

테스트에서는 실제 deletion 함수를 호출하지 않는다.

- [x] **Step 4: GREEN과 안전 경계 검사**

Run:

```bash
npx vitest run tests/telemetry-cleanup.test.ts
npx tsc --noEmit --pretty false
npx eslint scripts/cleanup_telemetry.ts tests/telemetry-cleanup.test.ts
git diff --check
```

Expected: 종료 코드 0. 운영 R2·Supabase에는 접근하지 않는다.

- [x] **Step 5: 커밋 및 fresh 재리뷰**

```bash
git add scripts/cleanup_telemetry.ts supabase/migrations/20260718152309_telemetry_map_cache_entries.sql tests/telemetry-cleanup.test.ts
git commit -m "fix: 텔레메트리 정리 동시성 경계 보완"
```

실제 커밋은 `74ce270`, `1d2f475`, `4f11cdb`로 나누어 적용했고 fresh 재리뷰는 Critical 0·Important 0·Minor 0으로 통과했다.

---

### Task 5: 필수 Gate와 리뷰·프로젝트 문서 현행화

**Files:**
- Modify: `package.json`
- Modify: `docs/reviews/2026-07-15-feature-code-review.md`
- Modify: `docs/superpowers/specs/2026-07-18-telemetry-contract-identity-design.md`
- Modify: `docs/superpowers/plans/2026-07-18-telemetry-contract-identity.md`

**Interfaces:**
- Consumes: Task 1~4의 신규 테스트 7개와 실제 검증 결과
- Produces: `verify:analysis` 필수 gate와 P1 해결 추적

- [x] **Step 1: verify gate에 신규 테스트 추가**

`package.json`의 `verify:analysis` 끝에 다음 파일을 정확히 추가한다.

```text
tests/telemetry-identity.test.ts
tests/telemetry-map-cache.test.ts
tests/telemetry-client.test.ts
tests/telemetry-consumers.test.ts
tests/telemetry-cleanup.test.ts
tests/telemetry-hook-state.test.ts
tests/telemetry-replay-request.test.ts
```

- [x] **Step 2: 프로젝트 문서의 캐시 계약 통일**

공개 설계·구현 계획·통합 리뷰 문서의 지도 캐시 설명을 다음 사실로 통일한다. 기준 문서에 있던 `docs-private/.project_context.md`와 `docs-private/.pubg-telemetry-guide.md`는 현재 checkout·Git 추적 목록에 없으므로 생성하지 않고 미확인 운영 항목으로 기록한다.

```text
R2 지도 캐시 identity:
matchId + platform + playerId(accountId) + mode + TELEMETRY_VERSION

브라우저 공개 identity:
matchId + platform + playerKey(sha256(accountId)[0:32]) + mode + TELEMETRY_VERSION

R2 key:
telemetry-map/v{TELEMETRY_VERSION}/{platform}/{matchId}/{sha256(playerId)[0:32]}/{mode}.json

클라이언트 계약:
API {downloadUrl, identity} → R2 payload → schema/identity 검증

API envelope·R2 payload에는 원본 accountId/playerId를 포함하지 않음

기존 matchId 단일 키:
신규 코드에서 읽지 않고 운영 보존 정책에 따라 자연 정리
```

전술 계산식과 원본 이벤트 의미는 변경하지 않았음을 명시한다.

- [x] **Step 3: 통합 코드리뷰 보고서 갱신**

`docs/reviews/2026-07-15-feature-code-review.md`에서 P1 1~3을 해결 상태로 표시하고 다음 근거를 기록한다.

- 공용 fetch SDK 적용
- cache identity·본문 검증
- Kakao platform 필수 전달
- registry·cleanup RPC 정합성과 R2 자동 삭제 보류
- 운영 migration 미적용·운영 삭제 없음
- 운영 적용 순서는 migration 선적용 후 애플리케이션 배포이며 master 조회·cleanup RPC 실패 시 후속 batch 중단

기존 미해결 P1 11건에서 해결 3건을 차감해 실제 미해결 P1을 8건으로 기록한다. P2는 기존 보안 테스트 복구와 요청 전환 경쟁 해결만 차감해 13건을 유지한다.

- [x] **Step 4: fresh 전체 검증**

Run:

```bash
npm run verify:analysis
npm run verify:admin
env DOTENV_CONFIG_PATH=.env.local node --require ../../node_modules/dotenv/config ../../node_modules/vitest/vitest.mjs run
npm test -- --runInBand
npm run verify:core
npx eslint lib/pubg-analysis/telemetryIdentity.ts lib/pubg-analysis/telemetryCacheKey.server.ts lib/pubg-analysis/telemetryPayload.ts lib/pubg-analysis/telemetryMapCache.ts lib/pubg-analysis/fetchTelemetryPayload.ts app/api/pubg/telemetry/route.ts app/api/pubg/match/route.ts hooks/useTelemetry.ts app/replay/3d/page.tsx components/stat/Squad2DMap.tsx components/stat/MatchCard.tsx components/map/MapShell.tsx scripts/cleanup_telemetry.ts tests/telemetry-identity.test.ts tests/telemetry-map-cache.test.ts tests/telemetry-client.test.ts tests/telemetry-consumers.test.ts tests/telemetry-cleanup.test.ts
git diff --check
```

각 명령의 실제 파일·테스트 수, skip 수, ESLint 오류·경고, TypeScript 오류를 보고서에 기록한다. 실행하지 않은 운영 항목은 통과로 적지 않는다.

- [x] **Step 5: 금지 경계 확인**

Run:

```bash
rg -n '_v\\$\\{TELEMETRY_VERSION\\}_map|platform.*\\|\\|.*steam' app/api/pubg/telemetry/route.ts app/api/pubg/match/route.ts
rg -n '/api/pubg/telemetry' hooks/useTelemetry.ts app/replay/3d/page.tsx components/stat/Squad2DMap.tsx
rg -n 'telemetry_map_cache_entries' app lib scripts supabase/migrations/20260718152309_telemetry_map_cache_entries.sql tests
git status --short
```

Expected:

- 첫 두 검색 결과 0건
- registry 사용처는 migration, match·telemetry 서버 route, cleanup 테스트에만 존재
- 사용자 backup 파일은 기본 checkout에만 보존하고 이 worktree의 변경 파일은 커밋 대상과 일치

- [x] **Step 6: 커밋**

```bash
git add package.json docs/reviews/2026-07-15-feature-code-review.md docs/superpowers/specs/2026-07-18-telemetry-contract-identity-design.md docs/superpowers/plans/2026-07-18-telemetry-contract-identity.md
git commit -m "docs: 텔레메트리 P1 조치 결과 반영"
```

2026-07-18 최종 재검토 보완에서 Important 5건과 범위가 작은 Minor 3건을 TDD로 수정했다. registry는 `pending` lease reserve 후 R2 upload, SECURITY INVOKER RPC의 processed·master·ready 원자 finalize로 전환했고 cache hit도 registry 복구 뒤 URL을 반환한다. registry-only 만료 row는 최대 50개당 결정적 R2 inventory manifest 1개를 먼저 저장한 후 DB cleanup에 진입한다. 2D MapShell은 nickname·platform·mode를 함께 fail-closed 검증하고 mode를 hook dependency로 전달하며 Squad 2D 상태 reset과 latest request dead metadata를 정리했다.

재검증은 `verify:analysis` 179개, `verify:admin` 90개, 전체 Vitest 332개 통과·6개 스킵, Jest 2개, ESLint 오류 0·기존 경고 62, TypeScript 오류 0으로 종료됐다. `verify:telemetry-db`는 임시 PostgreSQL 15에서 service-role identity insert/upsert, registry-only row 감소, writer-first·cleanup-first 두 세션 경합과 원자 finalize를 통과했다. 운영 Supabase/R2/PUBG API는 호출하지 않았다. 기존 Chrome `/stats`, `/maps/erangel`, 불완전 3D query 결과는 유지하며 실제 Steam/Kakao 데이터 QA는 배포 후 gate로 남긴다.

---

## Self-Review 결과

- 설계의 기존 R2 무삭제·구 키 미사용 정책을 Task 2와 Task 5에 연결했다.
- 공용 identity 타입과 Node crypto key builder를 분리해 브라우저 bundle 경계를 보존했다.
- 서버 cache 본문 검증과 브라우저 direct payload 검증을 각각 Task 2와 Task 3에 연결했다.
- `match_master_telemetry.storage_path` 단일성 문제를 신규 registry와 결정적 R2 inventory manifest로 해결했다.
- Kakao platform은 MatchCard URL부터 MapShell, hook, 공용 fetch, API까지 전 경로를 포함했다.
- Task 4 테스트는 운영 cleanup을 실행하지 않고 임시 PostgreSQL 15에서 service-role 권한과 두 세션 경합을 검증한다.
- migration은 local 파일만 생성하며 운영 적용·삭제 명령을 포함하지 않는다.
- registry 권한은 공개 role을 명시 폐쇄하고 service role만 명시 허용하며, cleanup은 registry 조회 실패 시 삭제를 시작하지 않는다.
- 신규 회귀 테스트가 Task 5의 `verify:analysis`와 비운영 `verify:telemetry-db`에 편입된다.
- Task 3 완료 직후와 최종 통합 전 실제 Chrome에서 `/stats`, `/stats/steam/KangHeeSung_`, `/maps/erangel`, 2D·3D 리플레이를 검증한다.
- P1 미해결 수는 11건에서 세 항목만 차감한 8건이며 다른 항목은 유지한다.
- placeholder, 미정 요구사항, 다른 Task의 정의에 의존하는 불명확한 함수 시그니처가 없다.
