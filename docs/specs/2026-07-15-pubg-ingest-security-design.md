# PUBG Ingest 보안 차단 설계

## 1. 목적

인증 없이 외부에 노출된 `/api/pubg/ingest`가 요청 body를 신뢰하고 Supabase service-role로 핵심 분석 테이블을 변경하는 P0 취약점을 제거한다.

이 작업은 전술 점수 산식이나 기존 사용자 분석 결과를 변경하지 않는다. 첫 배포에서 외부 위조 요청을 fail-closed 방식으로 차단하고, 같은 작업 안에서 내부 HTTP 자기 호출을 서버 전용 함수 호출로 교체해 공개 ingest 경로 자체를 제거한다.

## 2. 범위

### 포함

- `/api/pubg/ingest` 외부 접근 차단
- ingest 저장 로직의 서버 전용 모듈화
- `/api/pubg/match` 내부 HTTP 자기 호출 제거
- `match_stats_raw`, `pubg_player_cache`, `global_benchmarks` 저장 계약 검증
- 중복 `processed_match_telemetry` upsert 제거
- platform, source, forceBenchmark, participant 배열 검증
- 저장 단계별 오류 처리와 회귀 테스트
- 현재 깨진 게시글 보안 테스트 mock 복구 및 보안 게이트 편입

### 제외

- 텔레메트리 R2 캐시 identity 변경
- 리플레이 presigned URL 소비자 수정
- AI 사용량 제한과 rate limit
- Turnstile, Storage 소유권, Admin Agent 승인 흐름 수정
- 기존 운영 데이터 삭제 또는 일괄 repair
- 전술 점수, 티어, benchmark 계산식 변경

## 3. 선택한 접근

단계적 차단 후 서버 전용 함수로 전환한다.

1. 기존 route에 fail-closed 인증과 입력 검증을 먼저 적용한다.
2. 저장 로직을 `lib/pubg-analysis/persistMatchAnalysis.ts`로 이동한다.
3. `/api/pubg/match`가 검증 완료된 PUBG 데이터로 서버 함수를 직접 호출한다.
4. 내부 호출 전환이 검증되면 `/api/pubg/ingest` route를 제거한다.

비밀키만 추가하고 공개 route를 계속 유지하는 방식은 롤백 가능한 중간 단계로만 사용한다. 최종 상태에는 외부에서 호출할 ingest HTTP endpoint가 존재하지 않는다.

## 4. 아키텍처

### 4.1 서버 전용 저장 모듈

신규 파일 `lib/pubg-analysis/persistMatchAnalysis.ts`는 다음 책임만 가진다.

- 입력 identity와 enum 검증
- 참가자 원시 통계 정규화
- 플레이어 자동완성 캐시 batch upsert
- 유효 benchmark row 생성 및 upsert
- 각 저장 작업의 성공·실패 결과 반환

모듈은 `server-only` 경계에서 동작하며 Supabase client를 함수 인자로 주입받는다. 전역 service-role client를 생성하지 않아 단위 테스트에서 DB adapter를 대체할 수 있게 한다.

권장 인터페이스는 다음과 같다.

```ts
type PubgPlatform = "steam" | "kakao";
type AnalysisSource = "user" | "scraper";

interface PersistMatchAnalysisInput {
  matchId: string;
  playerNickname: string;
  platform: PubgPlatform;
  finalResult: Record<string, unknown>;
  matchAttr?: Record<string, unknown>;
  rawParticipants?: unknown[];
  source: AnalysisSource;
  forceBenchmark: boolean;
}

interface PersistenceFailure {
  taskName: "match_stats_raw" | "pubg_player_cache" | "global_benchmarks";
  message: string;
}

interface PersistMatchAnalysisResult {
  succeeded: string[];
  failures: PersistenceFailure[];
}

export async function persistMatchAnalysis(
  supabase: SupabaseClient,
  input: PersistMatchAnalysisInput,
): Promise<PersistMatchAnalysisResult>;
```

`forceBenchmark`는 서버 내부 호출에서만 `true`가 될 수 있다. 일반 사용자 전적 조회에서 생성된 입력은 기본값 `false`를 사용한다.

### 4.2 `/api/pubg/match` 변경

`app/api/pubg/match/route.ts`는 이미 PUBG API와 텔레메트리에서 다음 값을 생성한다.

- 검증된 matchId
- 정규화된 nickname
- 정규화된 platform
- 실제 match attributes와 participants
- AnalysisEngine의 tactical result

기존 `/api/pubg/ingest` fetch 대신 이 데이터를 `persistMatchAnalysis()`에 직접 전달한다. `processed_match_telemetry`는 기존 match route의 저장을 기준 경로로 유지하고 신규 모듈에서는 다시 저장하지 않는다.

저장 작업은 사용자 응답 전에 완료를 확인한다. 실패를 무시하지 않고 작업 이름과 실패 원인을 구조화해 서버 로그에 남긴다. `processed_match_telemetry`와 R2 저장이 성공했지만 파생 통계 저장 일부가 실패한 경우에는 분석 응답 자체를 폐기하지 않고, 운영 모니터링 가능한 경고로 분리한다.

외부 query의 `source=scraper`는 서버가 검증한 내부 스크래퍼에게만 허용한다. `PUBG_SCRAPER_INTERNAL_TOKEN`이 빈 값이 아니고 `Authorization: Bearer <token>`이 timing-safe 비교를 통과해야 `source=scraper`로 저장한다. `force=true`는 별도 권한으로 분리해 `ADMIN_REVALIDATE_TOKEN`과 `X-BGMS-Admin-Token`이 모두 유효할 때만 캐시를 우회한다. `scraper+force`는 두 header를 모두 요구하며 query string secret은 읽지 않는다. 인증은 Supabase 조회, PUBG API 호출, 저장 진입 전에 완료한다.

### 4.3 레거시 ingest route

전환 전 첫 커밋에서는 다음 정책을 적용한다.

- `PUBG_INGEST_INTERNAL_SECRET`이 없으면 503
- `Authorization: Bearer <secret>`이 없거나 다르면 401
- 인증 전에 body를 파싱하거나 DB client를 사용하지 않음
- platform은 `steam`, `kakao`만 허용
- source는 `user`, `scraper`만 허용
- body 크기와 `rawParticipants` 길이에 상한 적용
- 외부 요청의 `forceBenchmark=true` 거부

직접 함수 호출 전환 검증 후 route 파일을 제거한다. 비밀키는 전환 과정에서만 사용하므로 최종 배포 환경에 영구적으로 남기지 않는다.

## 5. 데이터 흐름

```text
사용자 전적 요청
  -> /api/pubg/match
  -> PUBG match/telemetry 조회 및 AnalysisEngine 실행
  -> R2 mapData 저장
  -> processed_match_telemetry 저장
  -> persistMatchAnalysis(server-only)
       -> match_stats_raw
       -> pubg_player_cache
       -> global_benchmarks
  -> 분석 응답 반환
```

외부 클라이언트가 파생 테이블 저장 함수를 직접 호출할 수 있는 HTTP 경로는 최종 상태에 존재하지 않는다.

## 6. 입력 및 데이터 무결성 규칙

- platform은 `normalizePlatform()` 처리 후에도 `steam` 또는 `kakao`가 아니면 거부한다.
- matchId와 nickname은 빈 문자열과 과도한 길이를 거부한다.
- participant는 객체 구조와 `attributes.stats` 존재 여부를 확인한 row만 저장한다.
- participant 수는 PUBG 한 경기의 합리적 상한을 넘으면 전체 요청을 거부한다.
- `pubg_player_cache.id`와 nickname은 원본 participant에서만 생성한다.
- AI player ID는 기존 정책대로 자동완성 캐시에서 제외한다.
- benchmark 저장은 표준 BR 필터와 기존 `isValidBenchmark` 조건을 유지한다.
- `source=scraper`와 `force=true`는 서로 독립된 내부 header token을 검증하고, 일반 `source=user` 요청은 내부 token 설정에 의존하지 않는다.
- 기존 unique identity인 `match_id + platform + player_id`를 유지한다.
- 운영 row 삭제와 과거 row 재작성은 수행하지 않는다.

## 7. 오류 처리

### 인증·입력 오류

- 비밀키 누락: 503
- 내부 scraper 또는 admin token 환경변수 누락·공백: 503
- 내부 header 누락·불일치: 403
- JSON 또는 schema 오류: 400
- body/배열 상한 초과: 413

### 저장 오류

- 각 DB 작업은 task name과 오류 메시지를 구조화한다.
- 파생 통계 일부 실패는 사용자 분석 결과와 구분해 모니터링한다.
- service-role key, 원본 payload, 전체 finalResult는 로그에 출력하지 않는다.
- token, Authorization, player, match, 외부 error 원문은 route 운영 보고와 scraper 로그에 출력하지 않는다.
- 동일 identity 재시도는 upsert로 안전해야 한다.

## 8. 테스트 설계

### route 보안 테스트

- 환경변수 누락 시 503
- Authorization 누락·불일치 시 401
- 인증 실패 요청에서 Supabase 쓰기 0회
- 허용되지 않은 platform/source 거부
- 외부 `forceBenchmark=true` 거부
- 과도한 body와 participant 배열 거부

### 저장 모듈 테스트

- 정상 steam/kakao 입력 저장
- AI 참가자 자동완성 제외
- 표준 BR이 아닌 match의 benchmark 제외
- 동일 identity 재호출 시 동일 conflict key 사용
- 작업별 DB 오류가 `failures`에 보존됨
- `processed_match_telemetry`를 중복 저장하지 않음

### 회귀 테스트

- 기존 analysis 46개 테스트 통과
- 기존 admin 79개 테스트 통과
- 현재 실패 중인 `tests/security.test.ts`의 optional auth mock과 Shadow Draft 기대값 동기화
- 전체 Vitest 통과
- ESLint 오류 0, TypeScript 오류 0
- 공개 user와 인증된 scraper의 저장 provenance 분리
- scraper/admin token 환경변수 누락·공백, header 누락·불일치, 두 scope 조합 검증
- query token 미사용과 `scripts/scrape_elite.ts` 주 매치·샘플 caller 계약 검증

## 9. 배포와 롤백

### 배포 순서

1. fail-closed route와 보안 테스트 배포
2. 인증 실패 로그와 정상 내부 ingest 성공 확인
3. 서버 전용 저장 모듈과 match 직접 호출 배포
4. 파생 통계 저장 성공률 확인
5. 레거시 ingest route 제거
6. `PUBG_SCRAPER_INTERNAL_TOKEN`과 `ADMIN_REVALIDATE_TOKEN`을 빈 값이 아닌 서로 다른 값으로 배포 환경과 스크래퍼에 설정

### 롤백

- 첫 배포 문제 시 route 인증 커밋만 되돌리되, 외부 무인증 상태로 복귀하지 않는다.
- 직접 호출 문제 시 인증된 레거시 route로 일시 복귀한다.
- DB schema를 변경하지 않으므로 migration rollback은 필요하지 않다.
- 운영 데이터를 삭제하지 않으므로 데이터 복원 절차는 필요하지 않다.

## 10. 완료 조건

- 외부 무인증 요청으로 service-role 쓰기를 실행할 수 없다.
- 인증되지 않은 요청이 `source=scraper`를 주장하거나 query token으로 캐시를 강제 우회할 수 없다.
- `/api/pubg/match`가 자기 origin의 `/api/pubg/ingest`를 호출하지 않는다.
- 외부 ingest HTTP route가 최종 빌드에 존재하지 않는다.
- 파생 통계 저장 실패가 조용히 무시되지 않는다.
- 기존 전술 점수, 티어, 캐시 identity가 변경되지 않는다.
- 전체 정적 검증과 테스트가 통과한다.
- 변경 파일에 사용하지 않는 import, `console.log`, 주석 처리된 debug 코드를 남기지 않는다.
