import {COMPLETE_DESIGNS,completeDesignSummary} from '../shared/complete-designs.mjs';

// Free controls for requested layouts; no image generation, uploads or gallery writes.
export function createEditorDesignGuide({root,designControl,compositionControl,onSelect=()=>{},document=globalThis.document}){
 const title=document.createElement('h3'),note=document.createElement('p'),automatic=document.createElement('button'),manual=document.createElement('details'),manualTitle=document.createElement('summary'),cards=document.createElement('div'),selected=document.createElement('p');
 title.textContent='構成はAIに任せられます';note.textContent='写真と動画の内容から、AIが字体・文字サイズ・配置を選びます。指定したい場合は見本を開いて選べます。選ぶだけでは生成・課金されません。';
 automatic.type='button';automatic.textContent='AIに構成を任せる';automatic.addEventListener('click',()=>{designControl.value='auto';compositionControl.value='auto';render();onSelect();});manualTitle.textContent='字体・配置を自分で指定する見本';manual.append(manualTitle,cards);
 cards.className='design-guide-cards';selected.setAttribute('role','status');const buttons=[];
 for(const [id,recipe]of Object.entries(COMPLETE_DESIGNS)){
  const card=document.createElement('article'),preview=document.createElement('div'),photo=document.createElement('span'),text=document.createElement('span'),button=document.createElement('button'),description=document.createElement('p');
  preview.className=`design-guide-preview ${recipe.layoutClass}`;preview.setAttribute('aria-hidden','true');photo.textContent='写真';photo.className='design-guide-photo';text.textContent='Aa 見出し';text.className=`design-guide-text ${recipe.fontClass}`;preview.append(photo,text);
  button.type='button';button.textContent=recipe.label;button.setAttribute('aria-label',`${recipe.label}を指定`);description.textContent=`${recipe.fontLabel} / ${recipe.layoutLabel}`;
  button.addEventListener('click',()=>{designControl.value=id;render();onSelect();});buttons.push({id,button});card.append(preview,button,description);cards.append(card);
 }
 function render(){selected.textContent=completeDesignSummary(designControl.value,compositionControl.value);automatic.setAttribute('aria-pressed',String(designControl.value==='auto'&&compositionControl.value==='auto'));manual.open=designControl.value!=='auto';for(const {id,button}of buttons)button.setAttribute('aria-pressed',String(designControl.value===id));}
 designControl.addEventListener('change',render);compositionControl.addEventListener('change',render);root.replaceChildren(title,note,automatic,manual,selected);render();return {render};
}
