# 第3章：Python与AI工具协作编程

## 学习目标

完成本章学习后，你将能够：

1. 搭建完整的Python量化开发环境（Anaconda + Jupyter + VS Code）
2. 掌握量化编程所需的Python基础语法
3. 熟练使用pandas、numpy、matplotlib三大核心库
4. 建立"AI辅助编程"的工作流，用AI写代码、解释报错、补全逻辑
5. 独立运行第一段量化代码：读取股票数据并绘制K线图

---

## 3.1 环境搭建：Anaconda、Jupyter Notebook、VS Code

### 为什么选择这套工具组合？

量化开发需要一个稳定、高效的工作环境。这套工具组合是业界最主流的选择：

- **Anaconda**：Python的"全家桶"发行版，自带数百个科学计算库，避免了手动安装依赖的麻烦
- **Jupyter Notebook**：交互式编程环境，可以一边写代码一边看结果，非常适合数据探索和策略研究
- **VS Code**：专业的代码编辑器，适合写完整的策略文件

### 安装步骤

**第一步：安装Anaconda**

访问 https://www.anaconda.com/download 下载对应操作系统的安装包。

安装时注意：
- 勾选"Add Anaconda to PATH"（将Anaconda添加到系统路径）
- 选择"Just Me"（仅为当前用户安装）

安装完成后，打开命令行（Windows用Anaconda Prompt，Mac/Linux用Terminal），输入：
```bash
conda --version
```
如果显示版本号，说明安装成功。

**第二步：创建量化专用虚拟环境**

虚拟环境就像一个独立的"工作间"，不同项目的依赖互不干扰：

```bash
# 创建名为quant的虚拟环境，使用Python 3.10
conda create -n quant python=3.10

# 激活虚拟环境
conda activate quant

# 安装量化常用库
pip install pandas numpy matplotlib jupyter akshare yfinance pandas-ta
```

**第三步：安装VS Code**

访问 https://code.visualstudio.com 下载安装。安装后，在VS Code中安装以下扩展：
- Python（微软官方）
- Jupyter（微软官方）

**第四步：验证环境**

在命令行中输入 `jupyter notebook`，浏览器会自动打开Jupyter界面。新建一个Notebook，输入：

```python
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
print("环境配置成功！")
print(f"pandas版本：{pd.__version__}")
print(f"numpy版本：{np.__version__}")
```

运行后看到版本号，说明环境配置完成。

### 遇到问题怎么办？

环境配置是初学者最容易卡住的地方。遇到问题时，把完整的错误信息发给AI：

```
我在安装量化Python环境时遇到了问题，请帮我解决：

操作系统：Windows 11
执行的命令：pip install pandas
完整错误信息：
[粘贴错误信息]

请给出具体的解决步骤。
```

---

## 3.2 Python基础语法速览

这一节不是完整的Python教程，而是量化编程中最常用的语法要点。如果你已经有Python基础，可以快速浏览。

### 变量与数据类型

```python
# 数字
price = 100.5          # 浮点数（小数）
volume = 1000000       # 整数
is_bullish = True      # 布尔值（真/假）

# 字符串
stock_code = "000001"  # 股票代码

# 列表（有序，可修改）
prices = [10.5, 11.2, 10.8, 11.5, 12.0]

# 字典（键值对）
stock_info = {
    "code": "000001",
    "name": "平安银行",
    "price": 12.5
}

# 访问字典
print(stock_info["name"])  # 输出：平安银行
```

### 条件语句

```python
price = 15.0
ma5 = 14.5
ma20 = 14.0

# 判断金叉信号
if ma5 > ma20:
    print("金叉信号，考虑买入")
elif ma5 < ma20:
    print("死叉信号，考虑卖出")
else:
    print("均线重合，观望")
```

### 循环

```python
# 遍历价格列表，计算每日涨跌
prices = [10.0, 10.5, 10.2, 11.0, 10.8]

for i in range(1, len(prices)):
    change = (prices[i] - prices[i-1]) / prices[i-1] * 100
    print(f"第{i}天涨跌幅：{change:.2f}%")
```

### 函数

```python
def calculate_return(buy_price, sell_price):
    """
    计算单次交易收益率
    
    参数：
        buy_price: 买入价格
        sell_price: 卖出价格
    
    返回：
        收益率（百分比）
    """
    return (sell_price - buy_price) / buy_price * 100

# 使用函数
profit = calculate_return(10.0, 12.5)
print(f"收益率：{profit:.2f}%")  # 输出：收益率：25.00%
```

---

## 3.3 量化必备库：pandas、numpy、matplotlib快速入门

### pandas：数据处理的瑞士军刀

pandas是量化编程中使用频率最高的库。它的核心数据结构是DataFrame，可以把它理解为"Python中的Excel表格"。

```python
import pandas as pd

# 创建一个简单的股票数据DataFrame
data = {
    'date': ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05'],
    'open':  [10.0, 10.5, 10.2, 10.8, 11.0],
    'high':  [10.8, 11.0, 10.6, 11.2, 11.5],
    'low':   [9.8,  10.3, 9.9,  10.5, 10.8],
    'close': [10.5, 10.2, 10.8, 11.0, 11.3],
    'volume':[1000, 1200, 900,  1500, 1100]
}

df = pd.DataFrame(data)
df['date'] = pd.to_datetime(df['date'])  # 将日期列转为日期类型
df.set_index('date', inplace=True)       # 将日期设为索引

print(df)
print(f"\n数据形状：{df.shape}")  # (行数, 列数)
print(f"\n基本统计：\n{df.describe()}")
```

**pandas最常用的操作**：

```python
# 计算日收益率
df['daily_return'] = df['close'].pct_change()

# 计算移动平均线
df['MA5']  = df['close'].rolling(window=5).mean()
df['MA20'] = df['close'].rolling(window=20).mean()

# 筛选数据：找出涨幅超过2%的日期
big_up_days = df[df['daily_return'] > 0.02]

# 按条件赋值
df['signal'] = 0
df.loc[df['MA5'] > df['MA20'], 'signal'] = 1   # 金叉：买入信号
df.loc[df['MA5'] < df['MA20'], 'signal'] = -1  # 死叉：卖出信号
```

### numpy：数值计算的基础

numpy提供了高效的数组运算，pandas底层就是基于numpy构建的。

```python
import numpy as np

prices = np.array([10.0, 10.5, 10.2, 11.0, 10.8, 11.5])

# 常用统计函数
print(f"平均价格：{np.mean(prices):.2f}")
print(f"价格标准差：{np.std(prices):.2f}")
print(f"最高价：{np.max(prices):.2f}")
print(f"最低价：{np.min(prices):.2f}")

# 计算对数收益率（量化中常用）
log_returns = np.log(prices[1:] / prices[:-1])
print(f"\n对数收益率：{log_returns}")
print(f"年化波动率（假设252个交易日）：{np.std(log_returns) * np.sqrt(252):.4f}")
```

### matplotlib：数据可视化

```python
import matplotlib.pyplot as plt
import matplotlib
matplotlib.rcParams['font.sans-serif'] = ['SimHei']  # 支持中文显示
matplotlib.rcParams['axes.unicode_minus'] = False

# 绘制收盘价和均线
fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 8), sharex=True)

# 上图：价格和均线
ax1.plot(df.index, df['close'], label='收盘价', color='black', linewidth=1)
ax1.plot(df.index, df['MA5'],  label='MA5',  color='blue',  linewidth=1.5)
ax1.plot(df.index, df['MA20'], label='MA20', color='red',   linewidth=1.5)
ax1.set_title('股票价格与均线')
ax1.legend()
ax1.grid(True, alpha=0.3)

# 下图：成交量
ax2.bar(df.index, df['volume'], label='成交量', color='gray', alpha=0.7)
ax2.set_title('成交量')
ax2.legend()
ax2.grid(True, alpha=0.3)

plt.tight_layout()
plt.savefig('stock_chart.png', dpi=150)
plt.show()
```

---

## 3.4 AI辅助编程工作流

### 标准工作流

量化编程中，AI辅助的标准工作流如下：

```
1. 明确需求（你自己想清楚要做什么）
        ↓
2. 向AI描述需求（用清晰的提示词）
        ↓
3. AI生成初版代码
        ↓
4. 自己逐行阅读，理解每一行的含义
        ↓
5. 运行代码，观察结果
        ↓
6. 如果有报错：先自己分析，再问AI
        ↓
7. 如果结果不对：描述期望结果，让AI修改
        ↓
8. 验证最终代码的正确性
```

### 实际案例：用AI写数据处理代码

**你的需求**：从CSV文件读取股票数据，计算各种技术指标，找出买入信号。

**第一步：向AI描述需求**

```
我有一个股票数据CSV文件，列名为：Date, Open, High, Low, Close, Volume
请帮我写Python代码，实现：
1. 读取CSV文件
2. 计算5日、10日、20日移动平均线
3. 找出所有金叉日期（5日均线上穿20日均线）
4. 计算金叉后持有10天的平均收益率

要求：
- 使用pandas库
- 代码有详细中文注释
- 处理可能的缺失值
```

**第二步：理解AI给出的代码**

对于每一行不理解的代码，追问：
```
请解释这行代码：
df['cross'] = (df['MA5'] > df['MA20']) & (df['MA5'].shift(1) <= df['MA20'].shift(1))

特别是.shift(1)是什么意思？
```

---

## 3.5 提示词工程：如何向AI描述需求才能得到可用的代码

### 描述需求的黄金法则

**法则一：说清楚输入和输出**

糟糕的描述：
```
帮我写一个计算收益率的函数
```

好的描述：
```
帮我写一个Python函数，输入是一个pandas Series（股票收盘价，按日期排序），
输出是一个新的Series（每日收益率，用百分比表示），
第一天的收益率应该是NaN（因为没有前一天的数据）。
```

**法则二：提供数据样例**

```
我的数据格式如下：
Date,Open,High,Low,Close,Volume
2024-01-01,10.0,10.8,9.8,10.5,1000000
2024-01-02,10.5,11.0,10.3,10.2,1200000

请帮我写代码，计算每天的真实波动幅度（True Range）。
```

**法则三：说明你的技术水平**

```
我是Python初学者，刚学完基础语法。
请写一段代码，并在每行代码后面加上注释解释它的作用。
避免使用高级特性（如lambda、列表推导式），用最基础的写法。
```

**法则四：指定库和版本**

```
请使用pandas 2.0和Python 3.10编写代码。
不要使用已经废弃的API（如df.append()）。
```

---

## 3.6 AI的边界：哪些代码必须自己理解，不能盲目复制

### 必须自己理解的代码

**1. 涉及资金计算的代码**

任何计算仓位、盈亏、手续费的代码，都必须自己逐行验证。一个小小的计算错误可能导致严重的资金损失。

```python
# 这段代码计算仓位大小，必须自己理解每一行
def calculate_position_size(capital, risk_per_trade, entry_price, stop_loss_price):
    """
    根据风险控制计算仓位大小
    capital: 总资金
    risk_per_trade: 每笔交易愿意承受的最大亏损比例（如0.02表示2%）
    entry_price: 买入价格
    stop_loss_price: 止损价格
    """
    risk_amount = capital * risk_per_trade          # 每笔最大亏损金额
    risk_per_share = entry_price - stop_loss_price  # 每股风险
    shares = risk_amount / risk_per_share           # 可买股数
    return int(shares)  # 取整
```

**2. 回测逻辑的核心部分**

回测代码中的买卖逻辑、收益计算，必须自己理解，否则你无法判断回测结果是否可信。

**3. 数据处理中的时间对齐**

量化中最常见的错误之一是"未来函数"——不小心用了未来的数据。这类错误AI很难自动发现，必须自己仔细检查。

### 一个警示案例

假设AI给你生成了以下代码：

```python
# 看起来没问题，但实际上有严重的未来函数问题！
df['signal'] = df['close'].shift(-1) > df['close']  # 用明天的价格判断今天是否买入
```

这段代码用了明天的收盘价（`shift(-1)`）来决定今天是否买入，在实盘中是不可能实现的。如果你不理解代码，就会被这个"完美"的回测结果欺骗。

---

## 3.7 常见错误排查：先自己看，再问AI

### 最常见的错误类型

**1. KeyError：列名不存在**
```
KeyError: 'close'
```
原因：列名大小写不匹配。检查你的数据列名是'close'还是'Close'。

**2. ValueError：数据类型不匹配**
```
ValueError: could not convert string to float: '10,500'
```
原因：数字中有逗号。需要先清洗数据：`df['price'] = df['price'].str.replace(',', '').astype(float)`

**3. IndexError：索引越界**
```
IndexError: index 100 is out of bounds for axis 0 with size 100
```
原因：数组索引从0开始，最后一个元素的索引是99，不是100。

**4. NaN导致的计算错误**
移动平均线的前几行会是NaN（因为数据不足），如果不处理NaN，后续计算可能出错。

### 排查步骤

```python
# 第一步：检查数据基本情况
print(df.shape)        # 数据形状
print(df.dtypes)       # 每列的数据类型
print(df.head())       # 前5行数据
print(df.isnull().sum())  # 每列的缺失值数量

# 第二步：检查具体报错的列
print(df['close'].dtype)   # 检查数据类型
print(df['close'].head(10))  # 检查前10个值
```

---

## 实战练习：用AI生成量化代码，读取股票数据并画出K线图

### 练习目标

完成一个完整的量化数据可视化项目：获取真实股票数据，计算技术指标，绘制专业K线图。

### 步骤1：获取真实股票数据

```python
import akshare as ak
import pandas as pd

# 获取平安银行（000001）近一年的日线数据
# akshare是免费的A股数据库，无需注册
df = ak.stock_zh_a_hist(
    symbol="000001",
    period="daily",
    start_date="20230101",
    end_date="20231231",
    adjust="qfq"  # 前复权
)

print(df.head())
print(f"\n数据形状：{df.shape}")
print(f"\n列名：{df.columns.tolist()}")
```

### 步骤2：数据清洗和指标计算

```python
# 重命名列（akshare的列名是中文）
df = df.rename(columns={
    '日期': 'date',
    '开盘': 'open',
    '收盘': 'close',
    '最高': 'high',
    '最低': 'low',
    '成交量': 'volume'
})

df['date'] = pd.to_datetime(df['date'])
df.set_index('date', inplace=True)
df = df[['open', 'high', 'low', 'close', 'volume']]

# 计算技术指标
df['MA5']  = df['close'].rolling(5).mean()
df['MA10'] = df['close'].rolling(10).mean()
df['MA20'] = df['close'].rolling(20).mean()

# 计算日收益率
df['return'] = df['close'].pct_change()

print(df.tail(10))
```

### 步骤3：用AI辅助绘制K线图

将以下提示词发给AI，让它帮你写K线图代码：

```
我有一个pandas DataFrame，包含股票的OHLCV数据（open/high/low/close/volume）
和三条均线（MA5/MA10/MA20），索引是日期。

请帮我用matplotlib绘制一个专业的K线图，要求：
1. 上方显示K线（红涨绿跌）和三条均线
2. 下方显示成交量柱状图（同样红涨绿跌）
3. 图表要有标题、图例、网格线
4. 支持中文显示
5. 图片保存为PNG文件

请提供完整可运行的代码，并加上中文注释。
```

### 步骤4：运行并验证

运行AI生成的代码，如果有报错，按照3.7节的排查步骤处理，或者将错误信息发给AI请求帮助。

最终你应该得到一张包含K线和成交量的专业图表，保存为PNG文件。

---

## 常见问题 Q&A

**Q1：我是 Python 初学者，学量化时要把语法学到多深才够？**

A：先够用就行。能读懂数据处理代码、能写函数、会排查基本报错，就足以进入量化入门阶段。后续随着策略复杂度提升，再补更系统的工程能力。

**Q2：为什么课程里既讲 Jupyter，又讲 VS Code？**

A：因为两者适合的工作不同。Jupyter 更适合探索数据和做临时实验，VS Code 更适合整理脚本、维护项目和逐步走向可复用的研究代码。

**Q3：AI 帮我写了代码，但我看不懂每一行，还要继续往下学吗？**

A：不建议直接跳过。你可以不要求自己第一次就全懂，但至少要能回答：这段代码输入是什么、输出是什么、关键变量代表什么、哪里最容易出错。否则后面调试会非常痛苦。

---

## 本章小结

本章我们完成了量化编程的基础建设：

- **环境搭建**：Anaconda + Jupyter + VS Code是量化开发的标准工具组合，虚拟环境可以隔离不同项目的依赖
- **Python基础**：变量、条件、循环、函数是量化编程的四大基础语法，重点掌握
- **三大核心库**：pandas处理表格数据，numpy做数值计算，matplotlib做可视化——这三个库贯穿整个量化学习过程
- **AI辅助编程**：AI可以生成代码、解释报错，但所有代码必须自己理解，特别是涉及资金计算和回测逻辑的部分
- **错误排查**：遇到报错先自己分析数据类型和数据内容，再问AI

---

## 课后思考题

1. 为什么量化编程中要特别注意"未来函数"问题？请举一个具体的例子，说明未来函数如何导致回测结果虚高。

2. pandas的`shift()`函数在量化中非常重要。请用自己的话解释`df['close'].shift(1)`和`df['close'].shift(-1)`分别代表什么，各自在什么场景下使用？

3. 如果你让AI帮你写了一段回测代码，回测结果显示年化收益率高达200%，你会怎么验证这个结果是否可信？请列出至少3个验证步骤。
