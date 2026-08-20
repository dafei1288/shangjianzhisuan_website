# 第10章：用LLM分析新闻与情绪

## 学习目标

1. 理解情绪分析在量化交易中的价值和应用场景
2. 掌握调用AI API（OpenAI / DeepSeek）分析财经新闻情绪的方法
3. 学会将文本情绪转化为可量化的数值因子
4. 了解社交媒体情绪数据的获取和处理方式
5. 能搭建一个简单的实时情绪监控系统

---

## 10.1 情绪分析在量化中的价值

市场不是纯理性的。每天影响股价的，除了财务数据和技术指标，还有大量的"情绪"——投资者的恐惧、贪婪、乐观、悲观。

**一个真实的例子：** 2023年某科技公司发布财报，数据本身不差，但CEO在电话会议上措辞谨慎，提到了"宏观不确定性"。当天股价下跌8%。纯看财务数据的模型完全无法预测这个走势，但情绪分析模型可以捕捉到这种负面信号。

**情绪分析的主要应用场景：**

- **事件驱动策略**：重大新闻发布后，快速判断情绪方向，抢在市场反应前布局
- **情绪因子**：将情绪评分作为多因子模型的一个因子
- **风险预警**：当某只股票的负面新闻突然增多，提前减仓
- **市场情绪指数**：监控整体市场情绪，判断牛熊转换

**传统方法 vs LLM方法：**

传统情绪分析用词典法（比如统计"利好"、"利空"等关键词出现次数），简单但粗糙。LLM方法能理解上下文、反讽、专业术语，准确率大幅提升。比如"业绩不及预期但好于最悲观预测"，词典法可能判断为负面，LLM能理解这其实是相对正面的信号。

---

## 10.2 用AI API（OpenAI / DeepSeek）分析财经新闻情绪

**准备工作：获取API密钥**

国内用户推荐使用DeepSeek API，价格低廉且无需翻墙。注册地址：platform.deepseek.com

```python
# 安装依赖
# pip install openai  # DeepSeek兼容OpenAI接口格式

from openai import OpenAI
import json

# 初始化客户端（DeepSeek兼容OpenAI格式）
client = OpenAI(
    api_key="your_deepseek_api_key",
    base_url="https://api.deepseek.com"
)

def analyze_news_sentiment(news_text: str, stock_name: str = "") -> dict:
    """
    分析单条财经新闻的情绪
    
    返回：
    {
        "sentiment": "positive/negative/neutral",
        "score": -1.0 到 1.0 的数值（-1最负面，1最正面）,
        "confidence": 0.0 到 1.0 的置信度,
        "key_points": ["关键点1", "关键点2"],
        "reasoning": "判断理由"
    }
    """
    
    prompt = f"""你是一位专业的财经分析师，请分析以下新闻对{'股票' + stock_name if stock_name else '相关资产'}的情绪影响。

新闻内容：
{news_text}

请严格按照以下JSON格式返回分析结果，不要添加任何其他内容：
{{
    "sentiment": "positive/negative/neutral",
    "score": 数值（-1.0到1.0，-1最负面，0中性，1最正面）,
    "confidence": 数值（0.0到1.0，表示判断的置信度）,
    "key_points": ["影响因素1", "影响因素2"],
    "reasoning": "简短的判断理由（50字以内）"
}}

注意：
- 区分短期影响和长期影响
- 考虑新闻的重要程度
- 如果新闻与股票关联不大，confidence应该较低"""

    response = client.chat.completions.create(
        model="deepseek-chat",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1,  # 低温度保证输出稳定
        max_tokens=500
    )
    
    result_text = response.choices[0].message.content.strip()
    
    # 解析JSON
    try:
        result = json.loads(result_text)
    except json.JSONDecodeError:
        # 如果解析失败，返回默认值
        result = {
            "sentiment": "neutral",
            "score": 0.0,
            "confidence": 0.0,
            "key_points": [],
            "reasoning": "解析失败"
        }
    
    return result

# 测试
news = "贵州茅台发布2024年三季报，前三季度营收同比增长15.6%，净利润同比增长14.9%，超出市场预期。"
result = analyze_news_sentiment(news, "贵州茅台")
print(json.dumps(result, ensure_ascii=False, indent=2))
```

---

## 10.3 构建新闻情绪因子：从文本到数值

单条新闻的情绪分析只是第一步，要把它变成可用的量化因子，还需要做聚合处理。

**情绪因子的构建逻辑：**

1. 收集过去N天内某只股票的所有相关新闻
2. 对每条新闻计算情绪分数（-1到1）
3. 按时间衰减加权平均（越近的新闻权重越高）
4. 得到一个综合情绪分数作为因子值

```python
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import time

def batch_analyze_news(news_list: list, stock_name: str = "", 
                        delay: float = 0.5) -> pd.DataFrame:
    """
    批量分析新闻情绪
    
    news_list: [{"date": "2024-01-01", "title": "...", "content": "..."}, ...]
    delay: 每次API调用之间的延迟（秒），避免触发限流
    """
    results = []
    
    for i, news in enumerate(news_list):
        print(f"处理第 {i+1}/{len(news_list)} 条新闻...")
        
        # 合并标题和内容
        text = news.get('title', '') + '\n' + news.get('content', '')
        
        sentiment_result = analyze_news_sentiment(text, stock_name)
        
        results.append({
            'date': news['date'],
            'title': news.get('title', ''),
            'sentiment': sentiment_result['sentiment'],
            'score': sentiment_result['score'],
            'confidence': sentiment_result['confidence'],
            'reasoning': sentiment_result['reasoning']
        })
        
        time.sleep(delay)  # 避免API限流
    
    return pd.DataFrame(results)


def calculate_sentiment_factor(sentiment_df: pd.DataFrame, 
                                 decay_days: int = 7) -> pd.Series:
    """
    计算时间衰减加权的情绪因子
    
    decay_days: 情绪衰减的半衰期（天）
    """
    sentiment_df = sentiment_df.copy()
    sentiment_df['date'] = pd.to_datetime(sentiment_df['date'])
    sentiment_df = sentiment_df.sort_values('date')
    
    # 按日期聚合（同一天多条新闻取加权平均）
    daily_sentiment = sentiment_df.groupby('date').apply(
        lambda x: np.average(x['score'], weights=x['confidence'])
    ).reset_index()
    daily_sentiment.columns = ['date', 'daily_score']
    daily_sentiment = daily_sentiment.set_index('date')
    
    # 时间衰减加权（指数衰减）
    # 最近的新闻权重高，越久远的权重越低
    def weighted_sentiment(date, df, decay_days):
        past_data = df[df.index <= date].tail(30)  # 最多看30天
        if len(past_data) == 0:
            return 0.0
        
        days_ago = (date - past_data.index).days
        weights = np.exp(-days_ago / decay_days)
        return np.average(past_data['daily_score'], weights=weights)
    
    # 生成每日情绪因子
    all_dates = pd.date_range(daily_sentiment.index.min(), 
                               daily_sentiment.index.max(), freq='D')
    factor_series = pd.Series(
        [weighted_sentiment(d, daily_sentiment, decay_days) for d in all_dates],
        index=all_dates,
        name='sentiment_factor'
    )
    
    return factor_series
```

---

## 10.4 社交媒体数据：微博、雪球、Reddit的情绪挖掘

除了正式的财经新闻，社交媒体上的散户情绪有时更能预测短期价格波动。

**主要数据来源：**

- **雪球**：国内最专业的投资社区，讨论质量较高
- **东方财富股吧**：散户聚集地，情绪波动明显
- **微博财经话题**：传播速度快，适合捕捉突发事件
- **Reddit r/stocks, r/wallstreetbets**：美股散户情绪

**用AI分析社交媒体帖子的提示词：**

```python
def analyze_social_media_post(post_text: str) -> dict:
    """分析社交媒体帖子的情绪（针对散户语言优化）"""
    
    prompt = f"""分析以下股票投资社区帖子的情绪倾向。
注意：这是散户投资者的发言，可能包含口语、网络用语、反讽。

帖子内容：
{post_text}

请返回JSON格式：
{{
    "sentiment": "bullish/bearish/neutral",
    "intensity": 数值（0-1，情绪强度）,
    "is_sarcastic": true/false（是否反讽）,
    "score": 数值（-1到1）
}}

示例：
- "这股要上天了！！！" → bullish, intensity: 0.9, score: 0.8
- "又跌了，哈哈哈" → bearish（反讽），is_sarcastic: true, score: -0.6
- "等等看吧" → neutral, score: 0.0"""

    response = client.chat.completions.create(
        model="deepseek-chat",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1,
        max_tokens=200
    )
    
    return json.loads(response.choices[0].message.content.strip())
```

**注意事项：**
- 社交媒体数据噪声大，需要大量样本才能得到稳定信号
- 要过滤广告、机器人账号
- 散户情绪往往是反向指标（极度乐观时可能是顶部）

---

## 10.5 情绪因子与价格的相关性验证

构建了情绪因子之后，必须验证它是否真的与价格有关联，否则只是自我感觉良好。

```python
import scipy.stats as stats
import matplotlib.pyplot as plt

def validate_sentiment_factor(sentiment_factor: pd.Series, 
                               price_df: pd.DataFrame,
                               forward_days: int = 1) -> dict:
    """
    验证情绪因子与未来收益率的相关性
    
    forward_days: 预测未来几天的收益率
    """
    # 计算未来N日收益率
    price_df = price_df.copy()
    price_df['forward_ret'] = price_df['close'].pct_change(forward_days).shift(-forward_days)
    
    # 对齐日期
    merged = pd.DataFrame({
        'sentiment': sentiment_factor,
        'forward_ret': price_df['forward_ret']
    }).dropna()
    
    # 计算相关系数
    pearson_corr, pearson_p = stats.pearsonr(merged['sentiment'], merged['forward_ret'])
    spearman_corr, spearman_p = stats.spearmanr(merged['sentiment'], merged['forward_ret'])
    
    # 分组分析：将情绪分为5组，看各组的平均收益
    merged['sentiment_quintile'] = pd.qcut(merged['sentiment'], 5, labels=['Q1最悲观', 'Q2', 'Q3', 'Q4', 'Q5最乐观'])
    group_returns = merged.groupby('sentiment_quintile')['forward_ret'].mean()
    
    print(f"皮尔逊相关系数: {pearson_corr:.4f} (p值: {pearson_p:.4f})")
    print(f"斯皮尔曼相关系数: {spearman_corr:.4f} (p值: {spearman_p:.4f})")
    print(f"\n各情绪分组的平均{forward_days}日收益率:")
    print(group_returns.to_string())
    
    return {
        'pearson_corr': pearson_corr,
        'pearson_p': pearson_p,
        'spearman_corr': spearman_corr,
        'group_returns': group_returns
    }
```

**如何解读结果：**
- 相关系数绝对值 > 0.1 且 p值 < 0.05，说明因子有统计显著性
- 分组分析中，Q5（最乐观）的收益率应该高于Q1（最悲观），否则因子方向可能反了
- 注意：相关性不等于因果性，还需要结合经济逻辑判断

---

## 10.6 实时情绪监控系统搭建

```python
import schedule
import time
from datetime import datetime

class SentimentMonitor:
    """简单的实时情绪监控系统"""
    
    def __init__(self, stocks: list, alert_threshold: float = 0.6):
        """
        stocks: 监控的股票列表，如 ["贵州茅台", "宁德时代"]
        alert_threshold: 情绪分数超过此阈值时触发告警
        """
        self.stocks = stocks
        self.alert_threshold = alert_threshold
        self.sentiment_history = {stock: [] for stock in stocks}
    
    def fetch_latest_news(self, stock_name: str) -> list:
        """
        获取最新新闻（实际使用时接入新闻API）
        这里用模拟数据演示
        """
        # 实际项目中，这里接入新闻API，如：
        # - 同花顺新闻API
        # - 东方财富新闻接口
        # - 聚合数据财经新闻API
        return [
            {"title": f"{stock_name}最新公告", "content": "公司发布重要公告..."}
        ]
    
    def check_and_alert(self, stock_name: str):
        """检查情绪并发送告警"""
        news_list = self.fetch_latest_news(stock_name)
        
        for news in news_list:
            text = news['title'] + '\n' + news.get('content', '')
            result = analyze_news_sentiment(text, stock_name)
            
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            
            # 记录历史
            self.sentiment_history[stock_name].append({
                'time': timestamp,
                'score': result['score'],
                'sentiment': result['sentiment']
            })
            
            # 触发告警
            if abs(result['score']) > self.alert_threshold:
                direction = "强烈利好" if result['score'] > 0 else "强烈利空"
                alert_msg = (f"[情绪告警] {timestamp}\n"
                            f"股票: {stock_name}\n"
                            f"方向: {direction}\n"
                            f"分数: {result['score']:.2f}\n"
                            f"理由: {result['reasoning']}")
                print(alert_msg)
                # 实际项目中，这里发送微信/钉钉通知（见第14章）
    
    def run_monitoring(self, interval_minutes: int = 30):
        """启动定时监控"""
        print(f"开始监控 {self.stocks}，每{interval_minutes}分钟检查一次")
        
        for stock in self.stocks:
            schedule.every(interval_minutes).minutes.do(
                self.check_and_alert, stock_name=stock
            )
        
        while True:
            schedule.run_pending()
            time.sleep(60)

# 使用示例
# monitor = SentimentMonitor(stocks=["贵州茅台", "宁德时代"], alert_threshold=0.6)
# monitor.run_monitoring(interval_minutes=30)
```

---

## 实战练习：调用AI API批量分析100条财经新闻，生成情绪评分

### 目标
批量处理100条财经新闻，生成情绪评分表，并进行基本的统计分析。

### 步骤

**Step 1：准备新闻数据**
```python
# 方法1：使用akshare获取真实新闻
import akshare as ak

# 获取东方财富财经新闻
news_df = ak.stock_news_em(symbol="600519")  # 贵州茅台相关新闻
news_df = news_df.head(100)  # 取前100条
print(f"获取到 {len(news_df)} 条新闻")
print(news_df.columns.tolist())
```

**Step 2：批量情绪分析（带进度显示和错误处理）**
```python
import time
from tqdm import tqdm  # pip install tqdm

def batch_analyze_with_retry(news_df, max_retries=3):
    """带重试机制的批量分析"""
    results = []
    
    for idx, row in tqdm(news_df.iterrows(), total=len(news_df), desc="分析进度"):
        title = str(row.get('新闻标题', row.get('title', '')))
        content = str(row.get('新闻内容', row.get('content', '')))
        date = str(row.get('发布时间', row.get('date', '')))
        
        for attempt in range(max_retries):
            try:
                result = analyze_news_sentiment(title + '\n' + content, "贵州茅台")
                results.append({
                    'date': date,
                    'title': title[:50] + '...' if len(title) > 50 else title,
                    'sentiment': result['sentiment'],
                    'score': result['score'],
                    'confidence': result['confidence'],
                    'reasoning': result['reasoning']
                })
                break
            except Exception as e:
                if attempt == max_retries - 1:
                    print(f"第{idx}条新闻分析失败: {e}")
                    results.append({
                        'date': date, 'title': title[:50],
                        'sentiment': 'neutral', 'score': 0.0,
                        'confidence': 0.0, 'reasoning': '分析失败'
                    })
                time.sleep(1)
        
        time.sleep(0.3)  # 控制API调用频率
    
    return pd.DataFrame(results)

# 执行批量分析
result_df = batch_analyze_with_retry(news_df)
result_df.to_csv('sentiment_results.csv', index=False, encoding='utf-8-sig')
print("分析完成，结果已保存到 sentiment_results.csv")
```

**Step 3：统计分析与可视化**
```python
import matplotlib.pyplot as plt
import matplotlib
matplotlib.rcParams['font.sans-serif'] = ['SimHei']  # 支持中文

# 基本统计
print("=== 情绪分析统计 ===")
print(f"总新闻数: {len(result_df)}")
print(f"正面新闻: {(result_df['sentiment']=='positive').sum()} 条")
print(f"负面新闻: {(result_df['sentiment']=='negative').sum()} 条")
print(f"中性新闻: {(result_df['sentiment']=='neutral').sum()} 条")
print(f"平均情绪分数: {result_df['score'].mean():.4f}")
print(f"情绪分数标准差: {result_df['score'].std():.4f}")

# 可视化
fig, axes = plt.subplots(1, 2, figsize=(12, 4))

# 情绪分布饼图
sentiment_counts = result_df['sentiment'].value_counts()
axes[0].pie(sentiment_counts.values, labels=sentiment_counts.index, autopct='%1.1f%%')
axes[0].set_title('新闻情绪分布')

# 情绪分数直方图
axes[1].hist(result_df['score'], bins=20, color='steelblue', edgecolor='white')
axes[1].axvline(x=0, color='red', linestyle='--', label='中性线')
axes[1].set_xlabel('情绪分数')
axes[1].set_ylabel('频次')
axes[1].set_title('情绪分数分布')
axes[1].legend()

plt.tight_layout()
plt.savefig('sentiment_analysis.png', dpi=150)
plt.show()
print("图表已保存")
```

---

## 常见问题 Q&A

**Q1：新闻情绪分析得到“正面”，是不是就可以直接买入？**

A：不能。情绪分数只说明文本倾向，不代表市场一定按这个方向反应。真正影响价格的，是消息是否超预期、市场是否已经提前定价、流动性是否支持交易。

**Q2：为什么同一条新闻，不同模型可能给出不同情绪判断？**

A：因为模型的训练语料、金融语境理解能力、提示词约束和输出格式都不同。对量化研究来说，比“追求唯一正确标签”更重要的是建立一致的标注口径和可复核流程。

**Q3：情绪因子最大的工程难点是什么？**

A：通常不是单条新闻分析，而是批量处理后的聚合与验证：同一公司一天多条消息怎么合并、旧消息多久衰减、不同来源权重是否不同，以及这些规则能否在回测中站住脚。

---

## 本章小结

本章介绍了如何用LLM将非结构化的新闻文本转化为可量化的情绪因子。核心流程是：调用AI API分析单条新闻 → 批量处理并聚合 → 时间衰减加权构建因子 → 验证因子有效性。LLM相比传统词典法的优势在于能理解上下文和专业术语，但成本和速度是需要权衡的因素。

---

## 课后思考题

1. 情绪因子在哪些市场环境下可能失效？比如在极端行情（熔断、涨停板）时，情绪分析还有参考价值吗？

2. 如果同一天关于某只股票有10条新闻，其中8条正面、2条极度负面，你会如何设计聚合方式？简单平均和加权平均哪个更合理？

3. 散户情绪（股吧帖子）和机构情绪（研报摘要）对股价的影响方向可能不同。你认为在什么时间窗口内，哪种情绪信号更有预测价值？
