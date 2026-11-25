import {
  $,
  TYPE_LABELS,
  WALLETS,
  escapeHtml,
  formatDay,
  formatPeso,
  formatTime,
  getBalances,
  getProfitByDay,
  getToday,
  isToday,
  walletLabel,
} from './store.js';

const sign = (value) => `${value < 0 ? '-' : '+'}${formatPeso(Math.abs(value))}`;

export function renderCounter(data) {
  const balances = getBalances(data);
  const today = getToday(data);
  const todayTxns = data.txns.filter((txn) => isToday(txn.at));

  $('#subtitle').textContent = `${data.settings.shopName}, ${new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`;
  $('#drawer').textContent = formatPeso(balances.cash);

  $('#wallets').innerHTML = WALLETS.map(({ id, label, tone }) => {
    const change = todayTxns.reduce((total, txn) => total + (txn.effects[id] ?? 0), 0);
    const low = balances[id] < data.settings.low[id];
    const fill = Math.max(Math.min((balances[id] / data.settings.base[id]) * 100, 100), 2);
    return `
      <article class="wallet ${tone} ${low ? 'is-low' : ''}">
        <header><span class="swatch"></span><h3>${label}</h3>${low ? '<em>Low float</em>' : ''}</header>
        <strong>${formatPeso(balances[id])}</strong>
        <div class="meter"><span style="width:${fill}%"></span></div>
        <small>${change === 0 ? 'No movement today' : `${sign(change)} today`}</small>
      </article>`;
  }).join('');

  $('#sProfit').textContent = formatPeso(today.profit);
  $('#sCount').textContent = today.count;
  $('#sVolume').textContent = formatPeso(today.volume);
  $('#rExpected').textContent = formatPeso(balances.cash);

  $('#log').innerHTML = todayTxns.sort((a, b) => b.at - a.at).map((txn) => {
    const detail = txn.type === 'transfer'
      ? `${walletLabel(txn.from)} to ${walletLabel(txn.to)}`
      : txn.type === 'adjustment' ? 'Cash over or short' : walletLabel(txn.wallet);
    return `
      <tr>
        <td>${formatTime(txn.at)}</td>
        <td><span class="chip ${txn.type}">${TYPE_LABELS[txn.type]}</span></td>
        <td>${escapeHtml(detail)}</td>
        <td class="num">${txn.type === 'adjustment' ? sign(txn.effects.cash) : formatPeso(txn.amount)}</td>
        <td class="num">${formatPeso(txn.fee)}</td>
        <td class="num ${txn.profit > 0 ? 'gain' : ''}">${formatPeso(txn.profit)}</td>
        <td class="row-actions"><button class="link danger" data-delete="${txn.id}">Delete</button></td>
      </tr>`;
  }).join('');
  $('#logEmpty').hidden = todayTxns.length > 0;
}

export function renderReports(data) {
  const week = getProfitByDay(data);
  const peak = Math.max(...week.map((day) => day.profit), 1);

  $('#bars').innerHTML = week.map((day) => `
    <div class="bar-col"><span class="bar-value">${formatPeso(day.profit)}</span><span class="bar" style="height:${Math.max((day.profit / peak) * 100, 3)}%"></span><span class="bar-label">${day.label}</span></div>`).join('');

  $('#closes').innerHTML = [...data.closes].sort((a, b) => b.at - a.at).map((close) => `
    <tr>
      <td>${formatDay(close.at)}, ${formatTime(close.at)}</td>
      <td class="num">${formatPeso(close.expected)}</td>
      <td class="num">${formatPeso(close.counted)}</td>
      <td class="num ${close.diff < 0 ? 'loss' : close.diff > 0 ? 'gain' : ''}">${close.diff === 0 ? 'Balanced' : sign(close.diff)}</td>
      <td class="num">${formatPeso(close.profit)}</td>
      <td class="num">${close.count}</td>
    </tr>`).join('');
  $('#closesEmpty').hidden = data.closes.length > 0;
}

export function renderSettings(settings) {
  $('#sShop').value = settings.shopName;
  $('#sFee').value = settings.feePer500;
  $('#sBills').value = settings.billsFee;
  $('#sMargin').value = settings.loadMargin;
  $('#walletSettings').innerHTML = `<div class="ws-head"><span></span><span>Starting float</span><span>Low alert below</span></div>${WALLETS.map(({ id, label }) => `
    <div class="ws-row"><span>${label}</span><input id="base-${id}" type="number" min="0" step="1" value="${settings.base[id]}" required><input id="low-${id}" type="number" min="0" step="1" value="${settings.low[id]}" required></div>`).join('')}`;
}