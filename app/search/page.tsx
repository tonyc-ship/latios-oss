// app/search/SearchPage.server.tsx

import SearchClient from "./SearchClient";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ query?: string }>;
}) {
  const params = await searchParams;
  const query = params.query || "";
  
  return (
    <div className="container mx-auto px-2 sm:px-6 md:px-8">
      {/* Transparent placeholder - only show on mobile */}
      <div className="sm:hidden flex justify-center mb-6">
        <img 
          src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
          alt="Placeholder"
          className="h-0" 
        />
      </div>

      {/* Search Form */}
      <SearchClient initialQuery={query} />
    </div>
  );
}