"use client";

import { useFormStatus } from "react-dom";

export function ResearchButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn" disabled={pending}>
      {pending ? "Sedang meriset… (±1–2 menit)" : "Mulai riset"}
    </button>
  );
}
