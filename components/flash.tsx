export function Flash({ error, message }: { error?: string; message?: string }) {
  return (
    <>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {message && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
    </>
  );
}
