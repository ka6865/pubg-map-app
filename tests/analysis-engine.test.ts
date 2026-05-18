import { describe, it, expect } from 'vitest';
import { AnalysisEngine } from '../lib/pubg-analysis/AnalysisEngine';
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
});
