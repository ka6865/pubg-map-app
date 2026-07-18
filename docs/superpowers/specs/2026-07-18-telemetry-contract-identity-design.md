# 텔레메트리 계약·캐시 Identity 통합 설계

## 1. 목표

PUBG 텔레메트리 리플레이의 서버 응답, R2 캐시, 2D·3D 소비자 계약을 하나로 통합한다. 같은 매치라도 플랫폼과 분석 대상 플레이어가 다르면 캐시가 섞이지 않게 하고, Kakao 리플레이가 Steam 기본값으로 조회되는 문제를 제거한다.

이 설계는 코드리뷰 보고서의 다음 P1 항목을 함께 해결한다.

1. 3D 및 Squad 2D 소비자가 `{ downloadUrl }` 응답을 직접 payload로 오인하는 문제
2. 플레이어별 텔레메트리 결과를 `matchId + mode` 캐시로 공유하는 문제
3. Kakao 2D 리플레이가 `steam`으로 조회되는 문제

미지원 맵의 3D 차단과 맵 capability registry는 별도 P1/P2 작업으로 남긴다.

## 2. 확정된 전환 정책

- Vercel, Supabase, Cloudflare R2는 모두 무료 플랜을 전제로 한다.
- 유료 기능, 상시 실행 worker, 대량 데이터 복사, 전체 R2 객체 반복 스캔을 필수 조건으로 만들지 않는다.
- DB 조회·upsert와 R2 read/write 횟수를 요청당 최소화하고 동일 payload를 중복 저장하지 않는다.
- 수시로 바뀔 수 있는 무료 한도 수치를 코드에 하드코딩하지 않고, 사용량이 한도에 가까워져도 fail-closed와 자연 보존 정책이 유지되게 한다.
- 기존 `matchId + mode` 및 `matchId` 단일 R2 키는 새 코드에서 읽지 않는다.
- 기존 R2 객체를 이번 배포에서 일괄 삭제하거나 새 키로 복사하지 않는다.
- 신규 요청과 재분석은 새 identity 키에만 저장한다.
- 기존 객체는 현재 운영 보존·정리 정책에 따라 자연 정리한다.
- 운영 데이터 삭제 명령과 대량 R2 migration은 실행하지 않는다.
- 배포 순서는 Supabase migration 적용 후 애플리케이션 배포이며, migration 미적용 상태에서 신규 코드나 cleanup을 먼저 실행하지 않는다.

### 2.1 사용자 승인 보안 보완

2026-07-18 사용자 선택 1번에 따라 서버 identity와 브라우저 공개 identity를 분리한다. 이 결정은 아래의 과거 `identity.playerId` 예시보다 우선한다.

- 서버 identity는 원본 accountId를 `playerId`로 보유하며 R2 key 생성과 Supabase registry 저장에만 사용한다.
- 공개 identity는 원본 accountId를 포함하지 않고 `playerKey = sha256(accountId).slice(0, 32)`만 포함한다.
- API envelope와 브라우저에 서명해 전달하는 R2 지도 payload에는 공개 identity만 포함한다.
- 서버 전용 `_analyze.json` 중간 캐시는 AnalysisEngine의 raw identity 비교에 필요하므로 private R2에 유지하되 signed URL이나 API 응답으로 반환하지 않는다.
- 브라우저는 `matchId + platform + playerKey + mode + telemetryVersion`을 검증한다.
- R2 본문 파싱·identity 오류만 cache miss로 취급한다. presigned URL 발급 장애는 인프라 오류로 전파한다.
- telemetry map cache 쓰기는 R2 필수 설정이 없으면 성공으로 처리하지 않고 fail-closed한다.
- 유효한 기존 분석 캐시는 먼저 반환하되, 새 분석이 필요한 요청은 R2 미설정을 PUBG telemetry fetch와 AnalysisEngine 실행 전에 503으로 차단한다.
- `/api/pubg/match` 분석 엔진은 요청 문자열이 아니라 PUBG participant의 canonical nickname을 사용한다.
- background 재분석은 Next.js `after()`로 응답 이후 생명주기를 보장하고, 실패 시 사용자 응답에 원본 오류를 노출하지 않되 운영 오류 기록을 남긴다.
- 공개 payload 가명 처리는 raw accountId 형식과 무관하게 항상 SHA-256을 적용하며, 값 형태로 raw/public 상태를 추론하지 않는다.
- `/api/pubg/match`의 신규 분석 응답은 R2 공개 payload와 별도로 raw `mapData`를 반환하지 않는다.

## 3. 검토한 접근 방식

### 선택: 새 identity 키로 완전 전환

새 키만 읽고 쓰며 구 키는 fallback하지 않는다. 캐시 적중률은 전환 직후 낮아지지만 다른 팀 관점 데이터가 재사용되는 위험을 즉시 제거한다.

### 제외: 구 키 fallback

새 키 miss 시 기존 `matchId + mode` 객체를 읽으면 비용은 줄지만 오염 가능성을 유지한다. 캐시 본문에 identity가 없는 구 객체는 안전하게 검증할 수 없으므로 제외한다.

### 제외: 기존 객체 일괄 삭제

정합성은 빠르게 확보할 수 있지만 운영 R2 객체를 대량 삭제해야 한다. 이번 작업의 안전 범위를 벗어나므로 제외한다.

## 4. 아키텍처

### 4.1 공용 identity 계약

`lib/pubg-analysis/telemetryIdentity.ts`는 platform·mode 파서와 서버·공개 identity 타입 및 공개 identity 비교를 제공하며 Node 전용 모듈을 import하지 않는다.

- 지원 플랫폼: `steam | kakao`
- 지원 모드: `lite | full`
- 서버 identity:
  - `matchId`
  - `platform`
  - `playerId`
  - `mode`
  - `telemetryVersion`
- 공개 identity:
  - `matchId`
  - `platform`
  - `playerKey`
  - `mode`
  - `telemetryVersion`
- 모든 문자열은 허용 형식과 길이를 검증하고, 허용되지 않는 값은 fail-closed한다.

### 4.2 서버 전용 R2 key 모듈

`lib/pubg-analysis/telemetryCacheKey.server.ts`를 추가한다.

- 파일 첫 줄에서 `server-only`를 import한다.
- R2 key는 `telemetry-map/v{TELEMETRY_VERSION}/{platform}/{matchId}/{playerHash}/{mode}.json`이다.
- `playerHash`와 공개 `playerKey`는 동일하게 accountId의 SHA-256 앞 32자를 사용해 R2 key, signed URL, API envelope, R2 payload에 원본 accountId가 노출되지 않게 한다.
- `app/api/pubg/match/route.ts`와 `app/api/pubg/telemetry/route.ts`는 이 모듈만 사용해 키를 만든다. 호출부마다 키 문자열을 조립하지 않는다.

### 4.3 payload 계약

`lib/pubg-analysis/telemetryPayload.ts`를 추가하고 서버와 브라우저가 공유한다.

```ts
type TelemetryPayload = {
  identity: {
    matchId: string;
    platform: "steam" | "kakao";
    playerKey: string;
    mode: "lite" | "full";
    telemetryVersion: number;
  };
  startTime: string;
  teammates: string[];
  teamNames: string[];
  events: unknown[];
  zoneEvents: unknown[];
  mapName: string;
};
```

공용 validator는 객체 형태, identity 완전 일치, 필수 배열, 문자열 필드를 검사한다. identity가 없거나 요청 identity와 다르면 캐시 hit로 인정하지 않는다.

### 4.4 서버 캐시 서비스

`lib/pubg-analysis/telemetryMapCache.ts`를 추가한다.

- `readTelemetryMapCache(serverIdentity)`
  - 새 R2 key만 조회한다.
  - server identity에서 공개 identity를 파생하고 JSON payload의 공개 identity와 대조한다.
  - 누락·파싱 실패·identity mismatch는 cache miss로 처리한다.
  - 검증 이후의 presigned URL 발급 실패는 cache miss로 숨기지 않고 전파한다.
  - 검증된 객체만 presigned URL 발급 대상으로 인정한다.
- `writeTelemetryMapCache(serverIdentity, payload)`
  - payload identity를 다시 검증한다.
  - R2 필수 설정이 없으면 업로드 성공으로 처리하지 않는다.
  - 비싼 telemetry 처리와 R2 업로드 전에 `pending` registry lease를 reserve한다.
  - R2 업로드 후 processed·master·registry `ready`를 SECURITY INVOKER RPC 한 트랜잭션으로 finalize한다.
  - 검증된 R2 cache hit도 registry·master 복구 finalize에 성공한 뒤에만 URL을 반환한다.
  - reserve·finalize 실패는 성공으로 숨기지 않는다.

서버 route는 캐시 본문을 검증한 뒤에만 presigned URL을 반환한다. 브라우저도 직접 다운로드한 payload를 다시 검증해 잘못된 signed object나 구 캐시를 표시하지 않는다.

### 4.5 Supabase registry

새 migration으로 `telemetry_map_cache_entries`를 추가한다.

- `match_id text not null`
- `platform text not null check (platform in ('steam', 'kakao'))`
- `player_id text not null`
- `mode text not null check (mode in ('lite', 'full'))`
- `telemetry_version numeric not null`
- `storage_path text not null unique`
- `status text not null check (status in ('pending', 'ready'))`
- `lease_expires_at timestamptz`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- unique identity:
  - `(match_id, platform, player_id, mode, telemetry_version)`

RLS를 활성화하고 공개 정책을 만들지 않는다. `anon`, `authenticated` 권한은 명시적으로 회수하고 `service_role`에는 서버가 필요한 `select`, `insert`, `update`, `delete`만 명시적으로 부여한다. identity sequence도 실제 sequence 이름을 조회해 공개 권한을 회수하고 `service_role`에 `usage`, `select`만 부여한다. finalize와 cleanup RPC는 `SECURITY INVOKER`, 빈 `search_path`, 완전 수식 이름을 사용하며 `EXECUTE`는 `service_role`에만 허용한다. 브라우저가 테이블이나 RPC에 직접 접근하지 않는다.

`match_master_telemetry`는 매치 메타데이터의 기존 기준으로 유지한다. 새 플레이어별 지도 캐시는 별도 registry에서 관리해 한 match row의 `storage_path`가 여러 플레이어 객체를 대표하는 문제를 만들지 않는다.

### 4.6 cleanup 정합성

`scripts/cleanup_telemetry.ts`는 master와 registry를 모두 페이지 조회해 master 없는 registry-only row도 만료 후보에 포함한다. DB row를 지우기 전에 최대 50개 batch의 object inventory를 정렬하고 SHA-256 결정적 key의 R2 manifest 한 개로 보관한다. manifest upload가 실패하면 cleanup RPC를 호출하지 않으며 같은 입력 재시도는 같은 manifest key를 사용한다. R2 object 자체는 삭제하지 않는다.

매치 master row를 만료 처리할 때 해당 `match_id`의 registry 상태를 트랜잭션 내에서 재검증한다. cleanup 시작에 한 번 캡처한 기준시각을 앱 후보 필터와 RPC `p_now`에 동일하게 사용한다. 따라서 기준시각에 active였던 pending lease가 manifest upload 중 만료해도 해당 run에서는 삭제하지 않는다. cleanup RPC는 registry 테이블에 `SHARE ROW EXCLUSIVE` lock을 적용해 신규 writer를 잠시 대기시키고, 최근 `ready` row나 기준시각에 만료되지 않은 `pending` lease가 없는 match만 정리한다. `pending` row는 `updated_at`과 무관하게 lease가 없거나 기준시각 이전에 만료했으면 정리 대상이다. finalize와 cleanup은 모두 `registry → match_master_telemetry → processed_match_telemetry` 순서로 lock·write를 진행해 교착 실행 사이클을 만들지 않는다. 삭제 후 eligible master·registry가 하나라도 남으면 RPC가 예외를 발생시켜 stats·processed 삭제까지 전체 rollback한다. writer가 먼저 reserve하면 cleanup에서 제외되고, cleanup이 먼저 끝나면 writer가 processed·master·ready registry 전체를 finalize RPC로 재구축한다.

master 만료 후보 조회가 실패하면 모든 cleanup RPC 전에 fail-closed로 중단한다. cleanup RPC가 실패하거나 테이블·함수가 아직 없으면 해당 최대 50개 match batch가 트랜잭션으로 rollback되고 후속 batch를 중단한다. 이미 성공해 commit된 이전 batch까지 되돌린다고 기록하지 않는다. registry upsert 실패도 캐시 쓰기 성공으로 숨기지 않는다.

만료 match는 Supabase 트랜잭션 RPC에서 master·registry 상태를 잠그고 만료 조건과 registry `updated_at` cutoff를 다시 검증한 뒤 관련 DB row를 한 번에 정리한다.

애플리케이션 cleanup의 R2 자동 삭제는 이번 배포에서 전면 비활성화한다. `ListObjectsV2` 스냅샷 후 같은 deterministic key가 재업로드되면 과거 `LastModified`를 근거로 신규 객체를 삭제할 수 있고, 현재 Cloudflare R2 S3 계약에서 batch conditional delete를 입증하지 못했기 때문이다. R2 객체는 보존하고 `r2DeletionDeferred: true`를 보고한다. 무료 R2 저장량 누적은 운영 모니터링 대상으로 두며, immutable generation key 또는 공식적으로 검증된 conditional delete를 도입한 후 자동 삭제를 별도 활성화한다.

운영 Supabase/R2 cleanup은 실행하지 않는다. 운영과 분리된 임시 PostgreSQL 15에서만 `SET ROLE service_role` identity insert/upsert, registry-only row 감소, 최신 `updated_at`을 가진 만료 pending의 원자 정리, manifest 중 만료한 lease의 snapshot 보호, writer-first·cleanup-first·finalize-first 두 세션 경합을 timeout으로 검증한다. finalize 잠금 순서는 별도 blocker로 함수를 registry lock에서 대기시킨 동안 master row `FOR UPDATE NOWAIT`가 성공하는지로 확인한다.

## 5. 서버 데이터 흐름

### 캐시 hit

1. route가 `matchId`, `nickname`, `platform`, `mode`를 검증한다.
2. PUBG match 응답에서 nickname을 정규화 비교해 accountId를 확정한다.
3. accountId로 서버 identity, 공개 `playerKey`, 새 R2 key를 만든다.
4. R2 본문을 읽어 payload의 공개 identity를 검증한다.
5. 검증 성공 시 같은 key의 presigned URL과 공개 expected identity를 반환한다.

### 캐시 miss

1. registry에 만료 시간이 있는 `pending` lease를 reserve한다.
2. PUBG telemetry를 받아 `AnalysisEngine`을 요청 mode로 실행한다.
3. payload에는 공개 identity만 포함한다.
4. 새 R2 key로 업로드한다.
5. processed·master·ready registry를 원자 finalize한다.
6. presigned URL과 공개 expected identity를 반환한다.

`/api/pubg/match`가 분석 과정에서 생성하는 기본 지도 캐시는 `lite` identity로 같은 cache service를 사용한다. `full`은 사용자가 고정밀 리플레이를 요청할 때 별도로 생성한다.

## 6. 브라우저 공용 fetch

`lib/pubg-analysis/fetchTelemetryPayload.ts`를 추가한다.

```ts
fetchTelemetryPayload(
  request: {
    matchId: string;
    nickname: string;
    platform: "steam" | "kakao";
    mapName?: string;
    mode: "lite" | "full";
  },
  options?: {
    signal?: AbortSignal;
    fetchFn?: typeof fetch;
  }
): Promise<TelemetryPayload>
```

동작 순서는 다음과 같다.

1. 모든 query를 `URLSearchParams`로 인코딩한다.
2. API 응답 상태와 `{ downloadUrl, identity }` envelope를 검증한다.
3. 같은 AbortSignal로 presigned URL을 다운로드한다.
4. JSON payload schema와 expected identity를 검증한다.
5. 오류 원문이나 signed URL을 사용자 메시지에 노출하지 않고 제한된 오류를 반환한다.

다음 소비자가 이 함수만 사용한다.

- `hooks/useTelemetry.ts`
- `app/replay/3d/page.tsx`
- `components/stat/Squad2DMap.tsx`

각 소비자 내부의 중복 fetch·downloadUrl 분기·부분 파싱은 제거한다.

## 7. platform 전달

- `MatchCard`의 간이 2D 및 고정밀 2D URL에 `platform`을 포함한다.
- `MapShell`은 query의 `platform`을 읽고 allowlist 검증 후 `useTelemetry`에 전달한다.
- `useTelemetry`의 시그니처는 `(matchId, nickname, platform, mapName)`으로 변경한다.
- 닫기 동작은 `playback`, `nickname`, `platform`, `mode`를 함께 제거한다.
- 3D와 Squad 2D는 기존 prop/query의 platform을 공용 fetch 함수에 전달한다.
- platform 누락 또는 미지원 값은 `steam`으로 조용히 보정하지 않고 사용자 오류로 처리한다.
- `/replay/3d` 완전 무쿼리 접근만 명시적인 Steam 기본 데모를 허용하고, matchId/nickname/platform 일부만 전달된 요청은 fail-closed한다.
- 3D 자동 query 요청과 수동 재시도는 같은 request controller/ref를 사용해 새 요청 전에 이전 요청을 abort한다.
- identity 전환·누락·검증 실패 시 이전 players, zones, events, timeline 상태를 즉시 비운다.

## 8. 오류와 보안 경계

- `matchId`, `nickname`, `platform`, `mode`는 서버와 클라이언트 양쪽에서 검증한다.
- 선택적 `mapName`도 길이와 제어문자를 fetch 전에 검증한다.
- nickname은 정규화 비교하지만 payload에는 PUBG API의 canonical name을 사용한다.
- accountId 원문은 R2 key, signed URL, API envelope, 브라우저 전달용 R2 지도 payload에 넣지 않는다.
- private `_analyze.json`은 서버 분석 전용이며 공개 URL과 API 응답 계약에서 제외한다.
- cache identity mismatch는 cache miss로 재생성하며 잘못된 payload를 반환하지 않는다.
- API key, R2 signed URL, accountId, 외부 오류 stack을 사용자 응답이나 브라우저 로그에 남기지 않는다.
- route의 운영 오류 기록은 제한된 분류 코드와 endpoint 기준으로 남긴다.
- fetch 전환 시 AbortSignal을 API와 R2 다운로드 모두에 적용해 이전 요청이 최신 화면 상태를 덮지 않게 한다.

## 9. 테스트 설계

### identity·payload 단위 테스트

- platform/mode allowlist
- 동일 match라도 platform/player/mode가 다르면 key가 다름
- accountId가 key에 평문으로 포함되지 않음
- payload identity 일치·불일치
- API envelope와 R2 payload에 `playerId` 또는 accountId 원문이 없고 공개 `playerKey`만 존재
- 구 payload처럼 identity가 없으면 거부

### 서버 route·cache 테스트

- 새 키만 읽고 구 키를 fallback하지 않음
- 검증된 cache hit만 presigned URL 반환
- mismatch·파싱 실패는 재생성
- match route와 telemetry route가 같은 key builder 사용
- registry upsert 오류 전파
- `steam`/`kakao`, `lite`/`full` 분리

### 공용 fetch 테스트

- API envelope 후 presigned payload 다운로드
- API·R2 오류 처리
- expected identity 불일치 거부
- 동일 AbortSignal이 두 fetch에 전달됨
- 3D·Squad 2D·hook이 공용 함수만 소비

### platform 경계 테스트

- MatchCard의 두 2D URL에 platform 포함
- MapShell이 platform을 hook에 전달
- Kakao 요청이 API까지 `kakao`로 유지
- 누락·미지원 platform fail-closed

### 운영 정합성 테스트

- cleanup 활성 경로가 master와 신규 registry를 합침
- 만료 match의 신규 registry 객체가 함께 정리 대상이 됨
- 실제 R2·Supabase 삭제는 테스트 dependency로 대체

## 10. 문서와 검증

- `docs-private/.project_context.md`의 지도 캐시 경로와 소비자 흐름을 새 계약으로 갱신한다.
- `docs-private/.pubg-telemetry-guide.md`의 서로 충돌하는 cache key 설명을 새 identity 규칙으로 통일한다.
- `docs/reviews/2026-07-15-feature-code-review.md`에서 P1 1~3의 해결 상태와 실제 남은 P1 수를 갱신한다.
- 신규 테스트를 `verify:analysis`에 포함한다.
- 필수 검증:
  - 집중 신규 테스트
  - `npm run verify:analysis`
  - `npm run verify:admin`
  - 전체 Vitest
  - Jest
  - `npm run verify:core`
  - 변경 범위 ESLint
  - `git diff --check`

## 11. 비범위

- 기존 R2 객체 일괄 삭제·복사
- 운영 migration 직접 적용
- 운영 cleanup 실행
- 3D 미지원 맵 capability registry
- 공개 telemetry cache-miss rate limit
- 전술 점수·티어·분석 버전 산식 변경
- 외부 Gemini 호출

## 12. 성공 기준

- 모든 리플레이 소비자가 같은 `{ downloadUrl, identity } → payload` 계약을 사용한다.
- 실제 Chrome QA는 Steam `KangHeeSung_` 전적 검색과 2D·3D 리플레이 진입을 포함하며, 기존 `/stats`와 `/maps/erangel` 회귀도 확인한다.
- 같은 match의 다른 platform/player/mode가 같은 지도 캐시를 재사용하지 않는다.
- Kakao 2D 요청이 Steam으로 변환되지 않는다.
- 구 identity 없는 R2 payload를 새 코드가 읽지 않는다.
- 새 R2 객체가 Supabase registry와 cleanup 활성 경로에 등록된다.
- 운영 데이터 삭제 없이 코드·migration·문서·테스트가 준비된다.
