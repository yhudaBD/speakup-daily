// Script for usage_dashboard.html. It lives in its own file, with listeners
// bound here instead of onclick attributes, so the site's CSP can drop
// 'unsafe-inline' from script-src (CRITICAL_REVIEW.md §40).
const SECRET_KEY = 'speakup_admin_secret';
let currentData = null;

function tryLogin() {
  const secret = document.getElementById('secretInput').value.trim();
  if (!secret) return;
  sessionStorage.setItem(SECRET_KEY, secret);
  loadData();
}

async function loadData() {
  const secret = sessionStorage.getItem(SECRET_KEY);
  if (!secret) return;
  try {
    const res = await fetch('/api/get-dashboard-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Secret': secret },
      body: JSON.stringify({}),
    });
    if (res.status === 401) {
      sessionStorage.removeItem(SECRET_KEY);
      document.getElementById('gateErr').textContent = 'סיסמה שגויה';
      document.getElementById('gate').hidden = false;
      document.getElementById('dashboard').hidden = true;
      return;
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    currentData = await res.json();
    render(currentData);
    document.getElementById('gate').hidden = true;
    document.getElementById('dashboard').hidden = false;
  } catch (err) {
    document.getElementById('gateErr').textContent = 'שגיאה בטעינה: ' + err.message;
  }
}

function last30Days() {
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function trendBadge(trend) {
  if (trend === 'down') return '<span class="pill ok">📉 ירידה</span>';
  if (trend === 'up') return '<span class="pill warn">📈 עלייה</span>';
  return '';
}

function render(data) {
  document.getElementById('generatedAt').textContent =
    'עודכן: ' + new Date(data.generatedAt).toLocaleString('he-IL');
  document.getElementById('totalUsers').textContent = data.summary.totalUsers;
  document.getElementById('weeklyActive').textContent = data.summary.weeklyActiveUsers;
  const costEl = document.getElementById('totalCost');
  costEl.textContent = '$' + data.summary.totalCostUsd.toFixed(2);
  costEl.className = 'num' + (data.summary.totalCostUsd >= 10 ? ' bad' : '');

  // Users whose cloud document is nearing Firestore's 1MB cap (§1א).
  const large = data.summary.largeCloudDocs || {};
  const largeDocs = document.getElementById('largeDocs');
  const largeParts = Object.entries(large).filter(([, n]) => n > 0).map(([range, n]) => range + ': ' + n);
  largeDocs.textContent = largeParts.length ? '⚠️ מסמכים גדולים בענן (משתמשים לפי טווח): ' + largeParts.join(' · ') : '';
  largeDocs.hidden = !largeParts.length;

  const days = last30Days();
  const inactive = data.users.filter(u => u.daysSinceActive !== null && u.daysSinceActive >= 3);
  document.getElementById('inactiveCount').textContent = inactive.length;

  const usersBody = document.getElementById('usersBody');
  if (!data.users.length) {
    usersBody.innerHTML = '<tr><td colspan="6" class="empty">אין עדיין נתונים — ברגע שמישהו ישתמש באפליקציה, הוא יופיע כאן.</td></tr>';
  } else {
    usersBody.innerHTML = data.users.map((u, i) => `
      <tr class="clickable" data-index="${i}">
        <td>${escapeHtml(u.userLabel)}</td>
        <td><div class="grid30">${days.map(d => `<div class="cell${u.activeDates.includes(d) ? ' active' : ''}" title="${d}"></div>`).join('')}</div></td>
        <td>${escapeHtml(u.placementLevel || '—')} → ${escapeHtml(u.currentLevel || '—')}</td>
        <td>${u.avgHelpUsed !== null ? u.avgHelpUsed.toFixed(1) : '—'} ${trendBadge(u.helpTrend)}</td>
        <td>$${u.estimatedCostUsd.toFixed(3)}</td>
        <td>${u.daysSinceActive === 0 ? 'היום' : u.daysSinceActive === null ? '—' : `לפני ${u.daysSinceActive} ימים`}</td>
      </tr>
    `).join('');
  }

  const topicsList = document.getElementById('topicsList');
  topicsList.innerHTML = data.summary.popularTopics.length
    ? data.summary.popularTopics.map(t => `<li><span>${escapeHtml(t.topic)}</span><strong>${Number(t.count) || 0}</strong></li>`).join('')
    : '<li class="empty" style="border:none;background:none">אין עדיין נתונים</li>';

  const inactiveList = document.getElementById('inactiveList');
  inactiveList.innerHTML = inactive.length
    ? inactive.map(u => `<li><span>${escapeHtml(u.userLabel)}</span><span>לפני ${u.daysSinceActive} ימים</span></li>`).join('')
    : '<li class="empty" style="border:none;background:none">כולם פעילים 🎉</li>';
}

function openModal(index) {
  const u = currentData.users[index];
  document.getElementById('modalName').textContent = u.userLabel;
  const topics = Object.entries(u.topicCounts || {}).sort((a, b) => b[1] - a[1]);
  document.getElementById('modalBody').innerHTML = `
    <p><strong>רמה:</strong> ${escapeHtml(u.placementLevel || '—')} ← ${escapeHtml(u.currentLevel || '—')}</p>
    <p><strong>עלות משוערת:</strong> $${u.estimatedCostUsd.toFixed(3)}</p>
    <p><strong>נושאים שתורגלו:</strong></p>
    <ul class="topics-list">${topics.length ? topics.map(([t, c]) => `<li><span>${escapeHtml(t)}</span><strong>${Number(c) || 0}</strong></li>`).join('') : '<li>אין עדיין</li>'}</ul>
  `;
  document.getElementById('userModalBackdrop').hidden = false;
}
function closeModal() { document.getElementById('userModalBackdrop').hidden = true; }

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

document.getElementById('loginBtn').addEventListener('click', tryLogin);
document.getElementById('secretInput').addEventListener('keydown', e => { if (e.key === 'Enter') tryLogin(); });
document.getElementById('refreshBtn').addEventListener('click', loadData);
document.getElementById('closeModalBtn').addEventListener('click', closeModal);
document.getElementById('userModalBackdrop').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});
// Rows are re-rendered on every load, so one listener on the table body
// handles them all.
document.getElementById('usersBody').addEventListener('click', e => {
  const row = e.target.closest('tr[data-index]');
  if (row) openModal(Number(row.dataset.index));
});
if (sessionStorage.getItem(SECRET_KEY)) loadData();
