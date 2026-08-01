import { useState, useMemo } from 'react';
import {
  Feather, Search, Plus, ArrowUpRight, CircleDollarSign,
  FileText, Users, Clock, CheckCircle2, AlertCircle, Send,
  Printer, Download, ChevronRight, Stamp, Layers, Settings,
  BookOpen, Inbox, BarChart3
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const INVOICES = [
  {
    id: 'INV-1947',
    backer: 'Harriet Mellor',
    tier: 'The Archivist',
    email: 'h.mellor@postandquill.co',
    issued: 'Mar 04, 1986', // playful retro date stamp—real date below
    issuedReal: 'Mar 04, 2025',
    due: 'Mar 18, 2025',
    status: 'paid',
    amount: 284.00,
    items: [
      { name: 'Heirloom Ledger No. 4 — Slate', qty: 2, price: 86.00 },
      { name: 'Cotton Rag Letterpress Set (50)', qty: 1, price: 64.00 },
      { name: 'Brass Seal & Vermilion Wax Kit', qty: 1, price: 48.00 },
    ],
    shipping: 0,
    note: 'Founding backer — shipping waived per campaign pledge terms.',
  },
  {
    id: 'INV-1948',
    backer: 'Meridian Books, Ltd.',
    tier: 'Retail Twelve-Set',
    email: 'orders@meridianbooks.com',
    issuedReal: 'Mar 06, 2025',
    due: 'Apr 05, 2025',
    status: 'pending',
    amount: 1042.00,
    items: [
      { name: 'Heirloom Ledger No. 4 — Slate (case of 6)', qty: 1, price: 432.00 },
      { name: 'Heirloom Ledger No. 4 — Oxblood (case of 6)', qty: 1, price: 432.00 },
      { name: 'Counter Display, Walnut', qty: 1, price: 118.00 },
    ],
    shipping: 60.00,
    note: 'Net-30 terms extended to stockist partners during the campaign window.',
  },
  {
    id: 'INV-1949',
    backer: 'Theo Okafor',
    tier: 'The Correspondent',
    email: 'theo.okafor@inkwell.io',
    issuedReal: 'Mar 09, 2025',
    due: 'Mar 23, 2025',
    status: 'paid',
    amount: 142.00,
    items: [
      { name: 'Heirloom Ledger No. 4 — Oxblood', qty: 1, price: 86.00 },
      { name: 'Cotton Rag Letterpress Set (25)', qty: 1, price: 38.00 },
    ],
    shipping: 18.00,
    note: '',
  },
  {
    id: 'INV-1950',
    backer: 'Studio Granholm',
    tier: 'Atelier Bundle',
    email: 'hello@granholm.studio',
    issuedReal: 'Feb 21, 2025',
    due: 'Mar 07, 2025',
    status: 'overdue',
    amount: 618.00,
    items: [
      { name: 'Heirloom Ledger No. 4 — Slate', qty: 4, price: 344.00 },
      { name: 'Drafting Pad, 90gsm Ivory (3-pack)', qty: 3, price: 126.00 },
      { name: 'Brass Seal & Vermilion Wax Kit', qty: 2, price: 96.00 },
    ],
    shipping: 52.00,
    note: 'Second reminder dispatched Mar 12. Escalate to direct correspondence Mar 21.',
  },
  {
    id: 'INV-1951',
    backer: 'June Castellano',
    tier: 'The Archivist',
    email: 'june.cast@papertrail.net',
    issuedReal: 'Mar 11, 2025',
    due: 'Mar 25, 2025',
    status: 'pending',
    amount: 198.00,
    items: [
      { name: 'Heirloom Ledger No. 4 — Slate', qty: 1, price: 86.00 },
      { name: 'Heirloom Ledger No. 4 — Oxblood', qty: 1, price: 86.00 },
    ],
    shipping: 26.00,
    note: 'Requested gift wrapping in campaign survey — flagged for fulfillment.',
  },
  {
    id: 'INV-1952',
    backer: 'Pressbound Collective',
    tier: 'Retail Twelve-Set',
    email: 'accounts@pressbound.org',
    issuedReal: 'Mar 13, 2025',
    due: 'Apr 12, 2025',
    status: 'draft',
    amount: 864.00,
    items: [
      { name: 'Heirloom Ledger No. 4 — Slate (case of 6)', qty: 2, price: 864.00 },
    ],
    shipping: 0,
    note: 'Awaiting confirmed ship-to address before issue.',
  },
];

const STATUS_META = {
  paid:    { label: 'Paid',    dot: '#9fe870', text: '#9fe870', bg: 'rgba(159,232,112,0.08)', icon: CheckCircle2 },
  pending: { label: 'Pending', dot: '#ffc24b', text: '#ffc24b', bg: 'rgba(255,194,75,0.08)',  icon: Clock },
  overdue: { label: 'Overdue', dot: '#ff7a59', text: '#ff7a59', bg: 'rgba(255,122,89,0.08)',  icon: AlertCircle },
  draft:   { label: 'Draft',   dot: '#8d877a', text: '#a39c8d', bg: 'rgba(141,135,122,0.10)', icon: FileText },
};

const fmt = (n) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function App() {
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState('INV-1948');
  const [query, setQuery] = useState('');
  const [reminded, setReminded] = useState({});

  const filtered = useMemo(() => {
    return INVOICES.filter(inv => {
      const matchesFilter = filter === 'all' || inv.status === filter;
      const q = query.trim().toLowerCase();
      const matchesQuery = !q || inv.backer.toLowerCase().includes(q) || inv.id.toLowerCase().includes(q) || inv.tier.toLowerCase().includes(q);
      return matchesFilter && matchesQuery;
    });
  }, [filter, query]);

  const selected = INVOICES.find(i => i.id === selectedId) || filtered[0];

  const totals = useMemo(() => {
    const paid = INVOICES.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0);
    const pending = INVOICES.filter(i => i.status === 'pending').reduce((s, i) => s + i.amount, 0);
    const overdue = INVOICES.filter(i => i.status === 'overdue').reduce((s, i) => s + i.amount, 0);
    return { paid, pending, overdue, all: paid + pending + overdue };
  }, []);

  const counts = useMemo(() => {
    const c = { all: INVOICES.length, paid: 0, pending: 0, overdue: 0, draft: 0 };
    INVOICES.forEach(i => c[i.status]++);
    return c;
  }, []);

  const subtotal = selected ? selected.items.reduce((s, it) => s + it.price, 0) : 0;

  return (
    <div className="lp-root min-h-screen text-[#e8e1d0]">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500;9..144,600;9..144,700&family=IBM+Plex+Mono:wght@400;500;600&family=Spectral:wght@300;400;500&display=swap" rel="stylesheet" />
      <style dangerouslySetInnerHTML={{ __html: `
        .lp-root {
          background: #161310;
          background-image:
            radial-gradient(1200px 600px at 80% -10%, rgba(255,178,71,0.06), transparent 60%),
            radial-gradient(900px 500px at 0% 110%, rgba(159,232,112,0.04), transparent 60%);
          font-family: 'Spectral', serif;
        }
        .lp-root::before {
          content: '';
          position: fixed; inset: 0; pointer-events: none; z-index: 50;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E");
        }
        .display { font-family: 'Fraunces', serif; }
        .mono { font-family: 'IBM Plex Mono', monospace; }
        .smallcaps {
          font-family: 'IBM Plex Mono', monospace;
          font-variant: all-small-caps;
          letter-spacing: 0.18em;
          font-feature-settings: 'c2sc', 'smcp';
        }
        .ledger-rule { background-image: repeating-linear-gradient(to bottom, transparent 0px, transparent 31px, rgba(232,225,208,0.05) 31px, rgba(232,225,208,0.05) 32px); }
        .perf-edge {
          background-image: radial-gradient(circle at 50% 50%, #161310 3px, transparent 3.5px);
          background-size: 16px 16px;
          background-position: 0 50%;
        }
        .lp-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
        .lp-scroll::-webkit-scrollbar-thumb { background: #3a342a; border-radius: 0; }
        .lp-scroll::-webkit-scrollbar-track { background: transparent; }
        .row-hover:hover { background: rgba(255,194,75,0.04); }
        @keyframes stampIn { from { transform: rotate(-14deg) scale(1.4); opacity: 0; } to { transform: rotate(-8deg) scale(1); opacity: 1; } }
        .stamp-anim { animation: stampIn 0.35s cubic-bezier(0.2, 1.4, 0.4, 1) both; }
        .glow-amber { text-shadow: 0 0 18px rgba(255,194,75,0.35); }
        .glow-green { text-shadow: 0 0 18px rgba(159,232,112,0.3); }
        .glow-red { text-shadow: 0 0 18px rgba(255,122,89,0.35); }
      `}} />

      <div className="flex min-h-screen relative z-10">
        {/* ───────── Sidebar ───────── */}
        <aside className="w-[218px] shrink-0 border-r border-[#2a2620] flex flex-col">
          <div className="px-6 pt-7 pb-6 border-b border-[#2a2620]">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 border border-[#ffc24b]/60 flex items-center justify-center bg-[#ffc24b]/5">
                <Feather size={17} className="text-[#ffc24b]" strokeWidth={1.75} />
              </div>
              <div>
                <div className="display font-semibold text-[15px] leading-tight tracking-tight">Foliant Press</div>
                <div className="smallcaps text-[11px] text-[#8d877a] leading-tight mt-0.5">Ledger · Est. 1979</div>
              </div>
            </div>
          </div>

          <nav className="px-3 py-5 space-y-0.5">
            {[
              { icon: BarChart3, label: 'Campaign', active: false },
              { icon: FileText, label: 'Invoices', active: true },
              { icon: Users, label: 'Backers', active: false },
              { icon: Inbox, label: 'Correspondence', active: false },
              { icon: Layers, label: 'Catalogue', active: false },
              { icon: BookOpen, label: 'Pledge Tiers', active: false },
            ].map(({ icon: Icon, label, active }) => (
              <button key={label} className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${active ? 'bg-[#ffc24b]/10 text-[#ffc24b] border-l-2 border-[#ffc24b]' : 'text-[#a39c8d] hover:text-[#e8e1d0] hover:bg-white/[0.03] border-l-2 border-transparent'}`}>
                <Icon size={15} strokeWidth={1.75} />
                <span className="smallcaps text-[13px] tracking-[0.14em]">{label}</span>
              </button>
            ))}
          </nav>

          <div className="mt-auto px-6 pb-6">
            <div className="border border-[#2a2620] p-4 bg-[#1c1814]">
              <div className="smallcaps text-[11px] text-[#8d877a] mb-2">Campaign · Day 23 of 40</div>
              <div className="mono text-[18px] text-[#9fe870] glow-green font-medium">$84,212</div>
              <div className="text-[12px] text-[#a39c8d] mt-0.5">of $60,000 goal — 140%</div>
              <div className="h-[3px] bg-[#2a2620] mt-3 overflow-hidden">
                <div className="h-full bg-[#9fe870]" style={{ width: '100%', boxShadow: '0 0 8px rgba(159,232,112,0.6)' }} />
              </div>
            </div>
            <button className="w-full mt-4 flex items-center gap-2 text-[#8d877a] hover:text-[#e8e1d0] transition-colors">
              <Settings size={14} strokeWidth={1.75} />
              <span className="smallcaps text-[12px]">Settings</span>
            </button>
          </div>
        </aside>

        {/* ───────── Main column ───────── */}
        <main className="flex-1 min-w-0 flex flex-col">
          {/* Header */}
          <header className="px-8 pt-7 pb-6 border-b border-[#2a2620]">
            <div className="flex items-end justify-between gap-6">
              <div>
                <div className="smallcaps text-[12px] text-[#ffc24b] mb-1.5">Heirloom Ledger No. 4 — Crowdfunding</div>
                <h1 className="display text-[32px] font-medium leading-none tracking-[-0.01em]">Billing &amp; Invoices</h1>
                <p className="text-[14px] text-[#a39c8d] mt-2 max-w-md font-light">
                  Every pledge accounted for, every stockist on terms. The ledger keeps the campaign honest.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button className="flex items-center gap-2 px-4 py-2.5 border border-[#3a342a] text-[#c9c2b2] hover:border-[#5a5240] hover:text-[#e8e1d0] transition-colors">
                  <Download size={14} strokeWidth={1.75} />
                  <span className="smallcaps text-[13px]">Export Ledger</span>
                </button>
                <button className="flex items-center gap-2 px-4 py-2.5 bg-[#ffc24b] text-[#1c1610] hover:bg-[#ffd070] transition-colors" style={{ boxShadow: '0 0 24px rgba(255,194,75,0.25)' }}>
                  <Plus size={15} strokeWidth={2} />
                  <span className="smallcaps text-[13px] font-semibold">New Invoice</span>
                </button>
              </div>
            </div>

            {/* Stats strip */}
            <div className="grid grid-cols-4 gap-px bg-[#2a2620] border border-[#2a2620] mt-7">
              {[
                { label: 'Total Invoiced', value: fmt(totals.all), sub: `${counts.all} invoices issued`, color: '#e8e1d0', glow: '' },
                { label: 'Collected', value: fmt(totals.paid), sub: `${counts.paid} settled`, color: '#9fe870', glow: 'glow-green' },
                { label: 'Awaiting Payment', value: fmt(totals.pending), sub: `${counts.pending} on terms`, color: '#ffc24b', glow: 'glow-amber' },
                { label: 'Past Due', value: fmt(totals.overdue), sub: `${counts.overdue} requires attention`, color: '#ff7a59', glow: 'glow-red' },
              ].map((s) => (
                <div key={s.label} className="bg-[#1a1612] px-5 py-4">
                  <div className="smallcaps text-[11px] text-[#8d877a]">{s.label}</div>
                  <div className={`mono text-[22px] mt-1.5 font-medium ${s.glow}`} style={{ color: s.color }}>{s.value}</div>
                  <div className="text-[12px] text-[#7a7466] mt-1">{s.sub}</div>
                </div>
              ))}
            </div>
          </header>

          <div className="flex flex-1 min-h-0">
            {/* ───────── Invoice list ───────── */}
            <section className="flex-1 min-w-0 border-r border-[#2a2620] flex flex-col">
              {/* Filters + search */}
              <div className="px-8 py-4 flex items-center justify-between gap-4 border-b border-[#2a2620]">
                <div className="flex items-center gap-1">
                  {['all', 'paid', 'pending', 'overdue', 'draft'].map((f) => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={`smallcaps text-[12px] px-3 py-1.5 transition-colors border-b-2 ${filter === f ? 'text-[#ffc24b] border-[#ffc24b]' : 'text-[#8d877a] border-transparent hover:text-[#c9c2b2]'}`}
                    >
                      {f === 'all' ? 'All' : STATUS_META[f].label}
                      <span className="mono ml-1.5 text-[11px] opacity-70">{counts[f]}</span>
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7a7466]" strokeWidth={1.75} />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search backer or invoice…"
                    className="bg-[#1c1814] border border-[#2a2620] pl-9 pr-3 py-2 text-[13px] w-[230px] placeholder-[#6b6557] focus:outline-none focus:border-[#5a5240] font-light"
                  />
                </div>
              </div>

              {/* Table header */}
              <div className="grid grid-cols-[110px_1fr_140px_110px_110px_28px] gap-3 px-8 py-2.5 border-b border-[#2a2620] bg-[#19150f]">
                {['Invoice', 'Backer / Stockist', 'Pledge Tier', 'Due', 'Amount', ''].map((h, i) => (
                  <div key={i} className={`smallcaps text-[11px] text-[#8d877a] ${i === 4 ? 'text-right' : ''}`}>{h}</div>
                ))}
              </div>

              {/* Rows */}
              <div className="flex-1 overflow-y-auto lp-scroll ledger-rule">
                {filtered.map((inv) => {
                  const meta = STATUS_META[inv.status];
                  const isSel = selected && inv.id === selected.id;
                  return (
                    <button
                      key={inv.id}
                      onClick={() => setSelectedId(inv.id)}
                      className={`row-hover w-full grid grid-cols-[110px_1fr_140px_110px_110px_28px] gap-3 items-center px-8 py-3.5 border-b border-[#221e18] text-left transition-colors ${isSel ? 'bg-[#ffc24b]/[0.06] border-l-2 border-l-[#ffc24b]' : 'border-l-2 border-l-transparent'}`}
                    >
                      <div className="mono text-[12px] text-[#c9c2b2]">{inv.id}</div>
                      <div className="min-w-0">
                        <div className="text-[14px] text-[#e8e1d0] truncate">{inv.backer}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.dot, boxShadow: `0 0 6px ${meta.dot}` }} />
                          <span className="smallcaps text-[11px]" style={{ color: meta.text }}>{meta.label}</span>
                        </div>
                      </div>
                      <div className="smallcaps text-[12px] text-[#a39c8d] truncate">{inv.tier}</div>
                      <div className="mono text-[12px] text-[#a39c8d]">{inv.due.replace(', 2025', '')}</div>
                      <div className={`mono text-[13px] text-right ${inv.status === 'overdue' ? 'text-[#ff7a59]' : 'text-[#e8e1d0]'}`}>{fmt(inv.amount)}</div>
                      <ChevronRight size={14} className={`justify-self-end ${isSel ? 'text-[#ffc24b]' : 'text-[#5a5240]'}`} strokeWidth={1.75} />
                    </button>
                  );
                })}
                {filtered.length === 0 && (
                  <div className="px-8 py-16 text-center text-[#7a7466] text-[14px] font-light">
                    No entries match the current ledger view.
                  </div>
                )}
              </div>
            </section>

            {/* ───────── Invoice detail / receipt ───────── */}
            <aside className="w-[420px] shrink-0 flex flex-col bg-[#14110d]">
              <AnimatePresence mode="wait">
                {selected && (
                  <motion.div
                    key={selected.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.22 }}
                    className="flex-1 overflow-y-auto lp-scroll"
                  >
                    {/* Receipt header */}
                    <div className="px-7 pt-7 pb-5 border-b border-dashed border-[#3a342a] relative">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="smallcaps text-[11px] text-[#8d877a]">Invoice</div>
                          <div className="display text-[26px] font-medium mt-0.5 tracking-tight">{selected.id}</div>
                          <div className="mono text-[12px] text-[#a39c8d] mt-1">Issued {selected.issuedReal} · Due {selected.due}</div>
                        </div>
                        {selected.status === 'paid' && (
                          <div className="stamp-anim border-2 border-[#9fe870]/70 text-[#9fe870] smallcaps text-[13px] px-3 py-1.5 font-semibold tracking-[0.25em]" style={{ transform: 'rotate(-8deg)', boxShadow: '0 0 20px rgba(159,232,112,0.2), inset 0 0 20px rgba(159,232,112,0.06)' }}>
                            Paid in Full
                          </div>
                        )}
                        {selected.status === 'overdue' && (
                          <div className="stamp-anim border-2 border-[#ff7a59]/70 text-[#ff7a59] smallcaps text-[13px] px-3 py-1.5 font-semibold tracking-[0.25em]" style={{ transform: 'rotate(-8deg)', boxShadow: '0 0 20px rgba(255,122,89,0.2)' }}>
                            Past Due
                          </div>
                        )}
                        {(selected.status === 'pending' || selected.status === 'draft') && (
                          <div className="stamp-anim border border-[#ffc24b]/50 text-[#ffc24b] smallcaps text-[12px] px-3 py-1.5 tracking-[0.22em]" style={{ transform: 'rotate(-6deg)' }}>
                            {selected.status === 'draft' ? 'Draft' : 'On Terms'}
                          </div>
                        )}
                      </div>

                      <div className="mt-5 grid grid-cols-2 gap-4">
                        <div>
                          <div className="smallcaps text-[11px] text-[#8d877a] mb-1">Billed To</div>
                          <div className="text-[14px]">{selected.backer}</div>
                          <div className="mono text-[11.5px] text-[#7a7466] mt-0.5 truncate">{selected.email}</div>
                        </div>
                        <div>
                          <div className="smallcaps text-[11px] text-[#8d877a] mb-1">Pledge Tier</div>
                          <div className="text-[14px]">{selected.tier}</div>
                          <div className="mono text-[11.5px] text-[#7a7466] mt-0.5">Campaign Ref. HL4-2025</div>
                        </div>
                      </div>
                    </div>

                    {/* Line items */}
                    <div className="px-7 py-5">
                      <div className="smallcaps text-[11px] text-[#8d877a] mb-3">Itemised Goods</div>
                      <div className="space-y-3">
                        {selected.items.map((it, i) => (
                          <div key={i} className="flex items-baseline justify-between gap-4">
                            <div className="flex items-baseline gap-3 min-w-0">
                              <span className="mono text-[11px] text-[#6b6557] shrink-0">{String(it.qty).padStart(2, '0')}×</span>
                              <span className="text-[13.5px] text-[#d8d1c0] font-light leading-snug">{it.name}</span>
                            </div>
                            <div className="flex-1 border-b border-dotted border-[#3a342a] translate-y-[-3px] min-w-[20px]" />
                            <span className="mono text-[12.5px] text-[#e8e1d0] shrink-0">{fmt(it.price)}</span>
                          </div>
                        ))}
                      </div>

                      <div className="mt-6 pt-4 border-t border-[#2a2620] space-y-2">
                        <div className="flex justify-between text-[13px] text-[#a39c8d]">
                          <span className="smallcaps text-[12px]">Subtotal</span>
                          <span className="mono text-[12.5px]">{fmt(subtotal)}</span>
                        </div>
                        <div className="flex justify-between text-[13px] text-[#a39c8d]">
                          <span className="smallcaps text-[12px]">Carriage &amp; Post</span>
                          <span className="mono text-[12.5px]">{selected.shipping === 0 ? 'Waived' : fmt(selected.shipping)}</span>
                        </div>
                        <div className="flex justify-between items-baseline pt-2 mt-2 border-t border-dashed border-[#3a342a]">
                          <span className="smallcaps text-[13px] text-[#e8e1d0]">Total Due</span>
                          <span className="mono text-[22px] text-[#ffc24b] glow-amber font-medium">{fmt(selected.amount)}</span>
                        </div>
                      </div>

                      {selected.note && (
                        <div className="mt-5 border-l-2 border-[#5a5240] pl-4 py-1">
                          <div className="smallcaps text-[11px] text-[#8d877a] mb-1">Ledger Note</div>
                          <p className="text-[13px] text-[#b8b1a0] font-light italic leading-relaxed">{selected.note}</p>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="px-7 pb-7 mt-auto">
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => setReminded(r => ({ ...r, [selected.id]: true }))}
                          disabled={selected.status === 'paid'}
                          className={`flex items-center justify-center gap-2 px-3 py-2.5 transition-colors ${selected.status === 'paid'
                            ? 'border border-[#2a2620] text-[#5a5240] cursor-not-allowed'
                            : reminded[selected.id]
                              ? 'border border-[#9fe870]/50 text-[#9fe870]'
                              : 'bg-[#ffc24b] text-[#1c1610] hover:bg-[#ffd070]'}`}
                        >
                          {reminded[selected.id] ? <CheckCircle2 size={14} strokeWidth={2} /> : <Send size={14} strokeWidth={2} />}
                          <span className="smallcaps text-[12px] font-semibold">{reminded[selected.id] ? 'Reminder Sent' : 'Send Reminder'}</span>
                        </button>
                        <button className="flex items-center justify-center gap-2 px-3 py-2.5 border border-[#3a342a] text-[#c9c2b2] hover:border-[#5a5240] transition-colors">
                          <Printer size={14} strokeWidth={1.75} />
                          <span className="smallcaps text-[12px]">Print Letterpress</span>
                        </button>
                      </div>
                      <div className="flex items-center justify-between mt-4">
                        <button className="flex items-center gap-1.5 smallcaps text-[12px] text-[#8d877a] hover:text-[#e8e1d0] transition-colors">
                          <Stamp size={13} strokeWidth={1.75} /> Mark Settled
                        </button>
                        <button className="flex items-center gap-1.5 smallcaps text-[12px] text-[#8d877a] hover:text-[#e8e1d0] transition-colors">
                          View Full Record <ArrowUpRight size={13} strokeWidth={1.75} />
                        </button>
                      </div>

                      {/* Perforated tear edge */}
                      <div className="mt-7 -mx-7 h-4 perf-edge bg-[#1c1814] border-t border-[#2a2620]" />
                      <div className="-mx-7 px-7 pt-4 pb-1 bg-[#1c1814] flex items-center justify-between">
                        <div className="smallcaps text-[10.5px] text-[#6b6557]">Foliant Press · 14 Calliope Row · Providence RI</div>
                        <CircleDollarSign size={13} className="text-[#6b6557]" strokeWidth={1.5} />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}