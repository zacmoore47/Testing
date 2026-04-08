// S&P liquid mega-caps + popular momentum names. Trimmed to 50 to stay within
// Finnhub free tier (60 calls/min). Cached scans return instantly.
const RAW = [
  // Mega caps
  'AAPL','MSFT','GOOGL','AMZN','META','NVDA','TSLA','BRK.B','JPM','V',
  'UNH','XOM','JNJ','WMT','MA','PG','HD','CVX','LLY','AVGO',
  // Popular momentum / retail favorites
  'AMD','NFLX','INTC','CRM','ADBE','ORCL','QCOM','MU','SMCI','ARM',
  'PLTR','COIN','HOOD','SOFI','SNOW','CRWD','PANW','NET','DDOG','SHOP',
  'UBER','ABNB','RIVN','LCID','NIO','GME','AMC','MARA','RIOT','MSTR',
];
export const UNIVERSE: string[] = Array.from(new Set(RAW));
