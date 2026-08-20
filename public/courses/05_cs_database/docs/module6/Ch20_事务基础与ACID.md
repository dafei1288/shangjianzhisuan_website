# Ch20：事务基础与 ACID

## 教学目标

1. 理解事务的本质：一组操作的原子执行单元，以及为什么数据库需要事务
2. 深入掌握 ACID 四个属性的含义，能结合具体场景解释每个属性的作用
3. 识别并发执行事务时可能出现的三类问题：脏读、不可重复读、幻读
4. 理解四种隔离级别的语义，以及它们与并发问题的对应关系
5. 掌握事务的生命周期状态机，理解 BEGIN / COMMIT / ROLLBACK 的语义

---

## 课前准备

- 回顾 Java 多线程基础（synchronized、volatile、Thread）
- 了解文件 I/O 的基本概念（读写、缓冲区）
- 思考：银行转账时，如果程序在扣款后崩溃，会发生什么？

---

## 核心概念

### 1. 为什么需要事务

考虑一个经典的银行转账场景：

```
账户 A：余额 1000 元
账户 B：余额 500 元
操作：A 向 B 转账 300 元
```

转账需要两步：
1. A 的余额减少 300：`UPDATE account SET balance = 700 WHERE id = 'A'`
2. B 的余额增加 300：`UPDATE account SET balance = 800 WHERE id = 'B'`

如果在步骤 1 完成后、步骤 2 执行前，系统崩溃了，会发生什么？

- A 的钱少了 300
- B 的钱没有增加
- 300 元凭空消失

这就是**没有事务保护**时的灾难。事务的核心价值是：**要么全做，要么全不做**。

### 2. 事务的定义

**事务（Transaction）** 是数据库操作的最小逻辑单元，它将一组操作封装成一个整体，具有以下特征：

```
BEGIN TRANSACTION
  操作1: UPDATE account SET balance = balance - 300 WHERE id = 'A'
  操作2: UPDATE account SET balance = balance + 300 WHERE id = 'B'
COMMIT  -- 或 ROLLBACK
```

事务的生命周期状态机：

```
                    BEGIN
                      │
                      ▼
              ┌─────ACTIVE──────┐
              │                 │
           操作执行           发生错误
              │                 │
              ▼                 ▼
          PARTIALLY         FAILED
          COMMITTED            │
              │                │
           COMMIT           ROLLBACK
              │                │
              ▼                ▼
          COMMITTED        ABORTED
```

状态说明：
- **ACTIVE**：事务正在执行操作
- **PARTIALLY COMMITTED**：最后一条操作执行完毕，等待提交
- **COMMITTED**：事务成功提交，所有修改永久生效
- **FAILED**：事务执行过程中发生错误
- **ABORTED**：事务已回滚，数据库恢复到事务开始前的状态

### 3. ACID 四个属性

#### 3.1 原子性（Atomicity）

**定义**：事务中的所有操作要么全部成功，要么全部失败回滚。

**场景**：转账操作中，扣款和入账必须同时成功或同时失败。

**实现机制**：Undo Log（撤销日志）。数据库在执行每个操作前，先记录"如何撤销这个操作"。如果事务需要回滚，就按照 Undo Log 逆序执行撤销操作。

```
Undo Log 示例：
[TxId=1, Type=UPDATE, Table=account, Key='A', OldValue=1000, NewValue=700]
[TxId=1, Type=UPDATE, Table=account, Key='B', OldValue=500, NewValue=800]

回滚时：
  将 account['B'] 恢复为 500
  将 account['A'] 恢复为 1000
```

#### 3.2 一致性（Consistency）

**定义**：事务执行前后，数据库必须从一个一致状态转变到另一个一致状态。一致性由业务规则（约束）定义。

**场景**：转账前后，A + B 的总余额必须保持不变（1500 元）。

**注意**：一致性是 ACID 中唯一一个由**应用层**保证的属性，其他三个属性（AID）是数据库引擎保证的。如果业务逻辑本身有 bug（比如转账金额写错了），数据库无法保证一致性。

```
一致性约束示例：
  约束1：账户余额不能为负数（CHECK balance >= 0）
  约束2：转账前后总金额不变（业务逻辑保证）
  约束3：外键约束（引用的记录必须存在）
```

#### 3.3 隔离性（Isolation）

**定义**：并发执行的多个事务之间互不干扰，每个事务感觉自己是在独立执行。

**场景**：T1 在转账过程中，T2 查询账户余额，T2 不应该看到中间状态（A 已扣款但 B 未入账）。

**实现机制**：锁（Locking）或 MVCC（多版本并发控制）。

```
理想的隔离（串行化）：
  T1: BEGIN → 扣款 → 入账 → COMMIT
  T2:                              BEGIN → 查询 → COMMIT

实际并发（可能出现问题）：
  T1: BEGIN → 扣款 ─────────────── 入账 → COMMIT
  T2:          BEGIN → 查询（看到中间状态！）→ COMMIT
```

#### 3.4 持久性（Durability）

**定义**：事务一旦提交，其修改就永久保存，即使系统崩溃也不会丢失。

**场景**：转账成功后，即使服务器立刻断电，重启后数据依然正确。

**实现机制**：Redo Log（重做日志）。提交时，先将 Redo Log 强制刷盘（fsync），确保日志写入磁盘后再返回成功。即使数据页还在内存中，崩溃后也可以通过 Redo Log 重放恢复。

```
持久性保证流程：
  1. 执行操作，修改内存中的数据页
  2. 将操作记录写入 Redo Log（内存）
  3. COMMIT 时，将 Redo Log 强制刷盘（fsync）
  4. 返回"提交成功"给客户端
  5. 后台异步将数据页刷盘
```

### 4. 并发问题

当多个事务并发执行时，如果隔离性不足，会出现以下问题：

#### 4.1 脏读（Dirty Read）

**定义**：事务 T1 读取了事务 T2 **未提交**的数据。如果 T2 随后回滚，T1 读到的数据就是"脏数据"。

```
时间线：
T1:  BEGIN
T2:  BEGIN
T2:  UPDATE account SET balance = 700 WHERE id = 'A'  -- 未提交
T1:  SELECT balance FROM account WHERE id = 'A'  -- 读到 700（脏读！）
T2:  ROLLBACK  -- T2 回滚，A 的余额应该是 1000
T1:  -- T1 基于错误的 700 做了后续操作
```

**危害**：T1 基于不存在的数据做了决策，导致业务逻辑错误。

#### 4.2 不可重复读（Non-Repeatable Read）

**定义**：事务 T1 在同一事务内两次读取同一行数据，得到了不同的结果（因为 T2 在两次读取之间修改并提交了该行）。

```
时间线：
T1:  BEGIN
T1:  SELECT balance FROM account WHERE id = 'A'  -- 读到 1000
T2:  BEGIN
T2:  UPDATE account SET balance = 700 WHERE id = 'A'
T2:  COMMIT
T1:  SELECT balance FROM account WHERE id = 'A'  -- 读到 700（不可重复读！）
T1:  COMMIT
```

**危害**：T1 在同一事务内看到了不一致的数据，可能导致报表数据不准确。

#### 4.3 幻读（Phantom Read）

**定义**：事务 T1 两次执行相同的范围查询，第二次查询返回了第一次没有的行（因为 T2 在两次查询之间插入了新行并提交）。

```
时间线：
T1:  BEGIN
T1:  SELECT COUNT(*) FROM account WHERE balance > 500  -- 返回 2 行
T2:  BEGIN
T2:  INSERT INTO account VALUES ('C', 800)
T2:  COMMIT
T1:  SELECT COUNT(*) FROM account WHERE balance > 500  -- 返回 3 行（幻读！）
T1:  COMMIT
```

**危害**：T1 看到了"幽灵"数据，范围查询结果不一致。

**不可重复读 vs 幻读的区别**：
- 不可重复读：针对**已存在的行**，数据被修改或删除
- 幻读：针对**范围查询**，新行被插入

### 5. 四种隔离级别

SQL 标准定义了四种隔离级别，从低到高：

#### 5.1 READ UNCOMMITTED（读未提交）

- 允许读取其他事务未提交的数据
- 问题：脏读、不可重复读、幻读都可能发生
- 性能最好，但数据一致性最差
- 实际应用：几乎不使用

#### 5.2 READ COMMITTED（读已提交）

- 只能读取其他事务已提交的数据
- 解决了脏读，但不可重复读和幻读仍可能发生
- Oracle、SQL Server 的默认隔离级别
- 实现：每次读取时获取最新的已提交版本

#### 5.3 REPEATABLE READ（可重复读）

- 同一事务内多次读取同一行，结果一致
- 解决了脏读和不可重复读，但幻读仍可能发生（标准定义）
- MySQL InnoDB 的默认隔离级别
- 实现：事务开始时创建快照（Read View），整个事务期间使用同一快照
- 注意：InnoDB 通过 Gap Lock 在 REPEATABLE READ 级别也解决了幻读

#### 5.4 SERIALIZABLE（串行化）

- 事务完全串行执行，不存在并发
- 解决所有并发问题
- 性能最差，实际应用较少
- 实现：对所有读操作加共享锁，对所有写操作加排他锁

### 6. 隔离级别与并发问题对应关系

| 隔离级别             | 脏读 | 不可重复读 | 幻读 |
|---------------------|------|-----------|------|
| READ UNCOMMITTED    | 可能 | 可能       | 可能 |
| READ COMMITTED      | 不会 | 可能       | 可能 |
| REPEATABLE READ     | 不会 | 不会       | 可能 |
| SERIALIZABLE        | 不会 | 不会       | 不会 |

---

## 代码讲解

### 6.1 Transaction 类设计

```java
public class Transaction {
    private final long txId;           // 事务唯一 ID
    private TxStatus status;           // 事务状态
    private final long startTimestamp; // 事务开始时间戳
    private final Set<String> readSet; // 读取的数据项
    private final Map<String, Object> writeSet; // 写入的数据项（key -> newValue）
    private final Map<String, Object> undoLog;  // 撤销日志（key -> oldValue）
    private IsolationLevel isolationLevel;      // 隔离级别

    public enum TxStatus {
        ACTIVE, PARTIALLY_COMMITTED, COMMITTED, FAILED, ABORTED
    }

    public enum IsolationLevel {
        READ_UNCOMMITTED, READ_COMMITTED, REPEATABLE_READ, SERIALIZABLE
    }
}
```

### 6.2 TransactionManager 设计

```java
public class TransactionManager {
    private final AtomicLong txIdGenerator = new AtomicLong(0);
    private final Map<Long, Transaction> activeTransactions = new ConcurrentHashMap<>();
    private final Map<String, Object> committedData = new ConcurrentHashMap<>();
    private final Map<String, Object> uncommittedData = new ConcurrentHashMap<>();

    public Transaction begin(IsolationLevel level) {
        long txId = txIdGenerator.incrementAndGet();
        Transaction tx = new Transaction(txId, level);
        activeTransactions.put(txId, tx);
        return tx;
    }

    public void commit(Transaction tx) {
        // 将 writeSet 中的数据写入 committedData
        committedData.putAll(tx.getWriteSet());
        tx.setStatus(Transaction.TxStatus.COMMITTED);
        activeTransactions.remove(tx.getTxId());
    }

    public void rollback(Transaction tx) {
        // 利用 undoLog 恢复数据
        committedData.putAll(tx.getUndoLog());
        tx.setStatus(Transaction.TxStatus.ABORTED);
        activeTransactions.remove(tx.getTxId());
    }
}
```

### 6.3 脏读演示逻辑

```java
// 演示脏读：T1 读到 T2 未提交的数据
static void demoDirtyRead() {
    Database db = new Database();
    db.put("balance_A", 1000);

    Transaction t2 = db.begin(READ_UNCOMMITTED);
    t2.write("balance_A", 700);  // T2 修改但未提交

    Transaction t1 = db.begin(READ_UNCOMMITTED);
    int value = (int) t1.read("balance_A");  // 读到 700（脏读！）

    t2.rollback();  // T2 回滚，700 这个值从未真正存在

    // T1 基于错误的 700 做了决策
    System.out.println("T1 读到的值: " + value);  // 700（错误！）
    System.out.println("实际提交的值: " + db.get("balance_A"));  // 1000
}
```

---

## 实践练习

### 练习1（基础）：实现事务状态机

实现一个 `SimpleTransaction` 类，包含以下功能：
- 状态转换：ACTIVE → PARTIALLY_COMMITTED → COMMITTED
- 状态转换：ACTIVE → FAILED → ABORTED
- 非法状态转换时抛出异常（如已 COMMITTED 的事务不能再 ROLLBACK）

```java
// 提示：使用枚举和 switch 语句实现状态机
public class SimpleTransaction {
    private TxStatus status = TxStatus.ACTIVE;

    public void commit() {
        if (status != TxStatus.ACTIVE) {
            throw new IllegalStateException("Cannot commit: status is " + status);
        }
        status = TxStatus.PARTIALLY_COMMITTED;
        // 执行实际提交逻辑...
        status = TxStatus.COMMITTED;
    }
    // 实现 rollback() 方法...
}
```

### 练习2（进阶）：模拟不可重复读

在 `READ_COMMITTED` 隔离级别下，模拟不可重复读场景：
1. T1 开始，读取账户 A 的余额（1000）
2. T2 开始，修改账户 A 的余额为 700，提交
3. T1 再次读取账户 A 的余额，得到 700
4. 验证两次读取结果不同

思考：如何修改代码，使其在 `REPEATABLE_READ` 级别下避免不可重复读？

### 练习3（挑战）：实现简单的快照隔离

实现 `SnapshotIsolation` 类：
- 事务开始时，记录当前所有已提交数据的快照
- 事务内的读操作始终从快照中读取
- 写操作写入事务私有的 writeSet
- 提交时检测写写冲突（如果其他事务在快照之后修改了同一行，则中止）

---

## 常见问题

**Q1：ACID 中的一致性（C）和其他三个属性有什么不同？**

A：原子性（A）、隔离性（I）、持久性（D）都是数据库引擎负责保证的技术属性。而一致性（C）是业务层面的概念，由应用程序的业务规则定义。数据库只能保证约束（如 NOT NULL、UNIQUE、FOREIGN KEY）不被违反，但无法保证业务逻辑的正确性。例如，转账金额写错了，数据库无法发现这个错误。

**Q2：为什么 MySQL InnoDB 默认使用 REPEATABLE READ 而不是 READ COMMITTED？**

A：历史原因。MySQL 早期的 binlog 使用 STATEMENT 格式（记录 SQL 语句而非行变更），在 READ COMMITTED 级别下，主从复制可能出现数据不一致。REPEATABLE READ 配合 Gap Lock 可以避免这个问题。现代 MySQL 使用 ROW 格式的 binlog，这个问题已不存在，但默认值保留了下来。

**Q3：幻读和不可重复读的本质区别是什么？**

A：不可重复读关注的是**已存在行的数据变化**（UPDATE/DELETE），而幻读关注的是**行的数量变化**（INSERT）。解决不可重复读只需要对已读取的行加锁，而解决幻读需要对范围加锁（Gap Lock），防止新行插入到查询范围内。

**Q4：SERIALIZABLE 级别真的完全串行执行吗？**

A：不一定。SERIALIZABLE 的语义是"执行结果等价于某种串行执行顺序"，而不是说事务必须一个接一个地执行。数据库可以并发执行多个事务，只要最终结果与某种串行顺序等价即可。实现方式包括：严格两阶段锁（S2PL）、串行化快照隔离（SSI）等。

---

## 本章小结

本章从银行转账的经典场景出发，引出了事务的必要性。事务是数据库操作的原子单元，通过 ACID 四个属性保证数据的正确性：

- **原子性**：通过 Undo Log 实现，保证操作要么全做要么全不做
- **一致性**：由业务规则和数据库约束共同保证
- **隔离性**：通过锁或 MVCC 实现，防止并发事务互相干扰
- **持久性**：通过 Redo Log 和 fsync 实现，保证提交的数据不丢失

并发执行的事务可能出现三类问题：脏读（读未提交数据）、不可重复读（同一行两次读取结果不同）、幻读（范围查询结果不同）。SQL 标准定义了四种隔离级别来控制这些问题的发生，隔离级别越高，并发性能越低，但数据一致性越强。

下一章将深入探讨隔离性的实现机制——锁机制。
