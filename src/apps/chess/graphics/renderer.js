import { createCubeGeometry } from './geometry.js';

const INSTANCE_FLOATS = 19;
const INSTANCE_STRIDE = INSTANCE_FLOATS * 4;

function createBuffer(device, data, usage) {
  const buffer = device.createBuffer({
    size: data.byteLength,
    usage,
    mappedAtCreation: true,
  });
  new Float32Array(buffer.getMappedRange()).set(data);
  buffer.unmap();
  return buffer;
}

function ensureInstanceBuffer(device, info, instanceCount) {
  const requiredSize = Math.max(1, instanceCount) * INSTANCE_STRIDE;
  if (!info.buffer || info.capacity < requiredSize) {
    info.buffer?.destroy?.();
    info.buffer = device.createBuffer({
      size: requiredSize,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    info.capacity = requiredSize;
  }
  info.count = instanceCount;
}

function packInstances(instances) {
  const data = new Float32Array(instances.length * INSTANCE_FLOATS);
  let offset = 0;
  for (const instance of instances) {
    data.set(instance.matrix, offset);
    offset += 16;
    const color = instance.color ?? [1, 1, 1];
    data.set(color, offset);
    offset += 3;
  }
  return data;
}

export class Renderer {
  constructor({ device, context, format, canvas }) {
    this.device = device;
    this.context = context;
    this.format = format;
    this.canvas = canvas;

    this.sceneUniformBuffer = null;
    this.sceneBindGroup = null;
    this.pipeline = null;

    this.vertexBuffer = null;
    this.vertexCount = 0;

    this.boardInstances = { buffer: null, capacity: 0, count: 0 };
    this.highlightInstances = { buffer: null, capacity: 0, count: 0 };
    this.pieceInstances = { buffer: null, capacity: 0, count: 0 };

    this.sceneUniformData = new Float32Array(24);
    this.depthTexture = null;
    this.depthTextureView = null;
    this.depthFormat = 'depth24plus';
  }

  async initialize() {
    const shaderUrl = new URL('../shaders/solid.wgsl', import.meta.url);
    const shaderCode = await fetch(shaderUrl).then((res) => res.text());
    const shaderModule = this.device.createShaderModule({
      code: shaderCode,
    });

    const { vertexData, vertexCount } = createCubeGeometry();
    this.vertexBuffer = createBuffer(
      this.device,
      vertexData,
      GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    );
    this.vertexCount = vertexCount;

    this.sceneUniformBuffer = this.device.createBuffer({
      size: this.sceneUniformData.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const sceneBindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
      ],
    });

    this.sceneBindGroup = this.device.createBindGroup({
      layout: sceneBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: this.sceneUniformBuffer },
        },
      ],
    });

    const pipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [sceneBindGroupLayout],
    });

    this.pipeline = this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
        buffers: [
          {
            arrayStride: 24,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x3' },
              { shaderLocation: 1, offset: 12, format: 'float32x3' },
            ],
          },
          {
            arrayStride: INSTANCE_STRIDE,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 2, offset: 0, format: 'float32x4' },
              { shaderLocation: 3, offset: 16, format: 'float32x4' },
              { shaderLocation: 4, offset: 32, format: 'float32x4' },
              { shaderLocation: 5, offset: 48, format: 'float32x4' },
              { shaderLocation: 6, offset: 64, format: 'float32x3' },
            ],
          },
        ],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [
          {
            format: this.format,
          },
        ],
      },
      primitive: {
        topology: 'triangle-list',
        cullMode: 'back',
      },
      depthStencil: {
        format: this.depthFormat,
        depthWriteEnabled: true,
        depthCompare: 'less',
      },
    });

    this.resize(this.canvas.width, this.canvas.height);
  }

  resize(width, height) {
    if (width === 0 || height === 0) {
      return;
    }

    this.depthTexture?.destroy?.();
    this.depthTexture = this.device.createTexture({
      size: { width, height, depthOrArrayLayers: 1 },
      format: this.depthFormat,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.depthTextureView = this.depthTexture.createView();
  }

  updateScene({ viewProjection, cameraPosition, lightDirection }) {
    this.sceneUniformData.set(viewProjection, 0);
    this.sceneUniformData[16] = lightDirection[0];
    this.sceneUniformData[17] = lightDirection[1];
    this.sceneUniformData[18] = lightDirection[2];
    this.sceneUniformData[19] = 0;
    this.sceneUniformData[20] = cameraPosition[0];
    this.sceneUniformData[21] = cameraPosition[1];
    this.sceneUniformData[22] = cameraPosition[2];
    this.sceneUniformData[23] = 1;
    this.device.queue.writeBuffer(
      this.sceneUniformBuffer,
      0,
      this.sceneUniformData.buffer,
      this.sceneUniformData.byteOffset,
      this.sceneUniformData.byteLength,
    );
  }

  setBoardInstances(instances) {
    ensureInstanceBuffer(this.device, this.boardInstances, instances.length);
    const data = packInstances(instances);
    this.device.queue.writeBuffer(
      this.boardInstances.buffer,
      0,
      data.buffer,
      data.byteOffset,
      data.byteLength,
    );
  }

  setHighlightInstances(instances) {
    ensureInstanceBuffer(this.device, this.highlightInstances, instances.length);
    const data = packInstances(instances);
    this.device.queue.writeBuffer(
      this.highlightInstances.buffer,
      0,
      data.buffer,
      data.byteOffset,
      data.byteLength,
    );
  }

  updatePieceInstances(instances) {
    ensureInstanceBuffer(this.device, this.pieceInstances, instances.length);
    const data = packInstances(instances);
    this.device.queue.writeBuffer(
      this.pieceInstances.buffer,
      0,
      data.buffer,
      data.byteOffset,
      data.byteLength,
    );
  }

  render() {
    const commandEncoder = this.device.createCommandEncoder();
    const textureView = this.context.getCurrentTexture().createView();
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: textureView,
          clearValue: { r: 0.05, g: 0.07, b: 0.12, a: 1.0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      depthStencilAttachment: {
        view: this.depthTextureView,
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });

    renderPass.setPipeline(this.pipeline);
    renderPass.setVertexBuffer(0, this.vertexBuffer);
    renderPass.setBindGroup(0, this.sceneBindGroup);

    if (this.boardInstances.count > 0) {
      renderPass.setVertexBuffer(1, this.boardInstances.buffer);
      renderPass.draw(this.vertexCount, this.boardInstances.count, 0, 0);
    }

    if (this.highlightInstances.count > 0) {
      renderPass.setVertexBuffer(1, this.highlightInstances.buffer);
      renderPass.draw(this.vertexCount, this.highlightInstances.count, 0, 0);
    }

    if (this.pieceInstances.count > 0) {
      renderPass.setVertexBuffer(1, this.pieceInstances.buffer);
      renderPass.draw(this.vertexCount, this.pieceInstances.count, 0, 0);
    }

    renderPass.end();
    this.device.queue.submit([commandEncoder.finish()]);
  }
}
