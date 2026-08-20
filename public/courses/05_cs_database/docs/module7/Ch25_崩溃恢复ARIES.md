# Ch25：崩溃恢复（ARIES）

## 学习目标

- 理解 ARIES 算法的三阶段框架
- 掌握 Analysis、Redo、Undo 各阶段的职责
- 理解 CLR（Compensation Log Record）的作用
- 了解 Checkpoint 如何缩短恢复时间

---

## 1. ARIES 概述

ARIES（Algorithm for Recovery and Isolation Exploiting Semantics）是工业界最广泛使用的崩溃恢复算法，被 IBM DB2、Microsoft SQL Server、PostgreSQL 等采用。

**三个阶段**：
```
崩溃 → 重启 → Analysis → Redo → Undo → 正常运行
```

---

## 2. Phase 1：Analysis（分析阶段）

**目标**：确定 Redo 的起点，找出崩溃时的活跃事务和脏页。

```
从最后一个 Checkpoint 开始扫描日志：

维护两个表：
- ATT（Active Transaction Table）：崩溃时仍活跃的事务
- DPT（Dirty Page Table）：崩溃时缓冲池中的脏页

扫描规则：
- 遇到 BEGIN：将事务加入 ATT
- 遇到 UPDATE：将页加入 DPT（若不在），记录 recLSN（首次变脏的 LSN）
- 遇到 COMMIT/ABORT：从 ATT 移除事务
```

Analysis 结束后：
- ATT 中的事务需要 Undo（未提交）
- DPT 中最小的 recLSN 是 Redo 的起点

---

## 3. Phase 2：Redo（重做阶段）

**目标**：将所有已提交的修改重新应用到数据页（幂等操作）。

```
从 min(DPT.recLSN) 开始扫描日志：

for each UPDATE log record:
    page = fetch(log.pageId)
    if log.LSN > page.pageLSN:
        apply(log)  // 重做该修改
        page.pageLSN = log.LSN
    else:
        skip  // 该修改已在磁盘上
```

**关键**：Redo 是幂等的，重复执行不影响正确性。

---

## 4. Phase 3：Undo（撤销阶段）

**目标**：回滚所有未提交事务（ATT 中的事务）。

```
按 LSN 从大到小处理 ATT 中的事务：

for each txn in ATT (in reverse LSN order):
    for each UPDATE log of txn (newest first):
        apply reverse operation  // 撤销修改
        write CLR (Compensation Log Record)
    write ABORT log
```

### CLR（补偿日志记录）

Undo 时写入 CLR，记录撤销操作，防止重复 Undo：

```
CLR: [LSN=1050][TxnId=T3][Type=CLR][undoNextLSN=1020]
```

`undoNextLSN` 指向下一个需要 Undo 的日志，跳过已撤销的记录。

---

## 5. 完整恢复示例

```
日志序列:
LSN=1: T1 BEGIN
LSN=2: T1 UPDATE page1 (old=A, new=B)
LSN=3: T2 BEGIN
LSN=4: T2 UPDATE page2 (old=C, new=D)
LSN=5: T1 COMMIT
LSN=6: T3 BEGIN
LSN=7: T3 UPDATE page1 (old=B, new=E)
--- 崩溃 ---

Analysis: ATT={T2, T3}, DPT={page1(recLSN=2), page2(recLSN=4)}
Redo: 从 LSN=2 开始，重做 LSN=2,4,7
Undo: 撤销 T3(LSN=7), 撤销 T2(LSN=4)
```

---

## 6. 本章 Demo 要点

运行 `cd ch25 && mvn exec:java` 可以看到：

1. 模拟崩溃场景
2. Analysis 阶段构建 ATT 和 DPT
3. Redo 阶段重放已提交修改
4. Undo 阶段回滚未提交事务
5. CLR 写入演示

---

## 7. 小结

| 阶段 | 输入 | 输出 |
|------|------|------|
| Analysis | 日志（从 Checkpoint）| ATT, DPT, Redo 起点 |
| Redo | 日志（从 min recLSN）| 数据页恢复到崩溃前状态 |
| Undo | ATT 中的事务 | 回滚未提交修改，写 CLR |

ARIES 保证了数据库在任意时刻崩溃后都能正确恢复，是现代数据库可靠性的基础。

## 课堂练习

### ⭐ 基础
1. 画出事务 T1 修改页 A、B 后崩溃，重启时 REDO 的过程
2. 追踪 ARIES 三阶段（分析→重做→撤销）的执行步骤
3. 解释为什么 ARIES 先 REDO 所有事务再 UNDO 未提交事务

### ⭐⭐ 进阶
1. 实现 CLR（补偿日志记录），处理 UNDO 过程中的再次崩溃
2. 分析 Checkpoint 对恢复时间的影响
3. 实现模糊检查点（fuzzy checkpoint），不暂停事务

### ⭐⭐⭐ 挑战
1. 实现 ARIES 的完整恢复流程（含嵌套崩溃场景）
2. 分析 WAL 与 Shadow Paging 恢复策略的优劣
3. 对比 JimSQL 恢复与 PostgreSQL 的恢复机制

## 常见问题 Q&A

**Q1: 为什么不直接 UNDO？**
A: 数据页可能在崩溃前已刷盘（UNDO 前的数据状态未知）。先 REDO 恢复到崩溃瞬间的状态，再 UNDO 未提交事务，保证正确性。

**Q2: Checkpoint 越频繁越好？**
A: 频繁 Checkpoint 减少恢复时间，但增加运行时开销（需要刷脏页）。需要在恢复时间和运行性能之间权衡。

**Q3: ARIES 的核心原则是什么？**
A: Write-Ahead Logging（先写日志再写数据页）、REDO during restart（重做所有已提交和未提交的修改）、UNDO only uncommitted（只撤销未提交事务）。

---

## 三色标记算法

### 为什么需要三色标记

基础的标记-清除有一个问题：**标记阶段的递归深度可能很深**（如链表 10000 个节点），导致栈溢出。三色标记将递归改为迭代，并且可以与用户程序并发运行（增量 GC）。

### 三色抽象

将堆上的对象分为三种颜色：

```
白色（White）：尚未被标记的对象（GC 结束后白色对象被回收）
灰色（Gray）：已被标记，但子对象尚未全部处理（待处理队列）
黑色（Black）：已被标记，且子对象也已全部标记（完成处理）

初始状态：所有对象都是白色

标记过程：
  1. 将所有根对象标记为灰色
  2. 从灰色队列取一个对象
  3. 将其所有子对象标记为灰色
  4. 将该对象标记为黑色
  5. 重复 2-4 直到灰色队列为空
  6. 剩余白色对象即为死亡对象

标记过程图示：

Step 0（初始）:
  Root → [A] → [B] → [C]
              ↓
             [D]

  所有对象：A(白), B(白), C(白), D(白)
  灰色队列：空

Step 1（标记根）:
  Root → [A] → [B] → [C]
              ↓
             [D]

  A(灰), B(白), C(白), D(白)
  灰色队列：[A]

Step 2（处理 A）:
  Root → [A] → [B] → [C]
              ↓
             [D]

  A(黑), B(灰), D(灰), C(白)
  灰色队列：[B, D]

Step 3（处理 B）:
  Root → [A] → [B] → [C]
              ↓
             [D]

  A(黑), B(黑), D(灰), C(灰)
  灰色队列：[D, C]

Step 4（处理 D 和 C）:
  Root → [A] → [B] → [C]
              ↓
             [D]

  A(黑), B(黑), D(黑), C(黑)
  灰色队列：空 → 标记完成

最终：没有白色对象，全部存活 ✅
```

### Java 实现：三色标记

```java
/**
 * 三色标记 GC
 * 用 GrayWorkList（灰色工作队列）替代递归标记
 */
public class TriColorGC {
    private final VM vm;
    private Obj heapHead;
    private long bytesAllocated = 0;
    private long gcThreshold = 1024 * 1024;
    private int gcCount = 0;

    // 三种颜色状态
    private enum Color { WHITE, GRAY, BLACK }

    // 灰色工作队列（可以用 ArrayDeque 或栈）
    private final ArrayDeque<Obj> grayWorkList = new ArrayDeque<>();

    public void collectGarbage() {
        long before = bytesAllocated;

        // ── 初始化：所有对象设为白色 ──
        Obj current = heapHead;
        while (current != null) {
            current.color = Color.WHITE;
            current = current.next;
        }

        // ── 标记阶段：三色标记 ──

        // Step 1: 将所有根对象标记为灰色
        markGrayRoots();

        // Step 2: 处理灰色队列直到为空
        while (!grayWorkList.isEmpty()) {
            Obj obj = grayWorkList.pollFirst();  // 取出一个灰色对象
            // 将其所有子对象标记为灰色
            for (Obj child : obj.getChildren()) {
                if (child != null && child.color == Color.WHITE) {
                    child.color = Color.GRAY;
                    grayWorkList.addLast(child);
                }
            }
            // 将当前对象标记为黑色
            obj.color = Color.BLACK;
        }

        // ── 清除阶段：回收白色对象 ──
        Obj prev = null;
        current = heapHead;
        int freed = 0;
        while (current != null) {
            if (current.color == Color.WHITE) {
                // 白色 = 不可达 = 回收
                Obj unreached = current;
                current = current.next;
                if (prev != null) prev.next = current;
                else heapHead = current;
                bytesAllocated -= unreached.objectSize();
                freed++;
            } else {
                // 黑色 = 存活，保留（不用重置颜色，下次 GC 会重置）
                prev = current;
                current = current.next;
            }
        }

        // 更新阈值
        gcThreshold = Math.max(bytesAllocated * 2, 1024 * 1024);
        gcCount++;

        System.out.printf("[GC#%d] 三色标记: %dKB → %dKB (释放 %d 对象)%n",
            gcCount, before / 1024, bytesAllocated / 1024, freed);
    }

    /**
     * 将所有根对象标记为灰色并加入工作队列
     */
    private void markGrayRoots() {
        // 根 1: 操作数栈
        for (Object val : vm.getStack()) {
            if (val instanceof Obj obj && obj.color == Color.WHITE) {
                obj.color = Color.GRAY;
                grayWorkList.addLast(obj);
            }
        }
        // 根 2: 全局变量
        for (Object val : vm.getGlobals().values()) {
            if (val instanceof Obj obj && obj.color == Color.WHITE) {
                obj.color = Color.GRAY;
                grayWorkList.addLast(obj);
            }
        }
        // 根 3: CallFrame 中的闭包和上值
        for (CallFrame frame : vm.getFrames()) {
            markGray(frame.closure);
            if (frame.closure instanceof ObjClosure closure) {
                for (ObjUpvalue uv : closure.upvalues) {
                    markGray(uv);
                }
            }
        }
    }

    private void markGray(Obj obj) {
        if (obj != null && obj.color == Color.WHITE) {
            obj.color = Color.GRAY;
            grayWorkList.addLast(obj);
        }
    }
}
```

### Obj 基类扩展

```java
public abstract class Obj {
    public Color color = Color.WHITE;  // 三色标记的颜色
    public Obj next;                   // 堆链表指针

    /**
     * 返回该对象直接引用的所有子对象
     * 三色标记用此方法遍历引用图
     */
    public abstract List<Obj> getChildren();

    /**
     * 旧接口仍保留（兼容性）
     */
    public abstract void markChildren(GC gc);
    public abstract ObjType type();
    public abstract int objectSize();
}
```

### ObjList 的 getChildren 实现

```java
public class ObjList extends Obj {
    public final List<Object> elements;

    @Override
    public List<Obj> getChildren() {
        List<Obj> children = new ArrayList<>();
        for (Object elem : elements) {
            if (elem instanceof Obj obj) {
                children.add(obj);
            }
        }
        return children;
    }
}
```

### ObjClosure 的 getChildren 实现

```java
public class ObjClosure extends Obj {
    public final ObjFunction function;
    public final ObjUpvalue[] upvalues;

    @Override
    public List<Obj> getChildren() {
        List<Obj> children = new ArrayList<>();
        children.add(function);
        for (ObjUpvalue uv : upvalues) {
            children.add(uv);
        }
        return children;
    }
}
```

### 递归标记 vs 三色标记对比

```
递归标记（本章主文）:
  优点：代码简单（递归天然遍历树）
  缺点：栈深度 = 引用链深度，链表 10000 节点会 StackOverflow
  无法并发：递归过程无法中断

三色标记（本节扩展）:
  优点：迭代实现，无栈溢出风险；灰色队列大小 = 引用宽度（通常很小）
  优点：可以增量执行（每次处理几个灰色对象，然后恢复用户程序）
  缺点：实现稍复杂（需要维护颜色状态和工作队列）

灰色队列最大大小分析：
  二叉树场景：最大灰色数 = 树宽 = O(log N)
  链表场景：最大灰色数 = 1（每次只处理一个）
  → 内存开销很小
```

### 增量 GC（选读）

三色标记天然支持增量执行——每次只处理几个灰色对象：

```java
/**
 * 增量 GC：每帧处理 N 个灰色对象
 * 与用户程序交替执行，减少停顿
 */
public class IncrementalGC {
    private static final int WORK_PER_STEP = 10;  // 每步处理 10 个对象

    public void step() {
        for (int i = 0; i < WORK_PER_STEP && !grayWorkList.isEmpty(); i++) {
            Obj obj = grayWorkList.pollFirst();
            for (Obj child : obj.getChildren()) {
                if (child != null && child.color == Color.WHITE) {
                    child.color = Color.GRAY;
                    grayWorkList.addLast(child);
                }
            }
            obj.color = Color.BLACK;
        }

        if (grayWorkList.isEmpty()) {
            sweep();  // 标记完成，进入清除阶段
        }
    }
}
```

---

## GC 调优实战

### 不同阈值策略的对比

```
测试场景：循环创建 10000 个临时字符串

阈值 1.5x:
  GC 触发 15 次，总停顿 45ms
  峰值内存 2.1MB

阈值 2.0x（默认）:
  GC 触发 11 次，总停顿 35ms
  峰值内存 2.8MB

阈值 3.0x:
  GC 触发 7 次，总停顿 25ms
  峰值内存 4.2MB

阈值 5.0x:
  GC 触发 4 次，总停顿 20ms
  峰值内存 7.0MB

结论：阈值越大 GC 次数越少，但内存峰值越高
  推荐：桌面应用 2x，嵌入式设备 1.5x，服务器 3x
```
