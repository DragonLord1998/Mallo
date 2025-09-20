struct SceneUniforms {
  invViewProj : mat4x4<f32>,
  cameraPos : vec3<f32>,
  frameIndex : u32,
  lightDir : vec3<f32>,
  objectCount : u32,
  resolution : vec2<f32>,
  maxBounces : u32,
  environment : f32,
};

struct Box {
  min : vec3<f32>,
  _pad0 : f32,
  max : vec3<f32>,
  _pad1 : f32,
  color : vec3<f32>,
  emission : f32,
};

struct HitInfo {
  distance : f32,
  normal : vec3<f32>,
  color : vec3<f32>,
  emission : f32,
  hit : bool,
};

@group(0) @binding(0) var<uniform> scene : SceneUniforms;
@group(0) @binding(1) var<storage, read> boxes : array<Box>;
@group(0) @binding(2) var previousTexture : texture_2d<f32>;
@group(0) @binding(3) var outputTexture : texture_storage_2d<rgba16float, write>;

const PI = 3.141592653589793;

fn safeInv(v : f32) -> f32 {
  if (abs(v) < 1e-4) {
    if (v >= 0.0) {
      return 1e4;
    }
    return -1e4;
  }
  return 1.0 / v;
}

struct Intersection {
  hit : bool,
  distance : f32,
  normal : vec3<f32>,
};

fn intersectBox(origin : vec3<f32>, dir : vec3<f32>, minB : vec3<f32>, maxB : vec3<f32>) -> Intersection {
  let invDir = vec3<f32>(safeInv(dir.x), safeInv(dir.y), safeInv(dir.z));

  var tx1 = (minB.x - origin.x) * invDir.x;
  var tx2 = (maxB.x - origin.x) * invDir.x;
  var nx = vec3<f32>(-1.0, 0.0, 0.0);
  if (tx1 > tx2) {
    let tmp = tx1;
    tx1 = tx2;
    tx2 = tmp;
    nx = vec3<f32>(1.0, 0.0, 0.0);
  }

  var tNear = tx1;
  var tFar = tx2;
  var normal = nx;

  var ty1 = (minB.y - origin.y) * invDir.y;
  var ty2 = (maxB.y - origin.y) * invDir.y;
  var ny = vec3<f32>(0.0, -1.0, 0.0);
  if (ty1 > ty2) {
    let tmp = ty1;
    ty1 = ty2;
    ty2 = tmp;
    ny = vec3<f32>(0.0, 1.0, 0.0);
  }

  if (ty1 > tNear) {
    tNear = ty1;
    normal = ny;
  }
  if (ty2 < tFar) {
    tFar = ty2;
  }
  if (tNear > tFar) {
    return Intersection(false, 0.0, vec3<f32>(0.0));
  }

  var tz1 = (minB.z - origin.z) * invDir.z;
  var tz2 = (maxB.z - origin.z) * invDir.z;
  var nz = vec3<f32>(0.0, 0.0, -1.0);
  if (tz1 > tz2) {
    let tmp = tz1;
    tz1 = tz2;
    tz2 = tmp;
    nz = vec3<f32>(0.0, 0.0, 1.0);
  }

  if (tz1 > tNear) {
    tNear = tz1;
    normal = nz;
  }
  if (tz2 < tFar) {
    tFar = tz2;
  }
  if (tNear > tFar) {
    return Intersection(false, 0.0, vec3<f32>(0.0));
  }

  if (tFar < 0.0) {
    return Intersection(false, 0.0, vec3<f32>(0.0));
  }

  if (tNear < 1e-3) {
    if (tFar < 1e-3) {
      return Intersection(false, 0.0, vec3<f32>(0.0));
    }
    tNear = tFar;
    normal = -normal;
  }

  return Intersection(true, tNear, normal);
}

fn hash(seed : u32) -> u32 {
  var value = seed;
  value ^= value << 13u;
  value ^= value >> 17u;
  value ^= value << 5u;
  return value;
}

fn nextFloat(seed : ptr<function, u32>) -> f32 {
  let state = hash(*seed * 1664525u + 1013904223u);
  *seed = state;
  return f32(state & 0x00FFFFFFu) / f32(0x01000000u);
}

fn buildBasis(normal : vec3<f32>) -> mat3x3<f32> {
  var up = vec3<f32>(0.0, 1.0, 0.0);
  if (abs(normal.y) > 0.999) {
    up = vec3<f32>(0.0, 0.0, 1.0);
  }
  let tangent = normalize(cross(up, normal));
  let bitangent = cross(normal, tangent);
  return mat3x3<f32>(tangent, bitangent, normal);
}

fn cosineHemisphere(normal : vec3<f32>, seed : ptr<function, u32>) -> vec3<f32> {
  let r1 = nextFloat(seed);
  let r2 = nextFloat(seed);
  let phi = 2.0 * PI * r1;
  let r = sqrt(r2);
  let x = cos(phi) * r;
  let y = sin(phi) * r;
  let z = sqrt(max(0.0, 1.0 - r2));
  let localDir = vec3<f32>(x, y, z);
  let basis = buildBasis(normal);
  return normalize(basis * localDir);
}

fn trace(origin : vec3<f32>, dir : vec3<f32>) -> HitInfo {
  var closest = HitInfo(0.0, vec3<f32>(0.0), vec3<f32>(0.0), 0.0, false);
  var minDistance = 1e30;
  for (var i = 0u; i < scene.objectCount; i = i + 1u) {
    let box = boxes[i];
    let result = intersectBox(origin, dir, box.min, box.max);
    if (result.hit && result.distance < minDistance) {
      minDistance = result.distance;
      closest = HitInfo(result.distance, result.normal, box.color, box.emission, true);
    }
  }
  return closest;
}

fn occluded(origin : vec3<f32>, dir : vec3<f32>) -> bool {
  for (var i = 0u; i < scene.objectCount; i = i + 1u) {
    let box = boxes[i];
    let result = intersectBox(origin, dir, box.min, box.max);
    if (result.hit) {
      return true;
    }
  }
  return false;
}

fn environmentRadiance(dir : vec3<f32>) -> vec3<f32> {
  let sky = vec3<f32>(0.55, 0.62, 0.78);
  let ground = vec3<f32>(0.2, 0.18, 0.15);
  let t = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
  return (ground * (1.0 - t) + sky * t) * scene.environment;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) globalId : vec3<u32>) {
  let width = u32(scene.resolution.x);
  let height = u32(scene.resolution.y);
  if (globalId.x >= width || globalId.y >= height) {
    return;
  }

  var seed = (globalId.y * 1973u) ^ (globalId.x * 9277u) ^ (scene.frameIndex * 26699u) ^ 0x9E3779B9u;

  let jitter = vec2<f32>(nextFloat(&seed), nextFloat(&seed));
  let pixel = vec2<f32>(f32(globalId.x), f32(globalId.y)) + jitter;
  let resolution = scene.resolution;
  let uv = vec2<f32>(pixel.x / resolution.x, pixel.y / resolution.y);
  let ndc = vec2<f32>(uv.x * 2.0 - 1.0, uv.y * 2.0 - 1.0);

  let farPoint4 = scene.invViewProj * vec4<f32>(ndc, 1.0, 1.0);
  let farPoint = farPoint4.xyz / farPoint4.w;

  var origin = scene.cameraPos;
  var direction = normalize(farPoint - origin);

  // Offset the ray a little forward to avoid self-intersections with the near plane.
  origin += direction * 0.01;

  var throughput = vec3<f32>(1.0);
  var radiance = vec3<f32>(0.0);

  for (var bounce = 0u; bounce < scene.maxBounces; bounce = bounce + 1u) {
    let hit = trace(origin, direction);
    if (!hit.hit) {
      radiance += throughput * environmentRadiance(direction);
      break;
    }

    let hitPoint = origin + direction * hit.distance;
    let normal = hit.normal;

    if (hit.emission > 0.0) {
      radiance += throughput * hit.color * hit.emission;
    }

    let lightDir = normalize(-scene.lightDir);
    let ndotl = dot(normal, lightDir);
    if (ndotl > 0.0) {
      let offsetPoint = hitPoint + normal * 0.01;
      if (!occluded(offsetPoint, lightDir)) {
        let sunColor = vec3<f32>(1.0, 0.96, 0.85) * 3.5;
        radiance += throughput * hit.color * ndotl * sunColor;
      }
    }

    throughput *= hit.color;
    throughput = clamp(throughput, vec3<f32>(0.0), vec3<f32>(10.0));

    if (bounce > 2u) {
      let p = clamp(max(max(throughput.x, throughput.y), throughput.z), 0.05, 0.95);
      if (nextFloat(&seed) > p) {
        break;
      }
      throughput /= p;
    }

    origin = hitPoint + normal * 0.01;
    direction = cosineHemisphere(normal, &seed);
  }

  var previous = vec3<f32>(0.0);
  if (scene.frameIndex > 0u) {
    previous = textureLoad(previousTexture, vec2<i32>(globalId.xy), 0).xyz;
  }

  let frameCount = f32(scene.frameIndex) + 1.0;
  let accum = (previous * f32(scene.frameIndex) + radiance) / frameCount;

  textureStore(outputTexture, vec2<i32>(globalId.xy), vec4<f32>(accum, 1.0));
}
