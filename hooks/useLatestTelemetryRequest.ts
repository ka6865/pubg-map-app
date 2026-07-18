import { useCallback, useEffect, useRef } from "react";

export type TelemetryRequestToken = Readonly<{
  controller: AbortController;
  identity: string;
  sequence: number;
}>;

export function useLatestTelemetryRequest() {
  const currentRef = useRef<TelemetryRequestToken | null>(null);
  const sequenceRef = useRef(0);

  const begin = useCallback((identity: string): TelemetryRequestToken => {
    currentRef.current?.controller.abort();
    const request = {
      controller: new AbortController(),
      identity,
      sequence: sequenceRef.current + 1,
    };
    sequenceRef.current = request.sequence;
    currentRef.current = request;
    return request;
  }, []);

  const isCurrent = useCallback((request: TelemetryRequestToken): boolean => (
    currentRef.current === request && !request.controller.signal.aborted
  ), []);

  const complete = useCallback((request: TelemetryRequestToken): void => {
    if (currentRef.current === request) currentRef.current = null;
  }, []);

  const cancel = useCallback((request?: TelemetryRequestToken): void => {
    const current = currentRef.current;
    if (!current || (request && current !== request)) return;
    current.controller.abort();
    currentRef.current = null;
  }, []);

  useEffect(() => () => cancel(), [cancel]);

  return { begin, cancel, complete, isCurrent };
}
