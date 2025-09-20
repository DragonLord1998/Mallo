export async function createWebGPUContext(canvas) {
  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: 'high-performance',
  });
  if (!adapter) {
    throw new Error('Failed to acquire WebGPU adapter.');
  }

  const device = await adapter.requestDevice();
  const context = canvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();

  context.configure({
    device,
    format,
    alphaMode: 'opaque',
  });

  return { adapter, device, context, format };
}

export function resizeCanvasToDisplaySize(
  canvas,
  context,
  device,
  format,
  devicePixelRatio = window.devicePixelRatio ?? 1,
) {
  const width = Math.floor(canvas.clientWidth * devicePixelRatio);
  const height = Math.floor(canvas.clientHeight * devicePixelRatio);

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    context.configure({
      device,
      format,
      alphaMode: 'opaque',
    });
  }
}
