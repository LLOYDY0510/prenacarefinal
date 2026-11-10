/**
 * A single label/value pair used by every read-only detail view.
 *
 * Extracted from the page files that had each grown their own private copy
 * (my-info, my-records, the pregnant-mother detail page).
 */
export default function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div>
      <p className="text-neutral-400 text-xs font-medium mb-0.5">{label}</p>
      <p className="text-neutral-800 font-medium">{value ?? '—'}</p>
    </div>
  );
}
