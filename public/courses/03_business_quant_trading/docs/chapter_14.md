# 第14章：实盘接入与自动化交易

## 学习目标

1. 理解实盘与回测的主要差距，建立对真实交易成本的正确认知
2. 了解国内主流券商接口和加密货币交易接口的基本使用方法
3. 掌握策略自动化运行的核心技术：定时任务、异常处理、日志记录
4. 学会搭建微信/钉钉交易通知系统
5. 能用AI辅助分析运行日志，快速定位异常

---

## 14.1 实盘与回测的差距：滑点、手续费、延迟

很多人第一次把回测表现优秀的策略搬到实盘，都会经历一次"现实的毒打"。回测年化25%，实盘可能只有10%甚至亏损。这个差距来自哪里？

**差距1：手续费**

回测中常见的错误设置是手续费0.1%，但A股实际成本更高：
- 买入：佣金约0.025%（万分之二点五，各券商不同）
- 卖出：佣金约0.025% + 印花税0.1%
- 合计：单次买卖约0.15%，来回约0.3%

如果策略月度调仓，换手率100%，一年12次调仓，仅手续费就吃掉约3.6%的收益。

**差距2：滑点**

回测假设你能以当天收盘价成交，但实盘中：
- 你的买单可能推高价格（市场冲击）
- 流动性不足时无法按预期价格成交
- 开盘集合竞价可能与预期价格偏差较大

对于小市值股票，滑点可能高达0.5%-1%。

**差距3：延迟**

回测是瞬时的，实盘有延迟：
- 数据获取延迟（行情数据到达你的程序需要时间）
- 下单延迟（从程序发出指令到交易所确认需要时间）
- 对于高频策略，这些延迟是致命的；对于日线策略，影响相对较小

**差距4：幸存者偏差**

回测数据通常只包含现存的股票，而实盘中你可能买入后来退市的股票。

**实用建议：** 在回测中，将手续费设置为0.3%（双边），滑点设置为0.1%，这样的回测结果更接近实盘。

---

## 14.2 国内券商接口：同花顺easytrader、富途OpenAPI、掘金量化

**方案1：easytrader（模拟键盘操作，免费）**

easytrader通过模拟键盘和鼠标操作同花顺客户端来实现自动交易。优点是免费、不需要申请接口权限；缺点是稳定性差、速度慢、容易被检测。

```python
# pip install easytrader
import easytrader

# 连接同花顺客户端（需要先打开同花顺并登录）
user = easytrader.use('tonghuashun')
user.connect('同花顺客户端路径')

# 查询持仓
positions = user.position
print("当前持仓：", positions)

# 查询余额
balance = user.balance
print("账户余额：", balance)

# 买入（注意：这会真实下单！）
# user.buy('600519', price=1800, amount=100)

# 卖出
# user.sell('600519', price=1850, amount=100)
```

**方案2：富途OpenAPI（稳定，支持港股美股）**

富途提供官方API，稳定性好，支持A股、港股、美股。需要开通富途账户并申请API权限。

```python
# pip install futu-api
from futu import *

# 连接富途OpenD（需要先安装并运行OpenD）
quote_ctx = OpenQuoteContext(host='127.0.0.1', port=11111)
trade_ctx = OpenHKTradeContext(host='127.0.0.1', port=11111)

# 获取实时行情
ret, data = quote_ctx.get_market_snapshot(['HK.00700'])  # 腾讯
if ret == RET_OK:
    print(data)

# 下单（港股）
# ret, data = trade_ctx.place_order(
#     price=300.0, qty=100, code='HK.00700',
#     trd_side=TrdSide.BUY, order_type=OrderType.NORMAL
# )

quote_ctx.close()
trade_ctx.close()
```

**方案3：掘金量化（专业量化平台）**

掘金量化提供完整的量化研究和实盘交易环境，支持A股实盘交易，有完善的回测框架。

```python
# 掘金量化策略示例
from gm.api import *

def init(context):
    """策略初始化"""
    context.symbol = 'SHSE.600519'  # 贵州茅台
    
    # 订阅行情
    subscribe(symbols=context.symbol, frequency='1d', count=20)

def on_bar(context, bars):
    """每根K线触发"""
    bar = bars[0]
    
    # 获取当前持仓
    positions = get_position()
    
    # 简单的均线策略示例
    history = history(symbol=context.symbol, frequency='1d', count=20, 
                      fields='close', fill_missing='last')
    
    ma5 = history['close'].tail(5).mean()
    ma20 = history['close'].mean()
    
    if ma5 > ma20 and not positions:
        # 买入
        order_target_percent(symbol=context.symbol, percent=0.9, 
                             order_type=OrderType_Market)
    elif ma5 < ma20 and positions:
        # 卖出
        order_target_percent(symbol=context.symbol, percent=0, 
                             order_type=OrderType_Market)
```

---

## 14.3 加密货币接口：CCXT库连接Binance / OKX

CCXT（CryptoCurrency eXchange Trading Library）是一个统一的加密货币交易所接口库，支持100多个交易所，用同一套代码就能连接不同交易所。

```python
# pip install ccxt
import ccxt
import pandas as pd

# 连接OKX（国内用户更友好）
exchange = ccxt.okx({
    'apiKey': 'your_api_key',
    'secret': 'your_secret',
    'password': 'your_passphrase',  # OKX需要passphrase
    'options': {'defaultType': 'spot'},  # 现货交易
})

# 获取账户余额
balance = exchange.fetch_balance()
print("USDT余额：", balance['USDT']['free'])

# 获取K线数据
ohlcv = exchange.fetch_ohlcv('BTC/USDT', timeframe='1d', limit=100)
df = pd.DataFrame(ohlcv, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
print(df.tail())

# 获取当前价格
ticker = exchange.fetch_ticker('BTC/USDT')
print(f"BTC当前价格：{ticker['last']}")

# 下市价单（注意：这会真实下单！）
# order = exchange.create_market_buy_order('BTC/USDT', amount=0.001)

# 下限价单
# order = exchange.create_limit_buy_order('BTC/USDT', amount=0.001, price=60000)

# 查询持仓
# positions = exchange.fetch_positions()  # 合约持仓

# 取消订单
# exchange.cancel_order(order_id, 'BTC/USDT')
```

**重要安全提示：**
- API密钥只开启"读取"和"交易"权限，不要开启"提现"权限
- 将API密钥存储在环境变量中，不要硬编码在代码里
- 设置IP白名单，只允许你的服务器IP访问

```python
import os

# 从环境变量读取API密钥（安全做法）
exchange = ccxt.okx({
    'apiKey': os.environ.get('OKX_API_KEY'),
    'secret': os.environ.get('OKX_SECRET'),
    'password': os.environ.get('OKX_PASSPHRASE'),
})
```

---

## 14.4 策略自动化运行：定时任务、异常处理、日志记录

**定时任务**

```python
import schedule
import time
import logging
from datetime import datetime

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler('trading_bot.log', encoding='utf-8'),
        logging.StreamHandler()  # 同时输出到控制台
    ]
)
logger = logging.getLogger(__name__)


def is_trading_day() -> bool:
    """判断今天是否是交易日（简化版）"""
    today = datetime.now()
    # 周末不交易
    if today.weekday() >= 5:
        return False
    # 实际应该检查节假日，这里简化处理
    return True


def run_strategy():
    """策略主函数"""
    logger.info("开始执行策略...")
    
    try:
        # 1. 获取数据
        logger.info("获取市场数据...")
        # data = fetch_market_data()
        
        # 2. 生成信号
        logger.info("生成交易信号...")
        # signals = generate_signals(data)
        
        # 3. 执行交易
        logger.info("执行交易...")
        # execute_trades(signals)
        
        logger.info("策略执行完成")
        
    except Exception as e:
        logger.error(f"策略执行失败：{e}", exc_info=True)
        # 发送告警通知（见14.5节）
        send_alert(f"策略执行失败：{str(e)}")


def morning_routine():
    """早盘例行任务（9:30执行）"""
    if not is_trading_day():
        logger.info("今天不是交易日，跳过")
        return
    
    logger.info("执行早盘例行任务")
    run_strategy()


def afternoon_routine():
    """收盘后例行任务（15:30执行）"""
    if not is_trading_day():
        return
    
    logger.info("执行收盘后例行任务")
    # 生成日报、更新数据库等


# 设置定时任务
schedule.every().day.at("09:30").do(morning_routine)
schedule.every().day.at("15:30").do(afternoon_routine)

logger.info("交易机器人启动，等待执行时间...")

while True:
    schedule.run_pending()
    time.sleep(30)  # 每30秒检查一次
```

**异常处理最佳实践**

```python
import functools
import traceback

def with_retry(max_retries=3, delay=5):
    """重试装饰器"""
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    if attempt == max_retries - 1:
                        logger.error(f"{func.__name__} 失败（已重试{max_retries}次）：{e}")
                        raise
                    logger.warning(f"{func.__name__} 失败（第{attempt+1}次），{delay}秒后重试：{e}")
                    time.sleep(delay)
        return wrapper
    return decorator


@with_retry(max_retries=3, delay=5)
def fetch_market_data():
    """获取市场数据（带重试）"""
    # 实际的数据获取代码
    pass
```

---

## 14.5 监控与告警：微信/钉钉推送交易通知

**方案1：钉钉机器人（最简单）**

```python
import requests
import json
from datetime import datetime

class DingTalkNotifier:
    """钉钉机器人通知"""
    
    def __init__(self, webhook_url: str):
        """
        webhook_url: 钉钉机器人的Webhook地址
        在钉钉群 → 群设置 → 智能群助手 → 添加机器人 → 自定义 中获取
        """
        self.webhook_url = webhook_url
    
    def send_text(self, message: str):
        """发送文本消息"""
        data = {
            "msgtype": "text",
            "text": {"content": message}
        }
        response = requests.post(
            self.webhook_url,
            data=json.dumps(data),
            headers={'Content-Type': 'application/json'}
        )
        return response.json()
    
    def send_trade_notification(self, trade_info: dict):
        """发送交易通知"""
        action = "买入" if trade_info['action'] == 'buy' else "卖出"
        message = (
            f"【交易通知】{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
            f"操作：{action}\n"
            f"股票：{trade_info['stock_code']}\n"
            f"价格：{trade_info['price']:.2f}\n"
            f"数量：{trade_info['shares']}股\n"
            f"金额：{trade_info['price'] * trade_info['shares']:,.0f}元\n"
            f"原因：{trade_info.get('reason', '策略信号')}"
        )
        return self.send_text(message)
    
    def send_daily_report(self, report: dict):
        """发送每日报告"""
        message = (
            f"【每日报告】{datetime.now().strftime('%Y-%m-%d')}\n"
            f"账户净值：{report['net_value']:,.0f}元\n"
            f"今日盈亏：{report['daily_pnl']:+,.0f}元 ({report['daily_return']:+.2%})\n"
            f"累计收益：{report['total_return']:+.2%}\n"
            f"当前回撤：{report['current_drawdown']:.2%}\n"
            f"持仓数量：{report['n_positions']}只"
        )
        return self.send_text(message)


def send_alert(message: str):
    """发送告警（全局函数）"""
    notifier = DingTalkNotifier(webhook_url="your_webhook_url")
    notifier.send_text(f"【告警】{message}")
```

**方案2：企业微信机器人**

```python
def send_wechat_work(webhook_url: str, message: str):
    """企业微信机器人推送"""
    data = {
        "msgtype": "text",
        "text": {"content": message}
    }
    requests.post(webhook_url, json=data)
```

---

## 14.6 用AI辅助运维：让AI分析运行日志、诊断异常

当策略出现异常时，日志文件可能有几千行。用AI快速定位问题比人工翻日志效率高得多。

**日志分析提示词：**

```python
from openai import OpenAI

def analyze_log_with_ai(log_content: str, issue_description: str) -> str:
    """用AI分析运行日志"""
    
    client = OpenAI(api_key="your_key", base_url="https://api.deepseek.com")
    
    prompt = f"""你是一位量化交易系统的运维专家。
请分析以下运行日志，找出问题原因并给出解决方案。

问题描述：{issue_description}

日志内容（最近100行）：
{log_content[-5000:]}  # 只取最后5000字符

请：
1. 找出错误发生的时间点和直接原因
2. 分析根本原因（是数据问题、网络问题、代码bug还是其他？）
3. 给出具体的修复建议
4. 建议如何预防类似问题再次发生"""

    response = client.chat.completions.create(
        model="deepseek-chat",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=1000
    )
    
    return response.choices[0].message.content


# 使用示例
with open('trading_bot.log', 'r', encoding='utf-8') as f:
    log_content = f.read()

analysis = analyze_log_with_ai(
    log_content=log_content,
    issue_description="策略今天早上9:35没有执行，但昨天正常"
)
print(analysis)
```

---

## 实战练习：搭建一个可以自动发送交易信号的通知系统（模拟盘）

### 目标
搭建一个完整的模拟盘通知系统：每天收盘后自动计算交易信号，并通过钉钉发送通知。

### 完整代码

```python
import akshare as ak
import pandas as pd
import numpy as np
import schedule
import time
import logging
import requests
import json
from datetime import datetime, timedelta

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler('signal_bot.log', encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# 钉钉Webhook（替换为你的真实地址）
DINGTALK_WEBHOOK = "https://oapi.dingtalk.com/robot/send?access_token=YOUR_TOKEN"

# 监控的股票池
STOCK_POOL = {
    "600519": "贵州茅台",
    "000858": "五粮液",
    "601318": "中国平安",
    "600036": "招商银行",
    "000333": "美的集团"
}


def get_stock_data(stock_code: str, days: int = 30) -> pd.DataFrame:
    """获取股票历史数据"""
    end_date = datetime.now().strftime("%Y%m%d")
    start_date = (datetime.now() - timedelta(days=days*2)).strftime("%Y%m%d")
    
    df = ak.stock_zh_a_hist(
        symbol=stock_code, period="daily",
        start_date=start_date, end_date=end_date,
        adjust="qfq"
    )
    df.columns = ['date', 'open', 'close', 'high', 'low', 'volume',
                  'amount', 'amplitude', 'pct_change', 'change', 'turnover']
    df['date'] = pd.to_datetime(df['date'])
    return df.set_index('date').sort_index().tail(days)


def generate_signal(df: pd.DataFrame) -> dict:
    """
    生成交易信号（简单双均线策略）
    返回：信号信息
    """
    df = df.copy()
    df['ma5'] = df['close'].rolling(5).mean()
    df['ma20'] = df['close'].rolling(20).mean()
    
    latest = df.iloc[-1]
    prev = df.iloc[-2]
    
    signal = "持有"
    reason = ""
    
    # 金叉：5日均线上穿20日均线
    if prev['ma5'] <= prev['ma20'] and latest['ma5'] > latest['ma20']:
        signal = "买入"
        reason = "5日均线上穿20日均线（金叉）"
    # 死叉：5日均线下穿20日均线
    elif prev['ma5'] >= prev['ma20'] and latest['ma5'] < latest['ma20']:
        signal = "卖出"
        reason = "5日均线下穿20日均线（死叉）"
    
    return {
        'signal': signal,
        'reason': reason,
        'close': latest['close'],
        'ma5': latest['ma5'],
        'ma20': latest['ma20'],
        'pct_change': latest['pct_change']
    }


def send_dingtalk(message: str):
    """发送钉钉通知"""
    data = {"msgtype": "text", "text": {"content": message}}
    try:
        response = requests.post(
            DINGTALK_WEBHOOK,
            data=json.dumps(data),
            headers={'Content-Type': 'application/json'},
            timeout=10
        )
        logger.info(f"钉钉通知发送成功：{response.json()}")
    except Exception as e:
        logger.error(f"钉钉通知发送失败：{e}")


def daily_signal_check():
    """每日信号检查（主函数）"""
    logger.info("开始每日信号检查...")
    
    today = datetime.now().strftime("%Y-%m-%d")
    signals = []
    
    for code, name in STOCK_POOL.items():
        try:
            df = get_stock_data(code, days=30)
            signal_info = generate_signal(df)
            
            signals.append({
                'code': code,
                'name': name,
                **signal_info
            })
            
            logger.info(f"{name}({code}): {signal_info['signal']} - {signal_info['reason']}")
            
        except Exception as e:
            logger.error(f"处理{name}({code})时出错：{e}")
    
    # 构建通知消息
    message_lines = [f"【每日交易信号】{today}\n"]
    
    action_signals = [s for s in signals if s['signal'] in ['买入', '卖出']]
    hold_signals = [s for s in signals if s['signal'] == '持有']
    
    if action_signals:
        message_lines.append("=== 有信号 ===")
        for s in action_signals:
            emoji = "📈" if s['signal'] == '买入' else "📉"
            message_lines.append(
                f"{emoji} {s['name']}({s['code']})\n"
                f"   操作：{s['signal']}\n"
                f"   原因：{s['reason']}\n"
                f"   收盘价：{s['close']:.2f}元\n"
                f"   今日涨跌：{s['pct_change']:+.2f}%"
            )
    else:
        message_lines.append("今日无交易信号")
    
    message_lines.append(f"\n=== 持仓监控 ===")
    for s in hold_signals:
        message_lines.append(f"  {s['name']}: {s['close']:.2f}元 ({s['pct_change']:+.2f}%)")
    
    full_message = "\n".join(message_lines)
    
    # 发送通知
    send_dingtalk(full_message)
    logger.info("每日信号检查完成")


# 设置定时任务：每天15:35执行（收盘后5分钟）
schedule.every().day.at("15:35").do(daily_signal_check)

# 也可以立即执行一次测试
# daily_signal_check()

logger.info("信号机器人启动，等待执行时间（每天15:35）...")
while True:
    schedule.run_pending()
    time.sleep(60)
```

---

## 常见问题 Q&A

**Q1：为什么很多策略一到实盘就变差？**

A：因为实盘多了很多回测里容易忽略的摩擦：下单延迟、成交偏差、盘口容量、接口稳定性、账户风控限制等。实盘不是“把回测结果复制出来”，而是另一层工程挑战。

**Q2：模拟盘表现很好，是不是就可以直接上实盘？**

A：也不能直接跳。模拟盘主要验证流程和信号链路，真实资金阶段还要面对心理压力、成交细节和账户限制。更稳的路径通常是小资金、低频率、可回滚地逐步放量。

**Q3：实盘系统最应该先监控什么？**

A：先监控会直接导致资金或执行事故的项目：是否成功下单、实际成交价是否偏离过大、持仓是否超限、接口是否异常、策略是否重复触发。高级分析可以后补，基础安全必须先有。

---

## 本章小结

本章介绍了从回测到实盘的关键步骤。最重要的认知是：实盘与回测的差距主要来自手续费、滑点和延迟，在回测中必须合理设置这些参数。国内量化实盘有多种接口选择，加密货币可以用CCXT统一接入。自动化运行需要做好定时任务、异常处理和日志记录三件事，监控告警系统是保障策略稳定运行的最后一道防线。

---

## 课后思考题

1. 假设你的策略在回测中设置手续费0.1%（单边），实际A股手续费约0.15%（单边）。如果策略年换手率为500%（即每年买卖各5次总仓位），这个手续费差异会导致多大的年化收益差距？

2. easytrader通过模拟键盘操作实现自动交易，这种方式有哪些潜在风险？在什么情况下你会选择这种方式，什么情况下应该避免？

3. 你的交易机器人在某天早上9:35没有执行，但日志显示程序正在运行。请列出至少5种可能的原因，以及对应的排查方法。
