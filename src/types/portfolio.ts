export interface PortfolioPositionRow {
  id: string
  import_id: string
  account_number: string
  snapshot_date: string
  symbol: string | null
  name: string
  security_type: string | null
  asset_class: string
  region: string | null
  sector: string | null
  currency: string
  quantity: string | null
  price: string | null
  market_value: string
  weight_pct: string | null
  isin: string | null
  cusip: string | null
  maturity_date: string | null
  coupon: string | null
  accrued_interest: string | null
  fund_family: string | null
  dividend_policy: string | null
}

export interface PortfolioImportRow {
  id: string
  account_number: string
  client_number: string | null
  client_name: string | null
  advisor: string | null
  snapshot_date: string
  base_currency: string
  total_market_value: string
  position_count: number
  file_name: string | null
  warnings: string[]
  imported_by: string
  imported_by_id: string | null
  created_at: string
}

export interface PortfolioAccountInfo {
  accountNumber: string
  clientNumber: string | null
  clientName: string | null
  advisor: string | null
  entity: string | null
}

export interface PortfolioCashProjectionRow {
  id: string
  import_id: string
  account_number: string
  pay_date: string
  security_identifier: string | null
  distribution_type: string | null
  cusip: string | null
  description: string
  quantity: string | null
  coupon_pct: string | null
  estimated_amount: string | null
}

export interface PortfolioCashProjectionsImportRow {
  id: string
  account_number: string
  as_of_date: string
  total_cash_flow: string | null
  file_name: string | null
  imported_by: string
  created_at: string
}
