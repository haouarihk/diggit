"use client";

import { ReactNode, useEffect, useRef } from "react";

type DrawerProps = {
  children: ReactNode;
  isOpen: boolean;
  onClose: () => void;
  subtitle?: string;
  title: string;
};

export function Drawer({ children, isOpen, onClose, subtitle, title }: DrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCloseRef.current();
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div aria-labelledby="drawer-title" aria-modal="true" className="fixed inset-0 z-50 overflow-y-auto bg-white text-[#1f2328]" role="dialog">
      <div className="mx-auto grid min-h-dvh w-full max-w-4xl content-start gap-6 px-6 py-6 sm:px-10">
        <div className="flex items-start justify-between gap-4 border-b border-[#d8dee4] pb-4">
          <div>
            {subtitle ? <p className="mb-1 text-[#59636e]">{subtitle}</p> : null}
            <h2 className="text-3xl font-semibold tracking-tight" id="drawer-title">
              {title}
            </h2>
          </div>
          <button ref={closeButtonRef} className="rounded-md border border-[#d0d7de] bg-white px-3 py-1.5 font-semibold" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
