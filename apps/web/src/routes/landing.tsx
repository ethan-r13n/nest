import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource/geist/300.css';
import '@fontsource/geist/400.css';
import '@fontsource/geist/500.css';
import '@fontsource/geist-mono/400.css';

import { Link, useNavigate } from '@tanstack/react-router';
import { type FormEvent, useEffect, useId, useState } from 'react';

import lockupUrl from '../../../../design/nest/assets/nest-lockup.svg';
import { Murmuration } from '../components/murmuration.tsx';
import { formatPercentPoints, formatUsd } from '../lib/format.ts';
import { research } from '../lib/research.ts';

const SERIF = "font-['Instrument_Serif',serif] font-normal";
const MONO = "font-['Geist_Mono',monospace] font-normal";
const RULE = 'border-[rgba(241,236,226,.16)]';
const GUTTER = 'px-[clamp(20px,4vw,56px)]';
const PILL = 'rounded-full px-5 text-sm leading-none';
const SOLID_PILL = `${PILL} bg-[#ff5b1f] py-3.5 font-medium text-[#08090a] hover:bg-[#ff7a45] hover:text-[#08090a]`;
const SUGGESTED_QUESTION = 'Compare USDC yield on Stellar at $10,000 over 90 days…';

const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const CLOCK = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });

/** Examples for "Compare", read from the snapshot so the figures stay dated and real. */
const COMPARE_EXAMPLES = [
  { project: 'gami-labs', symbol: 'EARNUSDC', label: 'EARNUSDC · Gami', note: 'exit unverified', caution: true },
  { project: 'blend-pools-v2', symbol: 'USDC', meta: 'Fixed Pool', label: 'USDC · Blend Fixed' },
  { project: 'ondo-yield-assets', symbol: 'USDY', label: 'USDY · Ondo' },
] as const;

const SAFETY = [
  ['Restricted runtime', 'The agent can research and draft. It cannot sign or move funds.'],
  ['Application-owned execution', 'Every write passes a policy engine before it reaches your wallet.'],
  ['Suggestions stay suggestions', 'Guardrails the agent proposes apply only after you accept them.'],
  ['Mainnet first, Testnet isolated', 'Validation runs on a separate path and database.'],
] as const;

const capturedAt = new Date(research.sources.defillama.capturedAt);
const tvl = formatUsd(research.chain.defiTvlUsd);
const venues = research.protocols.length;
const topLending = research.protocols
  .filter((protocol) => protocol.category === 'Lending' && protocol.stellarTvlUsd !== null)
  .sort((left, right) => (right.stellarTvlUsd ?? 0) - (left.stellarTvlUsd ?? 0))[0];
const compareRows = COMPARE_EXAMPLES.flatMap((example) => {
  const pool = research.yieldPools.find(
    (candidate) =>
      candidate.project === example.project &&
      candidate.symbol === example.symbol &&
      (!('meta' in example) || candidate.meta === example.meta),
  );
  if (!pool || pool.totalApyPct === null) return [];
  const note = 'note' in example ? example.note : pool.rewardApyPct ? 'incl. incentives' : 'base only';
  return [{ label: example.label, apy: `${pool.totalApyPct.toFixed(2)}%`, note, caution: 'caution' in example }];
});

/** The public front door: what Nest is, how it works and why it never holds keys. */
export function LandingPage() {
  // The page loads lazily, after the browser has looked for a `#how` or `#safety` target.
  useEffect(() => {
    if (window.location.hash) document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
  }, []);

  return (
    <div className="relative min-h-screen bg-[#050c07] font-['Geist',sans-serif] text-[#f1ece2] antialiased selection:bg-[#ff5b1f] selection:text-[#08090a] [&_a]:transition-colors">
      <Murmuration />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 bg-[linear-gradient(90deg,rgba(4,10,6,.82)_0%,rgba(4,10,6,.12)_55%,rgba(4,10,6,0)_100%)]"
      />
      <div className="relative z-[1]">
        <Header />
        <main>
          <Hero />
          <section className={`${GUTTER} py-[22vh]`} aria-label="Why Nest">
            <p
              className={`${SERIF} m-0 max-w-[1180px] text-[clamp(34px,4.6vw,70px)] leading-[1.08] tracking-[-.01em] text-pretty`}
            >
              Stellar DeFi holds <span className="text-[#ff7a45]">{tvl}</span> across{' '}
              <span className="text-[#ff7a45]">{venues} venues</span>.{' '}
              <span className="text-[#8f897e]">Rates, incentives and exit terms are scattered across all of them.</span>{' '}
              Nest reads them together, dates every figure, <em>and tells you what it doesn&rsquo;t know.</em>
            </p>
          </section>
          <HowItWorks />
          <Safety />
          <AskNest />
        </main>
      </div>
    </div>
  );
}

function Header() {
  return (
    <header className={`flex flex-wrap items-center justify-between gap-5 py-7 ${GUTTER}`}>
      <Link to="/" aria-label="Nest home" className="flex items-center">
        <img src={lockupUrl} alt="Nest" className="h-9 w-auto" />
      </Link>
      <nav aria-label="Landing" className="flex flex-wrap gap-8 text-sm text-[#b9b3a8]">
        <a href="#how" className="hover:text-[#ff5b1f]">
          How it works
        </a>
        <a href="#safety" className="hover:text-[#ff5b1f]">
          Safety
        </a>
        <Link to="/research" className="hover:text-[#ff5b1f]">
          Research
        </Link>
      </nav>
      <Link
        to="/research"
        className={`${PILL} bg-[#f1ece2] py-[13px] font-medium text-[#08090a] hover:bg-white hover:text-[#08090a]`}
      >
        Launch App →
      </Link>
    </header>
  );
}

function Hero() {
  const stats = [
    { label: 'Stellar DeFi TVL', value: tvl },
    { label: 'USD stablecoins', value: formatUsd(research.chain.stablecoinUsdByPeg.peggedUSD ?? null) },
    { label: 'Venues tracked', value: String(venues) },
  ];
  return (
    <section className={`flex min-h-[calc(100vh-92px)] flex-col justify-end pb-9 ${GUTTER}`}>
      <div className="flex flex-wrap items-end justify-between gap-10">
        <h1 className={`${SERIF} m-0 max-w-[1100px] text-[clamp(64px,10.5vw,176px)] leading-[.88] tracking-[-.025em]`}>
          Every move on Stellar, <em className="text-[#ff7a45]">researched first.</em>
        </h1>
        <div className="max-w-[340px] pb-3.5">
          <p className="m-0 text-[17px] leading-[1.55] font-light text-pretty text-[#cfc9bd]">
            Nest is an agent that finds, compares and drafts DeFi moves across Stellar. It never signs for you.
          </p>
          <div className="mt-6 flex flex-wrap gap-2.5">
            <Link to="/research" className={SOLID_PILL}>
              Open the workspace
            </Link>
            <a href="#how" className={`${PILL} border border-[rgba(241,236,226,.3)] py-[13px] hover:text-[#ff5b1f]`}>
              See how it works
            </a>
          </div>
        </div>
      </div>
      <dl className={`mt-14 grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-5 border-t pt-5 ${RULE}`}>
        {stats.map((stat) => (
          <div key={stat.label}>
            <dt className={`${MONO} text-[11px] leading-none tracking-[.04em] text-[#8f897e]`}>{stat.label}</dt>
            <dd className={`${SERIF} m-0 mt-2.5 text-[30px] leading-none`}>{stat.value}</dd>
          </div>
        ))}
        <div>
          <dt className={`${MONO} text-[11px] leading-none tracking-[.04em] text-[#8f897e]`}>Snapshot</dt>
          <dd className={`${SERIF} m-0 mt-2.5 text-[30px] leading-none`}>
            <time dateTime={capturedAt.toISOString()}>
              {DAY.format(capturedAt)}, {CLOCK.format(capturedAt)} <span className="text-lg text-[#8f897e]">UTC</span>
            </time>
          </dd>
        </div>
      </dl>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how" className={`bg-[rgba(4,10,6,.86)] py-[120px] backdrop-blur-[2px] ${GUTTER}`}>
      <div className="mb-14 flex flex-wrap items-baseline justify-between gap-5">
        <h2 className={`${SERIF} m-0 text-[clamp(44px,6vw,96px)] leading-[.95]`}>How Nest works</h2>
        <span className={`${MONO} text-xs text-[#8f897e]`}>Research → Compare → Act</span>
      </div>
      <Step
        numeral="i."
        title="Research"
        body="Ask in plain language. Answers come from dated snapshots, with the source on every number."
      >
        <div className={`${MONO} text-[13px] leading-[1.6] text-[#cfc9bd]`}>
          <div className="text-[#8f897e]">you › which lending venue holds the most TVL?</div>
          {topLending ? (
            <>
              <div className={`${SERIF} mt-3 text-[26px] leading-[1.2] text-[#f1ece2]`}>
                {topLending.name} · {formatUsd(topLending.stellarTvlUsd)}
              </div>
              <div className="mt-2 text-[#8f897e]">
                DefiLlama · {DATE.format(new Date(topLending.observedAt))}
                {topLending.change.day === null
                  ? ''
                  : ` · ${formatPercentPoints(topLending.change.day).replace('-', '−')} 1d, protocol-wide`}
              </div>
            </>
          ) : null}
        </div>
      </Step>
      <Step
        numeral="ii."
        title="Compare"
        body="Base return, incentives, fees and withdrawal terms stay separate, so nothing is double-counted."
      >
        <div
          className={`${MONO} grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-5 gap-y-4 text-[13px] leading-none`}
        >
          {compareRows.map((row) => (
            <div key={row.label} className="contents">
              <span>{row.label}</span>
              <span className={`${SERIF} text-2xl leading-none`}>{row.apy}</span>
              <span className={row.caution ? 'text-[#e0a35c]' : 'text-[#8f897e]'}>{row.note}</span>
            </div>
          ))}
        </div>
      </Step>
      <Step
        numeral="iii."
        title="Act"
        body="The agent drafts. Your policy checks caps, venues and quote freshness. Your wallet signs."
        last
      >
        <div className={`${MONO} text-[13px] leading-[2.1] text-[#cfc9bd]`}>
          <div>
            <span className="text-[#ff7a45]">✓</span> within $500 cap
          </div>
          <div>
            <span className="text-[#ff7a45]">✓</span> venue on allowlist · Blend
          </div>
          <div>
            <span className="text-[#ff7a45]">✓</span> quote 12s old
          </div>
          <div className={`${SERIF} mt-2 text-[26px] leading-[1.2] text-[#f1ece2]`}>Ready for your signature.</div>
        </div>
      </Step>
    </section>
  );
}

function Step({
  numeral,
  title,
  body,
  last = false,
  children,
}: {
  numeral: string;
  title: string;
  body: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] items-start gap-x-12 gap-y-6 border-t py-10 ${RULE} ${last ? 'border-b' : ''}`}
    >
      <div className="flex items-baseline gap-7">
        <span className={`${SERIF} text-[64px] leading-[.8] text-[#ff7a45] italic`} aria-hidden="true">
          {numeral}
        </span>
        <div>
          <h3 className={`${SERIF} m-0 text-[40px] leading-none`}>{title}</h3>
          <p className="mt-3.5 mb-0 max-w-[380px] text-base leading-[1.6] font-light text-[#cfc9bd]">{body}</p>
        </div>
      </div>
      <div className={`border-l pl-6 ${RULE}`}>{children}</div>
    </div>
  );
}

function Safety() {
  return (
    <section
      id="safety"
      className={`grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] gap-14 bg-[rgba(4,10,6,.86)] pt-10 pb-[140px] ${GUTTER}`}
    >
      <h2 className={`${SERIF} m-0 text-[clamp(52px,7vw,112px)] leading-[.92] tracking-[-.02em]`}>
        The agent holds <em className="text-[#ff7a45]">no keys.</em>
      </h2>
      <ul className="m-0 flex list-none flex-col p-0">
        {SAFETY.map(([title, detail], index) => (
          <li key={title} className={`border-t py-[22px] ${RULE} ${index === SAFETY.length - 1 ? 'border-b' : ''}`}>
            <div className="text-[17px]">{title}</div>
            <div className="mt-1.5 text-[15px] leading-[1.55] font-light text-[#b9b3a8]">{detail}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AskNest() {
  const id = useId();
  const navigate = useNavigate();
  const [question, setQuestion] = useState('');

  function ask(event: FormEvent) {
    event.preventDefault();
    // The question lands in the chat composer; the user still sends it.
    void navigate({ to: '/chat', search: { ask: question.trim() || SUGGESTED_QUESTION.replace('…', '') } });
  }

  return (
    <section className={`pt-[18vh] pb-16 text-center ${GUTTER}`}>
      <h2 className={`${SERIF} m-0 text-[clamp(88px,16vw,260px)] leading-[.85] tracking-[-.03em] italic`}>Ask Nest.</h2>
      <form
        onSubmit={ask}
        className="mx-auto mt-12 flex max-w-[720px] items-center gap-3 border-b border-[rgba(241,236,226,.4)] pb-3.5"
      >
        <label htmlFor={id} className="sr-only">
          Ask Nest a question
        </label>
        <input
          id={id}
          value={question}
          onChange={(event) => setQuestion(event.currentTarget.value)}
          maxLength={4000}
          placeholder={SUGGESTED_QUESTION}
          className="min-w-0 flex-1 bg-transparent text-left text-[clamp(16px,1.6vw,20px)] leading-[1.4] font-light text-[#f1ece2] outline-none placeholder:text-[#8f897e]"
        />
        <button type="submit" className={`${SOLID_PILL} cursor-pointer border-0 py-[13px]`}>
          Ask →
        </button>
      </form>
      <p className={`${MONO} mx-0 mt-24 mb-0 text-xs leading-[1.6] text-[#8f897e]`}>
        © {capturedAt.getUTCFullYear()} Nest · Research snapshots are dated observations, not executable quotes.
      </p>
    </section>
  );
}
