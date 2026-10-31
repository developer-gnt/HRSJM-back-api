/**
 * Dedicated, fully responsive Reset Password HTML template.
 * Designed according to docs/design.md:
 * - Color tokens: Navy (#011F39, #06294D, #0B2F52), Gold (#FAD465, #E9B82E), Ivory (#FAF7F0)
 * - Mobile-first responsive layout, accessible inputs, live validation, and state handling.
 */
export function getResetPasswordPageHtml(prefillToken = ''): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Reset Password | Human Rights & Social Justice Mission</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Cinzel:wght@600;700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    :root {
      --color-navy-950: #011F39;
      --color-navy-900: #06294D;
      --color-navy-800: #123F68;
      --color-gold-500: #FAD465;
      --color-gold-600: #E9B82E;
      --color-gold-700: #C9971A;
      --color-ivory-50: #FAF7F0;
      --color-white: #FFFFFF;
      --color-text-primary: #0B2F52;
      --color-text-body: #34516D;
      --color-text-muted: #718096;
      --color-border: #DCE4EC;
      --color-success: #059669;
      --color-danger: #DC2626;
    }

    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background-color: var(--color-ivory-50);
      color: var(--color-text-body);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justifyContent: center;
      padding: 20px 16px;
      -webkit-font-smoothing: antialiased;
    }

    .container {
      width: 100%;
      max-width: 440px;
      margin: 0 auto;
    }

    /* Brand Header */
    .brand-header {
      text-align: center;
      margin-bottom: 24px;
    }

    .emblem-wrap {
      width: 64px;
      height: 64px;
      margin: 0 auto 12px;
      background: var(--color-navy-950);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid var(--color-gold-500);
      box-shadow: 0 4px 12px rgba(1, 31, 57, 0.15);
    }

    .emblem-svg {
      width: 36px;
      height: 36px;
      fill: none;
      stroke: var(--color-gold-500);
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .brand-title {
      font-family: 'Cinzel', Georgia, serif;
      font-size: 17px;
      font-weight: 700;
      color: var(--color-navy-950);
      letter-spacing: 1px;
      line-height: 1.3;
    }

    .brand-subtitle {
      font-size: 11px;
      color: var(--color-gold-700);
      font-weight: 600;
      letter-spacing: 1.5px;
      margin-top: 3px;
      text-transform: uppercase;
    }

    /* Main Card */
    .card {
      background: var(--color-white);
      border-radius: 16px;
      border: 1px solid var(--color-border);
      box-shadow: 0 8px 30px rgba(1, 31, 57, 0.08);
      overflow: hidden;
    }

    .gold-accent-line {
      height: 4px;
      background: linear-gradient(90deg, var(--color-gold-500), var(--color-gold-600), var(--color-gold-500));
    }

    .card-body {
      padding: 28px 24px;
    }

    .card-title {
      font-size: 20px;
      font-weight: 800;
      color: var(--color-text-primary);
      margin-bottom: 6px;
      text-align: center;
    }

    .card-desc {
      font-size: 13px;
      color: var(--color-text-muted);
      line-height: 1.5;
      text-align: center;
      margin-bottom: 22px;
    }

    /* Form Styles */
    .form-group {
      margin-bottom: 16px;
    }

    .form-label {
      display: block;
      font-size: 12px;
      font-weight: 700;
      color: var(--color-text-primary);
      margin-bottom: 6px;
    }

    .input-wrapper {
      position: relative;
      display: flex;
      align-items: center;
    }

    .input-icon {
      position: absolute;
      left: 12px;
      width: 18px;
      height: 18px;
      color: #94A3B8;
      pointer-events: none;
    }

    .form-input {
      width: 100%;
      height: 46px;
      padding: 0 42px 0 38px;
      font-size: 14px;
      font-family: inherit;
      color: var(--color-navy-950);
      background-color: #F8FAFC;
      border: 1.5px solid var(--color-border);
      border-radius: 10px;
      outline: none;
      transition: all 0.2s ease;
    }

    .form-input:focus {
      border-color: var(--color-navy-900);
      background-color: #FFFFFF;
      box-shadow: 0 0 0 3px rgba(6, 41, 77, 0.08);
    }

    .toggle-password {
      position: absolute;
      right: 10px;
      background: none;
      border: none;
      padding: 6px;
      cursor: pointer;
      color: #64748B;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .toggle-password:hover {
      color: var(--color-navy-950);
    }

    /* Requirements Checklist */
    .checklist {
      background: #F8FAFC;
      border-radius: 8px;
      padding: 10px 14px;
      margin-bottom: 18px;
      font-size: 12px;
      border: 1px solid #E2E8F0;
    }

    .check-item {
      display: flex;
      align-items: center;
      gap: 6px;
      color: #64748B;
      margin: 4px 0;
    }

    .check-item.valid {
      color: var(--color-success);
      font-weight: 600;
    }

    .check-icon {
      font-size: 12px;
      width: 14px;
      display: inline-block;
    }

    /* Alert Message */
    .alert {
      padding: 12px 14px;
      border-radius: 8px;
      font-size: 13px;
      line-height: 1.4;
      margin-bottom: 18px;
      display: none;
    }

    .alert-danger {
      background-color: #FEF2F2;
      border: 1px solid #FECACA;
      color: #DC2626;
    }

    .alert-warning {
      background-color: #FEF3C7;
      border: 1px solid #FDE68A;
      color: #92400E;
    }

    /* Submit Button */
    .btn-submit {
      width: 100%;
      height: 48px;
      background-color: var(--color-gold-500);
      color: var(--color-navy-950);
      border: none;
      border-radius: 10px;
      font-size: 15px;
      font-weight: 700;
      font-family: inherit;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: all 0.2s ease;
      box-shadow: 0 2px 8px rgba(250, 212, 101, 0.35);
    }

    .btn-submit:hover:not(:disabled) {
      background-color: var(--color-gold-600);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(250, 212, 101, 0.45);
    }

    .btn-submit:disabled {
      opacity: 0.65;
      cursor: not-allowed;
      transform: none;
    }

    /* Spinner */
    .spinner {
      width: 18px;
      height: 18px;
      border: 2px solid var(--color-navy-950);
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      display: none;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* Success State */
    .success-view {
      display: none;
      text-align: center;
      padding: 12px 6px;
    }

    .success-icon-wrap {
      width: 60px;
      height: 60px;
      margin: 0 auto 16px;
      background: #ECFDF5;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid #A7F3D0;
    }

    .success-icon-svg {
      width: 32px;
      height: 32px;
      color: var(--color-success);
    }

    .success-title {
      font-size: 20px;
      font-weight: 800;
      color: var(--color-text-primary);
      margin-bottom: 8px;
    }

    .success-desc {
      font-size: 13.5px;
      color: var(--color-text-body);
      line-height: 1.6;
      margin-bottom: 24px;
    }

    .btn-open-app {
      display: inline-block;
      width: 100%;
      height: 48px;
      line-height: 48px;
      background-color: var(--color-navy-950);
      color: #FFFFFF !important;
      border-radius: 10px;
      font-size: 14.5px;
      font-weight: 700;
      text-decoration: none;
      transition: all 0.2s ease;
    }

    .btn-open-app:hover {
      background-color: var(--color-navy-900);
    }

    /* Footer */
    .page-footer {
      text-align: center;
      margin-top: 24px;
      font-size: 12px;
      color: var(--color-text-muted);
    }

    .page-footer a {
      color: var(--color-text-primary);
      text-decoration: none;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Brand Emblem Header -->
    <div class="brand-header">
      <div class="emblem-wrap">
        <svg class="emblem-svg" viewBox="0 0 24 24">
          <path d="M12 2L3 7v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z"/>
          <path d="M12 7v7"/>
          <path d="M8 11h8"/>
          <path d="M6 14l2-3 2 3H6zm8 0l2-3 2 3h-4z"/>
        </svg>
      </div>
      <h1 class="brand-title">Human Rights &amp; Social Justice Mission</h1>
      <p class="brand-subtitle">National Security &amp; Member Portal</p>
    </div>

    <!-- Main Card -->
    <div class="card">
      <div class="gold-accent-line"></div>
      <div class="card-body">
        <!-- Form View -->
        <div id="formView">
          <h2 class="card-title">Reset Your Password</h2>
          <p class="card-desc">Enter a new, secure password below to regain access to your HRSJM account.</p>

          <div id="alertBox" class="alert"></div>

          <form id="resetForm" onsubmit="handleFormSubmit(event)">
            <input type="hidden" id="resetToken" value="${prefillToken}">

            <!-- New Password -->
            <div class="form-group">
              <label class="form-label" for="newPassword">New Password</label>
              <div class="input-wrapper">
                <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                <input
                  type="password"
                  id="newPassword"
                  class="form-input"
                  placeholder="Minimum 8 characters"
                  required
                  minlength="8"
                  autocomplete="new-password"
                  oninput="handleInputValidation()"
                >
                <button type="button" class="toggle-password" onclick="togglePasswordVisibility('newPassword', this)" aria-label="Toggle password visibility">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                </button>
              </div>
            </div>

            <!-- Confirm Password -->
            <div class="form-group">
              <label class="form-label" for="confirmPassword">Confirm New Password</label>
              <div class="input-wrapper">
                <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                <input
                  type="password"
                  id="confirmPassword"
                  class="form-input"
                  placeholder="Re-enter password"
                  required
                  minlength="8"
                  autocomplete="new-password"
                  oninput="handleInputValidation()"
                >
                <button type="button" class="toggle-password" onclick="togglePasswordVisibility('confirmPassword', this)" aria-label="Toggle password visibility">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                </button>
              </div>
            </div>

            <!-- Validation Checklist -->
            <div class="checklist">
              <div class="check-item" id="reqLength">
                <span class="check-icon">○</span> At least 8 characters long
              </div>
              <div class="check-item" id="reqMatch">
                <span class="check-icon">○</span> Passwords match
              </div>
            </div>

            <!-- Submit Button -->
            <button type="submit" id="submitBtn" class="btn-submit">
              <span id="btnText">Update Password</span>
              <div id="btnSpinner" class="spinner"></div>
            </button>
          </form>
        </div>

        <!-- Success View -->
        <div id="successView" class="success-view">
          <div class="success-icon-wrap">
            <svg class="success-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
          </div>
          <h2 class="success-title">Password Reset Complete!</h2>
          <p class="success-desc">
            Your password has been reset successfully. You can now sign in with your new password.
          </p>
          <a href="#" class="btn-open-app" onclick="returnToApp()">Sign In</a>
        </div>
      </div>
    </div>

    <!-- Page Footer -->
    <div class="page-footer">
      Protected by 256-bit encryption · <a href="https://hrsjm.org" target="_blank" rel="noopener">hrsjm.org</a> · New Delhi, India
    </div>
  </div>

  <script>
    // Extract token from query param or fallback
    (function initToken() {
      const urlParams = new URLSearchParams(window.location.search);
      const queryToken = urlParams.get('token');
      if (queryToken) {
        document.getElementById('resetToken').value = queryToken;
      }
      const token = document.getElementById('resetToken').value;
      if (!token) {
        showAlert('Missing reset token. Please open this page using the link provided in your email.', 'warning');
        document.getElementById('submitBtn').disabled = true;
      }
    })();

    function togglePasswordVisibility(inputId, btn) {
      const input = document.getElementById(inputId);
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      btn.style.color = isPassword ? '#011F39' : '#64748B';
    }

    function handleInputValidation() {
      const p1 = document.getElementById('newPassword').value;
      const p2 = document.getElementById('confirmPassword').value;

      const validLength = p1.length >= 8;
      const validMatch = p1.length > 0 && p1 === p2;

      updateCheckItem('reqLength', validLength);
      updateCheckItem('reqMatch', validMatch);
    }

    function updateCheckItem(id, isValid) {
      const el = document.getElementById(id);
      const icon = el.querySelector('.check-icon');
      if (isValid) {
        el.classList.add('valid');
        icon.textContent = '✓';
      } else {
        el.classList.remove('valid');
        icon.textContent = '○';
      }
    }

    function showAlert(msg, type = 'danger') {
      const box = document.getElementById('alertBox');
      box.textContent = msg;
      box.className = 'alert ' + (type === 'warning' ? 'alert-warning' : 'alert-danger');
      box.style.display = 'block';
    }

    function hideAlert() {
      const box = document.getElementById('alertBox');
      box.style.display = 'none';
    }

    async function handleFormSubmit(event) {
      event.preventDefault();
      hideAlert();

      const token = document.getElementById('resetToken').value;
      const password = document.getElementById('newPassword').value;
      const confirmPassword = document.getElementById('confirmPassword').value;

      if (!token) {
        showAlert('Missing reset token. Please use the link sent to your email address.', 'warning');
        return;
      }

      if (password.length < 8) {
        showAlert('Password must be at least 8 characters long.');
        return;
      }

      if (password !== confirmPassword) {
        showAlert('Passwords do not match. Please ensure both fields are identical.');
        return;
      }

      const submitBtn = document.getElementById('submitBtn');
      const btnText = document.getElementById('btnText');
      const btnSpinner = document.getElementById('btnSpinner');

      submitBtn.disabled = true;
      btnText.textContent = 'Updating Password...';
      btnSpinner.style.display = 'inline-block';

      try {
        const response = await fetch('/api/v1/auth/reset-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            token: token.trim(),
            password,
            confirm_password: confirmPassword
          })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          const msg = data.message || 'Invalid or expired reset token. Please request a new link from the mobile app.';
          showAlert(Array.isArray(msg) ? msg.join(', ') : msg, 'danger');
          submitBtn.disabled = false;
          btnText.textContent = 'Update Password';
          btnSpinner.style.display = 'none';
          return;
        }

        // Show Success View
        document.getElementById('formView').style.display = 'none';
        document.getElementById('successView').style.display = 'block';

      } catch (err) {
        showAlert('Network error: Unable to reach the server. Please check your internet connection.', 'danger');
        submitBtn.disabled = false;
        btnText.textContent = 'Update Password';
        btnSpinner.style.display = 'none';
      }
    }

    function returnToApp() {
      // Attempt deep link to app if on mobile, or inform user
      try {
        window.location.href = 'hrsjm://login';
      } catch (e) {}
      setTimeout(() => {
        alert('You may now close this tab and return to the HRSJM mobile application to log in.');
      }, 500);
      return false;
    }
  </script>
</body>
</html>`;
}

