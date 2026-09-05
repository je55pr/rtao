export const QUICK_PIC_PHOTO_COUNT = 100;
export const QUICK_PIC_COMPLETION_STAMP_ID = 96;

export function isQuickPicPhotoNumber(value: unknown): value is number {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= 1
    && value <= QUICK_PIC_PHOTO_COUNT;
}
