# Ch08 语法分析（Parser）

> Module 3 · SQL 解析 · 第 2 章（共 3 章）

---

## 1. 教学目标

学完本章，你应该能够：

1. 理解上下文无关文法（CFG）的概念，并用产生式描述 SQL 语法规则
2. 掌握递归下降解析（Recursive Descent Parsing）的核心思想：每条语法规则对应一个方法
3. 设计 AST（抽象语法树）的节点层次结构，包括 `SelectStatement`、`InsertStatement`、`CreateTableStatement`
4. 实现能解析 SELECT / INSERT / CREATE TABLE 三类语句的完整 Parser
5. 实现 Parser 的错误处理：遇到非预期 Token 时抛出带有上下文信息的 `ParseException`

---

## 2. 课前准备

### 2.1 知识储备

- 已完成 Ch07（词法分析），理解 Token 和 Lexer 的工作方式
- Java 基础：继承、多态、异常处理、List/ArrayList
- 了解树形数据结构的基本概念

### 2.2 环境要求

- JDK 11+（本章 Demo 包含 Ch07 的 Lexer 实现，无需额外依赖）

### 2.3 预习问题

1. `SELECT name, score FROM students WHERE score > 80` 如果画成树，根节点是什么？叶节点是什么？
2. 递归下降解析为什么叫"递归"？哪里会产生递归调用？
3. 语法错误和词法错误有什么区别？举例说明。

---

## 3. 核心概念

### 3.1 从 Token 流到 AST

Ch07 的 Lexer 把 SQL 字符串变成了 Token 流：

```
SELECT name FROM students WHERE score > 80
→ [SELECT] [IDENTIFIER:name] [FROM] [IDENTIFIER:students]
   [WHERE] [IDENTIFIER:score] [GT] [INTEGER:80] [EOF]
```

Parser 的任务是把这个**线性的** Token 流，转换成**树形的** AST（Abstract Syntax Tree，抽象语法树）：

```
SelectStatement
├── columns: ["name"]
├── tableName: "students"
└── whereClause: BinaryExpr
    ├── left:  ColumnRef("score")
    ├── op:    ">"
    └── right: IntLiteral(80)
```

AST 是后续所有处理（语义分析、查询优化、执行）的基础数据结构。

### 3.2 上下文无关文法（CFG）

**上下文无关文法（Context-Free Grammar, CFG）** 用产生式（Production Rule）描述语言的语法结构。

SQL 的简化文法（BNF 表示）：

```
statement     ::= select_stmt
                | insert_stmt
                | create_stmt

select_stmt   ::= SELECT column_list FROM IDENTIFIER
                  [ WHERE condition ]

column_list   ::= IDENTIFIER ( ',' IDENTIFIER )*
                | '*'

condition     ::= IDENTIFIER operator literal

operator      ::= '=' | '!=' | '>' | '<' | '>=' | '<='

literal       ::= INTEGER | STRING

insert_stmt   ::= INSERT INTO IDENTIFIER VALUES '(' value_list ')'

value_list    ::= literal ( ',' literal )*

create_stmt   ::= CREATE TABLE IDENTIFIER '(' col_def_list ')'

col_def_list  ::= col_def ( ',' col_def )*

col_def       ::= IDENTIFIER type_name [ '(' INTEGER ')' ]

type_name     ::= INT | VARCHAR
```

每条产生式对应 Parser 中的一个方法，这就是递归下降解析的核心思想。

### 3.3 递归下降解析

**递归下降解析（Recursive Descent Parsing）** 是最直观的手写 Parser 方式：

- 每条语法规则 → 一个 `parseXxx()` 方法
- 方法内部消耗 Token，并调用其他 `parseXxx()` 方法（产生"递归"）
- 通过向前看当前 Token（lookahead）决定走哪条分支

```java
// 文法规则：statement ::= select_stmt | insert_stmt | create_stmt
Statement parseStatement() {
    Token current = peek();  // 向前看，不消耗
    if (current.type == TokenType.SELECT) {
        return parseSelectStatement();
    } else if (current.type == TokenType.INSERT) {
        return parseInsertStatement();
    } else if (current.type == TokenType.CREATE) {
        return parseCreateStatement();
    } else {
        throw new ParseException("期望 SELECT/INSERT/CREATE，实际: " + current);
    }
}
```

递归发生在哪里？例如 `parseCondition()` 可能调用 `parseExpression()`，而 `parseExpression()` 在处理复杂表达式时又调用自身（本章简化版不涉及，但这是递归的来源）。

### 3.4 AST 节点设计

AST 节点的设计原则：
1. **每种语句一个类**，继承自公共基类 `Statement`
2. **字段语义清晰**，用具体类型而非字符串堆砌
3. **可打印**，实现 `toString()` 便于调试

```
Statement（抽象基类）
├── SelectStatement
│   ├── List<String> columns      // 查询列，"*" 表示全部
│   ├── String tableName          // FROM 后的表名
│   └── Condition whereClause     // 可为 null（无 WHERE）
│
├── InsertStatement
│   ├── String tableName          // INTO 后的表名
│   └── List<String> values       // VALUES 中的值列表
│
└── CreateTableStatement
    ├── String tableName          // TABLE 后的表名
    └── List<ColumnDef> columns   // 列定义列表
        └── ColumnDef
            ├── String name       // 列名
            ├── String type       // INT / VARCHAR
            └── int length        // VARCHAR(n) 的 n，INT 为 -1
```

### 3.5 Parser 的核心辅助方法

Parser 需要几个基础工具方法来操作 Token 流：

```java
// 向前看当前 Token，不消耗
Token peek() {
    return tokens.get(pos);
}

// 消耗当前 Token 并返回，pos 前进
Token advance() {
    Token t = tokens.get(pos);
    pos++;
    return t;
}

// 期望当前 Token 是指定类型，否则抛异常；消耗并返回
Token expect(TokenType type) {
    Token t = peek();
    if (t.type != type) {
        throw new ParseException(
            "期望 " + type + "，实际: " + t.type + " ('" + t.value + "')");
    }
    return advance();
}

// 检查当前 Token 是否是指定类型（不消耗）
boolean check(TokenType type) {
    return peek().type == type;
}

// 如果当前 Token 是指定类型则消耗并返回 true，否则返回 false
boolean match(TokenType type) {
    if (check(type)) {
        advance();
        return true;
    }
    return false;
}
```

这五个方法是递归下降 Parser 的标准工具箱，几乎所有手写 Parser 都有类似设计。

### 3.6 错误处理策略

Parser 的错误处理有两种策略：

**1. 快速失败（Fail-Fast）**：遇到第一个错误立即抛出异常，停止解析。
- 优点：实现简单
- 缺点：一次只能报告一个错误
- 适用：JimSQL 教学版

**2. 错误恢复（Error Recovery）**：遇到错误后尝试跳过若干 Token，继续解析后续语句，一次报告多个错误。
- 优点：用户体验好（IDE 的语法检查用这种）
- 缺点：实现复杂，恢复逻辑容易出错
- 适用：生产级编译器

JimSQL 采用快速失败策略，`ParseException` 携带期望的 Token 类型和实际遇到的 Token 信息。

---

## 4. 代码讲解

### 4.1 AST 节点类

**基类 Statement**：

```java
public abstract class Statement {
    // 标记接口，所有语句类型的公共基类
    // 可以添加公共字段，如 sourcePosition（行列号）
}
```

**SelectStatement**：

```java
public class SelectStatement extends Statement {
    public final List<String> columns;    // 查询的列名，"*" 表示全选
    public final String tableName;        // FROM 后的表名
    public final Condition whereClause;   // WHERE 条件，可为 null

    public SelectStatement(List<String> columns, String tableName, Condition whereClause) {
        this.columns = columns;
        this.tableName = tableName;
        this.whereClause = whereClause;
    }

    @Override
    public String toString() {
        StringBuilder sb = new StringBuilder();
        sb.append("SelectStatement {\n");
        sb.append("  columns: ").append(columns).append("\n");
        sb.append("  from: ").append(tableName).append("\n");
        if (whereClause != null) {
            sb.append("  where: ").append(whereClause).append("\n");
        }
        sb.append("}");
        return sb.toString();
    }
}
```

**Condition（WHERE 子句）**：

```java
public class Condition {
    public final String column;    // 左侧列名
    public final String operator;  // 运算符：=, !=, >, <, >=, <=
    public final String value;     // 右侧字面量值
    public final boolean isString; // 右侧是字符串字面量还是整数字面量

    public Condition(String column, String operator, String value, boolean isString) {
        this.column = column;
        this.operator = operator;
        this.value = value;
        this.isString = isString;
    }

    @Override
    public String toString() {
        String displayValue = isString ? "'" + value + "'" : value;
        return column + " " + operator + " " + displayValue;
    }
}
```

**InsertStatement**：

```java
public class InsertStatement extends Statement {
    public final String tableName;
    public final List<String> values;   // 原始字符串值列表

    public InsertStatement(String tableName, List<String> values) {
        this.tableName = tableName;
        this.values = values;
    }

    @Override
    public String toString() {
        return "InsertStatement {\n"
            + "  into: " + tableName + "\n"
            + "  values: " + values + "\n"
            + "}";
    }
}
```

**CreateTableStatement 和 ColumnDef**：

```java
public class ColumnDef {
    public final String name;
    public final String type;   // "INT" 或 "VARCHAR"
    public final int length;    // VARCHAR(n) 的 n；INT 为 -1

    public ColumnDef(String name, String type, int length) {
        this.name = name;
        this.type = type;
        this.length = length;
    }

    @Override
    public String toString() {
        if (length > 0) {
            return name + " " + type + "(" + length + ")";
        }
        return name + " " + type;
    }
}

public class CreateTableStatement extends Statement {
    public final String tableName;
    public final List<ColumnDef> columns;

    public CreateTableStatement(String tableName, List<ColumnDef> columns) {
        this.tableName = tableName;
        this.columns = columns;
    }

    @Override
    public String toString() {
        StringBuilder sb = new StringBuilder();
        sb.append("CreateTableStatement {\n");
        sb.append("  table: ").append(tableName).append("\n");
        sb.append("  columns:\n");
        for (ColumnDef col : columns) {
            sb.append("    - ").append(col).append("\n");
        }
        sb.append("}");
        return sb.toString();
    }
}
```

### 4.2 Parser 类的整体结构

```java
public class Parser {
    private final List<Token> tokens;
    private int pos;

    public Parser(List<Token> tokens) {
        this.tokens = tokens;
        this.pos = 0;
    }

    public Statement parse() {
        Statement stmt = parseStatement();
        // 可选的分号
        match(TokenType.SEMICOLON);
        // 确保已消耗所有 Token
        if (!check(TokenType.EOF)) {
            throw new ParseException("语句结束后有多余的 Token: " + peek());
        }
        return stmt;
    }

    private Statement parseStatement() { ... }
    private SelectStatement parseSelectStatement() { ... }
    private InsertStatement parseInsertStatement() { ... }
    private CreateTableStatement parseCreateStatement() { ... }
    private Condition parseCondition() { ... }

    // 工具方法
    private Token peek() { ... }
    private Token advance() { ... }
    private Token expect(TokenType type) { ... }
    private boolean check(TokenType type) { ... }
    private boolean match(TokenType type) { ... }
}
```

### 4.3 解析 SELECT 语句

对应文法规则：
```
select_stmt ::= SELECT column_list FROM IDENTIFIER [ WHERE condition ]
column_list ::= IDENTIFIER (',' IDENTIFIER)* | '*'
```

```java
private SelectStatement parseSelectStatement() {
    expect(TokenType.SELECT);  // 消耗 SELECT

    // 解析列列表
    List<String> columns = new ArrayList<>();
    // 检查是否是 SELECT *
    if (check(TokenType.IDENTIFIER) || check(TokenType.STAR)) {
        // 第一列
        Token col = advance();
        columns.add(col.value);
        // 后续列：, IDENTIFIER
        while (match(TokenType.COMMA)) {
            columns.add(expect(TokenType.IDENTIFIER).value);
        }
    } else {
        throw new ParseException("SELECT 后面期望列名或 *，实际: " + peek());
    }

    expect(TokenType.FROM);  // 消耗 FROM
    String tableName = expect(TokenType.IDENTIFIER).value;  // 表名

    // 可选的 WHERE 子句
    Condition whereClause = null;
    if (match(TokenType.WHERE)) {
        whereClause = parseCondition();
    }

    return new SelectStatement(columns, tableName, whereClause);
}
```

### 4.4 解析 WHERE 条件

对应文法规则：
```
condition ::= IDENTIFIER operator literal
operator  ::= '=' | '!=' | '>' | '<' | '>=' | '<='
literal   ::= INTEGER | STRING
```

```java
private Condition parseCondition() {
    String column = expect(TokenType.IDENTIFIER).value;

    // 解析运算符
    Token opToken = advance();
    String op;
    switch (opToken.type) {
        case EQ:  op = "=";  break;
        case NEQ: op = "!="; break;
        case GT:  op = ">";  break;
        case LT:  op = "<";  break;
        case GTE: op = ">="; break;
        case LTE: op = "<="; break;
        default:
            throw new ParseException("期望比较运算符，实际: " + opToken);
    }

    // 解析字面量
    Token valToken = advance();
    if (valToken.type == TokenType.INTEGER) {
        return new Condition(column, op, valToken.value, false);
    } else if (valToken.type == TokenType.STRING) {
        return new Condition(column, op, valToken.value, true);
    } else {
        throw new ParseException("期望整数或字符串字面量，实际: " + valToken);
    }
}
```

### 4.5 解析 INSERT 语句

对应文法规则：
```
insert_stmt ::= INSERT INTO IDENTIFIER VALUES '(' value_list ')'
value_list  ::= literal (',' literal)*
```

```java
private InsertStatement parseInsertStatement() {
    expect(TokenType.INSERT);
    expect(TokenType.INTO);
    String tableName = expect(TokenType.IDENTIFIER).value;
    expect(TokenType.VALUES);
    expect(TokenType.LPAREN);

    List<String> values = new ArrayList<>();
    // 第一个值
    values.add(parseLiteral());
    // 后续值
    while (match(TokenType.COMMA)) {
        values.add(parseLiteral());
    }

    expect(TokenType.RPAREN);
    return new InsertStatement(tableName, values);
}

private String parseLiteral() {
    Token t = advance();
    if (t.type == TokenType.INTEGER || t.type == TokenType.STRING) {
        return t.value;
    }
    throw new ParseException("期望字面量（整数或字符串），实际: " + t);
}
```

### 4.6 解析 CREATE TABLE 语句

对应文法规则：
```
create_stmt  ::= CREATE TABLE IDENTIFIER '(' col_def_list ')'
col_def_list ::= col_def (',' col_def)*
col_def      ::= IDENTIFIER type_name ['(' INTEGER ')']
type_name    ::= INT | VARCHAR
```

```java
private CreateTableStatement parseCreateStatement() {
    expect(TokenType.CREATE);
    expect(TokenType.TABLE);
    String tableName = expect(TokenType.IDENTIFIER).value;
    expect(TokenType.LPAREN);

    List<ColumnDef> columns = new ArrayList<>();
    columns.add(parseColumnDef());
    while (match(TokenType.COMMA)) {
        columns.add(parseColumnDef());
    }

    expect(TokenType.RPAREN);
    return new CreateTableStatement(tableName, columns);
}

private ColumnDef parseColumnDef() {
    String colName = expect(TokenType.IDENTIFIER).value;

    // 解析类型
    Token typeToken = advance();
    String typeName;
    if (typeToken.type == TokenType.INT) {
        typeName = "INT";
        return new ColumnDef(colName, typeName, -1);
    } else if (typeToken.type == TokenType.VARCHAR) {
        typeName = "VARCHAR";
        // VARCHAR 必须有长度参数 VARCHAR(n)
        expect(TokenType.LPAREN);
        int length = Integer.parseInt(expect(TokenType.INTEGER).value);
        expect(TokenType.RPAREN);
        return new ColumnDef(colName, typeName, length);
    } else {
        throw new ParseException("期望列类型（INT 或 VARCHAR），实际: " + typeToken);
    }
}
```

### 4.7 ParseException

```java
public class ParseException extends RuntimeException {
    public ParseException(String message) {
        super("语法错误: " + message);
    }
}
```

### 4.8 完整解析流程示例

以 `SELECT name, score FROM students WHERE score > 80` 为例：

```
调用栈：
parse()
  └─ parseStatement()          → 看到 SELECT，调用 parseSelectStatement()
       └─ parseSelectStatement()
            ├─ expect(SELECT)  → 消耗 [SELECT]
            ├─ 解析列列表
            │   ├─ advance()   → 消耗 [IDENTIFIER:name]，columns=["name"]
            │   ├─ match(COMMA)→ 消耗 [COMMA]
            │   └─ expect(IDENTIFIER) → 消耗 [IDENTIFIER:score]，columns=["name","score"]
            ├─ expect(FROM)    → 消耗 [FROM]
            ├─ expect(IDENTIFIER) → 消耗 [IDENTIFIER:students]，tableName="students"
            ├─ match(WHERE)    → 消耗 [WHERE]，进入 WHERE 分支
            └─ parseCondition()
                 ├─ expect(IDENTIFIER) → 消耗 [IDENTIFIER:score]，column="score"
                 ├─ advance()          → 消耗 [GT]，op=">"
                 └─ advance()          → 消耗 [INTEGER:80]，value="80"

返回：SelectStatement {
  columns: ["name", "score"],
  tableName: "students",
  whereClause: Condition("score", ">", "80", false)
}
```

---

## 5. 实践练习

### 练习 1（基础）：支持 SELECT *

当前 Parser 的 `parseSelectStatement()` 只处理了具名列。请扩展它以支持 `SELECT *`。

要求：
1. 在 `TokenType` 中添加 `STAR` 枚举值（对应 `*` 字符）
2. 在 Lexer 的 `readOperatorOrPunctuation()` 中添加 `*` 的处理
3. 在 `parseSelectStatement()` 中：若遇到 `STAR`，将 columns 设为 `["*"]`
4. 测试：`SELECT * FROM students WHERE score > 60`

### 练习 2（进阶）：支持多条件 WHERE（AND）

当前 WHERE 子句只支持单个条件。请扩展以支持 `AND` 连接的多个条件。

要求：
1. 在 `TokenType` 中添加 `AND` 关键字
2. 修改 `SelectStatement`，将 `whereClause` 从单个 `Condition` 改为 `List<Condition>`（AND 语义）
3. 修改 `parseSelectStatement()` 中的 WHERE 解析：循环消耗 `AND condition`
4. 测试：`SELECT name FROM students WHERE score > 60 AND score < 90`

### 练习 3（挑战）：实现 DROP TABLE 语句的解析

要求：
1. 添加 `DropTableStatement` 类，包含 `tableName` 字段
2. 在 `parseStatement()` 中添加 `DROP` 分支
3. 实现 `parseDropStatement()`，文法：`DROP TABLE IDENTIFIER`
4. 支持可选的 `IF EXISTS`：`DROP TABLE IF EXISTS students`
   - 需要添加 `IF`、`EXISTS` 关键字到 TokenType
   - `DropTableStatement` 添加 `boolean ifExists` 字段
5. 测试两种形式：`DROP TABLE t` 和 `DROP TABLE IF EXISTS t`

---

## 6. 常见问题

**Q1：递归下降解析能处理所有 SQL 语法吗？**

A：递归下降解析能处理 **LL(k) 文法**（从左到右扫描，最左推导，向前看 k 个 Token）。大多数 SQL 语句都是 LL(1) 的（只需向前看 1 个 Token 就能决定走哪条分支），因此递归下降完全够用。

不能直接处理的情况是**左递归文法**，例如：
```
expr ::= expr '+' term | term   ← 左递归，会导致无限递归
```
需要改写为右递归或迭代形式。本章的 SQL 子集没有左递归问题。

---

**Q2：AST 和 Parse Tree（具体语法树）有什么区别？**

A：
- **Parse Tree（具体语法树）**：完整反映文法产生式的树，包含所有中间节点（如 `column_list`、`value_list`）和终结符（如括号、逗号）
- **AST（抽象语法树）**：去掉了对语义无意义的节点（括号、逗号、关键字），只保留语义相关的结构

例如 `(1 + 2)` 的 Parse Tree 包含括号节点，而 AST 只有 `Add(1, 2)`。

JimSQL 直接构建 AST，跳过 Parse Tree 阶段，这是手写 Parser 的常见做法。

---

**Q3：为什么 `expect()` 方法既消耗 Token 又验证类型，而不是分开写？**

A：这是一种常见的 Parser 编程模式，叫做 **"消耗并验证"**。分开写会导致代码冗余：

```java
// 分开写（冗余）
if (!check(TokenType.FROM)) {
    throw new ParseException("...");
}
advance();

// 合并写（简洁）
expect(TokenType.FROM);
```

`expect()` 的语义是："我确定这里应该是 X，如果不是就报错"。它让 Parser 代码更接近文法规则的自然描述。

---

**Q4：Parser 如何处理 SQL 中的保留字被用作列名的情况？**

A：这是一个真实的 SQL 兼容性问题。例如 `SELECT name FROM order`，`order` 是 SQL 关键字，但也可能是表名。

处理方式：
1. **严格模式**：保留字不能用作标识符，报错（JimSQL 采用此方式，简化实现）
2. **引号转义**：用反引号或双引号包裹：`` SELECT name FROM `order` ``
3. **上下文感知**：在 `FROM` 后面允许关键字作为标识符（复杂，需要修改文法）

生产级数据库（MySQL、PostgreSQL）通常支持方式 2 和 3。

---

## 7. 本章小结

本章在 Ch07 Lexer 的基础上，实现了 JimSQL 的语法分析器（Parser）。

核心收获：

1. **CFG 文法是 Parser 的设计蓝图**：每条产生式对应一个 `parseXxx()` 方法，代码结构与文法规则一一对应
2. **递归下降是最直观的手写 Parser 方式**：通过 `peek()`/`advance()`/`expect()` 三个核心操作消耗 Token 流
3. **AST 是语义的载体**：去掉语法噪音（括号、逗号、关键字），只保留对后续处理有意义的结构
4. **错误处理要提供上下文**：`ParseException` 应包含期望的 Token 类型和实际遇到的 Token，帮助用户定位问题

下一章（Ch09）将在 AST 的基础上实现语义分析（Binder），验证表名、列名是否存在，并进行类型推导。

```
SQL 字符串
    │
    ▼
[Lexer]  ──► Token 流          ← Ch07 完成
    │
    ▼
[Parser] ──► AST               ← 本章完成
    │
    ▼
[Binder] ──► 绑定后的 AST      ← Ch09 实现
```

## 课堂练习

### ⭐ 基础
1. 对 `SELECT a, b FROM t WHERE c > 5` 手动画出 AST
2. 追踪递归下降解析 `1 + 2 * 3` 的调用栈过程
3. 解释为什么 `SELECT * FROM t` 的 `*` 不是乘法

### ⭐⭐ 进阶
1. 为 JimSQL 添加 ORDER BY 子句的解析
2. 实现 LEFT JOIN 的语法定义和 AST 节点
3. 分析解析 `a = b = c` 时为什么报错（赋值 vs 比较）

### ⭐⭐⭐ 挑战
1. 实现子查询解析（`WHERE id IN (SELECT ...)`）
2. 实现 CASE WHEN 表达式的解析
3. 实现 Parser 的错误恢复（在错误位置恢复并继续解析）
