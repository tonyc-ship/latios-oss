import type { Metadata } from 'next';

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string | undefined;

  let title = 'Podcast | Latios';
  let description = 'Discover episodes, summaries, and key takeaways.';
  let ogImage: string | undefined;
  let podcastTitle: string | undefined;
  let podcastAuthor: string | undefined;

  try {
    if (supabaseUrl && supabaseAnonKey && id) {
      const url = `${supabaseUrl}/rest/v1/tbl_podcast?select=itunes_id,title,itunes_author,description,image,itunes_image&itunes_id=eq.${encodeURIComponent(id)}`;
      const res = await fetch(url, {
        headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}`, Accept: 'application/json' },
        cache: 'no-store',
      });
      if (res.ok) {
        const rows = await res.json();
        const podcast = Array.isArray(rows) ? rows[0] : rows;
        if (podcast) {
          podcastTitle = podcast.title || undefined;
          podcastAuthor = podcast.itunes_author || undefined;
          const baseTitle = podcast.title || 'Podcast';
          title = `${baseTitle} — Episodes & Summaries | Latios`;
          const desc = podcast.description || '';
          description = (desc || `Explore episodes from ${baseTitle}${podcastAuthor ? ' by ' + podcastAuthor : ''}.`).slice(0, 300);
          ogImage = podcast.itunes_image || podcast.image || undefined;
        }
      }
    }
  } catch {}

  const canonical = `https://www.latios.ai/podcast/${id}?type=apple`;

  return {
    title,
    description,
    keywords: ['podcast', 'episodes', 'summary', podcastTitle || '', podcastAuthor || ''].filter(Boolean),
    alternates: { canonical, languages: { en: canonical, zh: canonical } },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: 'Latios',
      type: 'website',
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

export default async function PodcastLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>
}) {
  let jsonLd: any = null;
  let breadcrumbJsonLd: any = null;
  try {
    const { id } = await params;
    const baseUrl = 'https://www.latios.ai';
    const pageUrl = `${baseUrl}/podcast/${id}?type=apple`;

    // Fetch minimal podcast info for JSON-LD
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string | undefined;
    let name: string | undefined;
    let description: string | undefined;
    let image: string | undefined;
    let author: string | undefined;
    if (supabaseUrl && supabaseAnonKey) {
      const url = `${supabaseUrl}/rest/v1/tbl_podcast?select=title,itunes_author,description,image,itunes_image&itunes_id=eq.${encodeURIComponent(id)}`;
      const res = await fetch(url, { headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` }, cache: 'no-store' });
      const rows = res.ok ? await res.json() : [];
      const p = Array.isArray(rows) ? rows[0] : rows;
      if (p) {
        name = p.title || 'Podcast';
        description = (p.description || '').slice(0, 500) || undefined;
        image = p.itunes_image || p.image || undefined;
        author = p.itunes_author || undefined;
      }
    }

    jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'PodcastSeries',
      name,
      description,
      url: pageUrl,
      image,
      author: author ? { '@type': 'Person', name: author } : undefined,
      isAccessibleForFree: true,
    };

    breadcrumbJsonLd = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: baseUrl },
        { '@type': 'ListItem', position: 2, name: 'Podcasts', item: `${baseUrl}/podcast` },
        { '@type': 'ListItem', position: 3, name: name || 'Podcast', item: pageUrl },
      ],
    };
  } catch {}

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4">
        {children}
      </div>
      {jsonLd ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      ) : null}
      {breadcrumbJsonLd ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      ) : null}
    </div>
  );
}


