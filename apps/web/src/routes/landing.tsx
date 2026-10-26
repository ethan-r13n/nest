import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource/geist/300.css';
import '@fontsource/geist/400.css';
import '@fontsource/geist/500.css';
import '@fontsource/geist-mono/400.css';

import { Link, useNavigate } from '@tanstack/react-router';
import { type FormEvent, useEffect, useId, useState } from 'react';

import lockupUrl from '../../../../design/nest/assets/nest-lockup.svg';
import { LandingEcosystem } from '../components/landing-ecosystem.tsx';
import { Murmuration } from '../components/murmuration.tsx';

const SERIF = "font-['Instrument_Serif',serif] font-normal";
const SECTION_HEADING = `${SERIF} m-0 text-[clamp(44px,5.5vw,80px)] leading-none`;
const MONO = "font-['Geist_Mono',monospace] font-normal";
const RULE = 'border-[rgba(241,236,226,.16)]';
const GUTTER = 'px-[clamp(20px,4vw,56px)]';
const PILL = 'rounded-full px-5 text-sm leading-none';
const SOLID_PILL = `${PILL} bg-[#ff5b1f] py-3.5 font-medium text-[#08090a] hover:bg-[#ff7a45] hover:text-[#08090a]`;
const SUGGESTED_QUESTION = 'Where can I deploy 5,000 USDC for 30 days at over 5% APR with accessible withdrawals?';

const FEATURES = [
  {
    title: 'Research',
    to: '/research',
    description: 'Explore protocols, markets, yields, stablecoins and tokenized real-world assets.',
  },
  {
    title: 'Trade',
    to: '/trade',
    description: 'Chart major pairs and compare aggregated swap routes before you sign.',
  },
  {
    title: 'Credit',
    to: '/credit',
    description: 'Compare rates, capacity and liquidation terms. Manage collateral and repayments.',
  },
  {
    title: 'Yield',
    to: '/earn',
    description: 'Compare lending, vaults and LPs by fees, incentives, exposure and withdrawal terms.',
  },
  {
    title: 'Portfolio',
    to: '/portfolio',
    description: 'Track balances, positions, debt and history, with paths to manage or exit.',
  },
  {
    title: 'Backtesting & automations',
    to: '/lab/backtests',
    description: 'Test ideas against evidence. Turn verifiable conditions into alerts or transaction proposals.',
  },
  {
    title: 'Chat',
    to: '/chat',
    description: 'Express your intent or turn any screen’s data into a plan through the side-chat.',
  },
] as const;

export function LandingPage() {
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
          <Purpose />
          <Features />
          <Harness />
          <AskNest />
        </main>
      </div>
    </div>
  );
}

function Header() {
  return (
    <header className={`flex flex-wrap items-center justify-between gap-4 py-7 ${GUTTER}`}>
      <Link to="/" aria-label="Nest home" className="order-1 flex min-h-11 items-center">
        <img src={lockupUrl} alt="Nest" className="h-9 w-auto" />
      </Link>
      <nav
        aria-label="Landing"
        className="order-3 flex w-full flex-wrap justify-between gap-x-7 text-sm text-[#b9b3a8] sm:order-2 sm:w-auto sm:justify-start"
      >
        <a href="#how" className="flex min-h-11 items-center hover:text-[#ff7a45]">
          Features
        </a>
        <a href="#safety" className="flex min-h-11 items-center hover:text-[#ff7a45]">
          Harness
        </a>
      </nav>
      <Link
        to="/research"
        className={`${PILL} order-2 flex min-h-11 items-center bg-[#f1ece2] py-[13px] font-medium text-[#08090a] hover:bg-white hover:text-[#08090a] sm:order-3`}
      >
        Launch App →
      </Link>
    </header>
  );
}

function Hero() {
  return (
    <section
      className={`flex min-h-[calc(100svh-160px)] flex-col justify-center gap-6 pb-[clamp(36px,8vh,100px)] sm:min-h-[calc(100svh-100px)] ${GUTTER}`}
    >
      <p className={`${MONO} m-0 text-[11px] tracking-[.16em] text-[#b9b3a8]`}>NEST / AGENT HARNESS</p>
      <h1 className={`${SERIF} m-0 max-w-[1000px] text-[clamp(72px,11.5vw,176px)] leading-[.88] tracking-[-.025em]`}>
        Stellar DeFi.
        <br />
        <em className="text-[#ff7a45]">One harness.</em>
      </h1>
    </section>
  );
}

function Purpose() {
  return (
    <section className={`py-[clamp(80px,13vh,144px)] ${GUTTER}`} aria-labelledby="nest-purpose">
      <h2
        id="nest-purpose"
        className={`${SERIF} m-0 text-[clamp(16px,4.8vw,72px)] leading-[1.06] tracking-[-.015em] whitespace-nowrap`}
      >
        Nest unifies Stellar DeFi <em className="text-[#ff7a45]">research and execution.</em>
      </h2>
      <p className="mt-8 mb-0 max-w-[1040px] text-[clamp(18px,1.8vw,24px)] leading-[1.5] font-light text-pretty text-[#cfc9bd]">
        Discover trading, credit and yield opportunities for your goals and capital. Queue multi-step transactions
        across venues for your review and signature.
      </p>
    </section>
  );
}

function Features() {
  return (
    <section
      id="how"
      className={`scroll-mt-6 bg-[rgba(4,10,6,.90)] py-[clamp(64px,9vw,120px)] ${GUTTER}`}
      aria-labelledby="nest-features"
    >
      <div className="grid items-start gap-x-[clamp(40px,5vw,80px)] gap-y-20 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <h2 id="nest-features" className={`${SECTION_HEADING} mb-10`}>
            The full workspace.
          </h2>
          <ul className={`m-0 list-none border-t p-0 ${RULE}`} data-landing-features>
            {FEATURES.map((feature) => (
              <li
                key={feature.title}
                className={`grid items-start gap-x-6 gap-y-2 border-b py-6 sm:grid-cols-[minmax(0,.85fr)_minmax(0,1.4fr)] ${RULE}`}
              >
                <h3 className={`${SERIF} m-0 text-[clamp(28px,2.4vw,36px)] leading-[1.1]`}>
                  <Link
                    to={feature.to}
                    className="inline-flex min-h-11 items-center hover:text-[#ff7a45] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ff7a45]"
                  >
                    {feature.title}
                  </Link>
                </h3>
                <p className="m-0 text-[16px] leading-[1.55] font-light text-[#cfc9bd]">{feature.description}</p>
              </li>
            ))}
          </ul>
        </div>
        <LandingEcosystem headingClassName={SECTION_HEADING} />
      </div>
    </section>
  );
}

function Harness() {
  return (
    <section
      id="safety"
      className={`scroll-mt-6 bg-[rgba(4,10,6,.75)] py-[clamp(72px,11vw,144px)] ${GUTTER}`}
      aria-labelledby="nest-harness"
    >
      <h2 id="nest-harness" className={`${SECTION_HEADING} mb-12 max-w-[1250px]`}>
        A persistent, self-improving harness.
      </h2>
      <div className="grid gap-x-[clamp(28px,4vw,64px)] gap-y-16 md:grid-cols-2">
        <article className={`border-t pt-8 ${RULE}`}>
          <h3 className={`${SERIF} mt-0 mb-6 text-[clamp(38px,4.2vw,64px)] leading-[1.02] tracking-[-.01em]`}>
            Your <em className="text-[#ff7a45]">eyes</em> while you’re away.
          </h3>
          <p className="m-0 text-lg leading-[1.55] font-light text-[#cfc9bd]">
            Monitor positions, markets and protocol conditions against your thesis. Surface changes, alerts and
            proposals for review.
          </p>
          <HarnessExample>
            If XLM/USDC prices differ by 1% between Aquarius and Soroswap, queue an arbitrage transaction for review.
          </HarnessExample>
        </article>
        <article className={`border-t pt-8 ${RULE}`}>
          <h3 className={`${SERIF} mt-0 mb-6 text-[clamp(38px,4.2vw,64px)] leading-[1.02] tracking-[-.01em]`}>
            Your persistent <em className="text-[#ff7a45]">brain.</em>
          </h3>
          <p className="m-0 text-lg leading-[1.55] font-light text-[#cfc9bd]">
            Retain your theses, preferences and action history. Test ideas against evidence and refine a harness built
            around you.
          </p>
          <HarnessExample>
            Backtest 5,000 USDC lent on Blend for 365 days: did it earn over 5% APR with accessible withdrawals?
          </HarnessExample>
        </article>
      </div>
    </section>
  );
}

function HarnessExample({ children }: { children: string }) {
  return (
    <blockquote className="mx-0 mt-8 mb-0 border-l border-[#ff7a45]/50 pl-5">
      <p className={`${MONO} mt-0 mb-3 text-[10px] tracking-[.1em] text-[#ff7a45]`}>FOR EXAMPLE</p>
      <p className="m-0 text-[17px] leading-[1.6] font-light text-[#f1ece2]">“{children}”</p>
    </blockquote>
  );
}

function AskNest() {
  const id = useId();
  const navigate = useNavigate();
  const [question, setQuestion] = useState('');

  function ask(event: FormEvent) {
    event.preventDefault();
    void navigate({ to: '/chat', search: { ask: question.trim() || SUGGESTED_QUESTION } });
  }

  return (
    <section className={`pt-[clamp(80px,14vh,160px)] pb-12 text-center ${GUTTER}`}>
      <h2 className={`${SERIF} m-0 text-[clamp(80px,13vw,184px)] leading-[.85] tracking-[-.03em] italic`}>Ask Nest.</h2>
      <button
        type="button"
        onClick={() => setQuestion(SUGGESTED_QUESTION)}
        className={`${MONO} mx-auto mt-9 block max-w-[720px] cursor-pointer border-0 bg-transparent px-0 py-3 text-[11px] leading-[1.9] text-[#b9b3a8] hover:text-[#f1ece2] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ff7a45]`}
        aria-label="Use example: 5,000 USDC for 30 days, over 5% APR, accessible withdrawals"
      >
        5,000 USDC <span className="mx-2 text-[#ff7a45]">·</span> 30 days <span className="mx-2 text-[#ff7a45]">·</span>{' '}
        &gt;5% APR <span className="mx-2 text-[#ff7a45]">·</span> Accessible withdrawals
      </button>
      <form onSubmit={ask} className={`mx-auto mt-4 flex max-w-[720px] items-center gap-3 border-b pb-3.5 ${RULE}`}>
        <label htmlFor={id} className="sr-only">
          Ask Nest a question
        </label>
        <input
          id={id}
          value={question}
          onChange={(event) => setQuestion(event.currentTarget.value)}
          maxLength={4000}
          placeholder="Tell Nest your goal…"
          className="min-w-0 flex-1 bg-transparent text-left text-[clamp(16px,1.6vw,20px)] leading-[1.4] font-light text-[#f1ece2] outline-none placeholder:text-[#8f897e]"
        />
        <button type="submit" className={`${SOLID_PILL} min-h-11 cursor-pointer border-0`}>
          Ask →
        </button>
      </form>
      <p className={`${MONO} mx-0 mt-20 mb-0 text-[11px] leading-[1.6] text-[#8f9b88]`}>
        © {new Date().getFullYear()} Nest · Built on Stellar.
      </p>
    </section>
  );
}
