struct VertexOutput {
  @builtin(position) position : vec4<f32>;
  @location(0) uv : vec2<f32>;
};

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex : u32) -> VertexOutput {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0)
  );

  let pos = positions[vertexIndex];
  var output : VertexOutput;
  output.position = vec4<f32>(pos, 0.0, 1.0);
  output.uv = pos * 0.5 + vec2<f32>(0.5, 0.5);
  return output;
}

@group(0) @binding(0) var imageSampler : sampler;
@group(0) @binding(1) var imageTexture : texture_2d<f32>;

@fragment
fn fs_main(input : VertexOutput) -> @location(0) vec4<f32> {
  let color = textureSample(imageTexture, imageSampler, input.uv);
  let mapped = pow(color.rgb, vec3<f32>(1.0 / 2.2));
  return vec4<f32>(mapped, 1.0);
}
