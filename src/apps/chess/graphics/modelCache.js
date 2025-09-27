const BABYLON = globalThis.BABYLON;

if (!BABYLON) {
  throw new Error('Babylon.js must be loaded before using the model cache.');
}

export async function importModelAsync({ scene, filename }) {
  if (!scene) {
    throw new Error('Scene is required to import a model.');
  }
  if (!filename) {
    throw new Error('Filename is required to import a model.');
  }

  const rootUrl = 'src/apps/chess/assets/';
  try {
    return await BABYLON.SceneLoader.ImportMeshAsync('', rootUrl, filename, scene, undefined, '.glb');
  } catch (error) {
    throw new Error(`Failed to load model asset ${filename}: ${error?.message ?? error}`);
  }
}

export function clearModelCache() {
  // no-op: maintained for API compatibility
}
