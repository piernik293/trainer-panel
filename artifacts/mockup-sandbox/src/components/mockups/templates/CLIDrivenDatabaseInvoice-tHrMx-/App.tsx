import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Terminal, Plus, Trash2, Download, Copy, Check, Hash,
  GitBranch, Zap, FileCode2, ChevronDown, Braces, Command
} from 'lucide-react';

const CURRENCIES = {
  USD: { symbol: '$', label: 'USD' },
  EUR: { symbol: '€', label: 'EUR' },
  GBP: { symbol: '£', label: 'GBP' },
};

const initialItems = [
  { id: 1, desc: 'API integration — Stripe Connect onboarding flow', detail: 'webhooks, idempotency layer, retry queue', qty: 32, rate: 145 },
  { id: 2, desc: 'CI/CD pipeline overhaul', detail: 'GitHub Actions matrix builds, preview deploys', qty: 18, rate: 145 },
  { id: 3, desc: 'Postgres query optimization', detail: 'index audit, N+1 elimination, pgbouncer config', qty: 11, rate: 160 },
];

let nextId = 4;

export default function App() {
  const [items, setItems] = useState(initialItems);
  const [client, setClient] = useState({ name: 'Vercel Inc.', email: 'ap@vercel.com', address: '440 N Barranca Ave #4133\nCovina, CA 91723' });
  const [meta, setMeta] = useState({ number: 'INV-2024-0047', issued: '2024-11-18', due: '2024-12-02' });
  const [currency, setCurrency] = useState('USD');
  const [taxEnabled, setTaxEnabled] = useState(true);
  const [taxRate, setTaxRate] = useState(8.5);
  const [discount, setDiscount] = useState(0);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState('items');

  const cur = CURRENCIES[currency];

  const subtotal = useMemo(() => items.reduce((s, i) => s + i.qty * i.rate, 0), [items]);
  const discountAmt = subtotal * (discount / 100);
  const taxAmt = taxEnabled ? (subtotal - discountAmt) * (taxRate / 100) : 0;
  const total = subtotal - discountAmt + taxAmt;

  const fmt = (n) => `${cur.symbol}${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const updateItem = (id, field, value) => {
    setItems(items.map(i => i.id === id ? { ...i, [field]: field === 'qty' || field === 'rate' ? Number(value) || 0 : value } : i));
  };

  const addItem = () => {
    setItems([...items, { id: nextId++, desc: 'New line item', detail: '', qty: 1, rate: 145 }]);
  };

  const removeItem = (id) => setItems(items.filter(i => i.id !== id));

  const handleCopy = () => {
    const json = JSON.stringify({ invoice: meta.number, client: client.name, currency, items: items.map(({ desc, qty, rate }) => ({ desc, qty, rate })), subtotal, tax: taxAmt, total }, null, 2);
    navigator.clipboard?.writeText(json).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="min-h-screen bg-[#0a0c10] text-[#e2e8f0]" style={{ fontFamily: "'Inter', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <style dangerouslySetInnerHTML={{ __html: `
        .mono { font-family: 'JetBrains Mono', monospace; }
        .editor-input {
          background: transparent; border: none; outline: none; width: 100%;
          font-family: 'JetBrains Mono', monospace;
        }
        .editor-input:focus { background: rgba(56, 189, 248, 0.06); border-radius: 3px; }
        .editor-input::placeholder { color: #3b4254; }
        input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: #0a0c10; }
        ::-webkit-scrollbar-thumb { background: #1e2433; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #2a3247; }
        .grid-bg {
          background-image: linear-gradient(rgba(148,163,184,0.03) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(148,163,184,0.03) 1px, transparent 1px);
          background-size: 24px 24px;
        }
        .paper-shadow { box-shadow: 0 0 0 1px rgba(255,255,255,0.06), 0 25px 60px -15px rgba(0,0,0,0.7), 0 8px 20px -8px rgba(0,0,0,0.5); }
        .key-badge { font-family: 'JetBrains Mono', monospace; font-size: 10px; padding: 2px 5px; border-radius: 4px; background: #1a2030; border: 1px solid #2a3247; color: #64748b; }
        .blink-cursor::after { content: '▋'; animation: blink 1.1s steps(1) infinite; color: #38bdf8; margin-left: 2px; }
        @keyframes blink { 50% { opacity: 0; } }
        .toggle-track { transition: background 0.2s ease; }
        .toggle-thumb { transition: transform 0.2s cubic-bezier(0.4,0,0.2,1); }
      `}} />

      {/* Top bar */}
      <header className="h-12 border-b border-[#1a2030] flex items-center justify-between px-4 bg-[#0d1017]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-gradient-to-br from-[#38bdf8] to-[#0284c7] flex items-center justify-center">
              <Terminal size={13} className="text-[#0a0c10]" strokeWidth={2.5} />
            </div>
            <span className="mono text-[13px] font-semibold text-white">invc</span>
            <span className="mono text-[11px] text-[#475569]">v2.4.1</span>
          </div>
          <div className="h-4 w-px bg-[#1e2433]" />
          <div className="flex items-center gap-1.5 mono text-[11px] text-[#64748b]">
            <GitBranch size={11} />
            <span>invoices/{meta.number.toLowerCase()}.json</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#fbbf24] ml-1" title="unsaved changes" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden md:flex items-center gap-1 mono text-[11px] text-[#475569] mr-2">
            <Command size={11} /> K to search
          </span>
          <button onClick={handleCopy} className="flex items-center gap-1.5 px-3 h-7 rounded-md border border-[#2a3247] bg-[#141926] hover:bg-[#1a2233] mono text-[11px] text-[#94a3b8] transition-colors">
            {copied ? <Check size={12} className="text-[#4ade80]" /> : <Copy size={12} />}
            {copied ? 'copied' : 'copy json'}
          </button>
          <button className="flex items-center gap-1.5 px-3 h-7 rounded-md bg-[#38bdf8] hover:bg-[#5cc9fa] mono text-[11px] font-semibold text-[#0a0c10] transition-colors">
            <Download size={12} strokeWidth={2.5} />
            export pdf
          </button>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row" style={{ height: 'calc(100vh - 48px)' }}>

        {/* ============ LEFT: EDITOR ============ */}
        <div className="lg:w-[46%] border-r border-[#1a2030] flex flex-col overflow-hidden bg-[#0d1017]">
          {/* tabs */}
          <div className="flex items-center border-b border-[#1a2030] px-2 pt-2 gap-1">
            {[
              { id: 'items', label: 'line_items', icon: Braces },
              { id: 'client', label: 'client', icon: Hash },
              { id: 'config', label: 'config', icon: FileCode2 },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`mono text-[12px] flex items-center gap-1.5 px-3 py-1.5 rounded-t-md border-b-2 transition-colors ${
                  tab === t.id
                    ? 'text-[#38bdf8] border-[#38bdf8] bg-[#111726]'
                    : 'text-[#64748b] border-transparent hover:text-[#94a3b8]'
                }`}
              >
                <t.icon size={12} />
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-5 grid-bg">
            <AnimatePresence mode="wait">
              {tab === 'items' && (
                <motion.div key="items" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
                  <div className="mono text-[11px] text-[#475569] mb-3 flex items-center justify-between">
                    <span>// {items.length} item{items.length !== 1 ? 's' : ''} · billed hourly</span>
                    <span>{fmt(subtotal)} subtotal</span>
                  </div>

                  <div className="space-y-2">
                    {items.map((item, idx) => (
                      <motion.div
                        key={item.id}
                        layout
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        className="group rounded-lg border border-[#1e2433] bg-[#10141f] hover:border-[#2a3550] transition-colors p-3"
                      >
                        <div className="flex items-start gap-3">
                          <span className="mono text-[11px] text-[#3b4254] mt-1 w-5 text-right">{String(idx + 1).padStart(2, '0')}</span>
                          <div className="flex-1 min-w-0">
                            <input
                              className="editor-input text-[13px] font-medium text-[#e2e8f0] mb-0.5"
                              value={item.desc}
                              onChange={e => updateItem(item.id, 'desc', e.target.value)}
                            />
                            <input
                              className="editor-input text-[11px] text-[#64748b]"
                              placeholder="// add detail..."
                              value={item.detail}
                              onChange={e => updateItem(item.id, 'detail', e.target.value)}
                            />
                            <div className="flex items-center gap-4 mt-2.5">
                              <div className="flex items-center gap-1.5">
                                <span className="mono text-[10px] text-[#475569] uppercase">hrs</span>
                                <input
                                  type="number"
                                  className="editor-input text-[12px] text-[#fbbf24] w-14 px-1 py-0.5 bg-[#1a1f0e]/0 border border-[#2a3247] rounded"
                                  value={item.qty}
                                  onChange={e => updateItem(item.id, 'qty', e.target.value)}
                                />
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="mono text-[10px] text-[#475569] uppercase">rate</span>
                                <input
                                  type="number"
                                  className="editor-input text-[12px] text-[#4ade80] w-16 px-1 py-0.5 border border-[#2a3247] rounded"
                                  value={item.rate}
                                  onChange={e => updateItem(item.id, 'rate', e.target.value)}
                                />
                              </div>
                              <div className="ml-auto mono text-[12px] text-[#94a3b8] font-medium">
                                = {fmt(item.qty * item.rate)}
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => removeItem(item.id)}
                            className="opacity-0 group-hover:opacity-100 text-[#475569] hover:text-[#f87171] transition-all p-1"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  <button
                    onClick={addItem}
                    className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-dashed border-[#2a3247] hover:border-[#38bdf8]/50 hover:bg-[#38bdf8]/5 mono text-[12px] text-[#64748b] hover:text-[#38bdf8] transition-all"
                  >
                    <Plus size={13} />
                    items.push(newLineItem)
                  </button>
                </motion.div>
              )}

              {tab === 'client' && (
                <motion.div key="client" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }} className="space-y-4">
                  <div className="mono text-[11px] text-[#475569] mb-1">// billing recipient</div>
                  {[
                    { key: 'name', label: 'client.name', value: client.name },
                    { key: 'email', label: 'client.email', value: client.email },
                  ].map(f => (
                    <div key={f.key} className="rounded-lg border border-[#1e2433] bg-[#10141f] p-3">
                      <div className="mono text-[10px] text-[#7c8db5] mb-1.5">{f.label}</div>
                      <input
                        className="editor-input text-[13px] text-[#e2e8f0]"
                        value={f.value}
                        onChange={e => setClient({ ...client, [f.key]: e.target.value })}
                      />
                    </div>
                  ))}
                  <div className="rounded-lg border border-[#1e2433] bg-[#10141f] p-3">
                    <div className="mono text-[10px] text-[#7c8db5] mb-1.5">client.address</div>
                    <textarea
                      className="editor-input text-[13px] text-[#e2e8f0] resize-none"
                      rows={2}
                      value={client.address}
                      onChange={e => setClient({ ...client, address: e.target.value })}
                    />
                  </div>
                  <div className="mono text-[11px] text-[#475569] pt-2 mb-1">// invoice metadata</div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { key: 'number', label: 'id' },
                      { key: 'issued', label: 'issued' },
                      { key: 'due', label: 'due' },
                    ].map(f => (
                      <div key={f.key} className="rounded-lg border border-[#1e2433] bg-[#10141f] p-3">
                        <div className="mono text-[10px] text-[#7c8db5] mb-1.5">{f.label}</div>
                        <input
                          className="editor-input text-[12px] text-[#e2e8f0]"
                          value={meta[f.key]}
                          onChange={e => setMeta({ ...meta, [f.key]: e.target.value })}
                        />
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {tab === 'config' && (
                <motion.div key="config" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }} className="space-y-3">
                  <div className="mono text-[11px] text-[#475569] mb-1">// invoice.config</div>

                  {/* currency */}
                  <div className="rounded-lg border border-[#1e2433] bg-[#10141f] p-3 flex items-center justify-between">
                    <div>
                      <div className="mono text-[12px] text-[#e2e8f0]">currency</div>
                      <div className="mono text-[10px] text-[#64748b] mt-0.5">ISO 4217 code for all amounts</div>
                    </div>
                    <div className="flex gap-1">
                      {Object.keys(CURRENCIES).map(c => (
                        <button
                          key={c}
                          onClick={() => setCurrency(c)}
                          className={`mono text-[11px] px-2.5 py-1 rounded-md border transition-colors ${
                            currency === c ? 'border-[#38bdf8] bg-[#38bdf8]/10 text-[#38bdf8]' : 'border-[#2a3247] text-[#64748b] hover:text-[#94a3b8]'
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* tax toggle */}
                  <div className="rounded-lg border border-[#1e2433] bg-[#10141f] p-3 flex items-center justify-between">
                    <div>
                      <div className="mono text-[12px] text-[#e2e8f0]">tax.enabled</div>
                      <div className="mono text-[10px] text-[#64748b] mt-0.5">apply sales tax to subtotal</div>
                    </div>
                    <div className="flex items-center gap-3">
                      {taxEnabled && (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={taxRate}
                            onChange={e => setTaxRate(Number(e.target.value) || 0)}
                            className="editor-input text-[12px] text-[#fbbf24] w-12 px-1.5 py-0.5 border border-[#2a3247] rounded text-right"
                          />
                          <span className="mono text-[11px] text-[#64748b]">%</span>
                        </div>
                      )}
                      <button
                        onClick={() => setTaxEnabled(!taxEnabled)}
                        className={`toggle-track w-9 h-5 rounded-full p-0.5 ${taxEnabled ? 'bg-[#38bdf8]' : 'bg-[#2a3247]'}`}
                      >
                        <div className={`toggle-thumb w-4 h-4 rounded-full bg-white ${taxEnabled ? 'translate-x-4' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {/* discount */}
                  <div className="rounded-lg border border-[#1e2433] bg-[#10141f] p-3 flex items-center justify-between">
                    <div>
                      <div className="mono text-[12px] text-[#e2e8f0]">discount.percent</div>
                      <div className="mono text-[10px] text-[#64748b] mt-0.5">repeat client / early payment</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={discount}
                        onChange={e => setDiscount(Number(e.target.value) || 0)}
                        className="editor-input text-[12px] text-[#c084fc] w-12 px-1.5 py-0.5 border border-[#2a3247] rounded text-right"
                      />
                      <span className="mono text-[11px] text-[#64748b]">%</span>
                    </div>
                  </div>

                  <div className="rounded-lg border border-[#1e2433] bg-[#0c1019] p-4 mt-4">
                    <pre className="mono text-[11px] leading-relaxed">
                      <span className="text-[#64748b]">{'{'}</span>{'\n'}
                      <span className="text-[#7dd3fc]">  "currency"</span><span className="text-[#64748b]">: </span><span className="text-[#a5f3a5]">"{currency}"</span><span className="text-[#64748b]">,</span>{'\n'}
                      <span className="text-[#7dd3fc]">  "tax"</span><span className="text-[#64748b]">: </span><span className="text-[#fbbf24]">{taxEnabled ? taxRate : 'null'}</span><span className="text-[#64748b]">,</span>{'\n'}
                      <span className="text-[#7dd3fc]">  "discount"</span><span className="text-[#64748b]">: </span><span className="text-[#fbbf24]">{discount}</span><span className="text-[#64748b]">,</span>{'\n'}
                      <span className="text-[#7dd3fc]">  "net_terms"</span><span className="text-[#64748b]">: </span><span className="text-[#fbbf24]">14</span>{'\n'}
                      <span className="text-[#64748b]">{'}'}</span>
                    </pre>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* status bar */}
          <div className="h-8 border-t border-[#1a2030] flex items-center justify-between px-4 bg-[#0a0d14]">
            <div className="flex items-center gap-3 mono text-[10px] text-[#475569]">
              <span className="flex items-center gap-1"><Zap size={10} className="text-[#4ade80]" /> live preview</span>
              <span>UTF-8</span>
              <span>JSON</span>
            </div>
            <span className="mono text-[10px] text-[#475569]">{items.reduce((s, i) => s + i.qty, 0)}h logged · {fmt(total)} due</span>
          </div>
        </div>

        {/* ============ RIGHT: PREVIEW ============ */}
        <div className="flex-1 overflow-y-auto grid-bg bg-[#0a0c10] p-6 lg:p-10 flex items-start justify-center">
          <motion.div
            layout
            className="w-full max-w-[680px] bg-[#fafaf8] text-[#18181b] rounded-sm paper-shadow"
          >
            {/* invoice header */}
            <div className="px-10 pt-10 pb-8 border-b-2 border-[#18181b]">
              <div className="flex justify-between items-start">
                <div>
                  <h1 className="mono text-[28px] font-bold tracking-tight leading-none">INVOICE</h1>
                  <div className="mono text-[12px] text-[#71717a] mt-2">{meta.number}</div>
                </div>
                <div className="text-right">
                  <div className="mono text-[14px] font-bold">Mara Okafor</div>
                  <div className="text-[12px] text-[#71717a] mt-1 leading-relaxed">
                    Software Engineering Consultancy<br />
                    okafor.dev · mara@okafor.dev<br />
                    EIN 88-2041337
                  </div>
                </div>
              </div>
            </div>

            {/* meta row */}
            <div className="px-10 py-6 grid grid-cols-3 gap-6 border-b border-[#e4e4e7]">
              <div>
                <div className="mono text-[10px] uppercase tracking-wider text-[#a1a1aa] mb-1.5">Billed to</div>
                <div className="text-[13px] font-semibold">{client.name || '—'}</div>
                <div className="text-[12px] text-[#71717a] whitespace-pre-line leading-relaxed">{client.address}</div>
                <div className="mono text-[11px] text-[#71717a] mt-1">{client.email}</div>
              </div>
              <div>
                <div className="mono text-[10px] uppercase tracking-wider text-[#a1a1aa] mb-1.5">Issued</div>
                <div className="mono text-[13px]">{meta.issued}</div>
                <div className="mono text-[10px] uppercase tracking-wider text-[#a1a1aa] mb-1.5 mt-4">Due</div>
                <div className="mono text-[13px]">{meta.due}</div>
              </div>
              <div>
                <div className="mono text-[10px] uppercase tracking-wider text-[#a1a1aa] mb-1.5">Amount due</div>
                <motion.div
                  key={total}
                  initial={{ opacity: 0.4 }}
                  animate={{ opacity: 1 }}
                  className="mono text-[22px] font-bold tracking-tight"
                >
                  {fmt(total)}
                </motion.div>
                <div className="inline-flex items-center gap-1.5 mt-2 px-2 py-0.5 rounded-full bg-[#fef3c7] border border-[#fde68a]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#d97706]" />
                  <span className="mono text-[10px] font-semibold text-[#92400e]">NET 14</span>
                </div>
              </div>
            </div>

            {/* line items table */}
            <div className="px-10 py-6">
              <table className="w-full">
                <thead>
                  <tr className="mono text-[10px] uppercase tracking-wider text-[#a1a1aa]">
                    <th className="text-left pb-3 font-medium">Description</th>
                    <th className="text-right pb-3 font-medium w-16">Hrs</th>
                    <th className="text-right pb-3 font-medium w-24">Rate</th>
                    <th className="text-right pb-3 font-medium w-28">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence>
                    {items.map(item => (
                      <motion.tr
                        key={item.id}
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="border-t border-[#e4e4e7]"
                      >
                        <td className="py-3 pr-4">
                          <div className="text-[13px] font-medium">{item.desc || 'Untitled'}</div>
                          {item.detail && <div className="mono text-[11px] text-[#a1a1aa] mt-0.5">{item.detail}</div>}
                        </td>
                        <td className="py-3 text-right mono text-[12px] text-[#52525b]">{item.qty}</td>
                        <td className="py-3 text-right mono text-[12px] text-[#52525b]">{fmt(item.rate)}</td>
                        <td className="py-3 text-right mono text-[13px] font-semibold">{fmt(item.qty * item.rate)}</td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>

              {/* totals */}
              <div className="flex justify-end mt-6">
                <div className="w-64 space-y-2">
                  <div className="flex justify-between mono text-[12px] text-[#52525b]">
                    <span>Subtotal</span><span>{fmt(subtotal)}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between mono text-[12px] text-[#52525b]">
                      <span>Discount ({discount}%)</span><span>−{fmt(discountAmt)}</span>
                    </div>
                  )}
                  {taxEnabled && (
                    <div className="flex justify-between mono text-[12px] text-[#52525b]">
                      <span>Tax ({taxRate}%)</span><span>{fmt(taxAmt)}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-2 border-t-2 border-[#18181b] mono text-[15px] font-bold">
                    <span>Total</span><span>{fmt(total)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* footer */}
            <div className="px-10 py-6 border-t border-[#e4e4e7] bg-[#f4f4f2] rounded-b-sm">
              <div className="flex justify-between items-end">
                <div>
                  <div className="mono text-[10px] uppercase tracking-wider text-[#a1a1aa] mb-1.5">Payment</div>
                  <div className="mono text-[11px] text-[#52525b] leading-relaxed">
                    ACH — Mercury Bank · Routing 084106768 · Acct ····4429<br />
                    or <span className="underline decoration-[#a1a1aa] underline-offset-2">pay.okafor.dev/{meta.number.toLowerCase()}</span>
                  </div>
                </div>
                <div className="mono text-[10px] text-[#a1a1aa] text-right">
                  Generated with invc CLI<br />
                  sha:9f3e2a1
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}