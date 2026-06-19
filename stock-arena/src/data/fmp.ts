import {
  MarketDataProvider,
  QuoteData,
  ProfileData,
  RatioData,
  FinancialsData,
  EarningsEvent,
} from "./provider";

const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export class FMPProvider implements MarketDataProvider {
  private baseUrl = "https://financialmodelingprep.com/api/v3";

  constructor(private apiKey: string) {}

  private async fetch<T>(path: string): Promise<T | null> {
    const url = `${this.baseUrl}${path}${path.includes("?") ? "&" : "?"}apikey=${this.apiKey}`;
    const cached = cache.get(url);
    if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data as T;

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) return null;
      const data = await res.json();
      cache.set(url, { data, ts: Date.now() });
      return data as T;
    } catch {
      return null;
    }
  }

  async validateTicker(ticker: string): Promise<boolean> {
    const data = await this.fetch<Array<{ symbol: string }>>(
      `/search?query=${encodeURIComponent(ticker)}&limit=5`
    );
    if (!data || !Array.isArray(data)) return false;
    return data.some(
      (item) => item.symbol.toUpperCase() === ticker.toUpperCase()
    );
  }

  async quote(ticker: string): Promise<QuoteData | null> {
    const data = await this.fetch<Array<Record<string, number | string>>>(
      `/quote/${encodeURIComponent(ticker)}`
    );
    if (!data || !data[0]) return null;
    const q = data[0];
    return {
      price: Number(q.price) || 0,
      change: Number(q.change) || 0,
      changePercent: Number(q.changesPercentage) || 0,
      volume: Number(q.volume) || 0,
      avgVolume: Number(q.avgVolume) || 0,
      marketCap: Number(q.marketCap) || 0,
      high52w: Number(q.yearHigh) || 0,
      low52w: Number(q.yearLow) || 0,
      open: Number(q.open) || 0,
      previousClose: Number(q.previousClose) || 0,
      dayHigh: Number(q.dayHigh) || 0,
      dayLow: Number(q.dayLow) || 0,
    };
  }

  async profile(ticker: string): Promise<ProfileData | null> {
    const data = await this.fetch<Array<Record<string, string | number>>>(
      `/profile/${encodeURIComponent(ticker)}`
    );
    if (!data || !data[0]) return null;
    const p = data[0];
    return {
      companyName: String(p.companyName || ""),
      sector: String(p.sector || ""),
      industry: String(p.industry || ""),
      exchange: String(p.exchangeShortName || ""),
      description: String(p.description || ""),
      ceo: String(p.ceo || ""),
      employees: Number(p.fullTimeEmployees) || 0,
      website: String(p.website || ""),
      country: String(p.country || ""),
    };
  }

  async ratios(ticker: string): Promise<RatioData | null> {
    const data = await this.fetch<Array<Record<string, number | null>>>(
      `/ratios-ttm/${encodeURIComponent(ticker)}`
    );
    if (!data || !data[0]) return null;
    const r = data[0];
    return {
      peRatio: r.peRatioTTM ?? null,
      pbRatio: r.priceToBookRatioTTM ?? null,
      psRatio: r.priceToSalesRatioTTM ?? null,
      evToEbitda: r.enterpriseValueOverEBITDATTM ?? null,
      debtToEquity: r.debtEquityRatioTTM ?? null,
      currentRatio: r.currentRatioTTM ?? null,
      roe: r.returnOnEquityTTM ?? null,
      roa: r.returnOnAssetsTTM ?? null,
      grossMargin: r.grossProfitMarginTTM ?? null,
      operatingMargin: r.operatingProfitMarginTTM ?? null,
      netMargin: r.netProfitMarginTTM ?? null,
      dividendYield: r.dividendYielTTM ?? null,
    };
  }

  async financials(ticker: string): Promise<FinancialsData | null> {
    const data = await this.fetch<Array<Record<string, number | null>>>(
      `/income-statement/${encodeURIComponent(ticker)}?period=annual&limit=2`
    );
    if (!data || !data[0]) return null;
    const current = data[0];
    const prev = data[1];
    const revenue = Number(current.revenue) || null;
    const prevRevenue = prev ? Number(prev.revenue) || null : null;
    const revenueGrowth =
      revenue && prevRevenue ? (revenue - prevRevenue) / prevRevenue : null;

    return {
      revenue,
      revenueGrowth,
      netIncome: Number(current.netIncome) || null,
      eps: Number(current.eps) || null,
      freeCashFlow: null,
      totalDebt: null,
      totalCash: null,
    };
  }

  async peers(ticker: string): Promise<string[]> {
    const data = await this.fetch<string[]>(
      `/stock_peers?symbol=${encodeURIComponent(ticker)}`
    );
    if (!data) return [];
    if (Array.isArray(data) && typeof data[0] === "object") {
      const obj = data[0] as Record<string, unknown>;
      return (obj.peersList as string[]) || [];
    }
    return Array.isArray(data) ? data : [];
  }

  async earningsCalendar(ticker: string): Promise<EarningsEvent[]> {
    const data = await this.fetch<Array<Record<string, number | string | null>>>(
      `/earning_calendar?symbol=${encodeURIComponent(ticker)}`
    );
    if (!data || !Array.isArray(data)) return [];
    return data.slice(0, 4).map((e) => ({
      date: String(e.date || ""),
      epsEstimate: e.epsEstimated != null ? Number(e.epsEstimated) : null,
      epsActual: e.eps != null ? Number(e.eps) : null,
      revenueEstimate:
        e.revenueEstimated != null ? Number(e.revenueEstimated) : null,
      revenueActual: e.revenue != null ? Number(e.revenue) : null,
    }));
  }
}
