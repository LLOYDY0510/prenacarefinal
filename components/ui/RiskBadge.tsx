type RiskLevel = string | null | undefined;

/**
 * A mother with no recorded assessment must never be shown to staff as
 * "Low Risk" - that is a clinical misreport. Anything that is not an explicit
 * 'high' or 'low' is rendered as unassessed.
 */
export default function RiskBadge({
  riskLevel,
  className = '',
}: {
  riskLevel: RiskLevel;
  className?: string;
}) {
  if (riskLevel === 'high') {
    return (
      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200 ${className}`}>
        High Risk
      </span>
    );
  }
  if (riskLevel === 'medium') {
    return (
      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200 ${className}`}>
        Medium Risk
      </span>
    );
  }
  if (riskLevel === 'low') {
    return (
      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200 ${className}`}>
        Low Risk
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-neutral-100 text-neutral-600 border border-neutral-200 ${className}`}
      title="No risk assessment on record for this mother"
    >
      Unassessed
    </span>
  );
}
