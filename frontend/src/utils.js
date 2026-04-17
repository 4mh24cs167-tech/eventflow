// ===== TOAST NOTIFICATION SYSTEM =====
let toastContainer = null;

function ensureContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }
}

export function showToast(message, type = 'info') {
  ensureContainer();

  const icons = {
    success: 'check_circle',
    error: 'error',
    info: 'info',
  };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="material-symbols-outlined" style="font-size: 18px;">${icons[type] || 'info'}</span>
    <span>${message}</span>
  `;

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ===== HELPER UTILITIES =====
export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function getStatusClass(status) {
  const map = {
    APPROVED: 'status-approved',
    PENDING_APPROVAL: 'status-pending',
    DRAFT: 'status-draft',
    REJECTED: 'status-rejected',
    COMPLETED: 'status-completed',
  };
  return map[status] || 'status-draft';
}

export function getStatusLabel(status) {
  const map = {
    APPROVED: 'Approved',
    PENDING_APPROVAL: 'Pending',
    DRAFT: 'Draft',
    REJECTED: 'Rejected',
    COMPLETED: 'Completed',
  };
  return map[status] || status;
}

export function getUserInitials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}
