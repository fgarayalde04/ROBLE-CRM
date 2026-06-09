export default function MailLoading() {
  return (
    <div className="p-4 md:p-6 bg-[#F4F6F8] min-h-screen animate-pulse">
      {/* Header */}
      <div className="hidden md:flex items-center justify-between mb-6">
        <div className="space-y-2">
          <div className="h-5 w-16 bg-gray-200 rounded" />
          <div className="h-3 w-48 bg-gray-200 rounded" />
        </div>
      </div>

      {/* Tabs skeleton */}
      <div className="flex gap-2 mb-5">
        <div className="h-9 w-28 bg-gray-200 rounded-lg" />
        <div className="h-9 w-28 bg-gray-200 rounded-lg" />
        <div className="h-9 w-28 bg-gray-200 rounded-lg" />
      </div>

      {/* Main card */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-4">
        <div className="h-4 w-40 bg-gray-200 rounded" />
        <div className="h-10 w-full bg-gray-100 rounded-lg" />
        <div className="h-10 w-full bg-gray-100 rounded-lg" />
        <div className="h-24 w-full bg-gray-100 rounded-lg" />
        <div className="h-9 w-28 bg-gray-200 rounded-lg" />
      </div>
    </div>
  )
}
