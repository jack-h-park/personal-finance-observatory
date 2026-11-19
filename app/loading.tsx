import { PageSkeleton } from '@/components/PageSkeleton'
import { getLanguage } from '@/lib/i18n-server'

/** Shown while a route's server data loads; every route shares this shape. */
export default async function Loading() {
  return <PageSkeleton language={await getLanguage()} />
}
