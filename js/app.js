import {
  $,
  TYPE_LABELS,
  WALLETS,
  buildTxn,
  formatPeso,
  getBalances,
  loadData,
  saveData,
  suggestFee,
  uid,
  validateTxn,
  walletLabel,
} from './store.js';
import { renderCounter, renderReports, renderSettings } from './render.js';

const TOAST_MS = 6000;

let data = loadData();
let type = 'cashin';
let feeEdited = false;
let priceEdited = false;
let toastTimer = null;

const num = (selector) => Number($(selector).value) || 0;

function refresh() {
  renderCounter(data);
  renderReports(data);
  updateRecon();
  updatePreview();
}

function showToast(message, onUndo) {
  $('#toastMessage').textContent = message;
  $('#toastUndo').onclick = () => {
    $('#toast').hidden = true;
    onUndo();
  };
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, TOAST_MS);
}

function mutate(change, message) {
  const snapshot = JSON.stringify(data);
  change();
  saveData(data);
  refresh();
  showToast(message, () => {
    data = JSON.parse(snapshot);
    saveData(data);
    refresh();
  });
}

function readInput() {
  const amount = num('#tAmount');
  return {
    amount,
    wallet: $('#tWallet').value,
    from: $('#tFrom').value,
    to: $('#tTo').value,
    fee: feeEdited ? num('#tFee') : suggestFee(type, amount, data.settings),
    price: priceEdited ? num('#tPrice') : amount,
  };
}

function syncSuggestions() {
  const amount = num('#tAmount');
  if (!feeEdited) $('#tFee').value = amount ? suggestFee(type, amount, data.settings) : '';
  if (!priceEdited) $('#tPrice').value = amount || '';
}

function updatePreview() {
  const input = readInput();
  const valid = input.amount > 0 && (type !== 'transfer' || input.from !== input.to);

  if (!valid) {
    $('#preview').innerHTML = '';
    $('#tError').hidden = true;
    $('#tSubmit').disabled = true;
    return;
  }

  const txn = buildTxn(type, input, data.settings);
  const error = validateTxn(txn, getBalances(data));
  const lines = Object.entries(txn.effects).map(([id, value]) =>
    `<li><span>${walletLabel(id)}</span><b class="${value < 0 ? 'loss' : 'gain'}">${value < 0 ? '-' : '+'}${formatPeso(Math.abs(value))}</b></li>`);
  if (txn.profit) lines.push(`<li class="total"><span>Your profit</span><b>${formatPeso(txn.profit)}</b></li>`);

  $('#preview').innerHTML = lines.join('');
  $('#tError').textContent = error ?? '';
  $('#tError').hidden = !error;
  $('#tSubmit').disabled = Boolean(error);
}

function setType(next) {
  type = next;
  feeEdited = false;
  priceEdited = false;
  $('#teller').dataset.type = next;
  $('#typeTabs').querySelectorAll('button').forEach((button) => button.classList.toggle('on', button.dataset.type === next));
  syncSuggestions();
  updatePreview();
}

function recordTransaction(event) {
  event.preventDefault();
  const txn = buildTxn(type, readInput(), data.settings);
  if (validateTxn(txn, getBalances(data))) return;

  mutate(() => data.txns.push({ id: uid(), at: Date.now(), ...txn }), `${TYPE_LABELS[txn.type]} of ${formatPeso(txn.amount)} recorded`);
  $('#tAmount').value = '';
  feeEdited = false;
  priceEdited = false;
  syncSuggestions();
  updatePreview();
  $('#tAmount').focus();
}

function updateRecon() {
  const counted = $('#rCounted').value;
  const diff = Number(counted) - getBalances(data).cash;
  $('#closeDay').disabled = counted === '';
  $('#rDiff').textContent = counted === '' ? '–' : diff === 0 ? 'Balanced' : `${diff < 0 ? 'Short' : 'Over'} ${formatPeso(Math.abs(diff))}`;
  $('#rDiff').className = counted === '' || diff === 0 ? '' : diff < 0 ? 'loss' : 'gain';
}

function closeDay() {
  const expected = getBalances(data).cash;
  const counted = num('#rCounted');
  const diff = counted - expected;
  const today = data.txns.filter((txn) => new Date(txn.at).toDateString() === new Date().toDateString() && txn.type !== 'adjustment');

  mutate(() => {
    if (diff !== 0) data.txns.push({ id: uid(), at: Date.now(), type: 'adjustment', amount: Math.abs(diff), fee: 0, profit: 0, effects: { cash: diff } });
    data.closes.push({ id: uid(), at: Date.now(), expected, counted, diff, profit: today.reduce((total, txn) => total + txn.profit, 0), count: today.filter((txn) => txn.type !== 'transfer').length });
  }, 'Day closed');
  $('#rCounted').value = '';
  updateRecon();
}

function saveSettings(event) {
  event.preventDefault();
  mutate(() => {
    data.settings.shopName = $('#sShop').value.trim();
    data.settings.feePer500 = num('#sFee');
    data.settings.billsFee = num('#sBills');
    data.settings.loadMargin = num('#sMargin');
    WALLETS.forEach(({ id }) => {
      data.settings.base[id] = num(`#base-${id}`);
      data.settings.low[id] = num(`#low-${id}`);
    });
  }, 'Settings saved');
  $('#settingsDialog').close();
}

function exportCsv() {
  const rows = [['Date', 'Type', 'Details', 'Amount', 'Fee', 'Profit']];
  [...data.txns].sort((a, b) => a.at - b.at).forEach((txn) => {
    rows.push([new Date(txn.at).toLocaleString('en-PH'), TYPE_LABELS[txn.type], txn.wallet ? walletLabel(txn.wallet) : '', txn.amount, txn.fee, txn.profit]);
  });
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  link.download = 'transactions.csv';
  link.click();
  URL.revokeObjectURL(link.href);
}

function init() {
  const options = WALLETS.map(({ id, label }) => `<option value="${id}">${label}</option>`).join('');
  $('#tFrom').innerHTML = options;
  $('#tTo').innerHTML = options;
  $('#tTo').value = 'gcash';

  document.querySelectorAll('[data-nav]').forEach((button) => button.addEventListener('click', () => {
    document.body.dataset.view = button.dataset.nav;
    document.querySelectorAll('[data-nav]').forEach((item) => item.classList.toggle('active', item === button));
  }));
  document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));

  $('#typeTabs').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-type]');
    if (button) setType(button.dataset.type);
  });
  $('#quick').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-amount]');
    if (!button) return;
    $('#tAmount').value = button.dataset.amount;
    syncSuggestions();
    updatePreview();
  });

  $('#tAmount').addEventListener('input', () => { syncSuggestions(); updatePreview(); });
  $('#tFee').addEventListener('input', () => { feeEdited = true; updatePreview(); });
  $('#tPrice').addEventListener('input', () => { priceEdited = true; updatePreview(); });
  ['#tWallet', '#tFrom', '#tTo'].forEach((selector) => $(selector).addEventListener('change', updatePreview));

  $('#teller').addEventListener('submit', recordTransaction);
  $('#rCounted').addEventListener('input', updateRecon);
  $('#closeDay').addEventListener('click', closeDay);
  $('#exportCsv').addEventListener('click', exportCsv);
  $('#openSettings').addEventListener('click', () => { renderSettings(data.settings); $('#settingsDialog').showModal(); });
  $('#settingsForm').addEventListener('submit', saveSettings);
  $('#log').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-delete]');
    if (button) mutate(() => { data.txns = data.txns.filter((txn) => txn.id !== button.dataset.delete); }, 'Transaction deleted');
  });

  refresh();
}

init();