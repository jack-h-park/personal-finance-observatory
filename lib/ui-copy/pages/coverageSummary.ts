import { defineCopy } from '@/lib/ui-copy/define'

export const coverageSummary = defineCopy({
  en: {
    title: 'Coverage review overview',
    notice: 'Counts describe configured source rows, not unique accounts or a complete inventory. History gaps may overlap status counts. Open the section for recorded dates and existing actions.',
    group: 'Source group', groups: { investments: 'Investments', bankCma: 'Banks / CMA', other: 'Pension / gold / price' },
    rows: (count: string) => `Source rows: ${count}`, empty: 'No configured source rows',
    statuses: { action_needed: 'Action needed', missing: 'No recorded data', unconfirmed: 'Query period unknown', due_soon: 'Due soon', current: 'Current status' },
    historyGaps: 'History gaps', gapNotice: 'A history gap can keep a recent source in Action needed. Pre-gap freshness is not available here; check recorded dates in the detail section.', inventory: 'Review inventory scope',
    inventoryNotice: 'Freshness does not confirm account identity, ownership or inventory completeness. Review scope separately.',
  },
  ko: {
    title: '커버리지 검토 요약',
    notice: '설정된 자료 행 기준이며 고유 계좌 수나 전체 목록의 완전성을 뜻하지 않습니다. 과거 구간 누락은 상태별 건수와 겹칠 수 있습니다. 기준일과 기존 조치는 각 상세에서 확인하세요.',
    group: '자료 구분', groups: { investments: '투자계좌', bankCma: '은행 / CMA', other: '연금 / 금 / 시세' },
    rows: (count: string) => `자료 ${count}행`, empty: '설정된 자료 행 없음',
    statuses: { action_needed: '자료 조치 필요', missing: '기록된 자료 없음', unconfirmed: '조회기간 미확인', due_soon: '곧 갱신', current: '최신 상태' },
    historyGaps: '과거 구간 누락', gapNotice: '최근 자료도 과거 구간 누락 때문에 조치 필요로 표시될 수 있습니다. 누락 조치 이전의 최신성은 확인할 수 없습니다. 상세의 기록된 기준일을 확인하세요.', inventory: '계좌 목록 범위 검토',
    inventoryNotice: '자료 최신성만으로 계좌 식별·소유자·목록 완전성은 확인되지 않습니다. 목록 범위는 별도로 검토하세요.',
  },
})
