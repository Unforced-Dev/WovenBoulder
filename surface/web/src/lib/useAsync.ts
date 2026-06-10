/**
 * Tiny async-state hook: loading / error / data with stale-result
 * protection (a superseded fetch never overwrites a newer one).
 */
import { useEffect, useRef, useState, type DependencyList } from "react";

export type AsyncState<T> =
  | { status: "loading"; data?: undefined; error?: undefined }
  | { status: "error"; error: Error; data?: undefined }
  | { status: "ready"; data: T; error?: undefined };

export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ status: "loading" });
  const epoch = useRef(0);

  useEffect(() => {
    const mine = ++epoch.current;
    setState({ status: "loading" });
    fn().then(
      (data) => {
        if (epoch.current === mine) setState({ status: "ready", data });
      },
      (error: unknown) => {
        if (epoch.current === mine) {
          setState({
            status: "error",
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
