// Label status selalu disertai ikon + teks (tidak hanya warna).
const STYLE: Record<string, { icon: string; label: string; cls: string }> = {
  critical: { icon: "⛔", label: "Kritis", cls: "bg-red-50 text-red-800 border-red-200" },
  warning: { icon: "⚠️", label: "Perlu perhatian", cls: "bg-amber-50 text-amber-900 border-amber-200" },
  info: { icon: "ℹ️", label: "Info", cls: "bg-sky-50 text-sky-900 border-sky-200" },
};

export function SeverityBadge({ severity }: { severity: string }) {
  const s = STYLE[severity] ?? STYLE.info;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${s.cls}`}>
      <span aria-hidden>{s.icon}</span>{s.label}
    </span>
  );
}
