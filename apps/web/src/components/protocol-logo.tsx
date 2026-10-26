import { safeResearchUrl } from '@nest/data/research';
import { useState } from 'react';

import { logoAssetPath } from '../lib/logos.ts';

const LOGOS = import.meta.glob<string>('../../../../design/nest/ui/assets/logos/*', {
  eager: true,
  import: 'default',
  query: '?url',
});
export function ProtocolLogo({
  name,
  fallback,
  className = 'size-8',
}: {
  name: string;
  fallback?: string | undefined;
  className?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const path = logoAssetPath(name);
  const src = (path ? LOGOS[`../../../../design/nest/ui/${path}`] : undefined) ?? safeResearchUrl(fallback ?? '');
  const visible = Boolean(src && src !== failedSrc);
  return (
    <span
      aria-hidden="true"
      data-logo-name={name}
      data-logo-state={visible ? 'available' : 'missing'}
      title={visible ? undefined : 'No captured logo available'}
      className={`relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full align-middle ${visible ? 'border border-border bg-foreground' : ''} ${className}`}
    >
      {src && visible ? (
        <img
          src={src}
          alt=""
          className={`absolute inset-0 size-full object-contain ${path?.endsWith('.svg') ? 'p-[3px]' : ''}`}
          loading="lazy"
          onError={() => setFailedSrc(src)}
        />
      ) : null}
    </span>
  );
}
