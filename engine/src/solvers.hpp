// The fighters. Every solver is a template over kRecord: the traced build feeds
// the visualizer, the untraced build is what the benchmark times.
#pragma once

#include "common.hpp"
#include "containers.hpp"
#include "state.hpp"
#include "trace.hpp"

namespace fc {

// Keep in sync with ENGINE_ID in src/engine/algorithms.ts.
enum Algo : int32_t {
  kBfs = 0,
  kDfs = 1,
  kDijkstra = 2,
  kAStar = 3,
  kGreedy = 4,
  kBidirBfs = 5,
  kWeightedAStar = 6,
  kAlgoCount = 7,
};

namespace detail {

inline void reset_side(int32_t n, int32_t* dist, int32_t* parent, uint8_t* state) {
  for (int32_t i = 0; i < n; ++i) {
    dist[i] = kInf;
    parent[i] = -1;
    state[i] = 0;
  }
}

// Follows parent links back from `from` and writes the path root..from into `out`.
inline int32_t trace_back(int32_t from, const int32_t* parent, int32_t* out) {
  int32_t len = 0;
  for (int32_t v = from; v != -1; v = parent[v]) out[len++] = v;
  for (int32_t i = 0, j = len - 1; i < j; ++i, --j) swap_of(out[i], out[j]);
  return len;
}

template <bool kRecord>
inline void finish_path(const Grid& g, int32_t len, Trace<kRecord>& tr, Stats& st) {
  st.found = 1;
  st.path_len = len;
  int32_t cost = 0;
  for (int32_t i = 0; i < len; ++i) {
    if (i > 0) cost += cell_cost(g.cells[g_path[i]]);
    tr.emit(kOpPath, g_path[i]);
  }
  st.path_cost = cost;
}

}  // namespace detail

// Breadth-first search: expands in rings of equal step count. Optimal in steps,
// blind to terrain cost.
template <bool kRecord>
void solve_bfs(const Grid& g, int32_t start, int32_t goal, Trace<kRecord>& tr, Stats& st) {
  detail::reset_side(g.size(), g_dist, g_parent, g_state);
  int32_t* q = g_queue;
  int32_t head = 0;
  int32_t tail = 0;
  int32_t open = 1;

  g_dist[start] = 0;
  g_state[start] = 1;
  q[tail++] = start;
  st.discovered = 1;
  st.max_frontier = 1;
  tr.emit(kOpOpen, start);

  while (head < tail) {
    const int32_t u = q[head++];
    g_state[u] = 2;
    --open;
    ++st.expanded;
    tr.emit(kOpClose, u);
    if (u == goal) {
      detail::finish_path(g, detail::trace_back(goal, g_parent, g_path), tr, st);
      return;
    }
    int32_t nb[4];
    const int k = g.neighbors(u, nb);
    for (int j = 0; j < k; ++j) {
      const int32_t v = nb[j];
      if (g_state[v] != 0) continue;
      g_state[v] = 1;
      g_dist[v] = g_dist[u] + 1;
      g_parent[v] = u;
      q[tail++] = v;
      ++open;
      ++st.discovered;
      tr.emit(kOpOpen, v);
    }
    if (open > st.max_frontier) st.max_frontier = open;
  }
}

// Depth-first search, marking cells when they are popped. A cell can sit on the
// stack several times; the most recent push wins, which is true DFS order.
template <bool kRecord>
void solve_dfs(const Grid& g, int32_t start, int32_t goal, Trace<kRecord>& tr, Stats& st) {
  detail::reset_side(g.size(), g_dist, g_parent, g_state);
  int32_t* stack_node = g_queue;
  int32_t* stack_from = g_queue_b;
  int32_t sp = 0;
  int32_t open = 1;

  g_state[start] = 1;
  g_dist[start] = 0;
  stack_node[sp] = start;
  stack_from[sp] = -1;
  ++sp;
  st.discovered = 1;
  st.max_frontier = 1;
  tr.emit(kOpOpen, start);

  while (sp > 0) {
    --sp;
    const int32_t u = stack_node[sp];
    const int32_t from = stack_from[sp];
    if (g_state[u] == 2) continue;
    g_state[u] = 2;
    g_parent[u] = from;
    if (from >= 0) g_dist[u] = g_dist[from] + 1;
    --open;
    ++st.expanded;
    tr.emit(kOpClose, u);
    if (u == goal) {
      detail::finish_path(g, detail::trace_back(goal, g_parent, g_path), tr, st);
      return;
    }
    int32_t nb[4];
    const int k = g.neighbors(u, nb);
    // Push in reverse so the first neighbour in N, E, S, W order is explored first.
    for (int j = k - 1; j >= 0; --j) {
      const int32_t v = nb[j];
      if (g_state[v] == 2) continue;
      if (g_state[v] == 0) {
        g_state[v] = 1;
        ++open;
        ++st.discovered;
        tr.emit(kOpOpen, v);
      }
      stack_node[sp] = v;
      stack_from[sp] = u;
      ++sp;
    }
    if (open > st.max_frontier) st.max_frontier = open;
  }
}

enum class Priority {
  kDijkstra,       // g
  kAStar,          // g + h, ties toward larger g
  kGreedy,         // h only
  kWeightedAStar,  // g + 2h, ties toward larger g
};

// One best-first loop covers Dijkstra, A*, weighted A* and greedy best-first;
// only the heap key changes. `if constexpr` resolves the variant at compile time.
template <bool kRecord, Priority P>
void solve_best_first(const Grid& g, int32_t start, int32_t goal, Trace<kRecord>& tr, Stats& st) {
  detail::reset_side(g.size(), g_dist, g_parent, g_state);
  MinHeap heap{g_heap, 0};
  uint32_t seq = 0;
  int32_t open = 1;

  auto key_for = [&](int32_t node, int32_t cost) -> uint64_t {
    const uint64_t h = static_cast<uint64_t>(g.manhattan(node, goal));
    const uint64_t gc = static_cast<uint64_t>(cost);
    if constexpr (P == Priority::kDijkstra) {
      return make_key(gc, 0, seq++);
    } else if constexpr (P == Priority::kAStar) {
      return make_key(gc + h, kMaxSecondary - gc, seq++);
    } else if constexpr (P == Priority::kGreedy) {
      return make_key(h, 0, seq++);
    } else {
      return make_key(gc + 2 * h, kMaxSecondary - gc, seq++);
    }
  };

  g_dist[start] = 0;
  g_state[start] = 1;
  heap.push({key_for(start, 0), start, 0});
  st.discovered = 1;
  st.max_frontier = 1;
  tr.emit(kOpOpen, start);

  while (!heap.empty()) {
    const HeapItem it = heap.pop();
    const int32_t u = it.node;
    if (g_state[u] == 2 || it.g != g_dist[u]) continue;  // stale duplicate
    g_state[u] = 2;
    --open;
    ++st.expanded;
    tr.emit(kOpClose, u);
    if (u == goal) {
      detail::finish_path(g, detail::trace_back(goal, g_parent, g_path), tr, st);
      return;
    }
    int32_t nb[4];
    const int k = g.neighbors(u, nb);
    for (int j = 0; j < k; ++j) {
      const int32_t v = nb[j];
      if constexpr (P == Priority::kGreedy) {
        // Greedy never revisits a decision: first discovery fixes the parent.
        if (g_state[v] != 0) continue;
      } else {
        if (g_state[v] == 2) continue;
      }
      const int32_t ng = g_dist[u] + cell_cost(g.cells[v]);
      if (ng >= g_dist[v]) continue;
      const bool was_open = g_state[v] == 1;
      g_dist[v] = ng;
      g_parent[v] = u;
      heap.push({key_for(v, ng), v, ng});
      if (was_open) {
        ++st.updates;
        tr.emit(kOpUpdate, v);
      } else {
        g_state[v] = 1;
        ++open;
        ++st.discovered;
        tr.emit(kOpOpen, v);
      }
    }
    if (open > st.max_frontier) st.max_frontier = open;
  }
}

// Bidirectional BFS. Each round expands one full level on the side with the
// smaller frontier. Once the frontiers touch, the rest of that level is still
// expanded and the cheapest meeting point wins, which keeps the result optimal
// in steps.
template <bool kRecord>
void solve_bidir_bfs(const Grid& g, int32_t start, int32_t goal, Trace<kRecord>& tr, Stats& st) {
  const int32_t n = g.size();
  detail::reset_side(n, g_dist, g_parent, g_state);
  detail::reset_side(n, g_dist_b, g_parent_b, g_state_b);

  if (start == goal) {
    tr.emit(kOpOpen, start);
    tr.emit(kOpClose, start);
    st.discovered = 1;
    st.expanded = 1;
    st.max_frontier = 1;
    g_path[0] = start;
    detail::finish_path(g, 1, tr, st);
    return;
  }

  int32_t* qa = g_queue;
  int32_t* qb = g_queue_b;
  int32_t ha = 0, ta = 0, hb = 0, tb = 0;
  int32_t open = 2;

  g_dist[start] = 0;
  g_state[start] = 1;
  qa[ta++] = start;
  tr.emit(kOpOpen, start);
  g_dist_b[goal] = 0;
  g_state_b[goal] = 1;
  qb[tb++] = goal;
  tr.emit(kOpOpenB, goal);
  st.discovered = 2;
  st.max_frontier = 2;

  int32_t best = kInf;
  int32_t meet = -1;

  while (ha < ta && hb < tb) {
    const bool forward = (ta - ha) <= (tb - hb);
    int32_t* q = forward ? qa : qb;
    int32_t& head = forward ? ha : hb;
    int32_t& tail = forward ? ta : tb;
    int32_t* dist = forward ? g_dist : g_dist_b;
    int32_t* parent = forward ? g_parent : g_parent_b;
    uint8_t* state = forward ? g_state : g_state_b;
    const int32_t* other_dist = forward ? g_dist_b : g_dist;
    const uint8_t* other_state = forward ? g_state_b : g_state;
    const uint32_t op_open = forward ? kOpOpen : kOpOpenB;
    const uint32_t op_close = forward ? kOpClose : kOpCloseB;

    const int32_t level_end = tail;
    while (head < level_end) {
      const int32_t u = q[head++];
      state[u] = 2;
      --open;
      ++st.expanded;
      tr.emit(op_close, u);
      int32_t nb[4];
      const int k = g.neighbors(u, nb);
      for (int j = 0; j < k; ++j) {
        const int32_t v = nb[j];
        if (state[v] != 0) continue;
        state[v] = 1;
        dist[v] = dist[u] + 1;
        parent[v] = u;
        q[tail++] = v;
        ++open;
        ++st.discovered;
        tr.emit(op_open, v);
        if (other_state[v] != 0) {
          const int32_t total = dist[v] + other_dist[v];
          if (total < best) {
            best = total;
            meet = v;
          }
        }
      }
      if (open > st.max_frontier) st.max_frontier = open;
    }
    if (meet >= 0) break;
  }

  if (meet < 0) return;

  // start..meet from the forward tree, then meet..goal from the backward tree.
  int32_t len = detail::trace_back(meet, g_parent, g_path);
  for (int32_t v = g_parent_b[meet]; v != -1; v = g_parent_b[v]) g_path[len++] = v;
  detail::finish_path(g, len, tr, st);
}

template <bool kRecord>
void run_solver(int32_t algo, const Grid& g, int32_t start, int32_t goal, Trace<kRecord>& tr, Stats& st) {
  switch (algo) {
    case kBfs:
      solve_bfs<kRecord>(g, start, goal, tr, st);
      break;
    case kDfs:
      solve_dfs<kRecord>(g, start, goal, tr, st);
      break;
    case kDijkstra:
      solve_best_first<kRecord, Priority::kDijkstra>(g, start, goal, tr, st);
      break;
    case kAStar:
      solve_best_first<kRecord, Priority::kAStar>(g, start, goal, tr, st);
      break;
    case kGreedy:
      solve_best_first<kRecord, Priority::kGreedy>(g, start, goal, tr, st);
      break;
    case kBidirBfs:
      solve_bidir_bfs<kRecord>(g, start, goal, tr, st);
      break;
    case kWeightedAStar:
      solve_best_first<kRecord, Priority::kWeightedAStar>(g, start, goal, tr, st);
      break;
    default:
      break;
  }
  st.events = tr.n;
}

}  // namespace fc
