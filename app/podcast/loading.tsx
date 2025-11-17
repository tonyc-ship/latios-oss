export default function Loading() {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-10 h-10 rounded-full bg-gray-200 animate-pulse" />
          <div className="h-8 w-32 bg-gray-200 rounded animate-pulse" />
        </div>
  
        <div className="mb-8">
          <div className="flex gap-2 mb-4">
            <div className="relative flex-1 max-w-md h-10 bg-gray-200 rounded animate-pulse" />
            <div className="w-20 h-10 bg-gray-200 rounded animate-pulse" />
          </div>
  
          <div className="bg-white rounded-lg shadow">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="p-4 border-b flex gap-4 animate-pulse">
                <div className="w-32 h-32 bg-gray-200 rounded-lg" />
                <div className="flex-1 space-y-4">
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-4 bg-gray-200 rounded w-1/2" />
                  <div className="h-4 bg-gray-200 rounded w-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }