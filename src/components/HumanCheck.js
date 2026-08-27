'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Cloudflare Turnstile on the order form — and nothing at all without it.
 *
 * There used to be a fallback here: an "I'm not a robot" tick-box that fetched
 * a signed token from our own server. It asked every real customer to click
 * something while stopping no actual script, because the server handed that
 * token to anyone who asked for one. A checkbox that only inconveniences honest
 * people is worse than no checkbox, so it is gone.
 *
 * Set NEXT_PUBLIC_TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY and a real check
 * appears — usually invisible to the customer — and the order API starts
 * requiring it. Until then, rate limiting and the per-phone cap in
 * src/lib/ratelimit.js are what bound abuse.
 */

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';

export default function HumanCheck({ onToken }) {
  const [error, setError] = useState('');
  const widgetRef = useRef(null);
  const rendered = useRef(false);

  useEffect(() => {
    if (!SITE_KEY || rendered.current) return undefined;

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
    script.onerror = () => setError('Verification could not load. Please retry.');
    document.head.appendChild(script);
    return undefined;
  }, [onToken]);

  if (!SITE_KEY) return null;

  return (
    <div className="humancheck">
      <div ref={widgetRef} />
      {error ? <p className="humancheck__error">{error}</p> : null}
    </div>
  );
}
