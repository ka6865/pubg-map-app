import { BaseHandler } from './BaseHandler';
import { normalizeName, calcDist3D, getElapsedMinutes } from '../utils';

export class CombatHandler extends BaseHandler {
  handleEvent(e: any, ts: number, elapsed: number): void {
    switch (e._T) {
      case "LogPlayerTakeDamage":
        this.handleDamage(e, ts);
        break;
      case "LogPlayerMakeGroggy":
      case "LogPlayerMakeGroggyV2":
        this.handleDBNO(e, ts);
        break;
      case "LogPlayerKill":
      case "LogPlayerKillV2":
        this.handleKill(e, ts);
        break;
      case "LogPlayerRevive":
        this.handleRevive(e, ts);
        break;
      case "LogPlayerAttack":
        this.handleAttack(e, ts);
        break;
    }
  }

  private handleDamage(e: any, ts: number) {
    const attackerName = normalizeName(e.attacker?.name || "");
    const victimName = normalizeName(e.victim?.name || "");
    const damage = e.damage || 0;
    const dmgCat = (e.damageTypeCategory || "").toLowerCase();
    const weapon = (e.damageCauser?.itemId || e.weaponId || "").toLowerCase();
    const isVehicleDamage = weapon.includes("vehicle") || dmgCat.includes("vehicle");

    // 모든 데미지 이벤트에서 듀얼 데이터 업데이트 (누가 먼저 쐈는지 판별)
    if (!isVehicleDamage && attackerName && victimName && attackerName !== victimName) {
      this.processDuelData(e, ts, attackerName, victimName);
    }

    if (attackerName === this.state.lowerNickname) {
      if (victimName !== this.state.lowerNickname && !isVehicleDamage) {
        // 1. 무기 스탯 및 데미지 누적
        const wId = e.weaponId || "Unknown";
        let wStat = this.state.weaponStats.get(wId) || { hits: 0, headshots: 0 };
        wStat.hits++;
        if (e.damageReason === "HeadShot") wStat.headshots++;
        this.state.weaponStats.set(wId, wStat);

        let vDmg = this.state.victimDamage.get(victimName);
        if (!vDmg || ts - vDmg.lastTs > 120000) vDmg = { total: 0, user: 0, lastTs: ts };
        vDmg.total += damage; vDmg.user += damage; vDmg.lastTs = ts;
        this.state.victimDamage.set(victimName, vDmg);

        // 2. 교전 압박 (Pressure)
        this.state.combatPressure.totalHits++;
        this.state.combatPressure.uniqueVictims.add(victimName);
        const dist = calcDist3D(e.attacker?.loc, e.victim?.loc);
        if (dist !== 999) {
          const distM = Math.round(dist);
          if (distM > this.state.combatPressure.maxHitDistance) this.state.combatPressure.maxHitDistance = distM;
        }

        // 3. 골든타임
        const minOffset = getElapsedMinutes(ts, this.state.matchStartTime);
        if (minOffset <= 5) this.state.goldenTimeDamage.early += damage;
        else if (minOffset <= 15) this.state.goldenTimeDamage.mid1 += damage;
        else if (minOffset <= 25) this.state.goldenTimeDamage.mid2 += damage;
        else this.state.goldenTimeDamage.late += damage;

        // 4. 팀 전술 지원
        const lastTeammateHit = this.state.recentTeammateDamageTaken.get(victimName);
        if (lastTeammateHit && ts - lastTeammateHit < 10000) {
          this.state.totalCoverAttempts++;
          this.state.totalCoverSuccess++;
          this.state.totalSuppCount++;
          this.state.recentTeammateDamageTaken.delete(victimName);
        }

        // 5. 반응 속도
        const lastHitOnMe = this.state.myRecentDamageTaken.get(victimName);
        if (lastHitOnMe && ts - lastHitOnMe < 5000) {
          const lat = ts - lastHitOnMe;
          this.state.reactLatSum += lat;
          this.state.reactCount++;
          this.state.reactionLatencies.push(lat);
          this.state.myRecentDamageTaken.delete(victimName);
        }

        const vRosterId = this.state.teamMapping.get(victimName);
        if (vRosterId && vRosterId !== this.state.myRosterId) this.state.teamsUserHit.add(vRosterId);
        this.state.myDamageEvents.push({ ts, victim: victimName, loc: e.attacker?.loc, victimLoc: e.victim?.loc });
      }
    } else if (this.state.teamNames.has(victimName) && attackerName && attackerName !== this.state.lowerNickname) {
      // 아군(본인 포함)이 적에게 맞았을 때 기록
      if (victimName === this.state.lowerNickname) {
        this.state.totalTimesHit++;
        this.state.myRecentDamageTaken.set(attackerName, ts);
      }
      this.state.recentTeammateDamageTaken.set(attackerName, ts);
      this.state.recentAttacksOnUser.push({ ts, attacker: attackerName }); // 크로스파이어 판정 공유

      // 크로스파이어 판정
      const cutoffTs = ts - 5000;
      while (this.state.recentAttacksOnUser.length > 0 && this.state.recentAttacksOnUser[0].ts < cutoffTs) {
        this.state.recentAttacksOnUser.shift();
      }
      const uniqueAttackers = new Set(this.state.recentAttacksOnUser.map(a => a.attacker));
      if (uniqueAttackers.size >= 2) this.state.totalCrossfireCount++;
    } else if (this.state.teamNames.has(victimName) && attackerName && !this.state.teamNames.has(attackerName)) {
      this.state.recentTeammateDamageTaken.set(attackerName, ts);
    }
  }

  private handleDBNO(e: any, ts: number) {
    const victimName = normalizeName(e.victim?.name || "");
    const getMaker = (ev: any) => {
      const name = ev.maker?.name || ev.dBNOMaker?.name || ev.attacker?.name || ev.character?.name || "";
      return normalizeName(typeof name === 'string' ? name : "");
    };
    const finalMakerName = getMaker(e);

    if (e.dBNOId !== undefined) {
      this.state.dbnoMap.set(e.dBNOId, { attacker: finalMakerName, victim: victimName, ts });
    }

    if (finalMakerName === this.state.lowerNickname) this.state.myActionTimestamps.push(ts);
    this.updateDuelOutcome(finalMakerName, victimName, true);

    if (victimName === this.state.lowerNickname) {
      this.state.myDownedIntervals.push({ start: ts, end: null });
    }

    if (this.state.teamNames.has(victimName) && victimName !== this.state.lowerNickname) {
      this.state.totalTeammateKnocks++;
      this.state.teammateKnockEvents.push(ts);
    }
  }

  private handleKill(e: any, ts: number) {
    const victimName = normalizeName(e.victim?.name || "");
    const getKiller = (ev: any) => {
      const name = ev.killer?.name || ev.finisher?.name || ev.attacker?.name || "";
      return normalizeName(typeof name === 'string' ? name : "");
    };
    const finalKillerName = getKiller(e);
    
    if (finalKillerName === this.state.lowerNickname) {
      this.state.myActionTimestamps.push(ts);
      
      // 정밀 트레이드 (dBNOId 기반)
      let isTrade = false;
      if (e.dBNOId !== undefined) {
        const originalDown = this.state.dbnoMap.get(e.dBNOId);
        if (originalDown && this.state.teamNames.has(originalDown.victim)) {
          const lat = ts - originalDown.ts;
          if (lat < 30000) {
            this.state.tradeLatencies.push(lat);
            this.state.totalTradeKills++;
            isTrade = true;
          }
        }
      }

      // 폴백 트레이드: 최근 아군을 공격한 적을 잡았는지 확인
      if (!isTrade) {
        const lastDamageTime = this.state.recentTeammateDamageTaken.get(victimName);
        if (lastDamageTime && (ts - lastDamageTime) < 30000) {
          this.state.totalTradeKills++;
          this.state.tradeLatencies.push(ts - lastDamageTime);
          isTrade = true;
        }
      }

      this.updateDuelOutcome(finalKillerName, victimName, false);
    }

    if (victimName && !this.state.teamNames.has(victimName)) {
      if (finalKillerName === this.state.lowerNickname) {
        const vDmg = this.state.victimDamage.get(victimName);
        if (vDmg) {
          const userRatio = vDmg.user / Math.max(1, vDmg.total);
          if (userRatio >= 0.7) this.state.killContribution.solo++; else this.state.killContribution.cleanup++;
        } else {
          this.state.killContribution.solo++;
        }
      }
      this.state.victimDamage.delete(victimName);
      const vRosterId = this.state.teamMapping.get(victimName);
      if (vRosterId && vRosterId !== this.state.myRosterId) {
        const members = this.state.teamAliveMembers.get(vRosterId);
        if (members) {
          members.delete(victimName);
          if (members.size === 0 && (this.state.teamsUserHit.has(vRosterId) || finalKillerName === this.state.lowerNickname)) {
            this.state.wipedTeamsByUserParticipation.add(vRosterId);
          }
        }
      }
    }

    if (victimName === this.state.lowerNickname) {
      this.state.myDeathTime = ts;
      this.state.playerAliveStatus.set(this.state.lowerNickname, false);
      const killerLoc = e.killer?.loc || e.finisher?.loc;
      const myLoc = this.state.playerLocations.get(this.state.lowerNickname);
      if (killerLoc && myLoc) {
        this.state.deathDistance = Math.round(calcDist3D(killerLoc, myLoc) / 100);
      }
    } else if (victimName) {
      this.state.playerAliveStatus.set(victimName, false);
    }
  }

  private handleRevive(e: any, ts: number) {
    const reviverName = normalizeName(e.reviver?.name || "");
    if (reviverName === this.state.lowerNickname) {
      this.state.myReviveEvents.push(ts);
      this.state.myActionTimestamps.push(ts);
    }
  }

  private handleAttack(e: any, ts: number) {
    const attackerName = normalizeName(e.attacker?.name || "");
    if (attackerName === this.state.lowerNickname) {
      this.state.myAttackEvents.add(e.attackId);
    }
  }

  private processDuelData(e: any, ts: number, attackerName: string, victimName: string) {
    [attackerName, victimName].forEach(name => {
      if (name === this.state.lowerNickname || this.state.eliteNames.has(name)) {
        let pData = this.state.playerCombatData.get(name);
        if (!pData) {
          pData = { total: 0, success: 0, duelWins: 0, duelLosses: 0, reversalWins: 0, reversalAttempts: 0, sessions: new Map() };
          this.state.playerCombatData.set(name, pData);
        }
        const opponent = name === attackerName ? victimName : attackerName;
        let session = pData.sessions.get(opponent);
        
        // 세션이 없거나 2분 이상 지났으면 새로 생성
        if (!session || ts - Math.max(session.lastHitByEnemy || 0, session.lastHitByUser || 0) > 120000) {
          session = { 
            lastHitByEnemy: name === victimName ? ts : 0, 
            lastHitByUser: name === attackerName ? ts : 0, 
            userStarted: name === attackerName, 
            alreadySucceeded: false,
            outcome: null
          };
          pData.sessions.set(opponent, session);
          
          // "내가 먼저 쐈을 때만" 선제 타격 시도(total)로 카운트
          if (name === attackerName) {
            pData.total++;
          } else {
            // "적에게 먼저 맞았을 때" 반격 시도(reversalAttempts)로 카운트
            pData.reversalAttempts++;
          }
        } else {
          // 기존 세션 업데이트
          if (name === attackerName) session.lastHitByUser = ts;
          else session.lastHitByEnemy = ts;
        }
      }
    });
  }

  private updateDuelOutcome(attacker: string, victim: string, isDBNO: boolean) {
    [attacker, victim].forEach(name => {
      if (name === this.state.lowerNickname || this.state.eliteNames.has(name)) {
        const pData = this.state.playerCombatData.get(name);
        if (pData) {
          const opponent = name === attacker ? victim : attacker;
          const session = pData.sessions.get(opponent);
          if (session && !session.outcome) {
            if (name === attacker) {
              session.outcome = "win";
              pData.duelWins++;
              // 적이 먼저 쏜 세션에서 이겼다면 역전승(reversalWins) 카운트
              if (!session.userStarted) {
                pData.reversalWins++;
              }
              // 내가 먼저 쏜 세션에서 이겼다면 선제 타격 성공(success) 카운트
              if (session.userStarted && !session.alreadySucceeded) {
                pData.success++;
                session.alreadySucceeded = true;
              }
            } else {
              session.outcome = "lose";
              pData.duelLosses++;
            }
          }
        }
      }
    });
  }
}
