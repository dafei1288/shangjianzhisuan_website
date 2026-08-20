# 第16章：从零搭建完整量化交易系统

![第16章 完整量化交易系统题图](../visuals/chapters/ch16-hero.png)

## 学习目标

1. 理解完整量化交易系统的四层架构：数据层、策略层、执行层、监控层
2. 完成A股多因子选股系统的端到端实现（AI辅助因子挖掘）
3. 完成加密货币趋势跟踪策略的实现（含实盘接口）
4. 理解基于新闻情绪的事件驱动策略的设计思路
5. 掌握量化项目的代码规范和长期维护方法，了解进阶方向

---

## 16.1 项目架构设计：数据层、策略层、执行层、监控层

在前面15章中，我们学习了量化交易的各个模块。本章把它们整合成一个完整的系统。

#### 端到端量化系统架构图

```text
┌──────────────────────────────────────────────┐
│ 监控层 Monitoring                            │
│ 日志 / 告警 / 绩效报告 / 仪表盘               │
├──────────────────────────────────────────────┤
│ 执行层 Execution                             │
│ 下单接口 / 风控 / 仓位管理 / 调度器           │
├──────────────────────────────────────────────┤
│ 策略层 Strategy                              │
│ 因子计算 / 信号生成 / 模型预测 / 组合优化     │
├──────────────────────────────────────────────┤
│ 数据层 Data                                  │
│ 数据抓取 / 清洗 / 存储 / 特征工程             │
└──────────────────────────────────────────────┘

项目运行方向:
  Data -> Strategy -> Execution -> Monitoring
反馈闭环:
  Monitoring -> Strategy / Risk / Config 调整
```

**四层架构概览：**

```
┌─────────────────────────────────────────┐
│              监控层 (Monitoring)          │
│  实时监控 | 告警系统 | 绩效报告 | 日志    │
├─────────────────────────────────────────┤
│              执行层 (Execution)           │
│  订单管理 | 风险控制 | 仓位管理 | 接口    │
├─────────────────────────────────────────┤
│              策略层 (Strategy)            │
│  信号生成 | 因子计算 | 模型预测 | 组合优化 │
├─────────────────────────────────────────┤
│              数据层 (Data)                │
│  数据获取 | 数据清洗 | 数据存储 | 特征工程 │
└─────────────────────────────────────────┘
```

**各层的职责：**

- **数据层**：负责从各种来源获取数据，清洗、存储，并提供统一的数据接口
- **策略层**：基于数据层提供的数据，计算因子、生成交易信号
- **执行层**：接收策略层的信号，进行风险检查，然后通过券商接口执行交易
- **监控层**：实时监控系统运行状态，记录日志，发送告警

**项目目录结构：**

```
quant_system/
├── config/
│   ├── settings.py          # 全局配置
│   └── secrets.env          # API密钥（不提交到Git）
├── data/
│   ├── fetcher.py           # 数据获取
│   ├── cleaner.py           # 数据清洗
│   ├── storage.py           # 数据存储
│   └── feature_engine.py    # 特征工程
├── strategy/
│   ├── base_strategy.py     # 策略基类
│   ├── momentum.py          # 动量策略
│   ├── multi_factor.py      # 多因子策略
│   └── sentiment.py         # 情绪策略
├── execution/
│   ├── risk_manager.py      # 风险管理
│   ├── order_manager.py     # 订单管理
│   └── broker_interface.py  # 券商接口
├── monitoring/
│   ├── logger.py            # 日志系统
│   ├── alerter.py           # 告警系统
│   └── reporter.py          # 报告生成
├── backtest/
│   └── engine.py            # 回测引擎
├── tests/                   # 单元测试
└── main.py                  # 主程序入口
```

---

## 16.2 项目一：A股多因子选股系统（AI辅助因子挖掘）

多因子选股是A股量化中最成熟的方法之一。核心思路是：用多个有效因子给股票打分，选出综合得分最高的股票持有。

**AI辅助因子挖掘提示词：**

```
我要构建一个A股多因子选股系统，请帮我设计因子体系。

市场背景：A股日线数据，月度调仓，沪深300成分股

请从以下维度各推荐2-3个因子：
1. 价值因子（估值类）
2. 质量因子（盈利能力类）
3. 动量因子（价格趋势类）
4. 低波动因子（风险类）
5. 成长因子（增长类）

对每个因子请说明：
- 因子名称和计算公式
- 经济学逻辑（为什么这个因子有效？）
- 在A股的历史有效性（如果知道的话）
- Python计算代码（使用pandas）
- 注意事项（如何避免常见陷阱）
```

**完整的多因子系统实现：**

```python
import pandas as pd
import numpy as np
import akshare as ak
from scipy import stats

class MultiFactorSystem:
    """A股多因子选股系统"""
    
    def __init__(self, stock_pool: list = None):
        """
        stock_pool: 股票池，None表示使用沪深300
        """
        self.stock_pool = stock_pool
        self.factor_weights = {
            'value': 0.25,      # 价值因子权重
            'quality': 0.25,    # 质量因子权重
            'momentum': 0.20,   # 动量因子权重
            'low_vol': 0.15,    # 低波动因子权重
            'growth': 0.15      # 成长因子权重
        }
    
    def calculate_value_factor(self, df: pd.DataFrame) -> pd.Series:
        """
        价值因子：市盈率倒数（EP）
        逻辑：低估值股票长期有超额收益
        """
        # EP = 每股收益 / 股价 = 1/PE
        # 这里用简化版：用过去12个月收益率的倒数近似
        # 实际应该用财务数据中的PE
        ep = 1 / (df['pe_ratio'].replace(0, np.nan))
        return ep
    
    def calculate_quality_factor(self, df: pd.DataFrame) -> pd.Series:
        """
        质量因子：ROE（净资产收益率）
        逻辑：高ROE公司盈利能力强，长期表现好
        """
        return df['roe']
    
    def calculate_momentum_factor(self, price_df: pd.DataFrame) -> pd.Series:
        """
        动量因子：12-1月动量
        逻辑：过去表现好的股票短期内继续表现好
        """
        # 过去12个月收益率，跳过最近1个月
        ret_12m = price_df['close'].pct_change(252)  # 约252个交易日
        ret_1m = price_df['close'].pct_change(21)    # 约21个交易日
        momentum = ret_12m - ret_1m
        return momentum
    
    def calculate_low_vol_factor(self, price_df: pd.DataFrame) -> pd.Series:
        """
        低波动因子：过去20日收益率标准差的负值
        逻辑：低波动股票风险调整后收益更好（低波动异象）
        """
        daily_ret = price_df['close'].pct_change()
        vol_20d = daily_ret.rolling(20).std()
        return -vol_20d  # 取负值，使低波动股票得分高
    
    def calculate_growth_factor(self, df: pd.DataFrame) -> pd.Series:
        """
        成长因子：营收增长率
        逻辑：高增长公司未来盈利能力更强
        """
        return df['revenue_growth']
    
    def normalize_factor(self, factor: pd.Series) -> pd.Series:
        """
        因子标准化：去极值 + 标准化
        """
        # 去极值（Winsorize）：将超过3倍标准差的值截断
        mean = factor.mean()
        std = factor.std()
        factor = factor.clip(mean - 3*std, mean + 3*std)
        
        # 标准化（Z-score）
        factor = (factor - factor.mean()) / factor.std()
        return factor
    
    def calculate_composite_score(self, factors: dict) -> pd.Series:
        """
        计算综合得分
        
        factors: {'factor_name': pd.Series, ...}
        """
        composite = pd.Series(0.0, index=list(factors.values())[0].index)
        
        for factor_name, factor_series in factors.items():
            weight = self.factor_weights.get(factor_name, 0)
            normalized = self.normalize_factor(factor_series)
            composite += weight * normalized
        
        return composite
    
    def select_stocks(self, composite_score: pd.Series, 
                       top_n: int = 20) -> list:
        """
        根据综合得分选股
        
        top_n: 选取得分最高的N只股票
        """
        return composite_score.nlargest(top_n).index.tolist()


# 使用示例（简化版，实际需要完整的财务数据）
def run_multi_factor_backtest():
    """运行多因子回测"""
    print("多因子选股系统演示")
    print("=" * 40)
    
    # 模拟因子数据（实际应从财务数据库获取）
    np.random.seed(42)
    n_stocks = 100
    stock_codes = [f"stock_{i:03d}" for i in range(n_stocks)]
    
    # 模拟各因子数据
    mock_factors = {
        'value': pd.Series(np.random.randn(n_stocks), index=stock_codes),
        'quality': pd.Series(np.random.randn(n_stocks), index=stock_codes),
        'momentum': pd.Series(np.random.randn(n_stocks), index=stock_codes),
        'low_vol': pd.Series(np.random.randn(n_stocks), index=stock_codes),
        'growth': pd.Series(np.random.randn(n_stocks), index=stock_codes)
    }
    
    system = MultiFactorSystem()
    composite_score = system.calculate_composite_score(mock_factors)
    selected = system.select_stocks(composite_score, top_n=20)
    
    print(f"从{n_stocks}只股票中选出{len(selected)}只")
    print(f"前5名：{selected[:5]}")
    print(f"综合得分最高：{composite_score.max():.4f}")
    print(f"综合得分最低：{composite_score.min():.4f}")

run_multi_factor_backtest()
```

---

## 16.3 项目二：加密货币趋势跟踪策略（含实盘接口）

趋势跟踪是加密货币市场最经典的策略之一。加密货币市场波动大、趋势明显，非常适合趋势跟踪策略。

```python
import ccxt
import pandas as pd
import numpy as np
from datetime import datetime
import time
import logging

logger = logging.getLogger(__name__)

class CryptoTrendStrategy:
    """加密货币趋势跟踪策略"""
    
    def __init__(self, exchange_id: str = 'okx', 
                 symbol: str = 'BTC/USDT',
                 timeframe: str = '4h'):
        """
        exchange_id: 交易所ID
        symbol: 交易对
        timeframe: K线周期
        """
        self.symbol = symbol
        self.timeframe = timeframe
        self.exchange = None
        self._init_exchange(exchange_id)
        
        # 策略参数
        self.fast_period = 20    # 快速均线周期
        self.slow_period = 60    # 慢速均线周期
        self.atr_period = 14     # ATR周期
        self.risk_per_trade = 0.02  # 每笔交易风险2%
    
    def _init_exchange(self, exchange_id: str):
        """初始化交易所连接"""
        import os
        exchange_class = getattr(ccxt, exchange_id)
        self.exchange = exchange_class({
            'apiKey': os.environ.get(f'{exchange_id.upper()}_API_KEY'),
            'secret': os.environ.get(f'{exchange_id.upper()}_SECRET'),
            'password': os.environ.get(f'{exchange_id.upper()}_PASSPHRASE'),
        })
    
    def fetch_ohlcv(self, limit: int = 200) -> pd.DataFrame:
        """获取K线数据"""
        ohlcv = self.exchange.fetch_ohlcv(
            self.symbol, self.timeframe, limit=limit
        )
        df = pd.DataFrame(ohlcv, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
        df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
        df = df.set_index('timestamp')
        return df
    
    def calculate_signals(self, df: pd.DataFrame) -> dict:
        """计算交易信号"""
        df = df.copy()
        
        # 双均线
        df['ma_fast'] = df['close'].rolling(self.fast_period).mean()
        df['ma_slow'] = df['close'].rolling(self.slow_period).mean()
        
        # ATR
        df['prev_close'] = df['close'].shift(1)
        df['tr'] = df[['high', 'low', 'prev_close']].apply(
            lambda row: max(
                row['high'] - row['low'],
                abs(row['high'] - row['prev_close']),
                abs(row['low'] - row['prev_close'])
            ), axis=1
        )
        df['atr'] = df['tr'].rolling(self.atr_period).mean()
        
        latest = df.iloc[-1]
        prev = df.iloc[-2]
        
        # 信号判断
        signal = 'hold'
        
        # 金叉：快线上穿慢线
        if prev['ma_fast'] <= prev['ma_slow'] and latest['ma_fast'] > latest['ma_slow']:
            signal = 'buy'
        # 死叉：快线下穿慢线
        elif prev['ma_fast'] >= prev['ma_slow'] and latest['ma_fast'] < latest['ma_slow']:
            signal = 'sell'
        
        return {
            'signal': signal,
            'close': latest['close'],
            'ma_fast': latest['ma_fast'],
            'ma_slow': latest['ma_slow'],
            'atr': latest['atr'],
            'timestamp': df.index[-1]
        }
    
    def calculate_position_size(self, entry_price: float, 
                                  atr: float, 
                                  account_balance: float) -> float:
        """
        基于ATR计算仓位大小
        风险金额 = 账户余额 * 每笔风险比例
        仓位 = 风险金额 / (ATR * 2)
        """
        risk_amount = account_balance * self.risk_per_trade
        stop_distance = atr * 2
        position_size = risk_amount / stop_distance
        
        # 转换为BTC数量
        btc_amount = position_size / entry_price
        return round(btc_amount, 4)
    
    def run_once(self, paper_trading: bool = True):
        """执行一次策略检查"""
        try:
            # 获取数据
            df = self.fetch_ohlcv()
            signal_info = self.calculate_signals(df)
            
            logger.info(f"信号检查 - {self.symbol} {self.timeframe}")
            logger.info(f"当前价格: {signal_info['close']:.2f}")
            logger.info(f"信号: {signal_info['signal']}")
            
            if signal_info['signal'] in ['buy', 'sell']:
                # 获取账户余额
                balance = self.exchange.fetch_balance()
                usdt_balance = balance['USDT']['free']
                
                # 计算仓位
                position_size = self.calculate_position_size(
                    entry_price=signal_info['close'],
                    atr=signal_info['atr'],
                    account_balance=usdt_balance
                )
                
                if paper_trading:
                    logger.info(f"[模拟] {signal_info['signal'].upper()} {position_size} BTC @ {signal_info['close']:.2f}")
                else:
                    # 真实下单（谨慎！）
                    if signal_info['signal'] == 'buy':
                        order = self.exchange.create_market_buy_order(
                            self.symbol, position_size
                        )
                    else:
                        order = self.exchange.create_market_sell_order(
                            self.symbol, position_size
                        )
                    logger.info(f"订单已提交: {order['id']}")
            
            return signal_info
            
        except Exception as e:
            logger.error(f"策略执行失败: {e}")
            return None
```

---

## 16.4 项目三：基于新闻情绪的事件驱动策略

事件驱动策略的核心是：在重大事件发生后，快速判断事件对股价的影响方向，并在市场充分反应之前建立仓位。

**策略设计思路：**

```python
from openai import OpenAI
import akshare as ak
import pandas as pd
from datetime import datetime, timedelta
import time

class NewsEventStrategy:
    """基于新闻情绪的事件驱动策略"""
    
    def __init__(self, api_key: str, stock_pool: list):
        self.client = OpenAI(api_key=api_key, base_url="https://api.deepseek.com")
        self.stock_pool = stock_pool  # 监控的股票列表
        self.position_threshold = 0.65   # 情绪分数超过此值才建仓
        self.max_hold_days = 5           # 最长持有5天
    
    def fetch_recent_news(self, stock_code: str, hours: int = 4) -> list:
        """获取最近N小时的新闻"""
        try:
            news_df = ak.stock_news_em(symbol=stock_code)
            # 过滤最近N小时的新闻
            cutoff_time = datetime.now() - timedelta(hours=hours)
            recent_news = []
            for _, row in news_df.iterrows():
                recent_news.append({
                    'title': row.get('新闻标题', ''),
                    'content': row.get('新闻内容', ''),
                    'time': row.get('发布时间', '')
                })
            return recent_news[:10]  # 最多取10条
        except Exception as e:
            return []
    
    def analyze_event_impact(self, news_list: list, stock_name: str) -> dict:
        """用AI分析事件对股价的影响"""
        if not news_list:
            return {'signal': 'neutral', 'score': 0.0, 'confidence': 0.0}
        
        news_text = "\n".join([
            f"[{n.get('time', '')}] {n['title']}" 
            for n in news_list
        ])
        
        prompt = f"""分析以下关于{stock_name}的最新新闻，判断对股价的短期影响（1-3天）。

新闻列表：
{news_text}

请返回JSON：
{{
    "signal": "bullish/bearish/neutral",
    "score": 数值（-1到1）,
    "confidence": 数值（0到1）,
    "key_event": "最重要的事件（一句话）",
    "reasoning": "判断理由（50字以内）",
    "hold_days": 建议持有天数（1-5）
}}"""
        
        try:
            response = self.client.chat.completions.create(
                model="deepseek-chat",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                max_tokens=300
            )
            import json
            result = json.loads(response.choices[0].message.content)
            return result
        except Exception as e:
            return {'signal': 'neutral', 'score': 0.0, 'confidence': 0.0}
    
    def generate_signals(self) -> list:
        """为所有监控股票生成交易信号"""
        signals = []
        
        for stock_code in self.stock_pool:
            news = self.fetch_recent_news(stock_code)
            if not news:
                continue
            
            analysis = self.analyze_event_impact(news, stock_code)
            
            # 只有置信度足够高才生成信号
            if (analysis.get('confidence', 0) >= 0.6 and 
                abs(analysis.get('score', 0)) >= self.position_threshold):
                
                signals.append({
                    'stock_code': stock_code,
                    'signal': analysis['signal'],
                    'score': analysis['score'],
                    'confidence': analysis['confidence'],
                    'key_event': analysis.get('key_event', ''),
                    'hold_days': analysis.get('hold_days', 3),
                    'timestamp': datetime.now().isoformat()
                })
            
            time.sleep(0.5)  # 避免API限流
        
        return signals
```

---

## 16.5 代码规范与项目管理：如何维护一个长期运行的量化项目

量化项目的特殊性在于：它需要长期稳定运行，代码质量直接影响资金安全。

**核心规范：**

**1. 配置与代码分离**

```python
# config/settings.py
import os
from dataclasses import dataclass

@dataclass
class TradingConfig:
    """交易配置（从环境变量读取敏感信息）"""
    
    # API配置（从环境变量读取，不硬编码）
    deepseek_api_key: str = os.environ.get('DEEPSEEK_API_KEY', '')
    okx_api_key: str = os.environ.get('OKX_API_KEY', '')
    dingtalk_webhook: str = os.environ.get('DINGTALK_WEBHOOK', '')
    
    # 交易参数
    max_position_pct: float = 0.05
    max_drawdown: float = 0.15
    paper_trading: bool = True  # 默认模拟盘，上线前改为False
    
    # 数据参数
    data_start_date: str = '20200101'
    update_frequency: str = 'daily'

# 全局配置实例
config = TradingConfig()
```

**2. 统一的日志规范**

```python
# monitoring/logger.py
import logging
import os
from datetime import datetime

def setup_logger(name: str, log_dir: str = 'logs') -> logging.Logger:
    """设置统一的日志格式"""
    os.makedirs(log_dir, exist_ok=True)
    
    logger = logging.getLogger(name)
    logger.setLevel(logging.INFO)
    
    # 文件Handler：按日期分文件
    log_file = os.path.join(log_dir, f"{datetime.now().strftime('%Y%m%d')}.log")
    file_handler = logging.FileHandler(log_file, encoding='utf-8')
    file_handler.setLevel(logging.INFO)
    
    # 控制台Handler
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.WARNING)  # 控制台只显示警告以上
    
    # 格式
    formatter = logging.Formatter(
        '%(asctime)s [%(name)s] [%(levelname)s] %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    file_handler.setFormatter(formatter)
    console_handler.setFormatter(formatter)
    
    logger.addHandler(file_handler)
    logger.addHandler(console_handler)
    
    return logger
```

**3. 单元测试**

```python
# tests/test_risk_manager.py
import pytest
from execution.risk_manager import RiskManager, RiskConfig

def test_position_size_calculation():
    """测试仓位计算"""
    config = RiskConfig(max_position_pct=0.05, target_daily_risk=0.01)
    rm = RiskManager(total_capital=1_000_000, config=config)
    
    result = rm.calculate_position_size(
        stock_code="600519",
        entry_price=1800.0,
        stock_atr=45.0
    )
    
    # 验证仓位不超过最大限制
    assert result['position_pct'] <= config.max_position_pct
    # 验证股数是100的整数倍（A股最小交易单位）
    assert result['shares'] % 100 == 0

def test_drawdown_halt():
    """测试回撤触发暂停"""
    config = RiskConfig(max_drawdown=0.15)
    rm = RiskManager(total_capital=1_000_000, config=config)
    
    # 模拟亏损16%
    rm.update_capital(840_000)
    
    assert rm.should_stop_trading() == True

# 运行测试：pytest tests/
```

**4. Git版本管理规范**

```bash
# .gitignore 必须包含
*.env
secrets.env
logs/
__pycache__/
*.pyc
data/raw/          # 原始数据不提交（太大）
```

```
# 提交信息规范
feat: 添加ATR止损功能
fix: 修复动量因子计算中的数据泄露问题
refactor: 重构风险管理模块
test: 添加仓位计算单元测试
docs: 更新策略说明文档
```

---

## 16.6 下一步：进阶方向推荐

完成本课程后，你已经具备了量化交易的完整基础。以下是几个值得深入的进阶方向：

**方向1：高频交易（HFT）**

高频交易在毫秒级别执行，利用极小的价差积累收益。技术要求极高：需要低延迟网络、专用硬件、C++/Rust编程。对于个人投资者，这个方向门槛很高，但了解其原理有助于理解市场微观结构。

**方向2：期权策略**

期权提供了更丰富的风险收益结构。常见策略包括：卖出期权收取权利金（类似保险公司）、Delta对冲、波动率套利。需要深入理解期权定价（Black-Scholes模型）和Greeks。

**方向3：强化学习**

用强化学习训练交易Agent，让AI通过与市场的交互学习最优策略。目前主要在研究阶段，实盘应用有限，但是最前沿的方向之一。推荐从FinRL库开始学习。

**方向4：另类数据**

除了价格和财务数据，还有大量另类数据可以挖掘：卫星图像（分析停车场车辆数量判断零售商销售情况）、信用卡消费数据、招聘数据等。这些数据往往需要付费购买，但信息优势明显。

**方向5：组合优化**

用现代投资组合理论（MPT）、Black-Litterman模型等方法优化多策略组合的权重分配，在给定风险约束下最大化收益。

---

## 实战练习：完成一个端到端的量化项目

### 目标
整合本课程所学，完成一个包含数据获取、策略实现、回测、风控和报告生成的完整量化项目。

### 完整端到端代码

```python
"""
端到端量化项目示例
策略：A股双均线 + 多因子过滤 + 完整风控
"""

import akshare as ak
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import logging
import json
import os

# 设置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s'
)
logger = logging.getLogger(__name__)


# ============================================================
# 第一层：数据层
# ============================================================

class DataLayer:
    """数据获取和处理"""
    
    def get_stock_data(self, stock_code: str, 
                        start_date: str, end_date: str) -> pd.DataFrame:
        """获取股票日线数据"""
        df = ak.stock_zh_a_hist(
            symbol=stock_code, period="daily",
            start_date=start_date, end_date=end_date,
            adjust="qfq"
        )
        df.columns = ['date', 'open', 'close', 'high', 'low', 'volume',
                      'amount', 'amplitude', 'pct_change', 'change', 'turnover']
        df['date'] = pd.to_datetime(df['date'])
        df = df.set_index('date').sort_index()
        return df
    
    def calculate_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """计算技术特征"""
        df = df.copy()
        df['ma5'] = df['close'].rolling(5).mean()
        df['ma20'] = df['close'].rolling(20).mean()
        df['ma60'] = df['close'].rolling(60).mean()
        
        # ATR
        df['prev_close'] = df['close'].shift(1)
        df['tr'] = df.apply(
            lambda row: max(
                row['high'] - row['low'],
                abs(row['high'] - row['prev_close']) if pd.notna(row['prev_close']) else 0,
                abs(row['low'] - row['prev_close']) if pd.notna(row['prev_close']) else 0
            ), axis=1
        )
        df['atr14'] = df['tr'].rolling(14).mean()
        
        # 动量
        df['momentum_20d'] = df['close'].pct_change(20)
        
        # 波动率
        df['volatility_20d'] = df['close'].pct_change().rolling(20).std()
        
        return df.dropna()


# ============================================================
# 第二层：策略层
# ============================================================

class StrategyLayer:
    """策略信号生成"""
    
    def generate_signals(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        双均线策略 + 趋势过滤
        信号：1=买入，-1=卖出，0=持有
        """
        df = df.copy()
        df['signal'] = 0
        
        # 金叉：5日均线上穿20日均线，且价格在60日均线上方（趋势过滤）
        golden_cross = (
            (df['ma5'] > df['ma20']) & 
            (df['ma5'].shift(1) <= df['ma20'].shift(1)) &
            (df['close'] > df['ma60'])
        )
        
        # 死叉：5日均线下穿20日均线
        death_cross = (
            (df['ma5'] < df['ma20']) & 
            (df['ma5'].shift(1) >= df['ma20'].shift(1))
        )
        
        df.loc[golden_cross, 'signal'] = 1
        df.loc[death_cross, 'signal'] = -1
        
        return df


# ============================================================
# 第三层：回测引擎
# ============================================================

class BacktestEngine:
    """简单回测引擎"""
    
    def __init__(self, initial_capital: float = 1_000_000,
                 commission: float = 0.0015,  # 双边手续费0.15%
                 slippage: float = 0.001):    # 滑点0.1%
        self.initial_capital = initial_capital
        self.commission = commission
        self.slippage = slippage
    
    def run(self, df: pd.DataFrame) -> dict:
        """运行回测"""
        capital = self.initial_capital
        position = 0  # 持仓股数
        trades = []
        nav_history = []
        
        for date, row in df.iterrows():
            # 计算当前净值
            current_nav = capital + position * row['close']
            nav_history.append({'date': date, 'nav': current_nav})
            
            # 执行信号
            if row['signal'] == 1 and position == 0:  # 买入信号
                # 考虑滑点：实际成交价略高于收盘价
                buy_price = row['close'] * (1 + self.slippage)
                # 计算可买股数（考虑手续费）
                available_capital = capital * 0.95  # 留5%现金
                shares = int(available_capital / buy_price / 100) * 100
                
                if shares > 0:
                    cost = shares * buy_price * (1 + self.commission)
                    capital -= cost
                    position = shares
                    trades.append({
                        'date': date, 'action': 'buy',
                        'price': buy_price, 'shares': shares, 'cost': cost
                    })
            
            elif row['signal'] == -1 and position > 0:  # 卖出信号
                sell_price = row['close'] * (1 - self.slippage)
                revenue = position * sell_price * (1 - self.commission)
                capital += revenue
                trades.append({
                    'date': date, 'action': 'sell',
                    'price': sell_price, 'shares': position, 'revenue': revenue
                })
                position = 0
        
        # 计算绩效指标
        nav_df = pd.DataFrame(nav_history).set_index('date')
        nav_df['daily_return'] = nav_df['nav'].pct_change()
        
        total_return = (nav_df['nav'].iloc[-1] / self.initial_capital) - 1
        n_years = len(nav_df) / 252
        annual_return = (1 + total_return) ** (1/n_years) - 1
        annual_vol = nav_df['daily_return'].std() * np.sqrt(252)
        sharpe = annual_return / annual_vol if annual_vol > 0 else 0
        
        rolling_max = nav_df['nav'].expanding().max()
        drawdown = (nav_df['nav'] - rolling_max) / rolling_max
        max_drawdown = drawdown.min()
        
        return {
            'total_return': total_return,
            'annual_return': annual_return,
            'annual_vol': annual_vol,
            'sharpe_ratio': sharpe,
            'max_drawdown': max_drawdown,
            'n_trades': len(trades),
            'nav_history': nav_df,
            'trades': trades
        }


# ============================================================
# 第四层：报告生成
# ============================================================

def generate_report(stock_code: str, stock_name: str, 
                     backtest_results: dict) -> str:
    """生成回测报告"""
    report = f"""
# 量化策略回测报告

**生成时间：** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
**策略：** 双均线趋势跟踪策略
**标的：** {stock_name}（{stock_code}）

## 绩效摘要

| 指标 | 数值 |
|------|------|
| 总收益率 | {backtest_results['total_return']:.2%} |
| 年化收益率 | {backtest_results['annual_return']:.2%} |
| 年化波动率 | {backtest_results['annual_vol']:.2%} |
| 夏普比率 | {backtest_results['sharpe_ratio']:.2f} |
| 最大回撤 | {backtest_results['max_drawdown']:.2%} |
| 交易次数 | {backtest_results['n_trades']} 次 |

## 风险评估

"""
    
    # 风险评级
    if backtest_results['sharpe_ratio'] > 1.5 and abs(backtest_results['max_drawdown']) < 0.15:
        risk_level = "低风险"
        recommendation = "策略表现良好，可考虑小资金实盘验证"
    elif backtest_results['sharpe_ratio'] > 1.0:
        risk_level = "中等风险"
        recommendation = "策略有一定价值，建议进一步优化后再实盘"
    else:
        risk_level = "高风险"
        recommendation = "策略表现不佳，建议重新审视策略逻辑"
    
    report += f"**风险等级：** {risk_level}\n\n"
    report += f"**建议：** {recommendation}\n\n"
    report += "## 免责声明\n\n"
    report += "本报告仅供学习研究使用，不构成投资建议。历史表现不代表未来收益。\n"
    
    return report


# ============================================================
# 主程序：整合所有层
# ============================================================

def run_complete_project(stock_code: str = "600519", 
                          stock_name: str = "贵州茅台"):
    """运行完整的端到端量化项目"""
    
    logger.info(f"开始运行量化项目：{stock_name}（{stock_code}）")
    
    # 1. 数据层：获取数据
    logger.info("Step 1: 获取数据...")
    data_layer = DataLayer()
    raw_data = data_layer.get_stock_data(
        stock_code=stock_code,
        start_date="20200101",
        end_date=datetime.now().strftime("%Y%m%d")
    )
    featured_data = data_layer.calculate_features(raw_data)
    logger.info(f"获取到 {len(featured_data)} 条数据")
    
    # 2. 策略层：生成信号
    logger.info("Step 2: 生成交易信号...")
    strategy_layer = StrategyLayer()
    signal_data = strategy_layer.generate_signals(featured_data)
    n_signals = (signal_data['signal'] != 0).sum()
    logger.info(f"生成 {n_signals} 个交易信号")
    
    # 3. 回测引擎：运行回测
    logger.info("Step 3: 运行回测...")
    backtest = BacktestEngine(
        initial_capital=1_000_000,
        commission=0.0015,
        slippage=0.001
    )
    results = backtest.run(signal_data)
    
    # 4. 输出结果
    logger.info("Step 4: 生成报告...")
    print("\n" + "="*50)
    print(f"回测结果：{stock_name}（{stock_code}）")
    print("="*50)
    print(f"总收益率：{results['total_return']:.2%}")
    print(f"年化收益：{results['annual_return']:.2%}")
    print(f"夏普比率：{results['sharpe_ratio']:.2f}")
    print(f"最大回撤：{results['max_drawdown']:.2%}")
    print(f"交易次数：{results['n_trades']} 次")
    
    # 生成报告
    report = generate_report(stock_code, stock_name, results)
    report_file = f"backtest_report_{stock_code}.md"
    with open(report_file, 'w', encoding='utf-8') as f:
        f.write(report)
    logger.info(f"报告已保存到 {report_file}")
    
    return results


# 运行项目
if __name__ == "__main__":
    results = run_complete_project(stock_code="600519", stock_name="贵州茅台")
```

---

## 常见问题 Q&A

**Q1：为什么课程最后强调“四层架构”，而不是继续讲更多策略？**

A：因为到了端到端阶段，真正决定系统能不能长期运行的，已经不只是单个策略想法，而是数据、策略、执行、监控能否解耦，能否在某一层出问题时快速定位和修复。

**Q2：一个完整量化系统最容易先坏在哪一层？**

A：通常先坏在工程层面最脆弱的地方：数据更新失败、接口异常、日志缺失、配置错误，而不是策略公式本身。所以“系统稳定运行”本身就是量化能力的一部分。

**Q3：做完毕业项目后，下一步最该提升什么？**

A：先别急着追更复杂的模型。更高优先级通常是：让现有系统更稳、让研究记录更完整、让回测到实盘的偏差更可解释。能把一套简单系统长期跑稳，比做十套花哨原型更有价值。

---

## 本章小结

本章将前15章的所有知识整合成一个完整的量化交易系统。四层架构（数据层、策略层、执行层、监控层）是构建可维护量化系统的基础。三个实战项目覆盖了A股多因子选股、加密货币趋势跟踪和新闻情绪事件驱动三种主流策略类型。代码规范和项目管理是长期运行量化系统的保障，不能忽视。

量化交易是一个需要持续学习和迭代的领域。技术在进步，市场在变化，策略需要不断进化。希望本课程为你打下了坚实的基础，祝你在量化交易的道路上越走越远。

---

## 课后思考题

1. 在四层架构中，如果数据层出现问题（比如akshare接口返回错误数据），会如何影响其他三层？如何设计一个数据质量检查机制来防止错误数据流入策略层？

2. 本章的端到端项目使用了简单的双均线策略。如果你要把它升级为多因子策略，需要修改哪些层的代码？各层的修改量大概是多少？这说明了分层架构的什么优点？

3. 你已经完成了本课程的学习。回顾一下，你认为量化交易中最难的部分是什么？是数据获取、策略设计、风险管理，还是实盘执行？为什么？你打算如何继续提升这个方面的能力？
