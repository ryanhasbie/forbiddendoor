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
  if (layout?.classList.contains('sidebar-open')) {
    closeSidebar();
  } else {
    openSidebar();
  }
}

function showPanel(panelId) {
  document.querySelectorAll('.panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === panelId);
  });
  document.querySelectorAll('.nav-item[data-panel]').forEach((item) => {
    item.classList.toggle('active', item.dataset.panel === panelId);
  });
  if (shouldUseOverlaySidebar()) {
    closeSidebar();
  }
}

document.querySelectorAll('.nav-item[data-panel]').forEach((item) => {
  item.addEventListener('click', () => showPanel(item.dataset.panel));
});

if (toggle) {
  toggle.addEventListener('click', toggleSidebar);
}

if (overlay) {
  overlay.addEventListener('click', closeSidebar);
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeSidebar();
});

window.addEventListener('resize', () => {
  if (!shouldUseOverlaySidebar()) {
    closeSidebar();
  }
});

const redeemForm = document.getElementById('redeem-form');
if (redeemForm) {
  const balance = parseInt(redeemForm.dataset.balance, 10) || 0;
  const packageSelect = redeemForm.querySelector('select[name="package"]');
  if (packageSelect) {
    const firstAvailable = Array.from(packageSelect.options).find((opt) => !opt.disabled);
    if (firstAvailable) packageSelect.value = firstAvailable.value;
  }
  redeemForm.addEventListener('submit', (event) => {
    const select = redeemForm.querySelector('select[name="package"]');
    const selected = select?.selectedOptions[0];
    const required = parseInt(selected?.dataset.coins, 10);
    if (!selected || selected.disabled) {
      event.preventDefault();
      alert('Pilih paket redeem yang tersedia.');
      return;
    }
    if (!required || balance < required) {
      event.preventDefault();
      alert(`Koin tidak cukup. Saldo ${balance} koin, butuh ${required} koin.`);
    }
  });
}

const initialPanelId = document.body.dataset.initialPanel || 'panel-beli';
const initialPanel = document.getElementById(initialPanelId) ? initialPanelId : 'panel-beli';
showPanel(initialPanel);