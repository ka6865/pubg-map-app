# Hotdrop GitHub Actions 전용 실행 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공개 hotdrop cron endpoint와 Vercel Cron을 제거하고, 안전 제한이 적용된 hotdrop 수집 작업을 GitHub Actions에서만 실행한다.

**Architecture:** 기존 Next route의 PUBG 조회·좌표 집계·Supabase 저장을 환경 독립 모듈 `runHotdropCollection()`으로 추출한다. 얇은 `scripts/run_hotdrop.ts`가 필수 환경변수와 처리량 설정을 검증해 모듈을 호출하며, GitHub Actions daily workflow의 마지막 단계만 이 script를 실행한다.

**Tech Stack:** TypeScript, Vitest, Supabase JS, GitHub Actions, Node.js 22, PUBG API

## Global Constraints

- 모든 설명·계획·커밋 메시지는 한국어로 작성하고 코드 식별자는 영문 표준을 따른다.
- `app/api/cron/hotdrop/route.ts`와 hotdrop Vercel Cron을 최종 상태에서 제거한다.
- hotdrop 실행을 위한 HTTP endpoint와 cron secret을 새로 만들지 않는다.
- GitHub Actions 외의 제품 코드에서 `runHotdropCollection`을 호출하지 않는다.
- 현재 시즌이 확정되기 전에는 `hotdrop_heatmap` delete 또는 upsert를 실행하지 않는다.
- 처리량과 telemetry byte 상한을 초과하거나 설정이 잘못되면 fail-closed한다.
- service-role key, PUBG API key, telemetry URL, player ID, match ID, 외부 오류 원문을 로그에 남기지 않는다.
- DB schema, migration, 기존 hotdrop row, 전술 점수, 티어, 분석 버전은 변경하지 않는다.
- 변경 범위에서 `console.log`, 사용하지 않는 import, 주석 처리된 debug 코드를 남기지 않는다.
- 각 구현은 실패 테스트를 먼저 실행하고 최소 코드로 통과시킨다.

---

## File Map

- `lib/hotdrop/runHotdropCollection.ts`: 설정 파싱, PUBG 조회, telemetry 제한, grid 집계, Supabase 저장을 담당한다.
- `tests/hotdrop-job.test.ts`: 작업 모듈의 시즌·처리량·메모리·DB 실패 계약을 검증한다.
- `scripts/run_hotdrop.ts`: GitHub Actions용 환경변수 검증과 프로세스 종료 코드를 담당한다.
- `tests/hotdrop-script.test.ts`: script 환경 경계와 외부 의존성 생성 전 거부를 검증한다.
- `.github/workflows/daily-tasks.yml`: daily maintenance 마지막에 hotdrop script를 실행한다.
- `tests/hotdrop-boundary.test.ts`: route·Vercel Cron 제거와 GitHub Actions 단독 소비를 고정한다.
- `app/api/cron/hotdrop/route.ts`: 삭제한다.
- `vercel.json`: hotdrop Cron만 포함하므로 삭제한다.
- `package.json`: 신규 테스트를 `verify:analysis`에 포함한다.
- `docs/reviews/2026-07-15-feature-code-review.md`: P1 해결 상태와 최종 검증 수치를 기록한다.

---

### Task 1: Hotdrop 작업 모듈과 안전 제한 추출

**Files:**
- Create: `lib/hotdrop/runHotdropCollection.ts`
- Create: `tests/hotdrop-job.test.ts`

**Interfaces:**
- Produces: `parseHotdropConfig(env): HotdropJobConfig`
- Produces: `runHotdropCollection(apiKey, config, dependencies): Promise<HotdropJobResult>`
- Consumes: `HotdropDependencies.fetchFn`, `HotdropDependencies.supabase`, `HotdropDependencies.sleep`, `HotdropDependencies.now`

- [ ] **Step 1: 설정과 시즌 fail-closed 테스트를 작성한다**

`tests/hotdrop-job.test.ts`에 다음 계약을 작성한다.

```ts
import { describe, expect, it, vi } from "vitest";
import {
  parseHotdropConfig,
  runHotdropCollection,
  type HotdropDependencies,
} from "../lib/hotdrop/runHotdropCollection";

const defaultConfig = parseHotdropConfig({});

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...init.headers },
    ...init,
  });
}

function createSupabaseMock() {
  const rpc = vi.fn().mockResolvedValue({ error: null });
  const neq = vi.fn().mockResolvedValue({ error: null });
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn(() => ({
    delete: vi.fn(() => ({ neq })),
    upsert,
  }));
  return { adapter: { rpc, from }, rpc, from, neq, upsert };
}

function createSuccessfulFetchSequence(telemetryResponse: Response) {
  return vi.fn()
    .mockResolvedValueOnce(jsonResponse({
      data: [{ id: "season-1", attributes: { isCurrentSeason: true } }],
    }))
    .mockResolvedValueOnce(jsonResponse({
      data: { relationships: { players: { data: [{ id: "account-1" }] } } },
    }))
    .mockResolvedValueOnce(jsonResponse({
      data: { relationships: { matches: { data: [{ id: "match-1" }] } } },
    }))
    .mockResolvedValueOnce(jsonResponse({
      data: { attributes: { mapName: "Baltic_Main" } },
      included: [{ type: "asset", attributes: { URL: "https://telemetry.test/1" } }],
    }))
    .mockResolvedValueOnce(telemetryResponse);
}

it("현재 시즌이 없으면 DB 작업 전에 실패한다", async () => {
  const db = createSupabaseMock();
  const dependencies: HotdropDependencies = {
    fetchFn: vi.fn().mockResolvedValue(jsonResponse({ data: [] })),
    supabase: db.adapter,
    sleep: vi.fn().mockResolvedValue(undefined),
    now: () => "2026-07-15T00:00:00.000Z",
  };

  await expect(runHotdropCollection("pubg-key", defaultConfig, dependencies))
    .rejects.toThrow("현재 PUBG 시즌을 확인할 수 없습니다.");
  expect(db.from).not.toHaveBeenCalled();
  expect(db.rpc).not.toHaveBeenCalled();
});

it.each([
  ["HOTDROP_MAX_RANKERS", "0"],
  ["HOTDROP_MAX_RANKERS", "21"],
  ["HOTDROP_MAX_MATCHES_PER_RUN", "NaN"],
  ["HOTDROP_RATE_LIMIT_MS", "6499"],
  ["HOTDROP_MAX_TELEMETRY_DECOMPRESSED_BYTES", "209715201"],
])("잘못된 설정 %s=%s을 거부한다", (key, value) => {
  expect(() => parseHotdropConfig({ [key]: value })).toThrow(key);
});
```

- [ ] **Step 2: 모듈이 없어 RED인지 확인한다**

Run:

```bash
npx vitest run tests/hotdrop-job.test.ts
```

Expected: `../lib/hotdrop/runHotdropCollection` module을 찾지 못해 실패.

- [ ] **Step 3: 타입과 설정 파서를 구현한다**

`lib/hotdrop/runHotdropCollection.ts`에 다음 공개 계약과 범위 파서를 구현한다.

```ts
export interface HotdropJobConfig {
  maxRankers: number;
  matchesPerPlayer: number;
  sampleMatchLimit: number;
  maxMatchesPerRun: number;
  rateLimitMs: number;
  maxTelemetryCompressedBytes: number;
  maxTelemetryDecompressedBytes: number;
}

export interface HotdropSupabaseAdapter {
  rpc(name: string, params: Record<string, unknown>): PromiseLike<{ error: unknown }>;
  from(table: string): {
    delete(): { neq(column: string, value: string): PromiseLike<{ error: unknown }> };
    upsert(
      row: Record<string, unknown>,
      options: { onConflict: string },
    ): PromiseLike<{ error: unknown }>;
  };
}

export interface HotdropDependencies {
  fetchFn: typeof fetch;
  supabase: HotdropSupabaseAdapter;
  sleep(milliseconds: number): Promise<void>;
  now(): string;
}

export interface HotdropJobResult {
  season: string;
  source: "leaderboard" | "samples";
  totalLandings: number;
  processedMatches: number;
  skippedMatches: number;
}

const CONFIG_RULES = {
  HOTDROP_MAX_RANKERS: { fallback: 1, min: 1, max: 20 },
  HOTDROP_MATCHES_PER_PLAYER: { fallback: 2, min: 1, max: 10 },
  HOTDROP_SAMPLE_MATCH_LIMIT: { fallback: 3, min: 1, max: 20 },
  HOTDROP_MAX_MATCHES_PER_RUN: { fallback: 3, min: 1, max: 20 },
  HOTDROP_RATE_LIMIT_MS: { fallback: 6500, min: 6500, max: 60000 },
  HOTDROP_MAX_TELEMETRY_COMPRESSED_BYTES: {
    fallback: 50 * 1024 * 1024,
    min: 1024 * 1024,
    max: 100 * 1024 * 1024,
  },
  HOTDROP_MAX_TELEMETRY_DECOMPRESSED_BYTES: {
    fallback: 100 * 1024 * 1024,
    min: 1024 * 1024,
    max: 200 * 1024 * 1024,
  },
} as const;

function parseBoundedInteger(
  env: Record<string, string | undefined>,
  key: keyof typeof CONFIG_RULES,
): number {
  const rule = CONFIG_RULES[key];
  const raw = env[key];
  const value = raw === undefined || raw.trim() === "" ? rule.fallback : Number(raw);
  if (!Number.isInteger(value) || value < rule.min || value > rule.max) {
    throw new Error(`${key}는 ${rule.min}~${rule.max} 범위의 정수여야 합니다.`);
  }
  return value;
}

export function parseHotdropConfig(
  env: Record<string, string | undefined>,
): HotdropJobConfig {
  return {
    maxRankers: parseBoundedInteger(env, "HOTDROP_MAX_RANKERS"),
    matchesPerPlayer: parseBoundedInteger(env, "HOTDROP_MATCHES_PER_PLAYER"),
    sampleMatchLimit: parseBoundedInteger(env, "HOTDROP_SAMPLE_MATCH_LIMIT"),
    maxMatchesPerRun: parseBoundedInteger(env, "HOTDROP_MAX_MATCHES_PER_RUN"),
    rateLimitMs: parseBoundedInteger(env, "HOTDROP_RATE_LIMIT_MS"),
    maxTelemetryCompressedBytes: parseBoundedInteger(
      env,
      "HOTDROP_MAX_TELEMETRY_COMPRESSED_BYTES",
    ),
    maxTelemetryDecompressedBytes: parseBoundedInteger(
      env,
      "HOTDROP_MAX_TELEMETRY_DECOMPRESSED_BYTES",
    ),
  };
}
```

- [ ] **Step 4: leaderboard, samples fallback, grid/RPC 테스트를 추가한다**

동일 테스트 파일에 다음 결과를 만드는 fetch 순서를 구성한다.

```ts
it("leaderboard 매치의 landing을 grid RPC payload로 저장한다", async () => {
  const db = createSupabaseMock();
  const fetchFn = vi.fn()
    .mockResolvedValueOnce(jsonResponse({
      data: [{ id: "season-1", attributes: { isCurrentSeason: true } }],
    }))
    .mockResolvedValueOnce(jsonResponse({
      data: { relationships: { players: { data: [{ id: "account-1" }] } } },
    }))
    .mockResolvedValueOnce(jsonResponse({
      data: { relationships: { matches: { data: [{ id: "match-1" }] } } },
    }))
    .mockResolvedValueOnce(jsonResponse({
      data: { attributes: { mapName: "Baltic_Main" } },
      included: [{ type: "asset", attributes: { URL: "https://telemetry.test/1" } }],
    }))
    .mockResolvedValueOnce(jsonResponse([
      { _T: "LogParachuteLanding", character: { location: { x: 409600, y: 409600 } } },
    ]));

  const result = await runHotdropCollection("pubg-key", defaultConfig, {
    fetchFn,
    supabase: db.adapter,
    sleep: vi.fn().mockResolvedValue(undefined),
    now: () => "2026-07-15T00:00:00.000Z",
  });

  expect(result).toMatchObject({
    season: "season-1",
    source: "leaderboard",
    totalLandings: 1,
    processedMatches: 1,
    skippedMatches: 0,
  });
  expect(db.rpc).toHaveBeenCalledWith("upsert_hotdrop_counts", {
    rows: expect.stringContaining('"grid_x":128'),
  });
  expect(db.neq).toHaveBeenCalledWith("season", "season-1");
});
```

samples fallback에서는 leaderboard 응답을 500으로 만들고 `/samples`의 match ID가 처리되며 `source: "samples"`인지 검증한다.

- [ ] **Step 5: telemetry byte 제한과 DB 실패 테스트를 추가한다**

다음 케이스를 각각 작성한다.

```ts
it("Content-Length가 compressed 상한을 넘으면 body를 읽지 않고 매치를 건너뛴다", async () => {
  const db = createSupabaseMock();
  const telemetry = jsonResponse([], {
    headers: {
      "content-length": String(defaultConfig.maxTelemetryCompressedBytes + 1),
    },
  });
  const result = await runHotdropCollection("pubg-key", defaultConfig, {
    fetchFn: createSuccessfulFetchSequence(telemetry),
    supabase: db.adapter,
    sleep: vi.fn().mockResolvedValue(undefined),
    now: () => "2026-07-15T00:00:00.000Z",
  });
  expect(result).toMatchObject({ processedMatches: 1, skippedMatches: 1 });
  expect(db.rpc).not.toHaveBeenCalled();
});

it("gzip 해제 결과가 decompressed 상한을 넘으면 매치를 건너뛴다", async () => {
  const { gzipSync } = await import("node:zlib");
  const db = createSupabaseMock();
  const oversizedEvents = [{
    _T: "IgnoredEvent",
    payload: "x".repeat(1024 * 1024 + 1),
  }];
  const telemetry = new Response(gzipSync(JSON.stringify(oversizedEvents)), {
    status: 200,
  });
  const result = await runHotdropCollection("pubg-key", {
    ...defaultConfig,
    maxTelemetryDecompressedBytes: 1024 * 1024,
  }, {
    fetchFn: createSuccessfulFetchSequence(telemetry),
    supabase: db.adapter,
    sleep: vi.fn().mockResolvedValue(undefined),
    now: () => "2026-07-15T00:00:00.000Z",
  });
  expect(result.skippedMatches).toBe(1);
  expect(db.rpc).not.toHaveBeenCalled();
});

it("RPC와 fallback upsert가 모두 실패하면 작업을 실패시킨다", async () => {
  const db = createSupabaseMock();
  db.rpc.mockResolvedValue({ error: { message: "rpc failed" } });
  db.upsert.mockResolvedValue({ error: { message: "row failed" } });
  const telemetry = jsonResponse([
    { _T: "LogParachuteLanding", character: { location: { x: 100, y: 100 } } },
  ]);
  await expect(runHotdropCollection("pubg-key", defaultConfig, {
    fetchFn: createSuccessfulFetchSequence(telemetry),
    supabase: db.adapter,
    sleep: vi.fn().mockResolvedValue(undefined),
    now: () => "2026-07-15T00:00:00.000Z",
  })).rejects.toThrow("hotdrop-fallback-upsert-failed");
  expect(db.upsert).toHaveBeenCalledTimes(1);
});

it("시즌 정리 실패를 성공으로 숨기지 않는다", async () => {
  const db = createSupabaseMock();
  db.neq.mockResolvedValue({ error: { message: "cleanup failed" } });
  const fetchFn = vi.fn().mockResolvedValueOnce(jsonResponse({
    data: [{ id: "season-1", attributes: { isCurrentSeason: true } }],
  }));
  await expect(runHotdropCollection("pubg-key", defaultConfig, {
    fetchFn,
    supabase: db.adapter,
    sleep: vi.fn().mockResolvedValue(undefined),
    now: () => "2026-07-15T00:00:00.000Z",
  })).rejects.toThrow("hotdrop-season-cleanup-failed");
  expect(fetchFn).toHaveBeenCalledTimes(1);
  expect(db.rpc).not.toHaveBeenCalled();
});
```

- [ ] **Step 6: 기존 route 로직을 안전 계약에 맞춰 모듈로 구현한다**

기존 route의 `MAP_SLUG`, `MAP_SIZES`, grid 변환과 PUBG endpoint 순서를 유지한다. 다음 차이는 반드시 적용한다.

```ts
function requireCurrentSeason(data: unknown): string {
  const rows = isRecord(data) && Array.isArray(data.data) ? data.data : [];
  const current = rows.find((row) => (
    isRecord(row)
      && typeof row.id === "string"
      && isRecord(row.attributes)
      && row.attributes.isCurrentSeason === true
  ));
  if (!current || typeof current.id !== "string" || current.id.trim() === "") {
    throw new Error("현재 PUBG 시즌을 확인할 수 없습니다.");
  }
  return current.id;
}

async function readTelemetryEvents(
  response: Response,
  config: HotdropJobConfig,
): Promise<unknown[]> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength)
    && declaredLength > config.maxTelemetryCompressedBytes) {
    throw new Error("telemetry-compressed-limit");
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > config.maxTelemetryCompressedBytes) {
    throw new Error("telemetry-compressed-limit");
  }
  const output = bytes[0] === 0x1f && bytes[1] === 0x8b
    ? (await import("node:zlib")).gunzipSync(bytes, {
        maxOutputLength: config.maxTelemetryDecompressedBytes,
      })
    : bytes;
  if (output.byteLength > config.maxTelemetryDecompressedBytes) {
    throw new Error("telemetry-decompressed-limit");
  }
  const parsed: unknown = JSON.parse(output.toString("utf8"));
  if (!Array.isArray(parsed)) throw new Error("telemetry-invalid-root");
  return parsed;
}
```

개별 match의 meta/telemetry 제한 오류는 `skippedMatches`를 증가시키고 다음 match로 진행한다. 현재 시즌·cleanup·DB 저장 오류는 작업 전체를 reject한다.

- [ ] **Step 7: 모듈 테스트와 정적 검사를 통과시킨다**

Run:

```bash
npx vitest run tests/hotdrop-job.test.ts
npx tsc --noEmit --pretty false
npx eslint lib/hotdrop/runHotdropCollection.ts tests/hotdrop-job.test.ts
git diff --check
```

Expected: 모든 테스트 통과, TypeScript/ESLint errors 0, whitespace errors 0.

- [ ] **Step 8: 작업 모듈을 커밋한다**

```bash
git add lib/hotdrop/runHotdropCollection.ts tests/hotdrop-job.test.ts
git commit -m "refactor: Hotdrop 수집 작업 모듈 분리"
```

---

### Task 2: GitHub Actions 실행 경계로 전환

**Files:**
- Create: `scripts/run_hotdrop.ts`
- Create: `tests/hotdrop-script.test.ts`
- Create: `tests/hotdrop-boundary.test.ts`
- Modify: `.github/workflows/daily-tasks.yml`
- Delete: `app/api/cron/hotdrop/route.ts`
- Delete: `vercel.json`

**Interfaces:**
- Consumes: `parseHotdropConfig`, `runHotdropCollection`
- Produces: `runHotdropScript(env, dependencies): Promise<number>`
- Produces: GitHub Actions의 `Run Hotdrop Collection` step

- [ ] **Step 1: script와 최종 경계 실패 테스트를 작성한다**

`tests/hotdrop-script.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { runHotdropScript } from "../scripts/run_hotdrop";

it.each([
  "PUBG_API_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
])("필수 환경변수 %s 누락을 client 생성 전에 거부한다", async (missingKey) => {
  const env = {
    PUBG_API_KEY: "pubg-key",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
    [missingKey]: "   ",
  };
  const createSupabase = vi.fn();
  const runJob = vi.fn();
  const exitCode = await runHotdropScript(env, {
    createSupabase,
    runJob,
    writeInfo: vi.fn(),
    writeError: vi.fn(),
  });
  expect(exitCode).toBe(1);
  expect(createSupabase).not.toHaveBeenCalled();
  expect(runJob).not.toHaveBeenCalled();
});

it("잘못된 처리량 설정을 client 생성 전에 거부한다", async () => {
  const createSupabase = vi.fn();
  const exitCode = await runHotdropScript({
    PUBG_API_KEY: "pubg-key",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
    HOTDROP_MAX_MATCHES_PER_RUN: "999",
  }, {
    createSupabase,
    runJob: vi.fn(),
    writeInfo: vi.fn(),
    writeError: vi.fn(),
  });
  expect(exitCode).toBe(1);
  expect(createSupabase).not.toHaveBeenCalled();
});

it("성공 결과의 안전한 요약만 출력하고 0을 반환한다", async () => {
  const writeInfo = vi.fn();
  const runJob = vi.fn().mockResolvedValue({
    season: "season-1",
    source: "leaderboard",
    totalLandings: 10,
    processedMatches: 2,
    skippedMatches: 0,
  });
  const exitCode = await runHotdropScript({
    PUBG_API_KEY: "pubg-key",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
  }, {
    createSupabase: vi.fn().mockReturnValue({}),
    runJob,
    writeInfo,
    writeError: vi.fn(),
  });
  expect(exitCode).toBe(0);
  expect(runJob).toHaveBeenCalledTimes(1);
  expect(writeInfo).toHaveBeenCalledWith(JSON.stringify({
    season: "season-1",
    source: "leaderboard",
    totalLandings: 10,
    processedMatches: 2,
    skippedMatches: 0,
  }));
});
```

`tests/hotdrop-boundary.test.ts`:

```ts
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function collectTypeScriptFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) return collectTypeScriptFiles(entryPath);
    return /\.tsx?$/.test(entry.name) ? [entryPath] : [];
  });
}

it("공개 hotdrop route와 Vercel Cron을 제공하지 않는다", () => {
  expect(existsSync(resolve("app/api/cron/hotdrop/route.ts"))).toBe(false);
  expect(existsSync(resolve("vercel.json"))).toBe(false);
});

it("GitHub Actions만 hotdrop script를 한 번 실행한다", () => {
  const workflow = readFileSync(resolve(".github/workflows/daily-tasks.yml"), "utf8");
  expect(workflow.match(/npx tsx scripts\/run_hotdrop\.ts/g)).toHaveLength(1);
  expect(workflow).toContain("PUBG_API_KEY: ${{ secrets.PUBG_API_KEY }}");
  expect(workflow).toContain("NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}");
  expect(workflow).toContain("SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}");
});

it("작업 모듈의 제품 consumer는 실행 script 하나뿐이다", () => {
  const productFiles = [
    ...collectTypeScriptFiles(resolve("app")),
    ...collectTypeScriptFiles(resolve("lib")),
    ...collectTypeScriptFiles(resolve("scripts")),
  ];
  const consumers = productFiles.filter((file) => (
    file !== resolve("lib/hotdrop/runHotdropCollection.ts")
      && readFileSync(file, "utf8").includes("runHotdropCollection")
  ));
  expect(consumers).toEqual([resolve("scripts/run_hotdrop.ts")]);
});
```

- [ ] **Step 2: 현재 route와 Vercel Cron 때문에 RED인지 확인한다**

Run:

```bash
npx vitest run tests/hotdrop-script.test.ts tests/hotdrop-boundary.test.ts
```

Expected: script module 미존재, route/vercel.json 존재, workflow step 부재로 실패.

- [ ] **Step 3: 환경 주입형 script를 구현한다**

`scripts/run_hotdrop.ts`는 import 시 자동 실행하지 않고 공개 함수를 먼저 제공한다.

```ts
import { createClient } from "@supabase/supabase-js";
import {
  parseHotdropConfig,
  runHotdropCollection,
  type HotdropJobResult,
} from "../lib/hotdrop/runHotdropCollection";

export interface HotdropScriptDependencies {
  createSupabase(url: string, serviceRoleKey: string): Parameters<typeof runHotdropCollection>[2]["supabase"];
  runJob: typeof runHotdropCollection;
  writeInfo(message: string): void;
  writeError(message: string): void;
}

function requireEnv(env: Record<string, string | undefined>, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${key}-missing`);
  return value;
}

export async function runHotdropScript(
  env: Record<string, string | undefined>,
  dependencies: HotdropScriptDependencies,
): Promise<number> {
  try {
    const apiKey = requireEnv(env, "PUBG_API_KEY").split(" ")[0];
    const supabaseUrl = requireEnv(env, "NEXT_PUBLIC_SUPABASE_URL");
    const serviceRoleKey = requireEnv(env, "SUPABASE_SERVICE_ROLE_KEY");
    const config = parseHotdropConfig(env);
    const supabase = dependencies.createSupabase(supabaseUrl, serviceRoleKey);
    const result: HotdropJobResult = await dependencies.runJob(apiKey, config, {
      fetchFn: fetch,
      supabase,
      sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
      now: () => new Date().toISOString(),
    });
    dependencies.writeInfo(JSON.stringify(result));
    return 0;
  } catch {
    dependencies.writeError("Hotdrop 수집 작업이 실패했습니다.");
    return 1;
  }
}
```

파일 마지막에서는 CLI로 직접 실행될 때만 기본 dependencies로 호출한다. 테스트 import 시 자동 실행되지 않아야 한다.

```ts
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const isDirectRun = Boolean(process.argv[1])
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  void runHotdropScript(process.env, {
    createSupabase: (url, serviceRoleKey) => createClient(url, serviceRoleKey),
    runJob: runHotdropCollection,
    writeInfo: (message) => console.info(message),
    writeError: (message) => console.error(message),
  }).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
```

- [ ] **Step 4: GitHub Actions 마지막 단계에 script를 추가한다**

`.github/workflows/daily-tasks.yml`의 `Record Agent Rollout Readiness Snapshot` 이후에 다음 단계를 추가한다.

```yaml
      - name: Run Hotdrop Collection
        env:
          PUBG_API_KEY: ${{ secrets.PUBG_API_KEY }}
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        run: npx tsx scripts/run_hotdrop.ts
```

`continue-on-error`를 추가하지 않는다. 이 단계가 실패하면 workflow 결과가 실패여야 한다.

- [ ] **Step 5: 공개 route와 Vercel Cron을 제거한다**

```bash
git rm app/api/cron/hotdrop/route.ts vercel.json
```

제품 코드에서 `/api/cron/hotdrop`을 호출하는 새 fallback을 만들지 않는다.

- [ ] **Step 6: script와 경계 테스트를 통과시킨다**

Run:

```bash
npx vitest run tests/hotdrop-script.test.ts tests/hotdrop-boundary.test.ts tests/hotdrop-job.test.ts
rg -n "/api/cron/hotdrop|Vercel Cron Job|HOTDROP.*SECRET" app lib scripts .github vercel.json 2>/dev/null
npx tsc --noEmit --pretty false
npx eslint scripts/run_hotdrop.ts tests/hotdrop-script.test.ts tests/hotdrop-boundary.test.ts
git diff --check
```

Expected: tests pass. `rg` 결과 0건. TypeScript/ESLint errors 0.

- [ ] **Step 7: 실행 경계 전환을 커밋한다**

```bash
git add scripts/run_hotdrop.ts tests/hotdrop-script.test.ts tests/hotdrop-boundary.test.ts .github/workflows/daily-tasks.yml
git add -u app/api/cron/hotdrop/route.ts vercel.json
git commit -m "fix: Hotdrop 실행 경계를 GitHub Actions로 이전"
```

---

### Task 3: 필수 게이트와 통합 리뷰 문서 갱신

**Files:**
- Modify: `package.json`
- Modify: `docs/reviews/2026-07-15-feature-code-review.md`

**Interfaces:**
- Consumes: Task 1~2의 신규 테스트와 최종 실행 경계
- Produces: `verify:analysis` 필수 회귀 gate와 해결 상태 문서

- [ ] **Step 1: 분석 gate에 hotdrop 테스트를 추가한다**

`package.json`의 `verify:analysis` 끝에 다음 파일을 추가한다.

```text
tests/hotdrop-job.test.ts tests/hotdrop-script.test.ts tests/hotdrop-boundary.test.ts
```

- [ ] **Step 2: 통합 리뷰 문서를 실제 상태로 갱신한다**

P1 hotdrop 항목에 다음 상태를 추가한다.

```md
> 조치 상태: 해결됨
>
> - 공개 `/api/cron/hotdrop` route와 Vercel Cron 제거
> - GitHub Actions daily workflow의 직접 script 실행으로 전환
> - 시즌 확인 실패 시 cleanup 금지
> - 처리량·telemetry byte 상한과 DB fallback 오류 검증 추가
```

결론에는 최초 P1 12건 중 hotdrop 1건이 해결돼 실제 미해결 P1이 11건임을 기록한다. 실행 순서의 `CRON_SECRET fail-closed`는 `[x] Hotdrop 실행 경계를 GitHub Actions로 이전`으로 바꾼다. 다른 P1/P2 순서와 내용은 유지한다.

- [ ] **Step 3: 전체 품질 gate를 fresh 실행한다**

Run:

```bash
npm run verify:analysis
npm run verify:admin
env DOTENV_CONFIG_PATH=.env.local node --require ./node_modules/dotenv/config node_modules/vitest/vitest.mjs run
npm test -- --runInBand
npm run verify:core
npx eslint lib/hotdrop/runHotdropCollection.ts scripts/run_hotdrop.ts tests/hotdrop-job.test.ts tests/hotdrop-script.test.ts tests/hotdrop-boundary.test.ts
git diff --check
```

Expected: 모든 test command failures 0, TypeScript/ESLint errors 0. 기존 repository warnings는 수치와 파일을 보고서에 기록하되 이번 변경 경고는 0이어야 한다.

- [ ] **Step 4: 금지 경계와 커밋 범위를 확인한다**

Run:

```bash
rg -n "/api/cron/hotdrop|HOTDROP.*SECRET|Vercel Cron Job" app lib scripts .github docs/reviews/2026-07-15-feature-code-review.md
git status --short
git diff --check
```

Expected: 과거 사실을 설명하는 리뷰 문서 외 제품·workflow 결과 0건. 사용자 소유 backup 문서는 변경하지 않는다.

- [ ] **Step 5: 문서와 gate를 커밋한다**

```bash
git add package.json docs/reviews/2026-07-15-feature-code-review.md
git commit -m "docs: Hotdrop 보안 조치 결과 반영"
```

- [ ] **Step 6: 최종 커밋과 작업 트리를 확인한다**

Run:

```bash
git log -5 --oneline
git status --short
```

Expected: Hotdrop 관련 계획된 한글 커밋만 추가되고, 기존 사용자 backup 문서 외 미커밋 구현 파일이 없다.

---

## Self-Review 결과

- 설계의 GitHub Actions 단독 실행, HTTP/Vercel 제거, secret 불필요 요구를 Task 2에 연결했다.
- 시즌 fail-closed, 처리량 상한, telemetry compressed/decompressed 상한, DB fallback 오류를 Task 1 테스트와 구현에 연결했다.
- `runHotdropCollection` 공개 시그니처는 Task 1 선언과 Task 2 script 소비에서 일치한다.
- Task 2의 workflow step은 기존 daily schedule과 `workflow_dispatch`를 모두 사용하며 새 schedule을 만들지 않는다.
- Task 3에서 P1 추적 개수와 실제 미해결 개수를 구분한다.
- 운영 workflow 실행, DB row 변경, schema migration, 점수·티어 변경은 포함하지 않았다.
- placeholder와 미정 요구사항은 포함하지 않았다.
