import { navSections } from '@/lib/nav'
import { defineCopy } from '@/lib/ui-copy/define'

export const sidebar = defineCopy({
  en: {
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
    navLabel: 'Main navigation',
    tagline: 'Assets, cash flow and taxes',
    readOnly: 'Local financial records',
    source: 'Generated from local sources',
    language: 'Language',
    currency: 'Currency',
    currencies: { KRW: 'KRW', USD: 'USD' },
    assets: 'Assets',
    assetViews: { stocks: 'Stocks', all: 'All assets' },
    // Supplementary data (deposits, pensions, gold) is gated per item: Total
    // Assets and Pension hide when the database holds none, and their section
    // keeps its other items.
    sections: navSections([
      {
        label: 'Overview',
        items: [
          { href: '/', label: 'Financial Overview' },
          { href: '/daily-briefing', label: "Today's Briefing" },
        ],
      },
      {
        label: 'Assets & Cash Flow',
        items: [
          { href: '/holdings', label: 'Holdings' },
          { href: '/net-worth', label: 'Total Assets', supplementary: true },
          { href: '/pension', label: 'Pension', supplementary: true },
          { href: '/income', label: 'Income' },
          { href: '/cash-inflow', label: 'Cash Inflow' },
          {
            group: 'Detailed Records',
            collapsible: true,
            items: [
              { href: '/transactions', label: 'Transactions' },
              { href: '/fx', label: 'FX Exchange & Gain' },
              { href: '/crypto-premium', label: 'Korea Premium' },
            ],
          },
        ],
      },
      {
        label: 'Taxes',
        items: [
          { href: '/taxes', label: 'Tax Overview' },
          { href: '/taxes/history', label: 'Tax History' },
          { href: '/tax-planning', label: 'Tax Planning' },
          { href: '/lots', label: 'Tax Lots' },
          { href: '/realized', label: 'Realized Lots' },
        ],
      },
      {
        label: 'Review & Data',
        items: [
          { href: '/review', label: 'Portfolio Review' },
          { href: '/rebalance', label: 'Rebalancing' },
          { href: '/data-ops', label: 'Action Center' },
          { href: '/reconciliation', label: 'Reconciliation' },
          { href: '/accounts', label: 'Accounts & Coverage' },
          { href: '/health', label: 'System Health' },
          { href: '/data-map', label: 'Source & Retention' },
        ],
      },
      {
        label: 'Settings',
        items: [
          { href: '/tax-settings', label: 'Tax Settings' },
          { href: '/rebalance/settings', label: 'Rebalancing Settings' },
        ],
      },
    ]),
  },
  ko: {
    openMenu: '메뉴 열기',
    closeMenu: '메뉴 닫기',
    navLabel: '주요 메뉴',
    tagline: '자산 모니터링',
    readOnly: '로컬 재무 기록',
    source: '로컬 원본에서 생성됨',
    language: '언어',
    currency: '화폐',
    currencies: { KRW: '원화', USD: '달러' },
    assets: '자산',
    assetViews: { stocks: '주식', all: '전체 자산' },
    sections: navSections([
      {
        label: '개요',
        items: [
          { href: '/', label: '재무 개요' },
          { href: '/daily-briefing', label: '오늘의 브리핑' },
        ],
      },
      {
        label: '자산 · 현금 흐름',
        items: [
          { href: '/holdings', label: '보유종목' },
          { href: '/net-worth', label: '총자산', supplementary: true },
          { href: '/pension', label: '연금', supplementary: true },
          { href: '/income', label: '수익 내역' },
          { href: '/cash-inflow', label: '현금 유입' },
          {
            group: '상세 기록',
            collapsible: true,
            items: [
              { href: '/transactions', label: '거래 내역' },
              { href: '/fx', label: '환전 · 환차익' },
              { href: '/crypto-premium', label: '코리아 프리미엄' },
            ],
          },
        ],
      },
      {
        label: '세금',
        items: [
          { href: '/taxes', label: '세금 개요' },
          { href: '/taxes/history', label: '세금 이력' },
          { href: '/tax-planning', label: '세금 계획' },
          { href: '/lots', label: '세금 단위' },
          { href: '/realized', label: '실현 손익 내역' },
        ],
      },
      {
        label: '검토 · 데이터',
        items: [
          { href: '/review', label: '포트폴리오 검토' },
          { href: '/rebalance', label: '리밸런싱' },
          { href: '/data-ops', label: '조치 센터' },
          { href: '/reconciliation', label: '정합성 확인' },
          { href: '/accounts', label: '계좌 · 데이터 범위' },
          { href: '/health', label: '시스템 상태' },
          { href: '/data-map', label: '원본 · 보존' },
        ],
      },
      {
        label: '설정',
        items: [
          { href: '/tax-settings', label: '세금 설정' },
          { href: '/rebalance/settings', label: '리밸런싱 설정' },
        ],
      },
    ]),
  },
})
