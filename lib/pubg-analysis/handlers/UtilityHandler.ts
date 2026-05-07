import { BaseHandler } from './BaseHandler';
import { normalizeName } from '../utils';

export class UtilityHandler extends BaseHandler {
  private processedThrowIds = new Set<string>();

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
        this.handleHeal(e);
        break;
      case "LogPlayerUseThrowable":
        this.handleUseThrowable(e);
        break;
      case "LogHeal":
        this.handleHeal(e);
        break;
      case "LogThrowableUse":
        this.handleThrowable(e, ts);
        break;
      case "LogProjectileHit":
        this.handleProjectileHit(e);
        break;
    }
  }

  private handleUseThrowable(e: any) {
    const attackerName = normalizeName(e.attacker?.name || "");
    const attackId = e.attackId || `legacy-${e.weaponId}-${Date.now()}`;
    
    if (attackerName === this.state.lowerNickname && !this.processedThrowIds.has(attackId)) {
      this.processedThrowIds.add(attackId);
      this.state.itemUseStats.throwCount++;
      const itemId = (e.weaponId || "").toLowerCase();
      if (itemId.includes("smoke")) {
        this.state.totalSmokeCount++;
        this.state.itemUseSummary.smokes = (this.state.itemUseSummary.smokes || 0) + 1;
      } else if (itemId.includes("grenade") || itemId.includes("molotov") || itemId.includes("c4")) {
        this.state.itemUseSummary.frags = (this.state.itemUseSummary.frags || 0) + 1;
        this.state.itemUseStats.lethalThrowCount++;
      }
    }
  }

  private handleStunHit(e: any) {
    const attackerName = normalizeName(e.attacker?.name || "");
    const weapon = (e.damageCauserName || e.damageCauser?.itemId || e.weaponId || "").toLowerCase();

    if (attackerName === this.state.lowerNickname) {
      if (weapon.includes("flashbang") || weapon.includes("stun")) {
        this.state.combatPressure.stunHits = (this.state.combatPressure.stunHits || 0) + 1;
      }
    }
  }

  private handleUtilityDamage(e: any) {
    const attackerName = normalizeName(e.attacker?.name || "");
    const dmgCat = (e.damageTypeCategory || "").toLowerCase();
    const weapon = (e.damageCauserName || e.damageCauser?.itemId || e.weaponId || "").toLowerCase();
    const damage = e.damage || 0;

    if (attackerName === this.state.lowerNickname) {
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
    const characterName = normalizeName(e.character?.name || "");
    if (characterName === this.state.lowerNickname) {
      const itemId = (e.item?.itemId || "").toLowerCase();
      
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

  private handleHeal(e: any) {
    const characterName = normalizeName(e.character?.name || "");
    if (characterName === this.state.lowerNickname) {
      const itemId = (e.item?.itemId || "").toLowerCase();
      if (itemId.includes("firstaid") || itemId.includes("medkit") || itemId.includes("bandage")) {
        this.state.itemUseStats.heals++;
      } else if (itemId.includes("energydrink") || itemId.includes("painkiller") || itemId.includes("adrenaline")) {
        this.state.itemUseStats.boosts++;
      }
    }
  }

  private handleThrowable(e: any, ts: number) {
    const attackerName = normalizeName(e.attacker?.name || "");
    const attackId = e.attackId;

    if (attackerName === this.state.lowerNickname && attackId && !this.processedThrowIds.has(attackId)) {
      this.processedThrowIds.add(attackId);
      const wId = (e.weaponId || "").toLowerCase();
      
      // 연막 세이브 판정
      if (wId.includes("smoke")) {
        const lastKnock = this.state.teammateKnockEvents.find(kts => ts >= kts && ts - kts < 15000);
        if (lastKnock) {
          this.state.totalSmokeCount++;
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
        // C4나 점착폭탄 등은 others로 분류될 수 있으므로 여기서도 살상용으로 판단될 경우 추가 (현재는 주요 2종 우선)
      }
    }
  }

  private handleProjectileHit(e: any) {
    const attackerName = normalizeName(e.attacker?.name || "");
    if (attackerName === this.state.lowerNickname) {
      const tracker = this.state.utilityTracker.get(e.attackId);
      if (tracker) tracker.isLanded = true;
    }
  }
}
