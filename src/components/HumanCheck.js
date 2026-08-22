'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The "are you a person" step on the order form.
 *
 * With NEXT_PUBLIC_TURNSTILE_SITE_KEY set this renders Cloudflare Turnstile,
 * which is the real check — usually invisible, and its token is verified
 * server-side. Without a key it falls back to a tick-box that fetches a
 * short-lived signed token from the server, so the form is never entirely
 * open; that fallback is a stopgap and the README says why.
 *
 * Either way the token is only a claim — /api/orders/place verifies it before
 * an order exists.
 */

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';

export default function HumanCheck({ onToken }) {
  const [mode, setMode] = useState(SITE_KEY ? 'turnstile' : 'challenge');
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const widgetRef = useRef(null);
  const rendered = useRef(false);

  // ---- Turnstile ----------------------------------------------------------
  useEffect(() => {
    if (mode !== 'turnstile' || rendered.current) return undefined;

    function render() {
      if (!window.turnstile || !widgetRef.current || rendered.current) return;
      rendered.current = true;
      window.turnstile.render(widgetRef.current, {
        sitekey: SITE_KEY,
        theme: 'dark',
        callback: (token) => {
          setError('');
          onToken({ turnstileToken: token });
        },
        'error-callback': () => setError('Verification could not load. Please retry.'),
        'expired-callback': () => onToken({ turnstileToken: null }),
      });
    }

    if (window.turnstile) {
      render();
      return undefined;
    }

    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = render;
    script.onerror = () => {
      // Cloudflare unreachable — drop to the fallback rather than blocking
      // the customer from ordering at all.
      setMode('challenge');
    };
    document.head.appendChild(script);
    return undefined;
  }, [mode, onToken]);

  // ---- signed fallback ----------------------------------------------------
  async function handleCheck() {
    if (checked || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/verify/challenge');
      const data = await res.json();
      if (data.mode === 'turnstile') {
        setMode('turnstile');
        return;
      }
      onToken({ challengeToken: data.token });
      setChecked(true);
    } catch {
      setError('Could not verify right now. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (mode === 'turnstile') {
    return (
      <div className="humancheck">
        <div ref={widgetRef} />
        {error ? <p className="humancheck__error">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="humancheck">
      <button
        type="button"
        className={`humancheck__box${checked ? ' humancheck__box--done' : ''}`}
        onClick={handleCheck}
        disabled={busy || checked}
        aria-pressed={checked}
      >
        <span className="humancheck__tick" aria-hidden="true">
          {checked ? '✓' : busy ? '…' : ''}
        </span>
        <span className="humancheck__label">
          {checked ? "Thanks — you're verified" : "I'm not a robot"}
        </span>
      </button>
      {error ? <p className="humancheck__error">{error}</p> : null}
    </div>
  );
}
