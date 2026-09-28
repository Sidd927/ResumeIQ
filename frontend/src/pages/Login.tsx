import { useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';

import AuthLayout from '../components/layout/AuthLayout';
import { buttonClasses } from '../components/ui/button';
import FormField from '../components/ui/FormField';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { ApiError } from '../api';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useSlowHint } from '../hooks/useSlowHint';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Errors {
  email?: string;
  password?: string;
}

export default function Login() {
  useDocumentTitle('Log in');
  const { login } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const serverWaking = useSlowHint(submitting);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Errors = {};
    if (!EMAIL_RE.test(email.trim())) next.email = 'Enter a valid email address.';
    if (!password) next.password = 'Enter your password.';
    setErrors(next);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    try {
      const user = await login(email.trim(), password);
      // PublicOnlyRoute now redirects (to ?redirect= or /dashboard).
      toast.success(`Welcome back, ${user.email.split('@')[0]}!`);
    } catch (err) {
      setSubmitting(false);
      if (err instanceof ApiError && err.status === 401) {
        setErrors({ password: 'Invalid email or password.' });
        toast.error('Invalid email or password');
      } else if (err instanceof ApiError && err.status === 422 && Object.keys(err.fieldErrors).length) {
        setErrors({ email: err.fieldErrors.email, password: err.fieldErrors.password });
      } else {
        toast.error(err instanceof Error ? err.message : 'Could not log you in.');
      }
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to analyze resumes and view your match history."
      footer={
        <>
          Don't have an account?{' '}
          <Link
            to={{ pathname: '/register', search: location.search }}
            className="font-medium text-blue-600 hover:text-blue-700 hover:underline"
          >
            Sign up
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <FormField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setErrors((prev) => ({ ...prev, email: undefined }));
          }}
          error={errors.email}
          autoFocus
        />
        <FormField
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setErrors((prev) => ({ ...prev, password: undefined }));
          }}
          error={errors.password}
        />
        <button type="submit" disabled={submitting} className={buttonClasses('primary', 'md', 'mt-2 w-full')}>
          {submitting ? (
            <>
              <LoadingSpinner size="sm" label={null} />
              Logging in…
            </>
          ) : (
            'Log In'
          )}
        </button>
        {serverWaking && (
          <p role="status" className="animate-fade-in-up text-center text-xs leading-5 text-gray-500">
            Waking up the server — free hosting sleeps when idle, so the first request can take up to a minute.
          </p>
        )}
      </form>
    </AuthLayout>
  );
}
