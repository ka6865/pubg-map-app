import { InternalAnalysisState } from '../types';

export abstract class BaseHandler {
  constructor(protected state: InternalAnalysisState) {}

  /**
   * 이벤트를 처리합니다. 
   * 핸들러가 처리할 수 없는 이벤트인 경우 무시합니다.
   */
  abstract handleEvent(e: any, ts: number, elapsed: number): void;
}
