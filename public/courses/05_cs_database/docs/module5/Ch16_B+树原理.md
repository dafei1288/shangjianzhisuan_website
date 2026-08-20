# 第 16 章 B+ 树原理

## 教学目标

- 理解 B 树与 B+ 树的区别，掌握 B+ 树的节点结构
- 能够手动模拟 B+ 树的查找、插入、删除操作
- 理解节点分裂（Split）和合并/借用（Merge/Redistribute）的触发条件
- 理解叶子节点链表如何支持范围查询

## 课前准备

- 已完成 Ch15，理解索引的必要性和 RecordId 的概念
- 了解二叉搜索树（BST）的基本操作
- 了解 Java 泛型和 Comparable 接口

## 核心概念

### 1. 为什么不用二叉搜索树？

BST 的问题：树高 = O(log₂ N)，100 万条数据树高约 20 层，每层一次磁盘 I/O，共 20 次 I/O。

B+ 树的优势：每个节点可以存 100-1000 个键，树高 = O(log_M N)，M 是节点容量。100 万条数据树高约 3 层，只需 3 次 I/O。

```
BST（M=2）：100万条 → 树高 ≈ 20 → 20次 I/O
B+树（M=100）：100万条 → 树高 ≈ 3 → 3次 I/O
```

### 2. B 树 vs B+ 树

| 特性 | B 树 | B+ 树 |
|------|------|-------|
| 数据存储位置 | 所有节点都存数据 | 只有叶子节点存数据 |
| 内部节点 | 存键 + 数据 | 只存键（路由用） |
| 叶子节点 | 独立 | 用链表连接 |
| 范围查询 | 需要中序遍历 | 叶子链表顺序遍历 |
| 磁盘利用率 | 较低 | 较高（内部节点更小）|

**数据库为什么选 B+ 树**：叶子链表使范围查询极其高效，内部节点只存键使每个节点能容纳更多键（更矮的树）。

### 3. B+ 树节点结构

#### 内部节点（Internal Node）

```
┌─────────────────────────────────────────────────────┐
│  [P0] [K1] [P1] [K2] [P2] [K3] [P3]               │
│                                                     │
│  P0: 指向 key < K1 的子树                           │
│  P1: 指向 K1 ≤ key < K2 的子树                     │
│  P2: 指向 K2 ≤ key < K3 的子树                     │
│  P3: 指向 key ≥ K3 的子树                           │
└─────────────────────────────────────────────────────┘
```

#### 叶子节点（Leaf Node）

```
┌─────────────────────────────────────────────────────┐
│  [K1,V1] [K2,V2] [K3,V3] ... │ → 下一个叶子节点    │
│                                                     │
│  K: 索引键（如 id 值）                              │
│  V: RecordId（pageId, slotId）                      │
└─────────────────────────────────────────────────────┘
```

### 4. 查找操作

查找 key = 35，树的阶数 M = 3（每个节点最多 2 个键）：

```
根节点: [20, 40]
  ↓ 35 在 [20, 40) 之间，走中间指针
中间节点: [25, 35]
  ↓ 35 ≥ 35，走右指针
叶子节点: [35, RecordId(2,5)]
  ↓ 找到！返回 RecordId(2,5)
```

时间复杂度：O(log_M N)，每层一次磁盘 I/O。

### 5. 插入操作

插入 key = 30，M = 3：

**Step 1**：找到应该插入的叶子节点

**Step 2**：如果叶子节点未满（< M-1 个键），直接插入

**Step 3**：如果叶子节点已满，触发**分裂（Split）**：
```
分裂前: [25, 30, 35]（已满，M=3 最多 2 个键）
分裂后:
  左节点: [25, 30]
  右节点: [35]
  向父节点上推: 35（右节点的最小键）
```

**Step 4**：如果父节点也满了，递归向上分裂，直到根节点。根节点分裂时树高增加 1。

### 6. 删除操作

删除 key = 25，M = 3（每个节点至少 ⌈M/2⌉ - 1 = 1 个键）：

**Step 1**：找到叶子节点，删除键值对

**Step 2**：如果叶子节点键数 ≥ 最小值，完成

**Step 3**：如果键数 < 最小值（下溢），尝试**借用（Redistribute）**：
```
从兄弟节点借一个键（兄弟节点键数 > 最小值）
更新父节点的分隔键
```

**Step 4**：如果兄弟节点也只有最小键数，触发**合并（Merge）**：
```
合并两个节点 + 父节点的分隔键
父节点删除一个键，可能递归向上合并
```

### 7. 范围查询

查询 score BETWEEN 60 AND 90：

```
Step 1: 在 B+树中找到 key = 60 的叶子节点
Step 2: 沿叶子链表向右遍历，直到 key > 90
Step 3: 收集所有 RecordId

时间复杂度: O(log N + K)，K 是结果数量
```

这就是 B+ 树叶子链表的价值所在。

## 代码讲解

### 16.1 节点类设计

```java
/**
 * B+ 树节点（内部节点和叶子节点共用）
 */
public class BPlusTreeNode<K extends Comparable<K>> {

    static final int ORDER = 4; // 阶数：每个节点最多 ORDER-1 个键

    boolean isLeaf;
    List<K> keys;
    // 内部节点：children 存子节点引用
    List<BPlusTreeNode<K>> children;
    // 叶子节点：values 存 RecordId
    List<RecordId> values;
    // 叶子节点链表指针
    BPlusTreeNode<K> next;

    BPlusTreeNode(boolean isLeaf) {
        this.isLeaf = isLeaf;
        this.keys = new ArrayList<>();
        if (isLeaf) {
            this.values = new ArrayList<>();
        } else {
            this.children = new ArrayList<>();
        }
    }

    boolean isFull() {
        return keys.size() >= ORDER - 1;
    }

    boolean isUnderflow() {
        return keys.size() < (ORDER - 1) / 2;
    }

    @Override
    public String toString() {
        return (isLeaf ? "Leaf" : "Internal") + keys.toString();
    }
}
```

### 16.2 查找实现

```java
public RecordId search(K key) {
    BPlusTreeNode<K> node = root;

    // 从根节点向下查找
    while (!node.isLeaf) {
        int i = 0;
        // 找到第一个 >= key 的位置
        while (i < node.keys.size() && key.compareTo(node.keys.get(i)) >= 0) {
            i++;
        }
        node = node.children.get(i);
    }

    // 在叶子节点中查找
    for (int i = 0; i < node.keys.size(); i++) {
        if (node.keys.get(i).compareTo(key) == 0) {
            return node.values.get(i);
        }
    }
    return null; // 未找到
}
```

### 16.3 插入实现（含分裂）

```java
public void insert(K key, RecordId rid) {
    if (root == null) {
        root = new BPlusTreeNode<>(true);
        root.keys.add(key);
        root.values.add(rid);
        size++;
        return;
    }

    // 如果根节点已满，先分裂根节点
    if (root.isFull()) {
        BPlusTreeNode<K> newRoot = new BPlusTreeNode<>(false);
        newRoot.children.add(root);
        splitChild(newRoot, 0);
        root = newRoot;
    }

    insertNonFull(root, key, rid);
    size++;
}

private void insertNonFull(BPlusTreeNode<K> node, K key, RecordId rid) {
    if (node.isLeaf) {
        // 找到插入位置（保持有序）
        int i = node.keys.size() - 1;
        while (i >= 0 && key.compareTo(node.keys.get(i)) < 0) {
            i--;
        }
        node.keys.add(i + 1, key);
        node.values.add(i + 1, rid);
    } else {
        // 找到应该进入的子节点
        int i = node.keys.size() - 1;
        while (i >= 0 && key.compareTo(node.keys.get(i)) < 0) {
            i--;
        }
        i++;

        // 如果子节点已满，先分裂
        if (node.children.get(i).isFull()) {
            splitChild(node, i);
            if (key.compareTo(node.keys.get(i)) >= 0) {
                i++;
            }
        }
        insertNonFull(node.children.get(i), key, rid);
    }
}

private void splitChild(BPlusTreeNode<K> parent, int childIndex) {
    BPlusTreeNode<K> child = parent.children.get(childIndex);
    BPlusTreeNode<K> newNode = new BPlusTreeNode<>(child.isLeaf);
    int mid = child.keys.size() / 2;

    if (child.isLeaf) {
        // 叶子节点分裂：右半部分移到新节点，维护链表
        newNode.keys.addAll(child.keys.subList(mid, child.keys.size()));
        newNode.values.addAll(child.values.subList(mid, child.values.size()));
        child.keys.subList(mid, child.keys.size()).clear();
        child.values.subList(mid, child.values.size()).clear();

        // 维护叶子链表
        newNode.next = child.next;
        child.next = newNode;

        // 向父节点上推新节点的最小键
        parent.keys.add(childIndex, newNode.keys.get(0));
    } else {
        // 内部节点分裂：中间键上推
        K midKey = child.keys.get(mid);
        newNode.keys.addAll(child.keys.subList(mid + 1, child.keys.size()));
        newNode.children.addAll(child.children.subList(mid + 1, child.children.size()));
        child.keys.subList(mid, child.keys.size()).clear();
        child.children.subList(mid + 1, child.children.size()).clear();

        parent.keys.add(childIndex, midKey);
    }

    parent.children.add(childIndex + 1, newNode);
}
```

### 16.4 范围查询实现

```java
public List<RecordId> rangeSearch(K low, K high) {
    List<RecordId> result = new ArrayList<>();
    if (root == null) return result;

    // Step 1: 找到 low 对应的叶子节点
    BPlusTreeNode<K> node = root;
    while (!node.isLeaf) {
        int i = 0;
        while (i < node.keys.size() && low.compareTo(node.keys.get(i)) >= 0) {
            i++;
        }
        node = node.children.get(i);
    }

    // Step 2: 沿叶子链表向右遍历
    while (node != null) {
        for (int i = 0; i < node.keys.size(); i++) {
            K k = node.keys.get(i);
            if (k.compareTo(low) >= 0 && k.compareTo(high) <= 0) {
                result.add(node.values.get(i));
            }
            if (k.compareTo(high) > 0) return result;
        }
        node = node.next;
    }
    return result;
}
```

### 16.5 树结构可视化

```java
public void printTree() {
    if (root == null) { System.out.println("(空树)"); return; }
    printNode(root, 0);
}

private void printNode(BPlusTreeNode<K> node, int depth) {
    String indent = "  ".repeat(depth);
    System.out.println(indent + node);
    if (!node.isLeaf) {
        for (BPlusTreeNode<K> child : node.children) {
            printNode(child, depth + 1);
        }
    }
}
```

## 实践练习

### 练习 1：手动模拟插入（基础）

在纸上画出阶数 M=3 的 B+ 树，依次插入以下键：10, 20, 5, 6, 12, 30, 7, 17。

每次插入后画出树的状态，标注哪些步骤触发了分裂。

### 练习 2：实现删除操作（进阶）

在本章的 B+ 树实现基础上，添加 `delete(K key)` 方法，要求：
1. 找到叶子节点并删除键值对
2. 如果叶子节点下溢，先尝试从兄弟节点借键
3. 如果无法借键，合并两个节点

验证：插入 1-20，删除 5、10、15，验证树结构仍然正确。

### 练习 3：磁盘序列化（挑战）

将 B+ 树节点序列化为固定大小的字节数组（4096 字节/页），实现：
- `byte[] serialize(BPlusTreeNode node)`
- `BPlusTreeNode deserialize(byte[] data)`

要求：节点头部存储 `isLeaf`、`keyCount`，后续存储键和子节点指针（或 RecordId）。

## 常见问题

### Q1：B+ 树的阶数 M 如何选择？

M 的选择取决于磁盘页大小和键的大小：

```
M ≈ 页大小 / (键大小 + 指针大小)
  ≈ 4096 / (8 + 8)  // 8字节整数键 + 8字节指针
  ≈ 256
```

M 越大，树越矮，I/O 次数越少。实际数据库中 M 通常在 100-1000 之间。

### Q2：为什么叶子节点分裂时上推的是右节点的最小键，而内部节点分裂上推的是中间键？

叶子节点分裂后，右节点的最小键需要保留在叶子节点中（因为叶子节点存储实际数据），所以上推的是右节点最小键的**副本**。内部节点分裂时，中间键只需要在父节点中作为路由键，不需要保留在子节点中，所以直接上推（移走）。

### Q3：B+ 树的高度会无限增长吗？

不会。B+ 树只在根节点分裂时增高，而根节点分裂需要所有节点都满。对于 M=256 的 B+ 树，存储 10 亿条数据树高也只有 4 层（256^4 = 4 亿，256^5 = 1000 亿）。

### Q4：并发访问 B+ 树时如何加锁？

简单方案：对整棵树加读写锁（粒度粗，并发度低）。

高效方案：蟹行协议（Crab Locking）——从根节点向下，获取子节点锁后，如果子节点"安全"（不会分裂/合并），释放父节点锁。这样大多数操作只需持有 1-2 个节点的锁。

## 本章小结

1. **B+ 树 vs BST**：M 路分叉使树高从 O(log₂ N) 降到 O(log_M N)，大幅减少 I/O
2. **节点结构**：内部节点只存键（路由），叶子节点存键+RecordId+链表指针
3. **查找**：从根到叶，O(log_M N) 次 I/O
4. **插入**：找叶子插入，满了就分裂，递归向上
5. **删除**：找叶子删除，下溢就借键或合并
6. **范围查询**：找到起始叶子，沿链表遍历，O(log N + K)

下一章开始实现 B+ 树代码（上）：节点序列化、查找、插入与分裂。

## 课堂练习

### ⭐ 基础
1. 手动构建一棵 3 阶 B+ 树（插入 10, 20, 30, 40, 50, 60）
2. 在 B+ 树中查找 key=35，画出搜索路径
3. 解释为什么 B+ 树比二叉搜索树更适合磁盘存储

### ⭐⭐ 进阶
1. 计算不同阶数的 B+ 树（m=50, m=100, m=200）在 100 万条记录时的树高
2. 分析 B+ 树的叶节点链表如何加速范围查询
3. 对比 B+ 树与 B 树的差异（为什么数据库选 B+ 树？）

### ⭐⭐⭐ 挑战
1. 证明 B+ 树的高度为 O(log_m(N))
2. 分析 B+ 树在大量随机写入时的性能退化（频繁分裂）
3. 实现 B+ 树的可视化工具（打印树结构）
