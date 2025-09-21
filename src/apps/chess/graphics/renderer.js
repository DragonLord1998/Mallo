const BABYLON = globalThis.BABYLON;

function getColorKey(color = [1, 1, 1]) {
  return color.map((component) => component.toFixed(4)).join(',');
}

export class Renderer {
  constructor({ canvas }) {
    if (!canvas) {
      throw new Error('Renderer requires a canvas element.');
    }

    this.canvas = canvas;
    this.engine = null;
    this.scene = null;
    this.camera = null;
    this.light = null;

    this.groups = {
      board: { root: null, meshes: [] },
      highlights: { root: null, meshes: [] },
      pieces: { root: null, meshes: [] },
    };

    this.materialCache = new Map();
    this.modelDefinitions = {
      king: { filename: 'King.glb', targetHeight: 2.4 },
      queen: { filename: 'queen.glb', targetHeight: 2.4 },
      pawn: { filename: 'pawn.glb', targetHeight: 1.45 },
      bishop: { filename: 'bishop.glb', targetHeight: 2.2 },
    };
    this.modelAssets = new Map();
    this.modelLoadPromises = new Map();

    this._tempScaling = null;
    this._tempRotation = null;
    this._tempPosition = null;
    this._cameraTarget = null;
  }

  async initialize() {
    if (!BABYLON) {
      throw new Error('Babylon.js is not available. Ensure the Babylon.js CDN script is loaded.');
    }

    this.engine = new BABYLON.Engine(this.canvas, true, { adaptToDeviceRatio: false });
    this.scene = new BABYLON.Scene(this.engine);
    this.scene.useRightHandedSystem = true;
    this.scene.clearColor = new BABYLON.Color4(0.05, 0.07, 0.12, 1.0);

    this.camera = new BABYLON.FreeCamera('chess-camera', new BABYLON.Vector3(0, 10, 10), this.scene);
    this.camera.minZ = 0.1;
    this.camera.maxZ = 100;
    this.camera.fov = Math.PI / 4;
    this.camera.inertia = 0;
    this.camera.position.copyFromFloats(0, 8, 8);
    this.camera.setTarget(BABYLON.Vector3.Zero());

    this.light = new BABYLON.DirectionalLight('chess-light', new BABYLON.Vector3(-0.6, -1.0, -0.8), this.scene);
    this.light.position = new BABYLON.Vector3(6, 8, 6);
    this.light.intensity = 1.25;

    const hemiLight = new BABYLON.HemisphericLight('chess-hemi', new BABYLON.Vector3(0, 1, 0), this.scene);
    hemiLight.intensity = 0.35;
    hemiLight.specular = new BABYLON.Color3(0.05, 0.05, 0.05);

    this.groups.board.root = new BABYLON.TransformNode('board-root', this.scene);
    this.groups.highlights.root = new BABYLON.TransformNode('highlight-root', this.scene);
    this.groups.pieces.root = new BABYLON.TransformNode('piece-root', this.scene);

    this._tempScaling = new BABYLON.Vector3(1, 1, 1);
    this._tempRotation = new BABYLON.Quaternion();
    this._tempPosition = new BABYLON.Vector3();
    this._cameraTarget = new BABYLON.Vector3();

    const loaderPromises = Object.entries(this.modelDefinitions).map(([id, definition]) =>
      this.#ensureModelLoaded(id, definition).catch((error) => {
        console.error(`Failed to load ${id} model`, error);
        this.modelAssets.delete(id);
      }),
    );
    if (loaderPromises.length > 0) {
      await Promise.all(loaderPromises);
    }
  }

  setLightDirection(direction) {
    if (!this.light || !direction) return;
    this.light.direction.copyFromFloats(direction[0], direction[1], direction[2]);
  }

  updateCamera({ position, target }) {
    if (!this.camera || !position || !target) {
      return;
    }
    this.camera.position.copyFromFloats(position[0], position[1], position[2]);
    this._cameraTarget.copyFromFloats(target[0], target[1], target[2]);
    this.camera.setTarget(this._cameraTarget);
  }

  setBoardInstances(instances) {
    this.#syncGroup(this.groups.board, instances, 'board');
  }

  setHighlightInstances(instances) {
    this.#syncGroup(this.groups.highlights, instances, 'highlight');
  }

  updatePieceInstances(instances) {
    const group = this.groups.pieces;
    if (!this.scene || !group?.root) {
      return;
    }

    group.meshes.forEach((node) => node.dispose());
    group.meshes = [];

    if (!Array.isArray(instances) || instances.length === 0) {
      return;
    }

    instances.forEach((instance, index) => {
      const modelId = this.#resolveModelId(instance?.kind);
      if (modelId) {
        const node = this.#createModelInstance(modelId, instance, index);
        if (node) {
          node.parent = group.root;
          group.meshes.push(node);
          return;
        }
      }

      const mesh = BABYLON.MeshBuilder.CreateBox(`piece-${index}`, { size: 1 }, this.scene);
      mesh.parent = group.root;
      mesh.isPickable = false;
      mesh.receiveShadows = false;
      mesh.material = this.#getMaterial(instance.color);
      this.#applyTransform(mesh, instance.matrix);
      group.meshes.push(mesh);
    });
  }

  render() {
    if (!this.scene || !this.engine) return;
    this.scene.render();
  }

  resize(width, height) {
    if (!this.engine) return;
    if (typeof width === 'number' && typeof height === 'number') {
      this.engine.setSize(width, height);
    } else {
      this.engine.resize();
    }
  }

  #syncGroup(group, instances, prefix) {
    if (!this.scene || !group?.root) {
      return;
    }

    group.meshes.forEach((mesh) => mesh.dispose());
    group.meshes = [];

    if (!Array.isArray(instances) || instances.length === 0) {
      return;
    }

    instances.forEach((instance, index) => {
      const mesh = BABYLON.MeshBuilder.CreateBox(`${prefix}-${index}`, { size: 1 }, this.scene);
      mesh.parent = group.root;
      mesh.isPickable = false;
      mesh.receiveShadows = false;
      mesh.material = this.#getMaterial(instance.color);
      this.#applyTransform(mesh, instance.matrix);
      group.meshes.push(mesh);
    });
  }

  #applyTransform(mesh, matrixArray) {
    if (!Array.isArray(matrixArray) && !(matrixArray instanceof Float32Array)) {
      return;
    }

    const matrix = BABYLON.Matrix.FromArray(matrixArray);
    matrix.decompose(this._tempScaling, this._tempRotation, this._tempPosition);
    mesh.scaling.copyFrom(this._tempScaling);
    mesh.rotationQuaternion = mesh.rotationQuaternion ?? new BABYLON.Quaternion();
    mesh.rotationQuaternion.copyFrom(this._tempRotation);
    mesh.position.copyFrom(this._tempPosition);
    mesh.computeWorldMatrix(true);
  }

  async #ensureModelLoaded(assetId, definition) {
    if (!this.scene || !BABYLON?.SceneLoader) {
      return null;
    }

    if (this.modelAssets.has(assetId)) {
      return this.modelAssets.get(assetId);
    }

    if (this.modelLoadPromises.has(assetId)) {
      return this.modelLoadPromises.get(assetId);
    }

    const promise = this.#loadModelAsset(assetId, definition);
    this.modelLoadPromises.set(assetId, promise);
    const asset = await promise;
    this.modelLoadPromises.delete(assetId);
    if (asset) {
      this.modelAssets.set(assetId, asset);
    }
    return asset;
  }

  async #loadModelAsset(assetId, definition) {
    const { filename, targetHeight = 2.4 } = definition ?? {};
    if (!filename) {
      return null;
    }

    const root = new BABYLON.TransformNode(`${assetId}-template-root`, this.scene);
    const offset = new BABYLON.TransformNode(`${assetId}-template-offset`, this.scene);
    offset.parent = root;

    const result = await BABYLON.SceneLoader.ImportMeshAsync(
      '',
      'src/apps/chess/assets/',
      filename,
      this.scene,
    );

    const meshes = Array.isArray(result?.meshes) ? result.meshes : [];
    const transformNodes = Array.isArray(result?.transformNodes) ? result.transformNodes : [];

    transformNodes
      .filter((node) => node && node !== root)
      .forEach((node) => {
        if (!node.parent) {
          node.parent = offset;
        }
      });

    const materialKeys = new Map();
    let materialIndex = 0;

    meshes
      .filter((mesh) => mesh && mesh !== root)
      .forEach((mesh) => {
        if (!mesh.parent) {
          mesh.parent = offset;
        }
        mesh.isPickable = false;
        mesh.receiveShadows = false;

        const material = mesh.material;
        if (material) {
          const metadata = material.metadata ?? (material.metadata = {});
          if (!metadata.modelMaterialKey) {
            const generatedKey = material.id
              || material.name
              || `${assetId}-material-${materialIndex += 1}`;
            metadata.modelMaterialKey = generatedKey;
          }
          const key = metadata.modelMaterialKey;
          if (!materialKeys.has(key)) {
            materialKeys.set(key, material);
          }
        }
      });

    if (offset.getChildMeshes().length === 0) {
      root.dispose();
      return null;
    }

    const { min, max } = offset.getHierarchyBoundingVectors(true);
    const height = Math.max(max.y - min.y, 1e-3);
    const centerX = (min.x + max.x) * 0.5;
    const centerZ = (min.z + max.z) * 0.5;

    const uniformScale = targetHeight / height;
    offset.scaling.copyFromFloats(uniformScale, uniformScale, uniformScale);
    offset.position.copyFromFloats(
      -centerX * uniformScale,
      -min.y * uniformScale,
      -centerZ * uniformScale,
    );

    root.setEnabled(false);

    return {
      assetId,
      template: root,
      targetHeight,
      baseMaterials: materialKeys,
      tintedCache: new Map(),
    };
  }

  #resolveModelId(kind) {
    switch (kind) {
      case 'king-model':
        return 'king';
      case 'queen-model':
        return 'queen';
      case 'pawn-model':
        return 'pawn';
      case 'bishop-model':
        return 'bishop';
      default:
        return null;
    }
  }

  #createModelInstance(assetId, instance, index) {
    const asset = this.modelAssets.get(assetId);
    if (!asset?.template) {
      return null;
    }

    const clone = asset.template.clone(`piece-${assetId}-${index}`, null);
    if (!clone) {
      return null;
    }
    clone.setEnabled(true);

    const color = instance?.color;
    const materialMap = this.#getModelMaterialsForColor(asset, color);
    clone.getChildMeshes().forEach((mesh) => {
      mesh.isPickable = false;
      mesh.receiveShadows = false;
      const baseMaterial = mesh.material;
      if (!baseMaterial) {
        return;
      }
      const key = baseMaterial.metadata?.modelMaterialKey
        || baseMaterial.id
        || baseMaterial.name;
      const tinted = key ? materialMap.get(key) : null;
      if (tinted) {
        mesh.material = tinted;
      }
    });

    const position = instance?.position ?? [0, 0, 0];
    clone.position.copyFromFloats(position[0] ?? 0, position[1] ?? 0, position[2] ?? 0);

    if (typeof instance?.rotationY === 'number') {
      clone.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(0, instance.rotationY, 0);
    } else {
      clone.rotationQuaternion = clone.rotationQuaternion ?? BABYLON.Quaternion.Identity();
    }

    if (Array.isArray(instance?.scale)) {
      clone.scaling.copyFromFloats(instance.scale[0] ?? 1, instance.scale[1] ?? 1, instance.scale[2] ?? 1);
    }

    clone.computeWorldMatrix(true);
    return clone;
  }

  #getModelMaterialsForColor(asset, color) {
    if (!asset) {
      return new Map();
    }

    const key = getColorKey(Array.isArray(color) ? color : [1, 1, 1]);
    if (asset.tintedCache.has(key)) {
      return asset.tintedCache.get(key);
    }

    const map = new Map();
    for (const [materialKey, baseMaterial] of asset.baseMaterials.entries()) {
      const clone = baseMaterial?.clone?.(`${baseMaterial?.name || `${asset.assetId}-material`}-${key}`);
      if (!clone) {
        continue;
      }
      clone.metadata = {
        ...(clone.metadata ?? {}),
        modelMaterialKey: materialKey,
      };
      this.#tintModelMaterial(clone, color);
      map.set(materialKey, clone);
    }

    asset.tintedCache.set(key, map);
    return map;
  }

  #tintModelMaterial(material, color) {
    const [r, g, b] = Array.isArray(color) ? color : [1, 1, 1];

    if ('albedoColor' in material && material.albedoColor) {
      material.albedoColor.copyFromFloats(r, g, b);
    } else if ('diffuseColor' in material && material.diffuseColor) {
      material.diffuseColor.copyFromFloats(r, g, b);
    }

    if (typeof material.backFaceCulling === 'boolean') {
      material.backFaceCulling = true;
    }
  }

  #getMaterial(color) {
    const key = getColorKey(color);
    if (this.materialCache.has(key)) {
      return this.materialCache.get(key);
    }

    const material = new BABYLON.StandardMaterial(`mat-${this.materialCache.size}`, this.scene);
    const [r, g, b] = color ?? [1, 1, 1];
    material.diffuseColor = new BABYLON.Color3(r, g, b);
    material.specularColor = new BABYLON.Color3(0.12, 0.12, 0.12);
    material.ambientColor = new BABYLON.Color3(r * 0.4, g * 0.4, b * 0.4);
    material.backFaceCulling = true;
    material.freeze();

    this.materialCache.set(key, material);
    return material;
  }
}
