// PCG32 (O'Neill, pcg-random.org). Small, fast, and identical on every platform,
// so a seed in a shared link reproduces the exact same arena.
#pragma once

#include "common.hpp"

namespace fc {

struct Rng {
  uint64_t state = 0;
  uint64_t inc = 0;

  explicit Rng(uint32_t seed) {
    inc = (static_cast<uint64_t>(seed) << 1u) | 1u;
    next();
    state += 0x853c49e6748fea9bULL ^ (static_cast<uint64_t>(seed) * 0x9e3779b97f4a7c15ULL);
    next();
  }

  uint32_t next() {
    const uint64_t old = state;
    state = old * 6364136223846793005ULL + inc;
    const uint32_t xorshifted = static_cast<uint32_t>(((old >> 18u) ^ old) >> 27u);
    const uint32_t rot = static_cast<uint32_t>(old >> 59u);
    return (xorshifted >> rot) | (xorshifted << ((32u - rot) & 31u));
  }

  // Uniform in [0, n). Lemire's multiply-shift; the bias is negligible for n << 2^32.
  int32_t below(int32_t n) {
    return static_cast<int32_t>((static_cast<uint64_t>(next()) * static_cast<uint32_t>(n)) >> 32);
  }

  // Uniform in [0, 1).
  float unit() { return static_cast<float>(next() >> 8) * (1.0f / 16777216.0f); }

  bool chance(int32_t percent) { return below(100) < percent; }
};

}  // namespace fc
