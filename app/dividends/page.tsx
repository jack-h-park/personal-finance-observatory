import { redirect } from 'next/navigation'

/** Dividends repeated Income's yearly view; Income is the one page for them. */
export default function DividendsRedirect(): never {
  redirect('/income')
}
