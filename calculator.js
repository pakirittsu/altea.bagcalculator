const APP_VERSION = '1.2.3';
const HISTORY_STORAGE_KEY = 'altea_clc_search_history_v1';
const ISSUES_STORAGE_KEY = 'altea_clc_issue_reports_v1';
const DEV_USERNAME = 'admin';
const DEV_PASSWORD = '1234';
const MAX_HISTORY_ITEMS = 30;
let saveHistoryTimer = null;
let currentParsedFlights = [];
let currentHeaderInfo = '';
let modalBackStack = [];
let draftIssueImageData = '';
let isDevAuthenticated = false;
let showDevLoginForm = false;
let showUserStatusTracker = false;
let devLoginError = '';

const SEVERITY_PRIORITY = {
  missed_conx: 4,
  danger: 3,
  warn: 2,
  long: 1
};

const REPORT_TYPE_MAP = {
  bug: { label: 'แจ้งปัญหา', cls: 'type-bug' },
  suggestion: { label: 'ส่งข้อเสนอแนะ', cls: 'type-suggestion' }
};

const ISSUE_STATUS_MAP = {
  pending: { label: 'รอดำเนินการ', cls: 'status-pending' },
  in_progress: { label: 'กำลังแก้ไข', cls: 'status-progress' },
  resolved: { label: 'แก้ไขแล้ว', cls: 'status-resolved' }
};

const TH_DOMESTIC_AIRPORTS = new Set([
  'BKK', 'DMK', 'CNX', 'CEI', 'HKT', 'KBV', 'USM', 'TDX', 'THS',
  'UTH', 'UBP', 'KKC', 'NST', 'HDY', 'TST', 'LPT', 'PHS', 'TAW',
  'MAQ', 'PRH', 'NNT', 'ROI', 'BFV', 'SNO', 'NAW', 'CNQ', 'KOP', 'PXM',
  'HGN', 'TKH', 'KDT', 'LOE', 'UNN', 'PYY', 'QHO', 'TKT', 'TDK', 'KCM'
]);

function handleBackdropClick(e) {
  if (e.target.id === 'detailModal') {
    closeDetailModal();
  }
}

function renderModalBackButton() {
  const headerEl = document.querySelector('#detailModal .modal-header');
  if (!headerEl) return;

  const closeBtn = headerEl.querySelector('.modal-close:not(#modalBackBtn)');
  let actionGroup = document.getElementById('modalHeaderActions');

  if (!actionGroup) {
    actionGroup = document.createElement('div');
    actionGroup.id = 'modalHeaderActions';
    actionGroup.style.display = 'flex';
    actionGroup.style.alignItems = 'center';
    actionGroup.style.gap = '8px';
    if (closeBtn) {
      headerEl.appendChild(actionGroup);
      actionGroup.appendChild(closeBtn);
    }
  }

  let backBtn = document.getElementById('modalBackBtn');
  if (modalBackStack.length > 0) {
    if (!backBtn) {
      backBtn = document.createElement('button');
      backBtn.type = 'button';
      backBtn.id = 'modalBackBtn';
      backBtn.className = 'modal-close';
      backBtn.textContent = '← ย้อนกลับ';
      backBtn.onclick = goBackDetailModal;
    }
    actionGroup.insertBefore(backBtn, closeBtn || null);
    backBtn.style.display = 'inline-block';
  } else if (backBtn) {
    backBtn.style.display = 'none';
  }
}

function openDetailModal(title, htmlContent, options = {}) {
  const { pushCurrent = false, clearStack = false } = options;

  if (clearStack) {
    modalBackStack = [];
  } else if (pushCurrent) {
    const currentTitle = document.getElementById('modalTitle').textContent;
    const currentHtml = document.getElementById('modalBody').innerHTML;
    const isOpen = document.getElementById('detailModal').classList.contains('open');
    if (isOpen && currentHtml) {
      modalBackStack.push({ title: currentTitle, html: currentHtml });
    }
  }

  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = htmlContent;
  renderModalBackButton();
  document.getElementById('detailModal').classList.add('open');
}

function goBackDetailModal() {
  const prev = modalBackStack.pop();
  if (!prev) {
    closeDetailModal();
    return;
  }
  document.getElementById('modalTitle').textContent = prev.title;
  document.getElementById('modalBody').innerHTML = prev.html;
  renderModalBackButton();
}

function closeDetailModal() {
  modalBackStack = [];
  showDevLoginForm = false;
  showUserStatusTracker = false;
  devLoginError = '';
  renderModalBackButton();
  document.getElementById('detailModal').classList.remove('open');
}

/* Issue Tracker Functions */
function loadIssues() {
  try {
    const raw = localStorage.getItem(ISSUES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveIssues(items) {
  try {
    localStorage.setItem(ISSUES_STORAGE_KEY, JSON.stringify(items));
  } catch (e) {
    alert('พื้นที่จัดเก็บเบราว์เซอร์เต็ม ลองลบรูปภาพขนาดใหญ่หรือลบรายการเก่าออกก่อนครับ');
  }
  updateIssueBadgeCount();
}

function updateIssueBadgeCount() {
  const badge = document.getElementById('issueBadgeCount');
  if (!badge) return;
  const issues = loadIssues();
  badge.textContent = `${issues.length}`;
}

function compressImageFile(file, maxWidth = 1024, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = ev.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderDraftImagePreview() {
  const previewWrap = document.getElementById('issueImagePreview');
  if (!previewWrap) return;
  if (!draftIssueImageData) {
    previewWrap.innerHTML = '';
    return;
  }
  previewWrap.innerHTML = `
    <img src="${draftIssueImageData}" alt="ตัวอย่างรูปภาพ" class="issue-thumb" onclick="viewFullImage('${draftIssueImageData.replace(/'/g, "\\'")}')">
    <button type="button" class="btn-mini-clear" onclick="clearDraftIssueImage()">ลบรูป</button>
  `;
}

function clearDraftIssueImage() {
  draftIssueImageData = '';
  const fileInput = document.getElementById('issueImageFile');
  if (fileInput) fileInput.value = '';
  renderDraftImagePreview();
}

async function handleIssueImageChange(e) {
  const file = e.target.files && e.target.files[0];
  if (!file || !file.type.startsWith('image/')) return;
  draftIssueImageData = await compressImageFile(file);
  renderDraftImagePreview();
}

function viewFullImage(src) {
  const html = `
    <div style="text-align:center;">
      <img src="${src}" alt="รูปภาพปัญหา" style="max-width:100%; max-height:65vh; border-radius:8px; border:1px solid var(--border);">
    </div>
  `;
  openDetailModal('รูปภาพประกอบการแจ้งปัญหา', html, { pushCurrent: true });
}

function submitIssueReport(e) {
  e.preventDefault();
  const nameInput = document.getElementById('issueReporterName');
  const typeInput = document.getElementById('issueReportTypeInput');
  const descInput = document.getElementById('issueDescription');

  const reporterName = nameInput.value.trim();
  const reportType = typeInput ? typeInput.value : 'bug';
  const description = descInput.value.trim();

  if (!reporterName || !description) return;

  const issues = loadIssues();
  issues.unshift({
    id: Date.now(),
    reporterName,
    reportType,
    description,
    status: 'pending',
    imageData: draftIssueImageData || '',
    version: APP_VERSION,
    createdAt: new Date().toLocaleString('th-TH', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  });

  saveIssues(issues);
  draftIssueImageData = '';
  showUserStatusTracker = true;
  renderIssueTrackerContent();
  alert('ส่งข้อมูลเรียบร้อยแล้วครับ ระบบซ่อนชื่อผู้แจ้งในหน้าติดตามสถานะเพื่อความเป็นส่วนตัว');
}

function toggleUserStatusTracker() {
  showUserStatusTracker = !showUserStatusTracker;
  renderIssueTrackerContent();
}

function openDevLoginPrompt() {
  if (isDevAuthenticated) {
    isDevAuthenticated = false;
    showDevLoginForm = false;
    devLoginError = '';
    renderIssueTrackerContent();
    return;
  }
  showDevLoginForm = !showDevLoginForm;
  devLoginError = '';
  renderIssueTrackerContent();
}

function handleDevLoginSubmit(e) {
  e.preventDefault();
  const userEl = document.getElementById('devUsernameInput');
  const passEl = document.getElementById('devPasswordInput');
  const username = (userEl ? userEl.value : '').trim();
  const password = passEl ? passEl.value : '';

  if (username === DEV_USERNAME && password === DEV_PASSWORD) {
    isDevAuthenticated = true;
    showDevLoginForm = false;
    devLoginError = '';
  } else {
    devLoginError = 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง';
  }
  renderIssueTrackerContent();
}

function updateIssueStatus(issueId, nextStatus) {
  if (!isDevAuthenticated) return;
  const issues = loadIssues();
  const target = issues.find(item => item.id === issueId);
  if (!target) return;
  target.status = nextStatus;
  saveIssues(issues);
  renderIssueTrackerContent();
}

function deleteIssueItem(issueId) {
  if (!isDevAuthenticated) return;
  const updated = loadIssues().filter(item => item.id !== issueId);
  saveIssues(updated);
  renderIssueTrackerContent();
}

function renderIssueCards(issues, allowManage = false) {
  if (issues.length === 0) {
    return '<div class="history-empty" style="text-align:center; padding:18px;">ยังไม่มีรายการแจ้งปัญหาหรือข้อเสนอแนะ</div>';
  }

  return `<div class="issue-list">${issues.map(item => {
    const rt = REPORT_TYPE_MAP[item.reportType] || REPORT_TYPE_MAP.bug;
    const st = ISSUE_STATUS_MAP[item.status] || ISSUE_STATUS_MAP.pending;
    const reporterDisplay = allowManage ? escapeHtml(item.reporterName) : 'ผู้แจ้งถูกซ่อนไว้';
    const imgHtml = item.imageData
      ? `<div style="margin-bottom:8px;"><img src="${item.imageData}" alt="แนบรูป" class="issue-thumb" onclick="viewFullImage('${item.imageData.replace(/'/g, "\\'")}')"></div>`
      : '';

    const manageFooterHtml = allowManage ? `
      <div class="issue-card-footer">
        <div style="display:flex; align-items:center; gap:6px; font-size:0.8rem;">
          <span>สถานะดำเนินการ:</span>
          <select class="issue-select" style="width:auto; padding:4px 8px; font-size:0.8rem;" onchange="updateIssueStatus(${item.id}, this.value)">
            <option value="pending" ${item.status === 'pending' ? 'selected' : ''}>รอดำเนินการ</option>
            <option value="in_progress" ${item.status === 'in_progress' ? 'selected' : ''}>กำลังแก้ไข</option>
            <option value="resolved" ${item.status === 'resolved' ? 'selected' : ''}>แก้ไขแล้ว</option>
          </select>
        </div>
        <button type="button" class="btn-mini-clear" onclick="deleteIssueItem(${item.id})">ลบรายการ</button>
      </div>
    ` : `
      <div class="issue-card-footer" style="font-size:0.8rem; color:var(--muted);">
        <span>สถานะปัจจุบัน: <b>${escapeHtml(st.label)}</b></span>
      </div>
    `;

    return `
      <div class="issue-card">
        <div class="issue-card-top">
          <div>
            <span class="issue-reporter">${reporterDisplay}</span>
            <span class="issue-time"> · ${escapeHtml(item.createdAt)} (v${escapeHtml(item.version || APP_VERSION)})</span>
          </div>
          <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
            <span class="report-type-pill ${rt.cls}">${rt.label}</span>
            <span class="status-pill ${st.cls}">${st.label}</span>
          </div>
        </div>
        <div class="issue-desc">${escapeHtml(item.description)}</div>
        ${imgHtml}
        ${manageFooterHtml}
      </div>
    `;
  }).join('')}</div>`;
}

function renderIssueTrackerContent() {
  const bodyEl = document.getElementById('modalBody');
  if (!bodyEl) return;

  const issues = loadIssues();

  const devLoginHtml = showDevLoginForm && !isDevAuthenticated ? `
    <form class="dev-login-box" onsubmit="handleDevLoginSubmit(event)">
      <div style="font-weight:800; color:var(--primary); margin-bottom:10px; font-size:0.92rem;">
        Dev. Login — เข้าสู่ระบบสำหรับผู้พัฒนาเพื่อดูชื่อผู้แจ้งและจัดการสถานะ
      </div>
      <div class="issue-form-row" style="margin-bottom:8px;">
        <div class="issue-field" style="margin-bottom:0;">
          <label for="devUsernameInput">ชื่อผู้ใช้งาน</label>
          <input id="devUsernameInput" type="text" class="issue-input" required>
        </div>
        <div class="issue-field" style="margin-bottom:0;">
          <label for="devPasswordInput">รหัสผ่าน</label>
          <input id="devPasswordInput" type="password" class="issue-input" required>
        </div>
      </div>
      ${devLoginError ? `<div class="dev-error-msg">${escapeHtml(devLoginError)}</div>` : ''}
      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:10px;">
        <button type="button" class="btn-clear" onclick="showDevLoginForm=false; devLoginError=''; renderIssueTrackerContent();">ยกเลิก</button>
        <button type="submit" class="btn-submit-issue">ล็อคอิน</button>
      </div>
    </form>
  ` : '';

  let listSectionHtml = '';
  if (isDevAuthenticated) {
    listSectionHtml = renderIssueCards(issues, true);
  } else if (showUserStatusTracker) {
    listSectionHtml = renderIssueCards(issues, false);
  } else {
    listSectionHtml = `
      <div class="issue-card" style="text-align:center; background:#fafafa; color:var(--muted); font-size:0.86rem;">
        กดปุ่ม <b>ติดตามสถานะที่แจ้งไว้</b> เพื่อดูความคืบหน้า (ระบบจะซ่อนชื่อผู้แจ้ง) หรือกด <b>Dev. Login</b> สำหรับผู้พัฒนาเพื่อดูชื่อผู้แจ้งและแก้ไขสถานะ
      </div>
    `;
  }

  bodyEl.innerHTML = `
    <form class="issue-form-card" onsubmit="submitIssueReport(event)">
      <div class="issue-form-row">
        <div class="issue-field" style="margin-bottom:0;">
          <label for="issueReporterName">ชื่อผู้แจ้ง *</label>
          <input id="issueReporterName" type="text" class="issue-input" required>
        </div>
        <div class="issue-field" style="margin-bottom:0;">
          <label for="issueReportTypeInput">สิ่งที่อยากรายงาน</label>
          <select id="issueReportTypeInput" class="issue-select">
            <option value="bug">แจ้งปัญหา</option>
            <option value="suggestion">ส่งข้อเสนอแนะ</option>
          </select>
        </div>
      </div>

      <div class="issue-field">
        <label for="issueDescription">รายละเอียดที่พบหรือข้อเสนอแนะ *</label>
        <textarea id="issueDescription" class="issue-textarea" placeholder="อธิบายอาการบั๊ค เที่ยวบินที่เจอ หรือข้อเสนอแนะ..." required></textarea>
      </div>

      <div class="issue-field" style="margin-bottom:10px;">
        <label for="issueImageFile">แนบรูปภาพ (เลือกไฟล์ หรือกด Ctrl+V วางรูปในหน้าต่างนี้)</label>
        <input id="issueImageFile" type="file" accept="image/*" class="issue-input" onchange="handleIssueImageChange(event)">
        <div id="issueImagePreview" class="issue-preview-box"></div>
      </div>

      <div style="display:flex; justify-content:flex-end;">
        <button type="submit" class="btn-submit-issue">บันทึกรายการ</button>
      </div>
    </form>

    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
      <div style="font-weight:700; color:var(--primary); font-size:0.95rem;">
        ${isDevAuthenticated ? `รายการแจ้งปัญหาทั้งหมด (${issues.length})` : `ติดตามสถานะการแก้ไข (${issues.length})`}
      </div>
      <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
        ${!isDevAuthenticated ? `
          <button type="button" class="btn-dev-access" onclick="toggleUserStatusTracker()">
            ${showUserStatusTracker ? 'ซ่อนสถานะ' : 'ติดตามสถานะที่แจ้งไว้'}
          </button>
        ` : ''}
        <button type="button" class="btn-dev-access" onclick="openDevLoginPrompt()">
          ${isDevAuthenticated ? 'ออกจาก Dev.' : 'Dev. Login'}
        </button>
      </div>
    </div>

    ${devLoginHtml}
    ${listSectionHtml}
  `;

  renderDraftImagePreview();
}

function openIssueTrackerModal() {
  showDevLoginForm = false;
  showUserStatusTracker = false;
  devLoginError = '';
  openDetailModal('แจ้งปัญหาและส่งข้อเสนอแนะ', '', { clearStack: true });
  renderIssueTrackerContent();
}

/* History & Parser Functions */
function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveHistory(items) {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(items));
  } catch (e) {
    // ignore storage quota error
  }
}

function formatTimeNow() {
  const now = new Date();
  return now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

function recordCurrentFlightToHistory() {
  const rawInput = document.getElementById('rawInput');
  const text = rawInput.value.trim();
  if (!text) return;

  const bannerText = document.getElementById('flightBanner').textContent.trim();
  const headerMatch = bannerText.match(/กระเป๋าต่อเครื่องเข้าเที่ยวบิน:\s*(.+)$/);
  const flightLabel = headerMatch ? headerMatch[1].trim() : '';
  const totalFlights = parseInt(document.getElementById('totalFlights').textContent, 10) || 0;

  if (!flightLabel && totalFlights === 0) return;

  const label = flightLabel || `รายการ (${totalFlights} ไฟลท์)`;
  const inter = document.getElementById('interTotal').textContent;
  const dom = document.getElementById('domTotal').textContent;
  const total = document.getElementById('grandTotal').textContent;

  const history = loadHistory().filter(item => item.label !== label);
  history.unshift({
    id: Date.now(),
    label,
    inter,
    dom,
    total,
    version: APP_VERSION,
    time: formatTimeNow(),
    rawText: rawInput.value
  });

  saveHistory(history.slice(0, MAX_HISTORY_ITEMS));
  renderSearchHistory();
}

function renderSearchHistory() {
  const container = document.getElementById('historyList');
  const history = loadHistory();

  if (history.length === 0) {
    container.innerHTML = '<div class="history-empty">ยังไม่มีประวัติไฟลท์ที่คำนวณ</div>';
    return;
  }

  container.innerHTML = history.map(item => `
    <div class="history-item">
      <button type="button" class="history-select" onclick="selectHistoryItem(${item.id})">
        <div class="history-title">${escapeHtml(item.label)}</div>
        <div class="history-meta">INTER: ${item.inter} · DOM: ${item.dom} · TOTAL: ${item.total} (${item.time})</div>
      </button>
      <button type="button" class="history-del" title="ลบรายการนี้" onclick="deleteHistoryItem(${item.id})">✕</button>
    </div>
  `).join('');
}

function selectHistoryItem(id) {
  const history = loadHistory();
  const target = history.find(item => item.id === id);
  if (!target) return;
  document.getElementById('rawInput').value = target.rawText;
  parseAlteaData();
}

function deleteHistoryItem(id) {
  const updated = loadHistory().filter(item => item.id !== id);
  saveHistory(updated);
  renderSearchHistory();
}

function clearSearchHistory() {
  saveHistory([]);
  renderSearchHistory();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeFlightNumber(rawFltnr) {
  const clean = rawFltnr.trim().toUpperCase();
  const match = clean.match(/^([A-Z0-9]{2})0*(\d+)([A-Z]{1,2})$/);
  if (match) {
    const digits = match[2] || '0';
    return `${match[1]}${digits}${match[3]}`;
  }
  const numOnly = clean.match(/^0*(\d+)([A-Z]{1,2})$/);
  if (numOnly) {
    return `${numOnly[1] || '0'}${numOnly[2]}`;
  }
  return clean;
}

function parseConxMinutes(conxStr) {
  const m = (conxStr || '').trim().toUpperCase().match(/^(-?)(\d{2})H(\d{2})$/);
  if (!m) return null;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10));
}

function getConxSeverity(conxMinutes) {
  if (conxMinutes === null) return null;
  if (conxMinutes < 0) return 'missed_conx';
  if (conxMinutes < 30) return 'danger';
  if (conxMinutes <= 60) return 'warn';
  if (conxMinutes > 360) return 'long';
  return null;
}

function getHighestSeverity(severities) {
  let best = null;
  let bestScore = 0;
  severities.forEach(sev => {
    const score = SEVERITY_PRIORITY[sev] || 0;
    if (score > bestScore) {
      bestScore = score;
      best = sev;
    }
  });
  return best;
}

function getAlertBadgeHtml(flight) {
  if (flight.conxSeverity === 'missed_conx') {
    return `<span class="badge badge-missed-conx">MISSED CONX (${flight.conxMinutes}m)</span>`;
  }
  if (flight.conxSeverity === 'danger') {
    return `<span class="badge badge-short-danger">MASSIVE CONX (${flight.conxMinutes}m)</span>`;
  }
  if (flight.conxSeverity === 'warn') {
    return `<span class="badge badge-short-warn">SHORT CONX (${flight.conxMinutes}m)</span>`;
  }
  if (flight.conxSeverity === 'long') {
    return `<span class="badge badge-long-success">ระยะเวลาต่อเครื่องมากกว่า 6 ชั่วโมง</span>`;
  }
  return `<span class="notice-ok">-</span>`;
}

function getStationAlertTagHtml(severity, alertCount) {
  if (!severity || alertCount === 0) return '';
  if (severity === 'missed_conx') {
    return `<span class="station-alert-tag badge-missed-conx">MISSED ${alertCount}</span>`;
  }
  if (severity === 'danger') {
    return `<span class="station-alert-tag badge-short-danger">MASSIVE &lt;30m (${alertCount})</span>`;
  }
  if (severity === 'warn') {
    return `<span class="station-alert-tag badge-short-warn">SHORT 30-60m (${alertCount})</span>`;
  }
  if (severity === 'long') {
    return `<span class="station-alert-tag badge-long-success">LONG &gt;6H (${alertCount})</span>`;
  }
  return '';
}

function isInterFlight(fltnr, dep) {
  const origin = (dep || '').trim().toUpperCase();
  if (origin && TH_DOMESTIC_AIRPORTS.has(origin)) {
    return false;
  }

  const match = fltnr.match(/^([A-Z0-9]{2})(\d+)([A-Z]{1,2})$/);
  if (!match) return true;

  const airline = match[1];
  const num = parseInt(match[2], 10);

  if (airline === 'TG' && num >= 100 && num <= 299) {
    return origin ? !TH_DOMESTIC_AIRPORTS.has(origin) : false;
  }

  return true;
}

function extractFlightHeaderInfo(line) {
  const cleaned = line.trim();
  const m = cleaned.match(/^([A-Z0-9]{2}\s*\d{1,4}[A-Z]{0,2})\s+(\d{1,2}[A-Z]{3}(?:\d{2,4})?)(?:\s+([A-Z]{3}))?(?:.*?\bSTD\s*:?\s*([A-E]?\d{4}))?(?:.*?\bGATE\s*:?\s*([A-Z0-9-]+))?/i);
  if (!m) return '';

  const flight = normalizeFlightNumber(m[1].replace(/\s+/g, ''));
  const date = m[2].toUpperCase();
  const parts = [flight, date];

  if (m[4]) parts.push(`STD ${m[4].toUpperCase()}`);
  if (m[5]) parts.push(`GATE ${m[5].toUpperCase()}`);

  return parts.join(' / ');
}

function parseAlteaData() {
  const text = document.getElementById('rawInput').value;
  const lines = text.split(/\r?\n/);

  let currentSection = 'NORMAL';
  let headerInfo = '';
  const flights = [];

  const flightRegex = /^\s*([A-Z0-9]{2}\d{1,4}[A-Z]{0,2})\s+([AE]?\d{4})\s+([A-Z]{3})\s+([A-Z]{3})\s+(-?\d{2}H\d{2})\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (!headerInfo && /^[A-Z0-9]{2}\s*\d{1,4}[A-Z]{0,2}\s+\d{1,2}[A-Z]{3}/i.test(line)) {
      headerInfo = extractFlightHeaderInfo(line);
    }

    if (line.includes('POTENTIALLY MISSED INBOUND CONNECTION')) {
      currentSection = 'MISSED';
      continue;
    }
    if (line.includes('INBOUND CONNECTION') && !line.includes('POTENTIALLY MISSED')) {
      currentSection = 'NORMAL';
      continue;
    }

    const match = line.match(flightRegex);
    if (match) {
      const fltnr = normalizeFlightNumber(match[1]);
      const sta = match[2].toUpperCase();
      const dep = match[3].toUpperCase();
      const dest = match[4].toUpperCase();
      const conx = match[5].toUpperCase();
      const conxMinutes = parseConxMinutes(conx);
      const conxSeverity = getConxSeverity(conxMinutes);
      const bagsTtl = parseInt(match[10], 10);
      const isMissed = (currentSection === 'MISSED');

      flights.push({
        id: flights.length,
        fltnr,
        sta,
        dep,
        dest,
        route: `${dep}-${dest}`,
        conx,
        conxMinutes,
        conxSeverity,
        isInter: isInterFlight(fltnr, dep),
        isMissed,
        sectionName: isMissed ? 'POTENTIALLY MISSED INBOUND CONNECTION' : 'INBOUND CONNECTION',
        bags: bagsTtl
      });
    }
  }

  currentParsedFlights = flights;
  currentHeaderInfo = headerInfo;
  renderResults(flights, headerInfo);
}

function renderResults(flights, headerInfo) {
  const banner = document.getElementById('flightBanner');
  if (headerInfo) {
    banner.style.display = 'block';
    banner.textContent = `กระเป๋าต่อเครื่องเข้าเที่ยวบิน: ${headerInfo}`;
  } else {
    banner.style.display = 'none';
  }

  let interBags = 0, interCount = 0;
  let domBags = 0, domCount = 0;
  const stationMap = {};

  flights.forEach(f => {
    if (f.isInter) {
      interBags += f.bags;
      interCount++;
    } else {
      domBags += f.bags;
      domCount++;
    }

    const key = `${f.dep}_${f.isInter ? 'INTER' : 'DOM'}`;
    if (!stationMap[key]) {
      stationMap[key] = {
        key,
        dep: f.dep,
        bags: 0,
        flightCount: 0,
        alertCount: 0,
        severities: [],
        isInter: f.isInter
      };
    }
    stationMap[key].bags += f.bags;
    stationMap[key].flightCount += 1;
    if (f.conxSeverity) {
      stationMap[key].severities.push(f.conxSeverity);
      stationMap[key].alertCount += 1;
    }
  });

  document.getElementById('interTotal').textContent = interBags;
  document.getElementById('interFlights').textContent = `${interCount} ไฟลท์`;
  document.getElementById('domTotal').textContent = domBags;
  document.getElementById('domFlights').textContent = `${domCount} ไฟลท์`;
  document.getElementById('grandTotal').textContent = interBags + domBags;
  document.getElementById('totalFlights').textContent = `${flights.length} ไฟลท์`;

  const stationContainer = document.getElementById('stationBreakdown');
  const stations = Object.values(stationMap).sort((a, b) => a.dep.localeCompare(b.dep));

  if (stations.length === 0) {
    stationContainer.innerHTML = '<div style="color:#94a3b8; font-size:0.86rem;">ไม่พบข้อมูลสถานีต้นทาง</div>';
  } else {
    stationContainer.innerHTML = stations.map(s => {
      const topSeverity = getHighestSeverity(s.severities);
      const alertClass = topSeverity ? `alert-${topSeverity}` : '';
      const alertTag = getStationAlertTagHtml(topSeverity, s.alertCount);
      return `
        <button type="button" class="station-item ${alertClass}" onclick="openStationPopup('${s.dep}', ${s.isInter})">
          <div>
            <div class="station-code">${s.dep}</div>
            <div class="station-meta">${s.flightCount} ไฟลท์ · ${s.isInter ? 'INTER' : 'DOM'}</div>
            ${alertTag}
          </div>
          <div class="station-bags ${s.isInter ? '' : 'dom-val'}">${s.bags}</div>
        </button>
      `;
    }).join('');
  }

  const tbody = document.getElementById('resultBody');
  tbody.innerHTML = '';

  if (flights.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:#94a3b8; padding: 26px;">ยังไม่มีข้อมูล — กรุณาวางข้อความในช่องด้านซ้าย</td></tr>';
    return;
  }

  const sortedFlights = [...flights].sort((a, b) => {
    const timeA = a.conxMinutes !== null ? a.conxMinutes : Number.MAX_SAFE_INTEGER;
    const timeB = b.conxMinutes !== null ? b.conxMinutes : Number.MAX_SAFE_INTEGER;
    return (timeA - timeB) || a.dep.localeCompare(b.dep) || a.fltnr.localeCompare(b.fltnr);
  });

  sortedFlights.forEach(f => {
    const rowAlert = f.conxSeverity;
    const badgeHtml = getAlertBadgeHtml(f);
    const noticeHtml = f.conxSeverity
      ? `<div class="notice-line">${badgeHtml}</div>`
      : badgeHtml;

    const tr = document.createElement('tr');
    tr.onclick = () => openFlightPopup(f.id, { clearStack: true });
    if (rowAlert === 'missed_conx') {
      tr.classList.add('missed-conx-row');
    } else if (rowAlert === 'danger') {
      tr.classList.add('short-danger-row');
    } else if (rowAlert === 'warn') {
      tr.classList.add('short-warn-row');
    } else if (rowAlert === 'long') {
      tr.classList.add('long-conn-row');
    }

    tr.innerHTML = `
      <td><strong>${f.dep}</strong></td>
      <td><strong>${f.fltnr}</strong></td>
      <td>${f.sta}</td>
      <td>${f.route}</td>
      <td><strong>${f.conx}</strong></td>
      <td><span class="badge ${f.isInter ? 'badge-inter' : 'badge-dom'}">${f.isInter ? 'INTER' : 'DOM'}</span></td>
      <td>${noticeHtml}</td>
      <td class="num">${f.bags}</td>
    `;
    tbody.appendChild(tr);
  });
}

function buildFlightListRowsHtml(list, showCategoryCol = false) {
  return list.map(f => {
    const rowAlert = f.conxSeverity ? `class="${
      f.conxSeverity === 'missed_conx' ? 'missed-conx-row' :
      f.conxSeverity === 'danger' ? 'short-danger-row' :
      f.conxSeverity === 'warn' ? 'short-warn-row' : 'long-conn-row'
    }"` : '';

    const categoryCell = showCategoryCol
      ? `<td><span class="badge ${f.isInter ? 'badge-inter' : 'badge-dom'}">${f.isInter ? 'INTER' : 'DOM'}</span></td>`
      : '';

    return `
      <tr ${rowAlert} onclick="openFlightPopup(${f.id}, { pushCurrent: true })" style="cursor:pointer;">
        <td><strong>${escapeHtml(f.dep)}</strong></td>
        <td><strong>${escapeHtml(f.fltnr)}</strong></td>
        <td>${escapeHtml(f.sta)}</td>
        <td>${escapeHtml(f.route)}</td>
        <td><strong>${escapeHtml(f.conx)}</strong></td>
        ${categoryCell}
        <td>${getAlertBadgeHtml(f)}</td>
        <td class="num">${f.bags}</td>
      </tr>
    `;
  }).join('');
}

function openCategoryPopup(category) {
  let filtered = [];
  let titleText = '';
  let categoryLabel = '';

  if (category === 'INTER') {
    filtered = currentParsedFlights.filter(f => f.isInter);
    titleText = 'รายการไฟลท์หมวด INTER BAGS';
    categoryLabel = 'INTER';
  } else if (category === 'DOM') {
    filtered = currentParsedFlights.filter(f => !f.isInter);
    titleText = 'รายการไฟลท์หมวด DOM BAGS';
    categoryLabel = 'DOM';
  } else {
    filtered = [...currentParsedFlights];
    titleText = 'รายการไฟลท์ทั้งหมด (รวม INTER + DOM)';
    categoryLabel = 'ALL (INTER + DOM)';
  }

  if (filtered.length === 0) return;

  const sorted = filtered.sort((a, b) => {
    const timeA = a.conxMinutes !== null ? a.conxMinutes : Number.MAX_SAFE_INTEGER;
    const timeB = b.conxMinutes !== null ? b.conxMinutes : Number.MAX_SAFE_INTEGER;
    return (timeA - timeB) || a.dep.localeCompare(b.dep) || a.fltnr.localeCompare(b.fltnr);
  });

  const totalBags = sorted.reduce((sum, item) => sum + item.bags, 0);
  const alertFlights = sorted.filter(item => item.conxSeverity);
  const rowsHtml = buildFlightListRowsHtml(sorted, category === 'ALL');
  const categoryHeader = category === 'ALL' ? '<th>ประเภท</th>' : '';

  const html = `
    <div class="modal-summary-strip">
      <span class="modal-pill">หมวดหมู่: ${escapeHtml(categoryLabel)}</span>
      <span class="modal-pill">รวมกระเป๋า: ${totalBags} ใบ</span>
      <span class="modal-pill">จำนวนไฟลท์: ${sorted.length} ลำ</span>
      <span class="modal-pill">ไฟลท์แจ้งเตือน: ${alertFlights.length} ลำ</span>
    </div>
    <div class="table-wrap" style="max-height:340px;">
      <table>
        <thead>
          <tr>
            <th>DEP</th>
            <th>FLIGHT NO.</th>
            <th>STA</th>
            <th>ROUTE</th>
            <th>CONX</th>
            ${categoryHeader}
            <th>แจ้งเตือน!</th>
            <th class="num">BAGS TTL</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  `;

  openDetailModal(titleText, html, { clearStack: true });
}

function openFlightPopup(flightId, options = {}) {
  const f = currentParsedFlights.find(item => item.id === flightId);
  if (!f) return;

  const conxMinutesText = f.conxMinutes !== null ? `${f.conxMinutes} นาที` : '-';
  const alertHtml = f.conxSeverity ? getAlertBadgeHtml(f) : '<span class="notice-ok">ปกติ (ไม่อยู่ในเงื่อนไขแจ้งเตือน)</span>';
  const targetText = currentHeaderInfo ? escapeHtml(currentHeaderInfo) : '-';

  const html = `
    <div class="modal-summary-strip">
      <span class="modal-pill">เที่ยวบินหลัก: ${targetText}</span>
      <span class="badge ${f.isInter ? 'badge-inter' : 'badge-dom'}">${f.isInter ? 'INTER' : 'DOM'}</span>
      ${alertHtml}
    </div>
    <div class="detail-grid">
      <div class="detail-box">
        <div class="detail-label">FLIGHT NO.</div>
        <div class="detail-val">${escapeHtml(f.fltnr)}</div>
      </div>
      <div class="detail-box">
        <div class="detail-label">BAGS TTL</div>
        <div class="detail-val">${f.bags} ใบ</div>
      </div>
      <div class="detail-box">
        <div class="detail-label">DEP / ROUTE</div>
        <div class="detail-val">${escapeHtml(f.dep)} (${escapeHtml(f.route)})</div>
      </div>
      <div class="detail-box">
        <div class="detail-label">STA</div>
        <div class="detail-val">${escapeHtml(f.sta)}</div>
      </div>
      <div class="detail-box">
        <div class="detail-label">CONX</div>
        <div class="detail-val">${escapeHtml(f.conx)} (${conxMinutesText})</div>
      </div>
      <div class="detail-box">
        <div class="detail-label">หมวดข้อมูลจาก Altea CM</div>
        <div class="detail-val" style="font-size:0.88rem;">${escapeHtml(f.sectionName)}</div>
      </div>
    </div>
  `;

  openDetailModal(`รายละเอียดไฟลท์ ${f.fltnr} (${f.dep})`, html, options);
}

function openStationPopup(dep, isInter) {
  const matching = currentParsedFlights
    .filter(f => f.dep === dep && f.isInter === isInter)
    .sort((a, b) => {
      const timeA = a.conxMinutes !== null ? a.conxMinutes : Number.MAX_SAFE_INTEGER;
      const timeB = b.conxMinutes !== null ? b.conxMinutes : Number.MAX_SAFE_INTEGER;
      return (timeA - timeB) || a.fltnr.localeCompare(b.fltnr);
    });

  if (matching.length === 0) return;

  const totalBags = matching.reduce((sum, item) => sum + item.bags, 0);
  const alertFlights = matching.filter(item => item.conxSeverity);

  const rowsHtml = matching.map(f => {
    const rowAlert = f.conxSeverity ? `class="${
      f.conxSeverity === 'missed_conx' ? 'missed-conx-row' :
      f.conxSeverity === 'danger' ? 'short-danger-row' :
      f.conxSeverity === 'warn' ? 'short-warn-row' : 'long-conn-row'
    }"` : '';

    return `
      <tr ${rowAlert} onclick="openFlightPopup(${f.id}, { pushCurrent: true })" style="cursor:pointer;">
        <td><strong>${escapeHtml(f.fltnr)}</strong></td>
        <td>${escapeHtml(f.sta)}</td>
        <td>${escapeHtml(f.route)}</td>
        <td><strong>${escapeHtml(f.conx)}</strong></td>
        <td>${getAlertBadgeHtml(f)}</td>
        <td class="num">${f.bags}</td>
      </tr>
    `;
  }).join('');

  const html = `
    <div class="modal-summary-strip">
      <span class="modal-pill">สถานีต้นทาง: ${escapeHtml(dep)} (${isInter ? 'INTER' : 'DOM'})</span>
      <span class="modal-pill">รวมกระเป๋า: ${totalBags} ใบ</span>
      <span class="modal-pill">จำนวนไฟลท์: ${matching.length} ลำ</span>
      <span class="modal-pill">ไฟลท์แจ้งเตือน: ${alertFlights.length} ลำ</span>
    </div>
    <div class="table-wrap" style="max-height:320px;">
      <table>
        <thead>
          <tr>
            <th>FLIGHT NO.</th>
            <th>STA</th>
            <th>ROUTE</th>
            <th>CONX</th>
            <th>แจ้งเตือน!</th>
            <th class="num">BAGS TTL</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  `;

  openDetailModal(`รายละเอียดสถานีต้นทาง ${dep} (${isInter ? 'INTER' : 'DOM'})`, html, { clearStack: true });
}

function clearAll() {
  document.getElementById('rawInput').value = '';
  parseAlteaData();
}

function initCalculator() {
  const rawInput = document.getElementById('rawInput');
  rawInput.addEventListener('input', () => {
    parseAlteaData();
    clearTimeout(saveHistoryTimer);
    saveHistoryTimer = setTimeout(recordCurrentFlightToHistory, 400);
  });

  document.addEventListener('paste', async (e) => {
    const isModalOpen = document.getElementById('detailModal').classList.contains('open');
    const descriptionEl = document.getElementById('issueDescription');
    if (!isModalOpen || !descriptionEl) return;

    const items = e.clipboardData && e.clipboardData.items ? Array.from(e.clipboardData.items) : [];
    const imageItem = items.find(item => item.type && item.type.startsWith('image/'));
    if (imageItem) {
      e.preventDefault();
      const file = imageItem.getAsFile();
      if (file) {
        draftIssueImageData = await compressImageFile(file);
        renderDraftImagePreview();
      }
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeDetailModal();
    }
  });

  updateIssueBadgeCount();
  renderSearchHistory();
}

initCalculator();