import * as THREE from "three";
import { flipRgbaRows } from "./capturePixels";

/** Render a scene into an exact-size off-screen target and encode it as PNG. */
export async function renderPng(
  renderer: THREE.WebGLRenderer,
  width: number,
  height: number,
  render: () => void,
): Promise<Blob> {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error(`Invalid capture size ${width}x${height}.`);
  }

  const previousTarget = renderer.getRenderTarget();
  const previousViewport = renderer.getViewport(new THREE.Vector4()).clone();
  const previousScissor = renderer.getScissor(new THREE.Vector4()).clone();
  const previousScissorTest = renderer.getScissorTest();
  const target = new THREE.WebGLRenderTarget(width, height, {
    depthBuffer: true,
    stencilBuffer: false,
  });
  target.texture.colorSpace = renderer.outputColorSpace;
  try {
    renderer.setRenderTarget(target);
    renderer.setViewport(0, 0, width, height);
    renderer.setScissorTest(false);
    render();
    const bottomUp = new Uint8Array(width * height * 4);
    renderer.readRenderTargetPixels(target, 0, 0, width, height, bottomUp);
    return encodeBottomUpRgbaPng(bottomUp, width, height);
  } finally {
    renderer.setRenderTarget(previousTarget);
    renderer.setViewport(previousViewport);
    renderer.setScissor(previousScissor);
    renderer.setScissorTest(previousScissorTest);
    target.dispose();
  }
}

export async function encodeBottomUpRgbaPng(bottomUp: Uint8Array, width: number, height: number): Promise<Blob> {
  if (bottomUp.byteLength !== width * height * 4) throw new Error("Capture RGBA buffer length does not match its dimensions.");
  const topDown = flipRgbaRows(bottomUp, width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The browser could not create a 2D canvas for PNG capture.");
  const pixels = new Uint8ClampedArray(topDown.byteLength);
  pixels.set(topDown);
  context.putImageData(new ImageData(pixels, width, height), 0, 0);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The browser could not encode the capture as PNG.")), "image/png");
  });
}

