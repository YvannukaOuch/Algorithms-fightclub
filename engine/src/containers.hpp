// Fixed-capacity containers over caller-provided static storage.
#pragma once

#include "common.hpp"

namespace fc {

struct HeapItem {
  uint64_t key;
  int32_t node;
  int32_t g;
};

// Binary min-heap with lazy deletion: decrease-key is a fresh push, and stale
// entries are skipped on pop. Simpler and faster than an indexed heap at this size.
struct MinHeap {
  HeapItem* a = nullptr;
  int32_t n = 0;

  bool empty() const { return n == 0; }

  void push(HeapItem it) {
    int32_t i = n++;
    while (i > 0) {
      const int32_t p = (i - 1) >> 1;
      if (a[p].key <= it.key) break;
      a[i] = a[p];
      i = p;
    }
    a[i] = it;
  }

  HeapItem pop() {
    const HeapItem top = a[0];
    const HeapItem last = a[--n];
    int32_t i = 0;
    for (;;) {
      const int32_t l = 2 * i + 1;
      if (l >= n) break;
      const int32_t r = l + 1;
      const int32_t c = (r < n && a[r].key < a[l].key) ? r : l;
      if (a[c].key >= last.key) break;
      a[i] = a[c];
      i = c;
    }
    if (n > 0) a[i] = last;
    return top;
  }
};

// Heap keys pack three fields so one u64 compare gives a total, deterministic order:
//   bits 41..60  primary   (f, g or h depending on the algorithm)
//   bits 22..40  secondary (tie-break, e.g. prefer deeper nodes in A*)
//   bits  0..21  sequence  (insertion order, makes equal keys FIFO)
// Max path cost is kMaxCells * kMudCost < 2^19, and pushes stay below 2^22.
constexpr uint64_t kMaxSecondary = (1u << 19) - 1;

inline uint64_t make_key(uint64_t primary, uint64_t secondary, uint32_t seq) {
  return (primary << 41) | (secondary << 22) | (seq & 0x3fffffu);
}

}  // namespace fc
