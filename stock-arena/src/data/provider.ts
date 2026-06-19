export interface MarketDataProvider {
  quote(ticker: string): Promise<QuoteData | null>;
  profile(ticker: string): Promise<ProfileData | null>;
  ratios(ticker: string): Promise<RatioData | null>;
  financials(ticker: string): Promise<FinancialsData | null>;
  peers(ticker: string): Promise<string[]>;
  earningsCalendar(ticker: string): Promise<EarningsEvent[]>;
  validateTicker(ticker: string): Promise<boolean>;
}

export interface QuoteData {
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  avgVolume: number;
  marketCap: number;
  high52w: number;
  low52w: number;
  open: number;
  previousClose: number;
  dayHigh: number;
  dayLow: number;
}

export interface ProfileData {
  companyName: string;
  sector: string;
  industry: string;
  exchange: string;
  description: string;
  ceo: string;
  employees: number;
  website: string;
  country: string;
}

export interface RatioData {
  peRatio: number | null;
  pbRatio: number | null;
  psRatio: number | null;
  evToEbitda: number | null;
  debtToEquity: number | null;
  currentRatio: number | null;
  roe: number | null;
  roa: number | null;
  grossMargin: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  dividendYield: number | null;
}

export interface FinancialsData {
  revenue: number | null;
  revenueGrowth: number | null;
  netIncome: number | null;
  eps: number | null;
  freeCashFlow: number | null;
  totalDebt: number | null;
  totalCash: number | null;
}

export interface EarningsEvent {
  date: string;
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
}
