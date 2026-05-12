import { AnalysisState } from '../types';
import { normalizeName } from '../utils';

export abstract class BaseHandler {
  constructor(protected state: AnalysisState) { }

  /**
   * 이벤트를 처리합니다. 
   * 핸들러가 처리할 수 없는 이벤트인 경우 무시합니다.
   */
  abstract handleEvent(e: any, ts: number, elapsed: number): void;

  protected isMe(char: any): boolean {
    if (!char) return false;
    if (char.accountId && char.accountId === this.state.myAccountId) return true;
    const name = typeof char === 'string' ? char : (char.name || "");
    if (name && normalizeName(name) === this.state.lowerNickname) return true;
    return false;
  }

  protected isTeammate(char: any): boolean {
    if (!char) return false;
    if (char.accountId && this.state.teamAccountIds.has(char.accountId)) return true;
    const name = typeof char === 'string' ? char : (char.name || "");
    if (name && this.state.teamNames.has(normalizeName(name))) return true;
    return false;
  }

  protected isElite(char: any): boolean {
    if (!char) return false;
    if (char.accountId && this.state.eliteAccountIds.has(char.accountId)) return true;
    const name = typeof char === 'string' ? char : (char.name || "");
    if (name && this.state.eliteNames.has(normalizeName(name))) return true;
    return false;
  }
}
