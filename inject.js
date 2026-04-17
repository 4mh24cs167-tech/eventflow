const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const apiBase = 'http://localhost:3000/api';

const fetchWrapper = `
<script>
// --- Event Management API Fetch Wrappers ---
const API_BASE = '${apiBase}';

async function authLogin(email, password) {
    try {
        const res = await fetch(API_BASE + '/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if(res.ok && data.token) {
            localStorage.setItem('jwt_token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            return data;
        } else {
            throw new Error(data.error);
        }
    } catch(err) {
        console.error('Login Error:', err);
        alert('Login failed: ' + err.message);
    }
}

async function apiFetch(endpoint, options = {}) {
    const token = localStorage.getItem('jwt_token');
    if(!token) {
        console.warn('No authentication token found! Please login.');
    }
    
    const headers = {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': 'Bearer ' + token }),
        ...options.headers
    };
    
    try {
        const res = await fetch(API_BASE + endpoint, { ...options, headers });
        const data = await res.json();
        if(!res.ok) throw new Error(data.error || 'Server Error');
        return data;
    } catch (err) {
        console.error('API Error (' + endpoint + '):', err.message);
        throw err;
    }
}

// These functions map directly to the backend capabilities
window.EMS_API = {
    login: authLogin,
    principal: {
        getDashboard: () => apiFetch('/principal/dashboard'),
        getEvents: () => apiFetch('/principal/events'),
        createDepartment: (name, hod_id) => apiFetch('/principal/departments', { method: 'POST', body: JSON.stringify({name, hod_id}) })
    },
    hod: {
        getEvents: () => apiFetch('/hod/events'),
        createCategory: (name) => apiFetch('/hod/categories', { method: 'POST', body: JSON.stringify({name}) }),
        reviewEvent: (id, status) => apiFetch('/hod/events/' + id + '/review', { method: 'POST', body: JSON.stringify({status}) }),
        triggerAI: (id) => apiFetch('/hod/events/' + id + '/trigger-ai', { method: 'POST' })
    },
    admin: {
        createEvent: (payload) => apiFetch('/admin/events', { method: 'POST', body: JSON.stringify(payload) }),
        configureForm: (eventId, type, fields) => apiFetch('/admin/events/' + eventId + '/forms', { method: 'POST', body: JSON.stringify({type, fields}) }),
        uploadMedia: (eventId, type, url) => apiFetch('/admin/events/' + eventId + '/media', { method: 'POST', body: JSON.stringify({type, url}) })
    }
};

document.addEventListener('DOMContentLoaded', () => {
    console.log("EMS API Client Initialized. Available at window.EMS_API");
    // Connect your UI buttons to window.EMS_API methods without changing HTML classes!
});
</script>
</body>`;

function walkDir(dir) {
    fs.readdirSync(dir).forEach(file => {
        let fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory() && !fullPath.includes('backend') && !fullPath.includes('.gemini')) {
            walkDir(fullPath);
        } else if (file === 'code.html') {
            let content = fs.readFileSync(fullPath, 'utf8');
            if (!content.includes('EMS API Client Initialized')) {
                // Ensure we place it before </body> or </html>
                if (content.includes('</body>')) {
                    content = content.replace('</body>', fetchWrapper);
                } else {
                    content += fetchWrapper;
                }
                fs.writeFileSync(fullPath, content);
                console.log('Injected fetch wrapper into:', fullPath);
            }
        }
    });
}

walkDir(rootDir);
