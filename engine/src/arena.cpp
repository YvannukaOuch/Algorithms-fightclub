// Fight Club engine: the WebAssembly surface.
//
// Built as a single translation unit (everything else is header-only), with no
// imports. JavaScript writes the grid into fc_cells_ptr(), calls fc_solve(), and
// reads the trace and stats straight out of linear memory.

#include "common.hpp"
#include "generators.hpp"
#include "solvers.hpp"
#include "state.hpp"
#include "trace.hpp"

using namespace fc;

// Freestanding builds have no libc. With -mbulk-memory the compiler lowers these
// to memory.fill / memory.copy anyway; the definitions are a safety net.
extern "C" {
void* memset(void* dst, int value, size_t n) {
  auto* d = static_cast<unsigned char*>(dst);
  while (n--) *d++ = static_cast<unsigned char>(value);
  return dst;
}
void* memcpy(void* dst, const void* src, size_t n) {
  auto* d = static_cast<unsigned char*>(dst);
  const auto* s = static_cast<const unsigned char*>(src);
  while (n--) *d++ = *s++;
  return dst;
}
void* memmove(void* dst, const void* src, size_t n) {
  auto* d = static_cast<unsigned char*>(dst);
  const auto* s = static_cast<const unsigned char*>(src);
  if (d < s) {
    while (n--) *d++ = *s++;
  } else {
    d += n;
    s += n;
    while (n--) *--d = *--s;
  }
  return dst;
}
}

namespace {

enum Error : int32_t {
  kErrSize = -1,
  kErrArg = -2,
  kErrEndpoint = -3,
  kErrBlocked = -4,
  kErrOverflow = -5,
};

bool make_grid(int32_t w, int32_t h, Grid& g) {
  if (w < 3 || h < 3 || w > kMaxDim || h > kMaxDim) return false;
  g.w = w;
  g.h = h;
  g.cells = g_cells;
  return true;
}

void publish(const Stats& st) {
  g_stats[0] = st.found;
  g_stats[1] = st.expanded;
  g_stats[2] = st.discovered;
  g_stats[3] = st.max_frontier;
  g_stats[4] = st.path_len;
  g_stats[5] = st.path_cost;
  g_stats[6] = st.events;
  g_stats[7] = st.updates;
}

int32_t check_endpoints(const Grid& g, int32_t start, int32_t goal) {
  if (start < 0 || goal < 0 || start >= g.size() || goal >= g.size()) return kErrEndpoint;
  if (!g.passable(start) || !g.passable(goal)) return kErrBlocked;
  return 0;
}

}  // namespace

FC_EXPORT(fc_version) int32_t fc_version() { return 1; }
FC_EXPORT(fc_max_dim) int32_t fc_max_dim() { return kMaxDim; }
FC_EXPORT(fc_max_events) int32_t fc_max_events() { return kMaxEvents; }

FC_EXPORT(fc_cells_ptr) uint8_t* fc_cells_ptr() { return g_cells; }
FC_EXPORT(fc_events_ptr) uint32_t* fc_events_ptr() { return g_events; }
FC_EXPORT(fc_stats_ptr) int32_t* fc_stats_ptr() { return g_stats; }
FC_EXPORT(fc_path_ptr) int32_t* fc_path_ptr() { return g_path; }
FC_EXPORT(fc_meta_ptr) int32_t* fc_meta_ptr() { return g_meta; }

// Writes a fresh arena into the cell buffer and its endpoints into meta[0..1].
FC_EXPORT(fc_generate)
int32_t fc_generate(int32_t which, int32_t w, int32_t h, uint32_t seed, int32_t loops, int32_t mud) {
  Grid g;
  if (!make_grid(w, h, g)) return kErrSize;
  if (which < 0 || which >= kGenCount) return kErrArg;
  const Endpoints e = generate(g, which, seed, max_of(0, min_of(100, loops)), max_of(0, min_of(100, mud)));
  g_meta[0] = e.start;
  g_meta[1] = e.goal;
  return 0;
}

// Runs one solver over the cell buffer. With record != 0 the full event trace is
// written to the event buffer. Returns the event count, or a negative error.
FC_EXPORT(fc_solve)
int32_t fc_solve(int32_t algo, int32_t w, int32_t h, int32_t start, int32_t goal, int32_t record) {
  Grid g;
  if (!make_grid(w, h, g)) return kErrSize;
  if (algo < 0 || algo >= kAlgoCount) return kErrArg;
  if (const int32_t err = check_endpoints(g, start, goal)) return err;
  Stats st{};
  if (record) {
    Trace<true> tr{g_events, 0, kMaxEvents, false};
    run_solver<true>(algo, g, start, goal, tr, st);
    if (tr.overflow) return kErrOverflow;
  } else {
    Trace<false> tr{};
    run_solver<false>(algo, g, start, goal, tr, st);
  }
  publish(st);
  return st.events;
}

// Runs the untraced solver `reps` times back to back. JavaScript times the call;
// the returned checksum keeps the work observable so nothing is optimised away.
FC_EXPORT(fc_bench)
int32_t fc_bench(int32_t algo, int32_t w, int32_t h, int32_t start, int32_t goal, int32_t reps) {
  Grid g;
  if (!make_grid(w, h, g)) return kErrSize;
  if (algo < 0 || algo >= kAlgoCount) return kErrArg;
  if (const int32_t err = check_endpoints(g, start, goal)) return err;
  int32_t checksum = 0;
  for (int32_t r = 0; r < reps; ++r) {
    Stats st{};
    Trace<false> tr{};
    run_solver<false>(algo, g, start, goal, tr, st);
    checksum += st.expanded + st.path_cost;
  }
  return checksum;
}

// Number of open cells reachable from `start`.
FC_EXPORT(fc_reachable) int32_t fc_reachable(int32_t w, int32_t h, int32_t start) {
  Grid g;
  if (!make_grid(w, h, g)) return kErrSize;
  if (start < 0 || start >= g.size()) return kErrEndpoint;
  if (!g.passable(start)) return 0;
  return gen::flood(g, start);
}
