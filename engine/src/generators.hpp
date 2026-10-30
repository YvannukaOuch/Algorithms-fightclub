// Arena generators. Maze generators work on an odd lattice: rooms sit at odd
// coordinates and the walls between them at even ones, so W and H should be odd.
#pragma once

#include "common.hpp"
#include "rng.hpp"
#include "state.hpp"

namespace fc {

// Keep in sync with GENERATOR_ID in src/engine/generators.ts.
enum Gen : int32_t {
  kGenBacktracker = 0,
  kGenPrim = 1,
  kGenKruskal = 2,
  kGenDivision = 3,
  kGenCaves = 4,
  kGenOpen = 5,
  kGenDeadEnd = 6,
  kGenCount = 7,
};

struct Endpoints {
  int32_t start;
  int32_t goal;
};

namespace gen {

inline void fill(Grid& g, uint8_t v) {
  for (int32_t i = 0; i < g.size(); ++i) g.cells[i] = v;
}

inline void border(Grid& g) {
  for (int32_t x = 0; x < g.w; ++x) {
    g.cells[g.at(x, 0)] = kWall;
    g.cells[g.at(x, g.h - 1)] = kWall;
  }
  for (int32_t y = 0; y < g.h; ++y) {
    g.cells[g.at(0, y)] = kWall;
    g.cells[g.at(g.w - 1, y)] = kWall;
  }
}

// Lattice helpers: room c lives at grid (2*cx+1, 2*cy+1).
struct Lattice {
  int32_t cw;
  int32_t ch;
  int32_t count() const { return cw * ch; }
};

inline Lattice lattice_of(const Grid& g) { return {(g.w - 1) / 2, (g.h - 1) / 2}; }

inline int32_t room_cell(const Grid& g, const Lattice& l, int32_t c) {
  return g.at(2 * (c % l.cw) + 1, 2 * (c / l.cw) + 1);
}

inline void carve_room(Grid& g, const Lattice& l, int32_t c) { g.cells[room_cell(g, l, c)] = kFloor; }

inline void carve_between(Grid& g, const Lattice& l, int32_t a, int32_t b) {
  const int32_t ax = 2 * (a % l.cw) + 1, ay = 2 * (a / l.cw) + 1;
  const int32_t bx = 2 * (b % l.cw) + 1, by = 2 * (b / l.cw) + 1;
  g.cells[g.at((ax + bx) / 2, (ay + by) / 2)] = kFloor;
}

inline int lattice_neighbors(const Lattice& l, int32_t c, int32_t out[4]) {
  const int32_t cx = c % l.cw, cy = c / l.cw;
  int n = 0;
  if (cy > 0) out[n++] = c - l.cw;
  if (cx < l.cw - 1) out[n++] = c + 1;
  if (cy < l.ch - 1) out[n++] = c + l.cw;
  if (cx > 0) out[n++] = c - 1;
  return n;
}

// Recursive backtracker (iterative DFS carve): long, winding corridors.
inline void backtracker(Grid& g, Rng& rng) {
  fill(g, kWall);
  const Lattice l = lattice_of(g);
  if (l.count() <= 0) return;
  for (int32_t i = 0; i < l.count(); ++i) g_state[i] = 0;
  int32_t* stack = g_queue;
  int32_t sp = 0;
  const int32_t first = rng.below(l.count());
  g_state[first] = 1;
  carve_room(g, l, first);
  stack[sp++] = first;
  while (sp > 0) {
    const int32_t c = stack[sp - 1];
    int32_t nb[4];
    const int k = lattice_neighbors(l, c, nb);
    int32_t cand[4];
    int m = 0;
    for (int j = 0; j < k; ++j)
      if (!g_state[nb[j]]) cand[m++] = nb[j];
    if (m == 0) {
      --sp;
      continue;
    }
    const int32_t next = cand[rng.below(m)];
    g_state[next] = 1;
    carve_between(g, l, c, next);
    carve_room(g, l, next);
    stack[sp++] = next;
  }
}

// Randomized Prim's: grows from one room, many short dead ends.
inline void prim(Grid& g, Rng& rng) {
  fill(g, kWall);
  const Lattice l = lattice_of(g);
  if (l.count() <= 0) return;
  enum : uint8_t { kOut = 0, kIn = 1, kFrontier = 2 };
  for (int32_t i = 0; i < l.count(); ++i) g_state[i] = kOut;
  int32_t* frontier = g_queue;
  int32_t fn = 0;

  auto add_room = [&](int32_t c) {
    g_state[c] = kIn;
    carve_room(g, l, c);
    int32_t nb[4];
    const int k = lattice_neighbors(l, c, nb);
    for (int j = 0; j < k; ++j) {
      if (g_state[nb[j]] == kOut) {
        g_state[nb[j]] = kFrontier;
        frontier[fn++] = nb[j];
      }
    }
  };

  add_room(rng.below(l.count()));
  while (fn > 0) {
    const int32_t idx = rng.below(fn);
    const int32_t c = frontier[idx];
    frontier[idx] = frontier[--fn];
    int32_t nb[4];
    const int k = lattice_neighbors(l, c, nb);
    int32_t cand[4];
    int m = 0;
    for (int j = 0; j < k; ++j)
      if (g_state[nb[j]] == kIn) cand[m++] = nb[j];
    carve_between(g, l, c, cand[rng.below(m)]);
    add_room(c);
  }
}

// Randomized Kruskal's: shuffled walls joined through union-find.
inline void kruskal(Grid& g, Rng& rng) {
  fill(g, kWall);
  const Lattice l = lattice_of(g);
  if (l.count() <= 0) return;
  int32_t* uf = g_parent;
  for (int32_t c = 0; c < l.count(); ++c) {
    uf[c] = c;
    carve_room(g, l, c);
  }
  // Edge e = room * 2 + dir, dir 0 = east, 1 = south.
  int32_t* edges = g_queue;
  int32_t m = 0;
  for (int32_t c = 0; c < l.count(); ++c) {
    if (c % l.cw < l.cw - 1) edges[m++] = c * 2;
    if (c / l.cw < l.ch - 1) edges[m++] = c * 2 + 1;
  }
  for (int32_t i = m - 1; i > 0; --i) swap_of(edges[i], edges[rng.below(i + 1)]);

  auto find = [&](int32_t x) {
    while (uf[x] != x) {
      uf[x] = uf[uf[x]];
      x = uf[x];
    }
    return x;
  };

  for (int32_t i = 0; i < m; ++i) {
    const int32_t a = edges[i] >> 1;
    const int32_t b = (edges[i] & 1) ? a + l.cw : a + 1;
    const int32_t ra = find(a), rb = find(b);
    if (ra == rb) continue;
    uf[ra] = rb;
    carve_between(g, l, a, b);
  }
}

// Recursive division (iterative): straight walls with one gap each, so the
// arena reads as rooms and hallways rather than a tangle.
inline void division(Grid& g, Rng& rng) {
  fill(g, kFloor);
  border(g);
  const Lattice l = lattice_of(g);
  if (l.count() <= 0) return;
  int32_t* stack = g_queue;
  int32_t sp = 0;
  auto push = [&](int32_t x0, int32_t y0, int32_t x1, int32_t y1) {
    stack[sp++] = x0;
    stack[sp++] = y0;
    stack[sp++] = x1;
    stack[sp++] = y1;
  };
  push(1, 1, 2 * l.cw - 1, 2 * l.ch - 1);
  while (sp > 0) {
    const int32_t y1 = stack[--sp], x1 = stack[--sp], y0 = stack[--sp], x0 = stack[--sp];
    const int32_t rooms_w = (x1 - x0) / 2 + 1;
    const int32_t rooms_h = (y1 - y0) / 2 + 1;
    if (rooms_w < 2 && rooms_h < 2) continue;
    bool horizontal;
    if (rooms_w < 2) horizontal = true;
    else if (rooms_h < 2) horizontal = false;
    else if (rooms_h > rooms_w) horizontal = true;
    else if (rooms_w > rooms_h) horizontal = false;
    else horizontal = rng.below(2) == 0;

    if (horizontal) {
      const int32_t wy = y0 + 1 + 2 * rng.below(rooms_h - 1);
      const int32_t gx = x0 + 2 * rng.below(rooms_w);
      for (int32_t x = x0; x <= x1; ++x)
        if (x != gx) g.cells[g.at(x, wy)] = kWall;
      push(x0, y0, x1, wy - 1);
      push(x0, wy + 1, x1, y1);
    } else {
      const int32_t wx = x0 + 1 + 2 * rng.below(rooms_w - 1);
      const int32_t gy = y0 + 2 * rng.below(rooms_h);
      for (int32_t y = y0; y <= y1; ++y)
        if (y != gy) g.cells[g.at(wx, y)] = kWall;
      push(x0, y0, wx - 1, y1);
      push(wx + 1, y0, x1, y1);
    }
  }
}

inline void clear_around(Grid& g, int32_t cell, int32_t radius) {
  const int32_t cx = g.x_of(cell), cy = g.y_of(cell);
  for (int32_t y = cy - radius; y <= cy + radius; ++y)
    for (int32_t x = cx - radius; x <= cx + radius; ++x)
      if (x > 0 && y > 0 && x < g.w - 1 && y < g.h - 1) g.cells[g.at(x, y)] = kFloor;
}

// Marks every cell reachable from `from` with g_state = 1. Returns the count.
inline int32_t flood(const Grid& g, int32_t from) {
  for (int32_t i = 0; i < g.size(); ++i) g_state[i] = 0;
  int32_t* q = g_queue;
  int32_t head = 0, tail = 0;
  g_state[from] = 1;
  q[tail++] = from;
  while (head < tail) {
    const int32_t u = q[head++];
    int32_t nb[4];
    const int k = g.neighbors(u, nb);
    for (int j = 0; j < k; ++j) {
      if (g_state[nb[j]]) continue;
      g_state[nb[j]] = 1;
      q[tail++] = nb[j];
    }
  }
  return tail;
}

// Guarantees goal is reachable from start: digs a drunkard's walk from the goal,
// biased toward the start, until it touches the start's region.
inline void connect(Grid& g, Rng& rng, int32_t start, int32_t goal) {
  flood(g, start);
  if (g_state[goal]) return;
  int32_t x = g.x_of(goal), y = g.y_of(goal);
  const int32_t sx = g.x_of(start), sy = g.y_of(start);
  for (int32_t guard = 0; guard < g.size() * 4; ++guard) {
    const int32_t c = g.at(x, y);
    g.cells[c] = kFloor;
    if (g_state[c]) return;
    int32_t nb[4];
    const int k = g.neighbors(c, nb);
    for (int j = 0; j < k; ++j)
      if (g_state[nb[j]]) return;
    const int32_t dx = sx - x, dy = sy - y;
    if (rng.chance(70)) {
      if (abs_of(dx) >= abs_of(dy)) x += dx > 0 ? 1 : -1;
      else y += dy > 0 ? 1 : -1;
    } else {
      const int dir = rng.below(4);
      x += dir == 1 ? 1 : dir == 3 ? -1 : 0;
      y += dir == 2 ? 1 : dir == 0 ? -1 : 0;
    }
    x = max_of<int32_t>(1, min_of<int32_t>(g.w - 2, x));
    y = max_of<int32_t>(1, min_of<int32_t>(g.h - 2, y));
  }
}

// Cellular-automaton caves: noise smoothed by the 4-5 rule into organic chambers.
inline void caves(Grid& g, Rng& rng) {
  for (int32_t i = 0; i < g.size(); ++i) g.cells[i] = rng.chance(45) ? kWall : kFloor;
  border(g);
  uint8_t* src = g.cells;
  uint8_t* dst = g_scratch;
  for (int pass = 0; pass < 4; ++pass) {
    for (int32_t y = 0; y < g.h; ++y) {
      for (int32_t x = 0; x < g.w; ++x) {
        int walls = 0;
        for (int32_t dy = -1; dy <= 1; ++dy)
          for (int32_t dx = -1; dx <= 1; ++dx) {
            const int32_t nx = x + dx, ny = y + dy;
            if (!g.in_bounds(nx, ny) || src[g.at(nx, ny)] == kWall) ++walls;
          }
        dst[g.at(x, y)] = walls >= 5 ? kWall : kFloor;
      }
    }
    swap_of(src, dst);
  }
  if (src != g.cells)
    for (int32_t i = 0; i < g.size(); ++i) g.cells[i] = src[i];
  border(g);
}

// Open floor, endpoints off the corners so no search gets a free straight run
// along the border.
inline Endpoints open_floor(Grid& g) {
  fill(g, kFloor);
  border(g);
  const int32_t mid = g.h / 2;
  return {g.at(g.w / 5, mid), g.at(g.w - 1 - g.w / 5, mid)};
}

// Open floor with a cup-shaped wall around the start, mouth facing away from
// the goal. Every heuristic search charges into the cup and has to flood it
// before it finds the way out; blind searches don't care.
inline Endpoints dead_end(Grid& g) {
  fill(g, kFloor);
  border(g);
  const int32_t top = g.h / 4;
  const int32_t bottom = g.h - 1 - g.h / 4;
  const int32_t right = g.w / 2;
  const int32_t left = max_of<int32_t>(2, g.w / 8);
  for (int32_t y = top; y <= bottom; ++y) g.cells[g.at(right, y)] = kWall;
  for (int32_t x = left; x <= right; ++x) {
    g.cells[g.at(x, top)] = kWall;
    g.cells[g.at(x, bottom)] = kWall;
  }
  const int32_t mid = g.h / 2;
  return {g.at(max_of<int32_t>(left + 2, right - g.w / 6), mid), g.at(g.w - 2, mid)};
}

// Knocks out a share of the walls that separate two corridors, turning a perfect
// maze (exactly one route) into one with loops, so path quality starts to differ.
inline void braid(Grid& g, Rng& rng, int32_t percent) {
  if (percent <= 0) return;
  for (int32_t y = 1; y < g.h - 1; ++y) {
    for (int32_t x = 1; x < g.w - 1; ++x) {
      const int32_t c = g.at(x, y);
      if (g.cells[c] != kWall || ((x + y) & 1) == 0) continue;
      const bool horiz = g.cells[c - 1] != kWall && g.cells[c + 1] != kWall;
      const bool vert = g.cells[c - g.w] != kWall && g.cells[c + g.w] != kWall;
      if ((horiz || vert) && rng.chance(percent)) g.cells[c] = kFloor;
    }
  }
}

inline float smooth01(float t) { return t * t * (3.0f - 2.0f * t); }

// Value noise, sampled on a coarse lattice and smoothly interpolated.
inline float value_noise(int32_t x, int32_t y, int32_t spacing, int32_t lw, int32_t offset) {
  const float fx = static_cast<float>(x) / static_cast<float>(spacing);
  const float fy = static_cast<float>(y) / static_cast<float>(spacing);
  const int32_t ix = static_cast<int32_t>(fx), iy = static_cast<int32_t>(fy);
  const float tx = smooth01(fx - static_cast<float>(ix));
  const float ty = smooth01(fy - static_cast<float>(iy));
  const float* L = g_lattice + offset;
  const float a = L[iy * lw + ix], b = L[iy * lw + ix + 1];
  const float c = L[(iy + 1) * lw + ix], d = L[(iy + 1) * lw + ix + 1];
  const float top = a + (b - a) * tx;
  const float bot = c + (d - c) * tx;
  return top + (bot - top) * ty;
}

// Scatters mud in organic patches covering roughly `percent` of the open floor.
inline void mud(Grid& g, Rng& rng, int32_t percent, int32_t start, int32_t goal) {
  if (percent <= 0) return;
  const int32_t s1 = max_of<int32_t>(4, min_of(g.w, g.h) / 5);
  const int32_t s2 = max_of<int32_t>(2, s1 / 2);
  const int32_t lw1 = g.w / s1 + 2, lh1 = g.h / s1 + 2;
  const int32_t lw2 = g.w / s2 + 2, lh2 = g.h / s2 + 2;
  const int32_t off2 = lw1 * lh1;
  if (off2 + lw2 * lh2 > kLatticeCap) return;
  for (int32_t i = 0; i < off2 + lw2 * lh2; ++i) g_lattice[i] = rng.unit();

  int32_t hist[256];
  for (int i = 0; i < 256; ++i) hist[i] = 0;
  int32_t open = 0;
  for (int32_t y = 0; y < g.h; ++y) {
    for (int32_t x = 0; x < g.w; ++x) {
      const int32_t c = g.at(x, y);
      if (g.cells[c] != kFloor || c == start || c == goal) continue;
      const float n = value_noise(x, y, s1, lw1, 0) * 0.68f + value_noise(x, y, s2, lw2, off2) * 0.32f;
      const int32_t q = min_of<int32_t>(255, static_cast<int32_t>(n * 256.0f));
      g_scratch[c] = static_cast<uint8_t>(q);
      ++hist[q];
      ++open;
    }
  }
  const int32_t target = open * percent / 100;
  int32_t threshold = 256;
  for (int32_t acc = 0; threshold > 0 && acc < target;) acc += hist[--threshold];
  for (int32_t c = 0; c < g.size(); ++c) {
    if (g.cells[c] != kFloor || c == start || c == goal) continue;
    if (g_scratch[c] >= threshold) g.cells[c] = kMud;
  }
}

// The last room coordinate along an axis of length n.
inline int32_t last_room(int32_t n) { return 2 * ((n - 1) / 2) - 1; }

}  // namespace gen

inline Endpoints generate(Grid& g, int32_t which, uint32_t seed, int32_t loops, int32_t mud_percent) {
  Rng rng(seed);
  Endpoints e{g.at(1, 1), g.at(gen::last_room(g.w), gen::last_room(g.h))};
  bool maze = true;
  switch (which) {
    case kGenBacktracker:
      gen::backtracker(g, rng);
      break;
    case kGenPrim:
      gen::prim(g, rng);
      break;
    case kGenKruskal:
      gen::kruskal(g, rng);
      break;
    case kGenDivision:
      gen::division(g, rng);
      break;
    case kGenCaves:
      maze = false;
      gen::caves(g, rng);
      gen::clear_around(g, e.start, 1);
      gen::clear_around(g, e.goal, 1);
      gen::connect(g, rng, e.start, e.goal);
      break;
    case kGenOpen:
      maze = false;
      e = gen::open_floor(g);
      break;
    case kGenDeadEnd:
      maze = false;
      e = gen::dead_end(g);
      break;
    default:
      break;
  }
  if (maze) gen::braid(g, rng, loops);
  g.cells[e.start] = kFloor;
  g.cells[e.goal] = kFloor;
  gen::mud(g, rng, mud_percent, e.start, e.goal);
  return e;
}

}  // namespace fc
