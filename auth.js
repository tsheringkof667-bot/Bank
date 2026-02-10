class AuthManager {
    constructor() {
        this.api = api;
        this.currentForm = 'login';
        this.requiresTOTP = false;
        
        this.init();
    }

    init() {
        this.bindEvents();
        this.checkAuth();
        this.setupPasswordStrength();
        this.setupPasswordToggle();
    }

    bindEvents() {
        // Form toggle
        document.querySelectorAll('.toggle-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchForm(e.target.dataset.form));
        });

        // Switch form links
        document.querySelectorAll('.switch-form').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchForm(e.target.dataset.form);
            });
        });

        // Login form
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        }

        // Register form
        const registerForm = document.getElementById('registerForm');
        if (registerForm) {
            registerForm.addEventListener('submit', (e) => this.handleRegister(e));
        }

        // Forgot password
        const forgotPassword = document.getElementById('forgotPassword');
        if (forgotPassword) {
            forgotPassword.addEventListener('click', (e) => {
                e.preventDefault();
                this.showForgotPassword();
            });
        }

        // TOTP verification
        const verifyTOTP = document.getElementById('verifyTOTP');
        if (verifyTOTP) {
            verifyTOTP.addEventListener('click', () => this.verifyTOTPSetup());
        }

        // Modal close
        const modalClose = document.querySelector('.modal-close');
        if (modalClose) {
            modalClose.addEventListener('click', () => this.closeModal());
        }
    }

    checkAuth() {
        const token = localStorage.getItem('auth_token');
        if (token) {
            // Validate token and redirect if valid
            this.validateToken(token);
        }
    }

    async validateToken(token) {
        try {
            const response = await fetch('/api/auth/validate', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                window.location.href = '/dashboard.html';
            }
        } catch (error) {
            // Token is invalid, stay on login page
            localStorage.removeItem('auth_token');
        }
    }

    switchForm(formType) {
        this.currentForm = formType;
        
        // Update toggle buttons
        document.querySelectorAll('.toggle-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.form === formType);
        });

        // Switch forms
        document.querySelectorAll('.auth-form').forEach(form => {
            form.classList.toggle('active', form.id === `${formType}Form`);
        });

        // Reset form states
        this.resetForms();
    }

    resetForms() {
        // Clear all errors
        document.querySelectorAll('.error-message').forEach(el => {
            el.textContent = '';
        });

        // Clear all inputs
        document.querySelectorAll('input').forEach(input => {
            input.classList.remove('error');
        });

        // Hide TOTP field
        const totpGroup = document.getElementById('totpGroup');
        if (totpGroup) {
            totpGroup.style.display = 'none';
        }
    }

    async handleLogin(e) {
        e.preventDefault();
        
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        const totpCode = document.getElementById('loginTOTP')?.value || null;
        const rememberMe = document.getElementById('rememberMe').checked;

        // Validate inputs
        if (!this.validateEmail(email)) {
            this.showError('loginEmailError', 'Please enter a valid email address');
            return;
        }

        if (!password) {
            this.showError('loginPasswordError', 'Please enter your password');
            return;
        }

        // Show loading
        const submitBtn = e.target.querySelector('.btn-primary');
        this.setButtonLoading(submitBtn, true);

        try {
            const result = await this.api.login(email, password, totpCode);

            if (result.success) {
                showToast('Login successful!', 'success');
                
                if (rememberMe) {
                    localStorage.setItem('remember_me', 'true');
                }

                // Redirect to dashboard
                setTimeout(() => {
                    window.location.href = '/dashboard.html';
                }, 1000);
            } else {
                if (result.requiresTOTP) {
                    // Show TOTP field
                    const totpGroup = document.getElementById('totpGroup');
                    if (totpGroup) {
                        totpGroup.style.display = 'block';
                        totpGroup.querySelector('input').focus();
                    }
                } else {
                    showToast(result.message || 'Login failed', 'error');
                }
            }
        } catch (error) {
            console.error('Login error:', error);
            showToast('An error occurred during login', 'error');
        } finally {
            this.setButtonLoading(submitBtn, false);
        }
    }

    async handleRegister(e) {
        e.preventDefault();
        
        const formData = {
            first_name: document.getElementById('firstName').value,
            last_name: document.getElementById('lastName').value,
            email: document.getElementById('registerEmail').value,
            password: document.getElementById('registerPassword').value,
            confirmPassword: document.getElementById('confirmPassword').value,
            phone: document.getElementById('phone').value,
            date_of_birth: document.getElementById('dob')?.value || '',
            address: document.getElementById('address')?.value || ''
        };

        // Validate form
        if (!this.validateRegisterForm(formData)) {
            return;
        }

        // Show loading
        const submitBtn = e.target.querySelector('.btn-primary');
        this.setButtonLoading(submitBtn, true);

        try {
            const result = await this.api.register(formData);

            if (result.success) {
                showToast('Registration successful!', 'success');
                
                // Show TOTP setup modal if TOTP data is returned
                if (result.data.totp) {
                    this.showTOTPSetupModal(result.data.totp);
                } else {
                    // Redirect to dashboard
                    setTimeout(() => {
                        window.location.href = '/dashboard.html';
                    }, 1000);
                }
            } else {
                showToast(result.message || 'Registration failed', 'error');
                
                // Show specific field errors
                if (result.errors) {
                    result.errors.forEach(error => {
                        const fieldId = error.field + 'Error';
                        this.showError(fieldId, error.message);
                    });
                }
            }
        } catch (error) {
            console.error('Registration error:', error);
            showToast('An error occurred during registration', 'error');
        } finally {
            this.setButtonLoading(submitBtn, false);
        }
    }

    validateRegisterForm(data) {
        let isValid = true;

        // Clear previous errors
        this.clearErrors();

        // Validate first name
        if (!data.first_name.trim()) {
            this.showError('firstNameError', 'First name is required');
            isValid = false;
        }

        // Validate last name
        if (!data.last_name.trim()) {
            this.showError('lastNameError', 'Last name is required');
            isValid = false;
        }

        // Validate email
        if (!this.validateEmail(data.email)) {
            this.showError('registerEmailError', 'Please enter a valid email address');
            isValid = false;
        }

        // Validate password
        const passwordStrength = this.checkPasswordStrength(data.password);
        if (passwordStrength.score < 2) {
            this.showError('registerPasswordError', 'Password is too weak');
            isValid = false;
        }

        // Validate password confirmation
        if (data.password !== data.confirmPassword) {
            this.showError('confirmPasswordError', 'Passwords do not match');
            isValid = false;
        }

        // Validate phone (optional but if provided, validate format)
        if (data.phone && !this.validatePhone(data.phone)) {
            this.showError('phoneError', 'Please enter a valid phone number');
            isValid = false;
        }

        // Validate terms agreement
        const termsAgree = document.getElementById('termsAgree');
        if (!termsAgree.checked) {
            this.showError('termsError', 'You must agree to the terms and conditions');
            isValid = false;
        }

        return isValid;
    }

    validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }

    validatePhone(phone) {
        const re = /^[\+]?[1-9][\d]{0,15}$/;
        return re.test(phone.replace(/\s/g, ''));
    }

    checkPasswordStrength(password) {
        let score = 0;
        const feedback = [];

        // Length check
        if (password.length >= 8) score++;
        else feedback.push('At least 8 characters');

        // Lowercase check
        if (/[a-z]/.test(password)) score++;
        else feedback.push('At least one lowercase letter');

        // Uppercase check
        if (/[A-Z]/.test(password)) score++;
        else feedback.push('At least one uppercase letter');

        // Number check
        if (/\d/.test(password)) score++;
        else feedback.push('At least one number');

        // Special character check
        if (/[^A-Za-z0-9]/.test(password)) score++;
        else feedback.push('At least one special character');

        // Update strength meter
        this.updateStrengthMeter(score);

        return { score, feedback };
    }

    updateStrengthMeter(score) {
        const meter = document.querySelector('.strength-bar');
        const text = document.getElementById('strengthValue');
        
        if (!meter || !text) return;

        const percentages = [0, 20, 40, 60, 80, 100];
        const colors = ['#ef4444', '#f59e0b', '#f59e0b', '#3b82f6', '#10b981'];
        const labels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong'];

        meter.style.width = `${percentages[score]}%`;
        meter.style.background = colors[score - 1] || colors[0];
        text.textContent = labels[score - 1] || labels[0];
        text.style.color = colors[score - 1] || colors[0];
    }

    setupPasswordStrength() {
        const passwordInput = document.getElementById('registerPassword');
        if (passwordInput) {
            passwordInput.addEventListener('input', (e) => {
                this.checkPasswordStrength(e.target.value);
            });
        }
    }

    setupPasswordToggle() {
        document.querySelectorAll('.password-toggle').forEach(toggle => {
            toggle.addEventListener('click', (e) => {
                const targetId = e.target.dataset.target;
                const input = document.getElementById(targetId);
                if (input) {
                    input.type = input.type === 'password' ? 'text' : 'password';
                    e.target.textContent = input.type === 'password' ? '👁️' : '👁️‍🗨️';
                }
            });
        });
    }

    showTOTPSetupModal(totpData) {
        const modal = document.getElementById('totpModal');
        const qrCode = document.getElementById('totpQRCode');
        const manualCode = document.getElementById('totpManualCode');
        
        if (modal && qrCode && manualCode) {
            qrCode.src = totpData.qrCode;
            manualCode.textContent = totpData.manualCode;
            modal.classList.add('show');
        }
    }

    async verifyTOTPSetup() {
        const code = document.getElementById('totpVerifyCode').value;
        
        if (!code || code.length !== 6) {
            showToast('Please enter a valid 6-digit code', 'error');
            return;
        }

        try {
            const result = await this.api.verifyTOTP({
                email: document.getElementById('registerEmail').value,
                totpCode: code
            });

            if (result.success) {
                showToast('TOTP verified successfully!', 'success');
                this.closeModal();
                
                // Redirect to dashboard
                setTimeout(() => {
                    window.location.href = '/dashboard.html';
                }, 1000);
            } else {
                showToast('Invalid TOTP code', 'error');
            }
        } catch (error) {
            showToast('TOTP verification failed', 'error');
        }
    }

    closeModal() {
        const modal = document.getElementById('totpModal');
        if (modal) {
            modal.classList.remove('show');
        }
    }

    async showForgotPassword() {
        const email = prompt('Please enter your email address:');
        
        if (!email || !this.validateEmail(email)) {
            showToast('Please enter a valid email address', 'error');
            return;
        }

        try {
            const response = await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email })
            });

            const result = await response.json();
            
            if (result.success) {
                showToast('Password reset email sent. Check your inbox.', 'success');
            } else {
                showToast(result.message || 'Failed to send reset email', 'error');
            }
        } catch (error) {
            showToast('An error occurred', 'error');
        }
    }

    showError(elementId, message) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = message;
            
            // Highlight the corresponding input
            const inputId = elementId.replace('Error', '');
            const input = document.getElementById(inputId);
            if (input) {
                input.classList.add('error');
            }
        }
    }

    clearErrors() {
        document.querySelectorAll('.error-message').forEach(el => {
            el.textContent = '';
        });
        
        document.querySelectorAll('input.error').forEach(input => {
            input.classList.remove('error');
        });
    }

    setButtonLoading(button, isLoading) {
        if (!button) return;

        const btnText = button.querySelector('.btn-text');
        const btnLoader = button.querySelector('.btn-loader');

        if (btnText && btnLoader) {
            if (isLoading) {
                button.disabled = true;
                btnText.style.display = 'none';
                btnLoader.style.display = 'block';
            } else {
                button.disabled = false;
                btnText.style.display = 'block';
                btnLoader.style.display = 'none';
            }
        }
    }
}

// Initialize auth manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.authManager = new AuthManager();
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuthManager;
}