/**
 * Small motion helpers, all native.
 *
 * No animation library: the Web Animations API and IntersectionObserver cover
 * everything here, and a menu that has to load on mobile data should not carry
 * 35 KB of JavaScript to make a button feel nice. Every helper is a no-op when
 * the visitor has asked for reduced motion.
 */

export function prefersReducedMotion() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/** A short buzz on add-to-cart. Silently absent on desktop and on iOS. */
export function tapFeedback(ms = 12) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // vibrate is gated behind user activation in some browsers; never fatal
  }
}

/**
 * Sends a dot arcing from the tapped button to the cart bar, so an add reads as
 * "it went in there" rather than a number quietly changing offscreen.
 */
export function flyToCart(fromEl) {
  if (!fromEl || prefersReducedMotion()) return;

  const target = document.querySelector('.fab');
  if (!target || typeof document.body.animate !== 'function') return;

  const from = fromEl.getBoundingClientRect();
  const to = target.getBoundingClientRect();

  const dot = document.createElement('span');
  dot.className = 'flydot';
  dot.style.left = `${from.left + from.width / 2}px`;
  dot.style.top = `${from.top + from.height / 2}px`;
  document.body.appendChild(dot);

  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);

  const animation = dot.animate(
    [
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      // lift first, then fall into the bar — an arc reads as thrown, a straight
      // line reads as a glitch
      { transform: `translate(${dx * 0.5}px, ${dy * 0.32 - 46}px) scale(0.85)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.3)`, opacity: 0 },
    ],
    { duration: 620, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }
  );

  // onfinish never arrives if the animation never runs — a backgrounded tab, a
  // browser that throttles it — and the dot would sit in the DOM for good, one
  // per add. The timer guarantees cleanup either way.
  const remove = () => dot.remove();
  const backstop = setTimeout(remove, 900);
  const done = () => {
    clearTimeout(backstop);
    remove();
  };
  animation.onfinish = done;
  animation.oncancel = done;
}

/**
 * Reveals elements as they scroll into view. Returns a cleanup function.
 * Everything is left visible when reduced motion is preferred, or when
 * IntersectionObserver is unavailable.
 */
export function observeReveals(selector, root = document) {
  const nodes = [...root.querySelectorAll(selector)];
  if (!nodes.length) return () => {};

  if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
    nodes.forEach((n) => n.classList.add('is-revealed'));
    return () => {};
  }

  // Only now does hiding become safe: if this function never ran — a JS error,
  // an old browser — the marker is absent and every row stays visible.
  document.documentElement.classList.add('reveal-ready');

  // Anything already on screen is revealed immediately rather than waiting for
  // the observer. IntersectionObserver callbacks are driven by the frame
  // lifecycle, so a tab that is not producing frames never gets them — and a
  // menu must never depend on an animation firing to be readable.
  const viewportish = window.innerHeight * 1.1;
  const pending = [];
  for (const node of nodes) {
    if (node.getBoundingClientRect().top < viewportish) {
      // Already on screen: show it outright. Animating it in would mean it
      // starts invisible, and a frozen or skipped transition would then leave
      // it that way.
      node.classList.add('is-revealed', 'cat--instant');
    } else {
      pending.push(node);
    }
  }

  if (!pending.length) return () => document.documentElement.classList.remove('reveal-ready');

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-revealed');
        observer.unobserve(entry.target); // reveal once, never re-hide
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.05 }
  );

  // Last resort: whatever happens, nothing stays hidden forever.
  const failsafe = setTimeout(() => {
    pending.forEach((n) => n.classList.add('is-revealed'));
  }, 4000);

  pending.forEach((n) => observer.observe(n));
  return () => {
    clearTimeout(failsafe);
    observer.disconnect();
    document.documentElement.classList.remove('reveal-ready');
  };
}
