"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

export function useQueryState<T extends string>(
  key: string,
  defaultValue: T,
  allowedValues?: readonly T[],
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValueState] = useState<T>(defaultValue);
  const valueRef = useRef(value);
  const allowedKey = allowedValues?.join("\u0000") ?? "";

  useEffect(() => {
    const allowed = allowedKey ? allowedKey.split("\u0000") : undefined;
    const readLocation = () => {
      const candidate = new URL(window.location.href).searchParams.get(key);
      const nextValue = candidate && (!allowed || allowed.includes(candidate)) ? candidate as T : defaultValue;
      valueRef.current = nextValue;
      setValueState(nextValue);
    };

    readLocation();
    window.addEventListener("popstate", readLocation);
    return () => window.removeEventListener("popstate", readLocation);
  }, [allowedKey, defaultValue, key]);

  const setValue = useCallback<Dispatch<SetStateAction<T>>>((nextValue) => {
    const resolved = typeof nextValue === "function"
      ? (nextValue as (current: T) => T)(valueRef.current)
      : nextValue;
    valueRef.current = resolved;
    setValueState(resolved);

    const url = new URL(window.location.href);
    if (resolved === defaultValue || resolved === "") url.searchParams.delete(key);
    else url.searchParams.set(key, resolved);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [defaultValue, key]);

  return [value, setValue];
}
