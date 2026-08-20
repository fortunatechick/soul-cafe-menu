'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useCart } from '@/context/CartContext';
import { fetchMenu, formatINR } from '@/lib/api';
import mediaManifest from '@/data/media-manifest.json';

const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME || 'Soul';

/* ---------------------------------- bits ---------------------------------- */

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
  const [src, setSrc] = useState('/soul-logo.png');
  return (
    <img
      className="hero__logo"
      src={src}
      alt={`${STORE_NAME} logo`}
      width={72}
      height={72}
      onError={() => setSrc('/soul-logo.svg')}
    />
  );
}

/** Bottom sheet for items that come in sizes / variants. */
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

function MenuCard({ item, index, onAdd }) {
  const { quantityOfItem, lines, updateQuantity } = useCart();
  const [bounce, setBounce] = useState(false);
  const qty = quantityOfItem(item.id);
  const photo = mediaManifest[item.slug];
  const hasVariations = Boolean(item.variations?.length);

  // Card-level +/- only makes sense when a single line exists for this item.
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
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
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
              onClick={() => updateQuantity(soleLine[0].key, qty - 1)}
              aria-label={`Remove one ${item.name}`}
            >
              −
            </button>
            <span className="stepper__count">{qty}</span>
            <button
              className="stepper__btn"
              onClick={() => updateQuantity(soleLine[0].key, qty + 1)}
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
  const [activeCat, setActiveCat] = useState('');
  const [sheetItem, setSheetItem] = useState(null);

  const railRef = useRef(null);
  const sectionRefs = useRef({});

  const load = useCallback(() => {
    setError('');
    setMenu(null);
    fetchMenu()
      .then(setMenu)
      .catch((e) => setError(e.message || 'Could not load the menu.'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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

  // Scroll spy — highlight the category the reader is currently inside.
  useEffect(() => {
    if (!categories.length || query) return;

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
  }, [categories, query]);

  // Keep the active chip centred in the horizontal rail.
  useEffect(() => {
    if (!activeCat || !railRef.current) return;
    const chip = railRef.current.querySelector(`[data-chip="${activeCat}"]`);
    if (!chip) return;
    const rail = railRef.current;
    const target = chip.offsetLeft - rail.clientWidth / 2 + chip.clientWidth / 2;
    rail.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  }, [activeCat]);

  function scrollToCategory(id) {
    setActiveCat(id);
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

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
          <div className="spinner" />
          <p className="state__text">Curating the menu…</p>
        </div>
      </main>
    );
  }

  /* -------------------------------- render ------------------------------- */

  return (
    <main className="page">
      <header className="hero">
        <div className="container">
          <div className="hero__logo-wrap">
            <SoulLogo />
          </div>
          <h1 className="hero__title">{menu.store?.name || STORE_NAME}</h1>
          <p className="hero__subtitle">
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
              onClick={() => scrollToCategory(c.id)}
            >
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

        <div className="menu">
          {categories.length === 0 ? (
            <p className="empty-search">Nothing on the menu matches “{query}”.</p>
          ) : (
            categories.map((c) => (
              <section
                key={c.id}
                id={c.id}
                className="section"
                data-category={c.id}
                ref={(el) => {
                  sectionRefs.current[c.id] = el;
                }}
              >
                <h2 className="section__title">
                  {c.name}
                  <span className="section__count">{c.items.length}</span>
                </h2>
                <div className="cards">
                  {c.items.map((item, i) => (
                    <MenuCard key={item.id} item={item} index={i} onAdd={handleAdd} />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>

      <footer className="footer">
        <div className="container">
          <p>© {new Date().getFullYear()} {menu.store?.name || STORE_NAME} — all day, every day.</p>
          {menu.store?.address ? <p className="footer__address">{menu.store.address}</p> : null}
        </div>
      </footer>

      {totalItems > 0 ? (
        <div className="fab-wrap">
          <Link href="/checkout" className="fab">
            <span className="fab__left">
              🛒 <span className="fab__badge">{totalItems}</span> View Cart
            </span>
            <span>{formatINR(subtotal)}</span>
          </Link>
        </div>
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
