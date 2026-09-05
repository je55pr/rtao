export function carAssetPath(id: number): string {
  if (id < 0 || !Number.isInteger(id)) throw new Error(`Unsupported car body Q${id}.`);
  if (id < 30) return `CAR0/Q${id.toString().padStart(2, "0")}.BIN`;
  if (id < 60) return `CAR1/Q${id.toString().padStart(2, "0")}.BIN`;
  if (id < 90) return `CAR2/Q${id.toString().padStart(2, "0")}.BIN`;
  if (id < 120) return `CAR3/Q${id.toString().padStart(2, "0")}.BIN`;
  if (id < 150) return `CAR4/Q${id.toString().padStart(3, "0")}.BIN`;
  if (id === 150) return "CARS/Q150.BIN";
  throw new Error(`Unsupported car body Q${id}.`);
}
