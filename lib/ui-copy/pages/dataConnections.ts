import { defineCopy } from '@/lib/ui-copy/define'

const SNAPTRADE = 'SnapTrade'
const SIMPLEFIN = 'SimpleFIN Bridge'

export const dataConnections = defineCopy({
  en: {
    title: 'Data Connections',
    subtitle: 'Compare what each connection returned for each account and which source files still matter.',
    markets: { us: 'United States', kr: 'South Korea' },
    marketNav: 'Country',
    comparison: { us: 'US account connection coverage', kr: 'Korean account connection coverage' },
    reviewed: (date: string) => `Scope reviewed ${date}`,
    empty: 'No reviewed connection records for this country.',
    account: 'Account',
    related: 'Related views',
    other: 'Other source',
    sources: { snaptrade: SNAPTRADE, simplefin: SIMPLEFIN, other: 'Connection examined', files: 'Source files' },
    status: {
      shadow: 'Recurring · shadow',
      pilot: 'Pilot match',
      limited: 'Limited return',
      discovered: 'Account found',
      unreturned: 'Not returned',
      existing: 'Existing feed',
      unknown: 'Unverified',
      keep: 'Keep originals',
      required: 'File required',
    },
    notes: {
      us: 'Use both connectors where they add coverage. When they overlap, reconcile the same account, dates and transactions before combining records. A returned account or zero-row response alone does not confirm transaction coverage.',
      kr: 'CODEF results are from account-scoped pilots. Keep issuer statements for history, closing balances, and tax evidence. File parsing is included in the source-files column.',
    },
    detail: 'How to read the table',
    boundary: 'The table summarizes reviewed evidence. Recurring shadow feeds and pilot matches are separate from the records used for balances, transactions and reporting.',
  },
  ko: {
    title: '데이터 연동 조회',
    subtitle: '계좌마다 어떤 연동에서 무엇이 확인됐는지, 어떤 원본이 필요한지 비교합니다.',
    markets: { us: '미국', kr: '한국' },
    marketNav: '국가',
    comparison: { us: '미국 계좌별 연동 범위', kr: '한국 계좌별 연동 범위' },
    reviewed: (date: string) => `범위 확인일 ${date}`,
    empty: '이 국가에서 검토한 연동 기록이 없습니다.',
    account: '계좌',
    related: '관련 화면',
    other: '별도 수집',
    sources: { snaptrade: SNAPTRADE, simplefin: SIMPLEFIN, other: '확인된 연동', files: '원본 파일' },
    status: {
      shadow: '정기 검증 수집',
      pilot: '시험 대조',
      limited: '일부 확인',
      discovered: '계좌 확인',
      unreturned: '미반환',
      existing: '기존 연동',
      unknown: '미확인',
      keep: '원본 유지',
      required: '파일 필요',
    },
    notes: {
      us: '두 연동을 계좌별로 보완해서 사용합니다. 겹치는 거래는 계좌·기간·거래를 대조한 뒤 합칩니다. 계좌가 조회되거나 거래가 0건으로 응답한 경우에는 실제 거래 범위를 추가로 확인해야 합니다.',
      kr: '시험 조회 결과는 선택한 계좌와 대조 기간에 한정됩니다. 과거 이력·마감 잔액·세금 증빙은 금융사 원본으로 확인합니다. 파일을 읽어 정리하는 경로도 원본 파일 열에 표시합니다.',
    },
    detail: '표 읽는 법',
    boundary: '검토한 기록을 요약한 표입니다. 정기 검증 수집과 시험 대조는 재무 기록에 반영하는 범위와 별도로 표시합니다.',
  },
})
