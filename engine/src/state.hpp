// Static storage for the whole engine. Nothing is ever allocated at runtime.
#pragma once

#include "common.hpp"
#include "containers.hpp"

namespace fc {

// Shared with JavaScript (pointers are exported in arena.cpp).
inline uint8_t g_cells[kMaxCells];
inline uint32_t g_events[kMaxEvents];
inline int32_t g_stats[8];
inline int32_t g_meta[8];
inline int32_t g_path[kMaxCells];

// Search scratch. The "_b" set is the goal side of bidirectional search; the
// generators reuse these buffers too, since generation and search never overlap.
inline int32_t g_dist[kMaxCells];
inline int32_t g_parent[kMaxCells];
inline uint8_t g_state[kMaxCells];
inline int32_t g_dist_b[kMaxCells];
inline int32_t g_parent_b[kMaxCells];
inline uint8_t g_state_b[kMaxCells];
inline int32_t g_queue[kQueueCap];
inline int32_t g_queue_b[kQueueCap];
inline HeapItem g_heap[kQueueCap];
inline uint8_t g_scratch[kMaxCells];

constexpr int32_t kLatticeCap = 128 * 128;
inline float g_lattice[kLatticeCap];

}  // namespace fc
