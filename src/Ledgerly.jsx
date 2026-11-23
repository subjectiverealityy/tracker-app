import { useState, useEffect, useRef, useMemo, memo } from 'react';
import { Search, Check, Delete, Plus, Minus, ChevronLeft, ChevronRight, Calendar, NotebookText, ArrowLeftRight, Settings, Pencil, Trash2, X, Download, AlertTriangle, LogOut, RotateCcw, Rocket, Copy, CalendarDays, CalendarRange, CalendarSearch, ArrowUp } from 'lucide-react';

// Where feedback emails are sent. Set this to your real address.
const FEEDBACK_EMAIL = 'oge.o.onuora@gmail.com';

// Currencies with hand-picked symbols (the browser's own would be ambiguous or less familiar).
const COMMON_CURRENCIES = [
  // African currencies first
  { code: 'NGN', symbol: '₦', name: 'Nigerian Naira' },
  { code: 'GHS', symbol: '₵', name: 'Ghanaian Cedi' },
  { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling' },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand' },
  { code: 'XOF', symbol: 'CFA', name: 'West African CFA Franc' },
  // Others
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar' },
];

// Every currency in current use (ISO 4217, as of 2026). Names and symbols come from the browser.
const ISO_CURRENCY_CODES =
  'AED AFN ALL AMD AOA ARS AUD AWG AZN BAM BBD BDT BHD BIF BMD BND BOB BRL BSD BTN BWP BYN BZD CAD CDF CHF CLP CNY COP ' +
  'CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR ' +
  'IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU ' +
  'MUR MVR MWK MXN MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG ' +
  'SEK SGD SHP SLE SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD UYU UZS VES VND VUV WST ' +
  'XAF XCD XCG XOF XPF YER ZAR ZMW ZWG';

const currencyName = (() => {
  let names = null;
  try {
    names = new Intl.DisplayNames(['en-GB'], { type: 'currency' });
  } catch (e) {}
  return (code) => {
    try {
      const name = names && names.of(code);
      if (name && name !== code) return name.charAt(0).toUpperCase() + name.slice(1);
    } catch (e) {}
    return code;
  };
})();

// "A$", "₹", "₩"... Falls back to the narrow symbol where that's unambiguous, otherwise the code itself.
const currencySymbol = (code) => {
  const symbolFor = (display) => {
    try {
      const part = new Intl.NumberFormat('en-GB', { style: 'currency', currency: code, currencyDisplay: display })
        .formatToParts(0)
        .find((p) => p.type === 'currency');
      return part ? part.value : code;
    } catch (e) {
      return code;
    }
  };
  const symbol = symbolFor('symbol');
  if (symbol !== code) return symbol;
  const narrow = symbolFor('narrowSymbol');
  return narrow && narrow !== '$' ? narrow : code;
};

// All currencies, alphabetically by name.
const CURRENCIES = [
  ...COMMON_CURRENCIES,
  ...ISO_CURRENCY_CODES.split(' ')
    .filter((code) => !COMMON_CURRENCIES.some((c) => c.code === code))
    .map((code) => ({ code, symbol: currencySymbol(code), name: currencyName(code) })),
].sort((a, b) => a.name.localeCompare(b.name));
const currencyOf = (code) =>
  CURRENCIES.find((c) => c.code === code) || (code ? { code, symbol: code, name: code } : COMMON_CURRENCIES[0]);

// One-time tips shown to new users, keyed by name, one bullet per array entry.
// TIP_SCREEN says which screen each belongs to.
const TIPS = {
  firstItem: [
    <>Add items in <strong>single units</strong> (you will be asked to add their quantity and price later).</>,
    'A big circle with a ‘✓’ icon will appear after you add your first item. Tap it to add the item’s quantity and price.',
    <><strong>Tip:</strong> Double-tap an item to delete it.</>,
    <>
      <strong>Switch between ledgers</strong> or <strong>create a new ledger</strong> on this screen, but rename or delete ledgers in Settings.
    </>,
  ],
  quantity: [<><strong>Tip:</strong> Use ‘00’ or ‘000’ on the<br />right-hand side of the keypad for faster entry.</>],
  price: [
    <>Enter the <strong>total price</strong> (not the unit price).</>,
    <>You can <strong>choose a different currency</strong> here or <strong>change the default currency</strong>.</>,
  ],
  ledger: [
    <>You can <strong>search past entries</strong> here and <strong>compare per-unit prices</strong>.</>,
    <><strong>Tip:</strong> Double-tap an entry to cancel it.</>,
  ],
  totals: [
    'Here, you can see the daily, monthly and yearly totals of your selected ledger.',
    <>You can also <strong>jump</strong> to a specific month’s entries or a specific day’s entries.</>,
  ],
  settings: [
    'Manage account and payment information here.',
    <>You can also <strong>download your data for analysis</strong>.</>,
    <>Click the flower icon (🌷) on the top-left to <strong>send feedback</strong>.</>,
  ],
};
const TIP_SCREEN = { firstItem: 1, quantity: 2, price: 3, ledger: 4, totals: 5 }; // settings is an overlay, handled separately
const DEMO_TIPS = ['firstItem', 'ledger', 'totals'];
// Shown in the demo's Settings in place of a real account.
const DEMO_ACCOUNT = { id: 'demo', prefix: 'demo:', emails: [{ address: 'you@example.com', primary: true, addedAt: 0 }] };
const DEMO_NOTICE ='You can’t add entries in the demo. Switch to the real app to start logging expenses and income.';

// Intl formatters are slow to create, so build them once and reuse.
const NUM_FMT = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 2 });
const DAY_FMT = new Intl.DateTimeFormat('en-NG', { weekday: 'short', day: 'numeric', month: 'short' });
const MONTH_YEAR_FMT = new Intl.DateTimeFormat('en-NG', { month: 'long', year: 'numeric' });
const MONTH_FMT = new Intl.DateTimeFormat('en-NG', { month: 'long' });

const fmt = (n) => NUM_FMT.format(Number(n || 0));

const monthKeyOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthLabelOf = (d) => MONTH_YEAR_FMT.format(d);

const dayLabelOf = (d) => {
  const key = d.toDateString();
  const today = new Date();
  if (key === today.toDateString()) return 'Today';
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (key === yest.toDateString()) return 'Yesterday';
  return DAY_FMT.format(d);
};

// Roll the (already nullified-free) daily buckets up into larger periods.
const rollupOf = (dailyBuckets, keyFn) => {
  const map = new Map();
  dailyBuckets.forEach((d) => {
    const key = keyFn(d.date);
    if (!map.has(key)) map.set(key, { key, date: d.date, total: 0, count: 0, otherCurrencies: {} });
    const b = map.get(key);
    b.total += d.total;
    b.count += d.count;
    Object.entries(d.otherCurrencies).forEach(([code, o]) => {
      if (!b.otherCurrencies[code]) b.otherCurrencies[code] = { total: 0, count: 0 };
      b.otherCurrencies[code].total += o.total;
      b.otherCurrencies[code].count += o.count;
    });
  });
  return Array.from(map.values()).sort((a, b) => b.date - a.date);
};

// One row of the ledger list. Memoised so it only re-renders when its own data changes.
const EntryRow = memo(function EntryRow({ e, dayKey, showDay, defaultCurrency, dayRefs, onNullify }) {
  const cur = e.currency || defaultCurrency;
  return (
    <div>
      {showDay && (
        <div
          ref={(el) => {
            dayRefs.current[dayKey] = el;
          }}
          className="px-4 py-1 text-[10px] uppercase tracking-[0.15em] font-semibold"
          style={{ background: 'rgba(245,243,238,0.05)', color: '#7C8883' }}
        >
          {dayLabelOf(new Date(e.id))}
        </div>
      )}
      <div
        onDoubleClick={() => onNullify(e.id)}
        className="px-4 py-3 flex items-center text-sm select-none"
        style={{
          borderBottom: '1px dashed rgba(245,243,238,0.08)',
          opacity: e.nullified ? 0.5 : 1,
          touchAction: 'manipulation',
        }}
      >
        <span className="flex-1 font-medium" style={{ color: '#F5F3EE', fontFamily: 'Manrope' }}>
          <span className="inline-flex items-center">
            {e.name}
            {e.nullified && (
              <span className="ml-1.5 text-[9px] px-1.5 rounded-full uppercase" style={{ background: 'rgba(245,243,238,0.08)', color: '#7C8883' }}>
                Void
              </span>
            )}
            {cur !== defaultCurrency && (
              <span className="ml-1.5 text-[9px] px-1.5 rounded-full uppercase" style={{ background: 'rgba(1,169,157,0.12)', color: '#01A99D' }}>
                {e.currency}
              </span>
            )}
          </span>
          {e.quantity >= 2 && (
            <span className="block text-[11px] mono-num" style={{ color: '#7C8883' }}>
              {currencyOf(cur).symbol}
              {fmt(e.price / e.quantity)}/unit
            </span>
          )}
        </span>
        <span className="w-16 text-center mono-num" style={{ color: '#7C8883' }}>
          ×{e.quantity}
        </span>
        <span className="w-24 text-right mono-num font-semibold" style={{ color: e.nullified ? '#7C8883' : '#01A99D' }}>
          {currencyOf(cur).symbol}
          {fmt(e.price)}
        </span>
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Demo mode: in-memory storage + generated mock data
// ---------------------------------------------------------------------------
const makeMemoryStorage = (seed) => {
  const store = new Map(Object.entries(seed));
  return {
    get: async (key) => (store.has(key) ? { key, value: store.get(key) } : null),
    set: async (key, value) => {
      store.set(key, value);
      return { key, value };
    },
    delete: async (key) => {
      store.delete(key);
      return { key, deleted: true };
    },
  };
};

// Small seeded RNG so the demo looks the same every time it is opened.
const seededRandom = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// Entries run from the current year back two years. Every year has at least 6 months of
// entries and every month with entries has at least 5 different days.
const buildDemoEntries = ({ seed, catalog, fixedMonthly, fixedYearly, specials, days, perDay, skipPerPastYear, yearFactors, voidIndexes }) => {
  const rand = seededRandom(seed);
  const now = new Date();
  const thisYear = now.getFullYear();
  const usedIds = new Set();
  const out = [];

  const roundPrice = (n) => (n >= 10000 ? Math.round(n / 500) * 500 : n >= 1000 ? Math.round(n / 50) * 50 : Math.round(n / 10) * 10);

  const add = (date, name, quantity, price, currency) => {
    if (date.getTime() > now.getTime()) return;
    let id = date.getTime();
    while (usedIds.has(id)) id += 1;
    usedIds.add(id);
    out.push({ id, name, quantity, price, currency });
  };

  const totalWeight = catalog.reduce((sum, c) => sum + c.weight, 0);
  const pickCatalogItem = () => {
    let r = rand() * totalWeight;
    for (const c of catalog) {
      r -= c.weight;
      if (r <= 0) return c;
    }
    return catalog[0];
  };
  const priceFor = (unit, qty, yi) => roundPrice(unit * qty * yearFactors[yi] * (0.92 + rand() * 0.16));

  for (let offset = 2; offset >= 0; offset--) {
    const year = thisYear - offset;
    const yi = 2 - offset;
    const lastMonth = year === thisYear ? now.getMonth() : 11;

    let months = [];
    for (let m = 0; m <= lastMonth; m++) months.push(m);
    if (year !== thisYear) {
      for (let k = 0; k < skipPerPastYear && months.length > 7; k++) {
        months.splice(Math.floor(rand() * months.length), 1);
      }
    }

    months.forEach((month) => {
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const availableDays = year === thisYear && month === now.getMonth() ? now.getDate() : daysInMonth;
      if (availableDays < 5) return;

      const pool = Array.from({ length: availableDays }, (_, i) => i + 1);
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const count = Math.min(availableDays, days[0] + Math.floor(rand() * (days[1] - days[0] + 1)));
      pool.slice(0, count).forEach((day) => {
        const n = perDay[0] + Math.floor(rand() * (perDay[1] - perDay[0] + 1));
        for (let k = 0; k < n; k++) {
          const item = pickCatalogItem();
          const qty = item.qty[Math.floor(rand() * item.qty.length)];
          const date = new Date(year, month, day, 7 + Math.floor(rand() * 13), Math.floor(rand() * 60));
          add(date, item.name, qty, priceFor(item.unit, qty, yi), 'NGN');
        }
      });

      fixedMonthly.forEach((f) => {
        const day = Math.min(availableDays, f.day[0] + Math.floor(rand() * (f.day[1] - f.day[0] + 1)));
        add(new Date(year, month, day, 9, 15), f.name, f.qty, priceFor(f.unit, f.qty, yi), 'NGN');
      });
    });

    fixedYearly.forEach((f) => {
      add(new Date(year, f.month, f.day, 10, 5), f.name, f.qty, roundPrice(f.unit * f.qty * f.factors[yi]), 'NGN');
    });

    specials
      .filter((sp) => sp.yearsAgo === offset)
      .forEach((sp) => add(new Date(year, sp.month, sp.day, 11, 30), sp.name, sp.qty, sp.price, sp.currency));
  }

  out.sort((a, b) => b.id - a.id);
  voidIndexes.forEach((i) => {
    if (out[i]) out[i].nullified = true;
  });
  return out;
};

const buildDemoSeed = () => {
  const shopEntries = buildDemoEntries({
    seed: 2024,
    yearFactors: [1, 1.28, 1.55],
    days: [8, 15],
    perDay: [1, 3],
    skipPerPastYear: 2,
    voidIndexes: [5, 19, 41, 133, 290],
    catalog: [
      { name: 'Rice', unit: 62000, qty: [1, 2, 3, 4], weight: 4 },
      { name: 'Beans', unit: 38000, qty: [1, 2], weight: 3 },
      { name: 'Garri', unit: 24000, qty: [1, 2, 3], weight: 4 },
      { name: 'Palm oil', unit: 9500, qty: [2, 4, 6], weight: 3 },
      { name: 'Vegetable oil', unit: 11000, qty: [2, 3, 4], weight: 3 },
      { name: 'Tomatoes', unit: 18000, qty: [1, 2, 3], weight: 4 },
      { name: 'Pepper', unit: 14000, qty: [1, 2], weight: 3 },
      { name: 'Onions', unit: 28000, qty: [1, 2], weight: 2 },
      { name: 'Eggs', unit: 3400, qty: [5, 10, 15, 20], weight: 4 },
      { name: 'Indomie', unit: 7800, qty: [2, 3, 5], weight: 4 },
      { name: 'Sugar', unit: 1300, qty: [12, 24], weight: 2 },
      { name: 'Bread', unit: 1000, qty: [10, 15, 20], weight: 3 },
      { name: 'Maggi', unit: 2200, qty: [2, 4, 6], weight: 3 },
      { name: 'Salt', unit: 350, qty: [20, 30, 50], weight: 1 },
      { name: 'Peak milk', unit: 1100, qty: [12, 24], weight: 2 },
      { name: 'Detergent', unit: 2400, qty: [6, 12], weight: 2 },
      { name: 'Bottled water', unit: 1800, qty: [5, 10, 20], weight: 2 },
      { name: 'Soft drinks', unit: 5500, qty: [2, 3, 5], weight: 2 },
      { name: 'Transport', unit: 3500, qty: [1, 1, 2], weight: 4 },
      { name: 'Generator fuel', unit: 650, qty: [10, 15, 20, 25], weight: 3 },
    ],
    fixedMonthly: [{ name: 'Electricity', unit: 18000, qty: 1, day: [4, 9] }],
    fixedYearly: [{ name: 'Shop rent', month: 0, day: 3, unit: 480000, qty: 1, factors: [1, 1.15, 1.3] }],
    specials: [
      { yearsAgo: 2, month: 8, day: 12, name: 'Receipt rolls', qty: 5, price: 18, currency: 'USD' },
      { yearsAgo: 2, month: 10, day: 3, name: 'POS software', qty: 1, price: 12, currency: 'USD' },
      { yearsAgo: 1, month: 3, day: 9, name: 'Barcode scanner', qty: 1, price: 45, currency: 'USD' },
      { yearsAgo: 1, month: 5, day: 21, name: 'POS software', qty: 1, price: 12, currency: 'USD' },
      { yearsAgo: 1, month: 7, day: 14, name: 'Detergent (Accra)', qty: 20, price: 1150, currency: 'GHS' },
      { yearsAgo: 1, month: 7, day: 15, name: 'Provisions (Accra)', qty: 1, price: 2400, currency: 'GHS' },
      { yearsAgo: 0, month: 1, day: 6, name: 'Receipt rolls', qty: 5, price: 18, currency: 'USD' },
      { yearsAgo: 0, month: 2, day: 17, name: 'POS software', qty: 1, price: 12, currency: 'USD' },
      { yearsAgo: 0, month: 4, day: 5, name: 'Detergent (Accra)', qty: 15, price: 980, currency: 'GHS' },
    ],
  });

  const homeEntries = buildDemoEntries({
    seed: 77,
    yearFactors: [1, 1.26, 1.5],
    days: [6, 11],
    perDay: [1, 2],
    skipPerPastYear: 2,
    voidIndexes: [7, 52],
    catalog: [
      { name: 'Supermarket', unit: 14000, qty: [1], weight: 5 },
      { name: 'Cooking gas', unit: 1100, qty: [3, 6, 12], weight: 1 },
      { name: 'Uber', unit: 4200, qty: [1, 2], weight: 4 },
      { name: 'Pharmacy', unit: 5500, qty: [1], weight: 2 },
      { name: 'Fuel', unit: 650, qty: [15, 20, 30], weight: 3 },
      { name: 'Eating out', unit: 7500, qty: [1, 2], weight: 4 },
      { name: 'Haircut', unit: 3000, qty: [1], weight: 1 },
      { name: 'Laundry', unit: 4500, qty: [1], weight: 2 },
      { name: 'Dispenser water', unit: 1500, qty: [1, 2], weight: 2 },
    ],
    fixedMonthly: [
      { name: 'Electricity token', unit: 12000, qty: 1, day: [5, 12] },
      { name: 'Data bundle', unit: 3500, qty: 1, day: [1, 4] },
    ],
    fixedYearly: [{ name: 'House rent', month: 1, day: 4, unit: 850000, qty: 1, factors: [1, 1.12, 1.25] }],
    specials: [
      { yearsAgo: 2, month: 2, day: 14, name: 'Domain renewal', qty: 1, price: 14, currency: 'USD' },
      { yearsAgo: 1, month: 2, day: 14, name: 'Domain renewal', qty: 1, price: 14, currency: 'USD' },
      { yearsAgo: 1, month: 10, day: 24, name: 'Amazon order', qty: 2, price: 38, currency: 'USD' },
      { yearsAgo: 0, month: 2, day: 14, name: 'Domain renewal', qty: 1, price: 15, currency: 'USD' },
      { yearsAgo: 0, month: 5, day: 8, name: 'Online course', qty: 1, price: 29, currency: 'USD' },
    ],
  });

  const itemsOf = (entries) => Array.from(new Set(entries.map((e) => e.name)));

  return {
    'ledgerly-seen-walkthrough': 'true',
    'ledgerly-loggers': JSON.stringify([
      { id: 'demo-shop', name: 'Provision Store' },
      { id: 'demo-home', name: 'Home & Personal' },
    ]),
    'ledgerly-active-logger': 'demo-shop',
    'ledgerly-items-demo-shop': JSON.stringify(itemsOf(shopEntries)),
    'ledgerly-entries-demo-shop': JSON.stringify(shopEntries),
    'ledgerly-currency-demo-shop': 'NGN',
    'ledgerly-items-demo-home': JSON.stringify(itemsOf(homeEntries)),
    'ledgerly-entries-demo-home': JSON.stringify(homeEntries),
    'ledgerly-currency-demo-home': 'NGN',
  };
};

function PerfEdge() {
  return (
    <div
      className="h-3 w-full shrink-0"
      style={{
        backgroundImage:
          'radial-gradient(circle at 6px 0px, transparent 6px, #0F1210 6.5px)',
        backgroundSize: '12px 12px',
        backgroundPosition: 'top',
      }}
    />
  );
}

function ConfirmCircle({ show, onClick, label, onDecrement, onIncrement, raised }) {
  const hasSteppers = onDecrement || onIncrement;
  return (
    <div
      className={`transition-all duration-300 ease-out ${hasSteppers ? 'flex items-center gap-4' : ''}`}
      style={{
        position: 'fixed', // stays in view even when the page behind it is long
        // Raised in the demo so it clears the Exit Demo pill; always clear of the home bar.
        bottom: `calc(${raised ? '60px' : '2rem'} + env(safe-area-inset-bottom))`,
        zIndex: 30,
        left: '50%',
        right: 'auto',
        margin: 0,
        width: 'max-content',
        opacity: show ? 1 : 0,
        transform: `translate(-50%, ${show ? '0' : '16px'}) scale(${show ? 1 : 0.85})`,
        pointerEvents: show ? 'auto' : 'none',
      }}
    >
      {onDecrement && (
        <button
          onClick={onDecrement}
          aria-label="Decrease by 1"
          className="w-12 h-12 rounded-full flex items-center justify-center shadow-xl active:scale-95 transition-transform"
          style={{ background: '#171C19', border: '1px solid rgba(245,243,238,0.15)' }}
        >
          <Minus size={18} color="#F5F3EE" strokeWidth={3} />
        </button>
      )}
      <button
        onClick={onClick}
        aria-label={label || 'Confirm'}
        className="w-20 h-20 rounded-full flex items-center justify-center shadow-2xl active:scale-95 transition-transform"
        style={{ background: '#01A99D', boxShadow: '0 8px 30px rgba(1,169,157,0.45)' }}
      >
        <Check size={34} color="#0F1210" strokeWidth={3} />
      </button>
      {onIncrement && (
        <button
          onClick={onIncrement}
          aria-label="Increase by 1"
          className="w-12 h-12 rounded-full flex items-center justify-center shadow-xl active:scale-95 transition-transform"
          style={{ background: '#171C19', border: '1px solid rgba(245,243,238,0.15)' }}
        >
          <Plus size={18} color="#F5F3EE" strokeWidth={3} />
        </button>
      )}
    </div>
  );
}

function TopBar({ title, step, stepLabel, onBack, right, left }) {
  return (
    <div className="flex items-center justify-between pt-5 pb-3">
      {left ? (
        left
      ) : (
        <button
          onClick={onBack}
          className="w-8 h-8 flex items-center justify-center rounded-full"
          style={{ background: onBack ? 'rgba(245,243,238,0.06)' : 'transparent', visibility: onBack ? 'visible' : 'hidden' }}
        >
          <ChevronLeft size={18} color="#F5F3EE" style={{ transform: 'translateX(-1px)' }} />
        </button>
      )}
      <div className="flex flex-col items-center">
        <span className="text-[10px] tracking-[0.2em] uppercase" style={{ color: '#7C8883', fontFamily: 'Manrope' }}>
          {stepLabel || `Step ${step} of 3`}
        </span>
        <span className="text-sm font-semibold text-center" style={{ color: '#F5F3EE', fontFamily: 'Manrope' }}>
          {title}
        </span>
      </div>
      {right ? right : <div className="w-8" />}
    </div>
  );
}

function MonthYearPicker({ open, availableMonths, onCancel, onSelect }) {
  const years = Array.from(new Set(Array.from(availableMonths).map((k) => k.split('-')[0]))).sort((a, b) => b - a);
  const [year, setYear] = useState(years[0] || new Date().getFullYear().toString());

  useEffect(() => {
    if (open && years.length && !years.includes(year)) {
      setYear(years[0]);
    }
  }, [open]);

  if (!open) return null;

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const yearIndex = years.indexOf(year);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-xs rounded-2xl p-5"
        style={{ background: '#171C19', border: '1px solid rgba(245,243,238,0.1)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => yearIndex < years.length - 1 && setYear(years[yearIndex + 1])}
            disabled={yearIndex >= years.length - 1}
            className="w-7 h-7 flex items-center justify-center rounded-full disabled:opacity-30"
            style={{ background: 'rgba(245,243,238,0.06)' }}
          >
            <ChevronLeft size={14} color="#F5F3EE" />
          </button>
          <span className="text-sm font-semibold mono-num" style={{ color: '#F5F3EE', fontFamily: 'Manrope' }}>
            {year}
          </span>
          <button
            onClick={() => yearIndex > 0 && setYear(years[yearIndex - 1])}
            disabled={yearIndex <= 0}
            className="w-7 h-7 flex items-center justify-center rounded-full disabled:opacity-30"
            style={{ background: 'rgba(245,243,238,0.06)' }}
          >
            <ChevronRight size={14} color="#F5F3EE" />
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {monthNames.map((name, i) => {
            const monthKey = `${year}-${String(i + 1).padStart(2, '0')}`;
            const enabled = availableMonths.has(monthKey);
            return (
              <button
                key={name}
                disabled={!enabled}
                onClick={() => onSelect(monthKey)}
                className="py-2 rounded-xl text-xs font-medium disabled:opacity-25"
                style={{
                  fontFamily: 'Manrope',
                  background: enabled ? 'rgba(1,169,157,0.12)' : 'rgba(245,243,238,0.04)',
                  color: enabled ? '#01A99D' : '#7C8883',
                }}
              >
                {name}
              </button>
            );
          })}
        </div>

        <button
          onClick={onCancel}
          className="w-full mt-4 py-2.5 rounded-xl text-sm font-medium"
          style={{ background: 'rgba(245,243,238,0.06)', color: '#F5F3EE', fontFamily: 'Manrope' }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// What a ledger tracks, set in Settings. Ledgers without a type are expenses.
const LEDGER_TYPES = [
  { id: 'income', label: 'Income' },
  { id: 'expenses', label: 'Expenses' },
];
const ledgerTypeLabel = (ledger) => (LEDGER_TYPES.find((t) => t.id === (ledger.type || 'expenses')) || LEDGER_TYPES[1]).label;

// Ledger names must be unique, ignoring capitals and extra spaces. Returns the clashing ledger, if any.
const normaliseLedgerName = (name) => name.trim().replace(/\s+/g, ' ').toLowerCase();
const ledgerWithName = (ledgers, name, exceptId) =>
  ledgers.find((l) => l.id !== exceptId && normaliseLedgerName(l.name) === normaliseLedgerName(name));

function LoggerSwitcher({ open, loggers, activeLoggerId, onSelect, onCreate, newName, setNewName, error, focusNewName, onCancel }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-xs rounded-2xl p-5"
        style={{ background: '#171C19', border: '1px solid rgba(245,243,238,0.1)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-semibold mb-3" style={{ color: '#F5F3EE', fontFamily: 'Manrope' }}>
          Create a new ledger
        </p>
        <div className={`flex gap-2 ${error ? 'mb-2' : 'mb-5'}`}>
          <input
            autoFocus={focusNewName}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onCreate()}
            placeholder="Name e.g. Business Expenses"
            className="flex-1 min-w-0 rounded-xl px-3 py-2.5 text-sm outline-none"
            style={{ background: 'rgba(245,243,238,0.04)', border: '1px solid rgba(245,243,238,0.1)', color: '#F5F3EE' }}
          />
          <button onClick={onCreate} aria-label="Create ledger" className="px-3.5 rounded-xl flex items-center justify-center" style={{ background: '#01A99D' }}>
            <Plus size={16} color="#0F1210" strokeWidth={3} />
          </button>
        </div>
        {error && (
          <p className="text-xs mb-5" style={{ color: '#F87171', fontFamily: 'Manrope' }}>
            {error}
          </p>
        )}
        <p className="text-sm font-semibold mb-1" style={{ color: '#F5F3EE', fontFamily: 'Manrope' }}>
          Switch between existing ledgers
        </p>
        <p className="text-xs mb-3" style={{ color: '#7C8883', fontFamily: 'Manrope' }}>
          You can rename or delete them in Settings.
        </p>
        <div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto">
          {loggers.map((l) => (
            <button
              key={l.id}
              onClick={() => onSelect(l.id)}
              className="flex items-center justify-between px-3 py-2.5 rounded-xl text-left"
              style={{
                background: l.id === activeLoggerId ? 'rgba(1,169,157,0.12)' : 'rgba(245,243,238,0.04)',
                border: `1px solid ${l.id === activeLoggerId ? '#01A99D' : 'rgba(245,243,238,0.1)'}`,
              }}
            >
              <span className="text-sm" style={{ color: '#F5F3EE', fontFamily: 'Manrope' }}>
                {l.name}
              </span>
              {l.id === activeLoggerId && <Check size={14} color="#01A99D" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({ open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', onCancel, onConfirm }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-xs rounded-2xl p-5"
        style={{ background: '#171C19', border: '1px solid rgba(245,243,238,0.1)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-semibold mb-1" style={{ color: '#F5F3EE', fontFamily: 'Manrope' }}>
          {title}
        </p>
        <p className="text-xs mb-5" style={{ color: '#7C8883', fontFamily: 'Manrope' }}>
          {message}
        </p>
        <div className="flex gap-2.5">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: 'rgba(245,243,238,0.06)', color: '#F5F3EE', fontFamily: 'Manrope' }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: '#01A99D', color: '#0F1210', fontFamily: 'Manrope' }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function CurrencyPicker({ open, value, onCancel, onSelect, title = 'Currency for this entry', intro }) {
  const [query, setQuery] = useState('');
  const selectedRef = useRef(null);

  // Start each opening with no search, scrolled to the selected currency.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    if (selectedRef.current) selectedRef.current.scrollIntoView({ block: 'nearest' });
  }, [open]);

  if (!open) return null;
  const q = query.trim().toLowerCase();
  const shown = q
    ? CURRENCIES.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q))
    : CURRENCIES;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-xs rounded-2xl p-5"
        style={{ background: '#171C19', border: '1px solid rgba(245,243,238,0.1)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className={`text-sm font-semibold ${intro ? 'mb-1' : 'mb-3'}`} style={{ color: '#F5F3EE', fontFamily: 'Manrope' }}>
          {title}
        </p>
        {intro && (
          <p className="text-xs mb-3" style={{ color: '#7C8883', fontFamily: 'Manrope' }}>
            {intro}
          </p>
        )}
        <div className="relative mb-2.5">
          <Search size={14} color="#7C8883" className="absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && shown.length === 1 && onSelect(shown[0].code)}
            enterKeyHint="search"
            placeholder="Search e.g. dollar, USD, $"
            aria-label="Search currencies"
            className="app-input w-full rounded-xl pl-8 pr-3 py-2 text-sm outline-none"
            style={inputStyle}
          />
        </div>
        <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto">
          {shown.length === 0 && (
            <p className="text-xs px-1 py-2" style={{ color: '#7C8883', fontFamily: 'Manrope' }}>
              No currency matches ‘{query.trim()}’.
            </p>
          )}
          {shown.map((c) => (
            <button
              key={c.code}
              ref={value === c.code ? selectedRef : undefined}
              onClick={() => onSelect(c.code)}
              className="flex items-center justify-between px-3 py-2.5 rounded-xl text-left"
              style={{
                background: value === c.code ? 'rgba(1,169,157,0.12)' : 'rgba(245,243,238,0.04)',
                border: `1px solid ${value === c.code ? '#01A99D' : 'rgba(245,243,238,0.1)'}`,
              }}
            >
              <span className="text-sm" style={{ color: '#F5F3EE', fontFamily: 'Manrope' }}>
                {c.name}
              </span>
              <span className="mono-num text-xs" style={{ color: value === c.code ? '#01A99D' : '#7C8883' }}>
                {c.code} · {c.symbol}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const WALKTHROUGH_SLIDES = [
  {
    title: 'One app, many ledgers',
    body: "Each ledger keeps its own entries - switch between ledgers any time. All currencies are supported.",
  },
  {
    title: 'Fast entry, few taps',
    body: 'Built for quick, one-handed use. Pick or add an item, then use the on-screen keypad to enter quantity and price.',
  },
  {
    title: 'Your ledger, your totals',
    body: 'Every entry lands in your ledger. Made for quick bookkeeping and tracking expenses / income - not to be used as a replacement for accounting.',
  },
];

function Walkthrough({ open, step, setStep, onDismiss, doneLabel = 'Get started' }) {
  if (!open) return null;
  const slide = WALKTHROUGH_SLIDES[step];
  const isLast = step === WALKTHROUGH_SLIDES.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6" style={{ background: '#0F1210' }}>
      <div className="w-full max-w-xs flex flex-col items-center text-center">
        <span className="mono-num" style={{ fontSize: '2.5rem', lineHeight: 1, color: '#01A99D' }}>
          {step + 1}/{WALKTHROUGH_SLIDES.length}
        </span>
        <p className="text-lg font-bold mt-4 mb-2" style={{ color: '#F5F3EE', fontFamily: 'Manrope' }}>
          {slide.title}
        </p>
        <p className="text-sm leading-relaxed mb-8" style={{ color: '#7C8883', fontFamily: 'Manrope' }}>
          {slide.body}
        </p>

        <div className="flex items-center gap-1.5 mb-8">
          {WALKTHROUGH_SLIDES.map((_, i) => (
            <div
              key={i}
              className="rounded-full"
              style={{
                width: '6px',
                height: '6px',
                background: i === step ? '#01A99D' : 'rgba(245,243,238,0.15)',
                transition: 'background 200ms ease',
              }}
            />
          ))}
        </div>

        <div className="w-full flex gap-2.5">
          {step > 0 && (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="flex-1 py-3 rounded-2xl text-sm font-medium"
              style={{ background: 'rgba(245,243,238,0.06)', color: '#F5F3EE', fontFamily: 'Manrope' }}
            >
              Back
            </button>
          )}
          <button
            onClick={() => (isLast ? onDismiss() : setStep((s) => s + 1))}
            className="flex-1 py-3 rounded-2xl text-sm font-semibold"
            style={{ background: '#01A99D', color: '#0F1210', fontFamily: 'Manrope' }}
          >
            {isLast ? doneLabel : 'Next'}
          </button>
        </div>

        <button
          onClick={onDismiss}
          disabled={isLast}
          aria-hidden={isLast}
          tabIndex={isLast ? -1 : 0}
          className="mt-4 text-xs"
          style={{ color: '#7C8883', fontFamily: 'Manrope', visibility: isLast ? 'hidden' : 'visible' }}
        >
          Skip
        </button>
      </div>
    </div>
  );
}

// ---- Accounts (UI prototype: everything is stored on this device and no email is actually sent) ----
const MAX_EMAILS = 3;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// "oge@yahoo.com" -> "o•••@yahoo.com", used as a hint on the sign-in screen.
const maskEmail = (address) => {
  const [name, domain] = address.split('@');
  return `${name.charAt(0)}•••@${domain}`;
};

const inputStyle = { background: 'rgba(245,243,238,0.04)', border: '1px solid rgba(245,243,238,0.1)', color: '#F5F3EE', fontFamily: 'Manrope' };

// Two steps: enter an email, then the 6-digit code "sent" to it. Calls onVerified with the lower-cased email.
// Limits on the 6-digit codes (a real backend would enforce these too).
const RESEND_WAIT_MS = 60 * 1000; // between codes to the same email
const CODE_LIFETIME_MS = 10 * 60 * 1000;
const MAX_CODE_TRIES = 5; // wrong guesses before a new code is needed

// Two steps: enter an email, then the 6-digit code "sent" to it. Calls onVerified with the lower-cased email.
// neutral: never says whether the email has an account (used for signing in), so nobody can use the
// form to find out who uses the app. canReceiveCode says whether a code would really arrive.
function EmailCodeForm({ heading, intro, validateEmail, onVerified, onCancel, neutral = false, canReceiveCode = () => true }) {
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeAddress, setCodeAddress] = useState(''); // where the current code went
  const [sentCode, setSentCode] = useState(null); // null when no code would arrive
  const [sentAt, setSentAt] = useState(0);
  const [wrongTries, setWrongTries] = useState(0);
  const [lastSent, setLastSent] = useState({}); // email -> when its last code was sent
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState('');

  const waitFor = (address, at) => Math.max(0, Math.ceil(((lastSent[address] || 0) + RESEND_WAIT_MS - at) / 1000));
  const resendWait = waitFor(codeAddress, now);
  const triesUsedUp = wrongTries >= MAX_CODE_TRIES;

  // Ticks the "Resend code (42s)" countdown.
  useEffect(() => {
    if (step !== 'code' || resendWait === 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [step, resendWait > 0]);

  const send = (address) => {
    const at = Date.now();
    setLastSent((prev) => ({ ...prev, [address]: at }));
    setNow(at);
    setSentCode(canReceiveCode(address) ? String(Math.floor(100000 + Math.random() * 900000)) : null);
    setSentAt(at);
    setWrongTries(0);
    setCode('');
    setCodeAddress(address);
    setError('');
    setStep('code');
  };

  const sendCode = () => {
    const address = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(address)) {
      setError('Enter a valid email address.');
      return;
    }
    const problem = validateEmail ? validateEmail(address) : null;
    if (problem) {
      setError(problem);
      return;
    }
    const wait = waitFor(address, Date.now());
    if (wait > 0) {
      if (address === codeAddress) {
        // Same email again within the wait: go back to its code rather than sending another.
        setError('');
        setStep('code');
      } else {
        setError(`Wait ${wait}s before requesting another code for this email.`);
      }
      return;
    }
    send(address);
  };

  const verify = () => {
    if (triesUsedUp) {
      setError('Too many wrong codes. Tap ‘Resend code’ to get a new one.');
      return;
    }
    if (sentCode && Date.now() - sentAt > CODE_LIFETIME_MS) {
      setError('That code has expired. Tap ‘Resend code’ to get a new one.');
      return;
    }
    if (!sentCode || code !== sentCode) {
      const tries = wrongTries + 1;
      setWrongTries(tries);
      setError(tries >= MAX_CODE_TRIES ? 'Too many wrong codes. Tap ‘Resend code’ to get a new one.' : 'That code isn’t right. Check it and try again.');
      return;
    }
    onVerified(codeAddress);
  };

  return (
    <div className="w-full">
      <p className="text-sm font-semibold mb-1" style={{ color: '#F5F3EE', fontFamily: 'Manrope' }}>
        {heading}
      </p>
      {step === 'email' ? (
        <>
          <p className="text-xs mb-3" style={{ color: '#7C8883', fontFamily: 'Manrope' }}>
            {intro}
          </p>
          <input
            type="email"
            autoFocus
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError('');
            }}
            onKeyDown={(e) => e.key === 'Enter' && sendCode()}
            enterKeyHint="send"
            autoComplete="email"
            placeholder="you@example.com"
            className="app-input w-full rounded-xl px-3 py-2.5 text-sm outline-none"
            style={inputStyle}
          />
        </>
      ) : (
        <>
          <p className="text-xs mb-2" style={{ color: '#7C8883', fontFamily: 'Manrope' }}>
            {neutral ? (
              <>
                If <span style={{ color: '#F5F3EE' }}>{codeAddress}</span> is linked to an account, we have sent a 6-digit code to it.
              </>
            ) : (
              <>
                Enter the 6-digit code that was sent to <span style={{ color: '#F5F3EE' }}>{codeAddress}</span>.
              </>
            )}
          </p>
          <p className="text-[11px] mb-3 rounded-lg px-2.5 py-1.5" style={{ color: '#01A99D', background: 'rgba(1,169,157,0.08)', fontFamily: 'Manrope' }}>
            {sentCode ? (
              <>
                Prototype: no email is sent. Your code is <span className="mono-num font-bold">{sentCode}</span>.
              </>
            ) : (
              'Prototype: this email isn’t linked to an account, so no code would arrive.'
            )}
          </p>
          <input
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onKeyDown={(e) => e.key === 'Enter' && verify()}
            inputMode="numeric"
            autoComplete="one-time-code"
            enterKeyHint="done"
            placeholder="000000"
            className="app-input w-full rounded-xl px-3 py-2.5 text-lg outline-none mono-num tracking-[0.4em] text-center"
            style={inputStyle}
          />
          <div className="flex justify-between mt-2">
            <button
              onClick={() => {
                setStep('email');
                setError('');
              }}
              className="text-[11px] underline underline-offset-2"
              style={{ color: '#7C8883', fontFamily: 'Manrope' }}
            >
              Use a different email
            </button>
            <button
              onClick={() => send(codeAddress)}
              disabled={resendWait > 0}
              className="text-[11px] underline underline-offset-2 disabled:no-underline"
              style={{ color: resendWait > 0 ? 'rgba(124,136,131,0.6)' : '#7C8883', fontFamily: 'Manrope' }}
            >
              {resendWait > 0 ? `Resend code (${resendWait}s)` : 'Resend code'}
            </button>
          </div>
        </>
      )}
      {error && (
        <p className="text-xs mt-2" style={{ color: '#F87171', fontFamily: 'Manrope' }}>
          {error}
        </p>
      )}
      <div className="flex gap-2.5 mt-4">
        {onCancel && (
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ background: 'rgba(245,243,238,0.06)', color: '#F5F3EE', fontFamily: 'Manrope' }}>
            Cancel
          </button>
        )}
        <button
          onClick={step === 'email' ? sendCode : verify}
          disabled={step === 'email' ? !email.trim() : code.length !== 6 || triesUsedUp}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40"
          style={{ background: '#01A99D', color: '#0F1210', fontFamily: 'Manrope' }}
        >
          {step === 'email' ? 'Send code' : 'Verify'}
        </button>
      </div>
    </div>
  );
}

function EmailCodeModal({ open, onCancel, ...formProps }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onCancel}>
      <div className="w-full max-w-xs rounded-2xl p-5" style={{ background: '#171C19', border: '1px solid rgba(245,243,238,0.1)' }} onClick={(e) => e.stopPropagation()}>
        <EmailCodeForm {...formProps} onCancel={onCancel} />
      </div>
    </div>
  );
}

// Shown instead of the real app whenever nobody is signed in: sign up (the default on a device with no
// accounts yet, right after the intro screens) or sign in.
function AuthScreen({ accounts, emailInUse, onSignIn, onCreateAccount, onOpenDemo, onViewIntro }) {
  const hasAccounts = accounts.length > 0;
  const [mode, setMode] = useState(hasAccounts ? 'signin' : 'signup');
  const linked = accounts.flatMap((a) => a.emails.map((e) => maskEmail(e.address)));

  // The demo is the low-commitment way in, so it gets a card of its own rather than a small link:
  // seeing the app with real-looking data is what convinces people to give their email.
  const otherLinks = (main, showIntroLink = false) => (
    <>
      <div className="flex items-center gap-2 mt-5 text-xs" style={{ fontFamily: 'Manrope' }}>
        {main}
        {showIntroLink && onViewIntro && (
          <>
            <span aria-hidden="true" style={{ color: '#7C8883' }}>·</span>
            <button onClick={onViewIntro} className="underline underline-offset-2" style={{ color: '#7C8883' }}>
              View the intro again
            </button>
          </>
        )}
      </div>
      {onOpenDemo && (
        <>
          <div className="w-full flex items-center gap-3 my-4" aria-hidden="true">
            <div className="flex-1 h-px" style={{ background: 'rgba(245,243,238,0.1)' }} />
            <span className="text-[11px]" style={{ color: '#7C8883', fontFamily: 'Manrope' }}>
              or
            </span>
            <div className="flex-1 h-px" style={{ background: 'rgba(245,243,238,0.1)' }} />
          </div>
          <button
            onClick={onOpenDemo}
            className="w-full flex items-center gap-3 p-3.5 rounded-2xl text-left transition-colors hover:bg-[rgba(1,169,157,0.14)]"
            style={{ background: 'rgba(1,169,157,0.08)', border: '1px solid rgba(1,169,157,0.35)', fontFamily: 'Manrope' }}
          >
            <span
              className="flex items-center justify-center rounded-full shrink-0"
              style={{ width: '40px', height: '40px', background: 'rgba(1,169,157,0.18)' }}
            >
              <Rocket size={18} color="#01A99D" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold" style={{ color: '#F5F3EE' }}>
                Try the demo first
              </span>
              <span className="block text-xs mt-0.5 leading-snug" style={{ color: '#7C8883' }}>
                Explore a demo version <strong>where an imaginary user has used the app for 3 years</strong>. No sign-up or email needed.
              </span>
            </span>
            <ChevronRight size={18} color="#01A99D" className="shrink-0" />
          </button>
        </>
      )}
    </>
  );

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: '#0F1210' }}>
      <div className="min-h-full flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-xs flex flex-col items-center">
        <p className="text-lg font-bold mb-6" style={{ color: '#F5F3EE', fontFamily: 'Manrope' }}>
          {mode === 'signin' ? 'Welcome back' : hasAccounts ? 'Start afresh' : 'Welcome'}
        </p>
        {mode === 'signin' ? (
          <>
            <EmailCodeForm
              key="signin"
              heading="Sign in"
              intro="Use any email that is linked to your account."
              neutral
              canReceiveCode={emailInUse}
              onVerified={onSignIn}
            />
            {hasAccounts && (
              <p className="w-full text-[11px] mt-3 text-center" style={{ color: '#7C8883', fontFamily: 'Manrope' }}>
                Linked: {linked.join(', ')}
              </p>
            )}
            {otherLinks(
              <button onClick={() => setMode('signup')} className="underline underline-offset-2" style={{ color: '#01A99D' }}>
                Create a new account
              </button>
            )}
          </>
        ) : (
          <>
            <EmailCodeForm
              key="signup"
              heading={hasAccounts ? 'Create a new account' : 'Create an account'}
              intro={
                hasAccounts
                  ? 'Start over with a different email and a new account. Your other accounts and their ledgers won’t be affected.'
                  : 'Enter your email. We will send a code to it.'
              }
              validateEmail={(address) => (emailInUse(address) ? 'That email is already linked to an account. Sign in with it instead.' : null)}
              onVerified={onCreateAccount}
              onCancel={hasAccounts ? () => setMode('signin') : undefined}
            />
            {otherLinks(
              <button onClick={() => setMode('signin')} className="underline underline-offset-2" style={{ color: '#01A99D' }}>
                Sign in instead
              </button>,
              true
            )}
          </>
        )}
      </div>
      </div>
    </div>
  );
}

// Copies text to the clipboard, falling back to the older copy command where the Clipboard API is unavailable.
const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch (err) {
      return false;
    }
  }
};

// The demo has no Settings screen; this explains what the real one offers instead.
function DemoSettingsModal({ open, onClose }) {
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef(null);
  useEffect(() => () => clearTimeout(copiedTimer.current), []);
  if (!open) return null;

  const copyEmail = async () => {
    if (!(await copyToClipboard(FEEDBACK_EMAIL))) return;
    setCopied(true);
    clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 2000);
  };

  const items = [
    <>
      Send feedback to the developer,{' '}
      <button onClick={copyEmail} className="underline underline-offset-2" style={{ color: '#01A99D' }}>
        {FEEDBACK_EMAIL}
      </button>
      <button
        onClick={copyEmail}
        aria-label={copied ? 'Email copied' : 'Copy email'}
        className="inline-flex align-middle ml-1 -mt-0.5"
      >
        {copied ? <Check size={12} color="#01A99D" strokeWidth={3} /> : <Copy size={12} color="#01A99D" />}
      </button>
      {copied && <span style={{ color: '#01A99D' }}> (copied)</span>}
    </>,
    `Sign up and link up to ${MAX_EMAILS} emails.`,
    'Rename or delete ledgers.',
    'Change your default currency.',
    'Revisit the introductory walkthrough or this demo.',
    'Download your ledgers as a spreadsheet (CSV) to analyse them in Excel, Google Sheets or an AI assistant.',
    'Sign out or delete your account.',
  ];

  return (
    // Above every toast, including the demo's "can't add entries" toast (z-index 95).
    <div className="fixed inset-0 flex items-center justify-center px-6" style={{ background: 'rgba(0,0,0,0.6)', zIndex: 100 }} onClick={onClose}>
      <div
        className="w-full max-w-xs rounded-2xl p-5"
        style={{ background: '#171C19', border: '1px solid rgba(245,243,238,0.1)', fontFamily: 'Manrope' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <p className="text-xs mb-2" style={{ color: '#01A99D' }}>
          This page is view-only in the demo. After you close this box, click ‘×’ at the top-right to exit Settings.
        </p>
        <p className="text-xs mb-2" style={{ color: '#F5F3EE' }}>
          In the real app’s Settings, you can:
        </p>
        <ul className="flex flex-col gap-1.5 mb-5 text-xs" style={{ color: '#7C8883', lineHeight: 1.45 }}>
          {items.map((item, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden="true" className="shrink-0 rounded-full" style={{ width: 4, height: 4, marginTop: 6.7, background: '#01A99D' }} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <button onClick={onClose} className="w-full py-2.5 rounded-xl text-sm font-medium" style={{ background: 'rgba(245,243,238,0.06)', color: '#F5F3EE' }}>
          Close
        </button>
      </div>
    </div>
  );
}

function SettingsScreen({
  onClose,
  loggers,
  editingLoggerId,
  loggerNameDraft,
  setLoggerNameDraft,
  renameError,
  onStartRename,
  onSaveRename,
  onRequestDeleteLedger,
  onSetLedgerType,
  onReplayWalkthrough,
  onOpenLedgerDownload,
  onOpenDemo,
  onRequestDeleteAccount,
  onOpenFeedback,
  demo,
  account,
  onAddEmail,
  onMakePrimary,
  onRequestRemoveEmail,
  onRequestSignOut,
  userCurrency,
  onChangeUserCurrency,
}) {
  const rowStyle = { background: 'rgba(245,243,238,0.04)', border: '1px solid rgba(245,243,238,0.1)', color: '#F5F3EE', fontFamily: 'Manrope' };
  return (
    <div className="fixed inset-0 z-40 flex justify-center" style={{ background: '#0A0C0B' }}>
      <div
        className="w-full max-w-sm flex flex-col"
        style={{ background: '#0F1210', minHeight: '100dvh', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <PerfEdge />
        <div className="px-5">
          <TopBar
            title="Settings"
            stepLabel="Account"
            left={
              <button onClick={onOpenFeedback} disabled={demo} aria-label="Send feedback" className="w-8 h-8 flex items-center justify-center rounded-full" style={{ background: 'rgba(245,243,238,0.06)' }}>
                <span style={{ fontSize: '16px', lineHeight: 1 }}>🌷</span>
              </button>
            }
            right={
              <button onClick={onClose} aria-label="Close settings" className="w-8 h-8 flex items-center justify-center rounded-full" style={{ background: 'rgba(245,243,238,0.06)' }}>
                <X size={16} color="#F5F3EE" />
              </button>
            }
          />
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-10">
          {/* In the demo, Settings is shown to look at only: a disabled fieldset turns off every control inside it. */}
          <fieldset disabled={demo} className="min-w-0 m-0 p-0 border-0">
          {/* Account */}
          <p className="text-xs uppercase tracking-[0.15em] mb-2 mt-3" style={{ color: '#7C8883', fontFamily: 'Manrope' }}>Account</p>
            <>
              <p className="text-[11.5px] mb-3" style={{ color: '#7C8883', fontFamily: 'Manrope' }}>
                In case you lose access to an email, you can link up to {MAX_EMAILS} emails (you can sign in with any of them).
              </p>
              <div className="flex flex-col gap-2 mb-8">
                {account.emails.map((e) => (
                  <div key={e.address} className="flex items-center gap-2 p-3 rounded-2xl" style={rowStyle}>
                    <span className="flex-1 min-w-0 text-sm truncate">{e.address}</span>
                    {e.primary ? (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full uppercase shrink-0" style={{ background: 'rgba(1,169,157,0.12)', color: '#01A99D' }}>
                        Primary
                      </span>
                    ) : (
                      <>
                        <button onClick={() => onMakePrimary(e.address)} className="text-[11px] underline underline-offset-2 shrink-0" style={{ color: '#7C8883' }}>
                          Make primary
                        </button>
                        <button onClick={() => onRequestRemoveEmail(e.address)} aria-label={`Remove ${e.address}`} className="shrink-0">
                          <Trash2 size={14} color="#7C8883" />
                        </button>
                      </>
                    )}
                  </div>
                ))}
                {account.emails.length < MAX_EMAILS && (
                  <button onClick={onAddEmail} className="w-full flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium" style={rowStyle}>
                    <Plus size={15} color="#7C8883" /> Add another email ({account.emails.length} of {MAX_EMAILS})
                  </button>
                )}
              </div>
            </>

          {/* Ledgers */}
          <p className="text-xs uppercase tracking-[0.15em] mb-2" style={{ color: '#7C8883', fontFamily: 'Manrope' }}>Ledgers</p>
          <div className="flex flex-col gap-2 mb-8">
            {loggers.map((l) => (
              <div key={l.id}>
                <div className="flex items-center gap-2 p-3 rounded-2xl" style={{ background: 'rgba(245,243,238,0.04)', border: '1px solid rgba(245,243,238,0.1)' }}>
                  {editingLoggerId === l.id ? (
                    <>
                      <input
                        value={loggerNameDraft}
                        onChange={(e) => setLoggerNameDraft(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && onSaveRename()}
                        autoFocus
                        className="flex-1 bg-transparent outline-none text-sm"
                        style={{ color: '#F5F3EE', fontFamily: 'Manrope' }}
                      />
                      <button onClick={onSaveRename} className="text-xs font-semibold px-2.5 py-1 -my-0.5 rounded-full" style={{ background: '#01A99D', color: '#0F1210' }}>
                        Save
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 min-w-0 truncate text-sm" style={{ color: '#F5F3EE', fontFamily: 'Manrope' }}>{l.name}</span>
                      {/* What the ledger tracks. Each option is the same size as the Save button. */}
                      <div
                        role="radiogroup"
                        aria-label={`What ${l.name} tracks`}
                        className="flex shrink-0 rounded-full -my-0.5"
                        style={{ background: 'rgba(245,243,238,0.06)' }}
                      >
                        {LEDGER_TYPES.map((t) => {
                          const on = (l.type || 'expenses') === t.id;
                          return (
                            <button
                              key={t.id}
                              role="radio"
                              aria-checked={on}
                              onClick={() => onSetLedgerType(l.id, t.id)}
                              className="text-xs font-semibold px-2.5 py-1 rounded-full"
                              style={{ background: on ? '#01A99D' : 'transparent', color: on ? '#0F1210' : '#7C8883', fontFamily: 'Manrope' }}
                            >
                              {t.label}
                            </button>
                          );
                        })}
                      </div>
                      <button onClick={() => onStartRename(l)} aria-label={`Rename ${l.name}`}>
                        <Pencil size={14} color="#7C8883" />
                      </button>
                      <button onClick={() => onRequestDeleteLedger(l.id)} aria-label={`Delete ${l.name}`}>
                        <Trash2 size={14} color="#7C8883" />
                      </button>
                    </>
                  )}
                </div>
                {editingLoggerId === l.id && renameError && (
                  <p className="text-xs mt-1.5 px-1" style={{ color: '#F87171', fontFamily: 'Manrope' }}>
                    {renameError}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Currency */}
          <p className="text-xs uppercase tracking-[0.15em] mb-2" style={{ color: '#7C8883', fontFamily: 'Manrope' }}>Default currency</p>
          <p className="text-[11.5px] mb-3" style={{ color: '#7C8883', fontFamily: 'Manrope' }}>
            New ledgers start with this currency. Existing ledgers keep the currency that you have set for each of them.
          </p>
          <button
            onClick={onChangeUserCurrency}
            className="w-full flex items-center gap-2 rounded-2xl px-4 py-3 mb-8 text-sm font-medium text-left"
            style={rowStyle}
          >
            <span className="flex-1 min-w-0 truncate">{currencyOf(userCurrency).name}</span>
            <span className="mono-num text-xs shrink-0" style={{ color: '#7C8883' }}>
              {userCurrency} · {currencyOf(userCurrency).symbol}
            </span>
            <ChevronRight size={15} color="#7C8883" className="shrink-0" />
          </button>

          {/* Tour */}
          <p className="text-xs uppercase tracking-[0.15em] mb-2" style={{ color: '#7C8883', fontFamily: 'Manrope' }}>Revisit the tour</p>
          <div className="flex flex-col gap-2 mb-8">
            <button
              onClick={onReplayWalkthrough}
              className="w-full flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium"
              style={{ background: 'rgba(245,243,238,0.04)', border: '1px solid rgba(245,243,238,0.1)', color: '#F5F3EE', fontFamily: 'Manrope' }}
            >
              <RotateCcw size={15} color="#7C8883" /> See the walkthrough again
            </button>
            {onOpenDemo && (
              <button
                onClick={onOpenDemo}
                className="w-full flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium"
                style={{ background: 'rgba(245,243,238,0.04)', border: '1px solid rgba(245,243,238,0.1)', color: '#F5F3EE', fontFamily: 'Manrope' }}
              >
                <Rocket size={15} color="#7C8883" /> View the demo
              </button>
            )}
          </div>

          {/* Data */}
          <p className="text-xs uppercase tracking-[0.15em] mb-2" style={{ color: '#7C8883', fontFamily: 'Manrope' }}>Your data</p>
          <p className="text-[11.5px] mb-3" style={{ color: '#7C8883', fontFamily: 'Manrope' }}>
            Download your ledgers as a spreadsheet (CSV) to analyse them in Excel, Google Sheets or an AI assistant.
          </p>
          <button
            onClick={onOpenLedgerDownload}
            className="w-full flex items-center gap-2 rounded-2xl px-4 py-3 mb-8 text-sm font-medium"
            style={{ background: 'rgba(245,243,238,0.04)', border: '1px solid rgba(245,243,238,0.1)', color: '#F5F3EE', fontFamily: 'Manrope' }}
          >
            <Download size={15} color="#7C8883" /> Download ledgers
          </button>

          {/* Danger zone */}
          <p className="text-xs uppercase tracking-[0.15em] mb-2" style={{ color: '#F87171', fontFamily: 'Manrope' }}>Danger zone</p>
          {account && (
            <button onClick={onRequestSignOut} className="w-full flex items-center justify-center gap-2 rounded-2xl px-4 py-3 mb-2 text-sm font-medium" style={rowStyle}>
              <LogOut size={15} color="#7C8883" /> Sign out
            </button>
          )}
          <button
            onClick={onRequestDeleteAccount}
            className="w-full flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold"
            style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', color: '#F87171', fontFamily: 'Manrope' }}
          >
            <AlertTriangle size={15} /> Delete account
          </button>
          </fieldset>
        </div>
      </div>
      {/* Demo: Settings stays dimmed to show it's look-only. Taps and scrolling pass through it. */}
      {demo && <div aria-hidden="true" className="fixed inset-0 pointer-events-none" style={{ background: 'rgba(0,0,0,0.4)' }} />}
    </div>
  );
}

function Chip({ label, active, onClick, onDoubleClick }) {
  return (
    <button
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className="px-4 py-2.5 rounded-full text-sm font-medium transition-all border"
      style={{
        fontFamily: 'Manrope',
        background: active ? '#01A99D' : 'rgba(245,243,238,0.04)',
        borderColor: active ? '#01A99D' : 'rgba(245,243,238,0.1)',
        color: active ? '#0F1210' : '#F5F3EE',
      }}
    >
      {label}
    </button>
  );
}

// ---- Toasts: one look for every message that pops up in the middle of the screen ----
// bullets: the lines, each shown with a teal dot. A line in `accent` is drawn in teal.
// onDismiss makes the toast tappable; withClose adds the ×. leaving plays the fade-out.
function Toast({ bullets, accent = [], onDismiss, withClose = false, leaving = false, zIndex = 95, label = 'Dismiss' }) {
  const Box = onDismiss ? 'button' : 'div';
  return (
    <div
      className={`fixed left-1/2 w-full max-w-xs px-4 tip-toast${leaving ? ' leaving' : ''}`}
      style={{ top: '50%', transform: 'translate(-50%, -50%)', zIndex }}
      role="status"
    >
      <Box
        {...(onDismiss ? { onClick: onDismiss, 'aria-label': label } : {})}
        className={`w-full rounded-2xl ${withClose ? 'pl-4 pr-9' : 'px-4'} py-3 text-[13px] text-left shadow-2xl relative block`}
        style={{ background: '#171C19', border: '1px solid rgba(1,169,157,0.4)', color: '#F5F3EE', fontFamily: 'Manrope', lineHeight: 1.45 }}
      >
        <ul className="flex flex-col gap-1.5">
          {bullets.map((s, i) => (
            <li key={i} className="flex gap-2" style={accent.includes(s) ? { color: '#01A99D' } : undefined}>
              <span aria-hidden="true" className="shrink-0 rounded-full" style={{ width: 4, height: 4, marginTop: 7.5, background: '#01A99D' }} />
              <span>{s}</span>
            </li>
          ))}
        </ul>
        {withClose && <X size={14} color="#7C8883" style={{ position: 'absolute', top: 12, right: 12 }} />}
      </Box>
    </div>
  );
}

// A toast that closes itself after `duration`, fading out the same way it faded in (0.25s).
// show(message) opens it, hide() fades it out now, clear() removes it instantly.
function useTimedToast(duration = 3500) {
  const [message, setMessage] = useState(null);
  const [leaving, setLeaving] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const hide = () => {
    clearTimeout(timer.current);
    setLeaving(true);
    timer.current = setTimeout(() => {
      setMessage(null);
      setLeaving(false);
    }, 250);
  };
  const show = (text) => {
    clearTimeout(timer.current);
    setMessage(text);
    setLeaving(false);
    timer.current = setTimeout(hide, duration);
  };
  const clear = () => {
    clearTimeout(timer.current);
    setMessage(null);
    setLeaving(false);
  };
  return { message, leaving, show, hide, clear };
}

function LedgerApp({ demo = false, onOpenDemo, onExitDemo, storage: accountStorage, accountApi }) {
  // In demo mode everything reads from / writes to a throwaway in-memory store, never the real data.
  // Otherwise the storage belongs to the signed-in account (see Ledgerly at the bottom).
  const demoStorageRef = useRef(null);
  if (demo && !demoStorageRef.current) demoStorageRef.current = makeMemoryStorage(buildDemoSeed());
  const storage = demo ? demoStorageRef.current : accountStorage || window.storage;
  // In the demo, seen tips live in its throwaway store, so every fresh demo shows its tips again.
  const tipsKey = 'ledgerly-seen-tips';

  const demoToast = useTimedToast(); // the demo's "can't add entries" notice

  const [loaded, setLoaded] = useState(false);
  const [screen, setScreen] = useState(1);
  const [items, setItems] = useState([]);
  const [entries, setEntries] = useState([]);

  const [loggers, setLoggers] = useState([{ id: 'default', name: 'Ledger 1' }]);
  const [activeLoggerId, setActiveLoggerId] = useState('default');
  const [showLoggerSwitcher, setShowLoggerSwitcher] = useState(false); // false | 'switch' | 'create' ('create' puts the cursor in the name box)
  const [newLoggerName, setNewLoggerName] = useState('');
  const [newLoggerError, setNewLoggerError] = useState('');

  const [defaultCurrency, setDefaultCurrency] = useState('NGN'); // the open ledger's default
  const [userCurrency, setUserCurrency] = useState(null); // chosen on first use; new ledgers start with it
  const [entryCurrency, setEntryCurrency] = useState('NGN');
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);

  const [query1, setQuery1] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [itemPendingDelete, setItemPendingDelete] = useState(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [nullifyEntryId, setNullifyEntryId] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);
  // When feedback goes to a form service (e.g. Formspree), show "sent" or "couldn't send" here.
  const feedbackToast = useTimedToast();
  const [totalsView, setTotalsView] = useState('daily'); // 'daily' | 'summary'
  const [searchOpen, setSearchOpen] = useState(false);
  // Long lists render in chunks (more rows load as you scroll) so big ledgers stay snappy.
  const [rowLimit, setRowLimit] = useState(60);
  const totalsScrollRef = useRef(null);
  const [dailyLimit, setDailyLimit] = useState(45);
  const [searchQuery, setSearchQuery] = useState('');
  const [feedbackText, setFeedbackText] = useState('');
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [scrollToMonth, setScrollToMonth] = useState(null);
  const monthRefs = useRef({});

  const [price, setPrice] = useState('');

  const [quantity, setQuantity] = useState('1');
  const [qtyIsDefault, setQtyIsDefault] = useState(true);

  const [lastEntryId, setLastEntryId] = useState(null);
  const [scrollToDay, setScrollToDay] = useState(null);
  const cursorRef = useRef(null);
  const dayRefs = useRef({});
  const logScrollRef = useRef(null);

  const loadLoggerData = async (id, fallbackCurrency = 'NGN') => {
    const fallback = fallbackCurrency;
    try {
      const res = await storage.get(`ledgerly-items-${id}`, false);
      if (res && res.value) {
        const parsed = JSON.parse(res.value);
        setItems(Array.isArray(parsed) ? parsed : []);
      } else {
        setItems([]);
      }
    } catch (e) {
      setItems([]);
    }

    try {
      const res2 = await storage.get(`ledgerly-entries-${id}`, false);
      if (res2 && res2.value) {
        const parsed2 = JSON.parse(res2.value);
        setEntries(Array.isArray(parsed2) ? parsed2 : []);
      } else {
        setEntries([]);
      }
    } catch (e) {
      setEntries([]);
    }

    try {
      const res3 = await storage.get(`ledgerly-currency-${id}`, false);
      const cur = res3 && res3.value ? res3.value : fallback;
      setDefaultCurrency(cur);
      setEntryCurrency(cur);
    } catch (e) {
      setDefaultCurrency(fallback);
      setEntryCurrency(fallback);
    }
  };

  useEffect(() => {
    (async () => {
      let seenWalkthrough = false;
      try {
        const resW = await storage.get('ledgerly-seen-walkthrough', false);
        seenWalkthrough = !!(resW && resW.value === 'true');
      } catch (e) {}
      if (!seenWalkthrough) {
        setShowWalkthrough(true);
      }

      let tipsSeen = null;
      try {
        const resT = await storage.get(tipsKey, false);
        if (resT && resT.value) tipsSeen = JSON.parse(resT.value);
      } catch (e) {}
      if (!Array.isArray(tipsSeen)) {
        // No record yet: brand-new users get every tip; people who used the app before tips existed get none.
        // Every demo session starts with no tips seen.
        tipsSeen = !demo && seenWalkthrough ? Object.keys(TIPS) : [];
        storage.set(tipsKey, JSON.stringify(tipsSeen), false).catch(() => {});
      }
      setSeenTips(tipsSeen);

      let loggersList = [{ id: 'default', name: 'Ledger 1' }];
      let activeId = 'default';

      try {
        const res = await storage.get('ledgerly-loggers', false);
        if (res && res.value) {
          const parsed = JSON.parse(res.value);
          if (Array.isArray(parsed) && parsed.length) loggersList = parsed;
        }
      } catch (e) {}

      try {
        const res2 = await storage.get('ledgerly-active-logger', false);
        activeId = res2 && res2.value && loggersList.some((l) => l.id === res2.value) ? res2.value : loggersList[0].id;
      } catch (e) {
        activeId = loggersList[0].id;
      }

      let savedUserCurrency = null;
      try {
        const resC = await storage.get('ledgerly-user-currency', false);
        if (resC && resC.value) savedUserCurrency = resC.value;
      } catch (e) {}
      setUserCurrency(savedUserCurrency);

      setLoggers(loggersList);
      setActiveLoggerId(activeId);
      await loadLoggerData(activeId, savedUserCurrency || 'NGN');
      setLoaded(true);
    })();
  }, []);

  const [isSwitchingLogger, setIsSwitchingLogger] = useState(false);

  // ---- App-level settings, walkthrough, data portability ----
  const [showSettings, setShowSettings] = useState(false);
  // Demo only: the "can't use Settings" pop-up shows each time Settings opens.
  const [demoSettingsNotice, setDemoSettingsNotice] = useState(false);
  useEffect(() => {
    if (demo) setDemoSettingsNotice(showSettings);
  }, [showSettings]);

  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [walkthroughStep, setWalkthroughStep] = useState(0);

  const [ledgerPendingDelete, setLedgerPendingDelete] = useState(null);
  const [editingLoggerId, setEditingLoggerId] = useState(null);
  const [loggerNameDraft, setLoggerNameDraft] = useState('');
  const [renameError, setRenameError] = useState('');

  const [showLedgerDownload, setShowLedgerDownload] = useState(false);
  const [downloadSelection, setDownloadSelection] = useState([]); // ids of ledgers ticked for download

  const [showDeleteAccount, setShowDeleteAccount] = useState(false);

  // ---- Account (prototype; real app only). The accounts themselves are managed by Ledgerly. ----
  const account = accountApi ? accountApi.account : null;
  const [emailFlow, setEmailFlow] = useState(null); // 'add' while adding an email, otherwise null
  const [emailPendingRemove, setEmailPendingRemove] = useState(null);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  const addEmail = (address) => {
    setEmailFlow(null);
    accountApi.addEmail(address);
  };

  const removeEmail = () => {
    accountApi.removeEmail(emailPendingRemove);
    setEmailPendingRemove(null);
  };

  const signOut = () => {
    setShowSignOutConfirm(false);
    accountApi.signOut(); // the sign-in screen replaces the app
  };

  // ---- First-time tips ----
  const [seenTips, setSeenTips] = useState(null); // null until loaded from storage
  const [activeTip, setActiveTip] = useState(null);

  const markTipsSeen = (list) => {
    setSeenTips(list);
    storage.set(tipsKey, JSON.stringify(list), false).catch(() => {});
  };

  // Shows a tip once ever; returns whether it was shown. The demo only shows its own subset.
  const showTip = (key) => {
    if (demo && !DEMO_TIPS.includes(key)) return false;
    if (!seenTips || seenTips.includes(key)) return false;
    setActiveTip(key);
    markTipsSeen([...seenTips, key]);
    return true;
  };

  // The first time someone reaches the price step, they pick their currency before anything else.
  // Only for people who haven't logged anything yet, and never in the demo. It's recorded with the tips.
  const [currencyPromptOpen, setCurrencyPromptOpen] = useState(false);
  const needsCurrencyPrompt = () => !demo && seenTips && !seenTips.includes('currencyPrompt') && entries.length === 0;
  const [showUserCurrencyPicker, setShowUserCurrencyPicker] = useState(false); // from Settings
  // The user's currency: new ledgers start with it. Choosing it in Settings also means they won't be asked later.
  const saveUserCurrency = (code) => {
    setUserCurrency(code);
    storage.set('ledgerly-user-currency', code, false).catch(() => {});
    if (seenTips && !seenTips.includes('currencyPrompt')) markTipsSeen([...seenTips, 'currencyPrompt']);
  };
  const closeCurrencyPrompt = (code) => {
    if (code) {
      saveUserCurrency(code);
      setDefaultCurrency(code); // and this ledger's default
      setEntryCurrency(code);
    }
    setCurrencyPromptOpen(false);
    showTip('price');
  };

  useEffect(() => {
    if (!loaded) return;
    // Leaving a screen closes its tip.
    setActiveTip((prev) => (prev && TIP_SCREEN[prev] === screen ? prev : null));
    if (showWalkthrough) return; // wait until the walkthrough is closed
    if (screen === 1) showTip('firstItem');
    else if (screen === 2) showTip('quantity');
    else if (screen === 3) {
      if (needsCurrencyPrompt()) {
        markTipsSeen([...seenTips, 'currencyPrompt']);
        setCurrencyPromptOpen(true); // the price tip follows once a currency is chosen
      } else showTip('price');
    } else if (screen === 4 && entries.length > 0) showTip('ledger');
    else if (screen === 5) showTip('totals');
  }, [screen, loaded, showWalkthrough]);

  useEffect(() => {
    if (!loaded) return;
    // Opening settings hides any screen tip (it would sit on top); closing it hides the settings tip.
    setActiveTip(null);
    if (showSettings) showTip('settings');
  }, [showSettings]);

  useEffect(() => {
    if (!loaded) return;
    storage.set('ledgerly-loggers', JSON.stringify(loggers), false).catch(() => {});
  }, [loggers, loaded]);

  useEffect(() => {
    if (!loaded) return;
    storage.set('ledgerly-active-logger', activeLoggerId, false).catch(() => {});
  }, [activeLoggerId, loaded]);

  useEffect(() => {
    if (!loaded || isSwitchingLogger) return;
    storage.set(`ledgerly-items-${activeLoggerId}`, JSON.stringify(items), false).catch(() => {});
  }, [items, loaded, activeLoggerId, isSwitchingLogger]);

  useEffect(() => {
    if (!loaded || isSwitchingLogger) return;
    storage.set(`ledgerly-entries-${activeLoggerId}`, JSON.stringify(entries), false).catch(() => {});
  }, [entries, loaded, activeLoggerId, isSwitchingLogger]);

  useEffect(() => {
    if (!loaded || isSwitchingLogger) return;
    storage.set(`ledgerly-currency-${activeLoggerId}`, defaultCurrency, false).catch(() => {});
  }, [defaultCurrency, loaded, activeLoggerId, isSwitchingLogger]);

  const switchLogger = async (id, fallbackCurrency = userCurrency || 'NGN') => {
    if (id === activeLoggerId) {
      setShowLoggerSwitcher(false);
      return;
    }
    setIsSwitchingLogger(true); // suppress the save effects below until the new logger's data has fully landed
    setActiveLoggerId(id);
    setScreen(1);
    setQuery1('');
    setSelectedItem(null);
    setPrice('');
    setQuantity('1');
    setQtyIsDefault(true);
    await loadLoggerData(id, fallbackCurrency);
    setIsSwitchingLogger(false);
    setShowLoggerSwitcher(false);
  };

  const createLogger = async () => {
    const name = newLoggerName.trim();
    if (!name) return;
    const clash = ledgerWithName(loggers, name);
    if (clash) {
      setNewLoggerError(`You already have a ledger called '${clash.name}'.`);
      return;
    }
    const id = 'logger-' + Date.now();
    // New ledgers start with the user's currency, or the open ledger's for people who never chose one.
    const seedCurrency = userCurrency || defaultCurrency;
    setLoggers((prev) => [...prev, { id, name }]);
    setNewLoggerName('');
    await switchLogger(id, seedCurrency);
  };

  // ---- Walkthrough ----
  const dismissWalkthrough = () => {
    setShowWalkthrough(false);
    setWalkthroughStep(0);
    storage.set('ledgerly-seen-walkthrough', 'true', false).catch(() => {});
  };

  const replayWalkthrough = () => {
    // Settings stays open underneath (the walkthrough covers it), so closing the walkthrough returns there.
    setWalkthroughStep(0);
    setShowWalkthrough(true);
  };

  // ---- Ledger rename / delete ----
  const startRenameLedger = (l) => {
    setEditingLoggerId(l.id);
    setLoggerNameDraft(l.name);
    setRenameError('');
  };

  const saveRenameLedger = () => {
    const name = loggerNameDraft.trim();
    if (!name || !editingLoggerId) {
      setEditingLoggerId(null);
      return;
    }
    const clash = ledgerWithName(loggers, name, editingLoggerId); // renaming to its own name is fine
    if (clash) {
      setRenameError(`You already have a ledger called '${clash.name}'.`);
      return;
    }
    setLoggers((prev) => prev.map((l) => (l.id === editingLoggerId ? { ...l, name } : l)));
    setEditingLoggerId(null);
  };

  const deleteLedgerKeys = async (id) => {
    try {
      await storage.delete(`ledgerly-items-${id}`, false);
    } catch (e) {}
    try {
      await storage.delete(`ledgerly-entries-${id}`, false);
    } catch (e) {}
    try {
      await storage.delete(`ledgerly-currency-${id}`, false);
    } catch (e) {}
  };

  const confirmDeleteLedger = async () => {
    const id = ledgerPendingDelete;
    if (!id) return;
    setLedgerPendingDelete(null);

    const remaining = loggers.filter((l) => l.id !== id);
    const finalRemaining = remaining.length ? remaining : [{ id: 'logger-' + Date.now(), name: 'Ledger 1' }];

    setLoggers(finalRemaining);
    await deleteLedgerKeys(id);

    if (id === activeLoggerId) {
      await switchLogger(finalRemaining[0].id);
    }
  };

  // ---- Delete account (wipes everything) ----
  const confirmDeleteAccount = async () => {
    for (const l of loggers) {
      await deleteLedgerKeys(l.id);
    }
    const keysToClear = [
      'ledgerly-loggers',
      'ledgerly-active-logger',
      'ledgerly-seen-walkthrough',
      'ledgerly-user-currency',
    ];
    for (const key of keysToClear) {
      try {
        await storage.delete(key, false);
      } catch (e) {}
    }

    const freshId = 'default';
    setLoggers([{ id: freshId, name: 'Ledger 1' }]);
    setActiveLoggerId(freshId);
    setItems([]);
    setEntries([]);
    setDefaultCurrency('NGN');
    setEntryCurrency('NGN');
    setUserCurrency(null);
    setShowDeleteAccount(false);
    setShowSettings(false);
    setScreen(1);
    setQuery1('');
    setSelectedItem(null);
    setPrice('');
    setQuantity('1');
    setQtyIsDefault(true);
    setActiveTip(null);
    markTipsSeen([]); // a fresh start gets the tips again
    // Forget the account too. The sign-in screen shows next, or the intro and sign-up if no accounts remain.
    if (account) accountApi.deleteActive();
  };

  // ---- Download one ledger as a CSV spreadsheet, for analysis in a spreadsheet app or an AI assistant ----
  const csvCell = (value) => {
    const text = String(value ?? '');
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  // One spreadsheet row per entry, oldest first (the usual order for analysis).
  const ledgerCsvRows = async (ledger) => {
    // The open ledger's entries are already in memory; any other ledger's are read from storage.
    let ledgerEntries = ledger.id === activeLoggerId ? entries : [];
    let ledgerCurrency = ledger.id === activeLoggerId ? defaultCurrency : 'NGN';
    if (ledger.id !== activeLoggerId) {
      try {
        const r = await storage.get(`ledgerly-entries-${ledger.id}`, false);
        if (r && r.value) ledgerEntries = JSON.parse(r.value);
      } catch (e) {}
      try {
        const r = await storage.get(`ledgerly-currency-${ledger.id}`, false);
        if (r && r.value) ledgerCurrency = r.value;
      } catch (e) {}
    }

    const pad = (n) => String(n).padStart(2, '0');
    return [...ledgerEntries]
      .sort((a, b) => a.id - b.id)
      .map((e) => {
        const d = new Date(e.id);
        const qty = parseFloat(e.quantity) || 0;
        const total = parseFloat(e.price) || 0;
        return [
          ledger.name,
          ledgerTypeLabel(ledger),
          `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
          `${pad(d.getHours())}:${pad(d.getMinutes())}`,
          e.name,
          qty,
          qty ? Math.round((total / qty) * 100) / 100 : '',
          total,
          e.currency || ledgerCurrency,
          e.nullified ? 'Yes' : 'No',
        ];
      });
  };

  // Several ledgers go into one file (with a Ledger column), since browsers often block a burst of separate downloads.
  const downloadLedgersCsv = async (ledgers) => {
    if (!ledgers.length) return;
    const header = ['Ledger', 'Type', 'Date', 'Time', 'Item', 'Quantity', 'Unit price', 'Total price', 'Currency', 'Nullified'];
    const rows = [];
    for (const ledger of ledgers) rows.push(...(await ledgerCsvRows(ledger)));
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');

    // The byte-order mark makes Excel read the file as UTF-8, so non-English item names survive.
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const fileBase =
      ledgers.length === 1 ? ledgers[0].name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'ledger' : 'ledgers';
    link.href = url;
    link.download = `${fileBase}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setShowLedgerDownload(false);
  };

  const resetFlow = () => {
    setScreen(1);
    setQuery1('');
    setSelectedItem(null);
    setPrice('');
    setQuantity('1');
    setQtyIsDefault(true);
    setEntryCurrency(defaultCurrency);
  };

  const confirmCancelEntry = () => {
    setQuery1('');
    setSelectedItem(null);
    setPrice('');
    setQuantity('1');
    setQtyIsDefault(true);
    setEntryCurrency(defaultCurrency);
    setShowCancelConfirm(false);
    setScreen(4);
  };

  // ---- Screen 1: item select ----
  const filteredItems = items.filter((i) => i.toLowerCase().includes(query1.trim().toLowerCase()));
  const exactMatch = items.some((i) => i.toLowerCase() === query1.trim().toLowerCase());
  const showAddChip = query1.trim().length > 0 && !exactMatch;

  const chooseItem = (name) => {
    setSelectedItem(name);
  };

  const deleteItem = (name) => {
    setItems((prev) => prev.filter((i) => i !== name));
    setSelectedItem((prev) => (prev === name ? null : prev));
    setItemPendingDelete(null);
  };

  const addNewItem = () => {
    const raw = query1.trim();
    if (!raw) return;
    const name = raw.charAt(0).toUpperCase() + raw.slice(1);
    setItems((prev) => [name, ...prev]);
    setSelectedItem(name);
    setQuery1('');
  };

  const showDemoNotice = () => {
    setSelectedItem(null);
    setQuery1('');
    setScreen(4);
    demoToast.show(DEMO_NOTICE);
  };

  // The standalone "can't add entries" toast is cancelled outright (not just hidden) when the ledger tip is
  // already showing that message, or when the person leaves the ledger. Otherwise it would pop up later,
  // e.g. right after the ledger tip is dismissed, or on the Totals screen.
  useEffect(() => {
    if (!demoToast.message) return;
    if (activeTip === 'ledger' || screen !== 4) demoToast.clear();
  }, [demoToast.message, activeTip, screen]);

  const confirmScreen1 = () => {
    if (!selectedItem) return;
    if (demo) {
      showDemoNotice();
      return;
    }
    setScreen(2);
  };

  // ---- Screen 2: quantity keypad ----
  const pressQtyKey = (k) => {
    if (k === 'back') {
      setQuantity((q) => q.slice(0, -1));
      setQtyIsDefault(false);
      return;
    }
    if (k === '.') {
      setQuantity((q) => {
        if (qtyIsDefault) return '0.';
        return q.includes('.') ? q : q === '' ? '0.' : q + '.';
      });
      setQtyIsDefault(false);
      return;
    }
    setQuantity((q) => {
      if (qtyIsDefault) return k; // replace the prefilled default of 1 on the very first press only
      if (q.length > 11) return q;
      return q + k;
    });
    setQtyIsDefault(false);
  };

  const qtyValid = quantity !== '' && parseFloat(quantity) > 0;

  const adjustQuantity = (delta) => {
    setQuantity((q) => {
      const current = parseFloat(q) || 0;
      const next = Math.max(0, Math.round((current + delta) * 100) / 100);
      return String(next);
    });
    setQtyIsDefault(false);
  };

  const confirmScreenQty = () => {
    if (!qtyValid) return;
    setScreen(3);
  };

  // ---- Screen 3: price keypad (submits the entry) ----
  const pressKey = (k) => {
    if (k === 'back') {
      setPrice((p) => p.slice(0, -1));
      return;
    }
    if (k === '.') {
      setPrice((p) => (p.includes('.') ? p : (p === '' ? '0.' : p + '.')));
      return;
    }
    setPrice((p) => {
      if (p.length > 11) return p;
      if (p === '0') return k;
      return p + k;
    });
  };

  const priceValid = price !== '' && price !== '.' && parseFloat(price) > 0;

  const confirmScreenPrice = () => {
    if (!priceValid) return;
    const entry = {
      id: Date.now(),
      name: selectedItem,
      quantity: parseFloat(quantity),
      price: parseFloat(price),
      currency: entryCurrency,
    };
    setEntries((prev) => [entry, ...prev]);
    setLastEntryId(entry.id);
    setEntryCurrency(defaultCurrency);
    setScreen(4);
  };

  const sendFeedback = () => {
    const text = feedbackText.trim();
    if (!text) return;
    const url = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent('Ledgerly feedback')}&body=${encodeURIComponent(text)}`;
    window.location.href = url;
    setShowFeedback(false);
    setFeedbackText('');
    // Placeholder until feedback goes through a form service: the mailto above only opens the email app,
    // so this can't actually confirm sending yet.
    feedbackToast.show('Thanks 🌷 Your feedback has been sent.');
  };

  const searchTerm = searchQuery.trim().toLowerCase();
  const isSearching = searchOpen && searchTerm !== '';
  const visibleEntries = useMemo(
    () => (isSearching ? entries.filter((e) => e.name.toLowerCase().includes(searchTerm)) : entries),
    [entries, isSearching, searchTerm]
  );

  // Rows for the ledger list, with each row's day key and whether it starts a new day.
  const entryRows = useMemo(
    () =>
      visibleEntries.map((e, i) => {
        const dayKey = new Date(e.id).toDateString();
        const prevDayKey = i > 0 ? new Date(visibleEntries[i - 1].id).toDateString() : null;
        return { e, dayKey, showDay: dayKey !== prevDayKey };
      }),
    [visibleEntries]
  );

  // Sum of matching (non-nullified) entries, per currency, default currency first.
  const searchSums = useMemo(() => {
    const sums = {};
    visibleEntries.forEach((e) => {
      if (e.nullified) return;
      const cur = e.currency || defaultCurrency;
      sums[cur] = (sums[cur] || 0) + (parseFloat(e.price) || 0);
    });
    return Object.entries(sums).sort(([a], [b]) => (a === defaultCurrency ? -1 : b === defaultCurrency ? 1 : 0));
  }, [visibleEntries, defaultCurrency]);

  useEffect(() => {
    setRowLimit(60);
  }, [searchTerm]);

  const loadMoreOnScroll = (ev, total, setLimit, step) => {
    const t = ev.currentTarget;
    if (t.scrollHeight - t.scrollTop - t.clientHeight < 400) setLimit((l) => (l < total ? l + step : l));
  };

  const toggleSearch = () => {
    setSearchOpen((o) => !o);
    setSearchQuery('');
  };

  const nullifyTarget = entries.find((e) => e.id === nullifyEntryId) || null;

  const toggleNullifyEntry = () => {
    setEntries((prev) => prev.map((e) => (e.id === nullifyEntryId ? { ...e, nullified: !e.nullified } : e)));
    setNullifyEntryId(null);
  };

  const dailyTotals = useMemo(() => {
    const map = new Map();
    entries.forEach((e) => {
      if (e.nullified) return; // nullified entries don't count toward any totals
      const d = new Date(e.id);
      const key = d.toDateString();
      const cur = e.currency || defaultCurrency;
      const amount = parseFloat(e.price) || 0;
      if (!map.has(key)) {
        map.set(key, { key, date: d, total: 0, count: 0, otherCurrencies: {} });
      }
      const bucket = map.get(key);
      bucket.count += 1; // every entry that day, regardless of currency
      if (cur === defaultCurrency) {
        bucket.total += amount;
      } else {
        if (!bucket.otherCurrencies[cur]) bucket.otherCurrencies[cur] = { total: 0, count: 0 };
        bucket.otherCurrencies[cur].total += amount;
        bucket.otherCurrencies[cur].count += 1;
      }
    });
    return Array.from(map.values()).sort((a, b) => b.date - a.date);
  }, [entries, defaultCurrency]);

  const availableMonths = useMemo(() => new Set(dailyTotals.map((d) => monthKeyOf(d.date))), [dailyTotals]);
  const monthlyTotals = useMemo(() => rollupOf(dailyTotals, (d) => monthKeyOf(d)), [dailyTotals]);
  const yearlyTotals = useMemo(() => rollupOf(dailyTotals, (d) => String(d.getFullYear())), [dailyTotals]);

  const backToTop = () => {
    const listRef = screen === 4 ? logScrollRef : totalsScrollRef;
    const list = listRef.current;
    if (list && list.scrollTo) list.scrollTo({ top: 0, behavior: 'smooth' });
    if (window.scrollTo) window.scrollTo({ top: 0, behavior: 'smooth' });
    const dialog = list && list.closest ? list.closest('[role="dialog"]') : null;
    if (dialog && dialog.scrollTo) dialog.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    if (screen !== 4 || !scrollToDay) return;
    const idx = entryRows.findIndex((r) => r.dayKey === scrollToDay);
    if (idx >= rowLimit) {
      setRowLimit(idx + 40); // make sure the target row exists before scrolling to it
      return;
    }
    if (dayRefs.current[scrollToDay]) {
      dayRefs.current[scrollToDay].scrollIntoView({ behavior: 'smooth', block: 'start' });
      setScrollToDay(null);
    }
  }, [screen, scrollToDay, entries, rowLimit, entryRows]);

  useEffect(() => {
    if (screen !== 5 || !scrollToMonth) return;
    if (totalsView === 'daily') {
      const idx = dailyTotals.findIndex((d) => monthKeyOf(d.date) === scrollToMonth);
      if (idx >= dailyLimit) {
        setDailyLimit(idx + 30);
        return;
      }
    }
    if (monthRefs.current[scrollToMonth]) {
      monthRefs.current[scrollToMonth].scrollIntoView({ behavior: 'smooth', block: 'start' });
      setScrollToMonth(null);
    }
  }, [screen, scrollToMonth, entries, totalsView, dailyLimit, dailyTotals]);

  const dayLabel = dayLabelOf;

  return (
    <div
      className="w-full flex justify-center"
      style={{ background: '#0A0C0B', minHeight: '100dvh', fontFamily: 'Manrope' }}
    >
      <div
        className="w-full max-w-sm flex flex-col"
        // Ledger and Totals screens are locked to the viewport so their lists scroll inside the dashed box.
        // The safe-area padding keeps content clear of the notch and home bar when opened from the home screen
        // (it's zero in a normal browser tab).
        style={{
          background: '#0F1210',
          minHeight: '100dvh',
          height: screen >= 4 ? '100dvh' : undefined,
          position: 'relative',
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <PerfEdge />

        {/* SCREEN 1 */}
        {screen === 1 && (
          <div className="flex-1 flex flex-col px-5 pb-32">
            <TopBar
              title="Select an item"
              step={1}
              left={
                <button
                  onClick={() => setShowSettings(true)}
                  aria-label="Settings"
                  className="w-8 h-8 flex items-center justify-center rounded-full"
                  style={{ background: 'rgba(245,243,238,0.06)' }}
                >
                  <Settings size={16} color="#F5F3EE" />
                </button>
              }
              right={
                <button
                  onClick={confirmCancelEntry}
                  aria-label="Go to the ledger"
                  className="w-8 h-8 flex items-center justify-center rounded-full"
                  style={{ background: 'rgba(245,243,238,0.06)' }}
                >
                  <NotebookText size={16} color="#F5F3EE" />
                </button>
              }
            />

            <div className="flex items-center gap-2" style={{ marginTop: 16, marginBottom: 16 }}>
              <button
                onClick={() => setShowLoggerSwitcher('switch')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
                style={{ fontFamily: 'Manrope', background: 'rgba(245,243,238,0.05)', color: '#F5F3EE', border: '1px solid rgba(245,243,238,0.1)' }}
              >
                <ArrowLeftRight size={12} color="#F5F3EE" />
                {loggers.find((l) => l.id === activeLoggerId)?.name || 'Ledger 1'}
              </button>
              <button
                onClick={() => setShowLoggerSwitcher('create')}
                aria-label="Create a ledger"
                className="w-[30px] h-[30px] flex items-center justify-center rounded-full"
                style={{ background: 'rgba(245,243,238,0.05)', border: '1px solid rgba(245,243,238,0.1)' }}
              >
                <Plus size={12} color="#F5F3EE" />
              </button>
            </div>

            <div
              className="flex items-center gap-2 rounded-2xl px-4 py-3"
              style={{ background: 'rgba(245,243,238,0.05)', border: '1px solid rgba(245,243,238,0.08)', marginBottom: 16 }}
            >
              <Search size={16} color="#F5F3EE" />
              <input
                value={query1}
                onChange={(e) => setQuery1(e.target.value)}
                onKeyDown={(e) => {
                  // Enter adds the typed item, or selects it if it already exists.
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  const q = query1.trim().toLowerCase();
                  if (!q) return;
                  const match = items.find((i) => i.toLowerCase() === q);
                  if (match) chooseItem(match);
                  else addNewItem();
                }}
                enterKeyHint="done"
                placeholder="Search items or add an item"
                className="item-search flex-1 bg-transparent outline-none text-sm"
                style={{ color: '#F5F3EE', fontFamily: 'Manrope' }}
              />
            </div>

            <div className="flex flex-wrap gap-2.5">
              {showAddChip && (
                <button
                  onClick={addNewItem}
                  className="px-4 py-2.5 rounded-full text-sm font-medium flex items-center gap-1.5 border"
                  style={{ borderColor: '#01A99D', color: '#01A99D', fontFamily: 'Manrope' }}
                >
                  <Plus size={14} /> Add "{query1.trim()}"
                </button>
              )}
              {filteredItems.map((name) => (
                <Chip
                  key={name}
                  label={name}
                  active={selectedItem === name}
                  onClick={() => chooseItem(name)}
                  onDoubleClick={() => setItemPendingDelete(name)}
                />
              ))}
              {filteredItems.length === 0 && !showAddChip && (
                <p className="text-sm" style={{ color: '#7C8883' }}>
                  No items yet. Type to add a new item.
                </p>
              )}
            </div>
          </div>
        )}

        {/* SCREEN 2 */}
        {screen === 2 && (
          <div className="flex-1 flex flex-col px-5 pb-28">
            <TopBar
              title={selectedItem}
              step={2}
              onBack={() => setScreen(1)}
              right={
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  aria-label="Cancel entry"
                  className="w-8 h-8 flex items-center justify-center rounded-full"
                  style={{ background: 'rgba(245,243,238,0.06)' }}
                >
                  <NotebookText size={16} color="#F5F3EE" />
                </button>
              }
            />

            <div className="flex-1 flex flex-col items-center justify-center mb-6">
              <span className="text-xs uppercase tracking-[0.2em]" style={{ color: '#7C8883' }}>
                Quantity
              </span>
              <div
                className="mono-num mt-2 text-5xl font-bold flex items-baseline gap-1"
                style={{ color: '#01A99D', minHeight: '3.5rem' }}
              >
                <span>{quantity}</span>
                <span className="inline-block w-0.5 h-9 ml-0.5 animate-pulse" style={{ background: '#01A99D' }} />
              </div>
              <div className="mt-4 h-7" aria-hidden="true" />
            </div>

            <div className="grid grid-cols-4 gap-2.5 mb-2">
              <KeyBtn label="7" onPress={() => pressQtyKey('7')} />
              <KeyBtn label="8" onPress={() => pressQtyKey('8')} />
              <KeyBtn label="9" onPress={() => pressQtyKey('9')} />
              <KeyBtn icon onPress={() => pressQtyKey('back')} muted>
                <Delete size={18} />
              </KeyBtn>

              <KeyBtn label="4" onPress={() => pressQtyKey('4')} />
              <KeyBtn label="5" onPress={() => pressQtyKey('5')} />
              <KeyBtn label="6" onPress={() => pressQtyKey('6')} />
              <KeyBtn label="00" onPress={() => pressQtyKey('00')} muted small />

              <KeyBtn label="1" onPress={() => pressQtyKey('1')} />
              <KeyBtn label="2" onPress={() => pressQtyKey('2')} />
              <KeyBtn label="3" onPress={() => pressQtyKey('3')} />
              <KeyBtn label="000" onPress={() => pressQtyKey('000')} muted small />

              <KeyBtn label="." onPress={() => pressQtyKey('.')} />
              <div className="col-span-3">
                <KeyBtn label="0" onPress={() => pressQtyKey('0')} full />
              </div>
            </div>
          </div>
        )}

        {/* SCREEN 3 */}
        {screen === 3 && (
          <div className="flex-1 flex flex-col px-5 pb-28">
            <TopBar
              title={selectedItem}
              step={3}
              onBack={() => setScreen(2)}
              right={
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  aria-label="Cancel entry"
                  className="w-8 h-8 flex items-center justify-center rounded-full"
                  style={{ background: 'rgba(245,243,238,0.06)' }}
                >
                  <NotebookText size={16} color="#F5F3EE" />
                </button>
              }
            />

            <div className="flex-1 flex flex-col items-center justify-center mb-6">
              <span className="text-xs uppercase tracking-[0.2em]" style={{ color: '#7C8883' }}>
                Total price
              </span>
              <div
                ref={cursorRef}
                className="mono-num mt-2 text-5xl font-bold flex items-baseline gap-1"
                style={{ color: '#01A99D', minHeight: '3.5rem' }}
              >
                <span style={{ fontSize: '2rem' }}>{currencyOf(entryCurrency).symbol}</span>
                <span>{price}</span>
                <span className="inline-block w-0.5 h-9 ml-0.5 animate-pulse" style={{ background: '#01A99D' }} />
              </div>

              {/* The "set as default" link hangs below this button out of flow, so it never shifts the layout. */}
              <div className="mt-4 relative">
                <button
                  onClick={() => setShowCurrencyPicker(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
                  style={{
                    fontFamily: 'Manrope',
                    background: entryCurrency !== defaultCurrency ? 'rgba(1,169,157,0.12)' : 'rgba(245,243,238,0.05)',
                    color: entryCurrency !== defaultCurrency ? '#01A99D' : '#7C8883',
                    border: `1px solid ${entryCurrency !== defaultCurrency ? 'rgba(1,169,157,0.3)' : 'rgba(245,243,238,0.1)'}`,
                  }}
                >
                  {entryCurrency} · {currencyOf(entryCurrency).symbol}
                  {entryCurrency !== defaultCurrency ? ' - not your default' : ' - change currency'}
                </button>
                {entryCurrency !== defaultCurrency && (
                  <button
                    onClick={() => setDefaultCurrency(entryCurrency)}
                    className="absolute left-1/2 -translate-x-1/2 top-full mt-2 whitespace-nowrap text-[11px] underline underline-offset-2"
                    style={{ fontFamily: 'Manrope', color: '#7C8883' }}
                  >
                    Set {entryCurrency} as this ledger's default
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2.5 mb-2">
              <KeyBtn label="7" onPress={() => pressKey('7')} />
              <KeyBtn label="8" onPress={() => pressKey('8')} />
              <KeyBtn label="9" onPress={() => pressKey('9')} />
              <KeyBtn icon onPress={() => pressKey('back')} muted>
                <Delete size={18} />
              </KeyBtn>

              <KeyBtn label="4" onPress={() => pressKey('4')} />
              <KeyBtn label="5" onPress={() => pressKey('5')} />
              <KeyBtn label="6" onPress={() => pressKey('6')} />
              <KeyBtn label="00" onPress={() => pressKey('00')} muted small />

              <KeyBtn label="1" onPress={() => pressKey('1')} />
              <KeyBtn label="2" onPress={() => pressKey('2')} />
              <KeyBtn label="3" onPress={() => pressKey('3')} />
              <KeyBtn label="000" onPress={() => pressKey('000')} muted small />

              <KeyBtn label="." onPress={() => pressKey('.')} />
              <div className="col-span-3">
                <KeyBtn label="0" onPress={() => pressKey('0')} full />
              </div>
            </div>
          </div>
        )}

        {/* SCREEN 4 */}
        {screen === 4 && (
          <div className="flex-1 min-h-0 flex flex-col px-5 pb-8">
            <TopBar
              title={loggers.find((l) => l.id === activeLoggerId)?.name || 'Ledger 1'}
              stepLabel="Ledger"
              left={
                <button
                  onClick={() => setShowSettings(true)}
                  aria-label="Settings"
                  className="w-8 h-8 flex items-center justify-center rounded-full"
                  style={{ background: 'rgba(245,243,238,0.06)' }}
                >
                  <Settings size={16} color="#F5F3EE" />
                </button>
              }
              right={
                <button
                  onClick={toggleSearch}
                  aria-label={searchOpen ? 'Close search' : 'Search entries'}
                  className="w-8 h-8 flex items-center justify-center rounded-full"
                  style={{ background: searchOpen ? 'rgba(1,169,157,0.18)' : 'rgba(245,243,238,0.06)' }}
                >
                  {searchOpen ? <X size={16} color="#01A99D" /> : <Search size={16} color="#F5F3EE" />}
                </button>
              }
            />

            {searchOpen && (
              <div className="mt-2 mb-3">
                <div
                  className="flex items-center gap-2 rounded-2xl px-4 py-3"
                  style={{ background: 'rgba(245,243,238,0.05)', border: '1px solid rgba(245,243,238,0.08)' }}
                >
                  <Search size={16} color="#F5F3EE" />
                  <input
                    autoFocus
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search entries"
                    className="item-search flex-1 bg-transparent outline-none text-sm"
                    style={{ color: '#F5F3EE', fontFamily: 'Manrope' }}
                  />
                </div>
                {isSearching && (
                  <p className="text-xs mt-2 px-1 flex flex-wrap gap-x-1.5" style={{ color: '#7C8883', fontFamily: 'Manrope' }}>
                    <span>
                      {visibleEntries.length} {visibleEntries.length === 1 ? 'match' : 'matches'}
                    </span>
                    {searchSums.map(([code, total]) => (
                      <span key={code} className="mono-num" style={{ color: '#01A99D' }}>
                        {currencyOf(code).symbol}
                        {fmt(total)}
                      </span>
                    ))}
                  </p>
                )}
              </div>
            )}

            <div className={`${searchOpen ? '' : 'mt-2 '}mb-5 flex gap-2.5`}>
              <button
                onClick={resetFlow}
                className="flex-1 py-3 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2"
                style={{ background: '#01A99D', color: '#0F1210', fontFamily: 'Manrope' }}
              >
                <ChevronLeft size={16} strokeWidth={3} /> New Entry
              </button>
              <button
                onClick={() => setScreen(5)}
                className="flex-1 py-3 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 border"
                style={{ borderColor: 'rgba(245,243,238,0.15)', color: '#F5F3EE', fontFamily: 'Manrope' }}
              >
                <Calendar size={16} strokeWidth={2.5} /> View Totals
              </button>
            </div>

            <div
              className="flex-1 min-h-0 flex flex-col rounded-2xl overflow-hidden"
              style={{ background: 'rgba(245,243,238,0.03)', border: '1px dashed rgba(245,243,238,0.15)' }}
            >
              <div className="px-4 py-3 flex text-[11px] uppercase tracking-[0.15em]" style={{ color: '#7C8883', borderBottom: '1px dashed rgba(245,243,238,0.1)' }}>
                <span className="flex-1">Item</span>
                <span className="w-16 text-center">Qty</span>
                <span className="w-24 text-right">Price</span>
              </div>

              {entries.length === 0 && (
                <p className="px-4 py-8 text-sm text-center" style={{ color: '#7C8883' }}>
                  Nothing logged yet.
                </p>
              )}

              {entries.length > 0 && visibleEntries.length === 0 && (
                <p className="px-4 py-8 text-sm text-center" style={{ color: '#7C8883' }}>
                  No entries match.
                </p>
              )}

              <div
                ref={logScrollRef}
                className="flex-1 min-h-0 overflow-y-auto"
                onScroll={(ev) => loadMoreOnScroll(ev, entryRows.length, setRowLimit, 60)}
              >
                {entryRows.slice(0, rowLimit).map((r) => (
                  <EntryRow
                    key={r.e.id}
                    e={r.e}
                    dayKey={r.dayKey}
                    showDay={r.showDay}
                    defaultCurrency={defaultCurrency}
                    dayRefs={dayRefs}
                    onNullify={setNullifyEntryId}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* SCREEN 5 */}
        {screen === 5 && (
          <div className="flex-1 min-h-0 flex flex-col px-5 pb-8">
            <TopBar
              title={totalsView === 'daily' ? 'Daily Totals' : 'Monthly & Yearly Totals'}
              stepLabel="Totals"
              onBack={() => setScreen(4)}
              right={
                <button
                  onClick={() => setShowMonthPicker(true)}
                  aria-label="Jump to month"
                  className="w-8 h-8 flex items-center justify-center rounded-full"
                  style={{ background: 'rgba(245,243,238,0.06)' }}
                >
                  <CalendarSearch size={16} color="#F5F3EE" />
                </button>
              }
            />

            <div className="mt-2 mb-5 flex gap-2.5">
              <button
                onClick={() => setTotalsView('daily')}
                className={`flex-1 py-3 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 ${totalsView === 'daily' ? '' : 'border'}`}
                style={totalsView === 'daily' ? { background: '#01A99D', color: '#0F1210', fontFamily: 'Manrope' } : { borderColor: 'rgba(245,243,238,0.15)', color: '#F5F3EE', fontFamily: 'Manrope' }}
              >
                <CalendarDays size={16} strokeWidth={2.5} /> Daily
              </button>
              <button
                onClick={() => setTotalsView('summary')}
                className={`flex-1 py-3 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 ${totalsView === 'summary' ? '' : 'border'}`}
                style={totalsView === 'summary' ? { background: '#01A99D', color: '#0F1210', fontFamily: 'Manrope' } : { borderColor: 'rgba(245,243,238,0.15)', color: '#F5F3EE', fontFamily: 'Manrope' }}
              >
                <CalendarRange size={16} strokeWidth={2.5} /> Monthly &amp; Yearly
              </button>
            </div>

            <div
              className="flex-1 min-h-0 flex flex-col rounded-2xl overflow-hidden"
              style={{ background: 'rgba(245,243,238,0.03)', border: '1px dashed rgba(245,243,238,0.15)' }}
            >
              {dailyTotals.length === 0 && (
                <p className="px-4 py-8 text-sm text-center" style={{ color: '#7C8883' }}>
                  Nothing logged yet.
                </p>
              )}

              {totalsView === 'summary' && (
                <div ref={totalsScrollRef} className="flex-1 min-h-0 overflow-y-auto">
                  {yearlyTotals.map((y) => (
                    <div key={y.key}>
                      <div className="px-4 py-2 flex items-center justify-between" style={{ background: 'rgba(1,169,157,0.08)' }}>
                        <span className="text-[11px] uppercase tracking-[0.15em] font-semibold" style={{ color: '#01A99D' }}>
                          {y.key}
                        </span>
                        <div className="flex flex-col items-end">
                          <span className="mono-num text-sm font-bold" style={{ color: '#01A99D' }}>
                            {currencyOf(defaultCurrency).symbol}
                            {fmt(y.total)}
                          </span>
                          {Object.entries(y.otherCurrencies).map(([code, o]) => (
                            <span key={code} className="mono-num text-xs font-semibold" style={{ color: '#01A99D' }}>
                              {currencyOf(code).symbol}
                              {fmt(o.total)}
                            </span>
                          ))}
                        </div>
                      </div>
                      {monthlyTotals
                        .filter((m) => m.key.startsWith(y.key + '-'))
                        .map((m) => (
                          <div
                            key={m.key}
                            ref={(el) => {
                              monthRefs.current[m.key] = el;
                            }}
                            className="px-4 py-4"
                            style={{ borderBottom: '1px dashed rgba(245,243,238,0.08)' }}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex flex-col">
                                <span className="text-sm font-semibold" style={{ color: '#F5F3EE', fontFamily: 'Manrope' }}>
                                  {MONTH_FMT.format(m.date)}
                                </span>
                                <button
                                  onClick={() => {
                                    const first = entries.find((en) => monthKeyOf(new Date(en.id)) === m.key);
                                    if (first) setScrollToDay(new Date(first.id).toDateString());
                                    setScreen(4);
                                  }}
                                  className="text-xs text-left underline underline-offset-2"
                                  style={{ color: '#7C8883' }}
                                >
                                  {m.count} {m.count === 1 ? 'entry' : 'entries'}
                                </button>
                              </div>
                              <span className="mono-num text-lg font-bold" style={{ color: '#01A99D' }}>
                                {currencyOf(defaultCurrency).symbol}
                                {fmt(m.total)}
                              </span>
                            </div>
                            {Object.keys(m.otherCurrencies).length > 0 && (
                              <div className="flex flex-col items-end mt-1">
                                {Object.entries(m.otherCurrencies).map(([code, o]) => (
                                  <span key={code} className="mono-num text-sm font-semibold" style={{ color: '#01A99D' }}>
                                    {currencyOf(code).symbol}
                                    {fmt(o.total)}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  ))}
                </div>
              )}

              {totalsView === 'daily' && (
              <div
                ref={totalsScrollRef}
                className="flex-1 min-h-0 overflow-y-auto"
                onScroll={(ev) => loadMoreOnScroll(ev, dailyTotals.length, setDailyLimit, 45)}
              >
                {dailyTotals.slice(0, dailyLimit).map((d, i) => {
                  const monthKey = monthKeyOf(d.date);
                  const prevMonthKey = i > 0 ? monthKeyOf(dailyTotals[i - 1].date) : null;
                  const isNewMonth = monthKey !== prevMonthKey;
                  return (
                    <div key={d.key}>
                      {isNewMonth && (
                        <div
                          ref={(el) => {
                            monthRefs.current[monthKey] = el;
                          }}
                          className="px-4 py-1 text-[10px] uppercase tracking-[0.15em] font-semibold"
                          style={{ background: 'rgba(1,169,157,0.08)', color: '#01A99D' }}
                        >
                          {monthLabelOf(d.date)}
                        </div>
                      )}
                      <div
                        className="px-4 py-4"
                        style={{ borderBottom: '1px dashed rgba(245,243,238,0.08)' }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex flex-col">
                            <span className="text-sm font-semibold" style={{ color: '#F5F3EE', fontFamily: 'Manrope' }}>
                              {dayLabel(d.date)}
                            </span>
                            <button
                              onClick={() => {
                                setScrollToDay(d.key);
                                setScreen(4);
                              }}
                              className="text-xs text-left underline underline-offset-2"
                              style={{ color: '#7C8883' }}
                            >
                              {d.count} {d.count === 1 ? 'entry' : 'entries'}
                            </button>
                          </div>
                          <span className="mono-num text-lg font-bold" style={{ color: '#01A99D' }}>
                            {currencyOf(defaultCurrency).symbol}
                            {fmt(d.total)}
                          </span>
                        </div>

                        {Object.keys(d.otherCurrencies).length > 0 && (
                          <div className="flex flex-col items-end mt-1">
                            {Object.entries(d.otherCurrencies).map(([code, o]) => (
                              <span key={code} className="mono-num text-sm font-semibold" style={{ color: '#01A99D' }}>
                                {currencyOf(code).symbol}
                                {fmt(o.total)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              )}
            </div>
          </div>
        )}

        {screen === 1 && <ConfirmCircle show={!!selectedItem} onClick={confirmScreen1} label="Confirm item" raised={demo} />}
        {screen === 2 && (
          <ConfirmCircle
            show={qtyValid}
            onClick={confirmScreenQty}
            label="Confirm quantity"
            raised={demo}
            onDecrement={() => adjustQuantity(-1)}
            onIncrement={() => adjustQuantity(1)}
          />
        )}
        {screen === 3 && <ConfirmCircle show={priceValid} onClick={confirmScreenPrice} label="Confirm price" raised={demo} />}

        <CurrencyPicker
          open={showCurrencyPicker}
          value={entryCurrency}
          onCancel={() => setShowCurrencyPicker(false)}
          onSelect={(code) => {
            setEntryCurrency(code);
            setShowCurrencyPicker(false);
          }}
        />

        <CurrencyPicker
          open={currencyPromptOpen}
          value={defaultCurrency}
          title="Choose your currency"
          intro="It will be the default for this ledger and any new ledgers. If you want to change the default currency later, you can do so in Settings."
          onCancel={() => closeCurrencyPrompt(null)}
          onSelect={closeCurrencyPrompt}
        />

        <LoggerSwitcher
          open={!!showLoggerSwitcher}
          focusNewName={showLoggerSwitcher === 'create'}
          loggers={loggers}
          activeLoggerId={activeLoggerId}
          onSelect={switchLogger}
          onCreate={createLogger}
          newName={newLoggerName}
          setNewName={(value) => {
            setNewLoggerName(value);
            setNewLoggerError('');
          }}
          error={newLoggerError}
          onCancel={() => {
            setShowLoggerSwitcher(false);
            setNewLoggerError('');
          }}
        />

        <MonthYearPicker
          open={showMonthPicker}
          availableMonths={availableMonths}
          onCancel={() => setShowMonthPicker(false)}
          onSelect={(monthKey) => {
            setScrollToMonth(monthKey);
            setShowMonthPicker(false);
          }}
        />

        {showFeedback && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-6" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setShowFeedback(false)}>
            <div className="w-full max-w-xs rounded-2xl p-5" style={{ background: '#171C19', border: '1px solid rgba(245,243,238,0.1)' }} onClick={(ev) => ev.stopPropagation()}>
              <p className="text-sm font-semibold mb-1" style={{ color: '#F5F3EE', fontFamily: 'Manrope' }}>
                Send feedback
              </p>
              <p className="text-xs mb-3" style={{ color: '#7C8883', fontFamily: 'Manrope' }}>
                Tell us what’s working, what isn’t, or what you’d like to see. (You can also send a direct email to oge.o.onuora@gmail.com with your feedback - that’s the creator’s email.)
              </p>
              <textarea
                value={feedbackText}
                onChange={(ev) => setFeedbackText(ev.target.value)}
                placeholder="Your feedback"
                className="feedback-input w-full h-32 rounded-xl px-3 py-2.5 text-sm outline-none mb-3"
                style={{ background: 'rgba(245,243,238,0.04)', border: '1px solid rgba(245,243,238,0.1)', color: '#F5F3EE', fontFamily: 'Manrope', resize: 'none' }}
              />
              <div className="flex gap-2.5">
                <button onClick={() => setShowFeedback(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ background: 'rgba(245,243,238,0.06)', color: '#F5F3EE', fontFamily: 'Manrope' }}>
                  Cancel
                </button>
                <button
                  onClick={sendFeedback}
                  disabled={!feedbackText.trim()}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                  style={{ background: '#01A99D', color: '#0F1210', fontFamily: 'Manrope', opacity: feedbackText.trim() ? 1 : 0.4 }}
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        )}

        <ConfirmModal
          open={!!nullifyTarget}
          title={nullifyTarget && nullifyTarget.nullified ? `Restore '${nullifyTarget.name}'?` : `Nullify '${nullifyTarget ? nullifyTarget.name : ''}'?`}
          message={
            nullifyTarget && nullifyTarget.nullified
              ? 'It will be counted in totals again.'
              : 'It will stay in the ledger list, but will not be counted in totals. You can restore it any time.'
          }
          confirmLabel={nullifyTarget && nullifyTarget.nullified ? 'Restore' : 'Nullify'}
          onCancel={() => setNullifyEntryId(null)}
          onConfirm={toggleNullifyEntry}
        />

        <ConfirmModal
          open={!!itemPendingDelete}
          title={`Remove '${itemPendingDelete}'?`}
          message={`It won't show up as a suggestion anymore. Past entries that include '${itemPendingDelete}' will not be deleted.`}
          confirmLabel="Remove"
          onCancel={() => setItemPendingDelete(null)}
          onConfirm={() => deleteItem(itemPendingDelete)}
        />

        <ConfirmModal
          open={showCancelConfirm}
          title="Skip to the ledger?"
          message="Your current entry will be cancelled."
          confirmLabel="Yes, skip"
          cancelLabel="Continue entry"
          onCancel={() => setShowCancelConfirm(false)}
          onConfirm={confirmCancelEntry}
        />

        {/* In the demo, Settings opens to look at, with this explanation on top. Closing it leaves Settings open. */}
        <DemoSettingsModal open={demo && showSettings && demoSettingsNotice} onClose={() => setDemoSettingsNotice(false)} />

        {showSettings && (
          <SettingsScreen
            onClose={() => setShowSettings(false)}
            loggers={loggers}
            editingLoggerId={editingLoggerId}
            loggerNameDraft={loggerNameDraft}
            setLoggerNameDraft={(value) => {
              setLoggerNameDraft(value);
              setRenameError('');
            }}
            renameError={renameError}
            onStartRename={startRenameLedger}
            onSaveRename={saveRenameLedger}
            onRequestDeleteLedger={(id) => setLedgerPendingDelete(id)}
            onSetLedgerType={(id, type) => setLoggers((prev) => prev.map((l) => (l.id === id ? { ...l, type } : l)))}
            onReplayWalkthrough={replayWalkthrough}
            onOpenDemo={demo ? () => {} : onOpenDemo /* shown but disabled in the demo */}
            onOpenLedgerDownload={() => {
              setDownloadSelection([]); // start with nothing ticked each time
              setShowLedgerDownload(true);
            }}
            onRequestDeleteAccount={() => setShowDeleteAccount(true)}
            onOpenFeedback={() => setShowFeedback(true)}
            demo={demo}
            account={demo ? DEMO_ACCOUNT : account}
            onAddEmail={() => setEmailFlow('add')}
            onMakePrimary={(address) => accountApi.makePrimary(address)}
            onRequestRemoveEmail={(address) => setEmailPendingRemove(address)}
            onRequestSignOut={() => setShowSignOutConfirm(true)}
            userCurrency={userCurrency || defaultCurrency}
            onChangeUserCurrency={() => setShowUserCurrencyPicker(true)}
          />
        )}

        <CurrencyPicker
          open={showUserCurrencyPicker}
          value={userCurrency || defaultCurrency}
          title="Default currency"
          intro="New ledgers will start with it. Existing ledgers keep the currency that you have set for each of them."
          onCancel={() => setShowUserCurrencyPicker(false)}
          onSelect={(code) => {
            saveUserCurrency(code);
            setShowUserCurrencyPicker(false);
          }}
        />

        {!demo && (
          <button
            onClick={onOpenDemo}
            className="absolute text-[11px] underline underline-offset-2"
            style={{ bottom: 'calc(8px + env(safe-area-inset-bottom))', left: '50%', transform: 'translateX(-50%)', color: 'rgba(124,136,131,0.55)', fontFamily: 'Manrope', zIndex: 10 }}
          >
            Demo
          </button>
        )}

        {demo && (
          <>
            <button
              onClick={onExitDemo}
              className="fixed text-xs font-semibold underline underline-offset-2 px-3 py-1 rounded-full"
              style={{
                bottom: 'calc(3px + env(safe-area-inset-bottom))',
                left: '50%',
                transform: 'translateX(-50%)',
                color: '#01A99D',
                background: 'rgba(15,18,16,0.9)',
                border: '1px solid rgba(1,169,157,0.3)',
                fontFamily: 'Manrope',
                zIndex: 90,
              }}
            >
              Exit Demo
            </button>
            {demoToast.message && activeTip !== 'ledger' && (
              <Toast bullets={[demoToast.message]} accent={[DEMO_NOTICE]} leaving={demoToast.leaving} />
            )}
          </>
        )}

        {feedbackToast.message && (
          <Toast bullets={[feedbackToast.message]} onDismiss={feedbackToast.hide} leaving={feedbackToast.leaving} />
        )}

        {(screen === 4 || screen === 5) && !showSettings && (
          <button
            onClick={backToTop}
            className="fixed flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold shadow-xl"
            style={{
              bottom: 'calc(16px + env(safe-area-inset-bottom))',
              // Bottom-right of the app column (max-w-sm = 384px), or of the screen on phones.
              right: 'max(16px, calc(50% - 176px))',
              background: '#171C19',
              border: '1px solid rgba(245,243,238,0.15)',
              color: '#F5F3EE',
              fontFamily: 'Manrope',
              zIndex: 40,
            }}
          >
            <ArrowUp size={14} color="#01A99D" strokeWidth={3} /> Back to top
          </button>
        )}

        {activeTip && !(demo && demoToast.message && activeTip !== 'ledger') && (
          <Toast
            bullets={demo && activeTip === 'ledger' ? [...TIPS.ledger, DEMO_NOTICE] : TIPS[activeTip]}
            accent={[DEMO_NOTICE]}
            onDismiss={() => setActiveTip(null)}
            withClose
            label="Dismiss tip"
            zIndex={45}
          />
        )}

        <Walkthrough
          open={showWalkthrough}
          step={walkthroughStep}
          setStep={setWalkthroughStep}
          onDismiss={dismissWalkthrough}
        />

        <EmailCodeModal
          key={emailFlow || 'none'}
          open={!!emailFlow}
          heading="Add another email"
          intro="Link another email that you can sign in with if you lose access to the other ones."
          validateEmail={(address) => (accountApi && accountApi.emailInUse(address) ? 'That email is already linked to an account.' : null)}
          onVerified={addEmail}
          onCancel={() => setEmailFlow(null)}
        />

        <ConfirmModal
          open={!!emailPendingRemove}
          title={`Remove ${emailPendingRemove || ''}?`}
          message="If you do, you won’t be able to sign in with this email anymore (unless you link it again later)."
          confirmLabel="Remove"
          onCancel={() => setEmailPendingRemove(null)}
          onConfirm={removeEmail}
        />

        <ConfirmModal
          open={showSignOutConfirm}
          title="Sign out?"
          message="Signing out will not delete your ledgers. Sign in again with any linked email to get back to them."
          confirmLabel="Sign out"
          onCancel={() => setShowSignOutConfirm(false)}
          onConfirm={signOut}
        />

        <ConfirmModal
          open={!!ledgerPendingDelete}
          title={`Delete '${loggers.find((l) => l.id === ledgerPendingDelete)?.name || ''}'?`}
          message="This deletes all its items and entries. This cannot be undone."
          confirmLabel="Delete"
          onCancel={() => setLedgerPendingDelete(null)}
          onConfirm={confirmDeleteLedger}
        />

        <ConfirmModal
          open={showDeleteAccount}
          title="Delete your account?"
          message="This permanently deletes every ledger, everything in them and your linked emails. Consider downloading your ledgers first."
          confirmLabel="Delete everything"
          onCancel={() => setShowDeleteAccount(false)}
          onConfirm={confirmDeleteAccount}
        />

        {showLedgerDownload && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-6" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setShowLedgerDownload(false)}>
            <div className="w-full max-w-xs rounded-2xl p-5" style={{ background: '#171C19', border: '1px solid rgba(245,243,238,0.1)' }} onClick={(e) => e.stopPropagation()}>
              <p className="text-sm font-semibold mb-1" style={{ color: '#F5F3EE', fontFamily: 'Manrope' }}>Download ledgers</p>
              <p className="text-xs mb-3" style={{ color: '#7C8883', fontFamily: 'Manrope' }}>
                Choose one or more ledgers. Their entries download together as one spreadsheet.
              </p>
              {(() => {
                const allSelected = loggers.length > 0 && loggers.every((l) => downloadSelection.includes(l.id));
                const box = (on) => (
                  <span
                    aria-hidden="true"
                    className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                    style={{ background: on ? '#01A99D' : 'transparent', border: `1.5px solid ${on ? '#01A99D' : 'rgba(245,243,238,0.25)'}` }}
                  >
                    {on && <Check size={11} color="#0F1210" strokeWidth={3.5} />}
                  </span>
                );
                return (
                  <>
                    <button
                      onClick={() => setDownloadSelection(allSelected ? [] : loggers.map((l) => l.id))}
                      role="checkbox"
                      aria-checked={allSelected}
                      className="w-full flex items-center justify-between py-2 pr-[13px] mb-1.5 text-left"
                    >
                      <span className="text-xs font-semibold" style={{ color: '#F5F3EE', fontFamily: 'Manrope' }}>
                        Select all
                      </span>
                      {box(allSelected)}
                    </button>
                    <div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto mb-4">
                      {loggers.map((l) => {
                        const on = downloadSelection.includes(l.id);
                        return (
                          <button
                            key={l.id}
                            onClick={() => setDownloadSelection((prev) => (on ? prev.filter((id) => id !== l.id) : [...prev, l.id]))}
                            role="checkbox"
                            aria-checked={on}
                            className="flex items-center justify-between px-3 py-2.5 rounded-xl text-left"
                            style={{
                              background: on ? 'rgba(1,169,157,0.12)' : 'rgba(245,243,238,0.04)',
                              border: `1px solid ${on ? '#01A99D' : 'rgba(245,243,238,0.1)'}`,
                            }}
                          >
                            <span className="text-sm" style={{ color: '#F5F3EE', fontFamily: 'Manrope' }}>
                              {l.name}
                            </span>
                            {box(on)}
                          </button>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
              <div className="flex gap-2.5">
                <button
                  onClick={() => setShowLedgerDownload(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                  style={{ background: 'rgba(245,243,238,0.06)', color: '#F5F3EE', fontFamily: 'Manrope' }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => downloadLedgersCsv(loggers.filter((l) => downloadSelection.includes(l.id)))}
                  disabled={!downloadSelection.length}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40"
                  style={{ background: '#01A99D', color: '#0F1210', fontFamily: 'Manrope' }}
                >
                  <Download size={14} /> Download{downloadSelection.length ? ` (${downloadSelection.length})` : ''}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function KeyBtn({ label, onPress, icon, children, muted, small, full }) {
  return (
    <button
      onClick={onPress}
      className="rounded-2xl flex items-center justify-center active:scale-95 transition-transform mono-num"
      style={{
        height: full ? '3.5rem' : '3.5rem',
        width: '100%',
        background: muted ? 'rgba(245,243,238,0.04)' : 'rgba(245,243,238,0.07)',
        color: muted ? '#7C8883' : '#F5F3EE',
        fontSize: small ? '0.95rem' : '1.15rem',
        fontWeight: 600,
      }}
    >
      {icon ? children : label}
    </button>
  );
}

// App-wide styles. Rendered by Ledgerly so they also apply to the sign-in screen, which shows without the app.
const GLOBAL_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap');
  .mono-num { font-family: 'Space Mono', monospace; }
  .item-search::placeholder, .feedback-input::placeholder, .app-input::placeholder { color: #7C8883; opacity: 1; }
  * { -webkit-tap-highlight-color: transparent; }
  @keyframes tipIn { from { opacity: 0; margin-top: -8px; } to { opacity: 1; margin-top: 0; } }
  .tip-toast { animation: tipIn 0.25s ease-out; }
  @keyframes tipOut { from { opacity: 1; margin-top: 0; } to { opacity: 0; margin-top: -8px; } }
  .tip-toast.leaving { animation: tipOut 0.25s ease-in forwards; pointer-events: none; }
`;

// Several accounts can live on one device (prototype). Each keeps its ledgers under its own key prefix.
// The first account on a device adopts the ledgers already there (no prefix), so people who used the app
// before accounts existed keep their entries.
const makeAccountStorage = (prefix) =>
  !prefix
    ? window.storage
    : {
        get: (key, shared) => window.storage.get(prefix + key, shared),
        set: (key, value, shared) => window.storage.set(prefix + key, value, shared),
        delete: (key, shared) => window.storage.delete(prefix + key, shared),
      };

export default function Ledgerly() {
  const [demoOpen, setDemoOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [accounts, setAccounts] = useState([]); // [{ id, prefix, emails: [{ address, primary, addedAt }] }]
  const [sessionId, setSessionId] = useState(null); // id of the signed-in account
  const [introDone, setIntroDone] = useState(false); // the 3 intro screens shown before signing up
  const [introStep, setIntroStep] = useState(0);
  const [replayingIntro, setReplayingIntro] = useState(false); // intro reopened from the sign-up screen

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get('ledgerly-accounts', false);
        const parsed = res && res.value ? JSON.parse(res.value) : [];
        if (Array.isArray(parsed)) setAccounts(parsed);
      } catch (e) {}
      try {
        const res = await window.storage.get('ledgerly-session', false);
        if (res && res.value) setSessionId(res.value);
      } catch (e) {}
      try {
        // Anyone who has an account, or used the app before accounts existed, has seen the intro already.
        const intro = await window.storage.get('ledgerly-intro-done', false);
        const oldWalkthrough = await window.storage.get('ledgerly-seen-walkthrough', false);
        const accountsRes = await window.storage.get('ledgerly-accounts', false);
        const hasAccounts = !!(accountsRes && accountsRes.value && JSON.parse(accountsRes.value).length);
        setIntroDone((intro && intro.value === 'true') || (oldWalkthrough && oldWalkthrough.value === 'true') || hasAccounts);
      } catch (e) {}
      setReady(true);
    })();
  }, []);

  const saveAccounts = (next) => {
    setAccounts(next);
    window.storage.set('ledgerly-accounts', JSON.stringify(next), false).catch(() => {});
  };

  const startSession = (id) => {
    setSessionId(id);
    if (id) window.storage.set('ledgerly-session', id, false).catch(() => {});
    else window.storage.delete('ledgerly-session', false).catch(() => {});
  };

  const activeAccount = accounts.find((a) => a.id === sessionId) || null;
  const prefix = activeAccount ? activeAccount.prefix : '';
  const storage = useMemo(() => makeAccountStorage(prefix), [prefix]);

  const emailInUse = (address) => accounts.some((a) => a.emails.some((e) => e.address === address));
  const accountWithEmail = (address) => accounts.find((a) => a.emails.some((e) => e.address === address));

  const finishIntro = () => {
    setIntroDone(true);
    setIntroStep(0);
    window.storage.set('ledgerly-intro-done', 'true', false).catch(() => {});
  };

  const createAccount = async (address) => {
    const id = 'acct-' + Date.now();
    const prefix = accounts.length === 0 ? '' : `${id}:`;
    const ns = makeAccountStorage(prefix);
    // They've just seen the intro, so the app shouldn't show it again. Brand-new users still get the
    // first-time tips; people who used the app before accounts existed keep their old tip settings.
    try {
      const tips = await ns.get('ledgerly-seen-tips', false);
      const walkthrough = await ns.get('ledgerly-seen-walkthrough', false);
      if (!(tips && tips.value) && !(walkthrough && walkthrough.value === 'true')) await ns.set('ledgerly-seen-tips', '[]', false);
      await ns.set('ledgerly-seen-walkthrough', 'true', false);
    } catch (e) {}
    saveAccounts([...accounts, { id, prefix, emails: [{ address, primary: true, addedAt: Date.now() }] }]);
    startSession(id);
  };

  const signIn = (address) => {
    startSession(accountWithEmail(address).id);
  };

  const updateActive = (change) => saveAccounts(accounts.map((a) => (a.id === activeAccount.id ? change(a) : a)));

  const accountApi = {
    account: activeAccount,
    emailInUse,
    addEmail: (address) => updateActive((a) => ({ ...a, emails: [...a.emails, { address, primary: false, addedAt: Date.now() }] })),
    makePrimary: (address) => updateActive((a) => ({ ...a, emails: a.emails.map((e) => ({ ...e, primary: e.address === address })) })),
    removeEmail: (address) => updateActive((a) => ({ ...a, emails: a.emails.filter((e) => e.address !== address) })),
    signOut: () => startSession(null),
    deleteActive: () => {
      const remaining = accounts.filter((a) => a.id !== activeAccount.id);
      saveAccounts(remaining);
      startSession(null);
      if (!remaining.length) {
        // A full fresh start: the intro screens come back before signing up again.
        setIntroDone(false);
        window.storage.delete('ledgerly-intro-done', false).catch(() => {});
      }
    },
  };

  if (!ready) return <div style={{ background: '#0A0C0B', minHeight: '100dvh' }} />;

  return (
    <>
      <style>{GLOBAL_STYLES}</style>
      {activeAccount ? (
        // A different account means different ledgers, so the app remounts and loads them fresh.
        <LedgerApp
          key={prefix || 'root'}
          storage={storage}
          accountApi={accountApi}
          onOpenDemo={() => setDemoOpen(true)}
        />
      ) : !introDone ? (
        <Walkthrough open step={introStep} setStep={setIntroStep} onDismiss={finishIntro} />
      ) : (
        <AuthScreen
          accounts={accounts}
          emailInUse={emailInUse}
          onSignIn={signIn}
          onCreateAccount={createAccount}
          onOpenDemo={() => setDemoOpen(true)}
          onViewIntro={() => setReplayingIntro(true)}
        />
      )}
      {/* Drawn over the sign-up screen, which stays mounted underneath so anything typed there is kept. */}
      {replayingIntro && !activeAccount && introDone && (
        <Walkthrough
          open
          step={introStep}
          setStep={setIntroStep}
          doneLabel="Back to sign-up"
          onDismiss={() => {
            setReplayingIntro(false);
            setIntroStep(0);
          }}
        />
      )}
      {demoOpen && (
        <div
          className="fixed inset-0 overflow-y-auto"
          style={{ background: '#0A0C0B', zIndex: 60 }}
          role="dialog"
          aria-modal="true"
          aria-label="Demo"
        >
          <LedgerApp demo onExitDemo={() => setDemoOpen(false)} />
        </div>
      )}
    </>
  );
}
