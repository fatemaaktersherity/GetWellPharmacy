import React, { FormEvent, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type FormState = {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
};

const initialForm: FormState = {
  fullName: '',
  email: '',
  phone: '',
  password: '',
  confirmPassword: '',
};

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
const isLocalAngularDevServer =
  ['localhost', '127.0.0.1'].includes(window.location.hostname) &&
  window.location.port === '4200';

const apiBaseUrls = configuredApiBaseUrl
  ? [configuredApiBaseUrl]
  : import.meta.env.DEV || isLocalAngularDevServer
    ? ['https://localhost:7079/api', 'http://localhost:5116/api']
    : ['/api'];

function EyeIcon({ hidden }: { hidden: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {hidden ? (
        <>
          <path d="M3 3l18 18" />
          <path d="M10.7 5.1A10.8 10.8 0 0 1 12 5c5 0 8.5 4.1 9.7 5.8a2 2 0 0 1 0 2.4 16 16 0 0 1-2.6 3" />
          <path d="M6.6 6.7a16 16 0 0 0-4.3 4.1 2 2 0 0 0 0 2.4C3.5 14.9 7 19 12 19c1.5 0 2.9-.4 4.1-1" />
          <path d="M9.9 9.9A3 3 0 0 0 14.1 14.1" />
        </>
      ) : (
        <>
          <path d="M2.3 10.8C3.5 9.1 7 5 12 5s8.5 4.1 9.7 5.8a2 2 0 0 1 0 2.4C20.5 14.9 17 19 12 19s-8.5-4.1-9.7-5.8a2 2 0 0 1 0-2.4Z" />
          <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
        </>
      )}
    </svg>
  );
}

function validate(form: FormState): string | null {
  if (!form.fullName.trim()) return 'Full name is required.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return 'Enter a valid email address.';
  if (form.password.length < 6) return 'Password must be at least 6 characters.';
  if (!/[A-Z]/.test(form.password) || !/[0-9]/.test(form.password)) return 'Password must include one uppercase letter and one number.';
  if (form.password !== form.confirmPassword) return 'Passwords do not match.';
  return null;
}

function RegisterApp() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const error = validate(form);
    if (error) {
      setMessage(error);
      setSuccess(false);
      return;
    }

    setLoading(true);
    setMessage('');
    setSuccess(false);

    try {
      let response: Response | null = null;
      const requestBody = JSON.stringify({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        password: form.password,
        confirmPassword: form.confirmPassword,
      });

      for (const apiBaseUrl of apiBaseUrls) {
        try {
          response = await fetch(`${apiBaseUrl}/auth/register-public`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: requestBody,
          });
          break;
        } catch (err) {
          void err;
        }
      }

      if (!response) {
        throw new Error('Backend API is not running. Start the backend first, then try registration again.');
      }

      const responseText = await response.text();
      let payload: Record<string, unknown> = {};
      try {
        payload = responseText ? JSON.parse(responseText) as Record<string, unknown> : {};
      } catch {
        // A dev server or reverse proxy may return an HTML 404 page instead
        // of the API's JSON response. Keep the useful HTTP status visible.
      }
      const serverMessage = [payload['message'], payload['title'], payload['detail']]
        .find((value): value is string => typeof value === 'string' && value.trim().length > 0);
      if (!response.ok) throw new Error(serverMessage || `Registration failed (HTTP ${response.status}).`);

      setSuccess(true);
      setMessage('Registration successful. Redirecting to login...');
      window.setTimeout(() => {
        window.location.href = '/login';
      }, 1200);
    } catch (err) {
      setSuccess(false);
      setMessage(err instanceof Error ? err.message : 'Registration failed. Please check that the backend API is running.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="register-page">
      <div className="medical-shell" aria-hidden="true">
        <div className="orb orb-left" />
        <div className="orb orb-right" />
        <div className="cross cross-a">+</div>
        <div className="cross cross-b">+</div>
        <div className="cross cross-c">+</div>
        <div className="pulse-line" />
      </div>
      <section className="register-panel" aria-labelledby="register-title">
        <div className="brand">
          <div className="brand-mark">+</div>
          <div>
            <strong>Get Well</strong>
            <span>Employee Registration</span>
          </div>
        </div>

        <h1 id="register-title">Create your account</h1>
        <p className="subtitle">New employees are registered with the Cashier role. An Admin can change roles later.</p>

        <form onSubmit={submit} noValidate>
          <label>
            Full Name
            <input value={form.fullName} onChange={(e) => update('fullName', e.target.value)} autoComplete="name" required />
          </label>

          <label>
            Email
            <input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} autoComplete="email" required />
          </label>

          <label>
            Phone
            <input value={form.phone} onChange={(e) => update('phone', e.target.value)} autoComplete="tel" />
          </label>

          <label>
            Password
            <span className="password-wrap">
              <input type={showPassword ? 'text' : 'password'} value={form.password} onChange={(e) => update('password', e.target.value)} autoComplete="new-password" required />
              <button className="eye-button" type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                <EyeIcon hidden={showPassword} />
              </button>
            </span>
          </label>

          <label>
            Confirm Password
            <span className="password-wrap">
              <input type={showConfirmPassword ? 'text' : 'password'} value={form.confirmPassword} onChange={(e) => update('confirmPassword', e.target.value)} autoComplete="new-password" required />
              <button className="eye-button" type="button" onClick={() => setShowConfirmPassword((value) => !value)} aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}>
                <EyeIcon hidden={showConfirmPassword} />
              </button>
            </span>
          </label>

          <p className="password-help">Password must be at least 6 characters and include one capital letter and one number.</p>

          {message && <p className={success ? 'success' : 'error'}>{message}</p>}

          <button type="submit" disabled={loading}>
            {loading ? 'Creating account...' : 'Register'}
          </button>
        </form>

        <button className="link-button" type="button" onClick={() => { window.location.href = '/login'; }}>
          Back to login
        </button>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RegisterApp />
  </React.StrictMode>,
);
