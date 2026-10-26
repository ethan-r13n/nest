import { safeResearchUrl } from '@nest/data/research';
import { Building2 } from 'lucide-react';

const LOGOS = import.meta.glob<string>('../../../../design/nest/ui/assets/logos/*', {
  eager: true,
  import: 'default',
  query: '?url',
});

export function ProtocolLogo({ name, fallback }: { name: string; fallback?: string | undefined }) {
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const local = Object.entries(LOGOS).find(([path]) => path.split('/').at(-1)?.startsWith(`${key}-`));
  const src = local?.[1] ?? safeResearchUrl(fallback ?? '');
  return (
    <span className="relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-full border bg-secondary">
      <Building2 className="size-4 text-subtle" aria-hidden="true" />
      {src ? (
        <img
          src={src}
          alt=""
          className="absolute inset-0 size-full object-contain"
          loading="lazy"
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
        />
      ) : null}
    </span>
  );
}
