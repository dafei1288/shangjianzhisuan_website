# 第9章：机器学习在量化中的应用

## 学习目标

1. 理解机器学习在量化交易中的三种主要应用方向：预测、分类、强化学习
2. 掌握特征工程的基本方法，能将技术指标转化为ML模型的输入
3. 学会使用随机森林、XGBoost等常用模型进行量化建模
4. 理解时间序列数据的正确划分方式，避免数据泄露
5. 能借助AI工具快速完成特征工程和模型训练代码的编写

---

## 9.1 ML在量化中的定位：预测 vs 分类 vs 强化学习

很多人第一次听到"机器学习用于量化交易"，脑子里浮现的画面是：一个神奇的AI，输入历史价格，输出明天的精确涨跌幅。这个想法很美好，但现实要复杂得多。

**机器学习在量化中主要有三种用法：**

**1. 回归预测（Regression）**
目标是预测一个具体数值，比如"明天的收益率是多少"。这类任务难度极高，因为金融市场的噪声太大，预测精度往往令人失望。但在某些场景下仍有价值，比如预测波动率、预测因子收益。

**2. 分类预测（Classification）**
目标是预测一个类别，比如"明天是涨还是跌"。这比精确预测涨跌幅要容易一些，因为只需要判断方向。如果能做到55%的准确率，配合合理的仓位管理，就可能产生稳定收益。

**3. 强化学习（Reinforcement Learning）**
把交易本身当成一个游戏，让AI通过不断试错学习最优的交易策略。这是最前沿也最复杂的方向，目前在实盘中应用还比较有限，但研究价值很高。

**类比理解：** 把股票市场想象成天气预报。回归预测相当于预测明天的精确温度（很难），分类预测相当于预测明天是晴天还是雨天（相对容易），强化学习相当于训练一个AI学会根据天气变化做出最优决策。

对于初学者，**分类预测**是最好的入门方向，本章实战也将围绕这个方向展开。

---

## 9.2 特征工程：把技术指标变成ML的输入

机器学习模型不能直接"看"K线图，它只能处理数字。特征工程就是把原始数据转化为模型能理解的数字特征的过程。

**常用的量化特征类型：**

**价格类特征**
- 收益率：`(今日收盘 - 昨日收盘) / 昨日收盘`
- 价格相对位置：`(收盘价 - 20日最低) / (20日最高 - 20日最低)`，表示价格在近期区间的位置

**技术指标类特征**
- RSI（相对强弱指数）：衡量超买超卖
- MACD：趋势和动量的综合指标
- 布林带宽度：衡量波动率
- 成交量变化率：量价关系

**统计类特征**
- 过去N日收益率的均值、标准差
- 偏度（Skewness）：收益率分布是否偏斜
- 自相关系数：价格序列的记忆性

**关键原则：特征要有经济含义**

不要为了凑特征数量而随意添加。每个特征都应该有一个合理的逻辑解释，比如"RSI高说明近期涨幅过大，可能面临回调"。没有逻辑支撑的特征很容易导致过拟合。

另一个专业原则是：**特征必须在预测时点真正可得**。这句话听上去简单，但实务里最容易犯错。比如你要在今天收盘后决定明天是否买入，那么今天收盘价、今天成交量是可得的；明天开盘价、明天成交额、明天是否涨停则绝对不可得。

```python
import pandas as pd
import numpy as np

def create_features(df):
    """
    输入：包含 open, high, low, close, volume 列的 DataFrame
    输出：添加了特征列的 DataFrame
    """
    df = df.copy()
    
    # 1. 收益率特征
    df['ret_1d'] = df['close'].pct_change(1)      # 1日收益率
    df['ret_5d'] = df['close'].pct_change(5)      # 5日收益率
    df['ret_20d'] = df['close'].pct_change(20)    # 20日收益率
    
    # 2. 移动平均特征
    df['ma5'] = df['close'].rolling(5).mean()
    df['ma20'] = df['close'].rolling(20).mean()
    df['ma_ratio'] = df['ma5'] / df['ma20']       # 短期均线/长期均线，>1表示短期强于长期
    
    # 3. 波动率特征
    df['volatility_20d'] = df['ret_1d'].rolling(20).std()
    
    # 4. RSI（简化版）
    delta = df['close'].diff()
    gain = delta.where(delta > 0, 0).rolling(14).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(14).mean()
    df['rsi'] = 100 - (100 / (1 + gain / loss))
    
    # 5. 成交量特征
    df['volume_ratio'] = df['volume'] / df['volume'].rolling(20).mean()
    
    # 6. 价格位置特征（在近期区间的相对位置）
    df['price_position'] = (df['close'] - df['close'].rolling(20).min()) / \
                           (df['close'].rolling(20).max() - df['close'].rolling(20).min() + 1e-8)
    
    # 目标变量：次日是否上涨（1=涨，0=跌）
    df['target'] = (df['close'].shift(-1) > df['close']).astype(int)
    
    return df.dropna()
```

### 标签设计决定了你在解决什么问题

很多新手以为“做了 target 列就算标签设计完成”，其实不是。标签定义本身就是策略假设的一部分。

常见标签设计有三类：

1. **方向标签**：次日涨跌，适合做分类。
2. **收益标签**：未来 N 日收益率，适合做回归。
3. **阈值标签**：未来 5 日收益率是否超过 2%，适合只抓“有意义的机会”。

三者没有高下之分，但会直接影响：

- 样本是否平衡
- 模型是否容易学到稳定规律
- 最终信号能否转成真实交易动作

例如，若你只定义“未来 5 日涨幅超过 3% 才算正样本”，那模型学习的就不是“每天涨跌方向”，而是“筛选出可能出现显著上涨的少数时刻”。这往往更贴近实盘信号生成逻辑。

---

## 9.3 常用模型：线性回归、随机森林、XGBoost

**线性回归（Logistic Regression）**

最简单的分类模型，假设特征和目标之间是线性关系。优点是可解释性强，训练快；缺点是无法捕捉非线性关系。适合作为基准模型（Baseline）。

**随机森林（Random Forest）**

由很多棵决策树组成的"森林"。每棵树独立做判断，最终投票决定结果。类比：就像让100个分析师各自独立分析，然后取多数意见，比单个分析师更稳定。

优点：不容易过拟合，对异常值不敏感，能处理非线性关系；缺点：模型较大，预测速度慢。

**XGBoost**

梯度提升树的高效实现，是量化领域最常用的模型之一。与随机森林的"并行投票"不同，XGBoost是"串行纠错"——每棵新树专门修正前面树的错误。

优点：预测精度高，支持特征重要性分析；缺点：超参数较多，调参需要经验。

```python
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
import xgboost as xgb
from sklearn.metrics import accuracy_score, classification_report

# 假设 X_train, X_test, y_train, y_test 已经准备好
# （具体划分方式见9.4节）

# 随机森林
rf_model = RandomForestClassifier(
    n_estimators=100,    # 100棵树
    max_depth=5,         # 每棵树最深5层，防止过拟合
    random_state=42
)
rf_model.fit(X_train, y_train)
rf_pred = rf_model.predict(X_test)
print(f"随机森林准确率: {accuracy_score(y_test, rf_pred):.4f}")

# XGBoost
xgb_model = xgb.XGBClassifier(
    n_estimators=100,
    max_depth=4,
    learning_rate=0.1,
    random_state=42,
    eval_metric='logloss'
)
xgb_model.fit(X_train, y_train)
xgb_pred = xgb_model.predict(X_test)
print(f"XGBoost准确率: {accuracy_score(y_test, xgb_pred):.4f}")
```

---

## 9.4 时间序列的特殊处理：防止数据泄露的正确划分方式

这是初学者最容易犯的致命错误，必须重点理解。

**什么是数据泄露？**

假设你有2020年到2024年的数据，你随机抽取20%作为测试集。这意味着测试集里可能有2020年的数据，而训练集里有2021年的数据。模型在训练时"看到了未来"，这就是数据泄露。

**类比：** 这就像考试前把答案混进了练习题里。你的练习成绩会很好，但真正考试时就露馅了。

**正确的时间序列划分方式：**

```python
def time_series_split(df, train_ratio=0.7, val_ratio=0.15):
    """
    按时间顺序划分数据集，绝对不能随机打乱！
    
    train_ratio: 训练集比例
    val_ratio: 验证集比例
    剩余部分为测试集
    """
    n = len(df)
    train_end = int(n * train_ratio)
    val_end = int(n * (train_ratio + val_ratio))
    
    train = df.iloc[:train_end]
    val = df.iloc[train_end:val_end]
    test = df.iloc[val_end:]
    
    print(f"训练集: {train.index[0]} 到 {train.index[-1]}，共 {len(train)} 条")
    print(f"验证集: {val.index[0]} 到 {val.index[-1]}，共 {len(val)} 条")
    print(f"测试集: {test.index[0]} 到 {test.index[-1]}，共 {len(test)} 条")
    
    return train, val, test

# 特征列
feature_cols = ['ret_1d', 'ret_5d', 'ret_20d', 'ma_ratio', 
                'volatility_20d', 'rsi', 'volume_ratio', 'price_position']

train_df, val_df, test_df = time_series_split(df)

X_train = train_df[feature_cols]
y_train = train_df['target']
X_val = val_df[feature_cols]
y_val = val_df['target']
X_test = test_df[feature_cols]
y_test = test_df['target']
```

**另一个常见陷阱：特征计算时的未来数据**

计算20日移动平均时，要确保只用到当天及之前的数据。`rolling(20).mean()` 默认是正确的（用过去20天），但如果你用了 `shift(-1)` 之类的操作，就要特别小心。

### 四种高频数据泄露场景

除了随机切分训练集 / 测试集，量化 ML 里还有四类常见泄露：

1. **标准化泄露**：先用全量数据做 `fit_transform()`，再拆分训练测试。
2. **横截面泄露**：同一天不同股票之间共享了本不该共享的信息。
3. **调参泄露**：反复在测试集上看结果并改参数，测试集被“用成了训练集”。
4. **标签穿越**：标签窗口与特征窗口重叠，未来收益部分被模型间接看到了。

专业流程里，预处理器、特征筛选器、降维器，都应该只在训练集上 `fit`，再把参数应用到验证集和测试集。

---

## 9.5 模型评估：不能只看准确率

在量化中，准确率（Accuracy）是最容易误导人的指标。

**为什么准确率不够？**

假设市场有60%的天数是上涨的，那么一个"永远预测涨"的傻瓜模型准确率就有60%。但这个模型毫无价值。

**更重要的评估指标：**

- **精确率（Precision）**：预测为涨的里面，真正涨了多少？
- **召回率（Recall）**：真正涨的里面，被正确预测到多少？
- **F1分数**：精确率和召回率的调和平均
- **AUC-ROC**：模型区分涨跌的综合能力，0.5是随机，越接近1越好

**量化特有的评估方式：**

最终还是要看策略的实际表现——年化收益率、最大回撤、夏普比率。一个准确率只有53%的模型，如果它在"涨幅大"的时候更准确，可能比准确率60%但随机的模型更有价值。

### Baseline 意识：先打败简单规则，再谈模型价值

在量化里，机器学习模型不是只要“比随机好一点”就算成功。你至少要跟三类 baseline 比较：

1. **随机预测**
2. **永远看多 / 永远空仓**
3. **简单规则策略**，如双均线、动量、均值回归

如果一个复杂模型最终只比“双均线策略 + 良好风控”略好一点，甚至还不如后者稳定，那么它的工程复杂度和维护成本可能就不值得。

所以专业研究的顺序通常是：

```text
先做简单规则 baseline
    ->
确认 ML 是否真的增加了预测信息
    ->
再决定是否投入更复杂的特征和模型
```

```python
from sklearn.metrics import roc_auc_score, classification_report

# 综合评估
print("=== 模型评估报告 ===")
print(classification_report(y_test, rf_pred, target_names=['跌', '涨']))
print(f"AUC-ROC: {roc_auc_score(y_test, rf_model.predict_proba(X_test)[:, 1]):.4f}")

# 特征重要性（随机森林）
feature_importance = pd.Series(
    rf_model.feature_importances_, 
    index=feature_cols
).sort_values(ascending=False)
print("\n特征重要性排名：")
print(feature_importance)
```

---

## 9.6 用AI辅助建模：让AI写特征工程和模型训练代码

AI工具可以大幅加速量化建模的过程，尤其是在特征工程和代码编写方面。

**实际提示词示例：**

```
提示词1：特征工程设计
"我在做A股日线数据的涨跌预测（分类问题）。
数据包含：open, high, low, close, volume, 日期。
请帮我设计10-15个有量化逻辑支撑的特征，
要求：
1. 每个特征说明经济含义
2. 给出Python计算代码（用pandas）
3. 指出哪些特征可能存在多重共线性"
```

```
提示词2：模型调参
"我用随机森林预测股票涨跌，训练集准确率0.62，测试集0.51，
明显过拟合。请帮我：
1. 分析过拟合的可能原因
2. 给出3种解决方案
3. 提供调整后的代码"
```

```
提示词3：结果解读
"我的XGBoost模型在测试集上AUC=0.54，准确率=0.53。
请帮我判断：
1. 这个结果有没有实用价值？
2. 如何将这个模型转化为实际的交易策略？
3. 还有哪些改进方向？"
```

---

## 9.7 深度学习初探：LSTM预测价格的原理与局限

LSTM（长短期记忆网络）是一种专门处理序列数据的神经网络，理论上很适合时间序列预测。

**LSTM的直觉理解：** 普通神经网络每次只看当前输入，LSTM有"记忆"，能记住之前的信息。就像一个有记忆的分析师，不只看今天的数据，还记得上周、上个月发生了什么。

**为什么LSTM在量化中效果常常令人失望？**

1. **金融数据噪声太大**：股价受太多随机因素影响，LSTM的"记忆"可能记住的是噪声而非规律
2. **数据量不足**：深度学习需要大量数据，A股单只股票的日线数据通常只有几千条
3. **过拟合严重**：LSTM参数多，在小数据集上极易过拟合
4. **可解释性差**：无法解释为什么做出某个预测，风险管理困难

**建议：** 初学者先把随机森林和XGBoost用好，再考虑深度学习。深度学习不是银弹，在量化领域的实际效果往往不如预期。

### 从模型输出到交易信号，中间还差一层决策规则

模型给你的往往不是“买还是卖”，而是一个概率或分数。真正的策略要再补一层交易决策：

1. 设置信号阈值，例如 `pred_proba > 0.55` 才买入
2. 设定持有周期，例如持有 1 天、5 天，还是直到信号反转
3. 设定仓位映射，例如概率越高仓位越大
4. 叠加风控规则，例如回撤超限就暂停该模型

这一步很关键，因为模型指标不错，不代表策略收益一定好。很多模型在统计意义上“略有预测力”，但扣除交易成本后没有任何实盘价值。

---

## 实战练习：用随机森林预测次日涨跌方向

### 目标
用随机森林模型预测A股某只股票次日是否上涨，AI辅助完成全流程。

### 步骤

**Step 1：获取数据**
```python
# 使用 akshare 获取股票数据
import akshare as ak
import pandas as pd

# 获取贵州茅台日线数据
df = ak.stock_zh_a_hist(symbol="600519", period="daily", 
                         start_date="20200101", end_date="20241231",
                         adjust="qfq")  # 前复权
df.columns = ['date', 'open', 'close', 'high', 'low', 'volume', 
              'amount', 'amplitude', 'pct_change', 'change', 'turnover']
df['date'] = pd.to_datetime(df['date'])
df = df.set_index('date').sort_index()
print(f"数据形状: {df.shape}")
print(df.head())
```

**Step 2：用AI生成特征工程代码**

打开Claude或DeepSeek，输入以下提示词：
```
我有一份A股日线数据，列名为：open, close, high, low, volume
请帮我写一个Python函数，生成以下特征：
1. 1日、5日、10日、20日收益率
2. 5日、20日均线比值
3. 14日RSI
4. 20日波动率
5. 成交量20日比值
6. 布林带位置（当前价格在布林带中的相对位置）
要求：代码完整可运行，使用pandas，不引入额外库
```

**Step 3：完整建模流程**
```python
# 完整流程（整合前面各节代码）
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, roc_auc_score, classification_report
import warnings
warnings.filterwarnings('ignore')

# 1. 特征工程
df_features = create_features(df)  # 使用9.2节的函数

# 2. 时间序列划分
feature_cols = ['ret_1d', 'ret_5d', 'ret_20d', 'ma_ratio', 
                'volatility_20d', 'rsi', 'volume_ratio', 'price_position']
train_df, val_df, test_df = time_series_split(df_features)

X_train = train_df[feature_cols]
y_train = train_df['target']
X_test = test_df[feature_cols]
y_test = test_df['target']

# 3. 训练模型
model = RandomForestClassifier(n_estimators=200, max_depth=4, 
                                min_samples_leaf=20, random_state=42)
model.fit(X_train, y_train)

# 4. 评估
pred = model.predict(X_test)
pred_proba = model.predict_proba(X_test)[:, 1]

print(f"测试集准确率: {accuracy_score(y_test, pred):.4f}")
print(f"AUC-ROC: {roc_auc_score(y_test, pred_proba):.4f}")
print("\n分类报告:")
print(classification_report(y_test, pred, target_names=['跌', '涨']))

# 5. 特征重要性
importance_df = pd.DataFrame({
    'feature': feature_cols,
    'importance': model.feature_importances_
}).sort_values('importance', ascending=False)
print("\n特征重要性:")
print(importance_df.to_string(index=False))
```

**Step 4：将预测转化为交易信号**
```python
# 当预测概率 > 0.55 时买入，< 0.45 时做空（或空仓）
test_df = test_df.copy()
test_df['pred_proba'] = pred_proba
test_df['signal'] = 0
test_df.loc[test_df['pred_proba'] > 0.55, 'signal'] = 1   # 买入
test_df.loc[test_df['pred_proba'] < 0.45, 'signal'] = -1  # 空仓

# 简单回测
test_df['strategy_ret'] = test_df['signal'].shift(1) * test_df['ret_1d']
test_df['cumulative_ret'] = (1 + test_df['strategy_ret']).cumprod()

print(f"\n策略累计收益: {test_df['cumulative_ret'].iloc[-1]:.4f}")
print(f"基准（买入持有）: {(1 + test_df['ret_1d']).cumprod().iloc[-1]:.4f}")
```

---

## 常见问题 Q&A

**Q1：机器学习在量化里是不是一定比技术指标更高级、更有效？**

A：不是。ML 只是工具，不是优势本身。如果特征没有信息量、标签设计有问题、样本太少或数据泄露没控制好，机器学习只会把错误流程包装得更复杂。

**Q2：为什么量化里的准确率不能像普通分类任务那样直接看？**

A：因为交易决策关心的不只是“猜对次数”，还关心赚的时候赚多少、错的时候亏多少、信号是否稳定、能否覆盖成本。一个 53% 准确率的模型可能比 60% 的模型更赚钱，也可能完全没法交易。

**Q3：Baseline 为什么这么重要？**

A：因为它告诉你模型到底创造了多少新增价值。如果一个复杂模型连“上一日涨跌延续”“简单均线规则”这样的基线都打不过，那就说明你增加的复杂度大概率没有换来真实优势。

---

## 本章小结

本章介绍了机器学习在量化交易中的三种应用方向，重点讲解了分类预测的完整流程：特征工程 → 数据划分 → 模型训练 → 评估。核心要点是：时间序列数据必须按时间顺序划分，不能随机打乱；评估模型不能只看准确率，要结合AUC和实际交易表现；AI工具可以大幅加速特征工程和代码编写的过程。

进一步往专业研究走，还需要补上三种意识：标签设计意识、数据泄露防控意识、baseline 对比意识。只有在这些基本纪律都建立起来后，模型结果才具备被信任和被交易化的基础。

---

## 课后思考题

1. 如果你的随机森林模型在训练集准确率达到75%，但测试集只有52%，你会怎么诊断和解决这个过拟合问题？请列出至少3种方法。

2. 特征工程中，"用未来数据计算的特征"会导致数据泄露。请思考：计算20日移动平均时，第1天到第19天的数据是否应该丢弃？为什么？

3. 假设你的模型预测准确率只有53%，但你发现它在"预测涨"时精确率有62%，在"预测跌"时精确率只有44%。你会如何设计一个只利用"预测涨"信号的交易策略？
