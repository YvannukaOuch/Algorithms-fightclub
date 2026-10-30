// Fight Club engine: shared definitions.
//
// The engine is freestanding C++17: no libc, no libc++, no exceptions, no heap.
// Every buffer is a fixed-size static array, so the module needs zero imports
// and its linear memory layout never changes after instantiation. That lets the
// TypeScript side keep typed-array views over the buffers and read results
// without copying or marshalling.
#pragma once

#include <stddef.h>
#include <stdint.h>

#define FC_EXPORT(name) extern "C" __attribute__((export_name(#name), used))

namespace fc {

constexpr int32_t kMaxDim = 255;
constexpr int32_t kMaxCells = kMaxDim * kMaxDim;
// Upper bound on frontier pushes: each expansion relaxes at most 4 edges.
constexpr int32_t kQueueCap = kMaxCells * 4 + 16;
// Worst case is bidirectional search: every cell opened and closed from both
// sides, plus updates and the final path. 2^20 events leaves ample headroom.
constexpr int32_t kMaxEvents = 1 << 20;

constexpr int32_t kInf = 0x3fffffff;

enum Cell : uint8_t {
  kFloor = 0,
  kWall = 1,
  kMud = 2,
};

constexpr int32_t kFloorCost = 1;
constexpr int32_t kMudCost = 5;

inline int32_t cell_cost(uint8_t c) { return c == kMud ? kMudCost : kFloorCost; }

template <typename T>
inline T min_of(T a, T b) { return a < b ? a : b; }
template <typename T>
inline T max_of(T a, T b) { return a > b ? a : b; }
template <typename T>
inline T abs_of(T a) { return a < 0 ? -a : a; }
template <typename T>
inline void swap_of(T& a, T& b) {
  T t = a;
  a = b;
  b = t;
}

struct Grid {
  int32_t w = 0;
  int32_t h = 0;
  uint8_t* cells = nullptr;

  int32_t size() const { return w * h; }
  int32_t x_of(int32_t i) const { return i % w; }
  int32_t y_of(int32_t i) const { return i / w; }
  int32_t at(int32_t x, int32_t y) const { return y * w + x; }
  bool in_bounds(int32_t x, int32_t y) const { return x >= 0 && y >= 0 && x < w && y < h; }
  bool passable(int32_t i) const { return cells[i] != kWall; }

  // Passable 4-neighbours in a fixed N, E, S, W order. Every algorithm uses the
  // same order, so tie-breaking differences come from the algorithm alone.
  int neighbors(int32_t i, int32_t out[4]) const {
    const int32_t x = i % w;
    const int32_t y = i / w;
    int n = 0;
    if (y > 0 && cells[i - w] != kWall) out[n++] = i - w;
    if (x < w - 1 && cells[i + 1] != kWall) out[n++] = i + 1;
    if (y < h - 1 && cells[i + w] != kWall) out[n++] = i + w;
    if (x > 0 && cells[i - 1] != kWall) out[n++] = i - 1;
    return n;
  }

  int32_t manhattan(int32_t a, int32_t b) const {
    return abs_of(x_of(a) - x_of(b)) + abs_of(y_of(a) - y_of(b));
  }
};

}  // namespace fc
