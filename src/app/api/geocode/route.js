export const dynamic = 'force-dynamic';

/**
 * Reverse geocoding for the "use my location" button.
 *
 * The browser gives coordinates; turning those into something a rider can
 * follow needs a geocoder. PetPooja does not offer one — it stores whatever
 * address string it is handed — so this goes to a mapping provider instead.
 *
 * Google is used when GOOGLE_MAPS_API_KEY is set (better Indian street-level
 * data), otherwise it falls back to OpenStreetMap's Nominatim, which needs no
 * key. Nominatim asks for a real User-Agent and rate-limits to ~1 request per
 * second, which is fine at this order volume but is the reason to move to a
 * keyed provider if the café gets busy.
 *
 * The call is proxied through the server so an API key is never shipped to the
 * browser.
 */

const NOMINATIM = 'https://nominatim.openstreetmap.org/reverse';
const GOOGLE = 'https://maps.googleapis.com/maps/api/geocode/json';

function bad(message, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get('lat'));
  const lon = Number(searchParams.get('lon'));

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return bad('Coordinates required.');
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return bad('Coordinates out of range.');

  const key = process.env.GOOGLE_MAPS_API_KEY;

  try {
    if (key) {
      const res = await fetch(`${GOOGLE}?latlng=${lat},${lon}&key=${key}&region=in`, {
        cache: 'no-store',
      });
      const data = await res.json();
      const address = data?.results?.[0]?.formatted_address;
      if (!address) return bad('No address found for that location.', 404);
      return Response.json({ address, provider: 'google' });
    }

    const url = `${NOMINATIM}?format=jsonv2&lat=${lat}&lon=${lon}&addressdetails=1&zoom=18`;
    const res = await fetch(url, {
      cache: 'no-store',
      headers: {
        'User-Agent': 'SoulCafeMenu/1.0 (ordering site; contact via soulthecafe on Instagram)',
        'Accept-Language': 'en',
      },
    });

    if (!res.ok) return bad('Location lookup is unavailable right now.', 502);

    const data = await res.json();
    if (!data?.display_name) return bad('No address found for that location.', 404);

    // display_name trails through city/state/country/postcode; the leading
    // parts are the useful, rider-readable bit.
    const address = data.display_name.split(',').slice(0, 6).join(',').trim();
    return Response.json({ address, provider: 'nominatim' });
  } catch {
    return bad('Could not look up that location.', 502);
  }
}
