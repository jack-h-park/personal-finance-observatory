import { PageHeader } from '@/components/PageHeader'
import { SubmitButton } from '@/components/SubmitButton'
import { Card, FormError, Note } from '@/components/ui'
import { TextLink } from '@/components/controls'
import { Field } from '@/components/form'
import { Columns } from '@/components/layout'
import { DEFAULT_NET_WORTH_SETTINGS, FIELD_LIMITS, getNetWorthSettingsState, type NetWorthSettings, type SettingsErrorCode } from '@/lib/net-worth-settings'
import { getLanguage } from '@/lib/i18n-server'
import { routeMetadata, routeSection } from '@/lib/page-names'
import { getPageCopy } from '@/lib/ui-copy'
import { resetNetWorthSettingsAction, saveNetWorthSettingsAction } from './actions'

export const dynamic = 'force-dynamic'
export const generateMetadata = routeMetadata('/net-worth/settings')

type Params = { saved?: string; reset?: string; error?: string; code?: string | string[] }

const CODES: readonly SettingsErrorCode[] = ['not_a_number', 'out_of_range', 'check_below_watch', 'write_failed']

export default async function NetWorthSettingsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams
  const language = await getLanguage()
  const copy = getPageCopy('netWorthSettings', language)
  const state = getNetWorthSettingsState()
  const { settings } = state
  const flags = copy.flags
  const codes = (params.code === undefined ? [] : Array.isArray(params.code) ? params.code : [params.code]).map((entry) => entry.split(':')[0])
  const messages = [...new Set(codes.filter((code): code is SettingsErrorCode => (CODES as readonly string[]).includes(code)))].map((code) => copy.errors[code])

  const fields: { name: keyof NetWorthSettings; label: string; help: string; unit: string }[] = [
    { name: 'checkMillionKrw', label: flags.check, help: flags.checkHelp, unit: flags.millionKrw },
    { name: 'watchMillionKrw', label: flags.watch, help: flags.watchHelp, unit: flags.millionKrw },
    { name: 'streakMonths', label: flags.streak, help: flags.streakHelp, unit: flags.months },
    { name: 'pairNetPercent', label: flags.pair, help: flags.pairHelp, unit: flags.percent },
  ]

  return (
    <>
      <PageHeader
        eyebrow={routeSection('/net-worth/settings', language)}
        title={copy.title}
        emphasis={copy.emphasis}
        subtitle={copy.subtitle}
        status={params.saved ? { severity: 'ok', label: copy.saved } : params.reset ? { severity: 'ok', label: copy.resetDone } : undefined}
        autoRefresh={false}
      />

      {params.error && (
        <>
          <FormError title={copy.errorsTitle} messages={messages} />
          <Note size="caption" spacing="below-4">{copy.errorsNote}</Note>
        </>
      )}
      {state.error && <p className="mb-4 text-caption text-warning">{copy.unreadable(state.error)}</p>}

      <Card title={flags.title} info={flags.info}>
        <form action={saveNetWorthSettingsAction} className="space-y-4">
          <Columns columns="sm-2" gap={4}>
            {fields.map(({ name, label, help, unit }) => (
              <Field
                key={name}
                label={label}
                name={name}
                defaultValue={settings[name]}
                suffix={unit}
                hint={`${help} ${flags.range(FIELD_LIMITS[name].min, FIELD_LIMITS[name].max)}`}
              />
            ))}
          </Columns>
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton>{flags.save}</SubmitButton>
            <span className="text-label text-ink-3">{state.custom ? flags.custom : flags.standard}</span>
          </div>
        </form>
        <form action={resetNetWorthSettingsAction} className="mt-4 flex flex-wrap items-center gap-3 border-t border-line-subtle pt-4">
          <SubmitButton variant="ghost">{flags.reset}</SubmitButton>
          <span className="text-label text-ink-3">
            {flags.defaults(
              DEFAULT_NET_WORTH_SETTINGS.checkMillionKrw,
              DEFAULT_NET_WORTH_SETTINGS.watchMillionKrw,
              DEFAULT_NET_WORTH_SETTINGS.streakMonths,
              DEFAULT_NET_WORTH_SETTINGS.pairNetPercent
            )}
          </span>
        </form>
      </Card>
      <p className="mt-4">
        <TextLink href="/net-worth#net-worth-history">{copy.back}</TextLink>
      </p>
    </>
  )
}
