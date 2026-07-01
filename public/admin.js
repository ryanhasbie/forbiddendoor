const layout = document.querySelector('.app-layout');
const overlay = document.getElementById('sidebar-overlay');
const toggle = document.getElementById('sidebar-toggle');

function isMobileView() {
  return window.matchMedia('(max-width: 767px)').matches;
}

function isTabletPortrait() {
  return window.matchMedia('(min-width: 768px) and (max-width: 1023px) and (orientation: portrait)').matches;
}

function shouldUseOverlaySidebar() {
  return isMobileView() || isTabletPortrait();
}

function openSidebar() {
  if (!layout) return;
  layout.classList.add('sidebar-open');
  document.body.classList.add('no-scroll');
}

function closeSidebar() {
  if (!layout) return;
  layout.classList.remove('sidebar-open');
  document.body.classList.remove('no-scroll');
}

function toggleSidebar() {
  if (layout?.classList.contains('sidebar-open')) closeSidebar();
  else openSidebar();
}

function showPanel(panelId) {
  document.querySelectorAll('.panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === panelId);
  });
  document.querySelectorAll('.nav-item[data-panel]').forEach((item) => {
    item.classList.toggle('active', item.dataset.panel === panelId);
  });
  if (shouldUseOverlaySidebar()) closeSidebar();
}

document.querySelectorAll('.nav-item[data-panel]').forEach((item) => {
  item.addEventListener('click', () => showPanel(item.dataset.panel));
});

if (toggle) toggle.addEventListener('click', toggleSidebar);
if (overlay) overlay.addEventListener('click', closeSidebar);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeSidebar();
});

window.addEventListener('resize', () => {
  if (!shouldUseOverlaySidebar()) closeSidebar();
});

document.querySelectorAll('.settle-form').forEach((form) => {
  form.addEventListener('submit', (event) => {
    const selected = form.querySelector('input[name="result"]:checked');
    if (!selected) {
      event.preventDefault();
      alert('Pilih hasil pertandingan terlebih dahulu.');
      return;
    }

    const teamA = form.dataset.teamA;
    const teamB = form.dataset.teamB;
    const resultLabels = {
      home: `${teamA} menang`,
      draw: 'Seri',
      away: `${teamB} menang`,
    };

    const message =
      `Yakin proses hasil "${teamA} vs ${teamB}" sebagai ${resultLabels[selected.value]}?\n\n` +
      'Tindakan ini TIDAK BISA dibatalkan.';

    if (!confirm(message)) event.preventDefault();
  });
});

const adminAccountForm = document.getElementById('admin-account-form');
if (adminAccountForm) {
  adminAccountForm.addEventListener('submit', (event) => {
    const newUsername = adminAccountForm.querySelector('[name="new_username"]')?.value.trim();
    const newPassword = adminAccountForm.querySelector('[name="new_password"]')?.value || '';
    const confirmPassword = adminAccountForm.querySelector('[name="confirm_password"]')?.value || '';

    if (!newUsername && !newPassword) {
      event.preventDefault();
      alert('Isi username baru dan/atau password baru.');
      return;
    }
    if (newPassword && newPassword !== confirmPassword) {
      event.preventDefault();
      alert('Konfirmasi password tidak cocok.');
      return;
    }
    if (newPassword && newPassword.length < 6) {
      event.preventDefault();
      alert('Password baru minimal 6 karakter.');
    }
  });
}

document.querySelectorAll('.delete-history-form').forEach((form) => {
  form.addEventListener('submit', (event) => {
    const label = form.dataset.label || 'riwayat ini';
    const message =
      `Yakin hapus ${label}?\n\n` +
      'Tindakan ini tidak bisa dibatalkan. Koin user bisa disesuaikan otomatis jika perlu.';
    if (!confirm(message)) event.preventDefault();
  });
});

document.querySelectorAll('.delete-user-form').forEach((form) => {
  form.addEventListener('submit', (event) => {
    const btn = form.querySelector('button[data-username]');
    const name = btn?.dataset.username || 'user ini';
    const message =
      `Yakin hapus user "@${name}"?\n\n` +
      'Semua data (koin, tebakan, top-up, redeem) ikut terhapus.';
    if (!confirm(message)) event.preventDefault();
  });
});

const initialPanelId = document.body.dataset.initialPanel || 'panel-topup';
const initialPanel = document.getElementById(initialPanelId) ? initialPanelId : 'panel-topup';
showPanel(initialPanel);