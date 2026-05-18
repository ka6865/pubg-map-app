# BGMS 텔레메트리 리플레이 및 전적분석 고도화 계획서

작성 기준: `telemetry_data_classification.md`와 현재 코드(`origin/develop` 반영 후)를 대조 검증한 결과입니다.

## 1. 목표

- 텔레메트리 원본에는 존재하지만 현재 슬리밍 단계에서 유실되는 이벤트를 복구한다.
- 이미 구현 완료된 분석 엔진 파싱 로직에 유실 데이터를 공급하여 연출을 자연스럽게 활성화하되, 현재 완벽하게 작동 중인 2D 리플레이 프론트엔드 렌더링 엔진(Canvas UI 코드 등)은 절대 수정하지 않아 리플레이 무결성을 100% 수호한다.
- 전적분석에서 무기 숙련도, 명중률, 회복 운영, 차량 운영 같은 체감 지표를 확장한다.
- 기존 `processed_match_telemetry`, `mapData`, `global_benchmarks` 흐름을 깨지 않고 단계적으로 고도화한다.

## 1-1. 2026-05-18 1차 진행 현황 및 실구현 점검 팩트

**[정밀 정적 코드 대조 결과 알림]**
`app/api/pubg/match/route.ts` 백엔드 필터링 및 슬리밍 소스코드를 정적으로 점검한 결과, 계획서 상의 1차 작업("적용 완료")은 실제 소스코드에 아직 온전히 반영되지 않고 **E2E 데이터 유실 상태(화이트리스트 및 캐릭터 필드 Discard)**로 남아있음이 확실한 팩트로 확인되었습니다.

따라서 현 상태는 **"미구현 및 유실 복구 진행 대기 상태"**이며, 이를 즉시 복구하기 위해 **Phase 1: 안전한 리플레이 복구** 구현 작업을 최우선으로 진행할 예정입니다.

적용 완료 예정 사항 (Phase 1 구현 타겟):
- `LogVehicleRide`, `LogVehicleLeave`, `LogExplosiveExplode`를 분석 캐시에 포함 (`match/route.ts` 화이트리스트 추가).
- `LogPlayerAttack`, `LogHeal`, `LogPlayerUseHeal`은 캐시 압축 효율을 극대화하여 E2E 복구.
- actor slimming에 `health`, `rotation`, `isInVehicle`, `isDBNO`, `viewDir` 추가 및 보존.
- `LogGameStatePeriodic`에 생존 인원/팀 수와 팩트 기반 데이터 보존.
- 분석 캐시 버전 싱크를 위해 `TELEMETRY_VERSION` 및 `RESULT_VERSION` 업그레이드 조율.

의도적으로 보류:

- `LogWeaponFireCount`, `LogWeaponFire`, `LogMatchEnd.allWeaponStats`는 저장량 증가 가능성이 있어 2차에서 샘플 크기 측정 후 적용한다.
- 전 플레이어 `LogPlayerAttack` 수집은 무료 플랜에서는 위험하므로 full replay 모드가 필요할 때 별도 캐시 정책으로 분리한다.

## 2. 현재 코드 검증 결과

### 2-1. 문서 내용과 코드가 일치하는 항목

`LogPlayerAttack`

- 문서 주장: 리플레이 핸들러는 있지만 수집 필터에서 유실된다.
- 코드 확인: `lib/pubg-analysis/handlers/MapReplayHandler.ts`에는 `handleAttack` 분기가 있다.
- 코드 확인: `app/api/pubg/match/route.ts`의 슬리밍 화이트리스트에는 `LogPlayerAttack`이 없다.
- 결론: 문서 내용이 맞다. 사격 이펙트/총구화염 리플레이가 약해질 수 있다.

`LogVehicleRide`, `LogVehicleLeave`

- 문서 주장: 차량 승하차 핸들러는 있지만 수집 필터에서 유실된다.
- 코드 확인: `MapReplayHandler`는 `ride/leave` map event를 생성한다.
- 코드 확인: `hooks/useTelemetry.ts`는 `ride/leave`로 `isInVehicle`, `vehicleId` 상태를 갱신한다.
- 코드 확인: `match/route.ts` 화이트리스트에는 두 이벤트가 없다.
- 결론: 문서 내용이 맞다. 차량 리플레이와 차량 운영 지표가 약해질 수 있다.

`LogExplosiveExplode`

- 문서 주장: 실제 폭발 이벤트 핸들러는 있지만 필터에서 유실된다.
- 코드 확인: `MapReplayHandler.handleExplosion`은 실제 폭발 위치를 `grenade/smoke/flash` 이벤트로 변환한다.
- 코드 확인: `match/route.ts` 화이트리스트에는 `LogExplosiveExplode`가 없다.
- 결론: 문서 내용이 맞다. 현재는 예측 폭발 위치에 의존할 가능성이 높다.

`LogHeal`, `LogPlayerUseHeal`

- 문서 주장: 회복 이벤트는 핸들러가 있지만 실제 수집되지 않는다.
- 코드 확인: `UtilityHandler`는 `LogHeal`, `LogPlayerUseHeal`을 처리한다.
- 코드 확인: `match/route.ts` 화이트리스트에는 두 이벤트가 없다.
- 결론: 문서 내용이 맞다. `itemUseStats.heals/boosts`가 과소 집계될 수 있다.

`LogProjectileHit`

- 문서 주장: 수집되지만 분석 엔진에서 거의 소비되지 않는다.
- 코드 확인: `match/route.ts` 화이트리스트에는 `LogProjectileHit`가 있다.
- 코드 확인: 주요 핸들러에서 `LogProjectileHit` 전용 처리 분기는 확인되지 않는다.
- 결론: 문서 내용이 맞다. 현재는 dead data에 가깝다.

`LogMatchEnd.allWeaponStats`

- 문서 주장: 원본에는 존재하지만 현재 무기 통계 source of truth로 사용하지 않는다.
- 코드 확인: `LogMatchEnd` 자체는 수집된다.
- 코드 확인: `match/route.ts` 슬리밍에서 `allWeaponStats` 보존 로직은 없다.
- 코드 확인: `AnalysisEngine`은 기존 `LogPlayerTakeDamage` 기반 `weaponStats`를 만든다.
- 결론: 문서 내용이 맞다. 무기 숙련도 고도화의 핵심 후보이다.

### 2-2. 보완 검증이 필요한 항목

`Character.health`, `isInVehicle`, `isDBNO`

- 코드 확인: `MapReplayHandler`는 `char.health`를 사용한다.
- 코드 확인: `match/route.ts` actor slimming은 현재 `name`, `accountId`, `teamId`, `location`, `vehicle` 중심으로 보존한다.
- 결론: 원본에 있어도 슬리밍 후 사라질 수 있다. 실제 캐시 JSON에서 필드 보존 여부를 샘플로 확인해야 한다.

`GameState.numAliveTeams`, `numAlivePlayers`

- 코드 확인: `LogGameStatePeriodic.gameState`에서는 자기장 위치/반경만 보존한다.
- 문서 주장: `numAlivePlayers`는 `LogPlayerPosition` 최상위에도 존재할 수 있다.
- 결론: `numAlivePlayers`는 위치 이벤트 보존 필드로 추가할 가치가 있다. `numAliveTeams`는 원본 샘플 확인이 필요하다.

## 3. 1차 구현 계획: 리플레이 데이터 유실 복구

목표: 이미 핸들러와 프론트 렌더러가 준비된 이벤트를 먼저 복구한다.

### 3-1. `match/route.ts` 화이트리스트 확장

추가 후보:

- `LogPlayerAttack`
- `LogVehicleRide`
- `LogVehicleLeave`
- `LogExplosiveExplode`
- `LogHeal`
- `LogPlayerUseHeal`
- `LogWeaponFireCount`
- `LogWeaponFire`

주의:

- `LogPlayerAttack`, `LogHeal`은 이벤트 수가 많아 캐시 크기를 키울 수 있다.
- `LogPlayerAttack`은 full mode와 lite mode 정책을 나눌지 검토한다.
- 처음에는 팀원/본인 중심으로 보존하고, 적군 이벤트는 샘플링하거나 full mode에서만 보존하는 방식을 추천한다.

### 3-2. actor slimming 필드 보존 확장

`character`, `attacker`, `victim`, `killer`, `finisher` 등 actor 객체에서 추가 보존할 필드:

- `health`
- `rotation`
- `viewDir`
- `isInVehicle`
- `isDBNO`
- `zone`
- `vehicle`

효과:

- 리플레이 체력바 정확도 개선
- 플레이어 방향/사격 방향 개선
- 차량 탑승 상태 보정
- 기절 상태 누락 보완

### 3-3. 이벤트별 top-level 필드 보존 확장

`keepFields` 추가 후보:

- `attackType`
- `explosiveItem`
- `explosiveId`
- `location`
- `numAlivePlayers`
- `elapsedTime`
- `rideDistance`
- `maxSpeed`
- `allWeaponStats`

주의:

- `allWeaponStats`는 `LogMatchEnd`에만 필요하다.
- `location`은 이벤트 종류별 구조가 다를 수 있으므로 저장 전 null-safe 처리가 필요하다.

## 4. 2차 구현 계획: 무기 숙련도 고도화

목표: 전적분석에서 유저가 바로 이해할 수 있는 무기 지표를 만든다.

### 4-1. `LogWeaponFireCount` 처리

`UtilityHandler` 또는 별도 `WeaponStatsHandler`에서 처리한다.

추가 지표:

- `shots`
- `fireCount`
- `primaryWeaponByShots`
- `weaponUsageCount`

기존 `LogPlayerTakeDamage` 기반 값과 결합:

- `hits`
- `damage`
- `kills`
- `dbnos`

파생 지표:

- `accuracy = hits / shots`
- `damagePerShot = damage / shots`
- `damagePerHit = damage / hits`

### 4-2. `LogMatchEnd.allWeaponStats` 병합

우선순위:

1. `allWeaponStats`가 있으면 무기별 `shots/hits/damage/hitDetails/holdingTime`을 source of truth로 사용한다.
2. 없으면 기존 `LogPlayerTakeDamage` 기반 `weaponStats`를 fallback으로 사용한다.

추가 지표:

- `headshotRate`
- `torsoHitRate`
- `limbHitRate`
- `primaryWeapon`
- `weaponHoldingTime`
- `weaponEfficiencyScore`

AI 피드백 예시:

- 주무기 의존도
- 헤드라인/몸샷 성향
- 많이 쏘지만 효율이 낮은 무기
- 적게 쏘지만 결정력이 높은 무기

## 5. 3차 구현 계획: 회복/차량/운영 지표

### 5-1. 회복 운영

수집 이벤트:

- `LogHeal`
- `LogPlayerUseHeal`
- `LogItemUse`

추가 지표:

- `healCount`
- `boostCount`
- `healTimingPhase`
- `healUnderPressureCount`
- `boostUptimeProxy`

활용:

- 전투 직후 회복 속도
- 교전 전 부스트 준비도
- 위험 상황에서 회복하는 습관

### 5-2. 차량 운영

수집 이벤트:

- `LogVehicleRide`
- `LogVehicleLeave`
- `LogPlayerPosition.vehicle`

추가 지표:

- `vehicleRideCount`
- `vehicleDistance`
- `avgRideDistance`
- `maxVehicleSpeed`
- `driveByDamage`
- `vehiclePhaseUsage`

활용:

- 외곽 운영형/도보 교전형 성향 구분
- 차량 회전 타이밍 분석
- 드라이브바이 성향 분석

### 5-3. 생존 난이도

수집 필드:

- `numAlivePlayers`
- `currentPhase`
- `deathPhase`
- `bluezoneWaste`

추가 지표:

- `alivePlayersAtDeath`
- `alivePlayersAtFirstKnock`
- `phaseSurvivalDifficulty`
- `lateGameEntryRate`

활용:

- “몇 명 남았을 때 죽는가”
- 중반 탈락형/후반 운영형 구분
- 순위만으로 설명 안 되는 생존 난이도 보정

## 6. 저장 구조 변경 계획

### 6-1. `processed_match_telemetry`

`data.fullResult`에 추가 권장:

- `weaponMastery`
- `healingStats`
- `vehicleStats`
- `survivalContext`

장점:

- 기존 JSON 저장 구조를 유지하므로 DB migration 부담이 낮다.
- AI 요약과 매치 카드가 바로 참조할 수 있다.

### 6-2. `global_benchmarks`

1차에서는 DB 컬럼 추가를 보류한다.

이유:

- 먼저 `processed_match_telemetry`에서 계산 안정성을 검증해야 한다.
- 벤치마크 컬럼을 바로 늘리면 `benchmark_stats_by_tier` 뷰도 같이 변경해야 한다.

2차 후보 컬럼:

- `accuracy`
- `headshot_rate`
- `primary_weapon`
- `heal_count`
- `boost_count`
- `vehicle_distance`
- `alive_players_at_death`

## 7. 버전 및 캐시 전략

수집 필터나 결과 구조가 바뀌면 캐시 재생성이 필요하다.

권장:

- `TELEMETRY_VERSION` bump
- `RESULT_VERSION` bump
- 기존 storage cache path가 새 버전을 타도록 유지

검증 시 주의:

- 기존 캐시가 남아 있으면 새 이벤트가 들어오지 않는다.
- 테스트 전 해당 매치의 storage cache를 지우거나 버전 bump 후 재분석한다.

## 8. 테스트 계획

### 8-1. 정적 검증

- `rg "LogPlayerAttack|LogVehicleRide|LogExplosiveExplode|LogHeal|LogWeaponFireCount" app/api/pubg/match/route.ts`
- `rg "shots|accuracy|allWeaponStats|weaponMastery" lib/pubg-analysis`

### 8-2. API 검증

테스트 매치 1개를 재분석한다.

확인 항목:

- `mapData.events`에 `shot` 이벤트가 존재하는지
- `mapData.events`에 `ride`, `leave` 이벤트가 존재하는지
- `mapData.events`에 실제 폭발 기반 `grenade/smoke/flash` 이벤트가 존재하는지
- `itemUseStats.heals`, `itemUseStats.boosts`가 회복 이벤트가 있는 매치에서 증가하는지
- `weaponStats`에 `shots`, `hits`, `damage`가 같이 존재하는지

### 8-3. UI 검증

- `/maps/[map]?playback=...`에서 사격 이펙트가 보이는지 확인
- 차량 탑승 상태가 유지되는지 확인
- 연막/수류탄 위치가 예측이 아닌 실제 폭발 위치로 표시되는지 확인
- 매치 카드에서 회복/무기 지표가 깨지지 않는지 확인

### 8-4. 회귀 검증

- `npm run lint`
- 관련 API 타입 체크
- 전적 검색 후 최근 10경기 AI 요약 생성
- 단일 매치 AI 분석 생성
- 기존 리플레이 lite/full mode 모두 확인

## 9. 추천 구현 순서

### Phase 1: 안전한 리플레이 복구

1. `match/route.ts` 화이트리스트에 누락 이벤트 추가
2. actor 필드 보존 확장
3. `TELEMETRY_VERSION` bump
4. 리플레이 이벤트 생성 여부 확인

예상 효과:

- 사격/차량/폭발/회복 이벤트가 리플레이와 분석 엔진에 도달한다.
- 기존 핸들러를 활용하므로 구현 리스크가 낮다.

### Phase 2: 무기 숙련도 분석

1. `LogWeaponFireCount` 핸들러 추가
2. `LogMatchEnd.allWeaponStats` 보존
3. `weaponStats` 병합 로직 추가
4. `AnalysisResult` 타입 확장
5. MatchCard/AI 요약에 무기 숙련 섹션 추가

예상 효과:

- 명중률, 헤드샷 성향, 주무기 효율 같은 유저 흥미 지표가 생긴다.

### Phase 3: 운영 지표 확장

1. 회복 운영 지표 추가
2. 차량 운영 지표 추가
3. 생존 난이도 지표 추가
4. 검증 후 `global_benchmarks` 컬럼/뷰 확장 검토

예상 효과:

- 단순 딜/킬 중심 분석에서 플레이 스타일 분석으로 확장된다.

## 10. 결론

가장 먼저 할 일은 `match/route.ts`의 슬리밍 필터 복구입니다.

이 작업은 문서와 현재 코드가 정확히 맞물려 있고, 이미 존재하는 핸들러와 프론트 렌더러를 살리는 수정입니다. 그 다음 `LogWeaponFireCount`와 `LogMatchEnd.allWeaponStats`를 붙이면 전적분석의 체감 품질이 가장 크게 올라갈 가능성이 높습니다.
