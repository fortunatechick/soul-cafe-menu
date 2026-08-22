'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatINR } from '@/lib/api';
import { recommend, QUESTIONS } from '@/lib/recommend';
import mediaManifest from '@/data/media-manifest.json';

/**
 * "Help me choose" — the customer picks what they feel like, and the menu is
 * scored against it. Runs entirely in the browser: the menu is already loaded,
 * so there is nothing to wait for and no request to make.
 */
export default function RecommendSheet({ categories, onAdd, onClose }) {
  const [answers, setAnswers] = useState({ kinds: [], temp: null, flavours: [], budget: null });
  const [showResults, setShowResults] = useState(false);
  const [added, setAdded] = useState({});

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const { results, relaxed } = useMemo(
    () =>
      showResults
        ? recommend(categories, answers, { hasPhoto: (i) => Boolean(mediaManifest[i.slug]) })
        : { results: [], relaxed: [] },
    [showResults, categories, answers]
  );

  function toggle(question, value) {
    setAnswers((prev) => {
      if (!question.multi) return { ...prev, [question.id]: prev[question.id] === value ? null : value };
      const list = prev[question.id];
      return {
        ...prev,
        [question.id]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value],
      };
    });
  }

  function isSelected(question, value) {
    const current = answers[question.id];
    return question.multi ? current.includes(value) : current === value;
  }

  function handleAdd(entry) {
    onAdd(entry.item);
    setAdded((a) => ({ ...a, [entry.item.id]: true }));
  }

  const nothingChosen =
    !answers.kinds.length && !answers.flavours.length && !answers.temp && !answers.budget;

  return (
    <div className="sheet-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="sheet sheet--tall" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__grabber" />

        {!showResults ? (
          <>
            <h3 className="sheet__title">Help me choose</h3>
            <p className="sheet__subtitle">Tell us what you feel like</p>

            {QUESTIONS.map((q) => (
              <div className="recq" key={q.id}>
                <p className="recq__label">{q.label}</p>
                <div className="recq__opts">
                  {q.options.map((o) => (
                    <button
                      key={String(o.value)}
                      type="button"
                      className={`recq__opt${isSelected(q, o.value) ? ' recq__opt--on' : ''}`}
                      onClick={() => toggle(q, o.value)}
                      aria-pressed={isSelected(q, o.value)}
                    >
                      <span aria-hidden="true">{o.emoji}</span> {o.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <button
              className="btn btn--primary recq__go"
              onClick={() => setShowResults(true)}
              disabled={nothingChosen}
            >
              {nothingChosen ? 'Pick at least one' : 'Show me what to order'}
            </button>
          </>
        ) : (
          <>
            <h3 className="sheet__title">We&apos;d go for these</h3>
            <p className="sheet__subtitle">
              {results.length
                ? `${results.length} picks${relaxed.length ? ` · ${relaxed.join(', ')}` : ''}`
                : 'Nothing matched'}
            </p>

            {results.length === 0 ? (
              <p className="empty-search">
                Nothing on the menu fits that combination. Try widening it a little.
              </p>
            ) : (
              results.map((entry) => {
                const photo = mediaManifest[entry.item.slug];
                const isAdded = added[entry.item.id];
                return (
                  <div className="rec" key={entry.item.id}>
                    {photo ? (
                      <img className="rec__photo" src={photo} alt={entry.item.name} loading="lazy" />
                    ) : (
                      <span className="rec__photo rec__photo--none" aria-hidden="true">
                        🍽️
                      </span>
                    )}
                    <div className="rec__body">
                      <p className="rec__name">{entry.item.name}</p>
                      <p className="rec__why">
                        {entry.category.name}
                        {entry.reasons.length ? ` · ${entry.reasons.slice(0, 2).join(' · ')}` : ''}
                      </p>
                      <p className="rec__price">
                        {entry.item.variations ? 'from ' : ''}
                        {formatINR(entry.item.price)}
                      </p>
                    </div>
                    <button
                      className={`add-btn${isAdded ? ' add-btn--disabled' : ''}`}
                      onClick={() => handleAdd(entry)}
                    >
                      {isAdded ? 'Added' : entry.item.variations ? 'Pick' : 'Add'}
                    </button>
                  </div>
                );
              })
            )}

            <div className="recq__actions">
              <button className="btn btn--outline" onClick={() => setShowResults(false)}>
                Change answers
              </button>
              <button className="btn btn--primary" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
