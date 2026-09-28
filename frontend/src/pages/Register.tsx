import { useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';

import AuthLayout from '../components/layout/AuthLayout';
import { buttonClasses } from '../components/ui/button';
import FormField from '../components/ui/FormField';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { ApiError } from '../api';
import { useAuth } from '../hooks/useAuth';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useToast } from '../hooks/useToast';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

interface Errors {
  email?: string;
  password?: string;
  confirm?: string;
}

export default function Register() {
  useDocumentTitle('Create account');
  const { register } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Errors = {};
    if (!EMAIL_RE.test(email.trim())) next.email = 'Enter a valid email address.';
    if (password.length < MIN_PASSWORD) next.password = `Use at least ${MIN_PASSWORD} characters.`;
    if (confirm !== password) next.confirm = "Passwords don't match.";
    setErrors(next);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    try {
      await register(email.trim(), password);
      // PublicOnlyRoute now redirects (to ?redirect= or /dashboard).
      toast.success('Account created successfully');
    } catch (err) {
      setSubmitting(false);
      if (err instanceof ApiError && err.status === 409) {
        setErrors({ email: 'An account with this email already exists. Try logging in.' });
      } else if (err instanceof ApiError && err.status === 422 && Object.keys(err.fieldErrors).length) {
        setErrors({ email: err.fieldErrors.email, password: err.fieldErrors.password });
      } else {
        toast.error(err instanceof Error ? err.message : 'Could not create your account.');
      }
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start matching your resume against real job descriptions."
      footer={
        <>
          Already have an account?{' '}
          <Link to={{ pathname: '/login', search: location.search }} className="font-medium text-blue-600 hover:text-blue-700 hover:underline">
            Log in
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
          autoComplete="new-password"
          placeholder={`At least ${MIN_PASSWORD} characters`}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setErrors((prev) => ({ ...prev, password: undefined }));
          }}
          error={errors.password}
        />
        <FormField
          id="confirm-password"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          placeholder="Re-enter your password"
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
            setErrors((prev) => ({ ...prev, confirm: undefined }));
          }}
          error={errors.confirm}
        />
        <button type="submit" disabled={submitting} className={buttonClasses('primary', 'md', 'mt-2 w-full')}>
          {submitting ? (
            <>
              <LoadingSpinner size="sm" label={null} />
              Creating account…
            </>
          ) : (
            'Create Account'
          )}
        </button>
      </form>
    </AuthLayout>
  );
}
