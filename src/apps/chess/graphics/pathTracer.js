const BOX_FLOATS = 12;
const BOX_STRIDE = BOX_FLOATS * 4;

function ensureBuffer(device, info, count) {
  const requiredSize = Math.max(1, count) * BOX_STRIDE;
  if (!info.buffer || info.capacity < requiredSize) {
    info.buffer?.destroy?.();
    info.buffer = device.createBuffer({
      size: requiredSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    info.capacity = requiredSize;
  }
  info.count = count;
}

function extractTransformData(matrix) {
  const translation = [matrix[12], matrix[13], matrix[14]];
  const scale = [
    Math.hypot(matrix[0], matrix[1], matrix[2]),
    Math.hypot(matrix[4], matrix[5], matrix[6]),
    Math.hypot(matrix[8], matrix[9], matrix[10]),
  ];
  return { translation, scale };
}

function toBoxData(instance, emission = 0) {
  const { translation, scale } = extractTransformData(instance.matrix);
  const halfScale = scale.map((value) => value * 0.5);
  const min = [
    translation[0] - halfScale[0],
    translation[1] - halfScale[1],
    translation[2] - halfScale[2],
  ];
  const max = [
    translation[0] + halfScale[0],
    translation[1] + halfScale[1],
    translation[2] + halfScale[2],
  ];
  const color = instance.color ?? [1, 1, 1];
  return { min, max, color, emission };
}

export class PathTracer {
  constructor({ device, context, format, canvas }) {
    this.device = device;
    this.context = context;
    this.format = format;
    this.canvas = canvas;

    this.uniformArray = new Float32Array(28);
    this.uniformUint = new Uint32Array(this.uniformArray.buffer);
    this.uniformBuffer = null;

    this.boxData = { buffer: null, capacity: 0, count: 0 };

    this.boardBoxes = [];
    this.highlightBoxes = [];
    this.pieceBoxes = [];

    this.computePipeline = null;
    this.computeBindGroups = [];
    this.presentPipeline = null;
    this.presentBindGroup = null;
    this.presentSampler = null;

    this.accumulationTextures = [];
    this.accumulationIndex = 0;

    this.frameIndex = 0;

    this.maxBounces = 4;
    this.environmentStrength = 0.45;

    this.uniformUint[26] = this.maxBounces;
    this.uniformArray[27] = this.environmentStrength;

  }

  async initialize() {
    const shaderRevision = '20240209a';
    const computeShaderUrl = new URL('../shaders/pathtrace.wgsl', import.meta.url);
    const presentShaderUrl = new URL('../shaders/fullscreen.wgsl', import.meta.url);
    computeShaderUrl.searchParams.set('rev', shaderRevision);
    presentShaderUrl.searchParams.set('rev', shaderRevision);

    const [computeCode, presentCode] = await Promise.all([
      fetch(computeShaderUrl).then((res) => res.text()),
      fetch(presentShaderUrl).then((res) => res.text()),
    ]);

    const computeModule = this.device.createShaderModule({ code: computeCode });
    const presentModule = this.device.createShaderModule({ code: presentCode });

    this.uniformBuffer = this.device.createBuffer({
      size: this.uniformArray.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    ensureBuffer(this.device, this.boxData, 1);

    const computeBindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          texture: { sampleType: 'unfilterable-float' },
        },
        {
          binding: 3,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: { access: 'write-only', format: 'rgba16float' },
        },
      ],
    });

    this.computePipeline = this.device.createComputePipeline({
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [computeBindGroupLayout] }),
      compute: { module: computeModule, entryPoint: 'main' },
    });

    this.presentSampler = this.device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
    });

    const presentBindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      ],
    });

    this.presentPipeline = this.device.createRenderPipeline({
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [presentBindGroupLayout] }),
      vertex: { module: presentModule, entryPoint: 'vs_main' },
      fragment: {
        module: presentModule,
        entryPoint: 'fs_main',
        targets: [{ format: this.format }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
    });

    this.resize(this.canvas.width, this.canvas.height);
    this.updateBoxBuffer();
  }

  resize(width, height) {
    if (width === 0 || height === 0) {
      return;
    }

    this.uniformArray[24] = width;
    this.uniformArray[25] = height;

    this.accumulationTextures.forEach((entry) => entry.texture.destroy());
    this.accumulationTextures = [0, 1].map(() => {
      const texture = this.device.createTexture({
        size: { width, height, depthOrArrayLayers: 1 },
        format: 'rgba16float',
        usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
      });
      return {
        texture,
        sampleView: texture.createView(),
        storageView: texture.createView(),
      };
    });

    this.accumulationIndex = 0;
    this.updateComputeBindGroups();
    this.updatePresentBindGroup();
    this.resetAccumulation();
  }

  updateComputeBindGroups() {
    if (!this.computePipeline || this.accumulationTextures.length < 2 || !this.uniformBuffer) {
      return;
    }

    const layout = this.computePipeline.getBindGroupLayout(0);
    const [first, second] = this.accumulationTextures;

    this.computeBindGroups = [
      this.device.createBindGroup({
        layout,
        entries: [
          { binding: 0, resource: { buffer: this.uniformBuffer } },
          { binding: 1, resource: { buffer: this.boxData.buffer } },
          { binding: 2, resource: first.sampleView },
          { binding: 3, resource: second.storageView },
        ],
      }),
      this.device.createBindGroup({
        layout,
        entries: [
          { binding: 0, resource: { buffer: this.uniformBuffer } },
          { binding: 1, resource: { buffer: this.boxData.buffer } },
          { binding: 2, resource: second.sampleView },
          { binding: 3, resource: first.storageView },
        ],
      }),
    ];
  }

  updatePresentBindGroup() {
    if (!this.presentPipeline || this.accumulationTextures.length === 0) {
      return;
    }

    const layout = this.presentPipeline.getBindGroupLayout(0);
    const current = this.accumulationTextures[this.accumulationIndex];

    this.presentBindGroup = this.device.createBindGroup({
      layout,
      entries: [
        { binding: 0, resource: this.presentSampler },
        { binding: 1, resource: current.sampleView },
      ],
    });
  }

  setBoardInstances(instances) {
    this.boardBoxes = instances.map((instance) => toBoxData(instance));
    this.updateBoxBuffer();
  }

  setHighlightInstances(instances) {
    this.highlightBoxes = instances.map((instance) => toBoxData(instance, 0.25));
    this.updateBoxBuffer();
  }

  updatePieceInstances(instances) {
    this.pieceBoxes = instances.map((instance) => toBoxData(instance));
    this.updateBoxBuffer();
  }

  updateBoxBuffer() {
    if (!this.device) {
      return;
    }

    const boxes = [...this.boardBoxes, ...this.highlightBoxes, ...this.pieceBoxes];
    ensureBuffer(this.device, this.boxData, boxes.length);

    if (boxes.length > 0) {
      const data = new Float32Array(boxes.length * BOX_FLOATS);
      for (let i = 0; i < boxes.length; i += 1) {
        const box = boxes[i];
        const offset = i * BOX_FLOATS;
        data[offset + 0] = box.min[0];
        data[offset + 1] = box.min[1];
        data[offset + 2] = box.min[2];
        data[offset + 3] = 0;
        data[offset + 4] = box.max[0];
        data[offset + 5] = box.max[1];
        data[offset + 6] = box.max[2];
        data[offset + 7] = 0;
        data[offset + 8] = box.color[0];
        data[offset + 9] = box.color[1];
        data[offset + 10] = box.color[2];
        data[offset + 11] = box.emission ?? 0;
      }
      this.device.queue.writeBuffer(
        this.boxData.buffer,
        0,
        data.buffer,
        data.byteOffset,
        data.byteLength,
      );
    }

    this.uniformUint[23] = boxes.length;
    this.updateComputeBindGroups();
    this.resetAccumulation();
  }

  updateScene({ inverseViewProjection, cameraPosition, lightDirection }) {
    this.uniformArray.set(inverseViewProjection, 0);
    this.uniformArray[16] = cameraPosition[0];
    this.uniformArray[17] = cameraPosition[1];
    this.uniformArray[18] = cameraPosition[2];
    this.uniformArray[20] = lightDirection[0];
    this.uniformArray[21] = lightDirection[1];
    this.uniformArray[22] = lightDirection[2];
  }

  resetAccumulation() {
    this.frameIndex = 0;
    this.accumulationIndex = 0;
    this.updatePresentBindGroup();
  }

  render() {
    if (!this.computePipeline || !this.presentPipeline) {
      return;
    }

    const width = this.canvas.width;
    const height = this.canvas.height;
    if (width === 0 || height === 0) {
      return;
    }

    if (this.computeBindGroups.length < 2) {
      return;
    }

    this.uniformUint[19] = this.frameIndex;
    this.device.queue.writeBuffer(
      this.uniformBuffer,
      0,
      this.uniformArray.buffer,
      this.uniformArray.byteOffset,
      this.uniformArray.byteLength,
    );

    const commandEncoder = this.device.createCommandEncoder();

    const readIndex = this.accumulationIndex;
    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(this.computePipeline);
    computePass.setBindGroup(0, this.computeBindGroups[readIndex]);
    const workgroupSize = 8;
    const workgroupsX = Math.ceil(width / workgroupSize);
    const workgroupsY = Math.ceil(height / workgroupSize);
    computePass.dispatchWorkgroups(workgroupsX, workgroupsY);
    computePass.end();

    this.accumulationIndex = 1 - this.accumulationIndex;
    this.updatePresentBindGroup();

    const textureView = this.context.getCurrentTexture().createView();
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: textureView,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    });
    renderPass.setPipeline(this.presentPipeline);
    renderPass.setBindGroup(0, this.presentBindGroup);
    renderPass.draw(3, 1, 0, 0);
    renderPass.end();

    this.device.queue.submit([commandEncoder.finish()]);

    this.frameIndex += 1;
  }
}
