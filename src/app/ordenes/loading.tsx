export default function OrdenesLoading() {
  return (
    <div className="p-4 md:p-6 bg-[#F4F6F8] min-h-screen animate-pulse">
      {/* Header */}
      <div className="hidden md:flex items-center justify-between mb-6">
        <div className="h-5 w-36 bg-gray-200 rounded" />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 mb-6">
        <div className="h-9 w-32 bg-gray-200 rounded-t-lg" />
        <div className="h-9 w-32 bg-gray-200 rounded-t-lg opacity-60" />
      </div>

      {/* Form area */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-3">
            <div className="h-4 w-24 bg-gray-200 rounded" />
            <div className="h-10 w-full bg-gray-100 rounded-lg" />
            <div className="h-10 w-full bg-gray-100 rounded-lg" />
            <div className="h-10 w-full bg-gray-100 rounded-lg" />
          </div>
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-3">
            <div className="h-4 w-20 bg-gray-200 rounded" />
            <div className="h-10 w-full bg-gray-100 rounded-lg" />
            <div className="h-10 w-full bg-gray-100 rounded-lg" />
          </div>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 h-64" />
      </div>
    </div>
  )
}
