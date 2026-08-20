# 第5章：技术分析与量化因子

## 学习目标

完成本章学习后，你将能够：

1. 用量化视角理解技术分析，把"看图说话"转化为可计算的数学公式
2. 用pandas-ta库计算10个常用技术指标
3. 理解量化因子的概念，区分动量、均值回归、波动率三类因子
4. 用相关性分析初步评估因子的有效性
5. 借助AI设计并实现自定义技术指标

---

## 5.1 技术分析的量化视角：指标不是玄学，是数学

### 技术分析的本质

很多人对技术分析有误解，认为它是"看图说话"的玄学。但从量化的角度看，技术分析的本质是：**用历史价格和成交量数据，通过数学公式，提取市场的某种规律性信号**。

举个例子：移动平均线（MA）的公式非常简单——就是过去N天收盘价的算术平均值。它背后的逻辑是：如果当前价格高于过去一段时间的平均价格，说明市场处于上升趋势。这不是玄学，是统计学。

### 技术指标的局限性

技术指标有效的前提是：**历史规律在未来会重复**。但市场是动态的，参与者会学习和适应。当一个技术指标被太多人使用时，它的有效性往往会下降——因为大家都在同一时间做同样的操作，信号就失效了。

这就是为什么量化交易者不会只依赖单一指标，而是寻找多个独立信号的组合。

### 从指标到因子

在量化领域，我们把能够预测未来收益的数学特征称为"因子"（Factor）。技术指标是因子的一种，但因子的范围更广，还包括基本面数据、情绪数据等。

---

## 5.2 常用技术指标详解

### 移动平均线（MA / EMA）

#### K 线 + MA / EMA 叠加示意图

```text
价格
 ^
 |                         ╱╲
 |                    ╱╲  ╱  ╲        收盘价
 |               ╱╲ ╱  ╲╱    ╲__  _ _
 |          _  _╱  ╲
 |     _  _/ \/                 ········· MA(长期，更平滑)
 | ___/                         ───────── EMA(短期，更敏感)
 +--------------------------------------------------------> 时间

观察点:
  1. 价格上穿长期均线 -> 趋势偏强
  2. 短均线上穿长均线 -> 金叉
  3. 短均线下穿长均线 -> 死叉
  4. EMA 比 MA 对近期价格变化更敏感
```

**简单移动平均线（MA）**：过去N天收盘价的算术平均值。

```
MA(N) = (P₁ + P₂ + ... + Pₙ) / N
```

**指数移动平均线（EMA）**：给近期价格更高的权重，对价格变化更敏感。

```
EMA(N) = 当日收盘价 × k + 前一日EMA × (1-k)
其中 k = 2 / (N+1)
```

**使用场景**：判断趋势方向，短期均线上穿长期均线（金叉）视为买入信号。

### MACD（移动平均收敛散度）

MACD由三部分组成：
- **DIF线**：12日EMA - 26日EMA
- **DEA线（信号线）**：DIF的9日EMA
- **MACD柱**：(DIF - DEA) × 2

**使用场景**：
- DIF上穿DEA（金叉）：买入信号
- DIF下穿DEA（死叉）：卖出信号
- MACD柱由负转正：趋势可能反转向上

### RSI（相对强弱指数）

RSI衡量一段时间内价格上涨幅度与总波动幅度的比值，范围0-100。

```
RSI = 100 - 100 / (1 + RS)
RS = 过去N天平均上涨幅度 / 过去N天平均下跌幅度
```

**使用场景**：
- RSI > 70：超买区域，可能面临回调
- RSI < 30：超卖区域，可能面临反弹
- 常用参数：14日RSI

### 布林带（Bollinger Bands）

布林带由三条线组成：
- **中轨**：N日移动平均线（通常N=20）
- **上轨**：中轨 + K × N日标准差（通常K=2）
- **下轨**：中轨 - K × N日标准差

**使用场景**：
- 价格触及上轨：可能超买，考虑卖出
- 价格触及下轨：可能超卖，考虑买入
- 布林带收窄：波动率降低，可能即将出现大行情

### KDJ随机指标

KDJ由K、D、J三条线组成，衡量当前价格在近期价格区间中的位置。

**使用场景**：
- K线上穿D线（金叉）：买入信号
- K线下穿D线（死叉）：卖出信号
- J值超过100或低于0：极端超买/超卖

---

## 5.3 用pandas-ta计算技术指标

pandas-ta是一个功能强大的技术分析库，支持130多个技术指标，使用非常简便。

```python
import pandas as pd
import pandas_ta as ta
import akshare as ak
import matplotlib.pyplot as plt
import matplotlib
matplotlib.rcParams['font.sans-serif'] = ['SimHei']
matplotlib.rcParams['axes.unicode_minus'] = False

# 获取股票数据
df = ak.stock_zh_a_hist(
    symbol="000001", period="daily",
    start_date="20230101", end_date="20231231", adjust="qfq"
)
df = df.rename(columns={
    '日期':'date','开盘':'open','收盘':'close',
    '最高':'high','最低':'low','成交量':'volume'
})
df['date'] = pd.to_datetime(df['date'])
df.set_index('date', inplace=True)
df = df[['open','high','low','close','volume']].astype(float)

# ============ 计算技术指标 ============

# 1. 移动平均线
df['MA5']  = ta.sma(df['close'], length=5)
df['MA10'] = ta.sma(df['close'], length=10)
df['MA20'] = ta.sma(df['close'], length=20)

# 2. 指数移动平均线
df['EMA12'] = ta.ema(df['close'], length=12)
df['EMA26'] = ta.ema(df['close'], length=26)

# 3. MACD
macd = ta.macd(df['close'], fast=12, slow=26, signal=9)
df['MACD_DIF'] = macd['MACD_12_26_9']
df['MACD_DEA'] = macd['MACDs_12_26_9']
df['MACD_HIST'] = macd['MACDh_12_26_9']

# 4. RSI
df['RSI14'] = ta.rsi(df['close'], length=14)

# 5. 布林带
bbands = ta.bbands(df['close'], length=20, std=2)
df['BB_upper'] = bbands['BBU_20_2.0']
df['BB_mid']   = bbands['BBM_20_2.0']
df['BB_lower'] = bbands['BBL_20_2.0']

# 6. KDJ（pandas-ta中叫Stochastic）
stoch = ta.stoch(df['high'], df['low'], df['close'])
df['K'] = stoch['STOCHk_14_3_3']
df['D'] = stoch['STOCHd_14_3_3']
df['J'] = 3 * df['K'] - 2 * df['D']

# 7. ATR（平均真实波幅，衡量波动率）
df['ATR14'] = ta.atr(df['high'], df['low'], df['close'], length=14)

# 8. 成交量加权平均价（VWAP）
df['VWAP'] = ta.vwap(df['high'], df['low'], df['close'], df['volume'])

# 9. 动量指标（ROC，变化率）
df['ROC10'] = ta.roc(df['close'], length=10)

# 10. 威廉指标（%R）
df['WILLR14'] = ta.willr(df['high'], df['low'], df['close'], length=14)

print("技术指标计算完成！")
print(df[['close','MA5','MA20','RSI14','MACD_DIF']].tail(10))
```

---

## 5.4 量化因子的概念：动量、均值回归、波动率

### 什么是量化因子？

量化因子是一种数学特征，它能够系统性地解释或预测资产的未来收益。好的因子应该：
1. 有清晰的经济逻辑（为什么这个因子应该有效？）
2. 在历史数据中有统计显著性
3. 在不同时间段和不同市场中都有一定的稳定性

### 动量因子

**核心逻辑**：涨的股票继续涨，跌的股票继续跌。

这听起来违反直觉，但学术研究（Jegadeesh & Titman, 1993）发现，过去3-12个月表现好的股票，在未来3-12个月往往继续表现好。

```python
# 计算12个月动量因子（排除最近1个月，避免短期反转）
def momentum_factor(df, lookback=252, skip=21):
    """
    计算动量因子
    lookback: 回望期（交易日数）
    skip: 跳过最近的天数（避免短期反转）
    """
    # 12个月前的价格 / 1个月前的价格 - 1
    momentum = df['close'].shift(skip) / df['close'].shift(lookback) - 1
    return momentum

df['momentum_12m'] = momentum_factor(df)
```

### 均值回归因子

**核心逻辑**：价格偏离均值后会回归。

短期内（几天到几周），股票价格往往会出现均值回归现象——涨太多的会跌回来，跌太多的会涨回来。

```python
# 计算均值回归因子：当前价格相对于20日均线的偏离程度
df['mean_reversion'] = (df['close'] - df['MA20']) / df['MA20']

# 负值表示价格低于均线（可能超卖），正值表示高于均线（可能超买）
print(df['mean_reversion'].describe())
```

### 波动率因子

**核心逻辑**：低波动率股票往往有更好的风险调整收益。

这与传统金融理论（高风险高收益）相悖，但实证研究发现，低波动率股票的长期表现往往优于高波动率股票。

```python
# 计算20日历史波动率（年化）
df['daily_return'] = df['close'].pct_change()
df['volatility_20d'] = df['daily_return'].rolling(20).std() * (252 ** 0.5)

print(f"平均年化波动率：{df['volatility_20d'].mean():.2%}")
```

---

## 5.5 因子有效性初探：相关性分析

### 如何评估因子是否有效？

最简单的方法是计算因子值与未来收益的相关性。如果因子值高的股票，未来收益也高，说明这个因子可能有效。

```python
import numpy as np

def factor_ic_analysis(df, factor_col, forward_days=5):
    """
    计算因子的IC值（信息系数）
    IC = 因子值与未来N日收益的相关系数
    IC绝对值越大，因子预测能力越强
    IC > 0.05 通常认为有一定预测价值
    """
    # 计算未来N日收益
    df[f'future_return_{forward_days}d'] = df['close'].shift(-forward_days) / df['close'] - 1
    
    # 删除NaN
    valid_data = df[[factor_col, f'future_return_{forward_days}d']].dropna()
    
    # 计算Spearman秩相关系数（对异常值更鲁棒）
    ic = valid_data[factor_col].corr(
        valid_data[f'future_return_{forward_days}d'],
        method='spearman'
    )
    
    return ic

# 评估各因子的IC值
factors = ['momentum_12m', 'mean_reversion', 'RSI14', 'ROC10']
print("因子IC分析（与未来5日收益的相关性）：")
for factor in factors:
    if factor in df.columns:
        ic = factor_ic_analysis(df, factor, forward_days=5)
        print(f"  {factor}: IC = {ic:.4f}")
```

### 滚动IC分析

单一时间段的IC可能不稳定，需要看滚动IC的稳定性：

```python
def rolling_ic(df, factor_col, forward_days=5, window=60):
    """计算滚动IC，评估因子的稳定性"""
    df['future_return'] = df['close'].shift(-forward_days) / df['close'] - 1
    
    ic_series = []
    dates = []
    
    for i in range(window, len(df) - forward_days):
        window_data = df.iloc[i-window:i][[factor_col, 'future_return']].dropna()
        if len(window_data) > 10:
            ic = window_data[factor_col].corr(window_data['future_return'], method='spearman')
            ic_series.append(ic)
            dates.append(df.index[i])
    
    return pd.Series(ic_series, index=dates)

# 绘制滚动IC
ic_series = rolling_ic(df, 'RSI14')
plt.figure(figsize=(12, 4))
plt.plot(ic_series, label='RSI14 滚动IC')
plt.axhline(y=0, color='black', linestyle='-', linewidth=0.5)
plt.axhline(y=0.05, color='green', linestyle='--', alpha=0.5, label='IC=0.05')
plt.axhline(y=-0.05, color='red', linestyle='--', alpha=0.5, label='IC=-0.05')
plt.title('RSI14因子滚动IC（60日窗口）')
plt.legend()
plt.grid(True, alpha=0.3)
plt.tight_layout()
plt.savefig('rolling_ic.png', dpi=150)
plt.show()
```

---

## 5.6 用AI设计新指标：让AI提出并实现自定义因子

### AI在因子研究中的价值

AI可以帮助你：
1. 从市场逻辑出发，提出新的因子假设
2. 将因子想法转化为Python代码
3. 解释现有因子的经济含义

**示例提示词——因子创意**：

```
我正在研究A股市场的量化因子。
请从以下角度提出5个可能有效的技术类因子：
1. 每个因子要有清晰的市场逻辑（为什么它应该有预测能力）
2. 因子要能用日线OHLCV数据计算
3. 避免过于复杂的因子（初学者能理解）

对于每个因子，请说明：
- 因子名称和计算方法
- 背后的市场逻辑
- 可能在什么市场环境下有效/失效
```

**示例提示词——实现自定义因子**：

```
请帮我实现以下自定义因子：

因子名称：量价背离因子
因子逻辑：当股票价格创新高但成交量没有同步放大时，
可能是上涨动力不足的信号（量价背离）。

具体计算方法：
1. 计算过去20天的价格最高点
2. 计算过去20天的成交量最高点
3. 如果今天价格创20日新高，但成交量低于20日均量的1.5倍，
   则认为出现量价背离，因子值为-1（看空信号）
4. 否则因子值为0

请用pandas实现这个因子，输入是包含close和volume列的DataFrame，
输出是一个新列'vol_price_divergence'。
```

---

## 实战练习：计算10个常用指标并可视化，用AI解释每个指标的含义

### 完整可视化代码

```python
import pandas as pd
import pandas_ta as ta
import akshare as ak
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
import matplotlib
matplotlib.rcParams['font.sans-serif'] = ['SimHei']
matplotlib.rcParams['axes.unicode_minus'] = False

# 获取数据（使用前面章节的方法）
df = ak.stock_zh_a_hist(
    symbol="000001", period="daily",
    start_date="20230601", end_date="20231231", adjust="qfq"
)
df = df.rename(columns={
    '日期':'date','开盘':'open','收盘':'close',
    '最高':'high','最低':'low','成交量':'volume'
})
df['date'] = pd.to_datetime(df['date'])
df.set_index('date', inplace=True)
df = df[['open','high','low','close','volume']].astype(float)

# 计算所有指标
df['MA5']  = ta.sma(df['close'], length=5)
df['MA20'] = ta.sma(df['close'], length=20)
macd_data = ta.macd(df['close'])
df['MACD_DIF']  = macd_data.iloc[:, 0]
df['MACD_DEA']  = macd_data.iloc[:, 2]
df['MACD_HIST'] = macd_data.iloc[:, 1]
df['RSI14'] = ta.rsi(df['close'], length=14)
bb = ta.bbands(df['close'], length=20)
df['BB_upper'] = bb.iloc[:, 0]
df['BB_lower'] = bb.iloc[:, 2]

# 绘制综合图表
fig = plt.figure(figsize=(16, 14))
gs = gridspec.GridSpec(4, 1, height_ratios=[3, 1, 1, 1], hspace=0.4)

# 子图1：价格 + 均线 + 布林带
ax1 = fig.add_subplot(gs[0])
ax1.plot(df.index, df['close'], label='收盘价', color='black', linewidth=1)
ax1.plot(df.index, df['MA5'],  label='MA5',  color='blue',  linewidth=1.2)
ax1.plot(df.index, df['MA20'], label='MA20', color='red',   linewidth=1.2)
ax1.fill_between(df.index, df['BB_upper'], df['BB_lower'],
                 alpha=0.1, color='gray', label='布林带')
ax1.plot(df.index, df['BB_upper'], color='gray', linewidth=0.8, linestyle='--')
ax1.plot(df.index, df['BB_lower'], color='gray', linewidth=0.8, linestyle='--')
ax1.set_title('平安银行（000001）技术指标综合图', fontsize=14)
ax1.legend(loc='upper left', fontsize=9)
ax1.grid(True, alpha=0.3)

# 子图2：成交量
ax2 = fig.add_subplot(gs[1])
colors = ['red' if c >= o else 'green'
          for c, o in zip(df['close'], df['open'])]
ax2.bar(df.index, df['volume'], color=colors, alpha=0.7, label='成交量')
ax2.set_title('成交量')
ax2.legend(loc='upper left', fontsize=9)
ax2.grid(True, alpha=0.3)

# 子图3：MACD
ax3 = fig.add_subplot(gs[2])
ax3.plot(df.index, df['MACD_DIF'], label='DIF', color='blue', linewidth=1)
ax3.plot(df.index, df['MACD_DEA'], label='DEA', color='red',  linewidth=1)
macd_colors = ['red' if v >= 0 else 'green' for v in df['MACD_HIST']]
ax3.bar(df.index, df['MACD_HIST'], color=macd_colors, alpha=0.7, label='MACD柱')
ax3.axhline(y=0, color='black', linewidth=0.5)
ax3.set_title('MACD')
ax3.legend(loc='upper left', fontsize=9)
ax3.grid(True, alpha=0.3)

# 子图4：RSI
ax4 = fig.add_subplot(gs[3])
ax4.plot(df.index, df['RSI14'], label='RSI(14)', color='purple', linewidth=1)
ax4.axhline(y=70, color='red',   linestyle='--', alpha=0.7, label='超买线(70)')
ax4.axhline(y=30, color='green', linestyle='--', alpha=0.7, label='超卖线(30)')
ax4.fill_between(df.index, 70, df['RSI14'],
                 where=df['RSI14'] >= 70, alpha=0.2, color='red')
ax4.fill_between(df.index, 30, df['RSI14'],
                 where=df['RSI14'] <= 30, alpha=0.2, color='green')
ax4.set_ylim(0, 100)
ax4.set_title('RSI(14)')
ax4.legend(loc='upper left', fontsize=9)
ax4.grid(True, alpha=0.3)

plt.savefig('technical_indicators.png', dpi=150, bbox_inches='tight')
plt.show()
print("图表已保存为 technical_indicators.png")
```

### 用AI解释指标

运行完代码后，将图表截图发给AI（如果AI支持图片输入），或者描述你看到的现象：

```
我计算了平安银行2023年下半年的技术指标，观察到以下现象：
1. 8月份RSI达到了75，之后股价出现了回调
2. 10月份MACD出现了死叉，之后股价持续下跌
3. 11月份股价触及布林带下轨，之后出现了反弹

请帮我分析：
1. 这些现象是否符合技术指标的理论预期？
2. 这些信号的可靠性如何？有没有可能是假信号？
3. 如果我想用这些信号设计一个简单的交易策略，应该如何组合使用？
```

---

## 常见问题 Q&A

**Q1：技术指标是不是已经被市场用烂了，所以没有价值？**

A：不能一概而论。单个指标裸用往往很弱，但当它被放进更完整的研究框架里，例如结合市场环境、风险过滤和组合构建，它仍然可以成为有信息量的因子来源。

**Q2：一个指标发出买入信号，为什么价格有时还是继续下跌？**

A：因为指标只是对历史价格的压缩表达，不是未来的保证。它给的是概率优势，不是确定答案；在震荡市、突发事件或流动性恶化时，很多信号都会失灵。

**Q3：IC 值高就能直接拿去做策略吗？**

A：不能。IC 只是说明这个因子和未来收益在样本内存在相关性，还没回答它是否稳定、是否可交易、是否会被成本吃掉、是否与已有因子高度重复。

---

## 本章小结

本章我们建立了技术分析的量化视角：

- **技术指标的本质**：不是玄学，是数学公式。MA、MACD、RSI、布林带、KDJ各有其经济逻辑
- **pandas-ta**：一行代码计算130+技术指标，是量化研究的利器
- **量化因子**：动量、均值回归、波动率是三大经典因子类型，各有其市场逻辑
- **因子有效性**：用IC（信息系数）评估因子的预测能力，IC绝对值>0.05通常认为有价值
- **AI辅助因子研究**：AI可以帮你提出因子假设、实现代码，但因子的经济逻辑必须自己理解

---

## 课后思考题

1. RSI指标在趋势市场和震荡市场中的表现有很大差异。请解释为什么，并思考如何判断当前市场是趋势市场还是震荡市场。

2. 动量因子和均值回归因子在逻辑上是相反的（一个认为趋势会延续，一个认为价格会回归）。它们能同时有效吗？在什么时间尺度上各自更有效？

3. 如果你发现某个技术指标在历史回测中IC值很高（比如0.15），你会直接用它来构建策略吗？还需要做哪些额外的验证？
