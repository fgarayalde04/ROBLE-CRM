import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ReviewClient from './ReviewClient'

export default async function ReviewPage({ params }: { params: { uploadId: string } }) {
  const session = await getSession()
  if (!session) redirect('/login')

  return <ReviewClient uploadId={params.uploadId} />
}
