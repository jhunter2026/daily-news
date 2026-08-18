'use client';

import { useState } from 'react';

export default function CopyCaptionButton({ caption }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(caption);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) -- the caption box
      // above is still manually selectable/copyable as a fallback.
    }
  }

  return (
    <button type="button" onClick={handleCopy} className="copy-caption-btn">
      {copied ? 'Copied!' : 'Copy caption'}
    </button>
  );
}
