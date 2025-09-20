import { mat4 } from '../../../math/mat4.js';
import { vec3 } from '../../../math/vec3.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export class CameraController {
  constructor({ canvas, target = [0, 0, 0], radius = 12 }) {
    this.canvas = canvas;
    this.target = new Float32Array(target);
    this.radius = radius;
    this.minRadius = 6;
    this.maxRadius = 24;
    this.theta = Math.PI * 0.25;
    this.phi = Math.PI * 0.35;
    this.minPhi = 0.05;
    this.maxPhi = Math.PI * 0.48;
    this.up = new Float32Array([0, 1, 0]);

    this.viewMatrix = mat4.create();
    this.projectionMatrix = mat4.create();
    this.viewProjectionMatrix = mat4.create();
    this.cameraPosition = new Float32Array(3);
    this.inverseViewProjection = mat4.create();

    this.needsUpdate = true;
    this.updateProjection();
    this.updateView();
  }

  updateProjection(aspect) {
    const width = this.canvas.clientWidth || this.canvas.width;
    const height = this.canvas.clientHeight || this.canvas.height;
    const targetAspect = aspect ?? width / Math.max(height, 1);
    mat4.perspective(this.projectionMatrix, Math.PI / 4, targetAspect, 0.1, 100.0);
    this.needsUpdate = true;
  }

  updateView() {
    const sinPhi = Math.sin(this.phi);
    const cosPhi = Math.cos(this.phi);
    const sinTheta = Math.sin(this.theta);
    const cosTheta = Math.cos(this.theta);

    const x = this.target[0] + this.radius * sinTheta * sinPhi;
    const y = this.target[1] + this.radius * cosPhi;
    const z = this.target[2] + this.radius * cosTheta * sinPhi;

    this.cameraPosition[0] = x;
    this.cameraPosition[1] = y;
    this.cameraPosition[2] = z;

    mat4.lookAt(this.viewMatrix, this.cameraPosition, this.target, this.up);
    mat4.multiply(this.viewProjectionMatrix, this.projectionMatrix, this.viewMatrix);
    mat4.invert(this.inverseViewProjection, this.viewProjectionMatrix);
    this.needsUpdate = false;
  }

  orbit(deltaX, deltaY) {
    this.theta -= deltaX * 0.01;
    this.phi = clamp(this.phi + deltaY * 0.01, this.minPhi, this.maxPhi);
    this.needsUpdate = true;
    this.updateView();
  }

  zoom(delta) {
    const factor = 1 + delta * 0.0015;
    this.radius = clamp(this.radius * factor, this.minRadius, this.maxRadius);
    this.needsUpdate = true;
    this.updateView();
  }

  pan(deltaX, deltaY) {
    const forward = vec3.create();
    const right = vec3.create();
    const upVec = vec3.create();
    vec3.subtract(forward, this.target, this.cameraPosition);
    vec3.normalize(forward, forward);
    vec3.cross(right, forward, this.up);
    vec3.normalize(right, right);
    vec3.cross(upVec, right, forward);

    const panSpeed = 0.004 * this.radius;
    this.target[0] += (-deltaX * panSpeed) * right[0] + (deltaY * panSpeed) * upVec[0];
    this.target[1] += (-deltaX * panSpeed) * right[1] + (deltaY * panSpeed) * upVec[1];
    this.target[2] += (-deltaX * panSpeed) * right[2] + (deltaY * panSpeed) * upVec[2];
    this.needsUpdate = true;
    this.updateView();
  }

  getViewProjectionMatrix() {
    if (this.needsUpdate) {
      this.updateView();
    }
    return this.viewProjectionMatrix;
  }

  getInverseViewProjectionMatrix() {
    if (this.needsUpdate) {
      this.updateView();
    }
    return this.inverseViewProjection;
  }

  getCameraPosition() {
    if (this.needsUpdate) {
      this.updateView();
    }
    return this.cameraPosition;
  }
}
