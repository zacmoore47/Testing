// S&P 500 + NASDAQ 100 deduped real tickers (>300).
// Yahoo Finance accepts these symbols directly.
const RAW = [
  'AAPL','MSFT','GOOGL','GOOG','AMZN','META','NVDA','TSLA','BRK-B','JPM','V','UNH','XOM','JNJ','WMT','MA','PG','HD','CVX','LLY',
  'ABBV','MRK','KO','PEP','AVGO','COST','ORCL','ADBE','MCD','CSCO','CRM','ACN','DHR','VZ','TMO','NFLX','INTC','WFC','DIS','NKE',
  'TXN','ABT','LIN','AMD','PM','BMY','NEE','UPS','RTX','LOW','HON','QCOM','UNP','SBUX','IBM','GS','CAT','DE','MDT','AMGN',
  'BLK','ISRG','INTU','SPGI','PLD','CVS','MS','LMT','ADP','GE','GILD','SYK','BKNG','MDLZ','MMC','TJX','ADI','VRTX','ZTS','REGN',
  'C','AMT','PYPL','PGR','CI','SO','BDX','MU','DUK','CB','AON','NOC','ITW','SLB','CL','MO','EQIX','FCX','APD','HUM',
  'ICE','CME','SHW','PNC','USB','ETN','NSC','EOG','F','GM','EMR','WM','COP','TGT','FDX','MMM','CSX','PSA','KMB',
  'ROST','AEP','MAR','AFL','PSX','GD','BSX','HCA','ADSK','TRV','ALL','SRE','MCK','ORLY','WELL','EXC','D','MPC','ROK','AIG',
  'OXY','COF','ECL','BK','NEM','DOW','KMI','STZ','TFC','HES','AZO','CMG','PAYX','APH','CTAS','MSCI','SPG','EL','KLAC',
  'LRCX','SNPS','CDNS','AMAT','MCHP','FTNT','PANW','CRWD','NET','DDOG','SNOW','SHOP','COIN','UBER','LYFT','ABNB','DASH','RBLX','ROKU',
  'ZM','DOCU','OKTA','TWLO','PLTR','HOOD','SOFI','NIO','LI','XPEV','RIVN','LCID','GME','AMC','MARA',
  'RIOT','HUT','CLSK','MSTR','SMCI','ARM','PATH','IOT','BILL','MDB','TEAM','ZS','U','RNG','ESTC','HUBS','NOW',
  'SAP','BABA','JD','PDD','BIDU','TME',
  'T','BAC','PXD','APA','DVN','HAL','BKR','MRO','FANG','CHK','AR','MTDR','SM','OVV','RRC','CNQ',
  'SU','IMO','EQT','EXPE','TRIP','H','HLT','CCL','RCL','NCLH','AAL','DAL','UAL','LUV','JBLU','ALK',
  'WBA','RAD','CNC','UHS','THC','LH','DGX','IQV','A','WAT','RMD','STE',
  'BAX','EW','ZBH','HOLX','ALGN','DXCM','IDXX','COO','MRNA','BNTX','NVAX','BMRN',
  'ILMN','BIIB','INCY','ALNY','RARE','FOLD','SRPT','ARWR','IONS','PFE','NVO','AZN','GSK',
  'JCI','PH','EMN','LYB','PPG','CE','IFF','VMC','MLM','NUE','STLD','RS','X','CLF','AA',
  'WBD','PARA','SIRI','LBRDK','CHTR','CMCSA','TMUS','EA','TTWO','MTCH','PINS','SNAP','SPOT','LUV',
];
export const UNIVERSE: string[] = Array.from(new Set(RAW));
