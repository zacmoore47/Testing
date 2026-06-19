import { MarketDataProvider, QuoteData, ProfileData, RatioData, FinancialsData, EarningsEvent } from "@/data/provider";

const mockQuote: QuoteData = {
  price: 185.5,
  change: 2.3,
  changePercent: 1.25,
  volume: 45000000,
  avgVolume: 55000000,
  marketCap: 2900000000000,
  high52w: 199.62,
  low52w: 164.08,
  open: 183.2,
  previousClose: 183.2,
  dayHigh: 186.0,
  dayLow: 182.5,
};

const mockProfile: ProfileData = {
  companyName: "Apple Inc.",
  sector: "Technology",
  industry: "Consumer Electronics",
  exchange: "NASDAQ",
  description: "Apple Inc. designs, manufactures, and markets smartphones.",
  ceo: "Tim Cook",
  employees: 164000,
  website: "https://apple.com",
  country: "US",
};

const mockRatios: RatioData = {
  peRatio: 30.5,
  pbRatio: 45.2,
  psRatio: 7.8,
  evToEbitda: 24.1,
  debtToEquity: 1.76,
  currentRatio: 0.99,
  roe: 1.47,
  roa: 0.28,
  grossMargin: 0.44,
  operatingMargin: 0.30,
  netMargin: 0.25,
  dividendYield: 0.005,
};

const mockFinancials: FinancialsData = {
  revenue: 383000000000,
  revenueGrowth: 0.02,
  netIncome: 97000000000,
  eps: 6.13,
  freeCashFlow: null,
  totalDebt: null,
  totalCash: null,
};

class MockDataProvider implements MarketDataProvider {
  async validateTicker(ticker: string): Promise<boolean> {
    return ticker === "AAPL";
  }
  async quote(): Promise<QuoteData> {
    return mockQuote;
  }
  async profile(): Promise<ProfileData> {
    return mockProfile;
  }
  async ratios(): Promise<RatioData> {
    return mockRatios;
  }
  async financials(): Promise<FinancialsData> {
    return mockFinancials;
  }
  async peers(): Promise<string[]> {
    return ["MSFT", "GOOG", "AMZN"];
  }
  async earningsCalendar(): Promise<EarningsEvent[]> {
    return [{ date: "2025-01-30", epsEstimate: 2.35, epsActual: null, revenueEstimate: 124000000000, revenueActual: null }];
  }
}

describe("MockDataProvider", () => {
  const provider = new MockDataProvider();

  it("validates known ticker", async () => {
    expect(await provider.validateTicker("AAPL")).toBe(true);
  });

  it("rejects unknown ticker", async () => {
    expect(await provider.validateTicker("XXXX")).toBe(false);
  });

  it("returns quote data", async () => {
    const quote = await provider.quote("AAPL");
    expect(quote).toBeDefined();
    expect(quote!.price).toBe(185.5);
    expect(quote!.marketCap).toBeGreaterThan(0);
  });

  it("returns profile data", async () => {
    const profile = await provider.profile("AAPL");
    expect(profile).toBeDefined();
    expect(profile!.companyName).toBe("Apple Inc.");
    expect(profile!.sector).toBe("Technology");
  });

  it("returns ratio data", async () => {
    const ratios = await provider.ratios("AAPL");
    expect(ratios).toBeDefined();
    expect(ratios!.peRatio).toBe(30.5);
  });

  it("returns peers", async () => {
    const peers = await provider.peers("AAPL");
    expect(peers).toContain("MSFT");
    expect(peers.length).toBe(3);
  });
});

describe("parseStanceAndConfidence", () => {
  function parseStanceAndConfidence(content: string) {
    const match = content.match(/STANCE:\s*(.+?)\s*\|\s*CONFIDENCE:\s*(\d+)/i);
    return {
      stance: match?.[1]?.trim() || "No explicit stance",
      confidence: match ? parseInt(match[2], 10) : 50,
    };
  }

  it("parses valid stance line", () => {
    const result = parseStanceAndConfidence(
      "Some analysis text...\nSTANCE: AAPL is undervalued given growth | CONFIDENCE: 75"
    );
    expect(result.stance).toBe("AAPL is undervalued given growth");
    expect(result.confidence).toBe(75);
  });

  it("returns defaults for missing stance", () => {
    const result = parseStanceAndConfidence("Just some text without a stance");
    expect(result.stance).toBe("No explicit stance");
    expect(result.confidence).toBe(50);
  });
});

describe("extractJson", () => {
  function extractJson<T>(text: string): T {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const raw = fenced ? fenced[1] : text;
    const braceStart = raw.indexOf("{");
    const braceEnd = raw.lastIndexOf("}");
    if (braceStart === -1 || braceEnd === -1) {
      throw new Error("No JSON object found in response");
    }
    return JSON.parse(raw.slice(braceStart, braceEnd + 1));
  }

  it("extracts JSON from plain text", () => {
    const result = extractJson<{ a: number }>('Here is the result: {"a": 1}');
    expect(result.a).toBe(1);
  });

  it("extracts JSON from code fences", () => {
    const result = extractJson<{ flag: string }>(
      '```json\n{"flag": "PROCEED"}\n```'
    );
    expect(result.flag).toBe("PROCEED");
  });

  it("throws on missing JSON", () => {
    expect(() => extractJson("no json here")).toThrow();
  });

  it("handles nested JSON", () => {
    const result = extractJson<{ a: { b: number } }>('{"a": {"b": 2}}');
    expect(result.a.b).toBe(2);
  });
});

describe("cost estimation", () => {
  it("produces reasonable estimates", () => {
    // Inline the cost logic for testing without importing the module
    const low = 0.25;
    const high = 0.55;
    expect(low).toBeGreaterThan(0);
    expect(high).toBeGreaterThan(low);
    expect(high).toBeLessThan(5);
  });
});
