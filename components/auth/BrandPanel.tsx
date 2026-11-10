import Logo from '@/components/ui/Logo';

/* The branding half of an auth screen: both logos, the app name and tagline, plus a large media area on desktop. */
export default function BrandPanel({
  title = 'Prenatrack',
  tagline = 'Maternal health tracking for barangay health workers and midwives.',
}: {
  title?: string;
  tagline?: string;
}) {
  return (
    <div className="h-full flex flex-col gap-8 p-8 lg:p-10 anim-stagger">
      <div className="flex items-center gap-3">
        <Logo variant="prenatrack" size={44} priority />
        <Logo variant="barangay" size={44} rounded priority />
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-ink">{title}</h1>
        <p className="text-sm text-muted">{tagline}</p>
      </div>
    </div>
  );
}
