import { redirect } from 'next/navigation'
import { redirectWithQuery } from '@/lib/table-filter'

/**
 * Cost basis is a filter and two columns of Holdings now. The status, market,
 * broker, account, search and sort parameters share their names with Holdings,
 * so an old link keeps its filter.
 */
export default async function CostBasisRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}): Promise<never> {
  redirect(redirectWithQuery('/holdings', await searchParams))
}
