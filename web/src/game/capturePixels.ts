export function flipRgbaRows(bottomUp: Uint8Array, width: number, height: number): Uint8Array {
  const stride = width * 4;
  if (bottomUp.byteLength !== stride * height) throw new Error("Capture RGBA buffer length does not match its dimensions.");
  const topDown = new Uint8Array(bottomUp.byteLength);
  for (let sourceY = 0; sourceY < height; sourceY += 1) {
    const targetY = height - 1 - sourceY;
    topDown.set(bottomUp.subarray(sourceY * stride, (sourceY + 1) * stride), targetY * stride);
  }
  return topDown;
}
