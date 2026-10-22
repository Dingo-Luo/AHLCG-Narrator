// Content is Chinese-native. Retain a notice for missing text and legacy UI values.
export const MISSING_TRANSLATION = '此段暂无中文译文。';
export function chineseText(text) {
  if (text === undefined || text === null || text === '') return '';
  const value = String(text);
  const prose = value.replace(/<[^>]*>/g,'').replace(/\[[a-z_]+\]/g,'').replace(/#[A-Za-z_]+#/g,'');
  if (/[\u3400-\u9fff]/u.test(prose) || !/[A-Za-z]/.test(prose)) return value;
  return MISSING_TRANSLATION;
}
