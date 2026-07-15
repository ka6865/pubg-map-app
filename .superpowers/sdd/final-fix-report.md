# Hotdrop GitHub Actions 최종 리뷰 수정 보고서

## 작업 범위

- 기준 커밋: `1294583`
- 대상: `.superpowers/sdd/final-review.md` Important 4건
- 외부 dependency: 추가하지 않음
- YAML 파서: 기존 `package-lock.json`의 ESLint 전이 의존성 `js-yaml@4.1.1`을 사용

## 수정 내용

1. telemetry compressed body를 `ReadableStreamDefaultReader`로 chunk 단위 소비하고, 누적 byte가 `maxTelemetryCompressedBytes`를 초과하면 즉시 `cancel()` 후 실패하도록 수정했다. `Content-Length` 조기 거부와 gzip `maxOutputLength` 제한은 유지했다.
2. leaderboard ranker player 조회 후 유효한 match ID가 0개이면 leaderboard 성공으로 종료하지 않고 samples를 조회하도록 수정했다.
3. `runHotdropScript` 실패 계약을 테스트로 고정했다. runJob 예외, 필수 env 누락, config 실패 모두 `writeError("Hotdrop 수집 작업이 실패했습니다.")` 1회와 `writeInfo` 0회를 검증한다.
4. workflow 경계 테스트가 YAML을 파싱해 maintenance 마지막 step, `continue-on-error` 미설정/거짓, 정확히 3개의 env key·secret 참조, schedule `0 18 * * *`, `workflow_dispatch`, Hotdrop 실행 1회를 검증하도록 강화했다.

## TDD RED 증거

### 동작 결함 1·2

테스트를 먼저 추가한 후 다음 명령을 실행했다.

```bash
npx vitest run tests/hotdrop-job.test.ts tests/hotdrop-script.test.ts tests/hotdrop-boundary.test.ts
```

결과: exit 1, 24개 중 3개 실패.

- player 전부 조회 실패: 기대 `samples`, 실제 `leaderboard`
- player의 유효 match 관계 0개: 기대 `samples`, 실제 `leaderboard`
- compressed stream: 상한 초과 직후 3 chunk 취소 기대, 실제 6 chunk 전체 소비

### 보안 로그 회귀 계약

기존 생산 코드가 이미 고정 문구를 출력하고 있어 최초 테스트는 통과했다. 테스트의 회귀 검출력을 증명하기 위해 catch가 `String(error)`를 출력하도록 일시 변형한 후 실행했다.

```bash
npx vitest run tests/hotdrop-script.test.ts
```

결과: exit 1, 6개 중 5개 실패. 필수 env 3건, config 1건, secret·URL·matchId 포함 runJob reject 1건이 모두 예외 원문 출력 회귀를 검출했다. 일시 변형은 즉시 원복했다.

### workflow 경계 회귀 계약

기존 workflow가 이미 요구 구조를 만족해 최초 테스트는 통과했다. Hotdrop step에 `continue-on-error: true`를 일시 추가한 후 실행했다.

```bash
npx vitest run tests/hotdrop-boundary.test.ts
```

결과: exit 1, 3개 중 1개 실패. `true`를 `false`로 기대한 assertion이 회귀를 검출했다. 일시 변형은 즉시 원복했다.

## GREEN 및 최종 검증

```bash
npx vitest run tests/hotdrop-job.test.ts tests/hotdrop-script.test.ts tests/hotdrop-boundary.test.ts
```

- exit 0
- 3 files passed
- 24 tests passed

```bash
npm run verify:analysis
```

- exit 0
- 10 files passed
- 112 tests passed

```bash
npx tsc --noEmit --pretty false
```

- exit 0

```bash
npx eslint lib/hotdrop/runHotdropCollection.ts scripts/run_hotdrop.ts tests/hotdrop-job.test.ts tests/hotdrop-script.test.ts tests/hotdrop-boundary.test.ts
```

- exit 0, error·warning 0

```bash
git diff --check
```

- exit 0

## 잔여 우려

- `js-yaml`은 프로젝트의 ESLint 전이 의존성으로 lockfile에 고정되어 있다. 추가 dependency 변경은 없지만, 향후 ESLint 의존성 구조가 바뀌면 테스트의 YAML 파서 공급 방식을 재검토해야 한다.

## 통합 최종 fresh 검증

최종 통합 상태에서 재실행한 검증 결과는 다음과 같다.

- `npm run verify:analysis`: exit 0, 10개 파일, 112개 테스트 통과
- `npm run verify:admin`: exit 0, 5개 파일, 90개 테스트 통과
- 전체 Vitest: exit 0, 26개 파일 통과·1개 스킵, 265개 테스트 통과·6개 스킵
- Jest: exit 0, 1개 suite, 2개 테스트 통과
- `npm run verify:core`: exit 0, ESLint 오류 0, 기존 경고 70개/34개 파일, TypeScript 오류 0
- Hotdrop 변경 범위 ESLint: exit 0, 오류·경고 0
