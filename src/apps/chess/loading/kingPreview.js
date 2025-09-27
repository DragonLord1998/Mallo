const BABYLON = globalThis.BABYLON;

const SAFE_PERCENT = (value) => {
  if (Number.isFinite(value)) {
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
  }
  return 0;
};

export class KingLoadingPreview {
  constructor(canvas) {
    this.canvas = canvas ?? null;
    this.engine = null;
    this.scene = null;
    this.camera = null;
    this.primaryLight = null;
    this.kingRoot = null;
    this.clipPlane = null;
    this.bounds = null;
    this.progress = 0;
    this.targetProgress = 0;
    this.previewMeshes = [];
    this.resizer = null;
    this.resizeObserverCleanup = null;
    this.disposed = false;
    this.lastFrameTime = null;
    this.rotationSpeed = 0.25;
    this.fadeAmount = 0.12;
    this.sceneReady = false;

    this.render = this.render.bind(this);
  }

  async initialize() {
    if (this.disposed || !this.canvas || !BABYLON) {
      return false;
    }

    if (this.engine) {
      return true;
    }

    this.engine = new BABYLON.Engine(this.canvas, true, {
      adaptToDeviceRatio: true,
      preserveDrawingBuffer: true,
      stencil: true,
    });
    this.scene = new BABYLON.Scene(this.engine);
    this.scene.useRightHandedSystem = true;
    this.scene.clearColor = new BABYLON.Color4(0, 0, 0, 0);

    this.camera = new BABYLON.ArcRotateCamera(
      'loading-camera',
      Math.PI / 3,
      Math.PI / 3,
      5.2,
      new BABYLON.Vector3(0, 1.4, 0),
      this.scene,
    );
    this.camera.wheelPrecision = 1000;
    this.camera.lowerRadiusLimit = 5.2;
    this.camera.upperRadiusLimit = 5.2;
    this.camera.panningSensibility = 0;
    this.camera.useAutoRotationBehavior = false;
    this.camera.inputs.clear();

    this.primaryLight = new BABYLON.DirectionalLight(
      'loading-light',
      new BABYLON.Vector3(-0.45, -1.0, -0.35),
      this.scene,
    );
    this.primaryLight.intensity = 1.35;
    const rimLight = new BABYLON.HemisphericLight(
      'loading-rim',
      new BABYLON.Vector3(0, 1, 0),
      this.scene,
    );
    rimLight.intensity = 0.55;
    rimLight.specular = new BABYLON.Color3(0.6, 0.65, 0.7);

    this.clipPlane = new BABYLON.Plane(0, 1, 0, 0);
    this.scene.clipPlane = this.clipPlane;

    await this.#loadKingAsset();
    this.#applyProgress();

    this.engine.runRenderLoop(this.render);

    if (typeof ResizeObserver === 'function') {
      this.resizer = new ResizeObserver(() => {
        this.engine?.resize();
      });
      this.resizer.observe(this.canvas);
      this.resizeObserverCleanup = () => {
        try {
          this.resizer?.disconnect();
        } catch (error) {
          console.warn('Failed to disconnect loader resize observer', error);
        }
        this.resizer = null;
      };
    } else {
      const handleResize = () => {
        this.engine?.resize();
      };
      window.addEventListener('resize', handleResize);
      this.resizeObserverCleanup = () => {
        window.removeEventListener('resize', handleResize);
      };
    }

    return true;
  }

  update(percent) {
    const value = SAFE_PERCENT(percent);
    this.targetProgress = value;
    if (!this.sceneReady) {
      this.progress = value;
      this.#applyProgress();
    }
  }

  render() {
    if (this.disposed || !this.scene || !this.engine) {
      return;
    }

    const now = performance.now();
    const delta = this.lastFrameTime ? (now - this.lastFrameTime) / 1000 : 0;
    this.lastFrameTime = now;

    if (this.kingRoot && Number.isFinite(delta)) {
      const rotation = this.rotationSpeed * delta * Math.PI * 2;
      this.kingRoot.rotate(BABYLON.Vector3.Up(), rotation, BABYLON.Space.WORLD);
    }

    if (Number.isFinite(delta)) {
      const diff = this.targetProgress - this.progress;
      if (Math.abs(diff) > 1e-4) {
        const step = Math.min(1, delta * 2.8);
        this.progress += diff * step;
        if (Math.abs(this.targetProgress - this.progress) <= 1e-3) {
          this.progress = this.targetProgress;
        }
        this.#applyProgress();
      }
    }

    this.scene.render();
  }

  dispose() {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    this.resizeObserverCleanup?.();
    this.resizer = null;
    this.resizeObserverCleanup = null;

    if (this.scene) {
      this.scene.dispose();
    }
    this.scene = null;
    this.camera = null;
    this.kingRoot = null;
    this.clipPlane = null;
    this.bounds = null;
    this.sceneReady = false;

    if (this.engine) {
      this.engine.stopRenderLoop(this.render);
      this.engine.dispose();
    }
    this.engine = null;
  }

  async #loadKingAsset() {
    if (!this.scene || !BABYLON?.SceneLoader) {
      return;
    }

    const root = new BABYLON.TransformNode('king-preview-root', this.scene);
    const offset = new BABYLON.TransformNode('king-preview-offset', this.scene);
    offset.parent = root;

    try {
      const result = await BABYLON.SceneLoader.ImportMeshAsync(
        '',
        'src/apps/chess/assets/',
        'king.glb',
        this.scene,
      );

      const meshes = Array.isArray(result?.meshes) ? result.meshes : [];
      const nodes = Array.isArray(result?.transformNodes) ? result.transformNodes : [];

      nodes
        .filter((node) => node && node !== root)
        .forEach((node) => {
          if (!node.parent) {
            node.parent = offset;
          }
        });

      meshes
        .filter((mesh) => mesh && mesh !== root)
        .forEach((mesh) => {
          if (!mesh.parent) {
            mesh.parent = offset;
          }
          mesh.isPickable = false;
          mesh.receiveShadows = false;
          mesh.visibility = this.fadeAmount;
        });

      this.previewMeshes = meshes.filter((mesh) => mesh && mesh !== root);

      const { min, max } = offset.getHierarchyBoundingVectors(true);
      const rawHeight = Math.max(max.y - min.y, 1e-3);
      const targetHeight = 2.6;
      const scale = targetHeight / rawHeight;
      const centerX = (min.x + max.x) * 0.5;
      const centerZ = (min.z + max.z) * 0.5;

      offset.scaling.copyFromFloats(scale, scale, scale);
      offset.position.copyFromFloats(
        -centerX * scale,
        -min.y * scale,
        -centerZ * scale,
      );

      const { min: scaledMin, max: scaledMax } = offset.getHierarchyBoundingVectors(true);
      this.bounds = {
        minY: scaledMin.y,
        maxY: scaledMax.y,
        height: Math.max(scaledMax.y - scaledMin.y, 1e-3),
      };

      this.kingRoot = root;
      this.clipPlane.d = -(this.bounds.minY + this.bounds.height * 0.025);
      this.sceneReady = true;
      this.#applyProgress();
    } catch (error) {
      console.error('Failed to load king preview asset', error);
    }
  }

  #applyProgress(progressOverride) {
    if (!this.clipPlane || !this.bounds) {
      return;
    }

    const base = SAFE_PERCENT(progressOverride ?? this.progress);
    const { minY, height } = this.bounds;
    const eased = this.#easeInOutSine(base);
    const growth = Math.max(eased, 0.025);
    const threshold = minY + growth * height;

    this.clipPlane.d = -threshold;

    const visibility = 0.12 + growth * 0.88;
    this.previewMeshes.forEach((mesh) => {
      mesh.visibility = visibility;
    });
  }

  #easeInOutSine(value) {
    const t = SAFE_PERCENT(value);
    return -(Math.cos(Math.PI * t) - 1) / 2;
  }
}
