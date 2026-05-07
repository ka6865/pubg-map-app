import { BaseHandler } from './BaseHandler';
import { normalizeName, calcDist3D } from '../utils';

export class PositionHandler extends BaseHandler {
  handleEvent(e: any, ts: number, elapsed: number): void {
    switch (e._T) {
      case "LogPlayerPosition":
        this.handlePosition(e, ts, elapsed);
        break;
      case "LogParachuteLanding":
        this.handleLanding(e);
        break;
      case "LogPlayerCreate":
        this.handlePlayerCreate(e);
        break;
      case "LogPlayerTakeDamage":
      case "LogPlayerKill":
      case "LogPlayerMakeGroggy":
        this.updateParticipantLocations(e);
        break;
    }
  }

  private handlePosition(e: any, ts: number, elapsed: number) {
    const pName = normalizeName(e.character?.name || "");
    if (!pName) return;
    
    const charLoc = e.character.loc || e.character.location;
    if (!charLoc) return;

    this.state.playerLocations.set(pName, { x: charLoc.x, y: charLoc.y, z: charLoc.z || 0 });

    const isLanded = this.state.hasLanded;
    const isAfterStart = elapsed > 120 * 1000;

    const isInVehicle = !!(e.character.vehicle || e.vehicle);

    if (pName === this.state.lowerNickname && (isLanded || isAfterStart) && 
        this.state.playerAliveStatus.get(this.state.lowerNickname) !== false &&
        !isInVehicle &&
        ts - this.state.lastIsolationSampleTime >= 5000) {
      
      this.state.lastIsolationSampleTime = ts;
      const iso = this.calculateIsolationData();
      if (iso) {
        this.state.totalMinDistSum += iso.minDist;
        this.state.totalHeightDiffSum += iso.heightDiff;
        this.state.totalNearbyTeammatesSum += iso.teammateCount;
        this.state.totalIsolationSum += iso.isolationIndex;
        this.state.isolationSampleCount++;
      }
    }
  }

  private handleLanding(e: any) {
    const pName = normalizeName(e.character?.name || "");
    if (pName === this.state.lowerNickname) {
      this.state.hasLanded = true;
    }
  }

  private handlePlayerCreate(e: any) {
    const pName = normalizeName(e.character?.name || "");
    if (pName) {
      this.state.playerAliveStatus.set(pName, true);
      const loc = e.character.loc || e.character.location;
      if (loc) this.state.playerLocations.set(pName, { x: loc.x, y: loc.y, z: loc.z || 0 });
    }
  }

  private updateParticipantLocations(e: any) {
    const update = (char: any) => {
      if (char?.name && char?.loc) {
        const name = normalizeName(char.name);
        this.state.playerLocations.set(name, { x: char.loc.x, y: char.loc.y, z: char.loc.z || 0 });
      }
    };
    update(e.attacker);
    update(e.victim);
    update(e.character);
    update(e.maker);
    update(e.killer);
  }

  private calculateIsolationData() {
    const charLoc = this.state.playerLocations.get(this.state.lowerNickname);
    if (!charLoc || this.state.playerAliveStatus.get(this.state.lowerNickname) === false) return null;

    let minDist = 999999, minEnemyDist = 999999, hDiff = 0, nearbyTeammates = 0;
    let totalDistToTeammates = 0;
    let aliveTeammateCount = 0;

    this.state.teamNames.forEach(tName => {
      const status = this.state.playerAliveStatus.get(tName);
      if (tName !== this.state.lowerNickname && status !== false && status !== "groggy") {
        const tLoc = this.state.playerLocations.get(tName);
        if (tLoc) {
          const d = calcDist3D(charLoc, tLoc);
          if (d > 1) {
            totalDistToTeammates += d;
            aliveTeammateCount++;
            if (d < minDist) { minDist = d; hDiff = Math.abs(charLoc.z - tLoc.z); }
            if (d < 10000) nearbyTeammates++; 
          }
        }
      }
    });

    this.state.playerLocations.forEach((loc, name) => {
      const rId = this.state.teamMapping.get(name);
      if (rId && rId !== this.state.myRosterId && this.state.playerAliveStatus.get(name) !== false) {
        const d = calcDist3D(charLoc, loc);
        if (d > 1 && d < minEnemyDist) minEnemyDist = d;
      }
    });

    // 스쿼드인 경우 모든 팀원과의 평균 거리를 우선 고려 (듀오는 어차피 1명이라 동일)
    const effectiveDist = aliveTeammateCount > 0 ? (totalDistToTeammates / aliveTeammateCount) : minDist;
    const distRatio = effectiveDist / Math.max(100, minEnemyDist);
    
    return {
      isolationIndex: Math.min(5, distRatio),
      minDist: effectiveDist / 100, // m 단위 정규화 (스쿼드 가중치 반영)
      heightDiff: hDiff / 100,
      teammateCount: nearbyTeammates
    };
  }
}
