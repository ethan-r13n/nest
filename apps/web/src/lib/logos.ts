import names from './logo-map.json' with { type: 'json' };

const LOGO_NAMES: Readonly<Record<string, string>> = names;

export function logoAssetPath(name: string): string | undefined {
  const key = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return LOGO_NAMES[key];
}
