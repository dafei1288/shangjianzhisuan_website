# 第8章：回测系统与策略评估

![第8章 回测系统与策略评估题图](../visuals/chapters/ch08-hero.png)

## 学习目标

1. 理解回测的原理，识别并避免常见陷阱
2. 能手写一个简单回测框架，理解底层逻辑
3. 掌握 Backtrader / VectorBT 的基本使用
4. 读懂核心评估指标：夏普比率、最大回撤等
5. 学会用 AI 辅助解读回测报告，发现策略问题

---

## 8.1 回测的原理与常见陷阱

回测（Backtest）就是把策略放到历史数据上"模拟运行"，看看如果过去用这个策略，结果会怎样。

听起来很简单，但这里藏着量化交易最大的坑。

### 回测的基本原理

#### 回测净值曲线与最大回撤示意图

```text
净值
 ^
 |                               peak
 |                              /\
 |                             /  \__
 |                        /\  /       \____
 |                 /\    /  \/              \__
 |          /\    /  \__/                      \__
 |_________/  \__/__________________________________> 时间

             <------ 最大回撤区间 ------->
             peak 到 trough 的相对跌幅 = Max Drawdown
```

```text
同一个策略至少看两条线:
  1. 净值曲线：赚没赚钱，增长是否平滑
  2. 回撤曲线：中途亏得有多深，自己扛不扛得住
```

回测模拟的是这样一个过程：
1. 按时间顺序遍历历史数据（一天一天或一分钟一分钟）
2. 在每个时间点，根据策略逻辑判断是否买入/卖出
3. 记录每笔交易的盈亏
4. 最终统计整体表现

关键原则：**在时间点 T 做决策时，只能用 T 之前的数据**。这听起来是废话，但很多人会不小心违反。

### 三大致命陷阱

**陷阱一：未来函数（Look-ahead Bias）**

这是最常见也最隐蔽的错误。

错误示例：
```python
# 错误！用了当天收盘价来决定当天是否买入
df['signal'] = df['close'] > df['close'].shift(1)  # 看起来没问题
df['buy'] = df['signal'] & (df['close'] > df['ma20'])  # 但如果ma20用了当天数据就错了
```

正确做法：所有用于生成信号的指标，都必须用 `.shift(1)` 延迟一期，确保用的是"昨天能知道的信息"。

**陷阱二：过拟合（Overfitting）**

你调了100组参数，找到了一组在历史数据上表现完美的参数。但这组参数只是"记住了历史"，换到新数据上就失效了。

识别方法：把数据分成训练集和测试集，只在训练集上调参，在测试集上验证。如果训练集表现远好于测试集，就是过拟合了。

**陷阱三：幸存者偏差（Survivorship Bias）**

如果你的股票池只包含"现在还在交易的股票"，那些已经退市的垃圾股就被排除在外了。这会让策略看起来比实际更好。

解决方法：使用包含退市股票的完整历史数据。

### 真实回测的四个必要假设

很多入门回测之所以“好看”，不是因为策略真的强，而是因为假设过于理想化。只要下面四项没有建进去，回测结果通常都偏乐观：

1. **交易成本**：至少要包含手续费、印花税、过户费等显性成本。
2. **滑点**：信号出现时，你未必能按理论价格成交，尤其在波动大或流动性差的标的上。
3. **流动性约束**：小市值股票、冷门 ETF、集合竞价阶段，可能根本买不进去或卖不出来。
4. **调仓延迟**：日线策略通常只能在下一根 K 线的开盘或下一时段成交，不能默认“看到信号就立刻按收盘价成交”。

实务上，很多策略从“看起来年化 30%”回落到“真实可做年化 10%-15%”，不是策略失效，而是终于把交易世界里本来就存在的摩擦成本补进来了。

---

## 8.2 手写简单回测框架

在用专业工具之前，先手写一个简单框架，理解底层逻辑。

```python
import pandas as pd
import numpy as np

def simple_backtest(df, initial_capital=100000):
    """
    简单向量化回测框架
    df 需要包含列：close, signal（1=买入, -1=卖出, 0=持有）
    """
    capital = initial_capital
    position = 0  # 持仓数量
    trades = []
    portfolio_values = []

    for i, row in df.iterrows():
        price = row['close']
        signal = row['signal']

        # 买入信号且当前没有持仓
        if signal == 1 and position == 0:
            shares = int(capital / price)
            cost = shares * price
            capital -= cost
            position = shares
            trades.append({'date': i, 'action': 'buy', 'price': price, 'shares': shares})

        # 卖出信号且当前有持仓
        elif signal == -1 and position > 0:
            revenue = position * price
            capital += revenue
            trades.append({'date': i, 'action': 'sell', 'price': price, 'shares': position})
            position = 0

        # 记录当前组合价值
        portfolio_value = capital + position * price
        portfolio_values.append({'date': i, 'value': portfolio_value})

    portfolio_df = pd.DataFrame(portfolio_values).set_index('date')
    return portfolio_df, pd.DataFrame(trades)


def calculate_metrics(portfolio_df, initial_capital=100000):
    """计算核心评估指标"""
    values = portfolio_df['value']

    # 总收益率
    total_return = (values.iloc[-1] - initial_capital) / initial_capital

    # 年化收益率（假设252个交易日）
    n_days = len(values)
    annual_return = (1 + total_return) ** (252 / n_days) - 1

    # 日收益率
    daily_returns = values.pct_change().dropna()

    # 夏普比率（假设无风险利率3%）
    risk_free = 0.03 / 252
    sharpe = (daily_returns.mean() - risk_free) / daily_returns.std() * np.sqrt(252)

    # 最大回撤
    rolling_max = values.cummax()
    drawdown = (values - rolling_max) / rolling_max
    max_drawdown = drawdown.min()

    return {
        '总收益率': f'{total_return:.2%}',
        '年化收益率': f'{annual_return:.2%}',
        '夏普比率': f'{sharpe:.2f}',
        '最大回撤': f'{max_drawdown:.2%}'
    }
```

这个框架虽然简单，但包含了回测的核心逻辑：遍历时间、执行交易、记录价值。

不过要明确，这个简化框架距离真实交易还差几步：

- 没有处理涨跌停、停牌、最小成交单位等市场微观规则
- 没有区分信号生成时点和实际成交时点
- 没有建模手续费、滑点和资金占用
- 没有处理多标的组合和现金管理

所以手写框架的价值主要是“理解回测本质”，而不是直接拿去做生产级评估。

---

## 8.3 使用 Backtrader / VectorBT 进行专业回测

手写框架帮助理解原理，但实际使用中推荐专业工具。

### VectorBT：快速向量化回测

VectorBT 的优势是速度极快，适合参数优化。

```python
import vectorbt as vbt
import pandas as pd
import akshare as ak

# 获取数据
df = ak.stock_zh_a_hist(symbol="000001", period="daily",
                         start_date="20200101", end_date="20241231",
                         adjust="qfq")
close = df.set_index('日期')['收盘']

# 计算均线
fast_ma = close.rolling(10).mean()
slow_ma = close.rolling(30).mean()

# 生成信号
entries = fast_ma > slow_ma   # 金叉买入
exits = fast_ma < slow_ma     # 死叉卖出

# 运行回测
portfolio = vbt.Portfolio.from_signals(
    close,
    entries,
    exits,
    init_cash=100000,
    fees=0.001,      # 手续费0.1%
    slippage=0.001   # 滑点0.1%
)

# 查看结果
print(portfolio.stats())
portfolio.plot().show()
```

### Backtrader：功能完整的事件驱动回测

Backtrader 更接近真实交易逻辑，适合复杂策略。

```python
import backtrader as bt

class DoubleMACrossStrategy(bt.Strategy):
    params = (('fast', 10), ('slow', 30),)

    def __init__(self):
        self.fast_ma = bt.indicators.SMA(self.data.close, period=self.params.fast)
        self.slow_ma = bt.indicators.SMA(self.data.close, period=self.params.slow)
        self.crossover = bt.indicators.CrossOver(self.fast_ma, self.slow_ma)

    def next(self):
        if not self.position:
            if self.crossover > 0:   # 金叉
                self.buy()
        else:
            if self.crossover < 0:   # 死叉
                self.sell()

# 运行
cerebro = bt.Cerebro()
cerebro.addstrategy(DoubleMACrossStrategy)
cerebro.broker.setcash(100000)
cerebro.broker.setcommission(commission=0.001)
# 添加数据...
cerebro.run()
cerebro.plot()
```

### 什么时候用 VectorBT，什么时候用 Backtrader？

这两个工具没有谁绝对更好，关键看你当前的问题是什么：

| 场景 | 更适合的工具 | 原因 |
|------|--------------|------|
| 快速验证一个因子或参数组合 | VectorBT | 向量化快，适合批量跑参数 |
| 做事件驱动策略、分批成交、复杂止损 | Backtrader | 更接近真实交易流程 |
| 做教学和原型验证 | 两者都可以 | VectorBT 更快，Backtrader 更直观 |
| 接近实盘前的细节验证 | Backtrader | 更容易表达订单生命周期和经纪商规则 |

---

## 8.4 核心评估指标

看懂这几个指标，才能客观评价一个策略。

| 指标 | 含义 | 参考值 |
|------|------|--------|
| 年化收益率 | 折算成每年的平均收益 | >15% 算不错 |
| 夏普比率 | 每承担1单位风险获得的超额收益 | >1 可接受，>2 优秀 |
| 最大回撤 | 从最高点到最低点的最大跌幅 | <20% 较好 |
| 胜率 | 盈利交易占总交易的比例 | 不能单独看 |
| 盈亏比 | 平均盈利 / 平均亏损 | 配合胜率看 |

**重要认知**：胜率 40% + 盈亏比 3:1，比胜率 70% + 盈亏比 0.5:1 要好得多。不要迷信胜率。

**夏普比率的直觉理解**：

想象两个策略：
- 策略A：每年稳定赚15%，波动很小
- 策略B：平均每年赚20%，但有时候一年亏30%

策略A的夏普比率更高，因为它的"性价比"更好——用更小的风险换来了稳定的收益。

### 评估时不要漏掉的三类补充指标

真正做策略筛选时，专业投资团队通常不会只看上表那几个“明星指标”，还会补看下面三类信息：

1. **稳定性指标**
   - 月度胜率
   - 滚动 6 个月夏普
   - 不同年份收益分布
2. **交易质量指标**
   - 平均持仓周期
   - 单笔交易收益分布
   - 手续费占毛收益的比例
3. **容量与可执行性指标**
   - 单日成交额占市场成交量的比例
   - 策略资金规模扩大后，收益是否快速下降
   - 是否依赖极少数大行情日贡献收益

如果一个策略 80% 的利润都来自两三笔极端行情交易，那么它的可复制性和稳定性就需要打问号。

---

## 8.5 用 AI 解读回测报告

回测跑完后，把结果交给 AI 分析，往往能发现你自己没注意到的问题。

**提示词示例：**

```
我的量化策略回测结果如下：
- 回测区间：2020-01-01 至 2024-12-31
- 年化收益率：18.5%
- 夏普比率：0.85
- 最大回撤：-35.2%
- 胜率：52%
- 盈亏比：1.8
- 总交易次数：127次

同期沪深300指数年化收益率：6.2%，最大回撤：-33%

请帮我分析：
1. 这个策略的优势和劣势是什么？
2. 最大回撤-35%是否可以接受？
3. 夏普比率0.85说明什么问题？
4. 有哪些方向可以改进？
```

AI 会给出类似这样的分析：
- 超额收益明显（+12.3%），但夏普比率偏低说明波动较大
- 最大回撤与指数相当，说明策略没有有效控制下行风险
- 建议加入止损机制或仓位管理来降低回撤

---

## 8.6 参数优化与过拟合风险

参数优化是双刃剑：用好了能提升策略，用错了会制造假象。

### 正确的参数优化流程

```python
import vectorbt as vbt
import numpy as np

# 定义参数范围
fast_range = np.arange(5, 30, 5)   # 5, 10, 15, 20, 25
slow_range = np.arange(20, 80, 10)  # 20, 30, 40, 50, 60, 70

# 只在训练集（前70%数据）上优化
train_size = int(len(close) * 0.7)
train_close = close.iloc[:train_size]
test_close = close.iloc[train_size:]

# 网格搜索（VectorBT支持批量回测）
fast_ma, slow_ma = vbt.MA.run_combs(
    train_close,
    window=[fast_range, slow_range],
    r=2,
    short_names=['fast', 'slow']
)

entries = fast_ma.ma_crossed_above(slow_ma)
exits = fast_ma.ma_crossed_below(slow_ma)

pf = vbt.Portfolio.from_signals(train_close, entries, exits, init_cash=100000)
sharpe_matrix = pf.sharpe_ratio()

# 找到最优参数
best_params = sharpe_matrix.idxmax()
print(f"最优参数：fast={best_params[0]}, slow={best_params[1]}")

# 在测试集上验证（不再调整参数）
# ... 用最优参数在 test_close 上跑一次
```

**黄金法则**：参数在训练集上优化，在测试集上验证，两者表现差距不能太大。如果训练集夏普2.5，测试集夏普0.3，说明严重过拟合。

### 更专业的验证方式：Walk-Forward

训练集 / 测试集二分法适合入门，但真实量化研究更常用 **Walk-Forward（滚动前推验证）**。思路是：

1. 用前一段时间训练策略或调参数
2. 在紧接着的下一段时间测试
3. 时间窗口整体向前滚动
4. 最后把所有测试窗口拼起来看整体表现

这样做的好处是更接近真实交易环境，因为策略永远只能利用“当时已经发生过的数据”。

```text
时间轴:

[训练 2018-2020] -> [测试 2021]
        向前滚动
[训练 2019-2021] -> [测试 2022]
        向前滚动
[训练 2020-2022] -> [测试 2023]

把所有测试段收益拼接后，再评估总表现
```

如果一个策略只在单一时间段有效，而在多个滚动窗口里表现极不稳定，那么它更像“运气碰上了市场风格”，而不是具备稳健优势。

---

## 实战练习：完整回测双均线策略

**目标**：对第7章设计的双均线策略进行完整回测，用 AI 生成分析报告。

**步骤：**

1. 获取平安银行（000001）2020-2024年日线数据
2. 计算10日和30日均线，生成交叉信号
3. 用 VectorBT 运行回测，设置手续费0.1%、滑点0.1%
4. 输出：年化收益、夏普比率、最大回撤、胜率
5. 与同期沪深300对比
6. 把结果复制给 AI，让 AI 写一份策略分析报告

**AI提示词模板：**
```
请根据以下回测数据，写一份专业的策略分析报告（500字左右），
包括：策略表现总结、优势分析、风险点、改进建议。

[粘贴你的回测数据]
```

---

## 常见问题 Q&A

**Q1：为什么我自己手写的回测结果和平台结果差很多？**

A：最常见的原因不是公式写错，而是交易假设不同，例如信号在什么时候生成、什么时候成交、是否计入手续费和滑点、是否允许满仓。回测框架的细节会直接改变结果。

**Q2：年化收益很高但最大回撤也很大，这个策略算好吗？**

A：要看你的目标和承受能力。量化里不能只看赚了多少，还要看过程中亏得有多深、能不能活着熬过去。很多看起来亮眼的策略，真正死在了中间那段大回撤。

**Q3：Walk-Forward 一定比简单训练集/测试集划分好吗？**

A：它通常更接近真实交易，但也更复杂、更耗时。入门阶段先掌握“训练和验证必须分开”的基本纪律，再逐步升级到 Walk-Forward，会比一上来就追求复杂流程更稳。

---

## 本章小结

- 回测是验证策略的必要手段，但要警惕未来函数、过拟合、幸存者偏差三大陷阱
- 手写框架帮助理解原理，VectorBT 适合快速验证，Backtrader 适合复杂策略
- 评估策略要综合看夏普比率、最大回撤、盈亏比，不能只看收益率
- 参数优化必须在训练集/测试集分离的前提下进行
- 专业回测必须显式考虑交易成本、滑点、流动性和调仓延迟
- 如果条件允许，应进一步采用 Walk-Forward 验证策略稳健性
- AI 是很好的回测报告解读助手，能帮你发现盲点

---

## 课后思考题

1. 如果一个策略在2015-2020年回测表现很好，但2020-2024年表现很差，可能是什么原因？
2. 夏普比率为负数意味着什么？这个策略还值得继续优化吗？
3. 为什么说"胜率70%的策略不一定比胜率40%的策略好"？请用数字举例说明。
