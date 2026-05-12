import { BaseHandler } from './BaseHandler';
import { normalizeName, calcDist3D } from '../utils';
import { WEAPON_NAMES } from '../constants';

export class UtilityHandler extends BaseHandler {
  private processedThrowIds = new Set<string>();
  private savedKnockTimestamps = new Set<number>();
  private underCoverKnocks = new Set<number>(); // 연막 보호 중인 기절 이벤트
  private victimToKnockTs = new Map<string, number>(); // 피해자 이름 -> 기절 시점 매핑

  handleEvent(e: any, ts: number, elapsed: number): void {
    switch (e._T) {
      case "LogPlayerTakeDamage":
        this.handleStunHit(e);
        this.handleUtilityDamage(e);
        break;
      case "LogItemUse":
        this.handleItemUse(e);
        break;
      case "LogPlayerUseHeal":
        this.handleHeal(e, ts);
        break;
      case "LogPlayerUseThrowable":
        this.handleUseThrowable(e, ts);
        break;
      case "LogHeal":
        this.handleHeal(e, ts);
        break;
      case "LogThrowableUse":
        this.handleThrowable(e, ts);
        break;
      case "LogProjectileHit":
        this.handleProjectileHit(e);
        break;
      case "LogWeaponFire":
        this.handleWeaponFire(e, ts);
        break;
      case "LogPlayerRevive":
        this.handleRevive(e, ts);
        break;
      case "LogPlayerKill":
      case "LogPlayerKillV2":
        this.handleKill(e, ts);
        break;
      case "LogPlayerMakeGroggy":
      case "LogPlayerMakeDBNO":
        this.handleDown(e, ts);
        break;
    }
  }

  private handleUseThrowable(e: any, ts: number) {
    const attackerName = normalizeName(e.attacker?.name || e.character?.name || "");
    const attackId = e.attackId || 0;
    const itemId = (e.weaponId || e.weapon?.itemId || e.weapon?.name || "").toLowerCase();

    const isMeAttacker = this.isMe(e.attacker || e.character);
    const isTeammateAttacker = this.isTeammate(e.attacker || e.character);

    // 본인 또는 팀원이 투척물을 던진 경우
    if (isTeammateAttacker && !this.processedThrowIds.has(attackId)) {
      this.processedThrowIds.add(attackId);
      if (isMeAttacker) {
        this.state.itemUseStats.throwCount++;
      }

      // [V12.7] 타임라인 기록 (매핑 테이블 우선 순위)
      const mappedName = WEAPON_NAMES[e.weaponId] || WEAPON_NAMES[itemId] || itemId.replace(/Item_Weapon_|Weap|_C/g, "");

      // 이름이 없는 아이템은 제외
      if (!mappedName || mappedName.trim() === "") return;

      this.state.timeline.push({
        ts: ts - this.state.matchStartTime,
        type: 'ITEM_USE',
        weapon: mappedName,
        attacker: isMeAttacker ? undefined : attackerName
      });

      if (itemId.includes("smoke") || itemId.includes("m79")) {
        this.state.itemUseSummary.smokes = (this.state.itemUseSummary.smokes || 0) + 1;

        // [V14.2] handleUseThrowable에서도 세이브 판정 로직 수행 (LogThrowableUse 누락 대비)
        if (isMeAttacker) {
          const myLoc = this.state.playerLocations.get(this.state.myAccountId) || this.state.playerLocations.get(this.state.lowerNickname);
          const lastKnock = this.state.teammateKnockEvents.find(kts => {
            if (ts >= kts && ts - kts < 20000) {
              const knockedTeammate = Array.from(this.victimToKnockTs.entries())
                .find(([name, kTs]) => kTs === kts)?.[0];
              if (knockedTeammate && myLoc) {
                const tLoc = this.state.playerLocations.get(knockedTeammate);
                if (tLoc) {
                const dist = calcDist3D(myLoc, tLoc) / 100; // m 단위
                return dist < 40; // [V38.3] 거리 판정 상향 (40m)
                }
              }
            }
            return false;
          });

          if (lastKnock && !this.underCoverKnocks.has(lastKnock)) {
            this.state.totalSmokeCount++;
            this.underCoverKnocks.add(lastKnock);
          }
        }
      } else if (itemId.includes("grenade") || itemId.includes("molotov") || itemId.includes("c4")) {
        this.state.itemUseSummary.frags = (this.state.itemUseSummary.frags || 0) + 1;
        this.state.itemUseStats.lethalThrowCount++;
      } else if (itemId.includes("flashbang") || itemId.includes("stun")) {
        this.state.itemUseSummary.stuns = (this.state.itemUseSummary.stuns || 0) + 1;
      } else {
        this.state.itemUseSummary.others = (this.state.itemUseSummary.others || 0) + 1;
      }
    }
  }

  private handleStunHit(e: any) {
    const weapon = (e.damageCauserName || e.damageCauser?.itemId || e.weaponId || "").toLowerCase();

    if (this.isMe(e.attacker)) {
      if (weapon.includes("flashbang") || weapon.includes("stun")) {
        this.state.combatPressure.stunHits = (this.state.combatPressure.stunHits || 0) + 1;
      }
    }
  }

  private handleUtilityDamage(e: any) {
    const dmgCat = (e.damageTypeCategory || "").toLowerCase();
    const weapon = (e.damageCauserName || e.damageCauser?.itemId || e.weaponId || "").toLowerCase();
    const damage = e.damage || 0;

    if (this.isMe(e.attacker)) {
      const isUtility = ["grenade", "molotov", "c4", "explosion", "explosive"].some(k =>
        dmgCat.includes(k) || weapon.includes(k)
      );
      if (isUtility) {
        this.state.utilitySummary.totalDamage += damage;
        this.state.utilitySummary.hitCount++;
        this.state.combatPressure.utilityDamage += damage;
        this.state.combatPressure.utilityHits++;
      }
    }
  }

  private handleItemUse(e: any) {
    if (this.isMe(e.character)) {
      const itemId = (e.item?.itemId || e.item?.name || e.itemId || "").toLowerCase();

      // 투척물 (LogItemUse로 기록됨)
      const isThrowable = itemId.includes("grenade") || itemId.includes("smoke") || itemId.includes("flashbang") || itemId.includes("molotov");
      if (isThrowable) {
        // LogItemUse는 인벤토리 사용(핀 뽑기 등) 시점에 발생할 수 있으나, throwCount 중복 방지를 위해 UseThrowable과 이원화 관리
        if (itemId.includes("smoke")) {
          // 이미 handleUseThrowable에서 처리하므로 여기서는 세부 로그 보정만 수행
        }
      }
    }
  }

  private handleHeal(e: any, ts: number) {
    const characterName = normalizeName(e.character?.name || "");
    const isMe = this.isMe(e.character);
    // 본인 또는 팀원이 아이템을 사용한 경우
    if (isMe || this.isTeammate(e.character)) {
      const itemId = (e.item?.itemId || e.item?.name || e.itemId || "").toLowerCase();

      // [V12.7] 타임라인 기록 (매핑 테이블 우선 순위)
      const mappedName = WEAPON_NAMES[e.item?.itemId] || WEAPON_NAMES[itemId] || itemId.replace(/Item_Weapon_|Item_Heal_|Item_Boost_|_C/g, "");

      // 이름이 없는 아이템(불필요한 시스템 로그)은 타임라인에서 제외
      if (!mappedName || mappedName.trim() === "") return;

      this.state.timeline.push({
        ts: ts - this.state.matchStartTime,
        type: 'ITEM_USE',
        weapon: mappedName,
        attacker: isMe ? undefined : characterName
      });

      if (itemId.includes("firstaid") || itemId.includes("medkit") || itemId.includes("bandage")) {
        this.state.itemUseStats.heals++;
      } else if (itemId.includes("energydrink") || itemId.includes("painkiller") || itemId.includes("adrenaline")) {
        this.state.itemUseStats.boosts++;
      }
    }
  }

  private handleRevive(e: any, ts: number) {
    const victimName = normalizeName(e.victim?.name || "");
    const knockTs = this.victimToKnockTs.get(victimName);

    // 연막 보호 중인 상태에서 부활 성공 -> 구출 성공(Result) 카운트
    if (knockTs && this.underCoverKnocks.has(knockTs)) {
      this.state.totalSmokeRescues++;
      this.underCoverKnocks.delete(knockTs);
      this.victimToKnockTs.delete(victimName);
    }
  }

  private handleKill(e: any, ts: number) {
    const victimName = normalizeName(e.victim?.name || "");
    const knockTs = this.victimToKnockTs.get(victimName);

    // 연막을 뿌렸음에도 결국 확킬이 나버린 경우 보호 상태 해제 (성공 카운트 제외)
    if (knockTs && this.underCoverKnocks.has(knockTs)) {
      this.underCoverKnocks.delete(knockTs);
      this.victimToKnockTs.delete(victimName);
    }
  }

  private handleThrowable(e: any, ts: number) {
    const attackerName = normalizeName(e.attacker?.name || e.character?.name || "");
    const isMe = this.isMe(e.attacker || e.character);
    const attackId = e.attackId;

    if (isMe && attackId && !this.processedThrowIds.has(attackId)) {
      this.processedThrowIds.add(attackId);
      const wId = (e.weaponId || e.weapon?.itemId || e.weapon?.name || "").toLowerCase();
      console.log(`[DEBUG-THROW] Item: ${wId}, AttackId: ${attackId}`);

      // 연막 세이브 판정 강화 (V14.2: 시간 + 거리 기반)
      if (wId.includes("smoke") || wId.includes("m79")) {
        const myLoc = this.state.playerLocations.get(this.state.myAccountId) || this.state.playerLocations.get(this.state.lowerNickname);
        const lastKnock = this.state.teammateKnockEvents.find(kts => {
          if (ts >= kts && ts - kts < 20000) { // 긴박한 상황 고려 20초로 확장
            // 팀원 위치 확인
            const knockedTeammate = Array.from(this.victimToKnockTs.entries())
              .find(([name, kTs]) => kTs === kts)?.[0];

            if (knockedTeammate && myLoc) {
              const tLoc = this.state.playerLocations.get(knockedTeammate);
              if (tLoc) {
                const dist = calcDist3D(myLoc, tLoc) / 100;
                return dist < 40; // [V38.3] 거리 판정 상향 (20m -> 40m) 
              }
            }
          }
          return false;
        });

        if (lastKnock && !this.underCoverKnocks.has(lastKnock)) {
          this.state.totalSmokeCount++;
          this.underCoverKnocks.add(lastKnock);
        }
      }

      this.state.myActionTimestamps.push(ts);
      this.state.utilityTracker.set(e.attackId, {
        type: wId, ts, damage: 0, hits: 0, kills: 0, isLanded: false
      });
      this.state.itemUseStats.throwCount++;

      if (wId.includes("smoke")) this.state.itemUseSummary.smokes++;
      else if (wId.includes("grenade")) {
        this.state.itemUseSummary.frags++;
        this.state.itemUseStats.lethalThrowCount++;
      }
      else if (wId.includes("molotov")) {
        this.state.itemUseSummary.molotovs++;
        this.state.itemUseStats.lethalThrowCount++;
      }
      else if (wId.includes("flashbang") || wId.includes("stun")) this.state.itemUseSummary.stuns++;
      else {
        this.state.itemUseSummary.others++;
      }
    }
  }

  private handleWeaponFire(e: any, ts: number) {
    const weaponId = (e.weaponId || "").toLowerCase();

    if (this.isMe(e.character) && weaponId.includes("m79")) {
      const fireId = e.attackId || `${ts}-${weaponId}`;
      if (this.processedThrowIds.has(fireId)) return;
      this.processedThrowIds.add(fireId);

      const myLoc = this.state.playerLocations.get(this.state.myAccountId) || this.state.playerLocations.get(this.state.lowerNickname);
      const lastKnock = this.state.teammateKnockEvents.find(kts => {
        if (ts >= kts && ts - kts < 20000) {
          const knockedTeammate = Array.from(this.victimToKnockTs.entries())
            .find(([name, kTs]) => kTs === kts)?.[0];

          if (knockedTeammate && myLoc) {
            const tLoc = this.state.playerLocations.get(knockedTeammate);
            if (tLoc) {
              const dist = calcDist3D(myLoc, tLoc) / 100;
              return dist < 40;
            }
          }
        }
        return false;
      });

      if (lastKnock && !this.underCoverKnocks.has(lastKnock)) {
        this.state.totalSmokeCount++;
        this.underCoverKnocks.add(lastKnock);
      }
      this.state.itemUseSummary.smokes = (this.state.itemUseSummary.smokes || 0) + 1;
    }
  }

  private handleProjectileHit(e: any) {
    if (this.isMe(e.attacker)) {
      const tracker = this.state.utilityTracker.get(e.attackId);
      if (tracker) {
        tracker.isLanded = true;
        // [V14.2] 섬광탄 지속 시간 누적 (데이터가 있는 경우)
        if (e.hitDuration && e.hitDuration > 0) {
          this.state.itemUseStats.stunDurationSum = (this.state.itemUseStats.stunDurationSum || 0) + e.hitDuration;
        }
      }
    }
  }

  private handleDown(e: any, ts: number) {
    const victimName = normalizeName(e.victim?.name || "");
    if (this.isTeammate(e.victim)) {
      this.victimToKnockTs.set(victimName, ts);
    }
  }
}
