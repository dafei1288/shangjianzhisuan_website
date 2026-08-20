# 第6章：量化工具全景——平台、框架与生态

## 学习目标

完成本章学习后，你将能够：

1. 了解量化工具的完整生态，知道每类工具解决什么问题
2. 比较国内主流量化平台（聚宽、掘金、米筐）的特点，选择适合自己的平台
3. 了解国际主流回测框架（Backtrader、VectorBT）的适用场景
4. 知道加密货币量化的专用工具链
5. 根据自己的需求，用AI辅助选择合适的工具栈

---

## 6.1 量化工具的分类

量化交易涉及多个环节，每个环节都有专门的工具。理解工具的分类，有助于你在需要时快速找到合适的工具。

### 工具生态全景图

```
量化工具生态
├── 数据工具
│   ├── 免费：AKShare、yfinance、BaoStock
│   ├── 付费：Tushare Pro、Wind、Bloomberg
│   └── 加密货币：CCXT、Binance API
│
├── 研究环境
│   ├── Jupyter Notebook（交互式研究）
│   ├── VS Code（代码开发）
│   └── 云端平台（聚宽、掘金的在线IDE）
│
├── 回测框架
│   ├── 事件驱动：Backtrader、Zipline
│   ├── 向量化：VectorBT、Pandas回测
│   └── 云端：QuantConnect、聚宽
│
├── 实盘交易
│   ├── A股：掘金量化、QMT、迅投
│   ├── 期货：CTP接口、vnpy
│   └── 加密货币：CCXT、Freqtrade
│
└── 可视化与监控
    ├── Plotly（交互式图表）
    ├── Streamlit（快速搭建Web界面）
    └── Grafana（监控仪表盘）
```

### 两种回测框架的本质区别

量化工具中最重要的是回测框架，它分为两种根本不同的设计思路：

**事件驱动框架**（如Backtrader）：
- 模拟真实交易过程，逐根K线处理
- 可以精确模拟订单、滑点、手续费
- 代码结构接近实盘，便于迁移
- 速度较慢，但逻辑更严谨

**向量化框架**（如VectorBT）：
- 用矩阵运算一次性处理所有数据
- 速度极快，适合参数优化
- 代码更简洁，但难以模拟复杂的订单逻辑
- 适合策略研究阶段

---

## 6.2 国内量化平台

### 聚宽JoinQuant

聚宽是国内最受个人量化爱好者欢迎的平台之一，提供完整的量化研究环境。

**核心特点**：
- 提供高质量的A股历史数据（日线、分钟线、财务数据）
- 内置Jupyter Notebook研究环境，无需本地配置
- 支持策略回测和模拟交易
- 有活跃的社区和丰富的策略示例
- 免费版有一定的数据和计算限制

**适合人群**：A股量化初学者，想快速上手而不想折腾环境配置的人。

**聚宽策略示例**：

```python
# 聚宽平台上的双均线策略示例
# 注意：这段代码只能在聚宽平台上运行

def initialize(context):
    """策略初始化，只运行一次"""
    # 设置基准（沪深300）
    set_benchmark('000300.XSHG')
    # 设置滑点
    set_slippage(FixedSlippage(0.02))
    # 设置手续费（万分之三）
    set_commission(PerTrade(buy_cost=0.0003, sell_cost=0.0013, min_cost=5))
    
    # 策略参数
    context.stock = '000001.XSHE'  # 平安银行
    context.short_window = 5       # 短期均线
    context.long_window = 20       # 长期均线

def handle_data(context, data):
    """每个交易日运行一次"""
    stock = context.stock
    
    # 获取历史收盘价
    prices = history(context.long_window + 1, '1d', 'close', stock)
    
    # 计算均线
    ma_short = prices[-context.short_window:].mean()
    ma_long  = prices[-context.long_window:].mean()
    
    # 获取当前持仓
    current_position = context.portfolio.positions.get(stock)
    
    # 交易逻辑
    if ma_short > ma_long and current_position is None:
        # 金叉且未持仓：买入
        order_value(stock, context.portfolio.cash * 0.95)
        log.info(f"金叉买入：MA{context.short_window}={ma_short:.2f}, "
                 f"MA{context.long_window}={ma_long:.2f}")
    
    elif ma_short < ma_long and current_position is not None:
        # 死叉且持仓：卖出
        order_target(stock, 0)
        log.info(f"死叉卖出：MA{context.short_window}={ma_short:.2f}, "
                 f"MA{context.long_window}={ma_long:.2f}")
```

### 掘金量化

掘金量化的特点是支持实盘交易，可以直接对接券商账户，是从研究到实盘的完整解决方案。

**核心特点**：
- 支持A股、期货、港股的实盘交易
- 提供Python和C++ API
- 数据质量高，支持Tick级别数据
- 有完整的风控系统

**适合人群**：有一定基础，想要进行实盘交易的量化交易者。

### 米筐RiceQuant

米筐是另一个知名的国内量化平台，以数据质量和回测准确性著称。

**核心特点**：
- 数据覆盖全面，包括A股、期货、期权
- 回测引擎精度高，支持分钟级别回测
- 提供因子研究工具
- 有专业的机构版本

### 万矿WindQuant

万矿是Wind资讯旗下的量化平台，数据质量是国内最高的，但价格也最贵。

**适合人群**：机构投资者或对数据质量要求极高的专业量化研究员。

---

## 6.3 国际主流框架

### Backtrader

Backtrader是最流行的开源Python回测框架，采用事件驱动架构。

**安装**：
```bash
pip install backtrader
```

**核心概念**：
- **Strategy**：策略类，定义买卖逻辑
- **Cerebro**：回测引擎，负责运行策略
- **Data Feed**：数据源
- **Indicator**：技术指标

**Backtrader双均线策略示例**：

```python
import backtrader as bt
import pandas as pd
import akshare as ak
from datetime import datetime

class DoubleMACrossStrategy(bt.Strategy):
    """双均线交叉策略"""
    
    # 策略参数（可以在外部修改）
    params = (
        ('short_period', 5),   # 短期均线周期
        ('long_period', 20),   # 长期均线周期
        ('printlog', True),    # 是否打印日志
    )
    
    def __init__(self):
        """初始化指标"""
        # 计算均线
        self.ma_short = bt.indicators.SMA(
            self.data.close, period=self.params.short_period
        )
        self.ma_long = bt.indicators.SMA(
            self.data.close, period=self.params.long_period
        )
        # 检测金叉死叉
        self.crossover = bt.indicators.CrossOver(self.ma_short, self.ma_long)
    
    def next(self):
        """每根K线执行一次"""
        if self.crossover > 0:  # 金叉
            if not self.position:  # 未持仓
                self.buy()
                if self.params.printlog:
                    self.log(f'金叉买入，价格：{self.data.close[0]:.2f}')
        
        elif self.crossover < 0:  # 死叉
            if self.position:  # 持仓中
                self.sell()
                if self.params.printlog:
                    self.log(f'死叉卖出，价格：{self.data.close[0]:.2f}')
    
    def log(self, txt):
        """日志输出"""
        dt = self.datas[0].datetime.date(0)
        print(f'{dt}: {txt}')
    
    def notify_trade(self, trade):
        """交易完成时的回调"""
        if not trade.isclosed:
            return
        self.log(f'交易利润：毛利={trade.pnl:.2f}, 净利={trade.pnlcomm:.2f}')


def run_backtest():
    """运行回测"""
    # 获取数据
    df = ak.stock_zh_a_hist(
        symbol="000001", period="daily",
        start_date="20200101", end_date="20231231", adjust="qfq"
    )
    df = df.rename(columns={
        '日期':'date','开盘':'open','收盘':'close',
        '最高':'high','最低':'low','成交量':'volume'
    })
    df['date'] = pd.to_datetime(df['date'])
    df.set_index('date', inplace=True)
    df = df[['open','high','low','close','volume']].astype(float)
    
    # 创建Backtrader数据源
    data = bt.feeds.PandasData(dataname=df)
    
    # 创建回测引擎
    cerebro = bt.Cerebro()
    cerebro.adddata(data)
    cerebro.addstrategy(DoubleMACrossStrategy, short_period=5, long_period=20)
    
    # 设置初始资金和手续费
    cerebro.broker.setcash(100000)
    cerebro.broker.setcommission(commission=0.001)  # 0.1%手续费
    
    # 添加分析器
    cerebro.addanalyzer(bt.analyzers.SharpeRatio, _name='sharpe')
    cerebro.addanalyzer(bt.analyzers.DrawDown, _name='drawdown')
    cerebro.addanalyzer(bt.analyzers.Returns, _name='returns')
    
    # 运行回测
    print(f'初始资金：{cerebro.broker.getvalue():.2f}')
    results = cerebro.run()
    print(f'最终资金：{cerebro.broker.getvalue():.2f}')
    
    # 输出分析结果
    strat = results[0]
    print(f"\n回测结果：")
    print(f"夏普比率：{strat.analyzers.sharpe.get_analysis()['sharperatio']:.4f}")
    print(f"最大回撤：{strat.analyzers.drawdown.get_analysis()['max']['drawdown']:.2f}%")
    print(f"年化收益：{strat.analyzers.returns.get_analysis()['rnorm100']:.2f}%")
    
    # 绘制回测图
    cerebro.plot(style='candlestick', volume=True)

if __name__ == '__main__':
    run_backtest()
```

### VectorBT

VectorBT是一个向量化回测框架，速度比Backtrader快100倍以上，特别适合参数优化。

```python
import vectorbt as vbt
import pandas as pd
import akshare as ak

# 获取数据
df = ak.stock_zh_a_hist(
    symbol="000001", period="daily",
    start_date="20200101", end_date="20231231", adjust="qfq"
)
df = df.rename(columns={'日期':'date','收盘':'close'})
df['date'] = pd.to_datetime(df['date'])
df.set_index('date', inplace=True)
close = df['close'].astype(float)

# 用VectorBT进行参数优化（同时测试多组参数）
# 测试短期均线5-15，长期均线20-60的所有组合
short_windows = range(5, 16)   # 5到15
long_windows  = range(20, 61, 5)  # 20到60，步长5

# 计算所有参数组合的均线
fast_ma = vbt.MA.run(close, window=list(short_windows), short_name='fast')
slow_ma = vbt.MA.run(close, window=list(long_windows),  short_name='slow')

# 生成买卖信号
entries = fast_ma.ma_crossed_above(slow_ma)  # 金叉买入
exits   = fast_ma.ma_crossed_below(slow_ma)  # 死叉卖出

# 运行回测（一次性测试所有参数组合）
portfolio = vbt.Portfolio.from_signals(
    close,
    entries,
    exits,
    init_cash=100000,
    fees=0.001
)

# 获取所有参数组合的夏普比率
sharpe_matrix = portfolio.sharpe_ratio()
print("各参数组合的夏普比率：")
print(sharpe_matrix)

# 找出最优参数
best_params = sharpe_matrix.stack().idxmax()
print(f"\n最优参数：短期均线={best_params[0]}，长期均线={best_params[1]}")
print(f"最优夏普比率：{sharpe_matrix.stack().max():.4f}")
```

---

## 6.4 加密货币专用工具

### CCXT：统一的交易所接口

CCXT（CryptoCurrency eXchange Trading Library）支持100多个加密货币交易所，提供统一的API接口。

```python
import ccxt
import pandas as pd

# 初始化交易所（以Binance为例）
exchange = ccxt.binance({
    'enableRateLimit': True,  # 启用请求频率限制
})

# 获取BTC/USDT的日线数据
ohlcv = exchange.fetch_ohlcv('BTC/USDT', timeframe='1d', limit=365)
df = pd.DataFrame(ohlcv, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
df['date'] = pd.to_datetime(df['timestamp'], unit='ms')
df.set_index('date', inplace=True)
df.drop('timestamp', axis=1, inplace=True)

print(df.tail())
print(f"\n数据形状：{df.shape}")
```

### Freqtrade：加密货币量化交易框架

Freqtrade是一个专为加密货币设计的开源量化交易框架，支持回测、参数优化和实盘交易。

---

## 6.5 数据工具对比

| 工具 | 市场覆盖 | 数据质量 | 价格 | 适合场景 |
|------|---------|---------|------|---------|
| AKShare | A股/港股/美股/期货 | 中等 | 免费 | 个人研究 |
| Tushare Pro | A股为主 | 较高 | 积分制 | 个人/小团队 |
| BaoStock | A股 | 较高 | 免费 | A股研究 |
| yfinance | 美股/港股/ETF | 中等 | 免费 | 国际市场 |
| Wind | 全市场 | 最高 | 昂贵 | 机构 |
| CCXT | 加密货币 | 高 | 免费 | 加密量化 |

---

## 6.6 可视化与研究工具

### Plotly：交互式图表

Plotly可以创建可以缩放、悬停查看数据的交互式图表，比matplotlib更适合数据探索。

```python
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import pandas as pd

# 创建K线图
fig = make_subplots(rows=2, cols=1, shared_xaxes=True,
                    vertical_spacing=0.05,
                    row_heights=[0.7, 0.3])

# K线
fig.add_trace(go.Candlestick(
    x=df.index,
    open=df['open'], high=df['high'],
    low=df['low'],   close=df['close'],
    name='K线',
    increasing_line_color='red',    # A股习惯：红涨
    decreasing_line_color='green'   # 绿跌
), row=1, col=1)

# 成交量
fig.add_trace(go.Bar(
    x=df.index, y=df['volume'],
    name='成交量', marker_color='gray', opacity=0.7
), row=2, col=1)

fig.update_layout(
    title='平安银行 K线图',
    xaxis_rangeslider_visible=False,
    height=600
)

fig.write_html('interactive_chart.html')
fig.show()
```

### Streamlit：快速搭建量化仪表盘

```python
# 保存为 dashboard.py，运行：streamlit run dashboard.py
import streamlit as st
import pandas as pd
import akshare as ak
import pandas_ta as ta
import plotly.graph_objects as go

st.title('量化研究仪表盘')

# 侧边栏参数
stock_code = st.sidebar.text_input('股票代码', '000001')
short_ma = st.sidebar.slider('短期均线', 5, 30, 5)
long_ma  = st.sidebar.slider('长期均线', 20, 120, 20)

# 获取数据
@st.cache_data
def get_data(code):
    df = ak.stock_zh_a_hist(symbol=code, period="daily",
                             start_date="20230101", adjust="qfq")
    df = df.rename(columns={'日期':'date','开盘':'open','收盘':'close',
                             '最高':'high','最低':'low','成交量':'volume'})
    df['date'] = pd.to_datetime(df['date'])
    df.set_index('date', inplace=True)
    return df[['open','high','low','close','volume']].astype(float)

df = get_data(stock_code)
df[f'MA{short_ma}'] = ta.sma(df['close'], length=short_ma)
df[f'MA{long_ma}']  = ta.sma(df['close'], length=long_ma)

# 绘图
fig = go.Figure()
fig.add_trace(go.Scatter(x=df.index, y=df['close'], name='收盘价'))
fig.add_trace(go.Scatter(x=df.index, y=df[f'MA{short_ma}'], name=f'MA{short_ma}'))
fig.add_trace(go.Scatter(x=df.index, y=df[f'MA{long_ma}'],  name=f'MA{long_ma}'))
st.plotly_chart(fig, use_container_width=True)

# 显示统计数据
col1, col2, col3 = st.columns(3)
col1.metric("最新收盘价", f"{df['close'].iloc[-1]:.2f}")
col2.metric("近30日涨跌", f"{(df['close'].iloc[-1]/df['close'].iloc[-30]-1)*100:.2f}%")
col3.metric("年化波动率", f"{df['close'].pct_change().std()*252**0.5*100:.1f}%")
```

---

## 6.7 如何选择工具

### 个人研究 vs 机构生产环境

| 维度 | 个人研究 | 机构生产 |
|------|---------|---------|
| 数据 | AKShare/Tushare免费版 | Wind/Bloomberg |
| 回测 | Backtrader/VectorBT | 自研框架 |
| 实盘 | 聚宽/掘金 | 自研交易系统 |
| 监控 | Streamlit | Grafana+专业监控 |
| 成本 | 几乎免费 | 数十万/年 |

### 初学者的推荐工具栈

```
数据：AKShare（免费，够用）
研究环境：Jupyter Notebook
回测：先用pandas手写，再用Backtrader
可视化：matplotlib（基础）+ Plotly（进阶）
实盘（未来）：聚宽或掘金
```

---

## 6.8 用AI辅助工具选型

**示例提示词**：

```
我是量化交易初学者，有以下情况：
- 主要研究A股市场
- 有Python基础，但不是专业程序员
- 目前只做研究，暂时不考虑实盘
- 资金有限，希望尽量使用免费工具
- 主要研究日线级别的策略

请帮我推荐一套完整的量化工具栈，包括：
1. 数据获取工具
2. 回测框架
3. 可视化工具
4. 研究环境

对于每个工具，请说明：
- 为什么推荐它
- 主要的学习成本
- 有哪些替代方案
```

---

## 实战练习：在聚宽平台运行第一个策略，对比本地Backtrader的差异

### 练习目标

通过在两个不同平台运行同一个策略，理解不同工具的差异，建立工具选择的直觉。

### 步骤1：在聚宽平台运行策略

1. 注册聚宽账号（joinquant.com）
2. 进入"策略研究"，新建策略
3. 将6.2节的聚宽策略代码粘贴进去
4. 设置回测时间：2020-01-01 至 2023-12-31
5. 运行回测，记录结果（年化收益、最大回撤、夏普比率）

### 步骤2：在本地用Backtrader运行同一策略

运行6.3节的Backtrader代码，记录相同时间段的回测结果。

### 步骤3：对比差异，用AI分析原因

将两个平台的结果发给AI：

```
我用同一个双均线策略（MA5/MA20）在两个平台回测了平安银行2020-2023年的数据：

聚宽平台结果：
- 年化收益：X%
- 最大回撤：X%
- 夏普比率：X

本地Backtrader结果：
- 年化收益：X%
- 最大回撤：X%
- 夏普比率：X

两个结果有差异，请帮我分析可能的原因：
1. 数据差异（复权方式不同？）
2. 手续费设置差异
3. 滑点处理差异
4. 其他可能的原因

如何判断哪个结果更接近真实情况？
```

---

## 常见问题 Q&A

**Q1：工具越专业，是不是越适合初学者？**

A：不一定。初学者最需要的是“反馈快、出错时容易定位、能把核心流程跑通”的工具，而不是功能最多的工具。工具太重，往往会把学习重点从策略和数据转移到环境折腾上。

**Q2：Backtrader 和 VectorBT 该先学哪个？**

A：如果你更想理解事件驱动回测，先学 Backtrader；如果你更关注参数搜索和快速实验，先学 VectorBT。理想状态是两者都接触，但先明确你的当前任务。

**Q3：平台回测和本地回测结果不一致，是谁错了？**

A：不一定谁错了。更常见的原因是：数据源不同、复权方式不同、成交假设不同、手续费滑点不同、撮合规则不同。你需要先把假设对齐，再谈结果谁更可信。

---

## 本章小结

本章我们建立了量化工具的全局视野：

- **工具分类**：数据工具、研究环境、回测框架、实盘平台、可视化工具各司其职
- **国内平台**：聚宽适合初学者，掘金支持实盘，米筐数据质量高，万矿适合机构
- **国际框架**：Backtrader事件驱动适合策略开发，VectorBT向量化适合参数优化
- **加密货币**：CCXT提供统一的交易所接口，Freqtrade是完整的量化框架
- **工具选择**：初学者用AKShare+Jupyter+Backtrader+matplotlib就够了，不要追求大而全

---

## 课后思考题

1. 事件驱动回测框架和向量化回测框架各有什么优缺点？在什么情况下你会选择事件驱动框架，什么情况下选择向量化框架？

2. 为什么同一个策略在不同平台的回测结果可能不同？列出至少5个可能导致差异的因素。

3. 如果你想把一个在聚宽平台上研究好的策略迁移到本地Backtrader运行，可能会遇到哪些挑战？如何解决？
