import { useCallback, useEffect, useRef } from "react";

export type TelemetryRequestToken = Readonly<{
  controller: AbortController;
}>;

export function useLatestTelemetryRequest() {
  const currentRef = useRef<TelemetryRequestToken | null>(null);

  const begin = useCallback((): TelemetryRequestToken => {
    currentRef.current?.controller.abort();
    const request = {
      controller: new AbortController(),
    };
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
