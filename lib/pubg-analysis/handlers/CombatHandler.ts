import { AnalysisState } from "../types";
import { normalizeName, calcDist3D, scaleCoordinate } from "../utils";
import { WEAPON_NAMES, IGNORE_WEAPONS } from "../constants";
import { BaseHandler } from "./BaseHandler";

export class CombatHandler extends BaseHandler {
  constructor(state: AnalysisState) {
    super(state);
  }

  public handleEvent(e: any, ts: number, _elapsed: number) {
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
      case "LogMatchEnd":
        this.handleMatchEnd(e);
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
        const currentMyDmg = this.state.myVictimDamage.get(victimName) || 0;
        this.state.myVictimDamage.set(victimName, currentMyDmg + damage);

        const wId = e.damageCauserName || (e.damageCauser && e.damageCauser.itemId) || e.weaponId || "Unknown";
        const cleanWId = wId.replace(/Item_Weapon_|Weap|_Projectile|_C/g, "");

        // 1. 제외 무기 필터링 (투척물, 캐릭터 오브젝트, C4, 자전거 등 분석 배제)
        if (
          IGNORE_WEAPONS.includes(wId) || 
          IGNORE_WEAPONS.includes(cleanWId) ||
          cleanWId === "None" ||
          cleanWId === "Unknown" ||
          cleanWId.startsWith("Proj") ||
          cleanWId.includes("Projectile") ||
          cleanWId.includes("Grenade") ||
          cleanWId.includes("Molotov") ||
          cleanWId.includes("Smoke") ||
          cleanWId.includes("Flash") ||
          cleanWId.includes("Sticky") ||
          cleanWId.includes("PlayerFemale") ||
          cleanWId.includes("PlayerMale") ||
          cleanWId.includes("Punch") ||
          cleanWId.includes("Melee") ||
          cleanWId.includes("Pan") ||
          cleanWId.includes("Cowbar") ||
          cleanWId.includes("Crowbar") ||
          cleanWId.includes("C4") ||
          cleanWId.includes("Bike") ||
          cleanWId.includes("Flare")
        ) {
          return;
        }

        // 2. 피해자가 이미 기절(groggy) 상태이거나 사망(false) 상태인 경우 딜량 가산 제외 (확킬 딜량 오염 방지)
        const victimStatus = this.state.playerAliveStatus.get(victimName);
        const isVictimGroggy = victimStatus === "groggy" || victimStatus === false;

        if (!isVictimGroggy) {
          const wStat = this.state.weaponStats.get(cleanWId) || { kills: 0, dbnos: 0, damage: 0, hits: 0 };
          wStat.damage += damage;
          wStat.hits++;
          this.state.weaponStats.set(cleanWId, wStat);
        }
        
        this.state.combatPressure.totalHits++;
        if (victimName) this.state.combatPressure.uniqueVictims.add(victimName);

        const attackerLoc = e.attacker?.location || e.attacker?.loc;
        const victimLoc = e.victim?.location || e.victim?.loc;
        const dist = calcDist3D(attackerLoc, victimLoc);
        if (dist !== 999) {
          const distM = Math.round(dist / 100);
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
            this.state.totalCrossfireCount++;
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

    // 기절한 모든 플레이어의 생존 상태를 실시간 groggy로 업데이트
    if (victimName) {
      this.state.playerAliveStatus.set(victimName, "groggy");
    }

    if (isMeMaker) {
      this.state.myActionTimestamps.push(ts);
      this.updateDuelOutcome(attacker, e.victim);
      const killerLoc = attacker?.location || attacker?.loc;
      const victimLoc = e.victim?.location || e.victim?.loc;
      const dist = Math.round(calcDist3D(killerLoc, victimLoc) / 100);

      // [V59.0] 차량 탑승 타격 감지 (로드킬 제외)
      const dmgCat = (e.damageTypeCategory || "").toLowerCase();
      const isRoadkill = dmgCat.includes("vehicle");
      if (!isRoadkill) {
        if (e.victim?.isInVehicle === true) {
          this.state.leadShotKnocks++;
        }
        if (attacker?.isInVehicle === true) {
          this.state.ridingShotKnocks++;
        }
      }

      this.state.timeline.push({
        ts: ts - this.state.matchStartTime,
        type: 'KNOCK',
        weapon: WEAPON_NAMES[weaponId] || weaponId.replace(/Item_Weapon_|Weap|_Projectile|_C/g, ""),
        victim: e.victim?.name || victimName,
        distance: dist !== 10 ? dist : undefined,
        isHeadshot: e.damageReason === "HeadShot" || e.isHeadshot,
        isMe: true,
        x: scaleCoordinate(this.state.playerLocations.get(makerName)?.x || attacker?.location?.x || 0, this.state.mapSize),
        y: scaleCoordinate(this.state.playerLocations.get(makerName)?.y || attacker?.location?.y || 0, this.state.mapSize),
        playerName: this.state.canonicalNickname,
        victimX: scaleCoordinate(this.state.playerLocations.get(victimName)?.x || e.victim?.location?.x || 0, this.state.mapSize),
        victimY: scaleCoordinate(this.state.playerLocations.get(victimName)?.y || e.victim?.location?.y || 0, this.state.mapSize)
      });
    }

    if (isMeVictim) {
      this.state.myDownedIntervals.push({ start: ts, end: null });
      this.updateDuelOutcome(attacker, e.victim);
      this.state.timeline.push({
        ts: ts - this.state.matchStartTime,
        type: 'DOWNED',
        attacker: makerName,
        weapon: WEAPON_NAMES[weaponId] || weaponId.replace(/Item_Weapon_|Weap|_Projectile|_C/g, ""),
        isMe: true,
        x: scaleCoordinate(this.state.playerLocations.get(this.state.lowerNickname)?.x || e.victim?.location?.x || 0, this.state.mapSize),
        y: scaleCoordinate(this.state.playerLocations.get(this.state.lowerNickname)?.y || e.victim?.location?.y || 0, this.state.mapSize),
        playerName: this.state.canonicalNickname,
        attackerX: scaleCoordinate(this.state.playerLocations.get(makerName)?.x || attacker?.location?.x || 0, this.state.mapSize),
        attackerY: scaleCoordinate(this.state.playerLocations.get(makerName)?.y || attacker?.location?.y || 0, this.state.mapSize)
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
        isMe: false,
        x: scaleCoordinate(this.state.playerLocations.get(victimName)?.x || e.victim?.location?.x || 0, this.state.mapSize),
        y: scaleCoordinate(this.state.playerLocations.get(victimName)?.y || e.victim?.location?.y || 0, this.state.mapSize),
        playerName: e.victim?.name || victimName,
        attackerX: scaleCoordinate(this.state.playerLocations.get(attacker?.name || makerName)?.x || attacker?.location?.x || 0, this.state.mapSize),
        attackerY: scaleCoordinate(this.state.playerLocations.get(attacker?.name || makerName)?.y || attacker?.location?.y || 0, this.state.mapSize)
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
    const attackerObj = e.killer || e.attacker || e.finisher;

    // [V55.2] 트레이드 킬: '내가' 팀원의 복수를 해준 경우 (isMeKiller)
    if (isMeKiller && victimName && !isTeammateVictim) {
      const lastTeammateKnock = this.state.teammateKnockEvents.length > 0 ? this.state.teammateKnockEvents[this.state.teammateKnockEvents.length - 1] : 0;
      if (lastTeammateKnock > 0 && ts - lastTeammateKnock < 30000) {
        this.state.totalTradeKills++;
        this.state.tradeLatencies.push(ts - lastTeammateKnock);
      }
    }

    // [V55.2] 지원 사격(Support): '내가' 데미지를 50 이상 입혔는데, '팀원'이 킬을 한 경우
    if (isTeammateKiller && !isMeKiller && victimName && !isTeammateVictim) {
      const myDmgOnVictim = this.state.myVictimDamage.get(victimName) || 0;
      if (myDmgOnVictim >= 50) {
        this.state.totalSuppCount++;
      }
    }

    if (isMeKiller) {
      this.state.myActionTimestamps.push(ts);
      this.updateDuelOutcome(e.killer, e.victim);
      const killerLoc = attackerObj?.location || attackerObj?.loc;
      const victimLoc = e.victim?.location || e.victim?.loc;
      const dist = Math.round(calcDist3D(killerLoc, victimLoc) / 100);

      // [V59.0] 차량 탑승 킬 감지 (로드킬 제외)
      const dmgCat = (e.damageTypeCategory || "").toLowerCase();
      const isRoadkill = dmgCat.includes("vehicle");
      if (!isRoadkill) {
        if (e.victim?.isInVehicle === true) {
          this.state.leadShotKills++;
        }
        if (attackerObj?.isInVehicle === true) {
          this.state.ridingShotKills++;
        }
      }

      this.state.timeline.push({
        ts: ts - this.state.matchStartTime,
        type: 'KILL',
        weapon: WEAPON_NAMES[wId] || wId.replace(/Item_Weapon_|Weap|Vehicle_|BP_|_Projectile|_C/g, ""),
        victim: e.victim?.name || victimName,
        distance: dist !== 10 ? dist : undefined,
        isHeadshot: e.damageReason === "HeadShot" || e.killer?.damageReason === "HeadShot",
        isMe: true,
        x: scaleCoordinate(this.state.playerLocations.get(this.state.lowerNickname)?.x || killerLoc?.x || 0, this.state.mapSize),
        y: scaleCoordinate(this.state.playerLocations.get(this.state.lowerNickname)?.y || killerLoc?.y || 0, this.state.mapSize),
        playerName: this.state.canonicalNickname,
        victimX: scaleCoordinate(this.state.playerLocations.get(victimName)?.x || victimLoc?.x || 0, this.state.mapSize),
        victimY: scaleCoordinate(this.state.playerLocations.get(victimName)?.y || victimLoc?.y || 0, this.state.mapSize)
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
        isMe: true,
        x: scaleCoordinate(attackerObj?.location?.x ?? (this.state.playerLocations.get(this.state.lowerNickname)?.x || 0), this.state.mapSize),
        y: scaleCoordinate(attackerObj?.location?.y ?? (this.state.playerLocations.get(this.state.lowerNickname)?.y || 0), this.state.mapSize),
        playerName: this.state.canonicalNickname
      });
    } else if (isTeammateKiller) {
      this.state.timeline.push({
        ts: ts - this.state.matchStartTime,
        type: 'TEAM_KILL',
        attacker: e.killer?.name || killerName,
        victim: e.victim?.name || victimName,
        weapon: WEAPON_NAMES[wId] || wId.replace(/Item_Weapon_|Weap|Vehicle_|BP_|_Projectile|_C/g, ""),
        isMe: false,
        x: scaleCoordinate(this.state.playerLocations.get(killerName)?.x || attackerObj?.location?.x || 0, this.state.mapSize),
        y: scaleCoordinate(this.state.playerLocations.get(killerName)?.y || attackerObj?.location?.y || 0, this.state.mapSize),
        playerName: e.killer?.name || killerName || "Teammate",
        victimX: scaleCoordinate(this.state.playerLocations.get(victimName)?.x || e.victim?.location?.x || 0, this.state.mapSize),
        victimY: scaleCoordinate(this.state.playerLocations.get(victimName)?.y || e.victim?.location?.y || 0, this.state.mapSize)
      });
    }

    if (victimName) {
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
          isMe: false,
          x: scaleCoordinate(this.state.playerLocations.get(victimName)?.x || e.victim?.location?.x || 0, this.state.mapSize),
          y: scaleCoordinate(this.state.playerLocations.get(victimName)?.y || e.victim?.location?.y || 0, this.state.mapSize),
          playerName: e.victim?.name || victimName,
          attackerX: scaleCoordinate(this.state.playerLocations.get(killerName)?.x || (typeof e.killer !== 'string' ? e.killer?.location?.x : 0) || 0, this.state.mapSize),
          attackerY: scaleCoordinate(this.state.playerLocations.get(killerName)?.y || (typeof e.killer !== 'string' ? e.killer?.location?.y : 0) || 0, this.state.mapSize)
        });
      }
    }

    if (isMeVictim) {
      this.state.myDeathTime = ts;
      this.state.playerAliveStatus.set(this.state.lowerNickname, false);
      this.state.playerAliveStatus.set(this.state.myAccountId, false);
      this.updateDuelOutcome(e.killer || e.finisher || e.dBNOMaker, e.victim);
      const killerLoc = attackerObj?.location || attackerObj?.loc;
      const myLoc = this.state.playerLocations.get(this.state.lowerNickname);
      if (killerLoc && myLoc) this.state.deathDistance = Math.round(calcDist3D(killerLoc, myLoc) / 100);
      this.state.timeline.push({
        ts: ts - this.state.matchStartTime,
        type: 'DIED',
        attacker: e.killer?.name || e.finisher?.name || killerName || finisherName || "Unknown",
        weapon: WEAPON_NAMES[wId] || wId.replace(/Item_Weapon_|Weap|Vehicle_|BP_|_Projectile|_C/g, ""),
        isMe: true,
        x: scaleCoordinate(myLoc?.x ?? 0, this.state.mapSize),
        y: scaleCoordinate(myLoc?.y ?? 0, this.state.mapSize),
        playerName: this.state.canonicalNickname,
        attackerX: scaleCoordinate(this.state.playerLocations.get(killerName)?.x || attackerObj?.location?.x || 0, this.state.mapSize),
        attackerY: scaleCoordinate(this.state.playerLocations.get(killerName)?.y || attackerObj?.location?.y || 0, this.state.mapSize)
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
      
      const isSelfRevive = isMeReviver && isMeVictim;
      const reviverLoc = e.reviver?.location || e.reviver?.loc;

      if (isMeReviver) {
        this.state.myReviveCount++;
        this.state.myActionTimestamps.push(ts);
        this.state.timeline.push({ 
          ts: ts - this.state.matchStartTime, 
          type: 'REVIVE', 
          attacker: e.reviver?.name || this.state.canonicalNickname,
          victim: e.victim?.name || victimName,
          isMe: true,
          isSelfRevive,
          x: scaleCoordinate(reviverLoc?.x ?? (this.state.playerLocations.get(this.state.lowerNickname)?.x || 0), this.state.mapSize),
          y: scaleCoordinate(reviverLoc?.y ?? (this.state.playerLocations.get(this.state.lowerNickname)?.y || 0), this.state.mapSize)
        });
      } else {
        this.state.timeline.push({ 
          ts: ts - this.state.matchStartTime, 
          type: isMeVictim ? 'REVIVE' : 'TEAM_REVIVE', 
          attacker: e.reviver?.name || "동료", 
          victim: e.victim?.name || victimName,
          isMe: isMeVictim,
          isRecall: false,
          isSelfRevive: false,
          x: scaleCoordinate(reviverLoc?.x ?? (this.state.playerLocations.get(normalizeName(e.reviver?.name || ""))?.x || 0), this.state.mapSize),
          y: scaleCoordinate(reviverLoc?.y ?? (this.state.playerLocations.get(normalizeName(e.reviver?.name || ""))?.y || 0), this.state.mapSize)
        });
      }
    }
  }

  private handleRecall(e: any, ts: number, forceBr: boolean = false) {
    const recaller = e.recaller || e.reviver || e.attacker;
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
            isRecall: !isRedeploy,
            x: scaleCoordinate(v.location?.x ?? (this.state.playerLocations.get(vName)?.x || 0), this.state.mapSize),
            y: scaleCoordinate(v.location?.y ?? (this.state.playerLocations.get(vName)?.y || 0), this.state.mapSize)
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
              if (latency >= 0 && latency < 10000) {
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

  private updateDuelOutcome(attacker: any, victim: any) {
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

  private handleMatchEnd(e: any) {
    if (!e.allWeaponStats || !Array.isArray(e.allWeaponStats)) return;

    // 1. accountId -> canonicalName 맵 구축
    const accountToNameMap = new Map<string, string>();
    if (e.characters && Array.isArray(e.characters)) {
      e.characters.forEach((c: any) => {
        const char = c.character || c;
        if (char && char.accountId && char.name) {
          accountToNameMap.set(char.accountId, char.name);
        }
      });
    }

    // 2. allWeaponStats 순회
    e.allWeaponStats.forEach((playerStat: any) => {
      const accId = playerStat.accountId;
      if (!accId) return;

      const isMe = accId === this.state.myAccountId;
      const isTeammate = this.state.teamAccountIds.has(accId) && !isMe;

      if (isMe) {
        // 본인 무기 통계 정밀 오버라이트 보정
        if (playerStat.stats && Array.isArray(playerStat.stats)) {
          playerStat.stats.forEach((w: any) => {
            const wId = w.weapon || "Unknown";
            const cleanWId = wId.replace(/Item_Weapon_|Weap|_Projectile|_C/g, "");
            
            // 제외 무기 필터링 (투척물, 주먹, 프라이팬, 캐릭터 오브젝트, C4, 자전거 등 분석 배제)
            if (
              IGNORE_WEAPONS.includes(wId) || 
              IGNORE_WEAPONS.includes(cleanWId) ||
              cleanWId === "None" ||
              cleanWId === "Unknown" ||
              cleanWId.startsWith("Proj") ||
              cleanWId.includes("Projectile") ||
              cleanWId.includes("Grenade") ||
              cleanWId.includes("Molotov") ||
              cleanWId.includes("Smoke") ||
              cleanWId.includes("Flash") ||
              cleanWId.includes("Sticky") ||
              cleanWId.includes("PlayerFemale") ||
              cleanWId.includes("PlayerMale") ||
              cleanWId.includes("Punch") ||
              cleanWId.includes("Melee") ||
              cleanWId.includes("Pan") ||
              cleanWId.includes("Cowbar") ||
              cleanWId.includes("Crowbar") ||
              cleanWId.includes("C4") ||
              cleanWId.includes("Bike") ||
              cleanWId.includes("Flare")
            ) {
              return;
            }
            
            const existing = this.state.weaponStats.get(cleanWId) || { kills: 0, dbnos: 0, damage: 0, hits: 0 };
            
            existing.damage = w.damage ?? existing.damage;
            existing.hits = w.hits ?? existing.hits;
            existing.shots = w.shots ?? 0;
            existing.dBNODamage = w.dBNODamage ?? 0;
            existing.dBNOHits = w.dBNOHits ?? 0;
            existing.holdingTime = w.holdingTime ?? 0;
            existing.hitDetails = w.hitDetails ?? [];
            existing.accuracy = w.shots > 0 ? Math.round((w.hits / w.shots) * 100) : 0;

            this.state.weaponStats.set(cleanWId, existing);
          });
        }
      } else if (isTeammate) {
        // 아군 무기 통계 적재
        const tName = accountToNameMap.get(accId) || accId;
        const tWeaponList: any[] = [];

        if (playerStat.stats && Array.isArray(playerStat.stats)) {
          playerStat.stats.forEach((w: any) => {
            const wId = w.weapon || "Unknown";
            const cleanWId = wId.replace(/Item_Weapon_|Weap|_Projectile|_C/g, "");
            
            // 제외 무기 필터링 (투척물, 주먹, 프라이팬, 캐릭터 오브젝트, C4, 자전거 등 분석 배제)
            if (
              IGNORE_WEAPONS.includes(wId) || 
              IGNORE_WEAPONS.includes(cleanWId) ||
              cleanWId === "None" ||
              cleanWId === "Unknown" ||
              cleanWId.startsWith("Proj") ||
              cleanWId.includes("Projectile") ||
              cleanWId.includes("Grenade") ||
              cleanWId.includes("Molotov") ||
              cleanWId.includes("Smoke") ||
              cleanWId.includes("Flash") ||
              cleanWId.includes("Sticky") ||
              cleanWId.includes("PlayerFemale") ||
              cleanWId.includes("PlayerMale") ||
              cleanWId.includes("Punch") ||
              cleanWId.includes("Melee") ||
              cleanWId.includes("Pan") ||
              cleanWId.includes("Cowbar") ||
              cleanWId.includes("Crowbar") ||
              cleanWId.includes("C4") ||
              cleanWId.includes("Bike") ||
              cleanWId.includes("Flare")
            ) {
              return;
            }
            
            tWeaponList.push({
              weapon: cleanWId,
              damage: w.damage ?? 0,
              dBNODamage: w.dBNODamage ?? 0,
              shots: w.shots ?? 0,
              hits: w.hits ?? 0,
              dBNOHits: w.dBNOHits ?? 0,
              holdingTime: w.holdingTime ?? 0,
              hitDetails: w.hitDetails ?? [],
              accuracy: w.shots > 0 ? Math.round((w.hits / w.shots) * 100) : 0
            });
          });
        }
        
        if (tWeaponList.length > 0) {
          this.state.squadWeaponStats.set(tName, tWeaponList);
        }
      }
    });
  }
}
