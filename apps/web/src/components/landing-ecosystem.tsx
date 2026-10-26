import { BookOpen, CircleDot, Command, Diamond, type LucideIcon, Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import allbridgeUrl from '../../../../design/nest/ui/assets/logos/allbridge-d997cc79.webp';
import alulaUrl from '../../../../design/nest/ui/assets/logos/alula-018c962b.webp';
import aquariusUrl from '../../../../design/nest/ui/assets/logos/aquariusstellar-d0a259b7.webp';
import balancedUrl from '../../../../design/nest/ui/assets/logos/balancedexchange-b12b7ba2.webp';
import blendUrl from '../../../../design/nest/ui/assets/logos/blend-518fb354.webp';
import defaUrl from '../../../../design/nest/ui/assets/logos/defabyinvoicemate-5782941b.webp';
import defindexUrl from '../../../../design/nest/ui/assets/logos/defindex-41cb66cb.webp';
import excellarUrl from '../../../../design/nest/ui/assets/logos/excellar-59457d45.webp';
import fxdaoUrl from '../../../../design/nest/ui/assets/logos/fxdao-e6fff250.webp';
import gamiUrl from '../../../../design/nest/ui/assets/logos/gamilabs-969b517a.webp';
import humaUrl from '../../../../design/nest/ui/assets/logos/huma-2b54ae6d.webp';
import k2Url from '../../../../design/nest/ui/assets/logos/k2lend-3eaceaba.webp';
import normalUrl from '../../../../design/nest/ui/assets/logos/normal-ec797293.webp';
import peridotUrl from '../../../../design/nest/ui/assets/logos/peridot-dd15dd35.webp';
import phoenixUrl from '../../../../design/nest/ui/assets/logos/phoenixdefihub-643b0235.webp';
import scopulyUrl from '../../../../design/nest/ui/assets/logos/scopuly-f2915c7c.webp';
import sentoraUrl from '../../../../design/nest/ui/assets/logos/sentorausdc-47c38b7a.avif';
import slenderUrl from '../../../../design/nest/ui/assets/logos/slender-399f724b.webp';
import soroswapUrl from '../../../../design/nest/ui/assets/logos/soroswapamm-2c485478.webp';
import spectraUrl from '../../../../design/nest/ui/assets/logos/spectrav2-e9186ba9.webp';
import sushiUrl from '../../../../design/nest/ui/assets/logos/sushistellar-2482d964.webp';
import templarUrl from '../../../../design/nest/ui/assets/logos/templarprotocol-51846bbf.webp';
import untangledUrl from '../../../../design/nest/ui/assets/logos/untangledrwa-86a95382.webp';
import upshiftUrl from '../../../../design/nest/ui/assets/logos/upshift-caae056f.webp';
import vaquitaUrl from '../../../../design/nest/ui/assets/logos/vaquitaprotocol-8012a913.webp';
import xoxnoUrl from '../../../../design/nest/ui/assets/logos/xoxnolending-038ce9bf.webp';

import './landing-ecosystem.css';

const LOGO_ROWS: ReadonlyArray<ReadonlyArray<EcosystemItem>> = [
  [
    { name: 'Soroswap', logo: soroswapUrl },
    { name: 'Aquarius', logo: aquariusUrl },
    { name: 'Sushi', logo: sushiUrl },
    { name: 'Scopuly', logo: scopulyUrl },
    { name: 'Phoenix', logo: phoenixUrl },
    { name: 'Balanced', logo: balancedUrl },
  ],
  [
    { name: 'K2 Lend', logo: k2Url },
    { name: 'Blend', logo: blendUrl },
    { name: 'Templar', logo: templarUrl },
    { name: 'XOXNO', logo: xoxnoUrl },
    { name: 'Peridot Finance', logo: peridotUrl },
    { name: 'Slender', logo: slenderUrl },
  ],
  [
    { name: 'Alula', logo: alulaUrl },
    { name: 'DeFindex', logo: defindexUrl },
    { name: 'Upshift', logo: upshiftUrl },
    { name: 'Gami Labs', logo: gamiUrl },
    { name: 'Sentora', logo: sentoraUrl },
    { name: 'Spectra Finance', logo: spectraUrl },
  ],
  [
    { name: 'Excellar', logo: excellarUrl },
    { name: 'Vaquita', logo: vaquitaUrl },
    { name: 'DeFa by InvoiceMate', logo: defaUrl },
    { name: 'Huma', logo: humaUrl },
    { name: 'Untangled', logo: untangledUrl },
    { name: 'FxDAO', logo: fxdaoUrl },
  ],
  [
    { name: 'Normal', logo: normalUrl },
    { name: 'Allbridge', logo: allbridgeUrl },
    { name: 'Lumenloop', icon: CircleDot },
    { name: 'Scout', icon: Command },
    { name: 'Stellar Docs', icon: BookOpen },
    { name: 'Skills', icon: Diamond },
  ],
];

type EcosystemItem = { name: string; logo: string } | { name: string; icon: LucideIcon };

export function LandingEcosystem({ headingClassName }: { headingClassName: string }) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry?.isIntersecting ?? false), {
      threshold: 0.1,
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <aside
      ref={ref}
      aria-labelledby="nest-ecosystem"
      className="nest-ecosystem min-w-0 lg:sticky lg:top-12"
      data-visible={visible}
      data-paused={paused}
    >
      <h2 id="nest-ecosystem" className={`${headingClassName} text-right`}>
        Across Stellar.
      </h2>
      <div className="nest-ecosystem-rows">
        {LOGO_ROWS.map((row) => (
          <div className="nest-ecosystem-row" key={row[0]?.name}>
            <div className="nest-ecosystem-track">
              {[false, true].map((duplicate) => (
                <ul className="nest-ecosystem-group" key={String(duplicate)} aria-hidden={duplicate || undefined}>
                  {row.map((item) => (
                    <li className="nest-ecosystem-logo" key={item.name}>
                      {'logo' in item ? (
                        <img src={item.logo} width={36} height={36} alt="" loading="lazy" decoding="async" />
                      ) : (
                        <item.icon size={28} strokeWidth={1.5} aria-hidden="true" className="nest-ecosystem-tool" />
                      )}
                      <span>{item.name}</span>
                    </li>
                  ))}
                </ul>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          aria-label={paused ? 'Play logo motion' : 'Pause logo motion'}
          aria-pressed={paused}
          onClick={() => setPaused(!paused)}
          className="nest-ecosystem-control flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full border border-[#f1ece2]/15 bg-transparent text-[#8f9b88] hover:border-[#ff7a45]/50 hover:text-[#ff7a45] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ff7a45]"
        >
          {paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
        </button>
      </div>
    </aside>
  );
}
