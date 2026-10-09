'use client';

/**
 * Sign-in only. Creating an account goes through the onboarding wizard at
 * `/signup`, which collects the business profile the assistant needs — a
 * tenant created without it would have nothing to answer calls with.
 */

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/components/auth/AuthProvider';
import {
  GoogleSignInButton,
  googleSignInEnabled,
  stashGoogleSignup,
} from '@/components/auth/GoogleSignInButton';
import { Logo } from '@/components/brand/Logo';
import { Loader2, AlertTriangle } from 'lucide-react';

const inputClass =
  'w-full px-3 py-2 rounded-xl bg-[#FCFCFD] border border-[#E4E8F0] text-sm text-[#0E1526] focus:outline-none focus:ring-4 focus:ring-[#2F6BFF]';
const labelClass =
  'block text-xs font-bold text-[#26304A] mb-1';

export default function LoginPage() {
  const router = useRouter();
  const { refresh } = useAuth();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await api.login(email, password);
      await refresh();
      router.push('/');
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Something went wrong',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogle = async (credential: string) => {
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await api.googleSignIn(credential);
      if (result.ok) {
        await refresh();
        router.push('/');
        return;
      }
      // No account for this Google address yet: the signup wizard collects
      // the business profile and creates it signed in with Google.
      const { signupToken, email: googleEmail, name } = result;
      stashGoogleSignup({ signupToken, email: googleEmail, name });
      router.push('/signup');
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Something went wrong',
      );
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FCFCFD] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-[18px] border border-[#E4E8F0] shadow-sm p-6 space-y-5">
        <div className="space-y-4">
          <Logo />
          <div>
            <h1 className="text-lg font-bold text-[#0E1526]">Sign in</h1>
            <p className="text-xs text-[#6B7488]">
              AI receptionist for home service businesses
            </p>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-[12px] bg-amber-500/10 border border-amber-500/40 text-xs text-amber-800">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {googleSignInEnabled && (
          <>
            <GoogleSignInButton
              text="signin_with"
              onCredential={(credential) => void handleGoogle(credential)}
            />
            <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wide text-[#8A93A6]">
              <span className="h-px flex-1 bg-[#E4E8F0]" />
              or
              <span className="h-px flex-1 bg-[#E4E8F0]" />
            </div>
          </>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelClass}>Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              placeholder="you@yourbusiness.com"
            />
          </div>

          <div>
            <label className={labelClass}>Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#2F6BFF] hover:bg-[#1E4FD8] disabled:opacity-60 text-white text-sm font-bold shadow-md shadow-blue-500/20 transition-all"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>Sign in</span>
          </button>
        </form>

        <div className="text-center text-xs text-[#6B7488]">
          Don&apos;t have an account?{' '}
          <Link
            href="/signup"
            className="font-semibold text-[#2F6BFF] hover:underline"
          >
            Set up your AI receptionist
          </Link>
        </div>
      </div>
    </div>
  );
}
