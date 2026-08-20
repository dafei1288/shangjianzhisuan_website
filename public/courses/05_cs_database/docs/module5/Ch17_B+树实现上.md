# Ch17：B+ 树实现（上）— 节点序列化与插入

## 1. 教学目标

1. 理解数据库索引页（Page）的物理存储格式，掌握固定大小页的设计原则
2. 能够将 B+ 树节点序列化为 4096 字节的 byte[]，并正确反序列化还原
3. 深入理解 B+ 树插入操作的完整流程，包括叶子节点分裂和内部节点分裂
4. 掌握分裂时父节点如何接收上推键（push-up key）的处理逻辑
5. 能够用代码实现一个可持久化的 B+ 树节点序列化器

---

## 2. 课前准备

### 需要掌握的前置知识
- Ch16 中 BPlusTreeNode 和 BPlusTree 的基本结构
- Java ByteBuffer 的基本用法（put/get/flip/rewind）
- 二进制数据的大端/小端表示
- 递归思维（分裂操作是递归向上传播的）

### 环境准备
```bash
# 确认 Java 版本
java -version   # 需要 Java 11+

# 本章 Demo 无外部依赖，直接编译运行
javac Main.java && java Main
```

### 回顾 Ch16 的核心数据结构
```java
// Ch16 定义的节点（回顾）
class BPlusTreeNode {
    boolean isLeaf;
    List<Integer> keys;
    List<BPlusTreeNode> children;  // 内部节点用
    List<RecordId> values;         // 叶子节点用
    BPlusTreeNode next;            // 叶子链表
}
```

---

## 3. 核心概念

### 3.1 为什么需要序列化？

在 Ch16 中，我们的 B+ 树完全在内存中运行。但真实数据库的索引需要持久化到磁盘：

```
内存中的 B+ 树节点
        ↓  序列化（serialize）
磁盘上的 4096 字节页
        ↓  反序列化（deserialize）
内存中的 B+ 树节点（还原）
```

**为什么是 4096 字节？**
- 操作系统的内存页大小通常是 4096 字节（4KB）
- 磁盘的最小读写单位（扇区）是 512 字节或 4096 字节
- 使用与操作系统页对齐的大小，可以避免跨页读写，减少 I/O 次数
- MySQL InnoDB 默认页大小也是 16KB（4 个 4KB 页）

### 3.2 节点页格式设计

```
┌─────────────────────────────────────────────────────────────┐
│                    B+ 树节点页（4096 字节）                    │
├──────────┬──────────┬──────────────────────────────────────┤
│ isLeaf   │ keyCount │           数据区                       │
│ (1 byte) │ (4 bytes)│                                       │
├──────────┴──────────┼──────────────────────────────────────┤
│                     │  如果是叶子节点：                       │
│                     │  [key(4B)][pageId(4B)][slotId(4B)] × N│
│                     │  + [nextPageId(4B)]                   │
│                     ├──────────────────────────────────────┤
│                     │  如果是内部节点：                       │
│                     │  [key(4B)] × N                        │
│                     │  [childPageId(4B)] × (N+1)           │
└─────────────────────┴──────────────────────────────────────┘
```

**字段说明：**

| 字段 | 大小 | 说明 |
|------|------|------|
| isLeaf | 1 byte | 0=内部节点，1=叶子节点 |
| keyCount | 4 bytes | 当前节点中键的数量 |
| keys | 4 bytes × N | 整数键值数组 |
| values（叶子）| 8 bytes × N | RecordId = pageId(4B) + slotId(4B) |
| nextPageId（叶子）| 4 bytes | 下一个叶子节点的页号，-1 表示末尾 |
| children（内部）| 4 bytes × (N+1) | 子节点的页号数组 |

### 3.3 容量计算

```
叶子节点最大键数：
  可用空间 = 4096 - 1(isLeaf) - 4(keyCount) - 4(nextPageId)
           = 4087 字节
  每条记录 = 4(key) + 8(RecordId) = 12 字节
  最大键数 = 4087 / 12 = 340 条

内部节点最大键数：
  可用空间 = 4096 - 1(isLeaf) - 4(keyCount) = 4091 字节
  每个键+子指针 = 4(key) + 4(child) = 8 字节，还有一个额外子指针
  最大键数 ≈ (4091 - 4) / 8 = 510 个键（511 个子指针）
```

在 Demo 中，为了便于演示分裂，我们使用 **阶数 = 4**（每个节点最多 3 个键）。

### 3.4 插入操作回顾与深化

Ch16 介绍了插入的基本思路，本章重点关注**分裂的两种情况**：

#### 情况一：叶子节点分裂

```
插入前（阶数=4，最多3个键，已满）：
叶子节点: [10, 20, 30]

插入 25 后触发分裂：
左叶子: [10, 20]    右叶子: [25, 30]
                ↑
         上推键 = 25（右叶子的第一个键）
```

**叶子节点分裂规则：**
- 将 N+1 个键平均分成两半
- 左半部分留在原节点
- 右半部分移到新节点
- 右节点的**第一个键**上推到父节点（但右节点自己也保留这个键！）
- 更新叶子链表：原节点.next = 新节点

#### 情况二：内部节点分裂

```
插入前（内部节点已满）：
内部节点: [20, 40, 60]
子节点:  [C0, C1, C2, C3]

分裂后：
左内部: [20]      右内部: [60]
子节点: [C0,C1]   子节点: [C2,C3]
           ↑
    上推键 = 40（中间键，从内部节点移走！）
```

**内部节点分裂规则：**
- 中间键**上推**到父节点（内部节点不保留中间键）
- 左半部分键留在原节点
- 右半部分键移到新节点
- 子指针也相应分配

#### 两种分裂的关键区别

```
叶子节点分裂：上推键 = 右节点第一个键（右节点保留）
内部节点分裂：上推键 = 中间键（从节点中移走）
```

这个区别非常重要！叶子节点需要保留所有数据键，而内部节点的键只是路由键。

### 3.5 分裂的递归传播

```
插入导致叶子分裂
    → 父节点接收上推键
    → 父节点可能也满了，触发内部节点分裂
    → 祖父节点接收上推键
    → ...
    → 如果根节点也分裂，树高度 +1
```

```
初始状态（阶数=3，最多2个键）：
        [30]
       /    \
   [10,20] [30,40]

插入 25：
1. 找到叶子 [10,20]... 不对，25 在 [30,40] 左边，应该在 [10,20] 右边
   实际：25 < 30，进入左子树 [10,20]，已满，分裂

2. 叶子 [10,20] 插入 25 后分裂：
   左: [10,20]  右: [25]  上推键: 25

3. 父节点 [30] 接收 25：
   [25, 30]
   /   |   \
[10,20][25][30,40]

（父节点未满，插入完成）
```

---

## 4. 代码讲解

### 4.1 RecordId 和基础数据结构

```java
// 记录标识符：指向数据文件中的具体位置
public class RecordId {
    public final int pageId;   // 数据页编号
    public final int slotId;   // 页内槽位编号

    public RecordId(int pageId, int slotId) {
        this.pageId = pageId;
        this.slotId = slotId;
    }

    @Override
    public String toString() {
        return "(" + pageId + "," + slotId + ")";
    }
}
```

### 4.2 BPlusTreeNode 定义

```java
public class BPlusTreeNode {
    public boolean isLeaf;
    public List<Integer> keys;

    // 叶子节点专用
    public List<RecordId> values;
    public BPlusTreeNode next;      // 叶子链表指针
    public int nextPageId = -1;     // 序列化时用

    // 内部节点专用
    public List<BPlusTreeNode> children;

    // 页号（序列化时分配）
    public int pageId = -1;

    public BPlusTreeNode(boolean isLeaf) {
        this.isLeaf = isLeaf;
        this.keys = new ArrayList<>();
        if (isLeaf) {
            this.values = new ArrayList<>();
        } else {
            this.children = new ArrayList<>();
        }
    }
}
```

### 4.3 NodeSerializer 实现

```java
public class NodeSerializer {
    public static final int PAGE_SIZE = 4096;

    /**
     * 将节点序列化为固定 4096 字节的 byte[]
     *
     * 格式：
     * [isLeaf: 1B][keyCount: 4B][keys: 4B×N][data区]
     *
     * 叶子节点 data 区：
     *   [pageId: 4B][slotId: 4B] × N + [nextPageId: 4B]
     *
     * 内部节点 data 区：
     *   [childPageId: 4B] × (N+1)
     */
    public static byte[] serialize(BPlusTreeNode node) {
        ByteBuffer buf = ByteBuffer.allocate(PAGE_SIZE);

        // 1. isLeaf 标志
        buf.put(node.isLeaf ? (byte) 1 : (byte) 0);

        // 2. 键的数量
        buf.putInt(node.keys.size());

        // 3. 键数组
        for (int key : node.keys) {
            buf.putInt(key);
        }

        if (node.isLeaf) {
            // 4a. 叶子节点：写入 RecordId 数组
            for (RecordId rid : node.values) {
                buf.putInt(rid.pageId);
                buf.putInt(rid.slotId);
            }
            // 4b. 叶子链表的下一个页号
            buf.putInt(node.nextPageId);
        } else {
            // 4c. 内部节点：写入子节点页号数组
            for (BPlusTreeNode child : node.children) {
                buf.putInt(child.pageId);
            }
        }

        // 剩余空间填 0（ByteBuffer 默认已是 0）
        return buf.array();
    }

    /**
     * 从 byte[] 反序列化节点（不含子节点引用，需要后续加载）
     */
    public static BPlusTreeNode deserialize(byte[] data) {
        ByteBuffer buf = ByteBuffer.wrap(data);

        // 1. isLeaf
        boolean isLeaf = buf.get() == 1;
        BPlusTreeNode node = new BPlusTreeNode(isLeaf);

        // 2. keyCount
        int keyCount = buf.getInt();

        // 3. 键数组
        for (int i = 0; i < keyCount; i++) {
            node.keys.add(buf.getInt());
        }

        if (isLeaf) {
            // 4a. RecordId 数组
            for (int i = 0; i < keyCount; i++) {
                int pageId = buf.getInt();
                int slotId = buf.getInt();
                node.values.add(new RecordId(pageId, slotId));
            }
            // 4b. nextPageId
            node.nextPageId = buf.getInt();
        } else {
            // 4c. 子节点页号（只存页号，不加载实际节点）
            int childCount = keyCount + 1;
            for (int i = 0; i < childCount; i++) {
                int childPageId = buf.getInt();
                // 创建占位节点，pageId 已知，内容待加载
                BPlusTreeNode placeholder = new BPlusTreeNode(false);
                placeholder.pageId = childPageId;
                node.children.add(placeholder);
            }
        }

        return node;
    }
}
```

### 4.4 插入操作完整实现

```java
public class BPlusTree {
    private BPlusTreeNode root;
    private final int order;  // 阶数，每个节点最多 order-1 个键

    public BPlusTree(int order) {
        this.order = order;
        this.root = new BPlusTreeNode(true);
    }

    public void insert(int key, RecordId value) {
        // 插入返回分裂结果（如果根节点分裂，需要创建新根）
        SplitResult result = insertRecursive(root, key, value);
        if (result != null) {
            // 根节点发生了分裂，创建新根
            BPlusTreeNode newRoot = new BPlusTreeNode(false);
            newRoot.keys.add(result.pushUpKey);
            newRoot.children.add(root);
            newRoot.children.add(result.newNode);
            root = newRoot;
        }
    }

    /**
     * 递归插入，返回值：
     * - null：未发生分裂
     * - SplitResult：发生了分裂，包含上推键和新节点
     */
    private SplitResult insertRecursive(BPlusTreeNode node, int key, RecordId value) {
        if (node.isLeaf) {
            return insertIntoLeaf(node, key, value);
        } else {
            return insertIntoInternal(node, key, value);
        }
    }

    private SplitResult insertIntoLeaf(BPlusTreeNode leaf, int key, RecordId value) {
        // 找到插入位置（保持有序）
        int pos = findInsertPosition(leaf.keys, key);
        leaf.keys.add(pos, key);
        leaf.values.add(pos, value);

        // 检查是否需要分裂
        if (leaf.keys.size() < order) {
            return null;  // 未满，无需分裂
        }

        // 叶子节点分裂
        return splitLeaf(leaf);
    }

    private SplitResult splitLeaf(BPlusTreeNode leaf) {
        int mid = leaf.keys.size() / 2;

        // 创建新的右叶子节点
        BPlusTreeNode newLeaf = new BPlusTreeNode(true);

        // 将右半部分移到新节点
        newLeaf.keys.addAll(leaf.keys.subList(mid, leaf.keys.size()));
        newLeaf.values.addAll(leaf.values.subList(mid, leaf.values.size()));

        // 原节点保留左半部分
        leaf.keys.subList(mid, leaf.keys.size()).clear();
        leaf.values.subList(mid, leaf.values.size()).clear();

        // 维护叶子链表
        newLeaf.next = leaf.next;
        leaf.next = newLeaf;

        // 上推键 = 右节点第一个键（右节点保留！）
        int pushUpKey = newLeaf.keys.get(0);
        return new SplitResult(pushUpKey, newLeaf);
    }

    private SplitResult insertIntoInternal(BPlusTreeNode node, int key, RecordId value) {
        // 找到应该进入的子节点
        int childIndex = findChildIndex(node.keys, key);
        BPlusTreeNode child = node.children.get(childIndex);

        // 递归插入
        SplitResult childSplit = insertRecursive(child, key, value);

        if (childSplit == null) {
            return null;  // 子节点未分裂
        }

        // 子节点分裂了，将上推键插入当前节点
        int insertPos = childIndex;
        node.keys.add(insertPos, childSplit.pushUpKey);
        node.children.add(insertPos + 1, childSplit.newNode);

        // 检查当前节点是否需要分裂
        if (node.keys.size() < order) {
            return null;
        }

        // 内部节点分裂
        return splitInternal(node);
    }

    private SplitResult splitInternal(BPlusTreeNode node) {
        int mid = node.keys.size() / 2;

        // 中间键上推（内部节点不保留！）
        int pushUpKey = node.keys.get(mid);

        // 创建新的右内部节点
        BPlusTreeNode newNode = new BPlusTreeNode(false);

        // 右半部分键（不含中间键）
        newNode.keys.addAll(node.keys.subList(mid + 1, node.keys.size()));
        // 右半部分子指针
        newNode.children.addAll(node.children.subList(mid + 1, node.children.size()));

        // 原节点保留左半部分
        node.keys.subList(mid, node.keys.size()).clear();
        node.children.subList(mid + 1, node.children.size()).clear();

        return new SplitResult(pushUpKey, newNode);
    }

    // 找到插入位置（第一个 >= key 的位置）
    private int findInsertPosition(List<Integer> keys, int key) {
        int pos = 0;
        while (pos < keys.size() && keys.get(pos) < key) {
            pos++;
        }
        return pos;
    }

    // 找到应该进入的子节点索引
    private int findChildIndex(List<Integer> keys, int key) {
        int i = 0;
        while (i < keys.size() && key >= keys.get(i)) {
            i++;
        }
        return i;
    }
}

// 分裂结果封装
class SplitResult {
    public final int pushUpKey;
    public final BPlusTreeNode newNode;

    public SplitResult(int pushUpKey, BPlusTreeNode newNode) {
        this.pushUpKey = pushUpKey;
        this.newNode = newNode;
    }
}
```

### 4.5 树结构打印工具

```java
public static void printTree(BPlusTreeNode node, String prefix, boolean isLast) {
    if (node == null) return;

    String connector = isLast ? "└── " : "├── ";
    String nodeStr = node.isLeaf
        ? "Leaf" + node.keys.toString()
        : "Internal" + node.keys.toString();

    System.out.println(prefix + connector + nodeStr);

    if (!node.isLeaf) {
        String childPrefix = prefix + (isLast ? "    " : "│   ");
        for (int i = 0; i < node.children.size(); i++) {
            boolean lastChild = (i == node.children.size() - 1);
            printTree(node.children.get(i), childPrefix, lastChild);
        }
    }
}
```

---

## 5. 实践练习

### 练习 1（基础）：序列化验证

实现以下测试，验证序列化/反序列化的正确性：

```java
// 创建一个叶子节点，插入 3 个键值对
BPlusTreeNode leaf = new BPlusTreeNode(true);
leaf.keys.add(10);
leaf.keys.add(20);
leaf.keys.add(30);
leaf.values.add(new RecordId(1, 0));
leaf.values.add(new RecordId(1, 1));
leaf.values.add(new RecordId(2, 0));
leaf.nextPageId = 5;

// 序列化
byte[] data = NodeSerializer.serialize(leaf);
assert data.length == 4096 : "序列化后必须是 4096 字节";

// 反序列化
BPlusTreeNode restored = NodeSerializer.deserialize(data);
assert restored.isLeaf == true;
assert restored.keys.equals(leaf.keys);
assert restored.nextPageId == 5;
System.out.println("序列化测试通过！");
```

**要求：** 同样实现内部节点的序列化/反序列化测试。

### 练习 2（进阶）：观察分裂过程

使用阶数 = 3 的 B+ 树，依次插入 1, 2, 3, 4, 5, 6, 7, 8, 9, 10，在每次插入后打印树结构。

**要求：**
1. 标注每次分裂发生的时机（插入哪个键时触发了分裂）
2. 区分叶子节点分裂和内部节点分裂
3. 验证叶子链表始终完整（从最左叶子遍历到最右叶子，所有键按序排列）

**预期输出示例：**
```
插入 1: 无分裂
插入 2: 无分裂
插入 3: 触发叶子分裂！上推键=2
  └── Internal[2]
      ├── Leaf[1]
      └── Leaf[2,3]
```

### 练习 3（挑战）：实现页管理器

实现一个简单的 `PageManager`，将序列化的节点存储到内存中的 `Map<Integer, byte[]>`，模拟磁盘页管理：

```java
class PageManager {
    private Map<Integer, byte[]> pages = new HashMap<>();
    private int nextPageId = 0;

    // 分配新页，返回页号
    public int allocatePage(BPlusTreeNode node) { ... }

    // 读取页，返回反序列化的节点
    public BPlusTreeNode readPage(int pageId) { ... }

    // 更新页
    public void writePage(int pageId, BPlusTreeNode node) { ... }
}
```

**要求：**
1. 插入 50 个键后，将整棵树的所有节点序列化到 PageManager
2. 清空内存中的树对象
3. 从 PageManager 重新加载根节点，验证查询结果正确

---

## 6. 常见问题

**Q1：叶子节点分裂时，上推键为什么要在右节点保留？**

A：因为叶子节点存储的是真实数据（RecordId），每条数据都必须能通过叶子节点访问到。如果把上推键从右节点移走，那么对应的 RecordId 就丢失了。内部节点的键只是路由键，不对应实际数据，所以可以移走。

**Q2：分裂时为什么选择中间位置（mid = size/2）？**

A：选择中间位置是为了保持树的平衡。如果总是从末尾分裂，会导致树退化为链表。选择中间位置确保两个新节点的键数量大致相等，维持 O(log n) 的查询性能。

**Q3：序列化时，内部节点的子指针存的是页号，反序列化后如何恢复子节点引用？**

A：反序列化时，内部节点的子节点只是"占位符"（只有 pageId，没有实际内容）。真实数据库采用**缓冲池（Buffer Pool）**机制：当需要访问某个子节点时，才从磁盘加载对应页号的数据。这是懒加载（Lazy Loading）的思想，避免一次性加载整棵树。

**Q4：4096 字节的页大小能存多少条索引记录？**

A：以整数键 + RecordId（8字节）为例：
- 叶子节点：约 340 条记录
- 内部节点：约 510 个键（511 个子指针）

一棵 3 层的 B+ 树可以索引约 340 × 511 × 511 ≈ **8800 万条记录**，这就是为什么 B+ 树在数据库中如此高效。

---

## 7. 本章小结

本章完成了 B+ 树从内存到磁盘的关键一步——节点序列化。核心要点：

1. **页格式设计**：固定 4096 字节，包含 isLeaf 标志、键数量、键数组和数据区
2. **序列化规则**：叶子节点存 RecordId 数组和 nextPageId；内部节点存子节点页号数组
3. **叶子分裂**：上推键 = 右节点第一个键，右节点**保留**该键，同时更新叶子链表
4. **内部节点分裂**：上推键 = 中间键，中间键从节点**移走**，不保留
5. **分裂传播**：分裂可能递归向上传播，直到根节点；根节点分裂时树高度 +1

下一章（Ch18）将实现删除操作，包括借键（Redistribute）和合并（Merge）两种复杂情况。

## 课堂练习

### ⭐ 基础
1. 追踪 B+ 树插入 key=25 时从根到叶的搜索路径
2. 追踪叶节点分裂：当插入导致节点溢出时的处理过程
3. 画出分裂后父节点的变化（新增一个索引条目）

### ⭐⭐ 进阶
1. 实现非叶节点的分裂（分裂向上传播）
2. 追踪根节点分裂（树高度+1）的完整过程
3. 分析分裂对缓冲池的影响（修改的页需要标记为脏页）

### ⭐⭐⭐ 挑战
1. 实现前缀压缩索引键（非叶节点只存区分左右子树的最短前缀）
2. 实现批量插入优化（预知所有键时，自底向上构建 B+ 树）
3. 对比 JimSQL B+ 树节点大小（4KB）与 MySQL InnoDB 页大小（16KB）的影响
