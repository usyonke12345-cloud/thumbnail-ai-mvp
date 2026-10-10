import {COMPLETE_DESIGNS,completeDesignSummary} from '../shared/complete-designs.mjs';

// Free controls for requested layouts; no image generation, uploads or gallery writes.
export function createEditorDesignGuide({root,designControl,compositionControl,onSelect=()=>{},document=globalThis.document}){
 const title=document.createElement('h3'),note=document.createElement('p'),cards=document.createElement('div'),selected=document.createElement('p');
 title.textContent='字体と配置を変える';note.textContent='下の見本はデザインの指定です。完成画像はAIが描くため、字体・配置の再現は完成PNGで確認します。選ぶだけでは生成・課金されません。';
 cards.className='design-guide-cards';selected.setAttribute('role','status');const buttons=[];
 for(const [id,recipe]of Object.entries(COMPLETE_DESIGNS)){
  const card=document.createElement('article'),preview=document.createElement('div'),photo=document.createElement('span'),text=document.createElement('span'),button=document.createElement('button'),description=document.createElement('p');
  preview.className=`design-guide-preview ${recipe.layoutClass}`;preview.setAttribute('aria-hidden','true');photo.textContent='写真';photo.className='design-guide-photo';text.textContent='Aa 見出し';text.className=`design-guide-text ${recipe.fontClass}`;preview.append(photo,text);
  button.type='button';button.textContent=recipe.label;button.setAttribute('aria-label',`${recipe.label}を指定`);description.textContent=`${recipe.fontLabel} / ${recipe.layoutLabel}`;
  button.addEventListener('click',()=>{designControl.value=id;render();onSelect();});buttons.push({id,button});card.append(preview,button,description);cards.append(card);
 }
 function render(){selected.textContent=completeDesignSummary(designControl.value,compositionControl.value);for(const {id,button}of buttons)button.setAttribute('aria-pressed',String(designControl.value===id));}
 designControl.addEventListener('change',render);compositionControl.addEventListener('change',render);root.replaceChildren(title,note,cards,selected);render();return {render};
}
