# BGMS 기능별 통합 코드 리뷰

- 검토일: 2026-07-15
- 기준 문서: `README.md`, `docs/tactical_score_guide.md`, `docs-private/.project_context.md`, 텔레메트리·티어 개발 문서
- 범위: 지도·전술 도구·리플레이·모바일 UI, PUBG 전적·분석·AI, 게시판·인증·관리자·Supabase/R2
- 방식: 기능 영역별 읽기 전용 병렬 리뷰, 정적 분석, 관련 테스트, 프로덕션 의존성 감사
- 조치 범위: P0 ingest 공개 경계 제거, Hotdrop GitHub Actions 전환, 텔레메트리 공용 계약·identity·cleanup 통합, 회귀 게이트 확장
- 운영 데이터 변경: 없음

## 1. 결론

최초 리뷰에서 P0 1건, P1 12건, P2 15건을 확인했다. P0은 공개 `/api/pubg/ingest` route를 제거하고 `/api/pubg/match`가 검증된 PUBG 분석 결과를 서버 저장 함수에 직접 전달하도록 전환해 해결했다. 최종 리뷰에서 확인한 `source=scraper`와 `force=true` 위조 경로도 서로 독립된 timing-safe header 인증으로 차단했다. P1은 Hotdrop 1건과 텔레메트리 3건을 해결해 실제 미해결 항목이 8건이다. P2는 보안 테스트 계약 복구와 리플레이 요청 전환 경쟁 2건을 해결해 실제 미해결 항목이 13건이다.

텔레메트리 공용 fetch SDK, 플레이어·플랫폼 cache identity, 2D/3D 소비자, registry cleanup 계약을 통합했다. 최종 재검토의 Important 5건은 identity sequence 최소 권한, reserve→upload→원자 finalize, cache hit registry 복구, registry-only inventory manifest, 2D mode·nickname fail-closed로 보완했다. 운영 DB migration과 cleanup은 실행하지 않았으며, 배포는 migration을 먼저 적용한 뒤 애플리케이션을 반영해야 한다.

보안 측면에서는 Storage 객체 삭제 BOLA, 승인 작업 중복 실행, CAPTCHA 우회, 공개 analytics 오염, 제보 알림 임계값 우회가 즉시 수정 대상이다.

## 2. 검증 결과

| 검증 | 결과 |
|---|---|
| `npm run verify:core` | 통과: ESLint 오류 0·경고 62, TypeScript 오류 0 |
| `npm run verify:analysis` | 통과: 17개 파일, 179개 테스트 |
| `npm run verify:admin` | 통과: 5개 파일, 90개 테스트 |
| `npm test -- --runInBand` | 통과: Jest 1개 suite, 2개 테스트 |
| `env DOTENV_CONFIG_PATH=.env.local node --require ../../node_modules/dotenv/config ../../node_modules/vitest/vitest.mjs run` | 통과: 33개 파일 통과·1개 스킵, 332개 테스트 통과·6개 스킵 |
| `npm run verify:telemetry-db` | 통과: 임시 PostgreSQL 15 service-role sequence, registry-only row 감소, 두 세션 경합, 원자 finalize |
| `npm audit --omit=dev` | 이번 조치에서 재실행하지 않음. 최초 리뷰 결과는 10건(High 3, Moderate 5, Low 2) |

`tests/security.test.ts`는 현재 `withOptionalAuth` 계약과 Shadow Draft의 `parent_id` 삭제 조건으로 복구해 `verify:admin`에 포함했다. worktree에는 독립 `node_modules/dotenv`, `node_modules/vitest`가 없어 `./node_modules` 직접 경로 명령은 테스트 시작 전 종료 코드 1로 종료됐다. `.env.local`은 기본 checkout을 가리키는 추적 제외 심볼릭 링크로 유지하고, 기본 checkout의 의존성 경로를 명시해 전체 Vitest를 재실행한 결과 통과했다. 환경변수 값은 출력하지 않았다.

운영과 분리된 임시 PostgreSQL 15에 migration을 실제 적용해 RPC 문법·권한·행위를 검증했다. `SET ROLE service_role` identity INSERT/UPSERT가 성공했고 registry-only row는 1건에서 0건으로 감소했다. writer-first에서는 active pending lease가 master·stats를 보호했고, cleanup-first에서는 대기한 writer가 원자 finalize RPC로 master·processed·ready registry를 각각 1건 재구축했다. RPC는 `SECURITY INVOKER`, 빈 `search_path`, service-role 전용 `EXECUTE`를 유지한다.

`verify:core`의 ESLint 경고는 32개 파일에서 62개가 발생했다. 오류는 0개이고 TypeScript는 통과했으며, 이번 텔레메트리 변경 파일에서 신규 unused import·`console.log`는 확인되지 않았다. 기존 경고는 본 문서 7장의 유지보수 부채로 유지한다.

## 3. P0 — 즉시 차단

> 조치 상태: 해결됨
>
> - 공개 `/api/pubg/ingest` route 제거
> - `/api/pubg/match`의 서버 전용 `persistMatchAnalysis` 직접 호출로 전환
> - `processed_match_telemetry`는 `/api/pubg/match`에서 `match_id,platform,player_id` identity로 단일 upsert 유지
> - 무인증 HTTP 경계 제거와 저장 계약·실패 격리 회귀 테스트 추가
> - `source=scraper`는 non-empty `PUBG_SCRAPER_INTERNAL_TOKEN` + `Authorization: Bearer` timing-safe 검증으로 provenance 보호
> - `force=true`는 non-empty `ADMIN_REVALIDATE_TOKEN` + `X-BGMS-Admin-Token` timing-safe 검증으로 분리하고 query `secret` 제거
> - 내부 인증 실패를 Supabase/PUBG API 진입 전 503/403으로 차단하는 행위 테스트 추가
> - route 운영 보고와 scraper 로그에서 token, Authorization, player, match, 외부 error 원문 제거

> 배포 요구: `scripts/scrape_elite.ts`를 실행하는 환경과 `/api/pubg/match` 배포 환경에 `PUBG_SCRAPER_INTERNAL_TOKEN`, `ADMIN_REVALIDATE_TOKEN`을 빈 값이 아닌 서로 다른 값으로 동기화해야 한다. 일반 `source=user` 요청은 이 두 환경변수가 없어도 정상 처리된다.

### [보안·데이터 무결성] 공개 ingest가 service-role DB 쓰기 프록시로 동작

- 근거: `app/api/pubg/ingest/route.ts:6-9,20-31,42-68,88-150`
- 최초 리뷰 당시 동작: 인증, 내부 서명, 원본 PUBG 매치 재검증 없이 요청 body의 `rawParticipants`, `finalResult`, `forceBenchmark`, `source`를 신뢰했다. 이후 service-role로 `match_stats_raw`, `pubg_player_cache`, `global_benchmarks`, `processed_match_telemetry`를 upsert했다.
- 영향: 외부 요청자가 가짜 매치·플레이어·점수를 삽입하거나 기존 identity를 덮어쓸 수 있다. `forceBenchmark`로 고성과자 필터도 우회할 수 있어 전적, AI 분석, 티어 산정의 신뢰 기반이 오염된다.
- 최초 권고:
  1. 공개 route를 즉시 차단하고 서버 전용 HMAC 또는 내부 secret을 적용한다.
  2. 가능하면 `app/api/pubg/match`가 HTTP로 자기 자신을 호출하지 않고 공용 서버 함수로 직접 저장하게 바꾼다.
  3. 서버가 match, participant, platform, player identity를 원본 PUBG 응답과 다시 대조한다.
  4. `forceBenchmark`와 `source`는 내부 호출에서만 허용하고 body schema·크기·배열 상한을 강제한다.
  5. 무인증, 위조 payload, 기존 row 덮어쓰기, 대용량 body 회귀 테스트를 추가한다.

## 4. P1 — 다음 배포 전 수정

### 4.1 지도·리플레이·제보

#### 1) 3D 및 스쿼드 2D 리플레이가 현재 텔레메트리 응답 계약을 처리하지 못함

> 조치 상태: 해결됨
>
> - API envelope의 `{ downloadUrl, identity }`를 검증한 뒤 같은 `AbortSignal`로 R2 payload를 다운로드하는 공용 `fetchTelemetryPayload` 적용
> - hook, 3D, 스쿼드 2D의 직접 fetch 제거 및 schema·identity 검증 통일
> - 자동·수동 3D 요청과 화면 전환 요청에 latest-request abort 경계 적용

- 근거: `app/api/pubg/telemetry/route.ts:63-68,94-98`, `app/replay/3d/page.tsx:342-349`, `components/stat/Squad2DMap.tsx:254-263`, 정상 구현 `hooks/useTelemetry.ts:83-88`
- 영향: API는 `{ downloadUrl }`을 반환하지만 두 소비자는 첫 응답의 `events`를 읽어 유효 데이터가 있어도 오류 또는 빈 지도를 만든다.
- 조치: API 호출, presigned URL 다운로드, schema 검증, abort를 담당하는 공용 `fetchTelemetryPayload`를 만들고 모든 소비자가 공유한다.

#### 2) 플레이어별 텔레메트리 결과를 matchId+mode 캐시로 공유

> 조치 상태: 해결됨
>
> - R2 identity를 `matchId + platform + playerId(accountId) + mode + TELEMETRY_VERSION`로 분리
> - 브라우저에는 `sha256(accountId)[0:32]` 기반 `playerKey`만 공개하고 원본 account/player ID는 응답에서 제거
> - R2 payload identity를 서버 cache hit와 브라우저 다운로드 양쪽에서 재검증
> - `telemetry_map_cache_entries` registry, RLS·grant, table lock·cutoff 재검증 cleanup RPC 추가
> - identity sequence 공개 권한 회수와 service-role 최소 `USAGE, SELECT` grant 추가
> - 비싼 처리 전 pending lease reserve, processed·master·ready registry 원자 finalize, cache hit registry 복구 적용
> - registry-only 만료 row는 결정적 R2 inventory manifest 저장 성공 후 DB에서 삭제해 object inventory를 보존하면서 Supabase row를 줄임
> - stale R2 목록으로 동일 key의 신규 업로드를 지우지 않도록 애플리케이션 R2 자동 삭제 비활성화·`r2DeletionDeferred: true` 보고
> - 운영 migration·R2 cleanup은 미실행. migration 선적용 후 앱 배포 필수

- 근거: `app/api/pubg/telemetry/route.ts:55-60,76-96`, `lib/pubg-analysis/AnalysisEngine.ts:244-276,501-506`
- 영향: 첫 생성자의 `teamNames`, `isTeam`, 적 샘플링 결과가 같은 매치의 다른 팀 플레이어에게 반환되어 아군·적군 분류가 틀어진다.
- 조치: 키를 `matchId + platform + accountId/rosterId + mode + TELEMETRY_VERSION`으로 바꾸고 캐시 본문 identity도 반환 전에 검증한다.

#### 3) 카카오 2D 리플레이가 steam으로 조회됨

> 조치 상태: 해결됨
>
> - `MatchCard → MapShell → useTelemetry → API` 전 구간에 `platform` 전달
> - `steam | kakao` allowlist를 URL·hook·API 경계에 적용하고 일부 query는 fail-closed
> - 나머지 query가 없는 `/replay/3d`만 명시적 Steam demo로 유지

- 근거: `components/stat/MatchCard.tsx:810-820,2019-2031`, `components/map/MapShell.tsx:63-72`, `hooks/useTelemetry.ts:71-78`, `app/api/pubg/telemetry/route.ts:18`
- 영향: 2D 링크와 hook이 platform을 전달하지 않고 서버 기본값이 `steam`이라 kakao 매치가 실패한다.
- 조치: stats URL부터 `MapShell → useTelemetry → API`까지 platform을 필수 인자로 동기화하고 allowlist를 적용한다.

#### 4) 미지원 맵에도 3D 리플레이를 노출하고 다른 맵 지형으로 대체

- 근거: `components/stat/MatchCard.tsx:1968-1996`, `app/replay/3d/page.tsx:59-64,162-180,251,353-355`
- 영향: 사녹 등 미지원 맵이 에란겔 또는 미라마 지형과 8192 고정 좌표 위에 표시되어 전술 복기 정보가 사실과 달라진다.
- 조치: 지원하지 않는 맵의 버튼을 비활성화하고, 맵별 크기·텍스처·heightmap·지원 기능을 capability registry로 통합한다.

#### 5) 일반 로그인 사용자가 제보 임계값을 우회해 Discord 알림 발송·잠금 가능

- 근거: `app/api/report/notify/route.ts:8-15,21-35,109-124`
- 영향: 인증 사용자라면 최신 투표 수 재검증 없이 임의 marker/type으로 webhook을 호출하고 notified 상태를 잠글 수 있다. 동시 요청은 중복 알림도 만들 수 있다.
- 조치: 투표 RPC 안에서 임계값 전이를 원자적으로 판단해 한 번만 알림 작업을 생성한다. 최소한 최신 점수, type enum, 미알림 상태를 재검증하고 조건부 update 성공자만 webhook을 호출한다.

### 4.2 게시판·관리자·운영 보안

#### 6) 본인 글 수정을 이용한 타인 Storage 객체 삭제

- 근거: `app/api/posts/write/route.ts:134-179`
- 영향: 자기 글 본문에 타인 이미지의 public URL을 넣었다가 제거하면, 본문에서 추출한 경로를 service-role로 삭제할 수 있다.
- 조치: 업로드 객체에 `owner_id`, `post_id`, `storage_key`를 서버가 기록하고 삭제 전 소유권과 참조 수를 검증한다. 사용자 HTML을 삭제 권한 근거로 사용하지 않는다.

#### 7) 승인 엔드포인트 TOCTOU로 파괴 작업이 중복 실행될 수 있음

- 근거: `app/api/admin/agent/approvals/[id]/approve/route.ts:25-37,61-70`
- 영향: 동시 POST가 모두 pending을 읽고 캐시 삭제, 벤치마크 초기화, 게시글 작업을 두 번 실행할 수 있다.
- 조치: `status='pending'` 조건의 원자적 claim/RPC와 `returning` 결과 확인을 사용하고 실행 idempotency key를 둔다.

#### 8) hotdrop cron 인증 fail-open

> 조치 상태: 해결됨
>
> - 공개 `/api/cron/hotdrop` route와 Vercel Cron 제거
> - GitHub Actions daily workflow의 직접 script 실행으로 전환
> - 시즌 확인 실패 시 cleanup 금지
> - 처리량·telemetry byte 상한과 DB fallback 오류 검증 추가
> - compressed telemetry를 stream chunk 단위로 읽고 상한 초과 즉시 reader 취소
> - leaderboard player 조회에서 유효한 match ID가 0개이면 samples로 fallback
> - env·config·runJob 실패 시 고정 오류 문구 1회만 출력하는 보안 회귀 테스트 추가
> - workflow의 마지막 step, 실패 전파, 정확한 secret 3개, schedule·수동 trigger를 YAML 구조 테스트로 고정

- 근거: `app/api/cron/hotdrop/route.ts:308-316,323-339`
- 영향: `CRON_SECRET` 누락 시 누구나 외부 PUBG 호출과 service-role 기반 시즌 정리를 반복 실행할 수 있다.
- 조치: secret 누락 시 503으로 fail-closed하고 Authorization을 필수화한다.

#### 9) 공개 analytics 수집기의 무제한 service-role 적재와 원천 정보 위조

- 근거: `app/api/analytics/event/route.ts:15-34,41-84`
- 영향: rate limit과 batch 개수 상한이 없고, `sourceHost`, `clientEnvironment`, `isInternal`을 클라이언트가 정해 운영 데이터 오염과 DB 소진을 유발할 수 있다.
- 조치: request host와 배포 환경을 서버 권위값으로 저장하고 batch 상한, IP/session rate limit, 보존 cleanup을 적용한다.

#### 10) Turnstile 검증이 실제 비회원 쓰기와 결합되지 않음

- 근거: `app/api/board/turnstile/route.ts:12-39`, `app/api/board/posts/route.ts:19-80`, `app/api/board/comments/route.ts:14-66`, `app/api/posts/write/route.ts:45-52,207-256`
- 영향: 클라이언트 `sessionStorage` 플래그만 우회하면 guest 글·댓글 route를 직접 호출해 스팸, bcrypt CPU 부하, DB 소진을 일으킬 수 있다.
- 조치: 쓰기 요청에 token을 포함하고 같은 서버 요청에서 siteverify 후 일회성으로 소비한다. IP/user rate limit도 함께 적용한다.

### 4.3 PUBG API·AI

#### 11) AI squad 장애 fallback이 측정되지 않은 행동을 정상 분석처럼 반환

- 근거: `app/api/pubg/ai-squad/route.ts:255-293`
- 영향: Gemini, JSON 파싱, DB 오류를 모두 잡아 `느린 백업`, `엄폐 연막 없이 소생`, `개인파밍`, `20% 단축` 같은 고정 비난을 HTTP 200으로 반환한다.
- 조치: 502/503 또는 `valid:false, source:'fallback'`을 반환하고 UI가 장애로 표시하게 한다. fallback이 필요하면 측정 가능한 숫자와 생성 실패 안내만 사용한다.

#### 12) 공개 `refresh=true`가 공용 PUBG API 예산을 서버 제한 없이 소모

- 근거: `app/api/pubg/player/route.ts:110-128,220-365`, `app/api/pubg/player/weapon-mastery/route.ts:14-73`
- 영향: 클라이언트 버튼 cooldown을 우회한 직접 요청으로 캐시를 건너뛰고 여러 PUBG API 호출을 발생시켜 공용 키의 429와 전체 검색 장애를 만들 수 있다.
- 조치: distributed rate limit, single-flight, platform/nickname별 refresh TTL을 적용하고 강제 갱신 권한을 제한한다.

## 5. P2 — 다음 스프린트 구조 개선

| 영역 | 항목 | 근거 | 권고 |
|---|---|---|---|
| 제보 | 투표 read-modify-write 경쟁으로 동시 표 유실 | `app/api/report/vote/route.ts:27-84` | `(marker_id,user_id)` unique vote 테이블과 DB RPC 사용 |
| 리플레이 | 해결됨: 요청 전환 시 이전 응답이 최신 상태를 덮는 경쟁 차단 | `hooks/useTelemetry.ts`, `hooks/useLatestTelemetryRequest.ts`, `lib/pubg-analysis/fetchTelemetryPayload.ts` | API·R2 두 fetch에 동일 AbortSignal, latest request identity, 전환 시 상태 reset 적용 |
| 리플레이 | 대상 nickname 미전달로 내 플레이어 강조 실패 | `MapShell.tsx:404-407`, `MapView.tsx:740-744`, `TelemetryCanvasLayer.tsx:453-532` | playback nickname을 명시적으로 전달하고 정규화 비교 |
| 지도 | 잘못된 `/maps/:mapId`가 404 대신 혼합 상태 생성 | `app/maps/[mapId]/page.tsx:15-32`, `components/map/Map.tsx:42-60,154-158` | 서버 registry 검증 후 `notFound()` 또는 canonical redirect |
| 시뮬레이터 | 실제 표본 수와 무관하게 `100+ matches` 표시 | `components/map/SimulatorPanel.tsx:201-206` | 실제 필터 후 표본 수·시즌·표본 부족 경고 표시 |
| 텔레메트리 | 공개 cache-miss 경로에 비용 방어 없음 | `app/api/pubg/telemetry/route.ts:13-95` | rate limit, enum/길이 검증, single-flight 적용 |
| 관리자 | 직접 system API가 Admin Agent 승인 정책 우회 | `app/api/admin/system/route.ts:5-85` | route가 승인 요청만 만들게 하고 executor를 단일화 |
| 신고 | reports public INSERT RLS가 서버 통제 우회 가능 | `supabase/migrations/20260617000000_add_guest_and_moderation_tables.sql:45-57` | anon INSERT revoke, 공개 정책 제거, 서버 route만 허용 |
| cron | 패치노트 URL SSRF 및 query-string secret | `app/api/cron/patch-notes/route.ts:117-147` | Authorization만 사용, PUBG 도메인 allowlist, redirect/timeout/size 제한 |
| Supabase | SECURITY DEFINER 함수의 search_path 미고정 | `supabase/migrations/20260526022000_auth_profiles_trigger.sql:2-23` | `SET search_path=''`, `public.profiles` 완전 한정 |
| 테스트 | 해결됨: 보안 테스트 계약 복구 및 필수 admin 게이트 편입 | `tests/security.test.ts`, `package.json` | `verify:admin`에서 지속 회귀 검증 |
| AI 비용 | 사용자별 quota·동시성 제한과 force 권한 부재 | 세 AI route의 인증 이후 생성 경로 | `ai_usage_logs` 기반 hard quota, force cooldown/관리자 제한 |
| AI SSRF | summary 내부 URL을 Host 헤더로 구성 | `app/api/pubg/ai-summary/route.ts:420-429` | 고정 APP_URL 또는 직접 함수 호출 |
| SEO | 게시글 JSON-LD를 계산하지만 실제 렌더링하지 않음 | `app/board/[postId]/page.tsx:34-43,110-117` | 반환 JSX에 안전한 `JsonLd` 렌더링 추가 및 `</script>` 이스케이프 |
| 보안 의존성 | npm audit 10건, High 3건 포함 | `next@16.1.1`, `form-data@4.0.5`, `undici@6.24.1` 등 | 호환 버전별 별도 업그레이드 PR과 전체 회귀 테스트 수행 |

## 6. 문서와 코드 불일치

1. `lib/pubg-analysis/constants.ts`의 실제 `RESULT_VERSION`은 72.0이지만 텔레메트리 가이드에는 70.0과 69.0이 함께 남아 있다.
2. 텔레메트리 가이드 부록의 구 티어 범위는 `benchmarkScore.ts` 및 현재 두 티어 가이드의 13단계 컷과 다르다.
3. 사용자 가이드는 제압 사격 2회 이상이면 5점 만점이라고 설명하지만 실제 `Math.min(5, suppCount / 1.2)`는 6회부터 만점이다.
4. `app/api/posts/write/route.ts:7-11` 문서는 로그인 전용 JWT route라고 설명하지만 실제 구현은 `withOptionalAuth`로 비회원 쓰기를 허용한다.

산식은 운영 코드와 문서 중 어느 쪽이 제품 의도인지 결정한 뒤 한 번에 동기화해야 한다. 설명 문서만 임의 수정하면 기존 점수의 의미가 바뀔 수 있다.

## 7. 프로젝트 규칙 위반 및 유지보수 부채

- 운영 코드에 `console.log`와 주석 처리된 debug 코드가 다수 남아 있다. 주요 위치는 `components/map/SimulatorLayer.tsx`, `app/api/cron/patch-notes/route.ts`, `app/api/posts/*`, `lib/admin-agent/tools.ts` 등이다.
- `app/api/board/posts/route.ts` 주석은 레거시 route가 로그인 필수라고 설명하지만 현재 두 경로 모두 guest 쓰기를 제공해 API가 중복됐다.
- UI·API 응답에 `any`가 넓게 퍼져 있어 presigned URL 계약 변경 같은 오류를 TypeScript가 잡지 못한다.
- 대형 파일인 `ai-summary/route.ts`, `MatchCard.tsx`, `StatSearch.tsx`, `RecentAISummary.tsx`는 parser, 도메인 계산, 표시 컴포넌트로 분리할 필요가 있다.

## 8. 실행 순서 제안

### 즉시 핫픽스

1. [x] `/api/pubg/ingest` 공개 route 제거 및 `/api/pubg/match` 서버 내부 직접 저장 전환
2. [x] Hotdrop 실행 경계를 GitHub Actions로 이전
3. Turnstile을 guest write에 서버 결합
4. Storage 삭제 소유권 검증
5. 제보 notify 최신 임계값·원자성 검증

### 다음 배포

1. [x] 텔레메트리 공용 fetch SDK와 cache identity migration 코드·테스트 작성
2. [x] kakao platform 전달과 2D/3D 계약 테스트
3. AI squad 실패 계약 교체
4. 승인 작업 원자적 claim
5. PUBG refresh, telemetry, analytics rate limit
6. [x] 깨진 보안 테스트 복구 후 필수 게이트 편입

### 다음 스프린트

1. 맵 capability registry와 미지원 3D 차단
2. 제보 vote 정규화 및 RPC 전환
3. AI quota·동시성 제어
4. npm 보안 업데이트를 호환성 단위로 분리 적용
5. 문서 버전·티어·제압 사격 산식 동기화
6. 모바일 375x667, 390x844, 430x932 및 Capacitor 실기기 QA

## 9. 아직 확인하지 못한 운영 항목

- 기준 문서로 기록된 `docs-private/.project_context.md`와 `docs-private/.pubg-telemetry-guide.md`는 현재 checkout과 Git 추적 목록에 존재하지 않아 이번 작업에서 갱신하지 못했다. 현재 캐시 계약은 공개 설계·구현 계획·본 리뷰 문서에 동기화했다.
- `telemetry_map_cache_entries`와 cleanup RPC migration은 운영 Supabase에 적용하지 않았고, 운영 R2 cleanup도 실행하지 않았다.
- R2 object 자동 삭제는 deterministic key 재업로드 TOCTOU 방지를 위해 비활성화했다. registry row 삭제 전 최대 50개 object path를 결정적 inventory manifest 1개로 보관하며, 무료 R2 저장량을 모니터링하고 immutable generation key 또는 Cloudflare가 공식 보장하는 conditional delete 도입 후 자동 정리를 재개해야 한다.
- 실제 Chrome에서 `/stats`, Steam `KangHeeSung_` 검색, `/maps/erangel` 렌더는 통과했지만 최근 match 20건은 모두 HTTP 500으로 실패했다. sanitized 오류만 확인해 정확한 실패 단계는 미확정이며, 무료 PUBG API 예산과 Discord 중복 알림을 막기 위해 실데이터 재시도를 중단했다.
- 2026-07-18 최종 로컬 Chrome 회귀에서 `/stats`, `/maps/erangel`, 불완전 query의 `/replay/3d?matchId=qa-no-external-call`은 모두 HTTP 200으로 렌더됐고 브라우저 console error는 0건이었다. 불완전 3D query는 외부 telemetry 요청 없이 `3D 리플레이 query가 누락되었거나 지원되지 않습니다.` 오류로 fail-closed 처리됐다.
- migration 선적용·애플리케이션 배포 후 Steam/Kakao 2D·3D 실데이터 회귀 QA가 남아 있다.
- 운영 DB의 `pending_markers` 실제 RLS 정책은 저장소 migration만으로 확인할 수 없었다.
- Vercel/프록시가 Host 헤더를 고정하는지는 로컬 코드만으로 확인할 수 없었다.
- iOS Safari, Android WebView, Capacitor 실기기 동작은 실행하지 않았다.
- 실제 유저 데이터를 외부 Gemini로 보내는 감사는 명시적 승인 없이 실행하지 않았다.
