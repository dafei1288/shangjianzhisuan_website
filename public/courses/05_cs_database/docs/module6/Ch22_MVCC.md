# Ch22：MVCC（多版本并发控制）

## 学习目标

- 理解 MVCC 的核心思想：读写不互斥
- 掌握版本链的结构与维护
- 理解 Read View 的可见性判断规则
- 对比锁机制与 MVCC 的适用场景
- 实现简单的 MVCC 版本链和快照读取

---

## 1. 为什么需要 MVCC

### 1.1 锁机制的困境

基于锁的并发控制存在读写互斥问题：

```
T1: SELECT * FROM accounts WHERE id=1  -- 加 S 锁（共享锁）
T2: UPDATE accounts SET balance=... WHERE id=1  -- 等待 S 锁释放 ❌
T3: SELECT * FROM accounts WHERE id=1  -- 等待 T2 的 X 锁 ❌

链式阻塞：读阻塞写 → 写阻塞读 → 吞吐量急剧下降
```

### 1.2 读写互斥的问题有多大

```
场景：电商网站，1000 个用户同时浏览商品（读），10 个用户同时下单（写）

基于锁：
  1000 个读 → 全部加 S 锁 → 10 个写事务只能排队
  吞吐量 ≈ 写入速度（极慢）

MVCC：
  1000 个读 → 各自读历史版本，无锁 → 写事务并行创建新版本
  吞吐量 ≈ 读不受限 + 写之间协调
```

数据库的典型工作负载是**读多写少**（读写比可达 100:1），MVCC 的优势非常明显。

### 1.3 MVCC 的核心思想

```
MVCC = Multi-Version Concurrency Control（多版本并发控制）

核心思想：读操作读历史版本，写操作创建新版本，读写不互斥。

类比：
  锁机制 = 会议室只有一个门，读写都要排队进出
  MVCC  = 会议室有多个门，读者从旧门进出，写者从新门进出
```

---

## 2. 版本链

### 2.1 版本链结构

每行数据维护一个版本链（Version Chain），新版本在链头：

```
Row(key=1):
  head → Version(value="Alice-v2", createdBy=T5, deletedBy=0)
           ↓ prev
         Version(value="Alice-v1", createdBy=T2, deletedBy=T5)
           ↓ prev
         Version(value="Alice-v0", createdBy=T1, deletedBy=T2)

每个版本记录：
  - value：该版本的数据
  - createdByTxn：创建该版本的事务 ID
  - deletedByTxn：删除该版本的事务 ID（0 表示未删除）
```

### 2.2 版本链的演化过程

```
时间线：
  T1: INSERT(key=1, "Alice-v0")    → 创建 Version(createdBy=T1)
  T2: UPDATE(key=1, "Alice-v1")    → 创建 Version(createdBy=T2), 旧版本 deletedBy=T2
  T5: UPDATE(key=1, "Alice-v2")    → 创建 Version(createdBy=T5), 旧版本 deletedBy=T5

版本链状态（从新到旧）：
  V2(createdBy=T5) → V1(createdBy=T2) → V0(createdBy=T1)

读取时从链头开始，找到第一个"可见"的版本。
```

### 2.3 代码实现

```java
public class Version {
    private String value;         // 数据
    private long createdByTxn;    // 创建者事务 ID
    private long deletedByTxn;    // 删除者事务 ID（0=未删除）
    private Version prev;         // 指向更旧的版本

    public Version(String value, long createdByTxn) {
        this.value = value;
        this.createdByTxn = createdByTxn;
        this.deletedByTxn = 0;
        this.prev = null;
    }

    public boolean isVisibleTo(ReadView view) {
        return view.canSee(createdByTxn, deletedByTxn);
    }
}

public class VersionChain {
    private Version head;  // 链头（最新版本）

    public void insert(String value, long txnId) {
        Version version = new Version(value, txnId);
        version.prev = head;
        head = version;
    }

    // 找到对给定 ReadView 可见的版本
    public Version findVisible(ReadView view) {
        Version current = head;
        while (current != null) {
            if (current.isVisibleTo(view)) {
                return current;
            }
            current = current.prev;
        }
        return null;  // 没有可见的版本（行不存在）
    }
}
```

---

## 3. Read View（读视图）

### 3.1 Read View 的构成

事务开始时创建 Read View，记录当前所有活跃事务的信息：

```java
public class ReadView {
    long creatorTxnId;      // 创建此 ReadView 的事务 ID
    Set<Long> activeTxns;   // 创建时仍在活跃的事务集合
    long minActiveTxnId;    // 活跃事务中最小的 ID
    long maxTxnId;          // 创建时已分配的最大事务 ID + 1

    public boolean canSee(long createdByTxn, long deletedByTxn) {
        // 1. 自己的修改，总是可见
        if (createdByTxn == creatorTxnId) return true;

        // 2. 创建者已提交（小于最小活跃事务）
        if (createdByTxn < minActiveTxnId) return true;

        // 3. 创建者是未来事务，不可见
        if (createdByTxn >= maxTxnId) return false;

        // 4. 创建者在活跃事务集合中，不可见
        if (activeTxns.contains(createdByTxn)) return false;

        // 5. 已提交的非活跃事务，可见
        return true;
    }
}
```

### 3.2 可见性判断流程

```
判断版本 V(createdBy=C) 对事务 T 是否可见：

C == T ? ──── YES → ✅ 可见（自己的修改）
   │
   NO
   │
C < minActive ? ── YES → ✅ 可见（已提交的旧事务）
   │
   NO
   │
C >= maxTxnId ? ── YES → ❌ 不可见（未来事务）
   │
   NO
   │
C in activeTxns ? ─ YES → ❌ 不可见（并发未提交事务）
   │
   NO
   │
   ✅ 可见（已提交的并发事务）
```

---

## 4. 快照隔离示例

### 4.1 详解执行过程

```
初始状态：accounts 表为空

T1: begin → insert(key=1, "余额:100") → commit
    → Version(createdBy=1, value="余额:100")

T2: begin
    → 创建 ReadView(creator=2, active={2}, min=2, max=3)

T3: begin → update(key=1, "余额:80") → commit
    → 新 Version(createdBy=3, value="余额:80")
    → 旧 Version(createdBy=1, deletedBy=3)

T2: read(key=1)
    → 从链头开始遍历：
      V(createdBy=3): 3 >= max(3)? YES → ❌ 不可见
      V(createdBy=1): 1 < min(2)? YES → ✅ 可见
    → 返回 "余额:100"（快照值）

T4: begin → read(key=1)
    → 创建 ReadView(creator=4, active={}, min=5, max=5)
    → V(createdBy=3): 3 < min(5)? YES → ✅ 可见
    → 返回 "余额:80"（最新已提交值）
```

### 4.2 Repeatable Read vs Read Committed

```
Repeatable Read（可重复读，InnoDB 默认）：
  ReadView 在事务开始时创建一次
  → 整个事务期间看到同一个快照

Read Committed（读已提交）：
  ReadView 在每次 SELECT 时重新创建
  → 可以看到其他事务已提交的新数据

对比：
  T2: begin(RR) → read(X) → [T3修改并提交X] → read(X) → 两次读到相同值
  T2: begin(RC) → read(X) → [T3修改并提交X] → read(X) → 第二次读到新值
```

---

## 5. 写-写冲突

MVCC 解决了读写不互斥，但**写-写仍然需要锁**：

```
T2: UPDATE accounts SET balance=80 WHERE id=1   -- 获取 X 锁
T3: UPDATE accounts SET balance=60 WHERE id=1   -- 等待 T2 释放 X 锁

为什么写-写不能多版本？
  如果两个事务都创建新版本：
  T2 创建 V2(balance=80)
  T3 创建 V3(balance=60)
  → 提交后只应保留一个版本（丢失更新问题）
  → 必须通过锁来序列化写操作
```

**MVCC 的局限**：解决了读写冲突，但写写冲突仍需传统的锁机制。

---

## 6. 版本 GC（垃圾回收）

### 6.1 什么时候可以回收

旧版本不再被任何活跃事务需要时，可以安全回收：

```
活跃事务：T8, T10
minActiveTxnId = 8

版本链：
  V7(createdBy=T6) → V5(createdBy=T3) → V4(createdBy=T1)

判断：
  V4: T1 < minActive(8) → 所有活跃事务都不需要 V4 → 可回收
  V5: T3 < minActive(8) → 同理 → 可回收
  V7: T6 < minActive(8) → 同理 → 可回收

但需要保留至少一个版本作为"基础版本"，
即使它对当前所有事务不可见，新事务可能需要用它判断行是否存在。
```

### 6.2 MySQL InnoDB 的 Purge 线程

```
InnoDB 的 Purge 线程负责：
  1. 扫描 undo log 中的历史版本
  2. 找到不再被任何 ReadView 需要的版本
  3. 删除旧版本，释放空间
  4. 清理 undo log

如果长事务不提交：
  → ReadView 持有旧的 minActiveTxnId
  → Purge 无法回收旧版本
  → 版本链越来越长 → 表空间膨胀
  → 这就是为什么长事务有害
```

---

## 7. 锁 vs MVCC 对比

| 对比项 | 基于锁 | MVCC |
|--------|--------|------|
| 读写关系 | 互斥 | 不互斥 |
| 读操作 | 加 S 锁 | 读历史版本，不加锁 |
| 写操作 | 加 X 锁 | 创建新版本（但仍需 X 锁防写-写冲突）|
| 并发度 | 低 | 高（读场景）|
| 存储开销 | 低 | 高（多版本 + undo log）|
| 实现复杂度 | 低 | 高（版本链 + ReadView + GC）|
| 适用场景 | 写多读少 | 读多写少 |

**JimSQL 的选择**：实现基本的 MVCC，支持快照隔离级别。

---

## 8. 本章 Demo 要点

运行 `cd ch22 && mvn exec:java` 可以看到：

1. 版本链的创建与遍历
2. 快照隔离：T2 不受 T3 影响
3. 可见性规则逐步验证
4. 锁 vs MVCC 对比说明

---

## 9. 实践练习

### ⭐ 基础：理解版本链

1. 画出以下操作后的版本链：T1 INSERT → T2 UPDATE → T3 UPDATE
2. 标注每个版本的 createdBy 和 deletedBy

### ⭐⭐ 进阶：可见性判断

1. 给定 ReadView(active={T3,T5}, min=3, max=7)
2. 判断以下版本是否可见：V(T1), V(T2), V(T3), V(T4), V(T6)
3. 验证你的判断是否符合规则

### ⭐⭐⭐ 挑战：实现 MVCC 读取

1. 在 JimSQL 中实现 VersionChain.findVisible()
2. 支持 Repeatable Read 隔离级别
3. 编写测试：验证 T2 的快照不受 T3 影响

---

## 小结

| 要点 | 说明 |
|------|------|
| 核心思想 | 读历史版本，写创建新版本，读写不互斥 |
| 版本链 | 每行维护一个链表，新版本在链头 |
| Read View | 记录活跃事务，用于判断版本可见性 |
| 快照隔离 | 事务看到的是开始时的快照，不受后续修改影响 |
| 写-写冲突 | MVCC 不解决，仍需锁机制 |
| 版本 GC | Purge 线程定期清理不再需要的旧版本 |

下一章将学习 **WAL（预写式日志）**——崩溃恢复的基础。

## 课堂练习

### ⭐ 基础
1. 追踪 T1(txn=100) 写入版本 v100 和 T2(txn=101) 读取时的可见性判断
2. 验证 RC 和 RR 隔离级别下的读一致性差异
3. 解释版本链如何实现"读不阻塞写、写不阻塞读"

### ⭐⭐ 进阶
1. 实现 ReadView 机制（记录活跃事务列表）
2. 分析长事务对 MVCC 的影响（旧版本无法回收）
3. 实现后台版本清理（GC 回收不可见版本）

### ⭐⭐⭐ 挑战
1. 实现 Serializable 隔离级别（SSI - Serializable Snapshot Isolation）
2. 分析 MVCC 与 2PL 的性能差异
3. 对比 JimSQL MVCC 与 PostgreSQL MVCC 的实现差异

---

## 常见问题 Q&A

**Q1: MVCC 为什么能做到读不阻塞写？**
A: 因为读操作通常读取的是某个时间点可见的历史版本，而不是强行等待正在写入的事务结束。写事务会创建新版本，读事务根据 ReadView 或事务时间戳判断哪个版本对自己可见。这样读写可以在多数情况下并行进行。

**Q2: MVCC 是否意味着不需要锁？**
A: 不是。MVCC 主要优化读写冲突，但写写冲突、唯一约束、索引结构修改等场景仍然需要锁或其他并发控制机制。可以把 MVCC 理解为减少锁等待的机制，而不是完全替代锁。

**Q3: 长事务为什么会拖慢 MVCC 系统？**
A: 长事务会让较早版本长期保持“可能可见”，后台清理线程不能安全回收这些旧版本。版本链变长后，读取时需要扫描更多历史版本，存储空间也会增长，所以生产数据库通常会监控长事务。
