export default function SettingsLoading() {
  return (
    <div className="p-6 bg-[#F4F6F8] min-h-screen animate-pulse">
      <div className="mb-6 space-y-2">
        <div className="h-5 w-36 bg-gray-200 rounded" />
        <div className="h-3 w-48 bg-gray-200 rounded" />
      </div>

      <div className="max-w-2xl space-y-5">
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-5 space-y-4">
          <div className="h-3 w-16 bg-gray-200 rounded" />
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gray-200 shrink-0" />
            <div className="space-y-2">
              <div className="h-4 w-32 bg-gray-200 rounded" />
              <div className="h-3 w-48 bg-gray-200 rounded" />
            </div>
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-lg p-5 space-y-3">
          <div className="h-3 w-40 bg-gray-200 rounded" />
          <div className="h-3 w-64 bg-gray-200 rounded" />
          <div className="h-12 w-full bg-gray-100 rounded-lg" />
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-lg p-5 space-y-3">
          <div className="h-3 w-44 bg-gray-200 rounded" />
          <div className="h-3 w-56 bg-gray-200 rounded" />
        </div>
      </div>
    </div>
  )
}
