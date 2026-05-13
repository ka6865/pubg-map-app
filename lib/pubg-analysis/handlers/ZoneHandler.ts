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
        x: gs.safetyZonePosition.x / 100,
        y: gs.safetyZonePosition.y / 100,
        radius: gs.safetyZoneRadius / 100
      };
    }
    if (gs.poisonGasWarningPosition) {
      this.state.blueZone = {
        x: gs.poisonGasWarningPosition.x / 100,
        y: gs.poisonGasWarningPosition.y / 100,
        radius: gs.poisonGasWarningRadius / 100
      };
    }

    if (gs.isZoneMoving !== undefined) {
      this.state.isZoneMoving = gs.isZoneMoving;
    } else if (this.state.blueZone.radius > 0 && this.state.whiteZone.radius > 0) {
      this.state.isZoneMoving = this.state.blueZone.radius > (this.state.whiteZone.radius * 1.01);
    }
  }

  private handleBluezoneDamage(e: any) {
    const dmgCat = (e.damageTypeCategory || "").toLowerCase();
    const damage = e.damage || 0;

    if (this.isMe(e.victim) && dmgCat.includes("bluezone")) {
      this.state.bluezoneWaste = (this.state.bluezoneWaste || 0) + damage;
    }
  }

  private handleEdgePlay(e: any, ts: number, elapsed: number) {
    if (!this.isMe(e.character)) return;

    const charLoc = e.character.loc || e.character.location;
    if (!charLoc) return;

    const isLanded = this.state.hasLanded;
    const isAfterStart = elapsed > 120 * 1000;

    if ((isLanded || isAfterStart) &&
      (this.state.playerAliveStatus.get(this.state.lowerNickname) !== false || this.state.playerAliveStatus.get(this.state.myAccountId) !== false) &&
      this.state.blueZone.radius > 0 &&
      ts - (this.state.lastEdgeSampleTime || 0) >= 5000) {

      this.state.lastEdgeSampleTime = ts;
      const charX = charLoc.x / 100;
      const charY = charLoc.y / 100;
      const distToCenter = Math.sqrt(
        Math.pow(charX - this.state.blueZone.x, 2) +
        Math.pow(charY - this.state.blueZone.y, 2)
      );
      const distToEdge = Math.abs(distToCenter - this.state.blueZone.radius);
      if (distToEdge < 50) {
        this.state.zoneStrategy.edgePlayCount++;
      } else if (distToEdge < 150) {
        this.state.zoneStrategy.fatalDelayCount++;
      }
    }
  }
}
