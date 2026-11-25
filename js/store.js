const STORAGE_KEY = 'cashin-load-shop-v1';
const DAY_MS = 24 * 60 * 60 * 1000;

export const WALLETS = [
  { id: 'cash', label: 'Cash drawer', tone: 'ink' },
  { id: 'gcash', label: 'GCash', tone: 'sky' },
  { id: 'maya', label: 'Maya', tone: 'jade' },
  { id: 'load', label: 'Load wallet', tone: 'coral' },
];

export const TYPE_LABELS = {
  cashin: 'Cash-in',
  cashout: 'Cash-out',
  load: 'Load',
  bills: 'Bills',
  transfer: 'Move float',
  adjustment: 'Adjustment',
};

const pesos = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 });
const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const $ = (selector) => document.querySelector(selector);
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const formatPeso = (amount) => pesos.format(amount);
export const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
export const formatTime = (ts) => new Date(ts).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
export const formatDay = (ts) => new Date(ts).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
export const isToday = (ts) => new Date(ts).toDateString() === new Date().toDateString();
export const walletLabel = (id) => WALLETS.find((wallet) => wallet.id === id)?.label ?? id;

const DEFAULT_SETTINGS = {
  shopName: 'Mabini Street Branch',
  feePer500: 10,
  billsFee: 15,
  loadMargin: 4,
  base: { cash: 12000, gcash: 20000, maya: 12000, load: 6000 },
  low: { cash: 3000, gcash: 4000, maya: 3000, load: 1500 },
};

export function suggestFee(type, amount, settings) {
  if (type === 'bills') return settings.billsFee;
  if (type === 'cashin' || type === 'cashout') return Math.ceil(amount / 500) * settings.feePer500;
  return 0;
}

export function buildTxn(type, input, settings) {
  const { amount, fee = 0, wallet, from, to, price = amount } = input;

  if (type === 'cashin' || type === 'bills') {
    return { type, wallet, amount, fee, profit: fee, effects: { cash: amount + fee, [wallet]: -amount } };
  }
  if (type === 'cashout') {
    return { type, wallet, amount, fee, profit: fee, effects: { cash: -amount, [wallet]: amount + fee } };
  }
  if (type === 'load') {
    const cost = Math.round(amount * (1 - settings.loadMargin / 100));
    return { type, wallet: 'load', amount, fee: price - amount, profit: price - cost, effects: { cash: price, load: -cost } };
  }
  return { type: 'transfer', from, to, amount, fee: 0, profit: 0, effects: { [from]: -amount, [to]: amount } };
}

export function getBalances(data) {
  const balances = { ...data.settings.base };
  data.txns.forEach((txn) => Object.entries(txn.effects).forEach(([id, value]) => { balances[id] += value; }));
  return balances;
}

export function validateTxn(txn, balances) {
  const short = Object.entries(txn.effects).find(([id, value]) => value < 0 && balances[id] + value < 0);
  return short ? `Not enough ${walletLabel(short[0])} (${formatPeso(balances[short[0]])} available).` : null;
}

export function getToday(data) {
  const txns = data.txns.filter((txn) => isToday(txn.at) && txn.type !== 'adjustment');
  const trade = txns.filter((txn) => txn.type !== 'transfer');
  return {
    profit: txns.reduce((total, txn) => total + txn.profit, 0),
    count: trade.length,
    volume: trade.reduce((total, txn) => total + txn.amount, 0),
  };
}

export function getProfitByDay(data) {
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(Date.now() - (6 - index) * DAY_MS);
    const profit = data.txns
      .filter((txn) => new Date(txn.at).toDateString() === day.toDateString())
      .reduce((total, txn) => total + txn.profit, 0);
    return { label: day.toLocaleDateString('en-PH', { weekday: 'short' }), profit };
  });
}

function createSeed() {
  const settings = structuredClone(DEFAULT_SETTINGS);
  const now = Date.now();
  const pattern = [
    ['cashin', 'gcash', 1000], ['cashout', 'gcash', 2500], ['load', null, 100], ['bills', 'maya', 1800],
    ['cashin', 'maya', 700], ['load', null, 50], ['cashout', 'maya', 1500], ['cashin', 'gcash', 3000],
  ];
  const txns = [];

  for (let daysAgo = 6; daysAgo >= 0; daysAgo -= 1) {
    pattern.forEach(([type, wallet, amount], index) => {
      if ((daysAgo + index) % 4 === 0 && daysAgo > 0) return;
      const fee = suggestFee(type, amount, settings);
      const at = now - daysAgo * DAY_MS - (index + 1) * 28 * 60000;
      txns.push({ id: uid(), at, ...buildTxn(type, { amount, fee, wallet, price: amount }, settings) });
    });
  }

  const data = { settings, txns: txns.sort((a, b) => a.at - b.at), closes: [] };
  for (let daysAgo = 3; daysAgo >= 1; daysAgo -= 1) {
    const end = now - daysAgo * DAY_MS + 3600000;
    const upTo = { settings, txns: data.txns.filter((txn) => txn.at <= end) };
    const day = data.txns.filter((txn) => new Date(txn.at).toDateString() === new Date(end).toDateString());
    const cash = getBalances(upTo).cash;
    data.closes.push({ id: uid(), at: end, expected: cash, counted: cash, diff: 0, profit: day.reduce((t, x) => t + x.profit, 0), count: day.length });
  }
  return data;
}

export function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && saved.settings && Array.isArray(saved.txns)) return saved;
  } catch {
    return createSeed();
  }
  return createSeed();
}

export const saveData = (data) => localStorage.setItem(STORAGE_KEY, JSON.stringify(data));