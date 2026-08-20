# 第7章：量化策略设计基础

## 学习目标

完成本章学习后，你将能够：

1. 理解策略的四要素（信号、过滤、仓位、止损），并在设计策略时系统性地考虑每个要素
2. 区分趋势跟踪、均值回归、套利三类经典策略的逻辑和适用场景
3. 将策略想法转化为可执行的代码逻辑
4. 用AI辅助头脑风暴策略思路，并评估可行性
5. 完整设计并实现一个双均线交叉策略

---

## 7.1 策略的四要素：信号、过滤、仓位、止损

### 一个策略必须回答四个问题

很多初学者设计策略时，只想到了"什么时候买"，却忽略了其他同样重要的问题。一个完整的量化策略必须明确回答以下四个问题：

**问题1：什么时候买/卖？（信号）**
这是策略的核心逻辑，决定了策略的基本特征。

**问题2：什么情况下不执行信号？（过滤）**
并非所有信号都值得执行。过滤条件可以减少假信号，提高策略质量。

**问题3：买多少？（仓位管理）**
仓位管理决定了策略的风险特征，往往比信号本身更重要。

**问题4：亏损多少时离场？（止损）**
止损是保护资金的最后防线，没有止损的策略迟早会遇到毁灭性亏损。

### 四要素的类比

把策略比作一个"交易决策系统"：

- **信号**：就像交通灯，告诉你什么时候可以走
- **过滤**：就像驾驶员的判断，即使绿灯也要看看有没有行人
- **仓位**：就像你踩油门的力度，决定走多快
- **止损**：就像安全带，出事了能保住命

四个要素缺一不可。

---

## 7.2 经典策略类型

### 趋势跟踪策略

**核心逻辑**：市场存在趋势，趋势一旦形成就会延续一段时间。策略的目标是识别趋势并顺势而为。

**典型代表**：
- 均线交叉策略（本章实战）
- 突破策略（价格突破N日高点买入）
- 海龟交易法则

**优点**：
- 逻辑简单，容易理解和实现
- 在趋势明显的市场中表现出色
- 理论上没有最大亏损上限（因为顺势而为）

**缺点**：
- 在震荡市场中频繁假突破，产生大量小亏损
- 信号滞后，往往在趋势已经走了一段后才入场
- 胜率通常较低（30-40%），依赖少数大趋势盈利

**适合市场**：趋势明显的市场，如商品期货、加密货币的大行情阶段。

### 均值回归策略

**核心逻辑**：价格偏离均值后会回归。当价格过度上涨时做空，过度下跌时做多。

**典型代表**：
- 布林带反转策略（价格触及上轨做空，触及下轨做多）
- 统计套利（两只相关股票价差偏离时交易）
- RSI超买超卖策略

**优点**：
- 胜率较高（60-70%）
- 在震荡市场中表现出色
- 持仓时间短，资金周转快

**缺点**：
- 在趋势市场中可能持续亏损（"越跌越买，越涨越卖"）
- 单次盈利有限，但单次亏损可能很大（不对称风险）
- 需要严格的止损，否则可能遭遇"均值回归失败"的大亏损

**适合市场**：波动率较低的震荡市场，如A股的横盘整理阶段。

### 套利策略

**核心逻辑**：利用同一资产在不同市场或不同形式之间的价格差异获利。

**典型代表**：
- **期现套利**：股指期货与现货指数之间的价差套利
- **跨期套利**：同一商品不同到期月份合约之间的价差套利
- **统计套利**：利用历史上高度相关的两只股票之间的价差回归

**优点**：
- 理论上风险较低（对冲了市场方向风险）
- 收益相对稳定

**缺点**：
- 套利机会越来越少，竞争激烈
- 需要较大资金量才能覆盖交易成本
- 极端情况下（如流动性危机）套利可能失败

---

## 7.3 策略逻辑的代码化：从想法到if-else

### 策略描述的三个层次

一个策略从想法到代码，需要经历三个层次的转化：

**层次1：自然语言描述**
"当短期均线上穿长期均线时买入，下穿时卖出"

**层次2：精确的逻辑描述**
```
条件1（买入）：
  - 今天的MA5 > 今天的MA20
  - 昨天的MA5 <= 昨天的MA20
  - 当前没有持仓
  - 执行：用全部可用资金买入

条件2（卖出）：
  - 今天的MA5 < 今天的MA20
  - 昨天的MA5 >= 昨天的MA20
  - 当前有持仓
  - 执行：卖出全部持仓
```

**层次3：Python代码**
```python
# 检测金叉（今天MA5>MA20，昨天MA5<=MA20）
golden_cross = (df['MA5'] > df['MA20']) & (df['MA5'].shift(1) <= df['MA20'].shift(1))

# 检测死叉（今天MA5<MA20，昨天MA5>=MA20）
death_cross = (df['MA5'] < df['MA20']) & (df['MA5'].shift(1) >= df['MA20'].shift(1))
```

### 常见的策略逻辑模式

```python
import pandas as pd
import numpy as np

def generate_signals(df, short_window=5, long_window=20):
    """
    生成交易信号
    返回包含信号列的DataFrame
    signal = 1: 买入信号
    signal = -1: 卖出信号
    signal = 0: 无操作
    """
    df = df.copy()
    
    # 计算均线
    df['MA_short'] = df['close'].rolling(short_window).mean()
    df['MA_long']  = df['close'].rolling(long_window).mean()
    
    # 初始化信号列
    df['signal'] = 0
    
    # 金叉：买入信号
    golden_cross = (
        (df['MA_short'] > df['MA_long']) &
        (df['MA_short'].shift(1) <= df['MA_long'].shift(1))
    )
    df.loc[golden_cross, 'signal'] = 1
    
    # 死叉：卖出信号
    death_cross = (
        (df['MA_short'] < df['MA_long']) &
        (df['MA_short'].shift(1) >= df['MA_long'].shift(1))
    )
    df.loc[death_cross, 'signal'] = -1
    
    return df


def add_filters(df, volume_threshold=1.2):
    """
    添加过滤条件：只在成交量放大时执行信号
    volume_threshold: 成交量需要超过20日均量的倍数
    """
    df = df.copy()
    
    # 计算20日平均成交量
    df['avg_volume'] = df['volume'].rolling(20).mean()
    
    # 过滤条件：成交量需要超过均量的1.2倍
    volume_filter = df['volume'] > df['avg_volume'] * volume_threshold
    
    # 只保留满足过滤条件的信号
    df.loc[~volume_filter, 'signal'] = 0
    
    return df


def add_position_sizing(df, capital=100000, risk_per_trade=0.02):
    """
    仓位管理：固定风险仓位法
    每笔交易的最大亏损不超过总资金的2%
    """
    df = df.copy()
    df['position_size'] = 0.0
    
    for i in range(len(df)):
        if df['signal'].iloc[i] == 1:  # 买入信号
            # 简化版：买入固定比例的资金
            df['position_size'].iloc[i] = capital * 0.95  # 用95%的资金买入
    
    return df


def add_stop_loss(df, stop_loss_pct=0.05):
    """
    添加止损逻辑：亏损超过5%时强制止损
    """
    df = df.copy()
    df['stop_loss_triggered'] = False
    
    entry_price = None
    
    for i in range(len(df)):
        if df['signal'].iloc[i] == 1:  # 买入
            entry_price = df['close'].iloc[i]
        
        elif entry_price is not None:  # 持仓中
            current_loss = (df['close'].iloc[i] - entry_price) / entry_price
            
            if current_loss < -stop_loss_pct:  # 亏损超过止损线
                df['stop_loss_triggered'].iloc[i] = True
                df['signal'].iloc[i] = -1  # 强制卖出
                entry_price = None
        
        if df['signal'].iloc[i] == -1:  # 卖出
            entry_price = None
    
    return df
```

---

## 7.4 用AI头脑风暴策略：让AI提出策略思路并评估可行性

### AI在策略设计中的角色

AI在策略设计阶段最有价值的用途是：
1. **提出策略假设**：基于你描述的市场观察，AI可以提出多个策略思路
2. **评估逻辑可行性**：AI可以从多个角度分析策略的潜在问题
3. **帮助完善细节**：信号、过滤、仓位、止损的具体参数设置

**示例提示词——策略头脑风暴**：

```
我观察到A股市场有以下现象：
1. 每年春节前后，消费类股票往往有一波上涨行情
2. 大盘在成交量萎缩时往往处于底部区域
3. 某些股票在公布业绩预告后会有明显的价格反应

请基于这些观察，帮我提出3个可能的量化策略思路。
对于每个策略，请说明：
1. 策略的核心逻辑
2. 需要哪些数据
3. 主要的风险点
4. 大概的预期胜率和盈亏比
5. 这个策略在A股市场是否有先例或学术支持
```

**示例提示词——策略可行性评估**：

```
我想设计以下量化策略，请帮我评估可行性：

策略名称：成交量突破策略
策略逻辑：
- 当某只股票的成交量突然放大到过去20日平均成交量的3倍以上时
- 同时价格上涨超过2%
- 买入该股票，持有5个交易日后卖出

请从以下角度评估：
1. 这个策略的市场逻辑是否合理？
2. 有哪些明显的缺陷或风险？
3. 在A股市场，这类策略历史上是否有效？
4. 如何改进这个策略？
5. 实现这个策略需要哪些数据和技术？
```

### 策略评估的框架

在AI给出策略建议后，用以下框架自己评估：

```
策略评估清单：
□ 策略逻辑是否有清晰的经济学解释？
□ 信号是否明确，没有模糊地带？
□ 是否考虑了交易成本（手续费、滑点）？
□ 是否有止损机制？
□ 策略在不同市场环境下（牛市/熊市/震荡市）的预期表现如何？
□ 策略是否依赖特定的市场条件（如高流动性）？
□ 策略的容量如何（能承载多大的资金规模）？
```

---

## 7.5 策略文档化：如何记录和管理你的策略想法

### 为什么要文档化？

量化研究是一个长期积累的过程。你会有很多策略想法，大多数会被否定，少数会被验证有效。如果不做记录，好的想法会被遗忘，坏的想法会被重复研究。

### 策略文档模板

```markdown
# 策略名称：[策略名]

## 基本信息
- 创建日期：YYYY-MM-DD
- 策略类型：趋势跟踪 / 均值回归 / 套利
- 适用市场：A股 / 期货 / 加密货币
- 时间周期：日线 / 小时线 / 分钟线
- 当前状态：想法 / 开发中 / 回测中 / 模拟盘 / 实盘

## 策略逻辑
### 核心假设
[这个策略为什么应该有效？背后的市场逻辑是什么？]

### 信号
- 买入条件：[精确描述]
- 卖出条件：[精确描述]

### 过滤条件
[哪些情况下不执行信号？]

### 仓位管理
[每次交易用多少资金？]

### 止损规则
[什么情况下强制止损？]

## 回测结果
| 时间段 | 年化收益 | 最大回撤 | 夏普比率 | 胜率 |
|--------|---------|---------|---------|------|
| 2020-2023 | - | - | - | - |

## 问题与改进
- [发现的问题1]
- [改进方向1]

## 参考资料
- [相关论文或文章]
```

---

## 实战练习：用AI辅助设计双均线交叉策略，写出完整逻辑

### 练习目标

通过完整实现一个双均线策略，掌握从策略想法到可运行代码的完整流程。

### 步骤1：用AI完善策略设计

将以下提示词发给AI：

```
我想设计一个双均线交叉策略，基本逻辑是：
- 5日均线上穿20日均线时买入
- 5日均线下穿20日均线时卖出

请帮我完善这个策略，具体包括：
1. 建议添加哪些过滤条件来减少假信号？
2. 仓位管理应该如何设计？（全仓还是分批建仓？）
3. 止损应该设在哪里？（固定比例止损还是均线止损？）
4. 这个策略在A股市场的历史表现如何？有哪些已知的缺陷？
5. 给出完整的策略参数建议
```

### 步骤2：实现完整策略代码

```python
import pandas as pd
import numpy as np
import akshare as ak
import matplotlib.pyplot as plt
import matplotlib
matplotlib.rcParams['font.sans-serif'] = ['SimHei']
matplotlib.rcParams['axes.unicode_minus'] = False

class DoubleMACrossStrategy:
    """
    双均线交叉策略
    包含完整的信号、过滤、仓位、止损四要素
    """
    
    def __init__(self, short_window=5, long_window=20,
                 stop_loss_pct=0.05, volume_filter=True):
        self.short_window = short_window
        self.long_window  = long_window
        self.stop_loss_pct = stop_loss_pct
        self.volume_filter = volume_filter
    
    def prepare_data(self, df):
        """计算策略所需的所有指标"""
        df = df.copy()
        
        # 均线
        df['MA_short'] = df['close'].rolling(self.short_window).mean()
        df['MA_long']  = df['close'].rolling(self.long_window).mean()
        
        # 成交量均线（用于过滤）
        df['vol_ma20'] = df['volume'].rolling(20).mean()
        
        # 日收益率
        df['daily_return'] = df['close'].pct_change()
        
        return df
    
    def generate_signals(self, df):
        """生成原始交易信号"""
        df = df.copy()
        df['raw_signal'] = 0
        
        # 金叉信号
        golden = (df['MA_short'] > df['MA_long']) & \
                 (df['MA_short'].shift(1) <= df['MA_long'].shift(1))
        df.loc[golden, 'raw_signal'] = 1
        
        # 死叉信号
        death = (df['MA_short'] < df['MA_long']) & \
                (df['MA_short'].shift(1) >= df['MA_long'].shift(1))
        df.loc[death, 'raw_signal'] = -1
        
        return df
    
    def apply_filters(self, df):
        """应用过滤条件"""
        df = df.copy()
        df['signal'] = df['raw_signal'].copy()
        
        if self.volume_filter:
            # 过滤：买入信号需要成交量放大（超过20日均量的1.2倍）
            low_volume = df['volume'] < df['vol_ma20'] * 1.2
            df.loc[(df['signal'] == 1) & low_volume, 'signal'] = 0
        
        return df
    
    def run(self, df):
        """运行完整策略，返回带信号的DataFrame"""
        df = self.prepare_data(df)
        df = self.generate_signals(df)
        df = self.apply_filters(df)
        return df
    
    def describe(self):
        """打印策略描述"""
        print(f"策略：双均线交叉")
        print(f"  短期均线：{self.short_window}日")
        print(f"  长期均线：{self.long_window}日")
        print(f"  止损比例：{self.stop_loss_pct*100:.0f}%")
        print(f"  成交量过滤：{'开启' if self.volume_filter else '关闭'}")


def visualize_strategy(df, title='双均线策略信号'):
    """可视化策略信号"""
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(14, 8), sharex=True)
    
    # 价格和均线
    ax1.plot(df.index, df['close'],    label='收盘价', color='black', linewidth=1)
    ax1.plot(df.index, df['MA_short'], label=f'MA{5}',  color='blue',  linewidth=1.2)
    ax1.plot(df.index, df['MA_long'],  label=f'MA{20}', color='red',   linewidth=1.2)
    
    # 标注买卖点
    buy_signals  = df[df['signal'] == 1]
    sell_signals = df[df['signal'] == -1]
    
    ax1.scatter(buy_signals.index,  buy_signals['close'],
                marker='^', color='red',   s=100, zorder=5, label='买入信号')
    ax1.scatter(sell_signals.index, sell_signals['close'],
                marker='v', color='green', s=100, zorder=5, label='卖出信号')
    
    ax1.set_title(title, fontsize=13)
    ax1.legend(loc='upper left')
    ax1.grid(True, alpha=0.3)
    
    # 成交量
    colors = ['red' if c >= o else 'green'
              for c, o in zip(df['close'], df['open'])]
    ax2.bar(df.index, df['volume'], color=colors, alpha=0.7)
    ax2.plot(df.index, df['vol_ma20'], color='orange',
             linewidth=1.2, label='20日均量')
    ax2.set_title('成交量')
    ax2.legend()
    ax2.grid(True, alpha=0.3)
    
    plt.tight_layout()
    plt.savefig('strategy_signals.png', dpi=150)
    plt.show()
    print("图表已保存为 strategy_signals.png")


# 主程序
if __name__ == '__main__':
    # 获取数据
    print("正在获取数据...")
    df = ak.stock_zh_a_hist(
        symbol="000001", period="daily",
        start_date="20220101", end_date="20231231", adjust="qfq"
    )
    df = df.rename(columns={
        '日期':'date','开盘':'open','收盘':'close',
        '最高':'high','最低':'low','成交量':'volume'
    })
    df['date'] = pd.to_datetime(df['date'])
    df.set_index('date', inplace=True)
    df = df[['open','high','low','close','volume']].astype(float)
    
    # 运行策略
    strategy = DoubleMACrossStrategy(
        short_window=5, long_window=20,
        stop_loss_pct=0.05, volume_filter=True
    )
    strategy.describe()
    
    df_result = strategy.run(df)
    
    # 统计信号
    buy_count  = (df_result['signal'] == 1).sum()
    sell_count = (df_result['signal'] == -1).sum()
    print(f"\n信号统计：")
    print(f"  买入信号：{buy_count} 次")
    print(f"  卖出信号：{sell_count} 次")
    
    # 可视化
    visualize_strategy(df_result, '平安银行 双均线策略（2022-2023）')
```

### 步骤3：用AI分析策略结果

运行代码后，将结果发给AI：

```
我实现了一个双均线策略（MA5/MA20），在平安银行2022-2023年的数据上运行，
得到了以下结果：
- 买入信号：X次
- 卖出信号：X次
- 从图表上看，[描述你观察到的现象，如"大部分买入信号出现在上涨趋势中"
  或"有几次明显的假信号"]

请帮我分析：
1. 这个策略的信号质量如何？
2. 从图表上能看出哪些明显的问题？
3. 成交量过滤条件是否有效地减少了假信号？
4. 下一步应该如何改进这个策略？
```

---

## 常见问题 Q&A

**Q1：为什么课程强调“先写策略文档，再写代码”？**

A：因为很多人以为自己在设计策略，其实是在边写边猜。先把信号、过滤、仓位、止损写清楚，可以强迫你把模糊想法变成可测试规则，减少后面不断改口径的问题。

**Q2：一个策略逻辑看起来很合理，是不是就值得回测？**

A：值得回测，但不能因为“听起来合理”就默认它会有效。市场上很多失败策略的问题不在于故事讲不通，而在于优势太小、太拥挤、太依赖特定环境，回测是用来验证这些问题的。

**Q3：AI 提出的策略想法很多，我该怎么筛选？**

A：先按三个维度过滤：是否能拿到数据、规则是否可明确编码、风险边界是否说得清。过不了这三关的思路，再新颖也不适合立刻进入实作。

---

## 本章小结

本章我们掌握了量化策略设计的完整框架：

- **四要素**：信号、过滤、仓位、止损缺一不可。很多初学者只关注信号，忽略了其他三个要素
- **策略类型**：趋势跟踪适合趋势市，均值回归适合震荡市，套利风险最低但机会最少
- **代码化**：策略从自然语言到精确逻辑描述再到代码，需要三个层次的转化
- **AI辅助**：AI可以帮你头脑风暴策略思路、评估可行性，但策略的核心逻辑必须自己理解
- **文档化**：建立策略文档库，记录每个策略的设计思路、回测结果和改进方向

---

## 课后思考题

1. 双均线策略在震荡市场中会频繁产生假信号，导致连续小亏损。你能想到哪些方法来识别当前市场是趋势市还是震荡市，并据此决定是否运行策略？

2. 仓位管理对策略表现的影响往往比信号本身更大。请比较以下三种仓位管理方式的优缺点：（a）每次全仓买入；（b）每次固定金额买入；（c）根据波动率动态调整仓位。

3. 如果你的策略在回测中表现很好，但在模拟盘中表现明显变差，可能是什么原因？请列出至少3个可能的原因，并说明如何排查。
