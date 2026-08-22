'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Drag-to-pin location picker.
 *
 * Written by hand rather than pulling in Leaflet or the Google Maps SDK: the
 * project ships no UI dependencies, and all this needs is a pannable tile grid
 * with a fixed centre crosshair — the pin is always the middle of the viewport,
 * so "where is the pin" is just "what are the centre coordinates".
 *
 * Tiles come from OpenStreetMap, whose usage policy asks for attribution (shown
 * bottom-right) and light traffic. At café order volume that is fine; a busy
 * store should move to a keyed provider.
 */

const TILE = 256;
const MIN_ZOOM = 13;
const MAX_ZOOM = 19;

/** WGS84 -> world pixel coordinates at a given zoom (standard slippy map maths). */
function toWorldPx(lat, lon, zoom) {
  const n = TILE * 2 ** zoom;
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const rad = (clamped * Math.PI) / 180;
  return {
    x: ((lon + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n,
  };
}

function toLatLon(x, y, zoom) {
  const n = TILE * 2 ** zoom;
  const lon = (x / n) * 360 - 180;
  const m = Math.PI - (2 * Math.PI * y) / n;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(m) - Math.exp(-m)));
  return { lat, lon };
}

export default function MapPicker({ initial, onCancel, onConfirm, busy, error }) {
  const [zoom, setZoom] = useState(17);
  const [center, setCenter] = useState(() => toWorldPx(initial.lat, initial.lon, 17));
  const [size, setSize] = useState({ w: 360, h: 260 });

  const boxRef = useRef(null);
  const drag = useRef(null);

  // Measure the viewport so exactly the visible tiles are requested.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  function changeZoom(delta) {
    setZoom((z) => {
      const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z + delta));
      if (next === z) return z;
      // Keep the pinned point under the crosshair across the zoom change.
      setCenter((c) => {
        const { lat, lon } = toLatLon(c.x, c.y, z);
        return toWorldPx(lat, lon, next);
      });
      return next;
    });
  }

  function onPointerDown(e) {
    drag.current = { x: e.clientX, y: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) drag.current.moved = true;
    drag.current.x = e.clientX;
    drag.current.y = e.clientY;
    setCenter((c) => ({ x: c.x - dx, y: c.y - dy }));
  }

  function onPointerUp(e) {
    drag.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // capture may already be gone if the pointer left the window
    }
  }

  const { lat, lon } = toLatLon(center.x, center.y, zoom);

  // Which tiles cover the viewport right now.
  const originX = center.x - size.w / 2;
  const originY = center.y - size.h / 2;
  const firstX = Math.floor(originX / TILE);
  const firstY = Math.floor(originY / TILE);
  const lastX = Math.floor((originX + size.w) / TILE);
  const lastY = Math.floor((originY + size.h) / TILE);
  const span = 2 ** zoom;

  const tiles = [];
  for (let tx = firstX; tx <= lastX; tx++) {
    for (let ty = firstY; ty <= lastY; ty++) {
      if (ty < 0 || ty >= span) continue;
      const wrapped = ((tx % span) + span) % span; // let the world repeat sideways
      tiles.push({
        key: `${zoom}/${tx}/${ty}`,
        url: `https://tile.openstreetmap.org/${zoom}/${wrapped}/${ty}.png`,
        left: tx * TILE - originX,
        top: ty * TILE - originY,
      });
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onCancel} role="dialog" aria-modal="true">
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__grabber" />
        <h3 className="sheet__title">Pin your location</h3>
        <p className="sheet__subtitle">Drag the map so the pin sits on your door</p>

        <div
          className="mappick"
          ref={boxRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {tiles.map((t) => (
            <img
              key={t.key}
              className="mappick__tile"
              src={t.url}
              alt=""
              draggable={false}
              style={{ left: `${t.left}px`, top: `${t.top}px` }}
            />
          ))}

          <span className="mappick__pin" aria-hidden="true">
            📍
          </span>

          <div className="mappick__zoom">
            <button type="button" onClick={() => changeZoom(1)} aria-label="Zoom in">
              +
            </button>
            <button type="button" onClick={() => changeZoom(-1)} aria-label="Zoom out">
              −
            </button>
          </div>

          <a
            className="mappick__credit"
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            © OpenStreetMap
          </a>
        </div>

        <p className="mappick__coords">
          {lat.toFixed(5)}, {lon.toFixed(5)}
        </p>

        {error ? <p className="form-error">{error}</p> : null}

        <div className="mappick__actions">
          <button type="button" className="btn btn--outline" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => onConfirm({ lat, lon })}
            disabled={busy}
          >
            {busy ? 'Finding address…' : 'Use this location'}
          </button>
        </div>
      </div>
    </div>
  );
}
