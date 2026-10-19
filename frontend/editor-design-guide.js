import {COMPLETE_DESIGNS,COMPLETE_MOOD_EXAMPLES,completeDesignSummary} from '../shared/complete-designs.mjs';

// Free controls for requested layouts; no image generation, uploads or gallery writes.
export function createEditorDesignGuide({root,designControl,compositionControl,intentControl,onSelect=()=>{},document=globalThis.document}){
 const title=document.createElement('h3'),note=document.createElement('p'),automatic=document.createElement('button'),recompose=document.createElement('button'),recomposeNote=document.createElement('p'),manual=document.createElement('details'),manualTitle=document.createElement('summary'),cards=document.createElement('div'),selected=document.createElement('p');
 title.textContent='イメージだけ伝え、構成はAIに任せる';note.textContent='イメージは上の欄に自由に書けます。例を選んで書き換えても構いません。字体・文字サイズ・配置はAIが選びます。選ぶだけでは生成・課金されません。';
 automatic.type='button';automatic.textContent='AIに構成を任せる';automatic.addEventListener('click',()=>{designControl.value='auto';compositionControl.value='auto';render();onSelect();});manualTitle.textContent='字体・配置を自分で指定する見本';manual.append(manualTitle,cards);
 recompose.type='button';recompose.textContent='写真の素材から再構成する（実験）';recompose.addEventListener('click',()=>{designControl.value='recompose';compositionControl.value='auto';render();onSelect();});recomposeNote.textContent='元写真の人物や小物を切り抜き、拡大・再配置する構成をAIに任せます。写真全体を生かす方式へ戻すときは「AIに構成を任せる」を選んでください。AI編集による描き直しが起きる場合があり、元の画素の保持は保証されません。';
 cards.className='design-guide-cards';selected.setAttribute('role','status');const buttons=[];
 const moods=document.createElement('div'),moodButtons=[];moods.className='preview-controls';moods.setAttribute('aria-label','仕上がりのイメージの例');
 if(intentControl)for(const example of COMPLETE_MOOD_EXAMPLES){const button=document.createElement('button');button.type='button';button.textContent=example.label;button.setAttribute('aria-label',`${example.label}のイメージを入力`);button.addEventListener('click',()=>{intentControl.value=example.text;if(designControl.value!=='recompose')designControl.value='auto';compositionControl.value='auto';render();onSelect();});moods.append(button);moodButtons.push({example,button});}
 for(const [id,recipe]of Object.entries(COMPLETE_DESIGNS)){
  const card=document.createElement('article'),preview=document.createElement('div'),photo=document.createElement('span'),text=document.createElement('span'),button=document.createElement('button'),description=document.createElement('p');
  preview.className=`design-guide-preview ${recipe.layoutClass}`;preview.setAttribute('aria-hidden','true');photo.textContent='写真';photo.className='design-guide-photo';text.textContent='Aa 見出し';text.className=`design-guide-text ${recipe.fontClass}`;preview.append(photo,text);
  button.type='button';button.textContent=recipe.label;button.setAttribute('aria-label',`${recipe.label}を指定`);description.textContent=`${recipe.fontLabel} / ${recipe.layoutLabel}`;
  button.addEventListener('click',()=>{designControl.value=id;render();onSelect();});buttons.push({id,button});card.append(preview,button,description);cards.append(card);
 }
 function render(){selected.textContent=`${intentControl?.value.trim()?`希望するイメージ：${intentControl.value.trim()}。`:''}${completeDesignSummary(designControl.value,compositionControl.value)}`;automatic.setAttribute('aria-pressed',String(designControl.value==='auto'&&compositionControl.value==='auto'));recompose.setAttribute('aria-pressed',String(designControl.value==='recompose'));manual.open=!!COMPLETE_DESIGNS[designControl.value];for(const {id,button}of buttons)button.setAttribute('aria-pressed',String(designControl.value===id));for(const {example,button}of moodButtons)button.setAttribute('aria-pressed',String(intentControl.value===example.text));}
 designControl.addEventListener('change',render);compositionControl.addEventListener('change',render);intentControl?.addEventListener('input',render);root.replaceChildren(title,note,moods,automatic,recompose,recomposeNote,manual,selected);render();return {render};
}
