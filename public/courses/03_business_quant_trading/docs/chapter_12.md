# 第12章：多智能体量化研究框架

## 学习目标

1. 理解多智能体（Multi-Agent）系统的基本概念和在量化中的应用价值
2. 掌握量化场景下各类Agent的角色设计方法
3. 能用Python搭建简单的多Agent协作流程
4. 理解多Agent系统的局限性和人工干预的必要性
5. 完成一个"AI选股 + AI生成分析报告"的两步Agent实战

---

## 12.1 多智能体的概念：分工协作的AI团队

想象一家量化基金的研究团队：有人专门找数据、有人设计策略、有人做风险评估、有人写报告。每个人专注自己的领域，通过协作完成复杂任务。

多智能体（Multi-Agent）系统就是把这个概念搬到AI上——让多个AI各司其职，通过协作完成单个AI难以完成的复杂任务。

**为什么需要多个Agent，而不是一个超级AI？**

1. **专注性**：每个Agent只做一件事，提示词更精准，输出质量更高
2. **可维护性**：某个环节出问题，只需要修改对应的Agent
3. **并行处理**：多个Agent可以同时工作，提高效率
4. **错误隔离**：一个Agent的错误不会直接污染整个流程

**类比：** 单个AI就像一个全能但精力分散的人，多Agent就像一个分工明确的团队。团队的整体产出通常优于单人。

**量化研究中的典型多Agent场景：**

- 数据收集Agent → 特征工程Agent → 模型训练Agent → 风险评估Agent → 报告生成Agent
- 新闻监控Agent → 情绪分析Agent → 交易信号Agent → 执行Agent
- 选股Agent → 组合优化Agent → 风控Agent → 报告Agent

---

## 12.2 角色设计：数据分析师Agent、策略设计Agent、风控Agent

好的Agent设计需要明确三件事：**职责边界**、**输入格式**、**输出格式**。

**数据分析师Agent**

```python
DATA_ANALYST_SYSTEM_PROMPT = """
你是一位专业的量化数据分析师。你的职责是：
1. 分析给定的股票数据，识别关键特征和异常
2. 计算基本的统计指标（均值、标准差、相关性等）
3. 发现数据中的潜在问题（缺失值、异常值、数据质量问题）
4. 提供数据摘要，为后续策略设计提供基础

你的输出必须是结构化的JSON格式，包含：
- data_summary: 数据基本情况
- key_statistics: 关键统计指标
- data_issues: 发现的数据问题
- recommendations: 对后续分析的建议

你不负责设计交易策略，只负责数据分析。
"""
```

**策略设计Agent**

```python
STRATEGY_DESIGNER_SYSTEM_PROMPT = """
你是一位经验丰富的量化策略设计师，专注于A股市场。你的职责是：
1. 基于数据分析结果，设计具体的交易策略
2. 明确策略的选股逻辑、进出场规则、调仓频率
3. 评估策略的理论依据和预期表现
4. 生成策略的伪代码或Python代码框架

你的输出必须包含：
- strategy_name: 策略名称
- core_logic: 核心逻辑（100字以内）
- entry_rules: 进场规则
- exit_rules: 出场规则
- position_sizing: 仓位管理
- expected_performance: 预期表现（保守估计）
- risks: 主要风险点

你不负责风险管理细节，只负责策略逻辑设计。
"""
```

**风控Agent**

```python
RISK_MANAGER_SYSTEM_PROMPT = """
你是一位严格的量化风险管理专家。你的职责是：
1. 评估策略的风险暴露（市场风险、流动性风险、模型风险）
2. 检查策略是否存在过拟合、数据泄露等问题
3. 提出具体的风险控制措施（止损、仓位限制、相关性控制）
4. 给出策略的风险评级（低/中/高）

你的输出必须包含：
- risk_rating: 风险评级（低/中/高）
- risk_factors: 主要风险因素列表
- risk_controls: 建议的风险控制措施
- red_flags: 需要特别注意的警示信号
- approval: 是否建议进入回测阶段（true/false）

你的立场是保守的，宁可错杀也不放过潜在风险。
"""
```

---

## 12.3 用LangChain / AutoGen搭建简单的多Agent流程

这里我们用一个更轻量的方式实现多Agent，不依赖复杂框架，直接用Python类封装。

```python
from openai import OpenAI
import json
from typing import Optional

client = OpenAI(
    api_key="your_api_key",
    base_url="https://api.deepseek.com"
)

class QuantAgent:
    """量化研究Agent基类"""
    
    def __init__(self, name: str, system_prompt: str, model: str = "deepseek-chat"):
        self.name = name
        self.system_prompt = system_prompt
        self.model = model
        self.conversation_history = []
    
    def think(self, user_message: str, context: Optional[dict] = None) -> str:
        """
        Agent思考并返回结果
        
        user_message: 用户/上游Agent的输入
        context: 额外的上下文信息
        """
        # 构建消息
        if context:
            full_message = f"{user_message}\n\n上下文信息：\n{json.dumps(context, ensure_ascii=False, indent=2)}"
        else:
            full_message = user_message
        
        messages = [
            {"role": "system", "content": self.system_prompt},
            {"role": "user", "content": full_message}
        ]
        
        response = client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=0.3,
            max_tokens=2000
        )
        
        result = response.choices[0].message.content
        print(f"\n[{self.name}] 完成分析")
        return result
    
    def think_json(self, user_message: str, context: Optional[dict] = None) -> dict:
        """返回JSON格式的结果"""
        result = self.think(user_message, context)
        try:
            # 提取JSON部分（有时AI会在JSON前后加说明文字）
            start = result.find('{')
            end = result.rfind('}') + 1
            if start >= 0 and end > start:
                return json.loads(result[start:end])
        except:
            pass
        return {"raw_output": result}


class QuantResearchPipeline:
    """量化研究多Agent流水线"""
    
    def __init__(self):
        # 初始化各个Agent
        self.data_analyst = QuantAgent(
            name="数据分析师",
            system_prompt=DATA_ANALYST_SYSTEM_PROMPT
        )
        self.strategy_designer = QuantAgent(
            name="策略设计师",
            system_prompt=STRATEGY_DESIGNER_SYSTEM_PROMPT
        )
        self.risk_manager = QuantAgent(
            name="风控专家",
            system_prompt=RISK_MANAGER_SYSTEM_PROMPT
        )
    
    def run(self, research_request: str, market_data_summary: dict) -> dict:
        """
        运行完整的研究流水线
        
        research_request: 研究需求描述
        market_data_summary: 市场数据摘要
        """
        print("=" * 50)
        print("启动量化研究多Agent流水线")
        print("=" * 50)
        
        # Step 1: 数据分析
        print("\n[Step 1] 数据分析师开始工作...")
        data_analysis = self.data_analyst.think_json(
            f"请分析以下市场数据，为策略设计提供基础：\n{research_request}",
            context=market_data_summary
        )
        
        # Step 2: 策略设计（基于数据分析结果）
        print("\n[Step 2] 策略设计师开始工作...")
        strategy_design = self.strategy_designer.think_json(
            f"基于数据分析结果，请设计一个量化策略。研究需求：{research_request}",
            context=data_analysis
        )
        
        # Step 3: 风险评估（基于策略设计）
        print("\n[Step 3] 风控专家开始评估...")
        risk_assessment = self.risk_manager.think_json(
            "请评估以下策略的风险，并决定是否可以进入回测阶段。",
            context={
                "data_analysis": data_analysis,
                "strategy_design": strategy_design
            }
        )
        
        # 汇总结果
        final_report = {
            "research_request": research_request,
            "data_analysis": data_analysis,
            "strategy_design": strategy_design,
            "risk_assessment": risk_assessment,
            "pipeline_status": "approved" if risk_assessment.get("approval") else "rejected"
        }
        
        print(f"\n流水线完成！状态：{final_report['pipeline_status']}")
        return final_report
```

---

## 12.4 案例：AI自动完成"选股 → 回测 → 报告"全流程

```python
def ai_stock_selection_agent(market_data: pd.DataFrame, 
                               criteria: str) -> dict:
    """
    AI选股Agent：根据指定标准从市场数据中选出股票
    """
    agent = QuantAgent(
        name="选股Agent",
        system_prompt="""
你是专业的A股选股分析师。
给定市场数据和选股标准，你需要：
1. 分析每只股票是否符合标准
2. 给出选股理由
3. 按优先级排序
输出JSON格式：{"selected_stocks": [...], "reasoning": {...}}
"""
    )
    
    # 准备数据摘要（不能把全部数据都传给AI，太多了）
    data_summary = {
        "total_stocks": len(market_data),
        "date_range": f"{market_data.index.min()} 到 {market_data.index.max()}",
        "sample_data": market_data.describe().to_dict()
    }
    
    result = agent.think_json(
        f"选股标准：{criteria}",
        context=data_summary
    )
    
    return result


def ai_report_generator(backtest_results: dict, strategy_info: dict) -> str:
    """
    AI报告生成Agent：根据回测结果生成分析报告
    """
    agent = QuantAgent(
        name="报告生成Agent",
        system_prompt="""
你是专业的量化研究报告撰写专家。
请根据回测结果生成一份专业的策略分析报告，包含：
1. 策略概述
2. 回测表现分析（收益、风险、与基准对比）
3. 策略优势与局限性
4. 改进建议
5. 结论

报告风格：专业、客观、数据驱动，避免过度乐观。
"""
    )
    
    report = agent.think(
        "请生成策略分析报告",
        context={
            "strategy_info": strategy_info,
            "backtest_results": backtest_results
        }
    )
    
    return report


# 使用示例
# 模拟回测结果
mock_backtest_results = {
    "annual_return": 0.18,
    "max_drawdown": -0.15,
    "sharpe_ratio": 1.2,
    "win_rate": 0.55,
    "total_trades": 240,
    "benchmark_return": 0.08,
    "alpha": 0.10
}

mock_strategy_info = {
    "name": "A股动量选股策略",
    "logic": "选择过去3个月涨幅前20%的股票，月度调仓",
    "universe": "沪深300成分股",
    "backtest_period": "2020-2024"
}

# 生成报告
report = ai_report_generator(mock_backtest_results, mock_strategy_info)
print(report)
```

---

## 12.5 局限性与人工干预的必要性

多Agent系统听起来很美好，但在量化实战中有几个重要局限性必须清楚。

**局限性1：AI不能替代数据验证**

AI分析的是你给它的数据摘要，而不是原始数据。如果数据本身有问题（比如复权错误、停牌数据处理不当），AI无法发现。数据质量检查必须由人工完成。

**局限性2：AI的"幻觉"问题**

AI有时会生成听起来合理但实际上错误的分析。比如它可能引用一个不存在的研究结论，或者给出一个在数学上不成立的策略逻辑。所有AI输出都需要人工验证。

**局限性3：上下文长度限制**

当前AI模型的上下文窗口有限，无法处理大量原始数据。你只能传入数据摘要，这意味着AI看不到完整的数据细节。

**局限性4：成本问题**

每次API调用都有成本。一个复杂的多Agent流程可能需要调用10-20次API，成本不可忽视。

**人工干预的关键节点：**

1. 数据质量检查（必须人工）
2. 策略逻辑的经济学合理性验证（人工判断）
3. 回测结果的真实性验证（人工检查代码）
4. 实盘上线前的最终审批（必须人工）

**最佳实践：** 把多Agent系统当作"初稿生成器"，而不是"最终决策者"。AI负责快速生成方案，人工负责审核和最终决策。

---

## 实战练习：搭建一个两步Agent流程：AI选股 + AI生成分析报告

### 目标
搭建一个两步Agent流程：第一步AI根据财务指标选股，第二步AI生成选股分析报告。

### 步骤

**Step 1：获取财务数据**
```python
import akshare as ak
import pandas as pd

# 获取A股财务指标数据
def get_financial_data() -> pd.DataFrame:
    """获取A股主要财务指标"""
    # 获取沪深300成分股
    hs300 = ak.index_stock_cons_weight_csindex(symbol="000300")
    stock_codes = hs300['成分券代码'].tolist()[:50]  # 取前50只演示
    
    financial_data = []
    for code in stock_codes:
        try:
            # 获取财务指标
            indicator = ak.stock_financial_analysis_indicator(symbol=code, start_year="2023")
            if len(indicator) > 0:
                latest = indicator.iloc[0]
                financial_data.append({
                    'stock_code': code,
                    'roe': float(latest.get('净资产收益率', 0) or 0),
                    'pe_ratio': float(latest.get('市盈率', 0) or 0),
                    'revenue_growth': float(latest.get('营业收入增长率', 0) or 0),
                    'debt_ratio': float(latest.get('资产负债率', 0) or 0)
                })
        except Exception as e:
            continue
    
    return pd.DataFrame(financial_data)

print("获取财务数据...")
financial_df = get_financial_data()
print(f"获取到 {len(financial_df)} 只股票的财务数据")
```

**Step 2：AI选股Agent**
```python
def run_stock_selection_agent(financial_df: pd.DataFrame) -> dict:
    """运行AI选股Agent"""
    
    # 准备数据摘要
    data_summary = {
        "total_stocks": len(financial_df),
        "roe_stats": financial_df['roe'].describe().to_dict(),
        "pe_stats": financial_df['pe_ratio'].describe().to_dict(),
        "top_roe_stocks": financial_df.nlargest(10, 'roe')[['stock_code', 'roe', 'pe_ratio']].to_dict('records'),
        "low_pe_stocks": financial_df[financial_df['pe_ratio'] > 0].nsmallest(10, 'pe_ratio')[['stock_code', 'roe', 'pe_ratio']].to_dict('records')
    }
    
    selection_agent = QuantAgent(
        name="选股Agent",
        system_prompt="""
你是专业的A股价值投资选股分析师。
请根据财务数据，按照以下标准筛选优质股票：
1. ROE > 15%（盈利能力强）
2. PE合理（不过高）
3. 营收增长稳定
4. 负债率适中

输出JSON格式：
{
    "selected_stocks": ["股票代码1", "股票代码2", ...],
    "selection_criteria": "选股标准说明",
    "stock_analysis": {
        "股票代码": "简短分析"
    },
    "portfolio_characteristics": "组合特征描述"
}
"""
    )
    
    result = selection_agent.think_json(
        "请根据以下财务数据，筛选出5-10只值得关注的优质股票",
        context=data_summary
    )
    
    return result


# 执行选股
print("\n运行AI选股Agent...")
selection_result = run_stock_selection_agent(financial_df)
print(f"\n选出股票：{selection_result.get('selected_stocks', [])}")
```

**Step 3：AI报告生成Agent**
```python
def run_report_generation_agent(selection_result: dict, 
                                  financial_df: pd.DataFrame) -> str:
    """运行AI报告生成Agent"""
    
    # 获取选中股票的详细数据
    selected_codes = selection_result.get('selected_stocks', [])
    selected_data = financial_df[financial_df['stock_code'].isin(selected_codes)]
    
    report_agent = QuantAgent(
        name="报告生成Agent",
        system_prompt="""
你是专业的投资研究报告撰写专家。
请根据选股结果生成一份简洁的选股分析报告。

报告格式：
# 选股分析报告
## 报告摘要
## 选股方法论
## 入选股票分析
## 组合特征
## 风险提示
## 结论

要求：
- 客观中立，不夸大收益预期
- 必须包含风险提示
- 语言专业但易懂
"""
    )
    
    report = report_agent.think(
        "请生成选股分析报告",
        context={
            "selection_result": selection_result,
            "selected_stocks_data": selected_data.to_dict('records')
        }
    )
    
    return report


# 生成报告
print("\n运行AI报告生成Agent...")
report = run_report_generation_agent(selection_result, financial_df)

# 保存报告
with open('stock_selection_report.md', 'w', encoding='utf-8') as f:
    f.write(report)

print("\n报告已生成并保存到 stock_selection_report.md")
print("\n报告预览（前500字）：")
print(report[:500])
```

---

## 常见问题 Q&A

**Q1：多 Agent 系统是不是天然比单 Agent 更强？**

A：不是。多 Agent 的优势来自明确分工和可审查的中间结果，而不是“Agent 数量越多越聪明”。如果边界不清、输入输出混乱，多 Agent 只会把复杂度和成本同时放大。

**Q2：什么时候应该拆成多个 Agent？**

A：当一个任务同时包含明显不同的职责时，例如数据整理、选股判断、风控审查、报告生成，这时拆分更有价值。如果只是一个短流程里的连续小步骤，硬拆成多 Agent 往往得不偿失。

**Q3：多 Agent 最常见的失败模式是什么？**

A：最常见的不是“某个 Agent 太弱”，而是上游输出含糊、下游默认接受，导致错误在链路里层层传递。所以每个 Agent 最好都要有明确格式、边界条件和失败处理。

---

## 本章小结

本章介绍了多智能体系统在量化研究中的应用。核心思路是将复杂的研究流程拆分为多个专注的Agent，每个Agent有明确的职责边界和输入输出格式。实现上不需要复杂框架，用Python类封装就能完成基本的多Agent协作。关键是要清醒认识多Agent系统的局限性：AI是辅助工具，数据验证、逻辑审查和最终决策必须由人工完成。

---

## 课后思考题

1. 在多Agent流程中，如果"策略设计Agent"给出了一个听起来合理但实际上存在数据泄露的策略，"风控Agent"能发现这个问题吗？为什么？这说明了什么？

2. 设计一个"市场环境判断Agent"，它的职责是判断当前市场是牛市、熊市还是震荡市，并给出对应的策略建议。请写出它的System Prompt。

3. 多Agent系统的API调用成本可能很高。如果你每天需要分析100只股票，每只股票经过3个Agent处理，每次API调用成本约0.01元，一个月的成本是多少？如何优化以降低成本？
