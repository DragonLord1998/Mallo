struct SceneUniforms {
  viewProj : mat4x4<f32>;
  lightDir : vec4<f32>;
  cameraPos : vec4<f32>;
};

@group(0) @binding(0) var<uniform> scene : SceneUniforms;

struct VSOutput {
  @builtin(position) position : vec4<f32>;
  @location(0) worldPos : vec3<f32>;
  @location(1) normal : vec3<f32>;
  @location(2) color : vec3<f32>;
};

@vertex
fn vs_main(
  @location(0) position : vec3<f32>,
  @location(1) normal : vec3<f32>,
  @location(2) m0 : vec4<f32>,
  @location(3) m1 : vec4<f32>,
  @location(4) m2 : vec4<f32>,
  @location(5) m3 : vec4<f32>,
  @location(6) color : vec3<f32>,
) -> VSOutput {
  let model = mat4x4<f32>(m0, m1, m2, m3);
  let world = model * vec4<f32>(position, 1.0);
  let nrm = normalize((model * vec4<f32>(normal, 0.0)).xyz);
  var output : VSOutput;
  output.position = scene.viewProj * world;
  output.worldPos = world.xyz;
  output.normal = nrm;
  output.color = color;
  return output;
}

@fragment
fn fs_main(input : VSOutput) -> @location(0) vec4<f32> {
  let lightDir = normalize(scene.lightDir.xyz);
  let normal = normalize(input.normal);
  let diffuse = max(dot(normal, -lightDir), 0.0);
  let base = input.color * (0.1 + 0.9 * diffuse);
  let viewDir = normalize(scene.cameraPos.xyz - input.worldPos);
  let halfVec = normalize(-lightDir + viewDir);
  let spec = pow(max(dot(normal, halfVec), 0.0), 32.0);
  let color = base + vec3<f32>(spec * 0.25);
  return vec4<f32>(pow(color, vec3<f32>(1.0 / 2.2)), 1.0);
}
