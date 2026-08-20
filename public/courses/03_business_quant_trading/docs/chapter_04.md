# 第4章：金融数据获取与处理

## 学习目标

完成本章学习后，你将能够：

1. 区分金融数据的主要类型，了解各类数据的用途
2. 使用AKShare、yfinance等免费工具获取A股和国际市场数据
3. 掌握数据清洗的核心技能：处理缺失值、异常值和复权问题
4. 理解时间序列数据的特殊处理方式
5. 将清洗后的数据存储为CSV或SQLite格式，建立本地数据库

---

## 4.1 金融数据的种类

### 数据是量化的血液

量化交易的质量，很大程度上取决于数据的质量。垃圾数据进，垃圾结果出（Garbage In, Garbage Out）。在开始任何策略研究之前，必须先搞清楚数据从哪里来、质量如何、有哪些坑。

### 行情数据（最常用）

行情数据是量化最基础的数据，记录了金融资产的价格和交易信息。

**日线数据（OHLCV）**：
- Open（开盘价）：当天第一笔成交价
- High（最高价）：当天最高成交价
- Low（最低价）：当天最低成交价
- Close（收盘价）：当天最后一笔成交价
- Volume（成交量）：当天总成交股数

**分钟线数据**：以分钟为单位的OHLCV数据，适合日内策略。

**Tick数据**：每一笔成交的详细记录，数据量极大，适合高频策略。

对于初学者，从日线数据开始是最合适的选择。

### 基本面数据

基本面数据反映公司的经营状况，是价值投资和基本面量化的基础：

- **财务报表**：营收、净利润、资产负债表等（季度/年度更新）
- **估值指标**：市盈率（PE）、市净率（PB）、市销率（PS）
- **分红数据**：历史分红记录
- **股本数据**：总股本、流通股本、大股东持股比例

### 另类数据

另类数据是近年来量化领域的热门方向，包括：

- **新闻情绪数据**：对财经新闻进行情感分析，判断市场情绪
- **社交媒体数据**：微博、雪球等平台的讨论热度
- **卫星图像数据**：通过卫星图像分析停车场车辆数量来预测零售商销售额
- **信用卡消费数据**：反映消费趋势

另类数据通常价格昂贵，个人量化者很少使用。本课程主要关注行情数据和基本面数据。

---

## 4.2 免费数据源：AKShare、Tushare、yfinance、BaoStock

### AKShare（推荐首选）

AKShare是一个开源的Python金融数据接口库，完全免费，无需注册，数据覆盖A股、港股、美股、期货、加密货币等。

```python
import akshare as ak

# 获取A股日线数据
df = ak.stock_zh_a_hist(
    symbol="000001",      # 股票代码（平安银行）
    period="daily",       # 日线
    start_date="20200101",
    end_date="20231231",
    adjust="qfq"          # 前复权（重要！）
)
print(df.head())

# 获取所有A股股票列表
stock_list = ak.stock_zh_a_spot_em()
print(f"A股共有 {len(stock_list)} 只股票")

# 获取上证指数数据
index_df = ak.stock_zh_index_daily(symbol="sh000001")
print(index_df.tail())

# 获取期货数据（螺纹钢主力合约）
futures_df = ak.futures_zh_daily_sina(symbol="RB0")
print(futures_df.head())
```

**AKShare的优点**：
- 完全免费，无需注册
- 数据覆盖面广
- 更新频率高
- 社区活跃，文档完善

**AKShare的缺点**：
- 数据质量参差不齐，需要自行清洗
- 部分接口不稳定，可能随时失效
- 历史数据深度有限（部分数据只有近几年）

### Tushare Pro

Tushare Pro是国内最知名的金融数据平台之一，数据质量较高，但需要注册并积累积分才能使用高级接口。

```python
import tushare as ts

# 需要先在tushare.pro注册并获取token
ts.set_token('你的token')
pro = ts.pro_api()

# 获取日线数据
df = pro.daily(
    ts_code='000001.SZ',  # 股票代码格式：代码.交易所
    start_date='20200101',
    end_date='20231231'
)
print(df.head())

# 获取财务数据
income = pro.income(ts_code='000001.SZ', period='20231231')
print(income.head())
```

**Tushare的特点**：
- 数据质量较高，有专业团队维护
- 基础数据免费，高级数据需要积分
- 积分获取方式：注册、分享、付费

### yfinance（国际市场）

yfinance是获取美股、港股、ETF等国际市场数据的最简单工具：

```python
import yfinance as yf

# 获取苹果公司股票数据
aapl = yf.download('AAPL', start='2020-01-01', end='2023-12-31')
print(aapl.head())

# 获取多只股票
tickers = yf.download(['AAPL', 'GOOGL', 'MSFT'], start='2023-01-01')
print(tickers['Close'].head())

# 获取股票基本信息
ticker = yf.Ticker('AAPL')
print(ticker.info['marketCap'])  # 市值
print(ticker.dividends)          # 分红历史
```

### BaoStock

BaoStock专注于A股数据，数据质量较好，完全免费：

```python
import baostock as bs
import pandas as pd

# 登录
lg = bs.login()

# 获取日线数据
rs = bs.query_history_k_data_plus(
    "sh.600000",  # 浦发银行
    "date,open,high,low,close,volume,amount,adjustflag",
    start_date='2020-01-01',
    end_date='2023-12-31',
    frequency="d",
    adjustflag="3"  # 后复权
)

data_list = []
while (rs.error_code == '0') & rs.next():
    data_list.append(rs.get_row_data())

df = pd.DataFrame(data_list, columns=rs.fields)
bs.logout()
print(df.head())
```

### 数据源选择建议

| 场景 | 推荐数据源 |
|------|-----------|
| A股日线，快速上手 | AKShare |
| A股，需要高质量数据 | Tushare Pro |
| 美股/港股/ETF | yfinance |
| A股，需要分钟线 | BaoStock |
| 加密货币 | CCXT（第6章介绍）|

---

## 4.3 数据清洗：缺失值、异常值、复权处理

### 为什么需要数据清洗？

真实的金融数据远没有教科书上那么干净。常见的问题包括：
- 停牌日期的数据缺失
- 价格异常（如数据录入错误导致的极端值）
- 股票分红、拆股导致的价格跳变
- 不同数据源的数据格式不一致

### 处理缺失值

```python
import pandas as pd
import numpy as np

# 检查缺失值
print("各列缺失值数量：")
print(df.isnull().sum())

# 方法1：删除含缺失值的行（适合缺失比例很小的情况）
df_clean = df.dropna()

# 方法2：前向填充（用前一天的数据填充，适合停牌数据）
df_ffill = df.fillna(method='ffill')

# 方法3：线性插值（适合少量缺失的连续数据）
df_interp = df.interpolate(method='linear')

# 实际建议：先检查缺失值的分布，再决定处理方式
missing_ratio = df.isnull().sum() / len(df)
print("\n缺失值比例：")
print(missing_ratio[missing_ratio > 0])
```

### 处理异常值

```python
def detect_outliers(series, threshold=3):
    """
    使用3倍标准差法检测异常值
    返回异常值的索引
    """
    mean = series.mean()
    std = series.std()
    z_scores = abs((series - mean) / std)
    return series[z_scores > threshold]

# 检测收盘价中的异常值
outliers = detect_outliers(df['close'])
print(f"发现 {len(outliers)} 个异常值：")
print(outliers)

# 对于金融数据，通常用前后日价格的涨跌幅来检测异常
df['daily_return'] = df['close'].pct_change()

# 找出单日涨跌幅超过20%的数据（可能是数据错误）
suspicious = df[abs(df['daily_return']) > 0.20]
print(f"\n可疑数据（单日涨跌幅>20%）：")
print(suspicious[['close', 'daily_return']])
```

### 复权处理（非常重要！）

这是A股数据处理中最容易被忽视的问题。

**什么是复权？**

假设某股票价格是10元，公司宣布"10送10"（每10股送10股），股价会从10元变成5元。如果不做复权处理，你的价格序列会出现一个从10元到5元的"跳水"，但实际上持有者的财富并没有减少。

复权就是调整历史价格，消除这种因分红、送股、配股导致的价格跳变，让价格序列真实反映投资收益。

**前复权 vs 后复权**：
- **前复权**：以当前价格为基准，向前调整历史价格。优点是当前价格不变，缺点是历史价格会随时间变化
- **后复权**：以最早的价格为基准，向后调整。优点是历史价格固定，缺点是当前价格可能与实际价格差异很大

**建议**：策略研究时用前复权数据，计算实际收益时要注意复权因子。

```python
# AKShare获取前复权数据
df_qfq = ak.stock_zh_a_hist(
    symbol="000001",
    period="daily",
    start_date="20200101",
    end_date="20231231",
    adjust="qfq"   # qfq=前复权, hfq=后复权, 不填=不复权
)

# 对比复权前后的价格差异
df_raw = ak.stock_zh_a_hist(symbol="000001", period="daily",
                             start_date="20200101", end_date="20231231",
                             adjust="")  # 不复权

print("不复权价格（前5行）：")
print(df_raw[['日期', '收盘']].head())
print("\n前复权价格（前5行）：")
print(df_qfq[['日期', '收盘']].head())
```

---

## 4.4 时间序列数据的特殊处理

### 时间序列的特殊性

金融数据是典型的时间序列数据，有几个特殊之处：

1. **顺序很重要**：不能随机打乱数据，否则会引入未来信息
2. **有交易日历**：A股只有交易日才有数据，节假日没有数据
3. **时区问题**：跨市场数据需要统一时区

### 常用时间序列操作

```python
import pandas as pd

# 确保索引是DatetimeIndex
df.index = pd.to_datetime(df.index)

# 按时间范围筛选
df_2023 = df['2023']                          # 2023年全年
df_q1 = df['2023-01':'2023-03']               # 2023年第一季度
df_recent = df.last('30D')                    # 最近30天

# 重采样：日线转周线
df_weekly = df['close'].resample('W').agg({
    'open': 'first',    # 周开盘价 = 周一开盘价
    'high': 'max',      # 周最高价
    'low': 'min',       # 周最低价
    'close': 'last',    # 周收盘价 = 周五收盘价
    'volume': 'sum'     # 周成交量 = 各日成交量之和
})

# 日线转月线
df_monthly = df.resample('ME').agg({
    'open': 'first',
    'high': 'max',
    'low': 'min',
    'close': 'last',
    'volume': 'sum'
})

# 计算滚动统计量
df['rolling_mean_20'] = df['close'].rolling(20).mean()
df['rolling_std_20']  = df['close'].rolling(20).std()
df['rolling_max_20']  = df['close'].rolling(20).max()

# 计算扩展统计量（从第一天到当天的统计）
df['cumulative_max'] = df['close'].expanding().max()
df['drawdown'] = df['close'] / df['cumulative_max'] - 1  # 回撤
```

### 处理交易日历

```python
# 生成A股交易日历（使用akshare）
import akshare as ak

# 获取A股交易日历
trade_cal = ak.tool_trade_date_hist_sina()
trade_dates = pd.to_datetime(trade_cal['trade_date'])

# 检查某天是否是交易日
def is_trade_day(date):
    return pd.Timestamp(date) in trade_dates.values

print(is_trade_day('2024-01-01'))  # False（元旦）
print(is_trade_day('2024-01-02'))  # True（交易日）
```

---

## 4.5 用AI辅助数据清洗：让AI写数据处理脚本

### AI在数据清洗中的价值

数据清洗是量化工作中最耗时、最枯燥的部分。AI可以帮你快速生成数据处理脚本，大大提高效率。

**示例提示词——数据质量检查**：

```
我有一个A股股票数据的DataFrame，包含以下列：
date（日期）, open, high, low, close, volume

请帮我写一个数据质量检查函数，检查以下问题：
1. 是否有缺失值
2. 是否有负数价格
3. 是否有high < low的异常情况
4. 是否有close > high 或 close < low的异常
5. 是否有成交量为0但价格变动的情况
6. 是否有单日涨跌幅超过11%的数据（A股涨跌停限制）

函数应该返回一个报告，列出所有发现的问题和对应的日期。
```

**示例提示词——批量数据处理**：

```
我需要下载A股所有股票的近5年日线数据，并保存到本地。
请帮我写一个Python脚本，要求：
1. 使用AKShare获取数据
2. 处理网络错误（加入重试机制）
3. 跳过已经下载过的股票（断点续传）
4. 显示下载进度
5. 将数据保存为CSV格式，每只股票一个文件
6. 记录下载失败的股票列表

注意：要加入适当的延时，避免请求过于频繁被封IP。
```

---

## 4.6 数据存储：CSV、SQLite本地存储方案

### CSV存储（简单场景）

CSV是最简单的数据存储格式，适合单只股票或少量数据：

```python
import pandas as pd
import os

def save_stock_data(df, stock_code, data_dir='./data'):
    """保存股票数据到CSV文件"""
    os.makedirs(data_dir, exist_ok=True)
    filepath = os.path.join(data_dir, f'{stock_code}.csv')
    df.to_csv(filepath, encoding='utf-8-sig')  # utf-8-sig支持中文
    print(f"数据已保存到：{filepath}")

def load_stock_data(stock_code, data_dir='./data'):
    """从CSV文件加载股票数据"""
    filepath = os.path.join(data_dir, f'{stock_code}.csv')
    if not os.path.exists(filepath):
        print(f"文件不存在：{filepath}")
        return None
    df = pd.read_csv(filepath, index_col='date', parse_dates=True)
    return df

# 使用示例
save_stock_data(df, '000001')
df_loaded = load_stock_data('000001')
```

### SQLite存储（多股票场景）

当需要存储大量股票数据时，SQLite数据库比CSV更高效：

```python
import sqlite3
import pandas as pd

class StockDatabase:
    """简单的股票数据库管理类"""
    
    def __init__(self, db_path='stock_data.db'):
        self.db_path = db_path
        self._init_db()
    
    def _init_db(self):
        """初始化数据库，创建表结构"""
        conn = sqlite3.connect(self.db_path)
        conn.execute('''
            CREATE TABLE IF NOT EXISTS daily_prices (
                stock_code TEXT,
                date TEXT,
                open REAL,
                high REAL,
                low REAL,
                close REAL,
                volume INTEGER,
                PRIMARY KEY (stock_code, date)
            )
        ''')
        conn.commit()
        conn.close()
    
    def save(self, df, stock_code):
        """保存股票数据"""
        df_save = df.copy()
        df_save['stock_code'] = stock_code
        df_save['date'] = df_save.index.astype(str)
        
        conn = sqlite3.connect(self.db_path)
        df_save.to_sql('daily_prices', conn, if_exists='append',
                       index=False, method='ignore')
        conn.close()
        print(f"{stock_code} 数据已保存，共 {len(df)} 条记录")
    
    def load(self, stock_code, start_date=None, end_date=None):
        """加载股票数据"""
        query = f"SELECT * FROM daily_prices WHERE stock_code = '{stock_code}'"
        if start_date:
            query += f" AND date >= '{start_date}'"
        if end_date:
            query += f" AND date <= '{end_date}'"
        query += " ORDER BY date"
        
        conn = sqlite3.connect(self.db_path)
        df = pd.read_sql(query, conn, index_col='date', parse_dates=['date'])
        conn.close()
        return df.drop('stock_code', axis=1)

# 使用示例
db = StockDatabase('./quant_data.db')
db.save(df, '000001')
df_loaded = db.load('000001', start_date='2023-01-01')
print(df_loaded.head())
```

---

## 实战练习：抓取A股近5年日线数据并完成清洗

### 练习目标

建立一个包含多只A股股票近5年日线数据的本地数据库，并完成完整的数据清洗流程。

### 完整代码

```python
import akshare as ak
import pandas as pd
import sqlite3
import time
import os
from datetime import datetime, timedelta

def fetch_and_clean_stock(stock_code, start_date, end_date):
    """
    获取并清洗单只股票数据
    返回清洗后的DataFrame，如果失败返回None
    """
    try:
        # 获取前复权日线数据
        df = ak.stock_zh_a_hist(
            symbol=stock_code,
            period="daily",
            start_date=start_date.replace('-', ''),
            end_date=end_date.replace('-', ''),
            adjust="qfq"
        )
        
        if df is None or len(df) == 0:
            return None
        
        # 重命名列
        df = df.rename(columns={
            '日期': 'date', '开盘': 'open', '收盘': 'close',
            '最高': 'high', '最低': 'low', '成交量': 'volume',
            '成交额': 'amount', '涨跌幅': 'pct_change'
        })
        
        # 保留需要的列
        cols = ['date', 'open', 'high', 'low', 'close', 'volume']
        df = df[[c for c in cols if c in df.columns]]
        
        # 设置日期索引
        df['date'] = pd.to_datetime(df['date'])
        df.set_index('date', inplace=True)
        df.sort_index(inplace=True)
        
        # 数据清洗
        # 1. 删除缺失值
        df.dropna(inplace=True)
        
        # 2. 删除价格为0或负数的行
        df = df[(df['close'] > 0) & (df['open'] > 0)]
        
        # 3. 删除high < low的异常行
        df = df[df['high'] >= df['low']]
        
        # 4. 删除close超出high/low范围的行
        df = df[(df['close'] <= df['high']) & (df['close'] >= df['low'])]
        
        return df
        
    except Exception as e:
        print(f"  获取 {stock_code} 失败：{e}")
        return None


def build_stock_database(stock_codes, start_date, end_date, db_path='stock.db'):
    """
    批量下载股票数据并存入SQLite数据库
    """
    conn = sqlite3.connect(db_path)
    conn.execute('''
        CREATE TABLE IF NOT EXISTS daily_prices (
            stock_code TEXT, date TEXT, open REAL, high REAL,
            low REAL, close REAL, volume INTEGER,
            PRIMARY KEY (stock_code, date)
        )
    ''')
    conn.commit()
    
    success_count = 0
    fail_list = []
    
    for i, code in enumerate(stock_codes):
        print(f"[{i+1}/{len(stock_codes)}] 正在下载 {code}...")
        
        df = fetch_and_clean_stock(code, start_date, end_date)
        
        if df is not None and len(df) > 0:
            df_save = df.copy()
            df_save['stock_code'] = code
            df_save['date'] = df_save.index.astype(str)
            df_save.to_sql('daily_prices', conn, if_exists='append',
                          index=False, method='ignore')
            success_count += 1
            print(f"  成功：{len(df)} 条记录")
        else:
            fail_list.append(code)
            print(f"  失败")
        
        # 避免请求过于频繁
        time.sleep(0.5)
    
    conn.close()
    
    print(f"\n下载完成！成功：{success_count}，失败：{len(fail_list)}")
    if fail_list:
        print(f"失败列表：{fail_list}")
    
    return fail_list


# 主程序
if __name__ == "__main__":
    # 选取沪深300成分股中的10只作为示例
    sample_stocks = [
        '000001', '000002', '000858', '000333', '000651',
        '600036', '600519', '601318', '601166', '600276'
    ]
    
    end_date = datetime.now().strftime('%Y-%m-%d')
    start_date = (datetime.now() - timedelta(days=365*5)).strftime('%Y-%m-%d')
    
    print(f"数据范围：{start_date} 至 {end_date}")
    print(f"股票数量：{len(sample_stocks)}")
    print("-" * 50)
    
    fail_list = build_stock_database(
        sample_stocks, start_date, end_date, 'quant_data.db'
    )
    
    # 验证数据
    conn = sqlite3.connect('quant_data.db')
    result = pd.read_sql(
        "SELECT stock_code, COUNT(*) as days, MIN(date) as start, MAX(date) as end "
        "FROM daily_prices GROUP BY stock_code",
        conn
    )
    conn.close()
    
    print("\n数据库统计：")
    print(result.to_string(index=False))
```

### 用AI辅助优化

运行上面的代码后，向AI提问：

```
我已经建立了一个A股股票数据库，现在想添加以下功能：
1. 增量更新：只下载最新的数据，不重复下载已有数据
2. 数据验证：检查每只股票的数据是否有异常的价格跳变
3. 生成数据质量报告：统计每只股票的数据完整性

请帮我在现有代码基础上添加这些功能。
```

---

## 常见问题 Q&A

**Q1：为什么量化里经常说“数据比模型更重要”？**

A：因为错误数据会把后面所有环节都污染掉。你可以用很简单的策略跑出可信结果，但如果价格、复权、交易日历、缺失值处理出了问题，再高级的模型也只是把错误放大。

**Q2：缺失值是不是统一前向填充就行？**

A：不行。前向填充适合部分停牌或低频更新场景，但不适合所有字段。成交量、财务指标、公告类数据的缺失含义可能完全不同，处理方式也应该分开。

**Q3：免费数据源够不够做入门研究？**

A：够做入门和很多中低频研究，但你要接受它们在稳定性、字段完整性、历史修正和速率限制上的不足。课程阶段先学会识别这些边界，比一开始追求昂贵数据更重要。

---

## 本章小结

本章我们建立了量化数据处理的完整能力：

- **数据类型**：行情数据是量化基础，基本面数据用于价值策略，另类数据是高阶方向
- **数据获取**：AKShare是国内免费数据的首选，yfinance适合国际市场，Tushare Pro数据质量更高
- **数据清洗**：缺失值、异常值、复权处理是三大核心问题，复权处理尤其重要，不处理会导致策略信号失真
- **时间序列处理**：重采样、滚动统计、交易日历是量化时间序列处理的三大核心技能
- **数据存储**：少量数据用CSV，多股票数据用SQLite，建立本地数据库是量化研究的基础设施

---

## 课后思考题

1. 为什么在量化策略研究中必须使用复权数据？如果不使用复权数据，会对策略的哪些指标产生影响？请举一个具体例子说明。

2. 在数据清洗时，对于缺失值，你会选择删除还是填充？在什么情况下应该删除，在什么情况下应该填充？填充时应该用什么方法？

3. 假设你要研究一个基于日线数据的量化策略，你需要哪些数据？请列出完整的数据需求清单，并说明每种数据从哪里获取、如何清洗。
