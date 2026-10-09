'use client';

/**
 * Google's own "Continue with Google" button (Google Identity Services).
 * Google renders it into our container and hands back an ID token, which the
 * backend verifies at POST /auth/google. Renders nothing until
 * NEXT_PUBLIC_GOOGLE_CLIENT_ID is set, so the forms work without it.
 */

import React, { useEffect, useRef } from 'react';
import Script from 'next/script';
import type { GoogleSignup } from '@/lib/api';

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';

interface GoogleCredentialResponse {
  credential: string;
}

interface GoogleIdentityServices {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string;
        callback: (response: GoogleCredentialResponse) => void;
        ux_mode?: 'popup' | 'redirect';
      }) => void;
      renderButton: (
        parent: HTMLElement,
        options: {
          type?: 'standard' | 'icon';
          theme?: 'outline' | 'filled_blue' | 'filled_black';
          size?: 'large' | 'medium' | 'small';
          text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
          shape?: 'rectangular' | 'pill' | 'circle' | 'square';
          logo_alignment?: 'left' | 'center';
          width?: number;
        },
      ) => void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentityServices;
  }
}

export const googleSignInEnabled = CLIENT_ID !== '';

const PENDING_SIGNUP_KEY = 'ringgy.googleSignup';

/**
 * "Continue with Google" on the sign-in page with no account yet leads to
 * the signup wizard; this carries the Google signup over to it.
 */
export function stashGoogleSignup(signup: GoogleSignup): void {
  try {
    sessionStorage.setItem(PENDING_SIGNUP_KEY, JSON.stringify(signup));
  } catch {
    // Storage blocked: the wizard simply offers Google again.
  }
}

export function takeGoogleSignup(): GoogleSignup | null {
  try {
    const raw = sessionStorage.getItem(PENDING_SIGNUP_KEY);
    sessionStorage.removeItem(PENDING_SIGNUP_KEY);
    return raw ? (JSON.parse(raw) as GoogleSignup) : null;
  } catch {
    return null;
  }
}

export const GoogleSignInButton: React.FC<{
  onCredential: (credential: string) => void;
  text?: 'signin_with' | 'signup_with' | 'continue_with';
}> = ({ onCredential, text = 'continue_with' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  // Google keeps the callback from initialize(); a ref lets it always reach
  // the latest handler without re-initializing on every render.
  const onCredentialRef = useRef(onCredential);
  useEffect(() => {
    onCredentialRef.current = onCredential;
  });

  if (!googleSignInEnabled) return null;

  const render = () => {
    const container = containerRef.current;
    const google = window.google;
    if (!container || !google) return;

    google.accounts.id.initialize({
      client_id: CLIENT_ID,
      callback: (response) => onCredentialRef.current(response.credential),
      ux_mode: 'popup',
    });
    // Google's button takes a pixel width (max 400), not a CSS one.
    google.accounts.id.renderButton(container, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text,
      shape: 'pill',
      logo_alignment: 'center',
      width: Math.min(400, Math.max(200, container.offsetWidth)),
    });
  };

  return (
    <>
      <Script src="https://accounts.google.com/gsi/client" onReady={render} />
      <div ref={containerRef} className="flex h-[44px] w-full justify-center" />
    </>
  );
};
