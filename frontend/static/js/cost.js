/**
 * cost.js — Cost Dashboard panel
 *
 * - GET /api/cost/summary → today/7d/30d overview cards
 * - GET /api/cost/daily   → bar chart (Chart.js)
 * - GET /api/cost/by-project, /by-model → tables
 * - GET /api/cost/sessions → gauge bars per session
 */

const CostDashboard = (() => {
  let _chart = null;

  const overviewEl = document.getElementById('cost-overview');
  const byProjectEl = document.getElementById('cost-by-project');
  const byModelEl   = document.getElementById('cost-by-model');
  const sessionsEl  = document.getElementById('cost-sessions');
  const usdKrwInput = document.getElementById('usd-to-krw');

  document.getElementById('btn-refresh-cost').addEventListener('click', load);

  async function load() {
    const usdToKrw = parseFloat(usdKrwInput.value) || 0;
    const qs = usdToKrw > 0 ? `?usd_to_krw=${usdToKrw}` : '';

    const [summary, daily, byProject, byModel, sessions] = await Promise.all([
      API.get('/api/cost/summary' + qs),
      API.get('/api/cost/daily?days=30'),
      API.get('/api/cost/by-project'),
      API.get('/api/cost/by-model'),
      API.get('/api/cost/sessions'),
    ]);

    _renderOverview(summary);
    _renderChart(daily);
    _renderTable(byProjectEl, byProject, 'project', '프로젝트별');
    _renderTable(byModelEl, byModel, 'model', '모델별');
    _renderGauges(sessions);
  }

  function _renderOverview(summary) {
    const cards = [
      { label: '오늘', data: summary.today },
      { label: '7일', data: summary.week },
      { label: '30일', data: summary.month },
    ];
    overviewEl.innerHTML = cards.map(c => `
      <div class="cost-card">
        <div class="cost-card-label">${c.label}</div>
        <div class="cost-card-value">$${_fmtUsd(c.data?.usd)}</div>
        ${c.data?.krw ? `<div class="cost-card-krw">₩${_fmtKrw(c.data.krw)}</div>` : ''}
      </div>
    `).join('');
  }

  function _renderChart(daily) {
    const labels = daily.map(d => d.date.slice(5)); // MM-DD
    const data   = daily.map(d => d.cost_usd);

    if (_chart) {
      _chart.data.labels = labels;
      _chart.data.datasets[0].data = data;
      _chart.update();
      return;
    }

    const ctx = document.getElementById('chart-daily').getContext('2d');
    _chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'USD',
          data,
          backgroundColor: 'rgba(137, 180, 250, 0.6)',
          borderColor: 'rgba(137, 180, 250, 1)',
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => `$${ctx.parsed.y.toFixed(4)}`,
            },
          },
        },
        scales: {
          x: { ticks: { color: '#6c7086', font: { size: 11 } }, grid: { color: '#313244' } },
          y: { ticks: { color: '#6c7086', font: { size: 11 } }, grid: { color: '#313244' } },
        },
      },
    });
  }

  function _renderTable(el, rows, keyField, title) {
    if (!rows.length) { el.innerHTML = ''; return; }
    const maxCost = Math.max(...rows.map(r => r.cost_usd), 0.0001);
    el.innerHTML = `
      <h4 style="margin-bottom:10px">${title}</h4>
      ${rows.map(r => `
        <div class="gauge-row">
          <span style="width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${_esc(r[keyField])}">${_esc(r[keyField] || '(unknown)')}</span>
          <div class="gauge-bar">
            <div class="gauge-fill" style="width:${(r.cost_usd / maxCost * 100).toFixed(1)}%"></div>
          </div>
          <span style="width:70px;text-align:right">$${_fmtUsd(r.cost_usd)}</span>
        </div>
      `).join('')}
    `;
  }

  function _renderGauges(sessions) {
    if (!sessions.length) { sessionsEl.innerHTML = ''; return; }
    const maxCost = Math.max(...sessions.map(s => s.cost_usd), 0.0001);
    sessionsEl.innerHTML = `
      <h4 style="margin:12px 0 8px">세션별</h4>
      ${sessions.slice(0, 30).map(s => `
        <div class="gauge-row">
          <span style="width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px" title="${_esc(s.session_id)}">${_esc(s.session_id.slice(0, 8))}…</span>
          <div class="gauge-bar">
            <div class="gauge-fill" style="width:${(s.cost_usd / maxCost * 100).toFixed(1)}%"></div>
          </div>
          <span style="width:70px;text-align:right">$${_fmtUsd(s.cost_usd)}</span>
        </div>
      `).join('')}
    `;
  }

  function _fmtUsd(v) {
    return (v || 0).toFixed(4);
  }

  function _fmtKrw(v) {
    return Math.round(v || 0).toLocaleString();
  }

  function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  return { load };
})();
