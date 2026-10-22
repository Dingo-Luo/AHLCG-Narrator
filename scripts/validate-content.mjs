// Verify native Chinese content without reading any English catalog or PO file.
export const displayFields = new Set(['name','title','text','description','scenario_name','header','full_name','confirm_text','subtext','note','masculine_text','feminine_text','nonbinary_text','subname','flavor','back_name','back_text','back_flavor','back_subname']);
export function validateContent(value, path = '') {
  if (Array.isArray(value)) return value.forEach((item,index)=>validateContent(item,`${path}/${index}`));
  if (!value || typeof value !== 'object') return;
  for (const [key,item] of Object.entries(value)) {
    const location = `${path}/${key}`;
    if (['translations','zh_cn','zh'].includes(key)) throw Error(`不再支持多语言目录：${location}`);
    if (displayFields.has(key) && typeof item === 'string') {
      const text = item.replace(/<[^>]*>/g,'').replace(/\[[a-z_]+\]/g,'').replace(/#[A-Za-z_]+#/g,'');
      if (/[A-Za-z]/.test(text) && !/[\u3400-\u9fff]/u.test(text)) throw Error(`内容需要中文：${location}`);
    } else validateContent(item,location);
  }
}
