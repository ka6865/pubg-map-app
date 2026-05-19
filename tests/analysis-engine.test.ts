import { describe, it, expect } from 'vitest';
import { AnalysisEngine } from '../lib/pubg-analysis/AnalysisEngine';
import { calcBenchmarkScore, getBenchmarkTier, getBaseTier, getNextTierInfo } from '../lib/pubg-analysis/benchmarkScore';
import fs from 'fs';
import path from 'path';

describe('AnalysisEngine 실데이터(Gold Match) 정밀 검증', () => {
  // 실제 KangHeeSung_ 님의 경기 데이터를 테스트 Fixture로 사용
  const realDataPath = path.resolve(__dirname, '../scratch/test-data/revive-gold-match.json');
  if (!fs.existsSync(realDataPath)) {
    console.warn('⚠️ 테스트 데이터 파일이 없습니다. 테스트를 건너뜁니다.');
    return;
  }
  const telemetry = JSON.parse(fs.readFileSync(realDataPath, 'utf-8'));
  
  const nickname = "KangHeeSung_";
  const myAccountId = "account.a5fedccd38fb412eaa369658474f326f";
  const teamNames = new Set([nickname]);
  const teamAccountIds = new Set([myAccountId]);
  const eliteNames = new Set([]);
  const eliteAccountIds = new Set([]);
  const myRosterId = "my-roster";

  it('실제 경기에서의 자기장 누적 피해(bluezoneWaste)가 27 HP여야 함', () => {
    const engine = new AnalysisEngine(nickname, myAccountId, teamNames, teamAccountIds, eliteNames, eliteAccountIds, myRosterId);
    const result = engine.run(telemetry, { id: "gold-match", createdAt: "2026-05-02T16:00:00Z", gameMode: "squad" }, [], [], { damageDealt: 500, kills: 3, timeSurvived: 1200 }, [], {});
    
    expect(result.bluezoneWaste).toBe(27);
    console.log("TEST BENCHMARK:", JSON.stringify(result.benchmark, null, 2));
  });

  it('실제 경기에서의 선제 타격 효율(initiative_rate)이 약 14%여야 함', () => {
    const engine = new AnalysisEngine(nickname, myAccountId, teamNames, teamAccountIds, eliteNames, eliteAccountIds, myRosterId);
    const result = engine.run(telemetry, { id: "gold-match", createdAt: "2026-05-02T16:00:00Z", gameMode: "squad" }, [], [], { damageDealt: 500, kills: 3, timeSurvived: 1200 }, [], {});
    
    expect(Math.round(result.initiative_rate)).toBe(14);
    expect(result.initiativeSampleCount).toBe(7); // 7회 시도 중 1회 성공
  });

  it('실제 경기에서의 자기장 끝선 플레이(edgePlay)가 8회여야 함', () => {
    const engine = new AnalysisEngine(nickname, myAccountId, teamNames, teamAccountIds, eliteNames, eliteAccountIds, myRosterId);
    const result = engine.run(telemetry, { id: "gold-match", createdAt: "2026-05-02T16:00:00Z", gameMode: "squad" }, [], [], { damageDealt: 500, kills: 3, timeSurvived: 1200 }, [], {});
    
    expect(result.zoneStrategy.edgePlayCount).toBe(8);
  });

  it('실제 경기에서의 교전 승리(wins)가 1회여야 함', () => {
    const engine = new AnalysisEngine(nickname, myAccountId, teamNames, teamAccountIds, eliteNames, eliteAccountIds, myRosterId);
    const result = engine.run(telemetry, { id: "gold-match", createdAt: "2026-05-02T16:00:00Z", gameMode: "squad" }, [], [], { damageDealt: 0, kills: 0 }, [], {});
    
    expect(result.duelStats.wins).toBe(1);
    expect(result.duelStats.losses).toBe(2);
  });

  it('차량 전투 지표(리드샷/라이딩샷) 초기화 및 작동 정합성 검증', () => {
    const engine = new AnalysisEngine(nickname, myAccountId, teamNames, teamAccountIds, eliteNames, eliteAccountIds, myRosterId);
    const result = engine.run(telemetry, { id: "gold-match", createdAt: "2026-05-02T16:00:00Z", gameMode: "squad" }, [], [], { damageDealt: 500, kills: 3, timeSurvived: 1200 }, [], {});
    
    expect(result.leadShotKills).toBe(0);
    expect(result.leadShotKnocks).toBe(0);
    expect(result.ridingShotKills).toBe(0);
    expect(result.ridingShotKnocks).toBe(0);
  });

  it('실시간 hitDetails 수집 및 LogMatchEnd의 hitDetails 누락 시 Fallback 정합성 검증', () => {
    const engine = new AnalysisEngine(nickname, myAccountId, teamNames, teamAccountIds, eliteNames, eliteAccountIds, myRosterId);
    
    // telemetry에서 LogMatchEnd를 찾고, w.hitDetails를 강제로 비워 텔레메트리 상세 누락 유실 상태를 모사
    const modifiedTelemetry = JSON.parse(JSON.stringify(telemetry));
    const matchEndEvent = modifiedTelemetry.find((e: any) => e._T === "LogMatchEnd");
    if (matchEndEvent && matchEndEvent.allWeaponStats) {
      matchEndEvent.allWeaponStats.forEach((player: any) => {
        if (player.accountId === myAccountId && player.stats) {
          player.stats.forEach((w: any) => {
            w.hitDetails = []; // ⚠️ 강제로 비워서 누락된 API 상태를 모사
          });
        }
      });
    }

    const result = engine.run(modifiedTelemetry, { id: "gold-match", createdAt: "2026-05-02T16:00:00Z", gameMode: "squad" }, [], [], { damageDealt: 500, kills: 3, timeSurvived: 1200 }, [], {});
    
    // 결과의 weaponStats를 확인
    expect(result.weaponStats).toBeDefined();
    const weaponKeys = Object.keys(result.weaponStats);
    expect(weaponKeys.length).toBeGreaterThan(0);
    
    // 실시간으로 누적된 명중 정보(hitDetails)가 Fallback을 통해 안전하게 복구되었는지 검증
    const mainWeaponKey = weaponKeys.find(key => key === "Dragunov" || key === "ACE32" || key === "FNFal");
    expect(mainWeaponKey).toBeDefined();
    if (mainWeaponKey) {
      const mainWeapon = (result.weaponStats as any)[mainWeaponKey];
      expect(mainWeapon.hitDetails).toBeDefined();
      expect(mainWeapon.hitDetails.length).toBeGreaterThan(0);
      expect(mainWeapon.hits).toBeGreaterThan(0);
      expect(mainWeapon.damage).toBeGreaterThan(0);
      console.log(`🎯 [Fallback Test Passed] ${mainWeaponKey} hitDetails count:`, mainWeapon.hitDetails.length);
    }
  });
});

describe('티어 산정 및 조기 탈락 폴백 엔진 검증', () => {

  it('90점 이상 획득 시 S+ 등급으로 판정되어야 함', () => {
    // 만점에 가까운 높은 지표 입력 (스쿼드 기준)
    const highInput = {
      rankPct: 0.05,
      survivalTime: 1700,
      initiativeRate: 90,
      counterLatencyMs: 150,
      pressureIndex: 4.8,
      smokeRate: 95,
      suppCount: 8,
      reviveRate: 95,
      tradeRate: 95,
      teamWipes: 3,
      reversalRate: 90,
      deathPhase: 8,
      suppRate: 90
    };
    const result = getBenchmarkTier(highInput, false);
    expect(result.tier).toBe('S+');
    expect(result.score).toBeGreaterThanOrEqual(90);
  });

  it('82점 이상 90점 미만 획득 시 S 등급으로 판정되어야 함', () => {
    const sInput = {
      rankPct: 0.08,
      survivalTime: 1600,
      initiativeRate: 75,
      counterLatencyMs: 300,
      pressureIndex: 4.2,
      smokeRate: 80,
      suppCount: 5,
      reviveRate: 80,
      tradeRate: 80,
      teamWipes: 2,
      reversalRate: 70,
      deathPhase: 7,
      suppRate: 70
    };
    const result = getBenchmarkTier(sInput, false);
    expect(result.tier).toBe('S');
    expect(result.score).toBeGreaterThanOrEqual(82);
    expect(result.score).toBeLessThan(90);
  });

  it('getBaseTier 함수가 S+ 와 S 모두 S를 반환해야 함', () => {
    expect(getBaseTier('S+')).toBe('S');
    expect(getBaseTier('S')).toBe('S');
    expect(getBaseTier('A+')).toBe('A');
    expect(getBaseTier('B-')).toBe('B');
  });

  it('조기 탈락자(10분 미만 또는 3페이즈 이하 사망)는 폴백 혜택이 낮게 적용되어야 함', () => {
    // 생존시간 500초(10분 미만), 사망페이즈 2 (조기 탈락)
    // 폴백이 필요한 음수(-1) 전달
    const earlyDeathInput = {
      rankPct: 0.4,
      survivalTime: 500,
      initiativeRate: -1,
      counterLatencyMs: -1,
      pressureIndex: 1.0,
      smokeRate: -1,
      suppCount: 0,
      reviveRate: -1,
      tradeRate: -1,
      teamWipes: 0,
      reversalRate: -1,
      deathPhase: 2,
      suppRate: -1
    };

    // 생존시간 700초(10분 이상), 사망페이즈 4 (정상 탈락)
    // 동일하게 폴백이 필요한 음수(-1) 전달
    const normalDeathInput = {
      rankPct: 0.4,
      survivalTime: 700,
      initiativeRate: -1,
      counterLatencyMs: -1,
      pressureIndex: 1.0,
      smokeRate: -1,
      suppCount: 0,
      reviveRate: -1,
      tradeRate: -1,
      teamWipes: 0,
      reversalRate: -1,
      deathPhase: 4,
      suppRate: -1
    };

    const earlyScore = calcBenchmarkScore(earlyDeathInput, false);
    const normalScore = calcBenchmarkScore(normalDeathInput, false);

    // 정상 탈락자가 높은 폴백율(70~80%)을 적용받으므로 점수가 훨씬 높아야 함
    // (물론 생존시간과 데스페이즈 자체 점수 차이도 있지만, 폴백 차이[Smoke 30->70, Revive 30->80, Trade 30->80 등]로 인해 점수 격차가 매우 큼)
    expect(normalScore).toBeGreaterThan(earlyScore + 10); // 최소 10점 이상의 폴백 점수 차이가 나야 함
  });

  it('getNextTierInfo 함수가 S+ 등급일 때 null을 반환해야 함', () => {
    // 95점인 경우 S+ 등급으로 추정되므로 getNextTierInfo는 null을 반환해야 함
    expect(getNextTierInfo(95)).toBeNull();
  });
});

