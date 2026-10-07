import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '../contexts/AuthContext';
import LoginModal from '../components/LoginModal';
import './ProPage.css';
import proContent from '../content/pro.json';

const { benefits, inclusions, faqs } = proContent;
const buttonStyle = 'inline-flex items-center justify-center rounded-xl bg-cyan-400 px-6 py-4 font-bold text-slate-950 transition hover:bg-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300 disabled:opacity-50';

export default function ProPage() {
  const location = useLocation();
  const returnTo = location.state?.proIntroReturnTo;
  const safeReturnTo = typeof returnTo === 'string' && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/';
  const { user, isSubscribed, isLoading, subscribe } = useAuth();
  const [modal, setModal] = useState<'signin' | 'subscribe' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function checkout() {
    if (!user) { setModal('subscribe'); return; }
    setBusy(true); setError('');
    try { await subscribe(); } catch (e) { setError(e instanceof Error ? e.message : 'Checkout could not start. Please try again.'); setBusy(false); }
  }
  const cta = isSubscribed
    ? <Link className={buttonStyle + ' w-full'} to="/tools/form-lab">Open Form Lab →</Link>
    : <button className={buttonStyle + ' w-full'} disabled={busy || isLoading} onClick={checkout}>{busy ? 'Opening secure checkout…' : 'Get SteamWatch Pro →'}</button>;
  return <div className="pro-page max-w-6xl mx-auto pb-12">
    <Helmet><title>{proContent.title}</title><meta name="description" content={proContent.description} /><link rel="canonical" href="https://www.steamwatch.io/pro" /><meta property="og:title" content="SteamWatch Pro — Go beyond the move." /><meta property="og:description" content="Football research with more context. Form Lab, team rankings, rolling xG and model results. €19.99 per month." /><meta property="og:url" content="https://www.steamwatch.io/pro" /></Helmet>
    {returnTo && <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-800/70 px-4 py-3">
      <p className="text-sm text-slate-300">A quick look at Pro. Just once this session.</p>
      <Link to={safeReturnTo} replace className="rounded-lg border border-slate-500 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">Continue browsing →</Link>
    </div>}
    <section className="pro-hero relative overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 p-6 sm:p-10 lg:p-14">
      <div aria-hidden="true" className="pointer-events-none absolute -top-40 right-0 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="relative grid gap-10 lg:grid-cols-[1.3fr_1fr] lg:items-center">
        <div><span className="inline-flex items-center gap-3 font-mono text-xs uppercase tracking-[0.2em] text-cyan-300"><span className="h-2 w-2 rounded-full bg-cyan-400" />SteamWatch Pro</span>
          <h1 className="mt-6 text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.08] text-white">Spot the move.<br /><span className="text-cyan-300">Build your view.</span></h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-slate-300">The market tells you what moved. Pro gives you the tools to investigate why.</p>
          <p className="mt-4 max-w-lg leading-relaxed text-slate-400">Bring team form, expected goals, historical results and model pricing into your football research. One membership. More context for every decision.</p>
          <a href="#included" className="mt-7 inline-block text-sm font-semibold text-white underline decoration-slate-600 underline-offset-8 hover:text-cyan-300">Explore what’s included ↓</a>
        </div>
        <div className="pro-price rounded-2xl border border-cyan-400/30 bg-slate-800/80 p-6 sm:p-8 shadow-xl">
          <div className="flex items-center justify-between gap-3"><span className="text-lg font-bold text-white">Your research, upgraded.</span><span className="rounded-md bg-cyan-400/10 px-2 py-1 text-xs font-bold text-cyan-300">PRO</span></div>
          <div className="mt-7 flex items-baseline gap-2"><span className="text-5xl font-bold tracking-tight text-white">€19.99</span><span className="text-slate-400">/ month</span></div>
          <p className="mt-2 text-sm text-slate-400">Monthly subscription. Renews automatically.</p>
          <ul className="my-7 space-y-3">{inclusions.map(x => <li key={x} className="flex gap-3 text-sm text-slate-200"><span className="text-cyan-300" aria-hidden="true">✓</span>{x}</li>)}</ul>
          {isSubscribed && <p className="mb-3 text-sm text-cyan-300">You already have Pro. Your tools are ready.</p>}{cta}
          {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
          <p className="mt-4 text-center text-xs text-slate-400">Secure checkout with Stripe</p>
          {!user && <p className="mt-3 text-center text-xs text-slate-400">Already a member? <button className="text-cyan-300 underline" onClick={() => setModal('signin')}>Sign in</button></p>}
        </div>
      </div>
    </section>
    <section id="included" className="pro-features scroll-mt-28 py-14">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-cyan-300">Inside your membership</p><h2 className="mt-3 text-3xl font-bold tracking-tight text-white">A stronger research process, in one place.</h2>
      <div className="mt-8 grid gap-5 md:grid-cols-2">{benefits.map(b => <article key={b.n} className="pro-feature rounded-2xl border border-slate-700/80 bg-slate-800/50 p-6 sm:p-8"><div className="flex justify-between text-xs font-mono uppercase tracking-widest"><span className="text-cyan-300">{b.name}</span><span className="text-slate-500">{b.n}</span></div><h3 className="mt-5 text-xl font-bold text-white">{b.title}</h3><p className="mt-3 leading-relaxed text-slate-400">{b.text}</p><div className="mt-5 flex flex-wrap gap-2">{b.tags.map(t => <span key={t} className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300">{t}</span>)}</div><Link to={b.href} className="mt-6 inline-block text-sm font-semibold text-cyan-300 hover:text-white">Explore {b.name} →</Link></article>)}</div>
    </section>
    <section className="rounded-2xl border border-slate-700 bg-slate-900 p-6 sm:p-9"><h2 className="text-2xl font-bold text-white">Start with the move. Go deeper with Pro.</h2><div className="mt-6 grid gap-6 md:grid-cols-2"><div><h3 className="font-semibold text-slate-200">Free to explore</h3><p className="mt-2 leading-relaxed text-slate-400">Follow the odds overview, join the free Telegram alerts and explore public results and tool previews.</p></div><div className="md:border-l md:border-slate-700 md:pl-6"><h3 className="font-semibold text-cyan-300">Pro adds the detail</h3><p className="mt-2 leading-relaxed text-slate-300">Research form in depth, compare underlying performances, examine full team rankings and generate model prices.</p></div></div></section>
    <section className="mx-auto max-w-3xl py-14"><h2 className="mb-6 text-2xl font-bold text-white">Before you join</h2>{faqs.map(([q,a]) => <details key={q} className="border-b border-slate-700 py-5"><summary className="cursor-pointer font-semibold text-slate-200">{q}</summary><p className="mt-3 leading-relaxed text-slate-400">{a}</p></details>)}</section>
    <section className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-7 sm:p-10 text-center"><h2 className="text-3xl font-bold text-white">Give your research more depth.</h2><p className="mt-3 text-slate-400">SteamWatch Pro. €19.99 per month.</p><div className="mx-auto mt-6 max-w-sm">{cta}</div></section>
    {modal && <LoginModal key={modal} isOpen onClose={() => setModal(null)} mode={modal} />}
  </div>;
}
