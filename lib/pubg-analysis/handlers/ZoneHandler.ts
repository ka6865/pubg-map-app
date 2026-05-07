import { BaseHandler } from './BaseHandler';
import { normalizeName } from '../utils';

export class ZoneHandler extends BaseHandler {
  handleEvent(e: any, ts: number, elapsed: number): void {
    switch (e._T) {
      case "LogGameStatePeriodic":
        this.handleGameState(e);
        break;
      case "LogPlayerTakeDamage":
        this.handleBluezoneDamage(e);
        break;
      case "LogPlayerPosition":
        this.handleEdgePlay(e, ts, elapsed);
        break;
    }
  }

  private handleGameState(e: any) {
    const gs = e.gameState;
    if (gs.safetyZonePosition) {
      this.state.whiteZone = { 
        x: gs.safetyZonePosition.x, 
        y: gs.safetyZonePosition.y, 
        radius: gs.safetyZoneRadius 
      };
    }
    if (gs.poisonGasWarningPosition) {
      this.state.blueZone = {
        x: gs.poisonGasWarningPosition.x,
        y: gs.poisonGasWarningPosition.y,
        radius: gs.poisonGasWarningRadius
      };
    }
    
    if (gs.isZoneMoving !== undefined) {
      this.state.isZoneMoving = gs.isZoneMoving;
    } else if (this.state.blueZone.radius > 0 && this.state.whiteZone.radius > 0) {
      this.state.isZoneMoving = this.state.blueZone.radius > (this.state.whiteZone.radius * 1.01);
    }
  }

  private handleBluezoneDamage(e: any) {
    const victimName = normalizeName(e.victim?.name || "");
    const dmgCat = (e.damageTypeCategory || "").toLowerCase();
    const damage = e.damage || 0;

    if (victimName === this.state.lowerNickname && dmgCat.includes("bluezone")) {
      this.state.bluezoneWaste = (this.state.bluezoneWaste || 0) + damage;
    }
  }

  private handleEdgePlay(e: any, ts: number, elapsed: number) {
    const pName = normalizeName(e.character?.name || "");
    if (pName !== this.state.lowerNickname) return;
    
    const charLoc = e.character.loc || e.character.location;
    if (!charLoc) return;

    const isLanded = this.state.hasLanded;
    const isAfterStart = elapsed > 120 * 1000;

    if ((isLanded || isAfterStart) && 
        this.state.playerAliveStatus.get(this.state.lowerNickname) !== false &&
        this.state.blueZone.radius > 0 &&
        ts - (this.state.lastEdgeSampleTime || 0) >= 5000) {
      
      this.state.lastEdgeSampleTime = ts;
      const distToCenter = Math.sqrt(
        Math.pow(charLoc.x - this.state.blueZone.x, 2) + 
        Math.pow(charLoc.y - this.state.blueZone.y, 2)
      );
      const distToEdge = Math.abs(distToCenter - this.state.blueZone.radius) / 100;
      if (distToEdge < 50) {
        this.state.zoneStrategy.edgePlayCount++;
      }
    }
  }
}
