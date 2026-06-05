"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

type CopyShaButtonProps = {
  sha: string;
};

export function CopyShaButton({ sha }: CopyShaButtonProps) {
  const [copied, setCopied] = useState(false);

  async function copySha() {
    await navigator.clipboard.writeText(sha);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <button
      aria-label="Copy full SHA"
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#d0d7de] bg-white text-[#59636e] hover:border-[#0969da] hover:text-[#0969da]"
      title={copied ? "Copied" : "Copy full SHA"}
      type="button"
      onClick={copySha}
    >
      {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
    </button>
  );
}
