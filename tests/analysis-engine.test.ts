import { describe, it, expect } from 'vitest';
import { AnalysisEngine } from '../lib/pubg-analysis/processor';
import fs from 'fs';
import path from 'path';

describe('AnalysisEngine 실데이터(Gold Match) 정밀 검증', () => {
  // 실제 KangHeeSung_ 님의 경기 데이터를 테스트 Fixture로 사용
  const realDataPath = path.resolve(__dirname, '../scratch/test-data/revive-gold-match.json');
  const telemetry = JSON.parse(fs.readFileSync(realDataPath, 'utf-8'));
  
  const nickname = "KangHeeSung_";
  const teamNames = new Set([nickname]);
  const eliteNames = new Set([]);
  const myRosterId = "my-roster";

  it('실제 경기에서의 자기장 누적 피해(bluezoneWaste)가 27 HP여야 함', () => {
    const engine = new AnalysisEngine(nickname, teamNames, eliteNames, myRosterId);
    const result = engine.run(telemetry, { id: "gold-match", createdAt: "2026-05-02T16:00:00Z" }, [], [], { damageDealt: 0, kills: 0 }, [], {});
    
    expect(result.bluezoneWaste).toBe(27);
  });

  it('실제 경기에서의 선제 타격 효율(initiative_rate)이 25%여야 함', () => {
    const engine = new AnalysisEngine(nickname, teamNames, eliteNames, myRosterId);
    const result = engine.run(telemetry, { id: "gold-match", createdAt: "2026-05-02T16:00:00Z" }, [], [], { damageDealt: 0, kills: 0 }, [], {});
    
    expect(result.initiative_rate).toBe(25);
    expect(result.initiativeSampleCount).toBe(4); // 4회 시도 중 1회 성공
  });

  it('실제 경기에서의 자기장 끝선 플레이(edgePlay)가 14회여야 함', () => {
    const engine = new AnalysisEngine(nickname, teamNames, eliteNames, myRosterId);
    const result = engine.run(telemetry, { id: "gold-match", createdAt: "2026-05-02T16:00:00Z" }, [], [], { damageDealt: 0, kills: 0 }, [], {});
    
    expect(result.zoneStrategy.edgePlayCount).toBe(14);
  });

  it('실제 경기에서의 교전 승리(wins)가 1회여야 함', () => {
    const engine = new AnalysisEngine(nickname, teamNames, eliteNames, myRosterId);
    const result = engine.run(telemetry, { id: "gold-match", createdAt: "2026-05-02T16:00:00Z" }, [], [], { damageDealt: 0, kills: 0 }, [], {});
    
    expect(result.duelStats.wins).toBe(1);
    expect(result.duelStats.losses).toBe(1);
  });
});
