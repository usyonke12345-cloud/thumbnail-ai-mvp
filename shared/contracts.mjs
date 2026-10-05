export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status=status; this.code=code; }
}
export function validateRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400,'INVALID_INPUT','JSONオブジェクトを送信してください。');
  if (Object.keys(value).some(k => !['title','genre'].includes(k))) throw new ApiError(400,'INVALID_INPUT','title と genre のみ指定できます。');
  if (typeof value.title !== 'string' || !value.title.trim() || [...value.title.trim()].length > 60 || /[\u0000-\u001f\u007f]/u.test(value.title)) throw new ApiError(400,'INVALID_INPUT','タイトルは改行を含まない1〜60文字にしてください。');
  if (value.genre !== undefined && !['education','gaming','vlog','other'].includes(value.genre)) throw new ApiError(400,'INVALID_INPUT','ジャンルが不正です。');
  return {title:value.title.trim(),genre:value.genre ?? 'other'};
}
