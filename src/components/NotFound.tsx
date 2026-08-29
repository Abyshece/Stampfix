export function NotFound() {
  return (
    <div className="min-h-screen bg-[#FBFBFA] flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="flex items-center gap-2 mb-6 text-[#37352F]">
        <span className="w-3 h-3 bg-[#37352F]" />
        <span className="w-3 h-3 bg-[#37352F] rounded-full" />
        <span className="font-bold text-lg leading-none">&#10005;</span>
      </div>
      <h1 className="text-3xl font-serif-display font-semibold mb-2">Page not found</h1>
      <p className="text-gray-500 mb-6 max-w-sm">The page you&rsquo;re looking for doesn&rsquo;t exist or may have moved.</p>
      <a href="/" className="bg-[#37352F] text-white px-6 py-3 rounded-lg font-medium hover:bg-opacity-90 transition">Back to home</a>
    </div>
  );
}
