class API {
    constructor() {
        this.baseURL = window.location.origin;
        this.token = localStorage.getItem('auth_token');
        this.csrfToken = this.getCSRFToken();
    }

    getCSRFToken() {
        const cookieValue = document.cookie
            .split('; ')
            .find(row => row.startsWith('XSRF-TOKEN='))
            ?.split('=')[1];
        return cookieValue ? decodeURIComponent(cookieValue) : null;
    }

    getHeaders(contentType = 'application/json') {
        const headers = {
            'Accept': 'application/json'
        };

        if (contentType) {
            headers['Content-Type'] = contentType;
        }

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        if (this.csrfToken) {
            headers['X-CSRF-Token'] = this.csrfToken;
        }

        return headers;
    }

    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        
        const defaultOptions = {
            credentials: 'include',
            headers: this.getHeaders(options.contentType),
            ...options
        };

        try {
            const response = await fetch(url, defaultOptions);
            
            // Handle token refresh
            if (response.status === 401 && endpoint !== '/api/auth/refresh') {
                const refreshed = await this.refreshToken();
                if (refreshed) {
                    defaultOptions.headers['Authorization'] = `Bearer ${this.token}`;
                    return await fetch(url, defaultOptions);
                }
            }

            return response;
        } catch (error) {
            console.error('API Request failed:', error);
            throw error;
        }
    }

    async refreshToken() {
        try {
            const response = await this.request('/api/auth/refresh', {
                method: 'POST'
            });

            if (response.ok) {
                const data = await response.json();
                this.setToken(data.data.token);
                return true;
            }
        } catch (error) {
            console.error('Token refresh failed:', error);
            this.logout();
            return false;
        }
    }

    setToken(token) {
        this.token = token;
        localStorage.setItem('auth_token', token);
    }

    clearToken() {
        this.token = null;
        localStorage.removeItem('auth_token');
    }

    logout() {
        this.clearToken();
        window.location.href = '/';
    }

    // Auth endpoints
    async login(email, password, totpCode = null) {
        const data = { email, password };
        if (totpCode) data.totpCode = totpCode;

        const response = await this.request('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify(data)
        });

        const result = await response.json();
        
        if (result.success && result.data.token) {
            this.setToken(result.data.token);
        }

        return result;
    }

    async register(userData) {
        const response = await this.request('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify(userData)
        });

        const result = await response.json();
        
        if (result.success && result.data.token) {
            this.setToken(result.data.token);
        }

        return result;
    }

    async logout() {
        const response = await this.request('/api/auth/logout', {
            method: 'POST'
        });

        this.clearToken();
        return await response.json();
    }

    // User endpoints
    async getProfile() {
        const response = await this.request('/api/user/profile');
        return await response.json();
    }

    async updateProfile(profileData) {
        const response = await this.request('/api/user/profile', {
            method: 'PUT',
            body: JSON.stringify(profileData)
        });
        return await response.json();
    }

    async updatePassword(currentPassword, newPassword) {
        const response = await this.request('/api/user/password', {
            method: 'PUT',
            body: JSON.stringify({ currentPassword, newPassword })
        });
        return await response.json();
    }

    // Banking endpoints
    async getAccounts() {
        const response = await this.request('/api/banking/accounts');
        return await response.json();
    }

    async createAccount(accountData) {
        const response = await this.request('/api/banking/accounts', {
            method: 'POST',
            body: JSON.stringify(accountData)
        });
        return await response.json();
    }

    async transferFunds(transferData) {
        const response = await this.request('/api/banking/transfer', {
            method: 'POST',
            body: JSON.stringify(transferData)
        });
        return await response.json();
    }

    async getTransactions(accountId = null, limit = 50, offset = 0) {
        let url = `/api/banking/transactions?limit=${limit}&offset=${offset}`;
        if (accountId) url += `&account_id=${accountId}`;
        
        const response = await this.request(url);
        return await response.json();
    }

    async getBalance(accountId = null) {
        let url = '/api/banking/balance';
        if (accountId) url += `?account_id=${accountId}`;
        
        const response = await this.request(url);
        return await response.json();
    }

    // Loan endpoints
    async applyForLoan(loanData) {
        const response = await this.request('/api/loans/apply', {
            method: 'POST',
            body: JSON.stringify(loanData)
        });
        return await response.json();
    }

    async getMyLoans() {
        const response = await this.request('/api/loans/my-loans');
        return await response.json();
    }

    async calculateEMI(data) {
        const response = await this.request('/api/loans/calculate-emi', {
            method: 'POST',
            body: JSON.stringify(data)
        });
        return await response.json();
    }

    // Utility methods
    async uploadFile(file, endpoint) {
        const formData = new FormData();
        formData.append('file', file);

        const response = await this.request(endpoint, {
            method: 'POST',
            body: formData,
            contentType: null
        });

        return await response.json();
    }

    async downloadStatement(accountId, startDate, endDate) {
        const response = await this.request('/api/banking/statement', {
            method: 'POST',
            body: JSON.stringify({ account_id: accountId, start_date: startDate, end_date: endDate })
        });
        
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `statement_${accountId}_${startDate}_${endDate}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        }
        
        return response;
    }

    // Error handling
    handleError(error) {
        console.error('API Error:', error);
        
        if (error.response) {
            switch (error.response.status) {
                case 401:
                    this.logout();
                    break;
                case 403:
                    showToast('Access denied', 'error');
                    break;
                case 429:
                    showToast('Too many requests. Please try again later.', 'warning');
                    break;
                case 500:
                    showToast('Server error. Please try again later.', 'error');
                    break;
                default:
                    showToast('An error occurred', 'error');
            }
        } else if (error.request) {
            showToast('Network error. Please check your connection.', 'error');
        } else {
            showToast('An unexpected error occurred', 'error');
        }
    }
}

// Create global API instance
const api = new API();

// Utility function to show toast messages
function showToast(message, type = 'info', duration = 5000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${getToastIcon(type)}</span>
        <div class="toast-content">
            <div class="toast-title">${getToastTitle(type)}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close">&times;</button>
    `;

    container.appendChild(toast);

    // Auto remove after duration
    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, duration);

    // Close button
    toast.querySelector('.toast-close').addEventListener('click', () => {
        toast.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    });
}

function getToastIcon(type) {
    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };
    return icons[type] || icons.info;
}

function getToastTitle(type) {
    const titles = {
        success: 'Success',
        error: 'Error',
        warning: 'Warning',
        info: 'Info'
    };
    return titles[type] || titles.info;
}

// Add slideOutRight animation
const style = document.createElement('style');
style.textContent = `
    @keyframes slideOutRight {
        from {
            opacity: 1;
            transform: translateX(0);
        }
        to {
            opacity: 0;
            transform: translateX(100%);
        }
    }
`;
document.head.appendChild(style);