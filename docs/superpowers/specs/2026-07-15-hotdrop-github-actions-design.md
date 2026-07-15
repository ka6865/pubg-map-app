# Hotdrop GitHub Actions 전용 실행 설계

## 1. 목표

Hotdrop 수집 작업을 외부 HTTP endpoint와 Vercel Cron에서 완전히 분리하고, GitHub Actions의 `Daily BGMS Maintenance` workflow에서만 실행한다. 공개 실행면을 제거하는 동시에 PUBG API 호출량, 텔레메트리 메모리 사용량, 시즌 정리 안전성을 제한한다.

## 2. 현재 문제

- `app/api/cron/hotdrop/route.ts`는 `CRON_SECRET`이 없으면 인증 검사를 건너뛰어 공개 실행된다.
- `vercel.json`이 같은 route를 매일 UTC 18시에 호출하지만 GitHub Actions에는 hotdrop 실행 단계가 없다.
- 현재 시즌을 찾지 못하면 `unknown-season`을 반환한 뒤 이전 시즌 정리를 실행할 수 있어 정상 데이터 삭제 위험이 있다.
- 처리량 환경변수는 `Number()`만 사용해 `NaN`, 음수, 과도한 값에 대한 상한이 없다.
- 텔레메트리 응답을 크기 제한 없이 메모리에 적재하고 gzip을 해제한다.
- RPC 실패 후 개별 upsert fallback의 오류를 확인하지 않아 부분 저장이 성공처럼 처리될 수 있다.

## 3. 선택한 접근

HTTP route를 인증으로 보강하지 않고 제거한다. 수집 로직은 의존성을 주입받는 서버 독립 함수로 분리하고, GitHub Actions가 thin script를 직접 실행한다.

이 방식에서는 hotdrop 전용 URL과 cron secret이 존재하지 않는다. GitHub Actions runner가 이미 사용하는 PUBG·Supabase secrets만 프로세스 환경으로 전달한다.

## 4. 아키텍처

### 4.1 핵심 작업 모듈

신규 `lib/hotdrop/runHotdropCollection.ts`가 다음 책임을 가진다.

- 현재 PUBG 시즌 조회
- leaderboard 우선, samples fallback 대상 매치 선정
- 지원 맵의 telemetry URL 확인
- `LogParachuteLanding` 좌표 정규화와 256×256 셀 집계
- `upsert_hotdrop_counts` RPC 및 검증된 fallback upsert
- 현재 시즌이 확정된 경우에만 이전 시즌 데이터 정리
- 실행 결과와 안전한 실패 정보를 구조화해 반환

모듈은 환경변수나 service-role key를 직접 읽지 않는다. `fetch`, Supabase adapter, sleep 함수를 인자로 받아 단위 테스트에서 외부 통신과 대기를 대체한다.

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

export interface HotdropDependencies {
  fetchFn: typeof fetch;
  supabase: HotdropSupabaseAdapter;
  sleep: (milliseconds: number) => Promise<void>;
  now: () => string;
}

export interface HotdropJobResult {
  season: string;
  source: "leaderboard" | "samples";
  totalLandings: number;
  processedMatches: number;
  skippedMatches: number;
}

export async function runHotdropCollection(
  apiKey: string,
  config: HotdropJobConfig,
  dependencies: HotdropDependencies,
): Promise<HotdropJobResult>;
```

### 4.2 GitHub Actions 실행 스크립트

신규 `scripts/run_hotdrop.ts`는 다음 일만 수행한다.

1. `PUBG_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`가 공백이 아닌지 검사한다.
2. 처리량 환경변수를 안전한 정수 범위로 파싱한다.
3. Supabase service-role client를 생성한다.
4. `runHotdropCollection()`을 호출한다.
5. 성공 시 season, source, 처리 매치 수, landing 수만 출력한다.
6. 실패 시 token, URL, player, match, 외부 응답 원문 없이 고정 메시지를 출력하고 `process.exitCode = 1`로 종료한다.

### 4.3 실행 위치

`.github/workflows/daily-tasks.yml`의 기존 `maintenance` job 마지막에 `Run Hotdrop Collection` 단계를 추가한다. monitor·rollout snapshot 이후에 배치해 hotdrop 실패가 앞선 유지보수 단계를 건너뛰게 하지 않는다.

이 단계는 다음 GitHub Secrets만 주입한다.

- `PUBG_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

`CRON_SECRET`, hotdrop 전용 token, Vercel 환경변수는 사용하지 않는다.

## 5. 안전 제한

### 5.1 처리량

환경변수는 다음 범위를 벗어나면 시작 전에 실패한다. 자동 보정으로 운영자의 오설정을 숨기지 않는다.

| 환경변수 | 기본값 | 허용 범위 |
|---|---:|---:|
| `HOTDROP_MAX_RANKERS` | 1 | 1~20 |
| `HOTDROP_MATCHES_PER_PLAYER` | 2 | 1~10 |
| `HOTDROP_SAMPLE_MATCH_LIMIT` | 3 | 1~20 |
| `HOTDROP_MAX_MATCHES_PER_RUN` | 3 | 1~20 |
| `HOTDROP_RATE_LIMIT_MS` | 6500 | 6500~60000 |
| `HOTDROP_MAX_TELEMETRY_COMPRESSED_BYTES` | 52428800 | 1048576~104857600 |
| `HOTDROP_MAX_TELEMETRY_DECOMPRESSED_BYTES` | 104857600 | 1048576~209715200 |

### 5.2 시즌 정리

현재 시즌 응답에 `isCurrentSeason === true`인 row가 없으면 작업 전체를 실패시킨다. `unknown-season` fallback은 사용하지 않으며, 시즌이 확정되기 전에는 delete query를 만들지 않는다.

### 5.3 텔레메트리 메모리

- 신뢰 가능한 `Content-Length`가 compressed 상한을 넘으면 body를 읽기 전에 해당 매치를 건너뛴다.
- 실제 compressed byte 길이도 다시 확인한다.
- gzip 해제에는 decompressed 최대 출력 길이를 적용한다.
- JSON root가 배열이 아니면 해당 매치를 실패 처리한다.
- 개별 매치 실패는 다음 매치 처리를 계속하지만 최종 결과에 skipped count로 반영한다.

### 5.4 DB 저장

- RPC 성공 시 셀 batch를 한 번에 저장한다.
- RPC가 오류를 반환할 때만 기존 개별 upsert fallback을 사용한다.
- fallback row 중 하나라도 오류를 반환하거나 reject하면 작업을 실패시킨다.
- 이전 시즌 정리 오류도 성공으로 숨기지 않고 작업 실패로 전파한다.

## 6. 제거 대상

- `app/api/cron/hotdrop/route.ts`
- hotdrop cron만 정의하는 `vercel.json`
- 공개 route 인증을 위한 hotdrop `CRON_SECRET` 의존성

다른 admin-agent route가 사용하는 `CRON_SECRET` 또는 `ADMIN_AGENT_CRON_SECRET`은 이번 범위에서 변경하지 않는다.

## 7. 테스트 전략

### 7.1 작업 모듈 테스트

`tests/hotdrop-job.test.ts`에서 다음을 검증한다.

- 현재 시즌이 없으면 delete·RPC·upsert 전에 실패
- leaderboard 성공과 samples fallback
- 지원하지 않는 맵과 telemetry 실패 격리
- landing 좌표의 grid 변환과 RPC payload
- RPC 오류 시 fallback 및 fallback 오류 전파
- compressed/decompressed 크기 제한
- 처리 매치 상한과 sleep 호출

### 7.2 실행 경계 테스트

`tests/hotdrop-boundary.test.ts`에서 다음을 검증한다.

- 공개 hotdrop route 파일이 없음
- `vercel.json` hotdrop cron이 없음
- workflow가 `scripts/run_hotdrop.ts`를 정확히 한 번 실행
- workflow가 필요한 세 secret만 hotdrop 단계에 전달
- 제품 코드에 `/api/cron/hotdrop` 참조가 없음
- script가 필수 환경변수 누락과 잘못된 처리량 설정을 외부 의존성 생성 전에 거부

### 7.3 필수 게이트

두 테스트를 `verify:analysis`에 포함한다. 전체 Vitest, `verify:analysis`, `verify:admin`, Jest, `verify:core`, 변경 범위 ESLint와 `git diff --check`를 실행한다.

## 8. 문서 갱신

`docs/reviews/2026-07-15-feature-code-review.md`에서 P1 hotdrop cron 항목을 해결됨으로 표시하고 즉시 핫픽스 실행 순서 2번을 완료 처리한다. 최초 P1 12건의 추적 번호는 유지하되 실제 미해결 P1 수를 함께 기록한다.

## 9. 커밋 단위

1. `docs: Hotdrop GitHub Actions 전용 설계 확정`
2. `refactor: Hotdrop 수집 작업 모듈 분리`
3. `fix: Hotdrop 실행 경계를 GitHub Actions로 이전`
4. `docs: Hotdrop 보안 조치 결과 반영`

각 구현 커밋은 독립 테스트와 리뷰를 통과한 뒤 다음 단계로 진행한다.

## 10. 배포와 롤백

### 배포 순서

1. GitHub repository secrets 세 값이 공백이 아닌지 확인한다.
2. 작업 모듈·script·workflow·route 제거를 같은 배포에 반영한다.
3. workflow의 `workflow_dispatch`로 한 번 수동 실행한다.
4. GitHub Actions 로그에서 season, source, processedMatches, totalLandings만 확인한다.
5. 다음 UTC 18:00 schedule 결과와 `hotdrop_heatmap` 최신 season을 확인한다.

### 롤백

문제가 생기면 workflow hotdrop 단계를 비활성화하고 직전 데이터는 유지한다. 공개 route와 Vercel Cron은 복구하지 않는다. 원인 수정 후 `workflow_dispatch`로 재실행한다.

## 11. 제외 범위

- hotdrop heatmap schema 또는 RPC migration
- 기존 hotdrop 데이터 삭제·재계산
- 다른 cron/admin-agent 인증 변경
- PUBG 분석 점수·티어·telemetry cache identity 변경
- 실제 운영 workflow 실행과 운영 DB 데이터 확인
