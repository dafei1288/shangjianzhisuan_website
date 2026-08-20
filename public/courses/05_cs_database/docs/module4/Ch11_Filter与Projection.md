# Ch11：Filter 与 Projection 算子

> Module 4 — 执行引擎 | 从0开始写数据库：基于 JimSQL 实战

---

## 1. 教学目标

1. 深入理解 Filter 算子的设计：谓词（Predicate）的抽象与实现
2. 掌握 Projection 算子的列裁剪逻辑，理解为什么投影要放在过滤之上
3. 建立表达式求值框架（Expression Evaluation），能对一行数据求值任意表达式
4. 理解复合谓词（AND/OR/NOT）的树形结构与短路求值
5. 能够将 `SELECT name FROM students WHERE score > 80 AND grade = '大三'` 翻译成完整的算子树并执行

---

## 2. 课前准备

### 需要的知识储备
- Ch10 的内容：Operator 接口、Schema/Row 数据结构、MockScan
- Java 函数式接口（Predicate、Function）
- 设计模式：组合模式（Composite Pattern）

### 环境要求
- JDK 11+（使用了 `var` 和 lambda）

### 预习思考
- 如果要支持 `WHERE score > 80 AND grade = '大三'`，谓词应该如何设计？
- 投影（Projection）放在过滤（Filter）之上还是之下？为什么？

---

## 3. 核心概念

### 3.1 Filter 算子的设计

Filter 算子是最常用的算子之一，它的职责很简单：对子算子返回的每一行，判断是否满足谓词条件，满足则返回，不满足则跳过。

#### 基本结构

```
Filter 算子
├── child: Operator      ← 子算子（数据来源）
└── predicate: Predicate ← 过滤条件
```

#### 执行逻辑

```java
@Override
public Row next() {
    Row row;
    while ((row = child.next()) != null) {
        if (predicate.evaluate(row)) {
            return row;  // 满足条件，返回
        }
        // 不满足条件，继续拉取下一行
    }
    return null;  // 子算子耗尽
}
```

这个逻辑非常简洁，但有一个重要特性：**Filter 不缓存数据**。它是一个纯流式算子，内存占用为 O(1)，无论输入有多少行。

### 3.2 谓词（Predicate）的设计

谓词是一个"对一行数据求值，返回 true/false"的函数。最简单的谓词是比较谓词：

```
column_name  operator  value
   score        >        80
   grade        =      '大三'
```

#### 比较操作符

```java
enum CompareOp {
    EQ,   // =
    NE,   // !=
    LT,   // <
    LE,   // <=
    GT,   // >
    GE    // >=
}
```

#### 单个比较谓词

```java
class ComparePredicate implements Predicate {
    private final String columnName;
    private final CompareOp op;
    private final Comparable value;

    @Override
    public boolean evaluate(Row row) {
        Comparable colVal = (Comparable) row.get(columnName);
        int cmp = colVal.compareTo(value);
        return switch (op) {
            case EQ -> cmp == 0;
            case NE -> cmp != 0;
            case LT -> cmp < 0;
            case LE -> cmp <= 0;
            case GT -> cmp > 0;
            case GE -> cmp >= 0;
        };
    }
}
```

### 3.3 复合谓词：AND / OR / NOT

真实的 WHERE 子句往往包含多个条件，用 AND/OR/NOT 连接。这是一个典型的**组合模式（Composite Pattern）**：

```
WHERE score > 80 AND grade = '大三'

        AND
       /   \
  score>80  grade='大三'
```

```
WHERE score > 80 OR score < 60

        OR
       /   \
  score>80  score<60
```

#### 组合谓词的实现

```java
// AND 谓词：两个子谓词都为 true 才返回 true（短路求值）
class AndPredicate implements Predicate {
    private final Predicate left;
    private final Predicate right;

    @Override
    public boolean evaluate(Row row) {
        return left.evaluate(row) && right.evaluate(row);  // 短路
    }
}

// OR 谓词：任一子谓词为 true 就返回 true（短路求值）
class OrPredicate implements Predicate {
    private final Predicate left;
    private final Predicate right;

    @Override
    public boolean evaluate(Row row) {
        return left.evaluate(row) || right.evaluate(row);  // 短路
    }
}

// NOT 谓词：取反
class NotPredicate implements Predicate {
    private final Predicate inner;

    @Override
    public boolean evaluate(Row row) {
        return !inner.evaluate(row);
    }
}
```

**短路求值的重要性**：对于 `AND`，如果左侧为 false，右侧不需要求值；对于 `OR`，如果左侧为 true，右侧不需要求值。这在右侧是复杂表达式（如子查询）时能显著提升性能。

### 3.4 表达式求值框架

谓词是表达式的一种特殊形式（返回 boolean）。更通用的表达式框架可以求值任意类型：

```
Expression
├── ColumnRef("score")          → 返回该行 score 列的值
├── Literal(80)                 → 返回常量 80
├── BinaryExpr(left, op, right) → 对两个子表达式求值后做运算
│   ├── ArithExpr: +, -, *, /
│   └── CompareExpr: >, <, =, !=
└── FunctionCall("UPPER", args) → 函数调用
```

#### 表达式接口

```java
interface Expression {
    Object evaluate(Row row);
    Class<?> getType();  // 返回值类型
}
```

#### 列引用表达式

```java
class ColumnRef implements Expression {
    private final String columnName;

    @Override
    public Object evaluate(Row row) {
        return row.get(columnName);
    }

    @Override
    public Class<?> getType() {
        // 需要从 schema 中查找列类型
        return Object.class;
    }
}
```

#### 常量表达式

```java
class Literal implements Expression {
    private final Object value;

    @Override
    public Object evaluate(Row row) {
        return value;  // 常量，不依赖行数据
    }

    @Override
    public Class<?> getType() {
        return value == null ? Object.class : value.getClass();
    }
}
```

#### 算术表达式

```java
class ArithExpr implements Expression {
    private final Expression left;
    private final String op;  // "+", "-", "*", "/"
    private final Expression right;

    @Override
    public Object evaluate(Row row) {
        Number l = (Number) left.evaluate(row);
        Number r = (Number) right.evaluate(row);
        return switch (op) {
            case "+" -> l.doubleValue() + r.doubleValue();
            case "-" -> l.doubleValue() - r.doubleValue();
            case "*" -> l.doubleValue() * r.doubleValue();
            case "/" -> l.doubleValue() / r.doubleValue();
            default -> throw new IllegalArgumentException("Unknown op: " + op);
        };
    }
}
```

### 3.5 Projection 算子的设计

Projection 算子负责"列裁剪"：从输入行中选取指定的列，构造新的输出行。

#### 为什么 Projection 放在 Filter 之上？

```
正确顺序：Projection(Filter(Scan))
错误顺序：Filter(Projection(Scan))  ← 如果 WHERE 用到了被裁剪的列，会出错！
```

例如：`SELECT name FROM students WHERE score > 80`

- 如果先 Projection 只保留 `name`，那么 Filter 就找不到 `score` 列了
- 必须先 Filter（此时行中还有 `score`），再 Projection 裁剪掉 `score`

#### 支持表达式投影

Projection 不仅可以选取列，还可以对列做计算：

```sql
SELECT name, score * 1.1 AS adjusted_score FROM students
```

这需要 Projection 支持表达式，而不仅仅是列名：

```java
class ProjectItem {
    final Expression expr;    // 要计算的表达式
    final String alias;       // 输出列名（AS xxx）
}
```

### 3.6 NULL 值处理

数据库中的 NULL 是一个特殊值，表示"未知"或"不存在"。谓词对 NULL 的处理遵循三值逻辑（Three-Valued Logic）：

| 表达式 | 结果 |
|--------|------|
| NULL > 80 | UNKNOWN（不满足条件） |
| NULL = NULL | UNKNOWN（不满足条件） |
| NULL IS NULL | TRUE |
| NOT NULL | UNKNOWN |

在实现中，通常将 UNKNOWN 视为 false（即含 NULL 的行被过滤掉）：

```java
@Override
public boolean evaluate(Row row) {
    Object colVal = row.get(columnName);
    if (colVal == null) return false;  // NULL 不满足任何比较条件
    // ... 正常比较
}
```

---

## 4. 代码讲解

### 4.1 谓词接口与实现

```java
/** 谓词接口：对一行数据求值，返回 true/false */
public interface Predicate {
    boolean evaluate(Row row);

    /** 工厂方法：创建比较谓词 */
    static Predicate compare(String col, CompareOp op, Comparable<?> val) {
        return new ComparePredicate(col, op, val);
    }

    /** 工厂方法：AND */
    default Predicate and(Predicate other) {
        return new AndPredicate(this, other);
    }

    /** 工厂方法：OR */
    default Predicate or(Predicate other) {
        return new OrPredicate(this, other);
    }

    /** 工厂方法：NOT */
    default Predicate not() {
        return new NotPredicate(this);
    }
}
```

使用示例：

```java
// score > 80 AND grade = '大三'
Predicate p = Predicate.compare("score", GT, 80)
                       .and(Predicate.compare("grade", EQ, "大三"));

// score > 90 OR score < 60
Predicate p2 = Predicate.compare("score", GT, 90)
                        .or(Predicate.compare("score", LT, 60));
```

### 4.2 Filter 算子完整实现

```java
public class FilterOperator implements Operator {
    private final Operator child;
    private final Predicate predicate;
    private long inputRows = 0;
    private long outputRows = 0;

    public FilterOperator(Operator child, Predicate predicate) {
        this.child = child;
        this.predicate = predicate;
    }

    @Override
    public void open() {
        child.open();
    }

    @Override
    public Row next() {
        Row row;
        while ((row = child.next()) != null) {
            inputRows++;
            if (predicate.evaluate(row)) {
                outputRows++;
                return row;
            }
        }
        return null;
    }

    @Override
    public void close() {
        child.close();
        System.out.printf("[Filter] input=%d, output=%d, selectivity=%.1f%%%n",
            inputRows, outputRows,
            inputRows == 0 ? 0 : 100.0 * outputRows / inputRows);
    }

    @Override
    public Schema getSchema() { return child.getSchema(); }
}
```

### 4.3 Projection 算子完整实现

```java
public class ProjectionOperator implements Operator {
    private final Operator child;
    private final List<ProjectItem> items;  // 投影项列表
    private Schema outputSchema;

    public ProjectionOperator(Operator child, List<ProjectItem> items) {
        this.child = child;
        this.items = items;
    }

    @Override
    public void open() {
        child.open();
        // 构建输出 schema
        List<Column> outCols = new ArrayList<>();
        for (ProjectItem item : items) {
            outCols.add(new Column(item.alias, item.expr.getType()));
        }
        outputSchema = new Schema(outCols);
    }

    @Override
    public Row next() {
        Row inputRow = child.next();
        if (inputRow == null) return null;

        // 对每个投影项求值
        Object[] vals = new Object[items.size()];
        for (int i = 0; i < items.size(); i++) {
            vals[i] = items.get(i).expr.evaluate(inputRow);
        }
        return new Row(outputSchema, vals);
    }

    @Override
    public void close() { child.close(); }

    @Override
    public Schema getSchema() { return outputSchema; }
}
```

### 4.4 组合使用示例

```java
// SQL: SELECT name, score FROM students WHERE score > 80 AND grade = '大三'

// 1. 数据源
Operator scan = new MockScan("students", schema, data);

// 2. 构建复合谓词
Predicate pred = Predicate.compare("score", GT, 80)
                          .and(Predicate.compare("grade", EQ, "大三"));

// 3. Filter 算子
Operator filter = new FilterOperator(scan, pred);

// 4. Projection 算子（选取 name 和 score 列）
List<ProjectItem> items = Arrays.asList(
    new ProjectItem(new ColumnRef("name"), "name"),
    new ProjectItem(new ColumnRef("score"), "score")
);
Operator project = new ProjectionOperator(filter, items);

// 5. 执行
List<Row> results = execute(project);
```

---

## 5. 实践练习

### 练习 1（基础）：实现 LIKE 谓词

实现一个 `LikePredicate`，支持 SQL 的 `LIKE` 操作符，其中 `%` 匹配任意字符串，`_` 匹配单个字符。

```java
class LikePredicate implements Predicate {
    private final String columnName;
    private final String pattern;  // 如 "Ali%", "_ob", "%ar%"

    @Override
    public boolean evaluate(Row row) {
        Object val = row.get(columnName);
        if (val == null) return false;
        String str = val.toString();
        // TODO: 将 SQL LIKE 模式转换为正则表达式并匹配
        // 提示：% → .*, _ → .
        String regex = pattern.replace("%", ".*").replace("_", ".");
        return str.matches(regex);
    }
}
```

测试：`WHERE name LIKE 'A%'` 应该匹配 "Alice"、"Anna" 但不匹配 "Bob"。

### 练习 2（进阶）：实现 IN 谓词

实现 `InPredicate`，支持 `WHERE grade IN ('大一', '大二', '大三')`。

```java
class InPredicate implements Predicate {
    private final String columnName;
    private final Set<Object> values;

    public InPredicate(String columnName, Object... values) {
        this.columnName = columnName;
        this.values = new HashSet<>(Arrays.asList(values));
    }

    @Override
    public boolean evaluate(Row row) {
        Object val = row.get(columnName);
        return val != null && values.contains(val);
    }
}
```

扩展：实现 `NOT IN` 谓词（提示：用 `InPredicate.not()`）。

### 练习 3（挑战）：实现计算列投影

扩展 Projection 算子，支持计算列：

```sql
SELECT name, score * 1.1 AS adjusted_score, score - 60 AS excess FROM students
```

要求：
1. 实现 `ArithExpr` 类，支持 `+`、`-`、`*`、`/` 四则运算
2. 修改 `ProjectItem` 使用 `Expression` 接口
3. 验证：对 score=80 的学生，`adjusted_score` 应为 88.0，`excess` 应为 20

---

## 6. 常见问题

**Q1：Filter 算子的 selectivity（选择率）是什么？为什么重要？**

A：选择率是指满足过滤条件的行数占总行数的比例。例如，1000 行中有 100 行满足条件，选择率为 10%。选择率对查询优化器非常重要：
- 选择率低的 Filter 应该尽早执行（减少后续算子处理的数据量）
- 在多表连接时，选择率影响连接顺序的选择
- 查询优化器通过统计信息（直方图、NDV 等）估算选择率

**Q2：为什么 Projection 不能放在 Filter 之前？**

A：因为 Filter 需要访问 WHERE 子句中的列，而这些列不一定出现在 SELECT 列表中。例如 `SELECT name FROM students WHERE score > 80`，如果先做 Projection 只保留 `name`，那么 Filter 就无法访问 `score` 列了。正确顺序是：先 Filter（此时行中还有所有列），再 Projection（裁剪掉不需要的列）。

有一个例外：如果 SELECT 列表中的列是 WHERE 子句中所有列的超集，那么可以先做 Projection。但通常不这样优化，因为实现复杂且收益有限。

**Q3：复合谓词的短路求值在数据库中有多重要？**

A：非常重要。考虑 `WHERE expensive_function(col1) AND simple_check(col2)`，如果 `simple_check` 的选择率很低（大多数行不满足），应该先求值 `simple_check`，利用短路跳过 `expensive_function` 的调用。这就是谓词重排序（Predicate Reordering）优化。PostgreSQL 等数据库会根据函数代价和选择率自动调整谓词求值顺序。

**Q4：NULL 值在 Filter 中应该如何处理？**

A：SQL 标准规定，NULL 参与的比较运算结果为 UNKNOWN，而 WHERE 子句只保留结果为 TRUE 的行（UNKNOWN 和 FALSE 都被过滤掉）。因此：
- `WHERE score > 80`：score 为 NULL 的行被过滤掉
- `WHERE score IS NULL`：只保留 score 为 NULL 的行
- `WHERE score IS NOT NULL`：过滤掉 score 为 NULL 的行

在实现中，比较谓词遇到 NULL 时应返回 false（对应 UNKNOWN 被过滤），而 `IS NULL` 谓词需要单独实现。

---

## 7. 本章小结

本章深入实现了执行引擎中最基础的两个算子：

1. **Filter 算子**：流式处理，O(1) 内存，通过谓词接口支持任意过滤条件
2. **Predicate 体系**：比较谓词 + 复合谓词（AND/OR/NOT），组合模式，支持短路求值
3. **表达式框架**：ColumnRef、Literal、ArithExpr 构成表达式树，统一求值接口
4. **Projection 算子**：列裁剪 + 计算列，必须放在 Filter 之上
5. **NULL 处理**：三值逻辑，NULL 参与比较返回 UNKNOWN（视为 false）

算子组合：`Projection(Filter(SeqScan))` 是最常见的查询模式，也是后续所有复杂算子的基础。

下一章（Ch12）将实现聚合算子，处理 `GROUP BY` 和 `COUNT/SUM/AVG` 等聚合函数。

---

## 附录：谓词类型速查

| 谓词类型 | SQL 示例 | 实现类 |
|---------|---------|--------|
| 比较谓词 | `score > 80` | `ComparePredicate` |
| 等值谓词 | `grade = '大三'` | `ComparePredicate(EQ)` |
| LIKE 谓词 | `name LIKE 'A%'` | `LikePredicate` |
| IN 谓词 | `grade IN ('大一','大二')` | `InPredicate` |
| IS NULL | `score IS NULL` | `IsNullPredicate` |
| BETWEEN | `score BETWEEN 60 AND 90` | `BetweenPredicate` 或 AND 组合 |
| AND | `p1 AND p2` | `AndPredicate` |
| OR | `p1 OR p2` | `OrPredicate` |
| NOT | `NOT p` | `NotPredicate` |

## 课堂练习

### ⭐ 基础
1. 实现 `WHERE score > 60 AND dept = 'CS'` 的 Filter 算子
2. 实现 `SELECT name, score` 的 Projection 算子（只取两列）
3. 追踪 Filter + Projection 组合执行时的数据流

### ⭐⭐ 进阶
1. 实现 Filter 的合取分解（AND 条件拆为多个 Filter 算子级联）
2. 实现 Projection 消除优化（如果投影的列全被后续用到，可以跳过）
3. 分析 Filter 下推对性能的影响

### ⭐⭐⭐ 挑战
1. 实现 IN 表达式（`WHERE dept IN ('CS', 'Math')`）
2. 实现 LIKE 模式匹配（`WHERE name LIKE 'J%'`）
3. 实现运行时表达式编译（JIT 编译 WHERE 条件为字节码）
