import { useEffect } from "react";
import { getBodyScrollLockStyles } from "@/lib/ui/scroll-lock";

let lockCount = 0;
let scrollY = 0;
let originalStyles: Pick<CSSStyleDeclaration, "position" | "top" | "width" | "overflow" | "paddingRight"> | null = null;

export function useLockBodyScroll(locked: boolean) {
  useEffect(() => {
    if (!locked) return;

    const body = document.body;

    if (lockCount === 0) {
      scrollY = window.scrollY;
      originalStyles = {
        position: body.style.position,
        top: body.style.top,
        width: body.style.width,
        overflow: body.style.overflow,
        paddingRight: body.style.paddingRight,
      };

      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      Object.assign(body.style, getBodyScrollLockStyles(scrollY, scrollbarWidth));
    }

    lockCount += 1;

    return () => {
      lockCount = Math.max(0, lockCount - 1);

      if (lockCount !== 0 || !originalStyles) return;

      Object.assign(body.style, originalStyles);
      originalStyles = null;
      window.scrollTo(0, scrollY);
    };
  }, [locked]);
}
