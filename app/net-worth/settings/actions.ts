'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { resetNetWorthSettings, saveNetWorthSettings, settingsFromFormData } from '@/lib/net-worth-settings'

const PATH = '/net-worth/settings'

function refresh() {
  revalidatePath(PATH)
  revalidatePath('/net-worth')
  revalidatePath('/')
}

export async function saveNetWorthSettingsAction(formData: FormData) {
  const { settings, errors } = settingsFromFormData(formData)
  if (errors.length) {
    const query = new URLSearchParams({ error: '1' })
    for (const error of errors) query.append('code', error.field ? `${error.code}:${error.field}` : error.code)
    redirect(`${PATH}?${query.toString()}`)
  }
  try {
    saveNetWorthSettings(settings)
  } catch (error) {
    console.error('[net-worth-settings] write failed:', error)
    redirect(`${PATH}?error=1&code=write_failed`)
  }
  refresh()
  redirect(`${PATH}?saved=1`)
}

export async function resetNetWorthSettingsAction() {
  try {
    resetNetWorthSettings()
  } catch (error) {
    console.error('[net-worth-settings] reset failed:', error)
    redirect(`${PATH}?error=1&code=write_failed`)
  }
  refresh()
  redirect(`${PATH}?reset=1`)
}
