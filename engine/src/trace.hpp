// Event trace: what the visualizer replays.
//
// Each event is one u32: the opcode in the top 8 bits, the cell index in the
// low 24. Recording is a template parameter, so the benchmark build of every
// solver contains no tracing code at all, not even a branch.
#pragma once

#include "common.hpp"

namespace fc {

enum Op : uint32_t {
  kOpOpen = 1,     // cell discovered and added to the frontier
  kOpUpdate = 2,   // cell already on the frontier got a cheaper cost
  kOpClose = 3,    // cell expanded; one "step" in lockstep playback
  kOpPath = 4,     // final path, emitted in order from start to goal
  kOpOpenB = 5,    // bidirectional search, goal-side frontier
  kOpCloseB = 6,   // bidirectional search, goal-side expansion
};

// Mirrors the stats block read by src/engine/engine.ts. Keep the order in sync.
struct Stats {
  int32_t found;
  int32_t expanded;
  int32_t discovered;
  int32_t max_frontier;
  int32_t path_len;
  int32_t path_cost;
  int32_t events;
  int32_t updates;
};

template <bool kRecord>
struct Trace {
  uint32_t* buf = nullptr;
  int32_t n = 0;
  int32_t cap = 0;
  bool overflow = false;

  inline void emit(uint32_t op, int32_t cell) {
    if constexpr (kRecord) {
      if (n < cap) {
        buf[n++] = (op << 24) | static_cast<uint32_t>(cell);
      } else {
        overflow = true;
      }
    } else {
      (void)op;
      (void)cell;
    }
  }
};

}  // namespace fc
