# 第13章：风险管理体系

## 学习目标

1. 理解风险管理在量化交易中的核心地位，建立"保住本金"的思维
2. 掌握固定比例、凯利公式、波动率调整三种仓位管理方法
3. 学会设计固定止损、ATR止损、追踪止损三种止损策略
4. 理解组合层面的风险控制：相关性、集中度、最大回撤
5. 能用AI辅助分析策略的风险暴露，并为策略添加完整的风险管理模块

---

## 13.1 风险管理的核心理念：保住本金才能持续盈利

很多初学者把量化交易的目标设定为"最大化收益"，这是一个危险的出发点。

**正确的目标应该是：在可接受的风险范围内，获取稳定的收益。**

**为什么保住本金比追求高收益更重要？**

数学上有一个残酷的事实：亏损50%之后，需要盈利100%才能回到原点。亏损越大，回本越难。

| 亏损幅度 | 需要盈利多少才能回本 |
|---------|-----------------|
| 10%     | 11.1%           |
| 20%     | 25%             |
| 30%     | 42.9%           |
| 50%     | 100%            |
| 70%     | 233%            |

**类比：** 量化交易就像开车。好的司机不是开得最快的，而是能安全到达目的地的。偶尔超速可能快一点，但一次严重事故就可能让你永远无法继续上路。

**风险管理的三个层次：**

1. **单笔交易层面**：每笔交易最多亏多少？（止损）
2. **单只股票层面**：单只股票最多持有多少仓位？（仓位管理）
3. **整体组合层面**：整个账户最多回撤多少？（组合风控）

在专业团队里，风险管理还会再往上加一层：**风险预算治理**。也就是先决定“这套策略一个月、一季度、全年最多允许消耗多少风险预算”，再把预算分配到行业暴露、单票暴露、杠杆暴露和回撤容忍度上。

---

## 13.2 仓位管理方法：固定比例、凯利公式、波动率调整

**方法1：固定比例法（最简单）**

每笔交易固定使用总资金的N%。比如每笔交易用5%的资金，最多同时持有20只股票。

优点：简单易懂，不会因为单笔交易损失太多。
缺点：没有考虑不同交易的风险差异。

```python
def fixed_fraction_position(total_capital: float, 
                              fraction: float = 0.05) -> float:
    """
    固定比例仓位计算
    
    total_capital: 总资金
    fraction: 每笔交易使用的资金比例
    返回：本次交易使用的资金量
    """
    return total_capital * fraction
```

**方法2：凯利公式（理论最优）**

凯利公式给出了在已知胜率和赔率的情况下，理论上最优的仓位比例。

公式：`f = (bp - q) / b`

其中：
- `f`：应该投入的资金比例
- `b`：赔率（赢时赚多少倍）
- `p`：胜率
- `q = 1 - p`：败率

```python
def kelly_criterion(win_rate: float, avg_win: float, avg_loss: float,
                     kelly_fraction: float = 0.5) -> float:
    """
    凯利公式仓位计算
    
    win_rate: 胜率（0-1）
    avg_win: 平均盈利（相对值，如0.05表示5%）
    avg_loss: 平均亏损（正数，如0.03表示亏3%）
    kelly_fraction: 凯利分数（通常用半凯利0.5，更保守）
    
    返回：建议的仓位比例
    """
    if avg_loss == 0:
        return 0
    
    b = avg_win / avg_loss  # 赔率
    p = win_rate
    q = 1 - win_rate
    
    kelly = (b * p - q) / b
    
    # 使用半凯利，更保守
    adjusted_kelly = kelly * kelly_fraction
    
    # 限制最大仓位
    return max(0, min(adjusted_kelly, 0.25))  # 最大25%

# 示例：胜率55%，平均盈利3%，平均亏损2%
position = kelly_criterion(win_rate=0.55, avg_win=0.03, avg_loss=0.02)
print(f"凯利公式建议仓位：{position:.2%}")
```

**方法3：波动率调整仓位（最实用）**

根据股票的波动率动态调整仓位——波动率高的股票少买，波动率低的股票多买，使每笔交易的风险金额大致相同。

```python
def volatility_adjusted_position(total_capital: float,
                                   stock_volatility: float,
                                   target_risk_pct: float = 0.01) -> float:
    """
    波动率调整仓位
    
    total_capital: 总资金
    stock_volatility: 股票的日波动率（标准差）
    target_risk_pct: 每笔交易愿意承担的风险占总资金的比例
    
    返回：建议的持仓市值
    """
    # 目标风险金额
    target_risk_amount = total_capital * target_risk_pct
    
    # 仓位 = 目标风险金额 / 股票日波动率
    # 逻辑：如果股票每天波动2%，我愿意承担1000元风险，
    # 那么我应该持有 1000/0.02 = 50000元的仓位
    position_value = target_risk_amount / stock_volatility
    
    # 限制单只股票最大仓位为总资金的20%
    max_position = total_capital * 0.20
    return min(position_value, max_position)

# 示例
total_capital = 1_000_000  # 100万
stock_vol = 0.025  # 日波动率2.5%
position = volatility_adjusted_position(total_capital, stock_vol)
print(f"建议持仓市值：{position:,.0f} 元（占总资金 {position/total_capital:.1%}）")
```

### 仓位管理的实务约束

公式只能给你理论起点，真正执行时还要叠加几条“交易桌规则”：

1. **单笔上限**：单只股票仓位通常不超过账户资金的 5%-10%。
2. **行业上限**：同一行业总暴露要有限制，避免相关性集中。
3. **流动性上限**：你的成交量不能显著影响市场价格，常见要求是不超过个股日均成交额的一定比例。
4. **杠杆上限**：即便策略历史上有效，也不能默认无限放大仓位。

如果只按凯利公式或波动率公式机械下单，而不加这些业务约束，回测和实盘之间往往会出现巨大偏差。

---

## 13.3 止损策略：固定止损、ATR止损、追踪止损

止损是风险管理中最重要的工具。没有止损的策略，就像没有安全带的赛车。

**方法1：固定止损**

买入后，价格下跌超过固定比例（如5%）就止损。

```python
def fixed_stop_loss(entry_price: float, stop_pct: float = 0.05) -> float:
    """固定比例止损价格"""
    return entry_price * (1 - stop_pct)
```

优点：简单直观。缺点：没有考虑股票本身的波动特性，对高波动股票可能止损太频繁。

**方法2：ATR止损（最推荐）**

ATR（Average True Range，平均真实波幅）衡量股票的正常波动范围。ATR止损根据股票自身的波动性设置止损距离，更加科学。

```python
def calculate_atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    """
    计算ATR（平均真实波幅）
    
    True Range = max(高-低, |高-昨收|, |低-昨收|)
    ATR = True Range的N日移动平均
    """
    df = df.copy()
    df['prev_close'] = df['close'].shift(1)
    
    df['tr'] = df[['high', 'low', 'prev_close']].apply(
        lambda row: max(
            row['high'] - row['low'],
            abs(row['high'] - row['prev_close']),
            abs(row['low'] - row['prev_close'])
        ), axis=1
    )
    
    df['atr'] = df['tr'].rolling(period).mean()
    return df['atr']


def atr_stop_loss(entry_price: float, current_atr: float, 
                   multiplier: float = 2.0) -> float:
    """
    ATR止损价格
    
    entry_price: 买入价格
    current_atr: 当前ATR值
    multiplier: ATR倍数（通常1.5-3倍）
    """
    stop_distance = current_atr * multiplier
    return entry_price - stop_distance
```

**方法3：追踪止损**

随着价格上涨，止损价格也跟着上移，锁定已有利润。

```python
class TrailingStopLoss:
    """追踪止损管理器"""
    
    def __init__(self, entry_price: float, trail_pct: float = 0.08):
        """
        entry_price: 买入价格
        trail_pct: 追踪止损比例（从最高价回撤多少止损）
        """
        self.entry_price = entry_price
        self.trail_pct = trail_pct
        self.highest_price = entry_price
        self.stop_price = entry_price * (1 - trail_pct)
    
    def update(self, current_price: float) -> tuple:
        """
        更新追踪止损
        
        返回：(是否触发止损, 当前止损价格)
        """
        # 更新最高价
        if current_price > self.highest_price:
            self.highest_price = current_price
            # 止损价格跟随上移
            self.stop_price = self.highest_price * (1 - self.trail_pct)
        
        # 检查是否触发止损
        triggered = current_price <= self.stop_price
        return triggered, self.stop_price

# 使用示例
stop = TrailingStopLoss(entry_price=100, trail_pct=0.08)
prices = [100, 105, 110, 108, 115, 112, 106, 103]

for price in prices:
    triggered, stop_price = stop.update(price)
    print(f"价格: {price:.1f}, 止损价: {stop_price:.2f}, 触发: {triggered}")
    if triggered:
        print("  → 止损触发，平仓！")
        break
```

---

## 13.4 组合风险：相关性、集中度、最大回撤控制

单只股票的风险管理只是第一步，组合层面的风险同样重要。

**相关性控制**

如果你持有的10只股票都是银行股，它们高度相关，实际上等于把所有鸡蛋放在一个篮子里。

```python
import numpy as np

def check_portfolio_correlation(returns_df: pd.DataFrame, 
                                  threshold: float = 0.7) -> list:
    """
    检查组合中的高相关性股票对
    
    returns_df: 各股票的日收益率DataFrame，列名为股票代码
    threshold: 相关性阈值，超过此值视为高相关
    """
    corr_matrix = returns_df.corr()
    high_corr_pairs = []
    
    stocks = corr_matrix.columns.tolist()
    for i in range(len(stocks)):
        for j in range(i+1, len(stocks)):
            corr = corr_matrix.iloc[i, j]
            if abs(corr) > threshold:
                high_corr_pairs.append({
                    'stock1': stocks[i],
                    'stock2': stocks[j],
                    'correlation': round(corr, 4)
                })
    
    return sorted(high_corr_pairs, key=lambda x: abs(x['correlation']), reverse=True)
```

**最大回撤控制**

设置账户级别的最大回撤限制，一旦触及就强制减仓或停止交易。

```python
class DrawdownController:
    """账户回撤控制器"""
    
    def __init__(self, initial_capital: float, max_drawdown: float = 0.15):
        """
        initial_capital: 初始资金
        max_drawdown: 最大允许回撤（如0.15表示15%）
        """
        self.initial_capital = initial_capital
        self.max_drawdown = max_drawdown
        self.peak_value = initial_capital
        self.is_trading_halted = False
    
    def update(self, current_value: float) -> dict:
        """
        更新账户价值，检查是否触发回撤限制
        
        返回：状态信息
        """
        # 更新峰值
        if current_value > self.peak_value:
            self.peak_value = current_value
        
        # 计算当前回撤
        current_drawdown = (self.peak_value - current_value) / self.peak_value
        
        # 检查是否触发限制
        if current_drawdown >= self.max_drawdown and not self.is_trading_halted:
            self.is_trading_halted = True
            print(f"警告：账户回撤达到 {current_drawdown:.2%}，超过限制 {self.max_drawdown:.2%}")
            print("建议：暂停交易，检查策略")
        
        return {
            'current_value': current_value,
            'peak_value': self.peak_value,
            'current_drawdown': current_drawdown,
            'is_trading_halted': self.is_trading_halted,
            'remaining_risk_budget': max(0, self.max_drawdown - current_drawdown)
        }
```

---

### 13.5 风险预算与停机规则

成熟策略不只是“亏了就止损”，而是预先定义好什么时候减仓、什么时候停机、什么时候重新开放。

一个可执行的风险预算模板通常包含：

| 层级 | 常见规则 |
|------|----------|
| 单笔交易 | 单笔最大亏损不超过账户 0.5%-1% |
| 单日组合 | 单日总亏损超过 2% 触发减仓 |
| 周度策略 | 周度回撤超过 4%-5% 暂停新增仓位 |
| 月度策略 | 月度回撤超过 8%-10% 启动复盘，不得继续加杠杆 |
| 年度账户 | 年度最大回撤超过红线后，策略进入停机审查 |

这背后的原则是：**先止血，再诊断，再恢复**。不要边亏边“相信模型会回来”。

建议把停机规则写成硬条件，而不是主观判断，例如：

```text
若组合从历史高点回撤 >= 12%
    -> 停止所有新开仓
    -> 只允许平仓，不允许加仓
    -> 进入人工复盘流程
```

这样做的价值不是让你永远不亏，而是在错误持续扩大之前，把损失封顶。

## 13.6 用AI辅助风险评估：让AI分析策略的风险暴露

```
提示词：策略风险评估

我有一个量化策略，请帮我全面评估其风险暴露：

策略描述：
- 策略类型：A股动量策略
- 持仓数量：20只股票
- 调仓频率：月度
- 持仓集中度：单只股票最大5%
- 止损设置：无

回测统计：
- 年化收益：22%
- 最大回撤：18%
- 夏普比率：1.4
- 月度胜率：62%

请从以下维度评估风险：
1. 市场风险（Beta暴露、行业集中度）
2. 流动性风险（小市值股票比例、换手率）
3. 模型风险（过拟合可能性、参数稳定性）
4. 操作风险（执行滑点、系统故障）
5. 尾部风险（极端行情下的表现）

请给出每个维度的风险等级（低/中/高）和具体改进建议。
```

---

## 13.7 压力测试：模拟极端市场情况

```python
def stress_test(strategy_returns: pd.Series, 
                 scenarios: dict = None) -> pd.DataFrame:
    """
    压力测试：模拟极端市场情况下的策略表现
    
    strategy_returns: 策略日收益率序列
    scenarios: 压力测试场景
    """
    if scenarios is None:
        scenarios = {
            "2008金融危机": {"market_drop": -0.50, "duration_days": 252},
            "2015股灾": {"market_drop": -0.40, "duration_days": 60},
            "2020新冠暴跌": {"market_drop": -0.35, "duration_days": 30},
            "极端单日暴跌": {"market_drop": -0.10, "duration_days": 1},
        }
    
    results = []
    
    # 计算策略的市场Beta（简化版）
    # 实际应该用市场指数收益率回归
    strategy_vol = strategy_returns.std()
    
    for scenario_name, params in scenarios.items():
        market_drop = params["market_drop"]
        duration = params["duration_days"]
        
        # 假设策略Beta为0.8（比市场波动小20%）
        beta = 0.8
        estimated_strategy_loss = market_drop * beta
        
        # 计算恢复时间（基于历史平均收益率）
        daily_return = strategy_returns.mean()
        if daily_return > 0:
            recovery_days = abs(estimated_strategy_loss) / daily_return
        else:
            recovery_days = float('inf')
        
        results.append({
            '场景': scenario_name,
            '市场跌幅': f"{market_drop:.0%}",
            '预估策略损失': f"{estimated_strategy_loss:.1%}",
            '预估恢复天数': f"{recovery_days:.0f}天" if recovery_days != float('inf') else "无法恢复",
            '风险等级': '高' if abs(estimated_strategy_loss) > 0.20 else '中' if abs(estimated_strategy_loss) > 0.10 else '低'
        })
    
    return pd.DataFrame(results)
```

### 压力测试不要只测“市场暴跌”

专业一点的压力测试至少要覆盖四种场景：

1. **方向性冲击**：指数单日暴跌、连续阴跌、快速反弹
2. **波动率冲击**：价格没大跌，但日内振幅突然放大
3. **流动性冲击**：买卖价差扩大、成交量骤降、无法按计划成交
4. **制度性冲击**：涨跌停、停牌、规则变化、关键数据源失效

许多策略不是死在“看错方向”，而是死在“需要退出时退出不了”。

## 13.8 极端情况下的人工接管流程

再自动化的系统，也必须定义人工接管边界。典型触发条件包括：

- 连续多笔异常亏损，超过日内阈值
- 市场突发事件导致模型输入失真
- 数据源缺失或延迟
- 风险监控模块本身报错

一个最小可用的人工接管流程是：

1. 系统自动停新单
2. 向负责人发送高优先级告警
3. 输出当前持仓、未成交订单、风险暴露摘要
4. 由人工决定是减仓、清仓还是恢复运行
5. 事后形成书面复盘

很多初学者只学“怎么让系统自动跑起来”，但职业化交易更看重“出问题时怎么有序地停下来”。

---

## 实战练习：为已有策略添加完整的风险管理模块

### 目标
为第9章的随机森林策略添加完整的风险管理模块，包括仓位管理、止损和组合风控。

### 完整风险管理模块代码

```python
import pandas as pd
import numpy as np
from dataclasses import dataclass
from typing import Dict, List, Optional

@dataclass
class RiskConfig:
    """风险管理配置"""
    max_position_pct: float = 0.05      # 单只股票最大仓位5%
    max_drawdown: float = 0.15          # 最大回撤15%
    stop_loss_atr_multiplier: float = 2.0  # ATR止损倍数
    target_daily_risk: float = 0.01     # 每日目标风险1%
    max_sector_concentration: float = 0.30  # 单行业最大集中度30%
    min_cash_reserve: float = 0.10      # 最低现金储备10%


class RiskManager:
    """完整的风险管理模块"""
    
    def __init__(self, total_capital: float, config: RiskConfig = None):
        self.total_capital = total_capital
        self.current_capital = total_capital
        self.config = config or RiskConfig()
        self.peak_capital = total_capital
        self.positions: Dict[str, dict] = {}  # 当前持仓
        self.trade_log: List[dict] = []
    
    def calculate_position_size(self, stock_code: str, 
                                  entry_price: float,
                                  stock_atr: float) -> dict:
        """
        计算建仓数量
        
        返回：建议的持仓信息
        """
        # 方法：波动率调整仓位
        target_risk_amount = self.current_capital * self.config.target_daily_risk
        position_value = target_risk_amount / (stock_atr / entry_price)
        
        # 限制最大仓位
        max_position_value = self.current_capital * self.config.max_position_pct
        position_value = min(position_value, max_position_value)
        
        # 计算股数（向下取整到100股的整数倍，A股最小交易单位）
        shares = int(position_value / entry_price / 100) * 100
        actual_value = shares * entry_price
        
        # 计算止损价格
        stop_price = entry_price - stock_atr * self.config.stop_loss_atr_multiplier
        
        return {
            'stock_code': stock_code,
            'entry_price': entry_price,
            'shares': shares,
            'position_value': actual_value,
            'position_pct': actual_value / self.current_capital,
            'stop_price': stop_price,
            'atr': stock_atr
        }
    
    def check_portfolio_risk(self) -> dict:
        """检查组合整体风险"""
        if not self.positions:
            return {'status': 'ok', 'issues': []}
        
        issues = []
        
        # 检查总仓位
        total_position_value = sum(p['position_value'] for p in self.positions.values())
        total_position_pct = total_position_value / self.current_capital
        
        if total_position_pct > (1 - self.config.min_cash_reserve):
            issues.append(f"总仓位过高：{total_position_pct:.1%}，现金不足{self.config.min_cash_reserve:.0%}")
        
        # 检查回撤
        current_drawdown = (self.peak_capital - self.current_capital) / self.peak_capital
        if current_drawdown > self.config.max_drawdown:
            issues.append(f"回撤超限：当前回撤{current_drawdown:.1%}，限制{self.config.max_drawdown:.1%}")
        
        return {
            'status': 'warning' if issues else 'ok',
            'issues': issues,
            'total_position_pct': total_position_pct,
            'current_drawdown': current_drawdown,
            'n_positions': len(self.positions)
        }
    
    def should_stop_trading(self) -> bool:
        """判断是否应该暂停交易"""
        current_drawdown = (self.peak_capital - self.current_capital) / self.peak_capital
        return current_drawdown >= self.config.max_drawdown
    
    def update_capital(self, new_capital: float):
        """更新账户价值"""
        self.current_capital = new_capital
        if new_capital > self.peak_capital:
            self.peak_capital = new_capital


# 使用示例
config = RiskConfig(
    max_position_pct=0.05,
    max_drawdown=0.15,
    stop_loss_atr_multiplier=2.0
)

risk_mgr = RiskManager(total_capital=1_000_000, config=config)

# 计算某只股票的建仓数量
position_info = risk_mgr.calculate_position_size(
    stock_code="600519",
    entry_price=1800.0,
    stock_atr=45.0  # ATR = 45元
)

print("建仓建议：")
for key, value in position_info.items():
    if isinstance(value, float):
        print(f"  {key}: {value:.4f}")
    else:
        print(f"  {key}: {value}")

# 检查组合风险
risk_status = risk_mgr.check_portfolio_risk()
print(f"\n组合风险状态：{risk_status['status']}")
if risk_status['issues']:
    for issue in risk_status['issues']:
        print(f"  警告：{issue}")
```

---

## 常见问题 Q&A

**Q1：为什么很多课程都把风险管理放在后面，但实战里却说它最重要？**

A：因为学习顺序通常是先理解“怎么赚钱”，再理解“怎么不死”；但实盘顺序恰好相反。没有风险管理，再好的策略也可能因为一次失控仓位或极端行情被彻底打穿。

**Q2：止损是不是设得越紧越安全？**

A：不一定。止损过紧会让你在正常波动里频繁被甩出去，最终把交易成本和噪音损失累积得很高。好的止损不是“越小越好”，而是与策略周期、波动特征和仓位规模匹配。

**Q3：仓位管理和选股/择时哪个更重要？**

A：三者都重要，但仓位管理往往决定你能否长期存活。很多策略不是方向完全错，而是一次下太重、连续亏损后失去继续验证策略的机会。

---

## 本章小结

风险管理是量化交易中最重要但最容易被忽视的部分。本章从单笔交易的止损、单只股票的仓位管理，到整体组合的回撤控制，构建了一个完整的三层风险管理体系。核心原则是：先定义你能承受的最大损失，再根据这个限制来决定仓位大小，而不是反过来。AI可以帮助分析策略的风险暴露，但风险管理的最终决策必须由人来做。

继续往专业实践推进，还要补上风险预算、停机规则、压力测试和人工接管机制。真正成熟的风控体系，不是“平时赚钱的时候看起来很聪明”，而是在极端情况下仍然有明确边界和纪律。

---

## 课后思考题

1. 凯利公式给出的是理论最优仓位，但实际使用时通常只用"半凯利"甚至"四分之一凯利"。为什么不直接用全凯利？在什么情况下全凯利会导致严重问题？

2. ATR止损的优点是根据股票自身波动性设置止损距离，但它有一个缺点：在市场整体波动率上升时（如股灾期间），ATR会变大，导致止损距离变宽，反而在最危险的时候给了最宽松的止损。你会如何改进这个问题？

3. 假设你的策略在2015年股灾期间最大回撤达到了35%，超过了你设定的15%限制。事后分析，你认为是止损设置的问题、仓位管理的问题，还是策略本身的问题？如何区分这三种情况？
