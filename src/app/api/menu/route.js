import menu from '@/data/menu.json';

export const dynamic = 'force-static';

export async function GET() {
  const categories = menu.categories
    .map((c) => ({ ...c, items: c.items.filter((i) => i.available !== false) }))
    .filter((c) => c.items.length > 0);

  return Response.json(
    { ...menu, categories },
    { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' } }
  );
}
