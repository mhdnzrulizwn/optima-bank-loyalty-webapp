// Optima Bank Customer Loyalty System - Main JavaScript File

// Supabase Configuration
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.3/+esm';

const supabaseUrl = 'https://wuczfdambbsvrpurhvqr.supabase.co';
// In production, store the anon key securely (e.g., env variables or server-side)
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind1Y3pmZGFtYmJzdnJwdXJodnFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgyMjE5MjksImV4cCI6MjA3Mzc5NzkyOX0.ez7BjMgWnUCG8aycplKPBsFttx22P__Gb__td5MPGE8';

const supabase = createClient(supabaseUrl, supabaseKey);

// Global State Management
class AppState {
    constructor() {
        this.user = null;
        this.cart = [];
        this.vouchers = [];
        this.categories = [];
        this.isLoading = false;
        this.init();
    }

    async init() {
        // Check for existing session
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            this.user = session.user;
            await this.loadUserData();
        }

        // Listen for auth changes
        supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN') {
                this.user = session.user;
                this.loadUserData();
                this.redirectAfterLogin();
            } else if (event === 'SIGNED_OUT') {
                this.user = null;
                this.cart = [];
                this.redirectToLogin();
            }
        });

        // Load cart from localStorage
        this.loadCartFromStorage();

        // Initialize page-specific functionality
        this.initializePage();
    }

    async loadUserData() {
        if (!this.user) return;

        try {
            // Load user profile from Supabase
            const { data: profile, error } = await supabase
                .from('user_profiles')
                .select('*')
                .eq('user_id', this.user.id)
                .single();

            if (error && error.code !== 'PGRST116') {
                console.error('Error loading user profile:', error);
                return;
            }

            if (!profile) {
                // Create default profile
                const { data: newProfile, error: createError } = await supabase
                    .from('user_profiles')
                    .insert([
                        {
                            user_id: this.user.id,
                            full_name: this.user.user_metadata?.full_name || 'User',
                            email: this.user.email,
                            points: 1000, // Default starting points
                            membership_level: 'Silver'
                        }
                    ])
                    .select()
                    .single();

                if (createError) {
                    console.error('Error creating user profile:', createError);
                    return;
                }

                this.user.profile = newProfile;
            } else {
                this.user.profile = profile;
            }

        } catch (error) {
            console.error('Error in loadUserData:', error);
        }
    }

    initializePage() {
        const path = window.location.pathname;
        const page = path.split('/').pop() || 'index.html';

        switch (page) {
            case 'index.html':
            case '':
                break;
            case 'dashboard.html':
                if (this.user) {
                    this.initHomePage();
                } else {
                    window.location.href = 'signin.html';
                }
                break;
            case 'signin.html':
                this.initSignInPage();
                break;
            case 'signup.html':
                this.initSignUpPage();
                break;
            case 'forgot-password.html':
                this.initForgotPasswordPage();
                break;
            case 'vouchers.html':
                this.initVouchersPage();
                break;
            case 'voucher-detail.html':
                this.initVoucherDetailPage();
                break;
            case 'profile.html':
                this.initProfilePage();
                break;
            case 'checkout.html':
                this.initCheckoutPage();
                break;
        }

        // Initialize cart functionality on all pages
        this.initCartFunctionality();
        this.updateCartUI();
    }

    // Authentication Methods
    async signIn(email, password) {
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email: email,
                password: password,
            });

            if (error) throw error;

            this.showNotification('Welcome back!', 'success');
            return { success: true, data };
        } catch (error) {
            this.showNotification(error.message, 'error');
            return { success: false, error: error.message };
        }
    }

    async signUp(email, password, fullName) {
        try {
            const { data, error } = await supabase.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: {
                        full_name: fullName
                    }
                }
            });

            if (error) throw error;

            this.showNotification('Account created successfully! Please check your email for verification.', 'success');
            return { success: true, data };
        } catch (error) {
            this.showNotification(error.message, 'error');
            return { success: false, error: error.message };
        }
    }

    async signOut() {
        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;

            this.showNotification('Signed out successfully!', 'success');
        } catch (error) {
            this.showNotification(error.message, 'error');
        }
    }

    async resetPassword(email) {
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + '/reset-password.html'
            });

            if (error) throw error;

            this.showNotification('Password reset email sent! Please check your inbox.', 'success');
            return { success: true };
        } catch (error) {
            this.showNotification(error.message, 'error');
            return { success: false, error: error.message };
        }
    }

    // Cart Management
    addToCart(voucher, quantity = 1) {
        const existingItem = this.cart.find(item => item.id === voucher.id);

        if (existingItem) {
            existingItem.quantity += quantity;
        } else {
            this.cart.push({ ...voucher, quantity });
        }

        this.saveCartToStorage();
        this.updateCartUI();
        this.showNotification(`${voucher.title} added to cart!`, 'success');
    }

    removeFromCart(voucherId) {
        this.cart = this.cart.filter(item => item.id !== voucherId);
        this.saveCartToStorage();
        this.updateCartUI();
        this.showNotification('Item removed from cart', 'success');
    }

    updateCartQuantity(voucherId, quantity) {
        const item = this.cart.find(item => item.id === voucherId);
        if (item) {
            if (quantity <= 0) {
                this.removeFromCart(voucherId);
            } else {
                item.quantity = quantity;
                this.saveCartToStorage();
                this.updateCartUI();
            }
        }
    }

    getCartTotal() {
        return this.cart.reduce((total, item) => total + (item.points_required * item.quantity), 0);
    }

    clearCart() {
        this.cart = [];
        this.saveCartToStorage();
        this.updateCartUI();
    }

    saveCartToStorage() {
        localStorage.setItem('optima_cart', JSON.stringify(this.cart));
    }

    loadCartFromStorage() {
        const stored = localStorage.getItem('optima_cart');
        if (stored) {
            this.cart = JSON.parse(stored);
        }
    }

    clearCartStorage() {
        localStorage.removeItem('optima_cart');
    }

    // Voucher Management
    async loadVouchers(category = null, search = null) {
        try {
            let query = supabase.from('vouchers').select('*').eq('active', true);

            if (category && category !== 'all') {
                query = query.eq('category', category);
            }

            if (search) {
                query = query.ilike('title', `%${search}%`);
            }

            const { data, error } = await query.order('created_at', { ascending: false });

            if (error) throw error;

            this.vouchers = data || [];
            return this.vouchers;
        } catch (error) {
            console.error('Error loading vouchers:', error);
            this.showNotification('Error loading vouchers', 'error');
            return [];
        }
    }

    async loadCategories() {
        try {
            const { data, error } = await supabase
                .from('voucher_categories')
                .select('*')
                .eq('active', true)
                .order('name');

            if (error) throw error;

            this.categories = data || [];
            return this.categories;
        } catch (error) {
            console.error('Error loading categories:', error);
            return [];
        }
    }

    // Redemption
    async redeemVouchers(cartItems) {
        if (!this.user || !this.user.profile) {
            this.showNotification('Please sign in to redeem vouchers', 'error');
            return { success: false };
        }

        const totalPoints = this.getCartTotal();

        if (totalPoints > this.user.profile.points) {
            this.showNotification('Insufficient points for redemption', 'error');
            return { success: false };
        }

        try {
            const { data, error } = await supabase.rpc('redeem_vouchers', {
                user_id: this.user.id,
                voucher_data: cartItems.map(item => ({
                    voucher_id: item.id,
                    quantity: item.quantity,
                    points_used: item.points_required * item.quantity
                })),
                total_points: totalPoints
            });

            if (error) throw error;

            this.user.profile.points -= totalPoints;
            this.clearCart();

            this.showNotification('Vouchers redeemed successfully!', 'success');
            return { success: true, data };
        } catch (error) {
            console.error('Error redeeming vouchers:', error);
            this.showNotification('Error processing redemption', 'error');
            return { success: false, error: error.message };
        }
    }

    // UI Helper Methods
    updateCartUI() {
        const cartBadge = document.querySelector('.cart-badge');
        const cartCount = this.cart.reduce((total, item) => total + item.quantity, 0);

        if (cartBadge) {
            cartBadge.textContent = cartCount;
            cartBadge.style.display = cartCount > 0 ? 'flex' : 'none';
        }

        if (document.querySelector('.cart-sidebar.open')) {
            this.renderCartSidebar();
        }
    }

    initCartFunctionality() {
        const cartButton = document.querySelector('.cart-button');
        const cartSidebar = document.querySelector('.cart-sidebar');
        const cartClose = document.querySelector('.cart-close');
        const cartOverlay = document.querySelector('.cart-overlay');

        if (cartButton && cartSidebar) {
            cartButton.addEventListener('click', () => {
                cartSidebar.classList.add('open');
                this.renderCartSidebar();
            });
        }

        if (cartClose) {
            cartClose.addEventListener('click', () => {
                cartSidebar.classList.remove('open');
            });
        }

        if (cartOverlay) {
            cartOverlay.addEventListener('click', () => {
                cartSidebar.classList.remove('open');
            });
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && cartSidebar && cartSidebar.classList.contains('open')) {
                cartSidebar.classList.remove('open');
            }
        });
    }

    renderCartSidebar() {
        const cartBody = document.querySelector('.cart-body');
        const cartFooter = document.querySelector('.cart-footer');

        if (!cartBody || !cartFooter) return;

        if (this.cart.length === 0) {
            cartBody.innerHTML = `
                <div class="cart-empty">
                    <i class="fas fa-shopping-cart" style="font-size: 3rem; color: var(--text-light-gray); margin-bottom: 1rem;"></i>
                    <p>Your cart is empty</p>
                    <p style="font-size: 0.9rem; margin-top: 0.5rem;">Add some vouchers to get started!</p>
                </div>
            `;
            cartFooter.innerHTML = '';
            return;
        }

        cartBody.innerHTML = this.cart.map(item => `
            <div class="cart-item" data-id="${item.id}">
                <div class="cart-item-header">
                    <div class="cart-item-title">${item.title}</div>
                    <button class="cart-item-remove" onclick="app.removeFromCart('${item.id}')">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="cart-item-details">
                    <div class="quantity-controls">
                        <button class="quantity-btn" onclick="app.updateCartQuantity('${item.id}', ${item.quantity - 1})">
                            <i class="fas fa-minus"></i>
                        </button>
                        <span class="quantity-display">${item.quantity}</span>
                        <button class="quantity-btn" onclick="app.updateCartQuantity('${item.id}', ${item.quantity + 1})">
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>
                    <div class="points-required">${item.points_required * item.quantity} pts</div>
                </div>
            </div>
        `).join('');

        const totalPoints = this.getCartTotal();
        const userPoints = this.user?.profile?.points || 0;
        const canCheckout = totalPoints <= userPoints;

        cartFooter.innerHTML = `
            <div class="cart-total">
                <div class="total-row">
                    <span class="total-label">Your Points:</span>
                    <span class="total-value">${userPoints} pts</span>
                </div>
                <div class="total-row">
                    <span class="total-label">Required:</span>
                    <span class="total-value">${totalPoints} pts</span>
                </div>
                <div class="total-row">
                    <span class="total-label">Remaining:</span>
                    <span class="total-value ${canCheckout ? '' : 'text-red'}">${userPoints - totalPoints} pts</span>
                </div>
            </div>
            <button class="btn btn-primary btn-full-width ${canCheckout ? '' : 'disabled'}" 
                    onclick="app.proceedToCheckout()" 
                    ${canCheckout ? '' : 'disabled'}>
                ${canCheckout ? 'Proceed to Checkout' : 'Insufficient Points'}
            </button>
        `;
    }

    proceedToCheckout() {
        if (this.cart.length === 0) {
            this.showNotification('Your cart is empty', 'warning');
            return;
        }
        window.location.href = 'checkout.html';
    }

    // Utility Methods
    showNotification(message, type = 'info') {
        const existingNotifications = document.querySelectorAll('.notification');
        existingNotifications.forEach(notification => notification.remove());

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <div style="display: flex; align-items: center; gap: 0.5rem;">
                <i class="fas fa-${this.getNotificationIcon(type)}"></i>
                <span>${message}</span>
            </div>
        `;

        document.body.appendChild(notification);

        setTimeout(() => notification.classList.add('show'), 100);

        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 4000);
    }

    getNotificationIcon(type) {
        switch (type) {
            case 'success': return 'check-circle';
            case 'error': return 'exclamation-circle';
            case 'warning': return 'exclamation-triangle';
            default: return 'info-circle';
        }
    }

    formatDate(dateString) {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    formatPoints(points) {
        return new Intl.NumberFormat().format(points);
    }

    validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    validatePassword(password) {
        return password.length >= 8;
    }

    redirectAfterLogin() {
        const urlParams = new URLSearchParams(window.location.search);
        const redirect = urlParams.get('redirect') || 'dashboard.html';
        window.location.href = redirect;
    }

    redirectToLogin() {
        const currentPage = window.location.pathname.split('/').pop();
        if (!['signin.html', 'signup.html', 'forgot-password.html'].includes(currentPage)) {
            window.location.href = `signin.html?redirect=${currentPage}`;
        }
    }

    // Page-specific initialization methods
    initHomePage() { console.log('Initializing home page'); }
    initSignInPage() { console.log('Initializing sign-in page'); }
    initSignUpPage() { console.log('Initializing sign-up page'); }
    initForgotPasswordPage() { console.log('Initializing forgot password page'); }
    initVouchersPage() { console.log('Initializing vouchers page'); }
    initVoucherDetailPage() { console.log('Initializing voucher detail page'); }
    initProfilePage() { console.log('Initializing profile page'); }
    initCheckoutPage() { console.log('Initializing checkout page'); }
}

// Initialize the application
const app = new AppState();
window.app = app;
export default app;
