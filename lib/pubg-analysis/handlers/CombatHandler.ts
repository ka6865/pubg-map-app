import { AnalysisState, TimelineEvent } from "../types";
import { normalizeName, calcDist3D } from "../utils";
import { WEAPON_NAMES } from "../constants";
import { BaseHandler } from "./BaseHandler";

export class CombatHandler extends BaseHandler {
  constructor(state: AnalysisState) {
    super(state);
  }

  public handleEvent(e: any, ts: number, elapsed: number) {
    switch (e._T) {
      case "LogPlayerTakeDamage":
        this.handleDamage(e, ts);
        break;
      case "LogPlayerMakeGroggy":
      case "LogPlayerMakeDBNO":
        this.handleDown(e, ts);
        break;
      case "LogPlayerKill":
      case "LogPlayerKillV2":
        this.handleKill(e, ts);
        break;
      case "LogPlayerRevive":
        this.handleRevive(e, ts);
        break;
      case "LogPlayerRecall":
      case "LogPlayerRecallShip":
      case "LogPlayerRedeploy":
      case "LogPlayerRedeployBRStart": 
      case "LogPlayerRedeployBrStart": 
      case "LogPlayerCreate": // [V26.1] 태이고 복귀전 등 암시적 부활 대응
        this.handleRecall(e, ts);
        break;
    }
  }

  private handleDamage(e: any, ts: number) {
    const attackerName = normalizeName(e.attacker?.name || "");
    const victimName = normalizeName(e.victim?.name || "");
    const damage = e.damage || 0;

    if (!victimName) return;

    // 아군 피격 시 최근 피격 시점 업데이트 (Trade/Bait 판정용)
    if (this.state.teamNames.has(victimName) && victimName !== this.state.lowerNickname) {
      this.state.recentTeammateDamageTaken.set(attackerName, ts);
    }

    const isSoloMode = this.state.gameMode.includes('solo');
    const isMeAttacker = this.isMe(e.attacker);
    const isTeammateAttacker = this.isTeammate(e.attacker);
    const isMeVictim = this.isMe(e.victim);
    const isTeammateVictim = this.isTeammate(e.victim);

    if (
      isMeAttacker && 
      !isTeammateVictim && 
      !isSoloMode
    ) {
      const lastTeammateHit = this.state.recentTeammateDamageTaken.get(victimName);
      if (lastTeammateHit && ts - lastTeammateHit < 5000) {
        const lastBaitTs = this.state.baitCooldown.get(victimName) || 0;
        if (ts - lastBaitTs > 10000) {
          this.state.totalBaitCount++;
          this.state.baitCooldown.set(victimName, ts);
        }
      }
    }

    if (attackerName && victimName) {
      this.processDuelData(e, ts, e.attacker, e.victim);
    }

    if (isMeAttacker) {
      const elapsedSec = (ts - this.state.matchStartTime) / 1000;
      if (elapsedSec < 300) this.state.goldenTimeDamage.early += damage;
      else if (elapsedSec < 900) this.state.goldenTimeDamage.mid1 += damage;
      else if (elapsedSec < 1500) this.state.goldenTimeDamage.mid2 += damage;
      else this.state.goldenTimeDamage.late += damage;
    }

    if (isTeammateAttacker) {
      if (isMeAttacker) {
        this.state.myActionTimestamps.push(ts);
        this.state.totalCombatIsolationSum += (this.state.isolationData?.isolationIndex || 0);
        this.state.combatIsolationCount++;
      }

      const currentVictimDamage = this.state.victimDamage.get(victimName) || 0;
      this.state.victimDamage.set(victimName, currentVictimDamage + damage);

      if (isMeAttacker) {
        const wId = e.damageCauserName || (e.damageCauser && e.damageCauser.itemId) || e.weaponId || "Unknown";
        const cleanWId = wId.replace(/Item_Weapon_|Weap|_Projectile|_C/g, "");
        const wStat = this.state.weaponStats.get(cleanWId) || { kills: 0, dbnos: 0, damage: 0, hits: 0 };
        wStat.damage += damage;
        wStat.hits++;
        this.state.weaponStats.set(cleanWId, wStat);
        
        this.state.combatPressure.totalHits++;
        if (victimName) this.state.combatPressure.uniqueVictims.add(victimName);

        const attackerLoc = e.attacker?.location || e.attacker?.loc;
        const victimLoc = e.victim?.location || e.victim?.loc;
        const dist = calcDist3D(attackerLoc, victimLoc);
        if (dist !== 9.99) {
          const distM = Math.round(dist);
          this.state.combatPressure.maxHitDistance = Math.max(this.state.combatPressure.maxHitDistance, distM);
          if (distM < 50) this.state.itemUseStats.distanceDamage.short += damage;
          else if (distM < 200) this.state.itemUseStats.distanceDamage.mid += damage;
          else this.state.itemUseStats.distanceDamage.long += damage;
        }
      }

      let targetHits = this.state.playerCombatData.get(`hits_${victimName}`) || [];
      targetHits = targetHits.filter((h: any) => ts - h.ts < 1000);
      const otherTeammateHit = targetHits.find((h: any) => h.attacker !== attackerName);
      if (otherTeammateHit) {
        this.state.itemUseStats.focusFireCount++;
      }
      targetHits.push({ attacker: attackerName, ts });
      this.state.playerCombatData.set(`hits_${victimName}`, targetHits);
    }

    if (isMeVictim && attackerName && !isTeammateAttacker) {
      let recentAttackers = this.state.playerCombatData.get("recent_attackers_on_me") || [];
      recentAttackers = recentAttackers.filter((a: any) => ts - a.ts < 10000);

      const myLoc = e.victim?.location || e.victim?.loc;
      const attackerLoc = e.attacker?.location || e.attacker?.loc;

      if (myLoc && attackerLoc) {
        const currentAngle = Math.atan2(attackerLoc.y - myLoc.y, attackerLoc.x - myLoc.x);
        for (const prev of recentAttackers) {
          if (prev.name === attackerName) continue;
          let angleDiff = Math.abs(currentAngle - prev.angle) * (180 / Math.PI);
          if (angleDiff > 180) angleDiff = 360 - angleDiff;
          if (angleDiff > 90) {
            this.state.itemUseStats.crossfireExposureCount++;
            break;
          }
        }
        recentAttackers.push({ name: attackerName, angle: currentAngle, ts });
        this.state.playerCombatData.set("recent_attackers_on_me", recentAttackers);
      }
    }
  }

  private handleDown(e: any, ts: number) {
    const attacker = e.attacker || e.maker;
    const makerName = normalizeName(attacker?.name || "");
    const victimName = normalizeName(e.victim?.name || "");
    const weaponId = e.damageCauserName || (e.damageCauser && e.damageCauser.itemId) || e.weaponId || "Unknown";
    const dBNOId = e.dBNOId;

    const isMeMaker = this.isMe(attacker);
    const isMeVictim = this.isMe(e.victim);
    const isTeammateVictim = this.isTeammate(e.victim);

    if (dBNOId !== undefined && dBNOId !== -1) {
      this.state.dbnoMap.set(dBNOId, { attacker: makerName, victim: victimName, weaponId: weaponId, ts: ts, attackerAccountId: attacker?.accountId });
    }

    if (isMeMaker) {
      this.state.myActionTimestamps.push(ts);
      this.updateDuelOutcome(attacker, e.victim, true);
      const killerLoc = attacker?.location || attacker?.loc;
      const victimLoc = e.victim?.location || e.victim?.loc;
      const dist = Math.round(calcDist3D(killerLoc, victimLoc));

      this.state.timeline.push({
        ts: ts - this.state.matchStartTime,
        type: 'KNOCK',
        weapon: WEAPON_NAMES[weaponId] || weaponId.replace(/Item_Weapon_|Weap|_Projectile|_C/g, ""),
        victim: e.victim?.name || victimName,
        distance: dist !== 10 ? dist : undefined,
        isHeadshot: e.damageReason === "HeadShot" || e.isHeadshot,
        isMe: true
      });
    }

    if (isMeVictim) {
      this.state.myDownedIntervals.push({ start: ts, end: null });
      this.updateDuelOutcome(attacker, e.victim, true);
      this.state.timeline.push({
        ts: ts - this.state.matchStartTime,
        type: 'DOWNED',
        attacker: makerName,
        weapon: WEAPON_NAMES[weaponId] || weaponId.replace(/Item_Weapon_|Weap|_Projectile|_C/g, ""),
        isMe: true // [V26.1] 내가 기절함
      });
    }

    if (isTeammateVictim && !isMeVictim) {
      if (this.state.playerAliveStatus.get(this.state.lowerNickname) !== false) {
        this.state.totalTeammateKnocks++;
      }
      this.state.teammateKnockEvents.push(ts);
      this.state.playerAliveStatus.set(victimName, "groggy");
      this.state.timeline.push({
        ts: ts - this.state.matchStartTime,
        type: 'TEAM_KNOCK',
        attacker: attacker?.name || makerName,
        victim: e.victim?.name || victimName,
        weapon: WEAPON_NAMES[weaponId] || weaponId.replace(/Item_Weapon_|Weap|_Projectile|_C/g, ""),
        isMe: false
      });
    }

    if (victimName === this.state.lowerNickname) {
      this.state.playerAliveStatus.set(victimName, "groggy");
    }
  }

  private handleKill(e: any, ts: number) {
    const victimName = normalizeName(e.victim?.name || "");
    const isMeKiller = this.isMe(e.killer);
    const isMeFinisher = this.isMe(e.finisher);
    const isMeVictim = this.isMe(e.victim);
    const isTeammateKiller = this.isTeammate(e.killer);
    const isTeammateVictim = this.isTeammate(e.victim);

    const killerName = normalizeName(typeof e.killer === 'string' ? e.killer : e.killer?.name || "");
    const finisherName = normalizeName(typeof e.finisher === 'string' ? e.finisher : e.finisher?.name || "");
    const dBNOMakerName = normalizeName(typeof e.dBNOMaker === 'string' ? e.dBNOMaker : e.dBNOMaker?.name || "");

    const getWeaponId = (ev: any) => {
      let id = ev.weaponId || ev.damageCauserName || (ev.damageCauser && ev.damageCauser.itemId);
      if (!id || id === "None" || id === "Unknown") {
        const info = ev.killerDamageInfo || ev.finishDamageInfo || ev.dBNODamageInfo;
        if (info) id = info.damageCauserName;
      }
      if ((!id || id === "None" || id === "Unknown") && ev.dBNOId !== undefined && ev.dBNOId !== -1) {
        const dbnoInfo = this.state.dbnoMap.get(ev.dBNOId);
        if (dbnoInfo) id = dbnoInfo.weaponId;
      }
      return id || "Unknown";
    };

    const wId = getWeaponId(e);
    
    if (isTeammateKiller && victimName && !isTeammateVictim) {
      const lastTeammateKnock = this.state.teammateKnockEvents.length > 0 ? this.state.teammateKnockEvents[this.state.teammateKnockEvents.length - 1] : 0;
      if (lastTeammateKnock > 0 && ts - lastTeammateKnock < 30000) {
        this.state.totalTradeKills++;
        this.state.tradeLatencies.push(ts - lastTeammateKnock);
      }
      const totalDmgOnVictim = this.state.victimDamage.get(victimName) || 0;
      if (totalDmgOnVictim > 100) this.state.totalSuppCount++;
    }

    if (isMeKiller) {
      this.state.myActionTimestamps.push(ts);
      this.updateDuelOutcome(e.killer, e.victim, false);
      const attackerObj = e.killer || e.attacker || e.finisher;
      const killerLoc = attackerObj?.location || attackerObj?.loc;
      const victimLoc = e.victim?.location || e.victim?.loc;
      const dist = Math.round(calcDist3D(killerLoc, victimLoc));

      this.state.timeline.push({
        ts: ts - this.state.matchStartTime,
        type: 'KILL',
        weapon: WEAPON_NAMES[wId] || wId.replace(/Item_Weapon_|Weap|Vehicle_|BP_|_Projectile|_C/g, ""),
        victim: e.victim?.name || victimName,
        distance: dist !== 10 ? dist : undefined,
        isHeadshot: e.damageReason === "HeadShot" || e.killer?.damageReason === "HeadShot",
        isMe: true
      });

      if (victimName && !this.state.teamNames.has(victimName)) {
        const vRosterId = this.state.teamMapping.get(victimName);
        if (vRosterId && this.state.teamsUserHit.has(vRosterId)) this.state.killContribution.assist++;
        else this.state.killContribution.solo++;
      }
    } else if (isMeFinisher) {
      this.state.timeline.push({
        ts: ts - this.state.matchStartTime,
        type: 'FINISH',
        weapon: WEAPON_NAMES[wId] || wId.replace(/Item_Weapon_|Weap|Vehicle_|BP_|_Projectile|_C/g, ""),
        victim: e.victim?.name || victimName,
        attacker: e.killer?.name || e.finisher?.name || killerName || dBNOMakerName || "Unknown",
        isMe: true
      });
    } else if (isTeammateKiller) {
      this.state.timeline.push({
        ts: ts - this.state.matchStartTime,
        type: 'TEAM_KILL',
        attacker: e.killer?.name || killerName,
        victim: e.victim?.name || victimName,
        weapon: WEAPON_NAMES[wId] || wId.replace(/Item_Weapon_|Weap|Vehicle_|BP_|_Projectile|_C/g, ""),
        isMe: false
      });
    }

    if (victimName) {
      const cleanVictim = victimName.replace(/_/g, "");
      this.state.playerAliveStatus.set(cleanVictim, false);
      this.state.playerAliveStatus.set(victimName, false);

      const vRosterId = this.state.teamMapping.get(victimName);
      if (vRosterId && vRosterId !== this.state.myRosterId) {
        const members = this.state.teamAliveMembers.get(vRosterId);
        if (members) {
          members.delete(victimName);
          if (members.size === 0 && (this.state.teamsUserHit.has(vRosterId) || killerName === this.state.lowerNickname)) {
            this.state.wipedTeamsByUserParticipation.add(vRosterId);
          }
        }
      }
    }

    if (isTeammateVictim) {
      this.state.playerAliveStatus.set(victimName, false);
      if (!isMeVictim) {
        this.state.timeline.push({
          ts: ts - this.state.matchStartTime,
          type: 'TEAM_DIED',
          attacker: e.killer?.name || e.finisher?.name || killerName || finisherName || "Unknown",
          victim: e.victim?.name || victimName,
          weapon: WEAPON_NAMES[wId] || wId.replace(/Item_Weapon_|Weap|Vehicle_|BP_|_Projectile|_C/g, ""),
          isMe: false
        });
      }
    }

    if (isMeVictim) {
      this.state.myDeathTime = ts;
      this.state.playerAliveStatus.set(this.state.lowerNickname, false);
      this.state.playerAliveStatus.set(this.state.myAccountId, false);
      this.updateDuelOutcome(e.killer || e.finisher || e.dBNOMaker, e.victim, false);
      const attackerObj = e.killer || e.finisher || e.attacker;
      const killerLoc = attackerObj?.location || attackerObj?.loc;
      const myLoc = this.state.playerLocations.get(this.state.lowerNickname);
      if (killerLoc && myLoc) this.state.deathDistance = Math.round(calcDist3D(killerLoc, myLoc));
      this.state.timeline.push({
        ts: ts - this.state.matchStartTime,
        type: 'DIED',
        attacker: e.killer?.name || e.finisher?.name || killerName || finisherName || "Unknown",
        weapon: WEAPON_NAMES[wId] || wId.replace(/Item_Weapon_|Weap|Vehicle_|BP_|_Projectile|_C/g, ""),
        isMe: true
      });
    }
  }

  private handleRevive(e: any, ts: number) {
    const isMeReviver = this.isMe(e.reviver);
    const isTeammateReviver = this.isTeammate(e.reviver);
    const isMeVictim = this.isMe(e.victim);
    const isTeammateVictim = this.isTeammate(e.victim);
    const victimName = normalizeName(e.victim?.name || "");

    const isPreviouslyDead = this.state.playerAliveStatus.get(victimName) === false;

    const revType = (e.reviveType || "").toLowerCase();
    const isBr = revType === "br" || revType === "redeploy";
    const isRecall = revType === "recall" || revType === "bluechip" || isPreviouslyDead;

    if (isRecall || isBr) {
      this.handleRecall(e, ts, isBr);
      return;
    }
    this.state.playerAliveStatus.set(victimName, true);

    if (isTeammateReviver || isTeammateVictim) {
      this.state.totalReviveEvents.push(ts);
      if (isMeReviver) {
        this.state.myActionTimestamps.push(ts);
        this.state.timeline.push({ 
          ts: ts - this.state.matchStartTime, 
          type: 'REVIVE', 
          victim: e.victim?.name || victimName,
          isMe: true
        });
      } else {
        this.state.timeline.push({ 
          ts: ts - this.state.matchStartTime, 
          type: isMeVictim ? 'REVIVE' : 'TEAM_REVIVE', 
          attacker: e.reviver?.name || "동료", 
          victim: e.victim?.name || victimName,
          isMe: isMeVictim,
          isRecall: false
        });
      }
    }
  }

  private handleRecall(e: any, ts: number, forceBr: boolean = false) {
    const recaller = e.recaller || e.reviver || e.attacker;
    const recallerName = normalizeName(recaller?.name || "시스템");
    const isMeRecaller = this.isMe(recaller);
    const isTeammateRecaller = this.isTeammate(recaller);

    const victims: any[] = [];
    if (e.recalledPlayers && Array.isArray(e.recalledPlayers)) {
      e.recalledPlayers.forEach((p: any) => victims.push(p));
    } else {
      // character (LogPlayerRecallShip, LogPlayerRedeploy), victim (LogPlayerRevive-Recall)
      victims.push(e.victim || e.character || e.recallingPlayer || e.recalledPlayer);
    }

    const eventType = e._T || "";
    const isRedeploy = forceBr || 
                      eventType.toLowerCase().includes("redeploy") || 
                      (e.reviveType || "").toLowerCase() === "br";

    victims.forEach(v => {
      if (!v) return;
      const vName = normalizeName(v.name || "");
      const isTeammateVictim = this.isTeammate(v);
      const isMeVictim = this.isMe(v);

      if (isTeammateRecaller || isTeammateVictim || isMeVictim || isMeRecaller) {
        const isPreviouslyDead = this.state.playerAliveStatus.get(vName) === false;
        if (isPreviouslyDead) {
          // [V26.1] UI 표시를 위해 원본 이름(v.name) 보존하여 기록
          const displayName = v.name || vName; 
          this.state.timeline.push({
            ts: ts - this.state.matchStartTime,
            type: isRedeploy ? 'REDEPLOY' : (isMeVictim ? 'RECALL' : 'TEAM_RECALL'),
            attacker: recaller?.name || "시스템", // 원본 이름 보존
            victim: displayName,
            isMe: isMeVictim || isMeRecaller,
            isRecall: !isRedeploy
          });
        }
        this.state.playerAliveStatus.set(vName, true);
        if (isMeVictim) {
          this.state.myDeathTime = null;
        }
      }
    });
  }

  private processDuelData(e: any, ts: number, attacker: any, victim: any) {
    const attackerName = normalizeName(attacker?.name || "");
    const victimName = normalizeName(victim?.name || "");

    [attacker, victim].forEach(char => {
      if (!char) return;
      const isMe = this.isMe(char);
      const isElite = this.isElite(char);
      if (isMe || isElite) {
        const myName = isMe ? this.state.myAccountId : (char.accountId || normalizeName(char.name));
        let pData = this.state.playerCombatData.get(myName);
        if (!pData) {
          pData = { total: 0, success: 0, duelWins: 0, duelLosses: 0, reversalWins: 0, reversalAttempts: 0, sessions: new Map() };
          this.state.playerCombatData.set(myName, pData);
        }
        
        const opponent = char === attacker ? victimName : attackerName;
        let session = pData.sessions.get(opponent);
        const lastActivity = session ? Math.max(session.lastHitByEnemy || 0, session.lastHitByUser || 0) : 0;
        const isExpired = session && ts - lastActivity > 180000;

        if (!session || isExpired) {
          session = {
            lastHitByEnemy: char === victim ? ts : 0,
            lastHitByUser: char === attacker ? ts : 0,
            userStarted: char === attacker,
            alreadySucceeded: false,
            outcome: null
          };
          pData.sessions.set(opponent, session);
          if (char === attacker) pData.total++;
          else pData.reversalAttempts++;
        } else {
          if (char === attacker) {
            session.lastHitByUser = ts;
            if (!session.userStarted && session.lastHitByEnemy > 0 && pData.reversalAttempts > 0) {
              const latency = ts - session.lastHitByEnemy;
              if (latency > 0 && latency < 10000) {
                this.state.reactLatSum += latency;
                this.state.reactCount++;
              }
            }
          } else {
            session.lastHitByEnemy = ts;
          }
        }
      }
    });
  }

  private updateDuelOutcome(attacker: any, victim: any, isKnock: boolean) {
    if (!attacker || !victim) return;
    const attackerName = normalizeName(attacker.name || "");
    const victimName = normalizeName(victim.name || "");

    [attacker, victim].forEach(char => {
      const isMe = this.isMe(char);
      if (isMe || this.isElite(char)) {
        const myName = isMe ? this.state.myAccountId : (char.accountId || normalizeName(char.name));
        const pData = this.state.playerCombatData.get(myName);
        if (pData) {
          const opponent = char === attacker ? victimName : attackerName;
          const session = pData.sessions.get(opponent);
          if (session && !session.outcome) {
            if (char === attacker) {
              session.outcome = "win";
              pData.duelWins++;
              if (session.userStarted && !session.alreadySucceeded) {
                pData.success++;
                session.alreadySucceeded = true;
              }
              if (!session.userStarted) pData.reversalWins++;
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
