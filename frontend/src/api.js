// ===== API CLIENT =====
// Use the deployed backend URL if provided by Vercel, otherwise fallback to localhost for development
const API_BASE = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:3000/api');

function getToken() {
  return localStorage.getItem('jwt_token');
}

function getUser() {
  const u = localStorage.getItem('user');
  return u ? JSON.parse(u) : null;
}

function setAuth(token, user) {
  localStorage.setItem('jwt_token', token);
  localStorage.setItem('user', JSON.stringify(user));
}

function clearAuth() {
  localStorage.removeItem('jwt_token');
  localStorage.removeItem('user');
}

async function apiFetch(endpoint, options = {}) {
  const token = getToken();
  const headers = {
    ...(token && { Authorization: 'Bearer ' + token }),
    ...options.headers,
  };
  
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(API_BASE + endpoint, { ...options, headers });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    console.error(`[apiFetch] Expected JSON, got HTML from ${endpoint}. Response:`, text.substring(0, 500));
    throw new Error('Server returned an invalid response (HTML instead of JSON).');
  }
  
  if (!res.ok) throw new Error(data.error || 'Server Error');
  return data;
}

export const api = {
  auth: {
    login: async (email, password) => {
      const data = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      if (data.token) {
        setAuth(data.token, data.user);
      }
      return data;
    },
    setupRoot: (name, email, password, role) =>
      apiFetch('/auth/setup-root', {
        method: 'POST',
        body: JSON.stringify({ name, email, password, role }),
      }),
    logout: () => {
      clearAuth();
    },
    getUser,
    getToken,
    isLoggedIn: () => !!getToken(),
    changePassword: (currentPassword, newPassword) =>
      apiFetch('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      }),
    saveTheme: (theme) =>
      apiFetch('/auth/theme', {
        method: 'POST',
        body: JSON.stringify({ theme }),
      }),
    forgotPassword: (email) =>
      apiFetch('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),
    resetPassword: (email, otp, newPassword) =>
      apiFetch('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email, otp, newPassword }),
      }),
  },

  principal: {
    getDashboard: () => apiFetch('/principal/dashboard'),
    getDepartments: () => apiFetch('/principal/departments'),
    createDepartment: (name, hod_id) =>
      apiFetch('/principal/departments', {
        method: 'POST',
        body: JSON.stringify({ name, hod_id }),
      }),
    updateDepartment: (id, name, hod_id) =>
      apiFetch(`/principal/departments/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name, hod_id }),
      }),
    getHods: () => apiFetch('/principal/hods'),
    createHod: (name, email, password, department_id) =>
      apiFetch('/principal/create-hod', {
        method: 'POST',
        body: JSON.stringify({ name, email, password, department_id }),
      }),
    deleteHod: (id) =>
      apiFetch(`/principal/hods/${id}`, { method: 'DELETE' }),
    getEvents: (filters = {}) => {
      const params = new URLSearchParams();
      if (filters.department_id) params.set('department_id', filters.department_id);
      if (filters.status) params.set('status', filters.status);
      if (filters.year) params.set('year', filters.year);
      const qs = params.toString();
      return apiFetch(`/principal/events${qs ? '?' + qs : ''}`);
    },
    getDepartmentEvents: (deptId) => apiFetch(`/principal/departments/${deptId}/events`),
    getEventDetails: (eventId) => apiFetch(`/principal/events/${eventId}`),
    getReports: () => apiFetch('/principal/reports'),
    getLogs: () => apiFetch('/principal/logs'),
    getCalendar: (filters = {}) => {
      const params = new URLSearchParams();
      if (filters.month) params.set('month', filters.month);
      if (filters.year) params.set('year', filters.year);
      if (filters.department_id) params.set('department_id', filters.department_id);
      const qs = params.toString();
      return apiFetch(`/principal/calendar${qs ? '?' + qs : ''}`);
    },
    getSchedules: (filters = {}) => {
      const params = new URLSearchParams();
      if (filters.academic_year) params.set('academic_year', filters.academic_year);
      if (filters.department_id) params.set('department_id', filters.department_id);
      const qs = params.toString();
      return apiFetch(`/principal/schedules${qs ? '?' + qs : ''}`);
    },
    getDeptEventChart: (deptId) => apiFetch(`/principal/departments/${deptId}/event-chart`),
    getCategoriesOverview: (filters = {}) => {
      const params = new URLSearchParams();
      if (filters.department_id) params.set('department_id', filters.department_id);
      const qs = params.toString();
      return apiFetch(`/principal/categories-overview${qs ? '?' + qs : ''}`);
    },
  },

  hod: {
    getDashboard: (year) => apiFetch(year ? `/hod/dashboard?year=${year}` : '/hod/dashboard'),
    getCategories: () => apiFetch('/hod/categories'),
    createCategory: (name) =>
      apiFetch('/hod/categories', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    bulkUploadCategories: (categories) =>
      apiFetch('/hod/categories/bulk', {
        method: 'POST',
        body: JSON.stringify({ categories }),
      }),
    editCategory: (id, name) =>
      apiFetch(`/hod/categories/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name }),
      }),
    deleteCategory: (id) =>
      apiFetch(`/hod/categories/${id}`, { method: 'DELETE' }),
    createSubcategory: (name, category_id) =>
      apiFetch('/hod/subcategories', {
        method: 'POST',
        body: JSON.stringify({ name, category_id }),
      }),
    editSubcategory: (id, name) =>
      apiFetch(`/hod/subcategories/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name }),
      }),
    deleteSubcategory: (id) =>
      apiFetch(`/hod/subcategories/${id}`, { method: 'DELETE' }),
    getEvents: (filters = {}) => {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.year) params.set('year', filters.year);
      const qs = params.toString();
      return apiFetch(`/hod/events${qs ? '?' + qs : ''}`);
    },
    getGlobalEvents: (filters = {}) => {
      const params = new URLSearchParams();
      if (filters.department_id) params.set('department_id', filters.department_id);
      if (filters.status) params.set('status', filters.status);
      if (filters.year) params.set('year', filters.year);
      const qs = params.toString();
      return apiFetch(`/hod/global-events${qs ? '?' + qs : ''}`);
    },
    getEventDetails: (id) => apiFetch(`/hod/events/${id}`),
    reviewEvent: (id, status) =>
      apiFetch(`/hod/events/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      }),
    verifyEvent: (id, action) =>
      apiFetch(`/hod/events/${id}/verify`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      }),
    triggerAI: (id) =>
      apiFetch(`/hod/events/${id}/trigger-ai`, { method: 'POST' }),
    getLogs: (year) => apiFetch(year ? `/hod/logs?year=${year}` : '/hod/logs'),
    getDepartments: () => apiFetch('/hod/departments'),
    getAdmins: () => apiFetch('/hod/admins'),
    createAdmin: (name, email, password) =>
      apiFetch('/hod/create-admin', {
        method: 'POST',
        body: JSON.stringify({ name, email, password }),
      }),
    deleteAdmin: (id) =>
      apiFetch(`/hod/admins/${id}`, { method: 'DELETE' }),
    getCalendar: (filters = {}) => {
      const params = new URLSearchParams();
      if (filters.month) params.set('month', filters.month);
      if (filters.year) params.set('year', filters.year);
      if (filters.department_id) params.set('department_id', filters.department_id);
      if (filters.academic_year) params.set('academic_year', filters.academic_year);
      return apiFetch('/hod/calendar?' + params.toString());
    },
    getAllDepartments: () => apiFetch('/hod/departments/all'),
    getSchedules: (academicYear) => {
      const params = new URLSearchParams();
      if (academicYear) params.set('academic_year', academicYear);
      const qs = params.toString();
      return apiFetch(`/hod/schedules${qs ? '?' + qs : ''}`);
    },
    createSchedule: (payload) =>
      apiFetch('/hod/schedules', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    deleteSchedule: (id) =>
      apiFetch(`/hod/schedules/${id}`, { method: 'DELETE' }),
  },

  admin: {
    getCategories: () => apiFetch('/admin/categories'),
    getDashboard: (year) => apiFetch(year ? `/admin/dashboard?year=${year}` : '/admin/dashboard'),
    getEvents: (filters = {}) => {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.year) params.set('year', filters.year);
      const qs = params.toString();
      return apiFetch(`/admin/events${qs ? '?' + qs : ''}`);
    },
    getParticipants: (id) => apiFetch(`/admin/events/${id}/participants`),
    getFeedbacks: (id) => apiFetch(`/admin/events/${id}/feedbacks`),
    getEventDetails: (id) => apiFetch(`/admin/events/${id}`),
    createEvent: (payload) =>
      apiFetch('/admin/events', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    updateEvent: (id, payload) =>
      apiFetch(`/admin/events/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    deleteEvent: (id) =>
      apiFetch(`/admin/events/${id}`, { method: 'DELETE' }),
    submitForApproval: (id) =>
      apiFetch(`/admin/events/${id}/submit-approval`, { method: 'POST' }),
    markCompleted: (id) =>
      apiFetch(`/admin/events/${id}/mark-completed`, { method: 'POST' }),
    configureForm: (eventId, type, fields, is_active) =>
      apiFetch(`/admin/events/${eventId}/forms`, {
        method: 'POST',
        body: JSON.stringify({ type, fields, is_active }),
      }),
    uploadMedia: (eventId, formData) =>
      apiFetch(`/admin/events/${eventId}/media`, {
        method: 'POST',
        body: formData,
      }),
    uploadMediaUrl: (eventId, type, url) =>
      apiFetch(`/admin/events/${eventId}/media-url`, {
        method: 'POST',
        body: JSON.stringify({ type, url }),
      }),
    deleteMedia: (mediaId) =>
      apiFetch(`/admin/media/${mediaId}`, { method: 'DELETE' }),
    getParticipants: (eventId) =>
      apiFetch(`/admin/events/${eventId}/participants`),
    getFeedbacks: (eventId) =>
      apiFetch(`/admin/events/${eventId}/feedbacks`),
    aiEvaluate: (eventId) =>
      apiFetch(`/admin/events/${eventId}/ai-evaluate`, { method: 'POST' }),
    toggleAttendance: (participantId, present) =>
      apiFetch(`/admin/participants/${participantId}/attendance`, {
        method: 'PUT',
        body: JSON.stringify({ present }),
      }),
    getSchedules: (academicYear) => {
      const params = new URLSearchParams();
      if (academicYear) params.set('academic_year', academicYear);
      const qs = params.toString();
      return apiFetch(`/admin/schedules${qs ? '?' + qs : ''}`);
    },
  },

  public: {
    getFormConfig: (hash) =>
      apiFetch(`/public/forms/${hash}`, { isPublic: true }),
    sendOtp: (hash, email) =>
      apiFetch(`/public/forms/${hash}/send-otp`, {
        method: 'POST',
        body: JSON.stringify({ email }),
        isPublic: true
      }),
    verifyOtp: (hash, email, otp) =>
      apiFetch(`/public/forms/${hash}/verify-otp`, {
        method: 'POST',
        body: JSON.stringify({ email, otp }),
        isPublic: true
      }),
    submitForm: (hash, payload) =>
      apiFetch(`/public/forms/${hash}/submit`, {
        method: 'POST',
        body: JSON.stringify(payload),
        isPublic: true
      }),
    getUpcomingEvents: () =>
      apiFetch('/public/upcoming-events', { isPublic: true }),
  }
};
