import { Button } from '@/components/controls'
import { Select } from '@/components/form'

/**
 * The no-JavaScript way to pick a period: two selects of the plotted dates and
 * a submit, as a plain GET form so the choice lands in the URL like a drag does.
 * Every other current query parameter rides along as a hidden input. Copy comes
 * in through `labels` and `formatDate`; the component knows no language.
 *
 * The selects are uncontrolled, so the form is keyed by the period: a chart
 * drag navigates on the client, and without a new key the selects would keep
 * the old period and submitting would undo the drag.
 */
export function RangeSelectForm({
  dates,
  from,
  to,
  keep,
  labels,
  formatDate = (date) => date,
  action = '/net-worth',
  describedBy,
}: {
  /** The plotted snapshot dates, ascending. */
  dates: string[]
  from: string | null
  to: string | null
  /** Every other current query parameter, repeated as hidden inputs. */
  keep: Record<string, string>
  labels: { from: string; to: string; submit: string }
  formatDate?: (date: string) => string
  action?: string
  /** The id of the help text that explains the form, rendered by the caller. */
  describedBy?: string
}) {
  const first = dates[0] ?? ''
  const last = dates[dates.length - 1] ?? ''
  return (
    <form key={`${from ?? ''}:${to ?? ''}`} method="get" action={action} aria-describedby={describedBy} className="flex flex-wrap items-end gap-3">
      {Object.entries(keep)
        .filter(([key]) => key !== 'from' && key !== 'to')
        .map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
      <label className="flex flex-col gap-1 text-label text-ink-3">
        <span>{labels.from}</span>
        <Select name="from" size="md" defaultValue={from ?? first}>
          {dates.map((date) => (
            <option key={date} value={date}>
              {formatDate(date)}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-label text-ink-3">
        <span>{labels.to}</span>
        <Select name="to" size="md" defaultValue={to ?? last}>
          {dates.map((date) => (
            <option key={date} value={date}>
              {formatDate(date)}
            </option>
          ))}
        </Select>
      </label>
      <Button type="submit" size="md">
        {labels.submit}
      </Button>
    </form>
  )
}
