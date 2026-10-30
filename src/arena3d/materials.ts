import {
  AdditiveBlending,
  Color,
  DoubleSide,
  MeshStandardMaterial,
  ShaderMaterial,
  Vector2,
  type IUniform,
} from 'three'

// The shader reads tile states and kinds as defined in ./tiles.ts.
export interface TileUniforms {
  [name: string]: IUniform
  uPlayTime: IUniform<number>
  uBuild: IUniform<number>
  uGrid: IUniform<Vector2>
  uHover: IUniform<Vector2>
  uColor: IUniform<Color>
  uColorB: IUniform<Color>
  uBase: IUniform<Color>
  uMud: IUniform<Color>
  uGlowScale: IUniform<number>
  uMotion: IUniform<number>
  /** Colour the path is lifted toward: white on the dark venue, ink on light. */
  uPathMix: IUniform<Color>
  uPathAmount: IUniform<number>
}

const TILE_VERTEX_PARS = /* glsl */ `
attribute float aKind;
attribute float aState;
attribute float aT0;
attribute float aOrder;
uniform float uPlayTime;
uniform float uBuild;
uniform vec2 uGrid;
uniform vec2 uHover;
uniform vec3 uColor;
uniform vec3 uColorB;
uniform vec3 uBase;
uniform vec3 uMud;
uniform float uGlowScale;
uniform float uMotion;
uniform vec3 uPathMix;
uniform float uPathAmount;
varying vec3 vTint;
varying float vGlow;
varying vec2 vBoxUv;
varying float vTop;
varying float vMud;
`

const TILE_VERTEX_MAIN = /* glsl */ `
float fcId = float(gl_InstanceID);
float fcX = mod(fcId, uGrid.x);
float fcY = floor(fcId / uGrid.x);
float fcIsMud = step(0.5, aKind) * step(aKind, 1.5);
float fcHidden = step(1.5, aKind);
float fcAge = max(uPlayTime - aT0, 0.0);
vec3 fcBase = mix(uBase, uMud, fcIsMud);
vec3 fcTint = fcBase;
float fcGlow = 0.0;
float fcLift = 0.0;
int fcState = int(aState + 0.5);
if (fcState == 1 || fcState == 4) {
  // Frontier: pale, raised, pulsing when fresh.
  vec3 c = fcState == 1 ? uColor : uColorB;
  float fresh = exp(-fcAge * 5.0);
  fcTint = mix(mix(fcBase, c, 0.45), vec3(1.0), 0.16);
  fcGlow = 0.2 + 0.55 * fresh;
  fcLift = 0.09 + 0.07 * fresh * uMotion;
} else if (fcState == 2 || fcState == 5) {
  // Expanded: flashes hot, pops up, then settles into the fighter's colour.
  // Later expansions settle brighter, so the finished board shows the order.
  vec3 c = fcState == 2 ? uColor : uColorB;
  float fresh = exp(-fcAge * 3.2);
  vec3 settled = c * (0.5 + 0.5 * aOrder);
  settled = mix(settled, settled * 0.7, fcIsMud);
  fcTint = mix(settled, mix(c, vec3(1.0), 0.6), fresh);
  fcGlow = 0.1 + 1.5 * fresh;
  fcLift = 0.02 + 0.32 * exp(-fcAge * 6.5) * uMotion;
} else if (fcState == 3) {
  // Path: lifted and lit in the fighter's colour; the tube above carries the glow.
  float fresh = exp(-fcAge * 2.2);
  fcTint = mix(uColor, uPathMix, uPathAmount);
  fcGlow = 0.28 + 0.6 * fresh;
  fcLift = 0.14 + 0.12 * fresh * uMotion;
}
float fcHover = (1.0 - step(0.5, abs(fcX - uHover.x))) * (1.0 - step(0.5, abs(fcY - uHover.y)));
fcTint = mix(fcTint, vec3(1.0), 0.32 * fcHover);
fcGlow += 0.3 * fcHover;
fcLift += 0.08 * fcHover;
// Intro: tiles rise into place in a wave that starts at the top-left corner.
float fcDelay = (fcX + fcY) / (uGrid.x + uGrid.y) * 0.85;
float fcRise = clamp((uBuild - fcDelay) / 0.5, 0.0, 1.0);
fcRise = 1.0 - pow(1.0 - fcRise, 3.0);
transformed *= 1.0 - fcHidden;
transformed.y += (fcLift - 0.07 * fcIsMud) * (1.0 - fcHidden) - (1.0 - fcRise) * 2.5;
vTint = fcTint;
vGlow = fcGlow * uGlowScale;
vBoxUv = uv;
vTop = normal.y;
vMud = fcIsMud;
`

const TILE_FRAGMENT_PARS = /* glsl */ `
varying vec3 vTint;
varying float vGlow;
varying vec2 vBoxUv;
varying float vTop;
varying float vMud;
`

const TILE_FRAGMENT_COLOR = /* glsl */ `
float fcEdge = min(min(vBoxUv.x, 1.0 - vBoxUv.x), min(vBoxUv.y, 1.0 - vBoxUv.y));
float fcBevel = mix(0.78, 1.0, smoothstep(0.0, 0.09, fcEdge));
diffuseColor.rgb = vTint * (vTop > 0.5 ? fcBevel : 0.66);
`

export function createTileMaterial(uniforms: TileUniforms): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ roughness: 0.62, metalness: 0 })
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${TILE_VERTEX_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${TILE_VERTEX_MAIN}`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${TILE_FRAGMENT_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${TILE_FRAGMENT_COLOR}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.3, vMud);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vTint * vGlow;')
  }
  // Every ring shares one compiled program; only uniform values differ.
  material.customProgramCacheKey = () => 'fc-tile'
  return material
}

export interface WallUniforms {
  [name: string]: IUniform
  uWallBuild: IUniform<number>
  uWallTop: IUniform<Color>
  uWallSide: IUniform<Color>
}

const WALL_VERTEX_PARS = /* glsl */ `
attribute float aDelay;
uniform float uWallBuild;
varying vec2 vBoxUv;
varying float vTop;
`

// Walls grow out of the floor with a slight overshoot (ease-out-back).
const WALL_VERTEX_MAIN = /* glsl */ `
float wT = clamp((uWallBuild - aDelay) / 0.42, 0.0, 1.0);
float wU = wT - 1.0;
float wS = 1.0 + 2.70158 * wU * wU * wU + 1.70158 * wU * wU;
transformed.y = (transformed.y + 0.5) * max(wS, 0.0) - 0.5;
vBoxUv = uv;
vTop = normal.y;
`

const WALL_FRAGMENT_PARS = /* glsl */ `
uniform vec3 uWallTop;
uniform vec3 uWallSide;
varying vec2 vBoxUv;
varying float vTop;
`

const WALL_FRAGMENT_COLOR = /* glsl */ `
float wEdge = min(min(vBoxUv.x, 1.0 - vBoxUv.x), min(vBoxUv.y, 1.0 - vBoxUv.y));
diffuseColor.rgb = vTop > 0.5 ? uWallTop * mix(0.82, 1.0, smoothstep(0.0, 0.07, wEdge)) : uWallSide;
`

export function createWallMaterial(uniforms: WallUniforms): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ roughness: 0.5, metalness: 0.05 })
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${WALL_VERTEX_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${WALL_VERTEX_MAIN}`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${WALL_FRAGMENT_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${WALL_FRAGMENT_COLOR}`)
  }
  material.customProgramCacheKey = () => 'fc-wall'
  return material
}

/** Soft additive light cone: the haze under each ring's overhead light. */
export function createBeamMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color('#ffe9c7') },
      uOpacity: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying float vH;
      varying vec3 vN;
      varying vec3 vView;
      void main() {
        vH = uv.y;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vH;
      varying vec3 vN;
      varying vec3 vView;
      void main() {
        float facing = pow(abs(dot(normalize(vN), normalize(vView))), 2.2);
        float fade = smoothstep(0.0, 0.5, vH) * mix(0.45, 1.0, vH);
        gl_FragColor = vec4(uColor * uOpacity * facing * fade, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  })
}

/** Slow-drifting dust motes caught in the light. */
export function createDustMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uHeight: { value: 10 },
      uColor: { value: new Color('#ffe2b0') },
      uOpacity: { value: 0.5 },
      uScale: { value: 1 },
    },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      uniform float uHeight;
      uniform float uScale;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        p.y = mod(p.y + uTime * (0.08 + 0.12 * aSeed), uHeight);
        p.x += sin(uTime * 0.21 + aSeed * 40.0) * 0.6;
        p.z += cos(uTime * 0.17 + aSeed * 23.0) * 0.6;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uScale * (1.4 + 2.2 * aSeed) * (60.0 / -mv.z);
        vAlpha = smoothstep(0.0, 1.5, p.y) * (1.0 - smoothstep(uHeight - 3.0, uHeight, p.y));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vAlpha * uOpacity;
        gl_FragColor = vec4(uColor * a, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  })
}
