'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '@/context/CartContext';
import { fetchMenu, formatINR } from '@/lib/api';
import mediaManifest from '@/data/media-manifest.json';
import RecommendSheet from '@/components/RecommendSheet';

const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME || 'Soul';

// The menu is a static JSON route and usually answers in well under a second —
// not long enough to read "Curating the menu…", let alone watch the pour. Hold
// the splash for one full pour cycle. Skipped for anyone who has asked for
// reduced motion, where the animation is stilled and the wait would just be a
// frozen screen.
const SPLASH_MIN_MS = 1800;

/* Category glyphs — cheap personality, and they make the collapsed list
   scannable at a glance instead of being 29 identical rows of text. */
const CATEGORY_EMOJI = {
  'monsoon-menu': '🌧️',
  'summer-specials': '☀️',
  'soul-combos': '🍽️',
  'soul-cake-bowl-cake': '🎂',
  'soul-specials-bevarages': '✨',
  'hot-bevarages': '☕',
  'iced-bevarages': '🧊',
  'cold-brews': '🥤',
  matcha: '🍵',
  tea: '🫖',
  'ice-tea': '🍹',
  frappes: '🧋',
  toast: '🍞',
  'soul-special-fusion-food': '🌮',
  bagels: '🥯',
  croissants: '🥐',
  'croissant-sandwiches': '🥪',
  'sourdough-sandwiches': '🥪',
  wraps: '🌯',
  burgers: '🍔',
  'pizza-flat-breads': '🍕',
  cookies: '🍪',
  muffins: '🧁',
  puffs: '🥟',
  'fries-and-pockets': '🍟',
  dips: '🥣',
  desserts: '🍰',
  'alternative-milks': '🥛',
  'protein-series': '💪',
};

const emojiFor = (id) => CATEGORY_EMOJI[id] || '🍴';

/* ---------------------------------- bits ---------------------------------- */

/* Simple geometric glyphs rather than an icon package — the spec keeps the
   dependency list empty, and these two are the only non-emoji marks needed. */
function PinIcon() {
  return (
    <svg className="footer__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 22s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="11" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg className="footer__icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect
        x="3"
        y="3"
        width="18"
        height="18"
        rx="5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17.2" cy="6.8" r="1.2" fill="currentColor" />
    </svg>
  );
}

/** Coffee pouring into a cup — the loading state, in place of a spinner. */
function BrewLoader() {
  return (
    <div className="brew" role="img" aria-label="Pouring coffee">
      <span className="brew__spout" />
      <span className="brew__pour" />
      <span className="brew__cup">
        <span className="brew__fill" />
      </span>
      <span className="brew__handle" />
      <span className="brew__saucer" />
      <span className="brew__steam brew__steam--a" />
      <span className="brew__steam brew__steam--b" />
      <span className="brew__steam brew__steam--c" />
    </div>
  );
}

function VegMark({ veg }) {
  return (
    <span
      className={`vegmark${veg ? '' : ' vegmark--nonveg'}`}
      title={veg ? 'Vegetarian' : 'Non-vegetarian'}
      aria-label={veg ? 'Vegetarian' : 'Non-vegetarian'}
    >
      <span className={veg ? 'vegmark__dot' : 'vegmark__tri'} />
    </span>
  );
}

function SoulLogo() {
  const [src, setSrc] = useState('/soul-logo-bgreemoved-upscaled.png');
  return (
    <img
      className="hero__mark"
      src={src}
      alt={`${STORE_NAME} — Speciality Coffees & Fusion Bakehouse`}
      width={1326}
      height={752}
      onError={() => setSrc('/soul-logo.svg')}
    />
  );
}

function VariationSheet({ item, onPick, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__grabber" />
        <h3 className="sheet__title">{item.name}</h3>
        <p className="sheet__subtitle">Choose {item.variationGroup || 'an option'}</p>
        {item.variations.map((v) => (
          <button key={v.name} className="option" onClick={() => onPick(v)}>
            <span className="option__name">{v.name}</span>
            <span className="option__price">{formatINR(v.price)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Big photo cards along the top — the menu's only real visual hook. */
function FeaturedRail({ items, onAdd }) {
  if (!items.length) return null;
  return (
    <section className="featured">
      <h2 className="featured__title">Worth a look</h2>
      <div className="featured__rail no-scrollbar">
        {items.map((item, i) => (
          <button
            key={item.id}
            className="fcard animate-slide-up"
            style={{ animationDelay: `${Math.min(i, 10) * 50}ms` }}
            onClick={() => onAdd(item)}
          >
            <img className="fcard__img" src={mediaManifest[item.slug]} alt={item.name} loading="lazy" />
            <span className="fcard__scrim" />
            <span className="fcard__body">
              <span className="fcard__name">{item.name}</span>
              <span className="fcard__meta">
                {item.variations ? 'from ' : ''}
                {formatINR(item.price)}
              </span>
            </span>
            <span className="fcard__add">+</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/**
 * Collapsible panel that animates on a measured pixel height.
 *
 * The CSS-only `grid-template-rows: 0fr -> 1fr` trick is tidier, but the grid
 * row would not pick up this content's intrinsic height — it sized to the
 * padding alone — so the height is measured and driven explicitly instead.
 * After opening it settles on `auto`, so cards growing (images arriving) does
 * not leave the panel clipped.
 */
function CatPanel({ open, id, children }) {
  const ref = useRef(null);
  const first = useRef(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    if (first.current) {
      first.current = false;
      el.style.height = open ? 'auto' : '0px';
      return undefined;
    }

    if (open) {
      el.style.height = '0px';
      void el.offsetHeight; // flush, so the transition has a start value
      el.style.height = `${el.scrollHeight}px`;
      const settle = () => {
        el.style.height = 'auto';
      };
      const onEnd = (e) => {
        if (e.target === el && e.propertyName === 'height') settle();
      };
      el.addEventListener('transitionend', onEnd);
      // Belt and braces: if transitionend never arrives — reduced motion, a
      // backgrounded tab, an interrupted transition — the panel would stay
      // pinned to a stale pixel height and clip anything that grows later.
      const timer = setTimeout(settle, 600);
      return () => {
        el.removeEventListener('transitionend', onEnd);
        clearTimeout(timer);
      };
    }

    // Collapsing: pin the current height, flush, then go to zero. A rAF would
    // read more naturally here but never fires while the tab is not producing
    // frames, which would leave the panel stuck open.
    el.style.height = `${el.scrollHeight}px`;
    void el.offsetHeight;
    el.style.height = '0px';
    return undefined;
  }, [open]);

  return (
    <div className="cat__panel" id={id} data-open={open} ref={ref}>
      <div className="cat__panel-inner">{children}</div>
    </div>
  );
}

function MenuCard({ item, index, onAdd }) {
  const { quantityOfItem, lines, stepQuantity } = useCart();
  const [bounce, setBounce] = useState(false);
  const qty = quantityOfItem(item.id);
  const photo = mediaManifest[item.slug];
  const hasVariations = Boolean(item.variations?.length);

  const soleLine = lines.filter((l) => l.id === item.id);
  const canStep = soleLine.length === 1;

  function handleAdd() {
    setBounce(true);
    setTimeout(() => setBounce(false), 400);
    onAdd(item);
  }

  return (
    <article
      className={`card animate-slide-up${item.available === false ? ' card--unavailable' : ''}`}
      style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
    >
      <div className="card__body">
        <div className="card__head">
          <VegMark veg={item.veg} />
          <h3 className="card__name">{item.name}</h3>
        </div>
        {item.description ? <p className="card__desc">{item.description}</p> : null}
        <p className="card__price">
          {hasVariations ? <span className="card__price-from">from</span> : null}
          {formatINR(item.price)}
        </p>
      </div>

      <div className={`card__aside${photo ? '' : ' card__aside--no-photo'}`}>
        {photo ? <img className="card__photo" src={photo} alt={item.name} loading="lazy" /> : null}

        {item.available === false ? (
          <button className="add-btn add-btn--disabled" disabled>
            Sold out
          </button>
        ) : qty > 0 && canStep && !hasVariations ? (
          <div className="stepper">
            <button
              className="stepper__btn"
              onClick={() => stepQuantity(soleLine[0].key, -1)}
              aria-label={`Remove one ${item.name}`}
            >
              −
            </button>
            <span className="stepper__count">{qty}</span>
            <button
              className="stepper__btn"
              onClick={() => stepQuantity(soleLine[0].key, 1)}
              aria-label={`Add one ${item.name}`}
            >
              +
            </button>
          </div>
        ) : (
          <button
            className={`add-btn${bounce ? ' add-btn--bounce' : ''}`}
            onClick={handleAdd}
            aria-label={`Add ${item.name}`}
          >
            {qty > 0 ? `Add · ${qty}` : 'Add'}
          </button>
        )}

        {hasVariations ? (
          <span className="card__variation-hint">{item.variations.length} options</span>
        ) : null}
        {item.deliveryAvailable === false ? (
          <span className="card__variation-hint">🏪 Pickup only</span>
        ) : null}
      </div>
    </article>
  );
}

/* ---------------------------------- page ---------------------------------- */

export default function MenuPage() {
  const { totalItems, subtotal, addItem } = useCart();

  const [menu, setMenu] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(() => new Set());
  const [mounted, setMounted] = useState(() => new Set());
  const [activeCat, setActiveCat] = useState('');
  const [sheetItem, setSheetItem] = useState(null);
  const [recommendOpen, setRecommendOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // Revealed rows are React state, not a class poked onto the DOM: .cat's
  // className is React-managed, so opening a section or typing in search would
  // rewrite it and strip an imperative class straight back off.
  const [revealed, setRevealed] = useState(() => new Set());
  const router = useRouter();

  const railRef = useRef(null);
  const sectionRefs = useRef({});

  const load = useCallback(() => {
    setError('');
    setMenu(null);
    const startedAt = Date.now();
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    fetchMenu()
      .then((data) => {
        const show = () => {
          setMenu(data);
          const first = data.categories[0]?.id;
          if (first) {
            setOpen(new Set([first]));
            setMounted(new Set([first]));
            setActiveCat(first);
          }
        };
        const wait = reduceMotion ? 0 : Math.max(0, SPLASH_MIN_MS - (Date.now() - startedAt));
        if (wait) setTimeout(show, wait);
        else show();
      })
      .catch((e) => setError(e.message || 'Could not load the menu.'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const searching = query.trim().length > 0;

  const categories = useMemo(() => {
    if (!menu) return [];
    const q = query.trim().toLowerCase();
    if (!q) return menu.categories;
    return menu.categories
      .map((c) => ({
        ...c,
        items: c.items.filter(
          (i) =>
            i.name.toLowerCase().includes(q) ||
            (i.description || '').toLowerCase().includes(q)
        ),
      }))
      .filter((c) => c.items.length > 0);
  }, [menu, query]);

  // Items with a photo lead the rail — it is the one place the photos get room.
  const featured = useMemo(() => {
    if (!menu) return [];
    const seen = new Set();
    return menu.categories
      .flatMap((c) => c.items)
      .filter((i) => {
        if (!mediaManifest[i.slug] || seen.has(i.slug)) return false;
        seen.add(i.slug);
        return true;
      });
  }, [menu]);

  const isOpen = (id) => (searching ? true : open.has(id));
  const isMounted = (id) => (searching ? true : mounted.has(id));

  function toggle(id) {
    // Decide the target state up front. A updater that flips membership is not
    // idempotent, and StrictMode double-invokes updaters in dev — running it
    // twice landed back on the original state, so nothing ever opened.
    const shouldOpen = !open.has(id);
    setMounted((m) => new Set(m).add(id));
    setOpen((prev) => {
      const next = new Set(prev);
      if (shouldOpen) next.add(id);
      else next.delete(id);
      return next;
    });
    setActiveCat(id);
  }

  // Settle rows in as they scroll into view. Anything already on screen is
  // marked revealed straight away, so the first paint is never blank, and a
  // failsafe reveals the rest if the observer never fires — its callbacks ride
  // the frame lifecycle, so a tab that is not rendering never receives them.
  useEffect(() => {
    if (!menu) return undefined;

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const nodes = Object.entries(sectionRefs.current).filter(([, el]) => el);

    if (reduce || typeof IntersectionObserver === 'undefined') {
      setRevealed(new Set(nodes.map(([id]) => id)));
      return undefined;
    }

    const onScreen = nodes
      .filter(([, el]) => el.getBoundingClientRect().top < window.innerHeight * 1.1)
      .map(([id]) => id);
    if (onScreen.length) {
      setRevealed((prev) => new Set([...prev, ...onScreen]));
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const seen = entries.filter((e) => e.isIntersecting).map((e) => e.target.dataset.category);
        if (!seen.length) return;
        setRevealed((prev) => new Set([...prev, ...seen]));
      },
      { rootMargin: '0px 0px -6% 0px', threshold: 0.02 }
    );
    nodes.forEach(([, el]) => observer.observe(el));

    const failsafe = setTimeout(() => setRevealed(new Set(nodes.map(([id]) => id))), 4000);

    return () => {
      clearTimeout(failsafe);
      observer.disconnect();
    };
  }, [menu, categories]);

  // Let the tap land before the route changes, so the handover has a beat.
  function goToCheckout() {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      router.push('/checkout');
      return;
    }
    setLeaving(true);
    setTimeout(() => router.push('/checkout'), 200);
  }

  function jumpTo(id) {
    setMounted((m) => new Set(m).add(id));
    setOpen((prev) => new Set(prev).add(id));
    setActiveCat(id);
    requestAnimationFrame(() => {
      sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function expandAll() {
    const ids = categories.map((c) => c.id);
    setMounted(new Set(ids));
    setOpen(new Set(ids));
  }

  function collapseAll() {
    setOpen(new Set());
  }

  // Highlight the chip for whichever category is nearest the top of the viewport.
  useEffect(() => {
    if (!categories.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiveCat(visible.target.dataset.category);
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: 0 }
    );
    Object.values(sectionRefs.current).forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [categories]);

  useEffect(() => {
    if (!activeCat || !railRef.current) return;
    const chip = railRef.current.querySelector(`[data-chip="${activeCat}"]`);
    if (!chip) return;
    const rail = railRef.current;
    rail.scrollTo({
      left: Math.max(0, chip.offsetLeft - rail.clientWidth / 2 + chip.clientWidth / 2),
      behavior: 'smooth',
    });
  }, [activeCat]);

  function handleAdd(item) {
    if (item.variations?.length) return setSheetItem(item);
    addItem(item);
  }

  /* ------------------------------- states ------------------------------- */

  if (error) {
    return (
      <main className="page">
        <div className="state">
          <span className="state__emoji">☕</span>
          <p className="state__text">{error}</p>
          <button className="btn btn--outline" onClick={load}>
            Try Again
          </button>
        </div>
      </main>
    );
  }

  if (!menu) {
    return (
      <main className="page">
        <div className="state">
          <BrewLoader />
          <p className="state__text">Curating the menu…</p>
        </div>
      </main>
    );
  }

  const openCount = categories.filter((c) => isOpen(c.id)).length;

  /* -------------------------------- render ------------------------------- */

  return (
    // The cart bar is fixed over the bottom of the viewport, so the footer
    // needs extra clearance whenever it is showing, or it sits on the links.
    <main
      className={`page page-enter${totalItems > 0 ? ' page--cart-open' : ''}${
        leaving ? ' page--leaving' : ''
      }`}
    >
      <header className="hero">
        <div className="container">
          <div className="hero__logo-wrap">
            <SoulLogo />
          </div>
          {/* The lockup already carries the name and the tagline, so the
              headings stay for search engines and screen readers only. */}
          <h1 className="sr-only">{menu.store?.name || STORE_NAME}</h1>
          <p className="sr-only">
            {menu.store?.tagline || 'Speciality Coffees & Fusion Bakehouse'}
          </p>
        </div>
      </header>

      <nav className="catnav">
        <div className="catnav__rail no-scrollbar" ref={railRef}>
          {menu.categories.map((c) => (
            <button
              key={c.id}
              data-chip={c.id}
              className={`chip${activeCat === c.id ? ' chip--active' : ''}`}
              onClick={() => jumpTo(c.id)}
            >
              <span className="chip__emoji">{emojiFor(c.id)}</span>
              {c.name}
            </button>
          ))}
        </div>
      </nav>

      <div className="container">
        <div className="search">
          <div className="search__field">
            <span className="search__icon">🔍</span>
            <input
              className="search__input"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for coffee, toast, bagels…"
              aria-label="Search the menu"
            />
            {query ? (
              <button className="search__clear" onClick={() => setQuery('')} aria-label="Clear search">
                ✕
              </button>
            ) : null}
          </div>
        </div>

        {!searching ? (
          <button className="helpme" onClick={() => setRecommendOpen(true)}>
            <span className="helpme__spark" aria-hidden="true">
              ✨
            </span>
            <span className="helpme__text">
              <strong>Not sure what to get?</strong>
              <span>Answer four quick questions</span>
            </span>
            <span className="helpme__go" aria-hidden="true">
              →
            </span>
          </button>
        ) : null}

        {!searching ? <FeaturedRail items={featured} onAdd={handleAdd} /> : null}

        <div className="menu">
          <div className="menu__bar">
            <span className="menu__hint">
              {searching
                ? `${categories.reduce((n, c) => n + c.items.length, 0)} match${
                    categories.reduce((n, c) => n + c.items.length, 0) === 1 ? '' : 'es'
                  }`
                : `${menu.categories.length} sections · tap to open`}
            </span>
            {!searching ? (
              <button
                className="menu__toggle"
                onClick={openCount > 0 ? collapseAll : expandAll}
              >
                {openCount > 0 ? 'Collapse all' : 'Expand all'}
              </button>
            ) : null}
          </div>

          {categories.length === 0 ? (
            <p className="empty-search">Nothing on the menu matches “{query}”.</p>
          ) : (
            categories.map((c) => {
              const openNow = isOpen(c.id);
              return (
                <section
                  key={c.id}
                  id={c.id}
                  className={`cat${openNow ? ' cat--open' : ''}${
                    revealed.has(c.id) ? ' cat--in' : ''
                  }`}
                  data-category={c.id}
                  ref={(el) => {
                    sectionRefs.current[c.id] = el;
                  }}
                >
                  <button
                    className="cat__head"
                    onClick={() => toggle(c.id)}
                    aria-expanded={openNow}
                    aria-controls={`panel-${c.id}`}
                  >
                    <span className="cat__emoji">{emojiFor(c.id)}</span>
                    <h2 className="cat__name">{c.name}</h2>
                    <span className="cat__count">{c.items.length}</span>
                    <span className="cat__chevron" aria-hidden="true">
                      ⌄
                    </span>
                  </button>

                  <CatPanel open={openNow} id={`panel-${c.id}`}>
                    {isMounted(c.id) ? (
                      <div className="cards">
                        {c.items.map((item, i) => (
                          <MenuCard
                            key={`${item.id}-${openNow}`}
                            item={item}
                            index={i}
                            onAdd={handleAdd}
                          />
                        ))}
                      </div>
                    ) : null}
                  </CatPanel>
                </section>
              );
            })
          )}
        </div>
      </div>

      <footer className="footer">
        <div className="container">
          <p>
            © {new Date().getFullYear()} {menu.store?.name || STORE_NAME} — Specialty Coffee and
            Fusion Bakehouse
          </p>
          {menu.store?.address ? <p className="footer__address">{menu.store.address}</p> : null}

          <div className="footer__links">
            <a
              className="footer__link"
              href="https://maps.app.goo.gl/3uecwRSdbySQzTFA8"
              target="_blank"
              rel="noopener noreferrer"
            >
              <PinIcon />
              Visit us
            </a>
            <a
              className="footer__link"
              href="https://www.instagram.com/soulthecafe/"
              target="_blank"
              rel="noopener noreferrer"
            >
              <InstagramIcon />
              Instagram
            </a>
          </div>
        </div>
      </footer>

      {totalItems > 0 ? (
        <div className="fab-wrap">
          <button className={`fab${leaving ? ' fab--leaving' : ''}`} onClick={goToCheckout}>
            <span className="fab__left">
              🛒 <span className="fab__badge">{totalItems}</span> View Cart
            </span>
            <span>{formatINR(subtotal)}</span>
          </button>
        </div>
      ) : null}

      {recommendOpen ? (
        <RecommendSheet
          categories={menu.categories}
          onAdd={handleAdd}
          onClose={() => setRecommendOpen(false)}
        />
      ) : null}

      {sheetItem ? (
        <VariationSheet
          item={sheetItem}
          onClose={() => setSheetItem(null)}
          onPick={(v) => {
            addItem(sheetItem, v);
            setSheetItem(null);
          }}
        />
      ) : null}
    </main>
  );
}
