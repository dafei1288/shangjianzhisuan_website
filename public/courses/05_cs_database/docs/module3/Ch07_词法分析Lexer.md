# Ch07 词法分析（Lexer）

> Module 3 · SQL 解析 · 第 1 章（共 3 章）

---

## 1. 教学目标

学完本章，你应该能够：

1. 解释什么是 Token，以及 SQL 中各类 Token 的分类（关键字、标识符、字面量、运算符、分隔符）
2. 描述词法分析器（Lexer）的工作原理：逐字符扫描 + 状态机驱动
3. 设计并实现一个能处理常见 SQL 语句的 `TokenType` 枚举和 `Lexer` 类
4. 处理词法分析中的边界情况：跳过空白、单引号字符串、大小写不敏感关键字
5. 理解手写 Lexer 与工具生成（ANTLR/JavaCC）的适用场景与取舍

---

## 2. 课前准备

### 2.1 知识储备

- Java 基础：枚举（enum）、字符串操作、switch 语句
- 了解什么是编译器的前端（词法分析 → 语法分析 → 语义分析）
- 对 SQL 有基本认知（会写 SELECT/INSERT/CREATE TABLE）

### 2.2 环境要求

- JDK 11+（本章 Demo 无第三方依赖）
- 任意 IDE 或命令行编译均可

### 2.3 预习问题

在开始之前，思考以下问题：

1. 当你读到 `SELECT name FROM students` 时，你的大脑是如何"切词"的？
2. `123` 和 `'张三'` 都是字面量，它们在处理上有什么不同？
3. `>=` 是一个 Token 还是两个 Token？

---

## 3. 核心概念

### 3.1 什么是 Token

**词法分析（Lexical Analysis）** 是 SQL 解析的第一步。它把一段原始的 SQL 字符串切割成一个个有意义的最小单元，这些单元叫做 **Token（词法单元）**。

类比：就像中文分词把"我爱北京天安门"切成"我 / 爱 / 北京 / 天安门"，词法分析把 SQL 字符串切成结构化的 Token 序列。

```
输入：SELECT name FROM students WHERE score > 80

输出（Token 流）：
  [KEYWORD:SELECT] [IDENTIFIER:name] [KEYWORD:FROM]
  [IDENTIFIER:students] [KEYWORD:WHERE] [IDENTIFIER:score]
  [GT:>] [INTEGER:80]
```

每个 Token 包含两个核心属性：
- **类型（TokenType）**：这个词是什么种类
- **值（value）**：这个词的原始文本

### 3.2 SQL Token 的分类

| 类别 | 说明 | 示例 |
|------|------|------|
| 关键字（KEYWORD） | SQL 保留字，大小写不敏感 | `SELECT`, `FROM`, `WHERE`, `INSERT`, `INTO`, `VALUES`, `CREATE`, `TABLE`, `DROP`, `INT`, `VARCHAR` |
| 标识符（IDENTIFIER） | 表名、列名等用户自定义名称 | `students`, `name`, `score` |
| 整数字面量（INTEGER） | 不带引号的数字 | `80`, `1`, `100` |
| 字符串字面量（STRING） | 单引号包裹的文本 | `'张三'`, `'hello'` |
| 运算符（OPERATOR） | 比较和算术运算符 | `>`, `<`, `=`, `!=`, `>=`, `<=` |
| 分隔符（PUNCTUATION） | 结构性符号 | `,`, `(`, `)`, `;` |
| EOF | 输入结束标记 | （无文本） |

### 3.3 词法分析的状态机

词法分析器本质上是一个**有限状态机（Finite State Machine, FSM）**。它从左到右逐字符扫描，根据当前字符决定进入哪个状态，直到识别出一个完整的 Token。

```
状态转移图（简化版）：

         空白字符
    ┌──────────────────┐
    │                  ▼
[START] ──字母/下划线──► [IN_IDENTIFIER] ──非字母数字──► 输出 IDENTIFIER/KEYWORD
    │
    ├──数字──────────► [IN_NUMBER]      ──非数字──────► 输出 INTEGER
    │
    ├──单引号────────► [IN_STRING]      ──单引号──────► 输出 STRING
    │
    ├──'>'──────────► [AFTER_GT]        ──'='──────────► 输出 GTE
    │                                   └─其他──────────► 输出 GT
    │
    └──','/'('/...──► 直接输出对应分隔符 Token
```

关键设计原则：
1. **最长匹配（Maximal Munch）**：尽可能多地消耗字符。`>=` 应识别为一个 Token，而不是 `>` 和 `=` 两个。
2. **跳过空白**：空格、制表符、换行符不产生 Token，直接跳过。
3. **大小写不敏感**：关键字匹配时统一转为大写比较。

### 3.4 TokenType 枚举设计

```java
public enum TokenType {
    // 关键字
    SELECT, FROM, WHERE, INSERT, INTO, VALUES,
    CREATE, TABLE, DROP, INT, VARCHAR,

    // 标识符和字面量
    IDENTIFIER,   // 表名、列名
    INTEGER,      // 整数字面量
    STRING,       // 字符串字面量（单引号）

    // 比较运算符
    EQ,   // =
    NEQ,  // !=
    GT,   // >
    LT,   // <
    GTE,  // >=
    LTE,  // <=

    // 分隔符
    COMMA,        // ,
    LPAREN,       // (
    RPAREN,       // )
    SEMICOLON,    // ;

    // 特殊
    EOF           // 输入结束
}
```

设计说明：
- 关键字直接用枚举名表示，避免字符串比较
- 运算符用语义名（`GT` 而非 `GREATER_THAN`），简洁但不失可读性
- `EOF` 是哨兵值，让 Parser 知道输入已结束，避免越界检查

### 3.5 手写 Lexer vs 工具生成

| 维度 | 手写 Lexer | ANTLR/JavaCC |
|------|-----------|--------------|
| 学习成本 | 低，纯 Java | 高，需学 DSL 语法 |
| 灵活性 | 高，可任意定制 | 受工具约束 |
| 维护性 | 中，逻辑分散 | 高，语法文件集中 |
| 性能 | 可手动优化 | 工具生成，通常够用 |
| 适用场景 | 教学、小型 DSL、需要精细控制 | 生产级编译器、复杂语言 |

**JimSQL 的选择**：手写 Lexer。原因：
1. SQL 的词法规则相对简单，不需要工具
2. 手写代码更透明，便于教学和调试
3. 避免引入外部依赖

---

## 4. 代码讲解

### 4.1 Token 类

Token 是一个简单的值对象，持有类型和原始文本：

```java
public class Token {
    public final TokenType type;
    public final String value;

    public Token(TokenType type, String value) {
        this.type = type;
        this.value = value;
    }

    @Override
    public String toString() {
        return String.format("[%s:%s]", type, value);
    }
}
```

设计要点：
- 字段用 `final`，Token 是不可变对象（immutable）
- `toString()` 格式化输出便于调试

### 4.2 Lexer 类的整体结构

```java
public class Lexer {
    private final String input;   // 原始 SQL 字符串
    private int pos;              // 当前扫描位置（游标）

    public Lexer(String input) {
        this.input = input;
        this.pos = 0;
    }

    public List<Token> tokenize() {
        List<Token> tokens = new ArrayList<>();
        while (pos < input.length()) {
            skipWhitespace();
            if (pos >= input.length()) break;

            Token token = nextToken();
            if (token != null) {
                tokens.add(token);
            }
        }
        tokens.add(new Token(TokenType.EOF, ""));
        return tokens;
    }

    private Token nextToken() { /* 核心逻辑，见下节 */ }
    private void skipWhitespace() { /* 跳过空白 */ }
    private Token readIdentifierOrKeyword() { /* 读标识符/关键字 */ }
    private Token readNumber() { /* 读整数 */ }
    private Token readString() { /* 读字符串字面量 */ }
    private Token readOperatorOrPunctuation() { /* 读运算符/分隔符 */ }
}
```

`pos` 是整个 Lexer 的核心状态，所有方法都通过移动 `pos` 来消耗字符。

### 4.3 跳过空白字符

```java
private void skipWhitespace() {
    while (pos < input.length() && Character.isWhitespace(input.charAt(pos))) {
        pos++;
    }
}
```

`Character.isWhitespace()` 能处理空格、`\t`、`\n`、`\r`，一行搞定。

### 4.4 读取标识符和关键字

标识符以字母或下划线开头，后续可以是字母、数字、下划线：

```java
private Token readIdentifierOrKeyword() {
    int start = pos;
    // 消耗所有合法的标识符字符
    while (pos < input.length() &&
           (Character.isLetterOrDigit(input.charAt(pos)) || input.charAt(pos) == '_')) {
        pos++;
    }
    String word = input.substring(start, pos);

    // 大小写不敏感：统一转大写后查关键字表
    String upper = word.toUpperCase();
    switch (upper) {
        case "SELECT":  return new Token(TokenType.SELECT,  word);
        case "FROM":    return new Token(TokenType.FROM,    word);
        case "WHERE":   return new Token(TokenType.WHERE,   word);
        case "INSERT":  return new Token(TokenType.INSERT,  word);
        case "INTO":    return new Token(TokenType.INTO,    word);
        case "VALUES":  return new Token(TokenType.VALUES,  word);
        case "CREATE":  return new Token(TokenType.CREATE,  word);
        case "TABLE":   return new Token(TokenType.TABLE,   word);
        case "DROP":    return new Token(TokenType.DROP,    word);
        case "INT":     return new Token(TokenType.INT,     word);
        case "VARCHAR": return new Token(TokenType.VARCHAR, word);
        default:        return new Token(TokenType.IDENTIFIER, word);
    }
}
```

注意：Token 的 `value` 保留原始大小写（`word`），而不是 `upper`。这样在错误信息中能显示用户原始输入。

### 4.5 读取整数字面量

```java
private Token readNumber() {
    int start = pos;
    while (pos < input.length() && Character.isDigit(input.charAt(pos))) {
        pos++;
    }
    return new Token(TokenType.INTEGER, input.substring(start, pos));
}
```

本章只处理整数。浮点数、负数等扩展留给后续章节。

### 4.6 读取字符串字面量（单引号）

字符串字面量是词法分析中最容易出错的部分，需要处理：
- 正常情况：`'hello'` → `hello`（去掉引号）
- 转义情况：`'it''s'` → `it's`（SQL 标准用两个单引号表示一个单引号）
- 未闭合情况：`'hello` → 抛出异常

```java
private Token readString() {
    pos++; // 跳过开头的单引号
    StringBuilder sb = new StringBuilder();
    while (pos < input.length()) {
        char c = input.charAt(pos);
        if (c == '\'') {
            // 检查是否是转义的单引号 ''
            if (pos + 1 < input.length() && input.charAt(pos + 1) == '\'') {
                sb.append('\'');
                pos += 2; // 跳过两个单引号
            } else {
                pos++; // 跳过结尾的单引号
                return new Token(TokenType.STRING, sb.toString());
            }
        } else {
            sb.append(c);
            pos++;
        }
    }
    throw new RuntimeException("未闭合的字符串字面量，位置: " + pos);
}
```

### 4.7 读取运算符和分隔符

```java
private Token readOperatorOrPunctuation() {
    char c = input.charAt(pos);
    pos++;
    switch (c) {
        case ',': return new Token(TokenType.COMMA,     ",");
        case '(': return new Token(TokenType.LPAREN,    "(");
        case ')': return new Token(TokenType.RPAREN,    ")");
        case ';': return new Token(TokenType.SEMICOLON, ";");
        case '=': return new Token(TokenType.EQ,        "=");
        case '>':
            if (pos < input.length() && input.charAt(pos) == '=') {
                pos++;
                return new Token(TokenType.GTE, ">=");
            }
            return new Token(TokenType.GT, ">");
        case '<':
            if (pos < input.length() && input.charAt(pos) == '=') {
                pos++;
                return new Token(TokenType.LTE, "<=");
            }
            return new Token(TokenType.LT, "<");
        case '!':
            if (pos < input.length() && input.charAt(pos) == '=') {
                pos++;
                return new Token(TokenType.NEQ, "!=");
            }
            throw new RuntimeException("非法字符 '!' 后面应跟 '='，位置: " + (pos - 1));
        default:
            throw new RuntimeException("非法字符: '" + c + "'，位置: " + (pos - 1));
    }
}
```

`>=`、`<=`、`!=` 的处理体现了**最长匹配原则**：先消耗第一个字符，再向前看一个字符（lookahead）决定是否继续消耗。

### 4.8 nextToken 主调度方法

```java
private Token nextToken() {
    char c = input.charAt(pos);

    if (Character.isLetter(c) || c == '_') {
        return readIdentifierOrKeyword();
    } else if (Character.isDigit(c)) {
        return readNumber();
    } else if (c == '\'') {
        return readString();
    } else {
        return readOperatorOrPunctuation();
    }
}
```

这是一个简单的分发器：根据当前字符的第一个字符决定调用哪个子方法。

### 4.9 完整的词法分析流程示例

以 `SELECT name FROM students WHERE score > 80` 为例，逐步追踪：

```
pos=0,  c='S' → readIdentifierOrKeyword() → 读到 "SELECT"  → [SELECT:SELECT]
pos=6,  c=' ' → skipWhitespace()          → pos=7
pos=7,  c='n' → readIdentifierOrKeyword() → 读到 "name"    → [IDENTIFIER:name]
pos=11, c=' ' → skipWhitespace()          → pos=12
pos=12, c='F' → readIdentifierOrKeyword() → 读到 "FROM"    → [FROM:FROM]
pos=16, c=' ' → skipWhitespace()          → pos=17
pos=17, c='s' → readIdentifierOrKeyword() → 读到 "students"→ [IDENTIFIER:students]
pos=25, c=' ' → skipWhitespace()          → pos=26
pos=26, c='W' → readIdentifierOrKeyword() → 读到 "WHERE"   → [WHERE:WHERE]
pos=31, c=' ' → skipWhitespace()          → pos=32
pos=32, c='s' → readIdentifierOrKeyword() → 读到 "score"   → [IDENTIFIER:score]
pos=37, c=' ' → skipWhitespace()          → pos=38
pos=38, c='>' → readOperatorOrPunctuation()→ 读到 ">"      → [GT:>]
pos=39, c=' ' → skipWhitespace()          → pos=40
pos=40, c='8' → readNumber()              → 读到 "80"      → [INTEGER:80]
pos=42, 结束  → 追加 [EOF:]
```

---

## 5. 实践练习

### 练习 1（基础）：扩展关键字支持

当前 Lexer 支持的关键字有限。请添加以下关键字的支持：
- `AND`、`OR`、`NOT`（逻辑运算符）
- `NULL`（空值）
- `LIKE`（模糊匹配）

要求：
1. 在 `TokenType` 枚举中添加对应枚举值
2. 在 `readIdentifierOrKeyword()` 的 switch 中添加对应 case
3. 编写测试：`SELECT * FROM t WHERE name LIKE 'J%' AND age IS NOT NULL`

### 练习 2（进阶）：支持浮点数字面量

当前 Lexer 只支持整数。请扩展 `readNumber()` 方法，使其能识别浮点数（如 `3.14`、`99.9`）。

要求：
1. 添加 `FLOAT` 枚举值到 `TokenType`
2. 修改 `readNumber()`：遇到 `.` 时继续读取小数部分
3. 注意边界：`.` 后面必须有数字，否则报错
4. 测试：`SELECT price FROM products WHERE price > 9.99`

### 练习 3（挑战）：实现行号和列号追踪

生产级 Lexer 需要在 Token 中记录位置信息，用于生成精确的错误信息（如 `第 2 行第 5 列：非法字符`）。

要求：
1. 给 `Token` 类添加 `line` 和 `column` 字段
2. 在 `Lexer` 中维护 `currentLine` 和 `currentColumn` 计数器
3. 遇到 `\n` 时 `currentLine++`，`currentColumn` 重置为 1
4. 每个 Token 创建时记录其起始行列
5. 测试多行 SQL：
   ```sql
   SELECT name
   FROM students
   WHERE score > 80
   ```
   验证 `FROM` 的行号是 2，`WHERE` 的行号是 3

---

## 6. 常见问题

**Q1：为什么关键字要大小写不敏感？**

A：SQL 标准规定关键字大小写不敏感，`SELECT`、`select`、`Select` 都是合法的。实现方式是在比较前统一转大写（`word.toUpperCase()`）。注意：标识符（表名、列名）的大小写敏感性由数据库实现决定，MySQL 在 Windows 上默认不敏感，在 Linux 上默认敏感。JimSQL 为简化实现，标识符也不区分大小写。

---

**Q2：`!=` 和 `<>` 都表示不等于，需要都支持吗？**

A：SQL 标准中 `<>` 是官方的不等于运算符，`!=` 是大多数数据库的扩展（MySQL、PostgreSQL 都支持）。JimSQL 选择支持 `!=`（更符合 Java/C 程序员习惯）。如果要支持 `<>`，在 `readOperatorOrPunctuation()` 的 `<` 分支中，除了检查 `<=`，还要检查 `<>` 并返回 `NEQ`。

---

**Q3：词法分析能检测出哪些错误？**

A：词法分析只能检测**词法错误**，即无法构成合法 Token 的字符序列：
- 非法字符：`@`、`#`、`$`（SQL 中不合法）
- 未闭合的字符串：`'hello`
- 非法的运算符：`!a`（`!` 后面不是 `=`）

词法分析**不能**检测语法错误（如 `SELECT FROM WHERE`）和语义错误（如引用不存在的表），这些分别由 Parser 和 Binder 负责。

---

**Q4：Token 的 value 应该保留原始大小写还是统一转换？**

A：推荐保留原始大小写。原因：
1. 错误信息更友好：`未知列 'Name'` 比 `未知列 'NAME'` 更准确
2. 字符串字面量必须保留原始大小写（`'Hello'` 和 `'hello'` 是不同的值）
3. 关键字的大小写不敏感在 Parser 层通过比较 `token.type` 而非 `token.value` 来实现，不依赖 value 的大小写

---

## 7. 本章小结

本章实现了 JimSQL 的词法分析器（Lexer），它是整个 SQL 解析管道的第一步。

核心收获：

1. **Token 是 SQL 解析的基本单元**，包含类型（TokenType）和值（value）两个属性
2. **Lexer 是一个状态机**，通过逐字符扫描和状态转移识别 Token 边界
3. **关键实现细节**：跳过空白、最长匹配原则（`>=` 优先于 `>`）、大小写不敏感关键字、单引号字符串的转义处理
4. **错误处理**：词法错误应尽早抛出，并提供位置信息

下一章（Ch08）将基于本章的 Lexer，实现语法分析器（Parser），把 Token 流转换为抽象语法树（AST）。

```
SQL 字符串
    │
    ▼
[Lexer] ──► Token 流  ← 本章完成
    │
    ▼
[Parser] ──► AST      ← 下章实现
    │
    ▼
[Binder] ──► 绑定后的 AST ← Ch09 实现
```

## 课堂练习

### ⭐ 基础
1. 对 `SELECT id, name FROM students WHERE score > 90;` 手动写出 Token 序列
2. 追踪 Lexer 处理 `>=` 和 `>` 的分支逻辑（如何区分？）
3. 测试 Lexer 对非法字符的处理（如 `@`、`#`）

### ⭐⭐ 进阶
1. 为 JimSQL 添加 BETWEEN 关键字和对应 Token
2. 实现字符串字面量的转义处理（如 `'it''s'` → `it's`）
3. 实现 Lexer 的错误恢复（跳过非法字符继续扫描）

### ⭐⭐⭐ 挑战
1. 实现 SQL 的注释处理（单行 `--` 和多行 `/* */`）
2. 实现数值字面量的科学计数法（如 `1.5e10`）
3. 对比手写 Lexer 与 ANTLR4 生成 Lexer 的性能差异
