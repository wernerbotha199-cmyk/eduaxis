
(() => {
  'use strict';
  if (document.getElementById('eduaxis-ai')) return;
  const languages=['Afrikaans','English','isiZulu','isiXhosa','Sesotho','Setswana','Sepedi','isiNdebele','siSwati','itsonga','Tshivenda','French','Spanish','German','Portuguese','Arabic','Mandarin Chinese','Japanese','Korean','Italian'];
  const subjects=['Mathematics','English','Afrikaans','Natural Sciences','Life Sciences','Physical Sciences','Social Sciences','Geography','History','Technology','Economic and Management Sciences','Business Studies','Accounting','Life Orientation','Creative Arts','Computer Applications Technology'];
  const grades=Array.from({length:12},(_,i)=>`Grade ${i+1}`);
  const root=document.createElement('div');
  root.id='eduaxis-ai';
  root.innerHTML=`
    <section class="ea-chat" role="dialog" aria-label="EduAxis Learning Assistant" aria-modal="false">
      <header class="ea-head"><div><strong>EduAxis Learning Assistant</strong><small>Ask, explore and learn at your pace</small></div><button class="ea-close" aria-label="Close assistant">×</button></header>
      <div class="ea-controls">
        <select class="ea-mode" aria-label="Assistant mode"><option value="general">Book Assistant · Ask anything</option><option value="teacher">Teacher Assistant · CAPS learning</option><option value="language">Language Assistant · Learn a language</option></select>
        <select class="ea-grade" aria-label="Grade"><option value="">Select grade</option>${grades.map(x=>`<option>${x}</option>`).join('')}</select>
        <select class="ea-subject" aria-label="Subject"><option value="">Select subject</option>${subjects.map(x=>`<option>${x}</option>`).join('')}</select>
        <select class="ea-language" aria-label="Language to learn" hidden>${languages.map(x=>`<option>${x}</option>`).join('')}</select>
      </div>
      <div class="ea-messages" aria-live="polite"><div class="ea-msg assistant">Hello! I’m your EduAxis learning companion. Choose a learning mode above, then ask me a question. I can explain ideas, guide homework practice and help you learn a new language.</div></div>
      <form class="ea-compose"><textarea rows="1" maxlength="6000" aria-label="Your message" placeholder="Type your question…"></textarea><button class="ea-send" type="submit">Send</button></form>
      <div class="ea-foot">Free model availability may vary. Audio uses voices available on this device.</div>
    </section>
    <button class="ea-book-launch" type="button" aria-label="Open EduAxis Learning Assistant" title="Ask the EduAxis Learning Assistant">📖</button>`;
  document.body.appendChild(root);
  const $=s=>root.querySelector(s), messages=$('.ea-messages'), form=$('.ea-compose'), input=$('textarea'), send=$('.ea-send');
  let history=[], conversationId=null;
  const add=(role,text)=>{
    const el=document.createElement('div');el.className=`ea-msg ${role}`;el.textContent=text;
    if(role==='assistant'){const b=document.createElement('button');b.className='ea-speak';b.type='button';b.textContent='🔊 Read aloud';b.addEventListener('click',()=>speak(text));el.appendChild(document.createElement('br'));el.appendChild(b);}
    messages.appendChild(el);messages.scrollTop=messages.scrollHeight;
  };
  const speak=text=>{if(!('speechSynthesis'in window)){add('assistant','Audio playback is not supported by this browser.');return;}window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);const lang=$('.ea-language').value;const map={'Afrikaans':'af-ZA','English':'en-ZA','isiZulu':'zu-ZA','isiXhosa':'xh-ZA','Sesotho':'st-ZA','Setswana':'tn-ZA','French':'fr-FR','Spanish':'es-ES','German':'de-DE','Portuguese':'pt-PT','Arabic':'ar-SA','Mandarin Chinese':'zh-CN','Japanese':'ja-JP','Korean':'ko-KR','Italian':'it-IT'};u.lang=map[lang]||'en-ZA';window.speechSynthesis.speak(u);};
  $('.ea-book-launch').addEventListener('click',()=>{root.classList.toggle('open');if(root.classList.contains('open'))input.focus();});
  $('.ea-close').addEventListener('click',()=>root.classList.remove('open'));
  $('.ea-mode').addEventListener('change',()=>{const mode=$('.ea-mode').value;$('.ea-grade').hidden=mode!=='teacher';$('.ea-subject').hidden=mode!=='teacher';$('.ea-language').hidden=mode!=='language';});
  $('.ea-mode').dispatchEvent(new Event('change'));
  form.addEventListener('submit',async e=>{
    e.preventDefault();const prompt=input.value.trim();if(!prompt||send.disabled)return;
    const mode=$('.ea-mode').value, grade=$('.ea-grade').value, subject=$('.ea-subject').value, targetLanguage=$('.ea-language').value;
    add('user',prompt);history.push({role:'user',content:prompt});input.value='';send.disabled=true;send.textContent='…';
    const waiting=document.createElement('div');waiting.className='ea-msg assistant';waiting.textContent='Thinking…';messages.appendChild(waiting);messages.scrollTop=messages.scrollHeight;
    try{
      const res=await fetch('/api/ai/chat',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt,mode,grade,subject,targetLanguage,conversationId,messages:history.slice(0,-1).slice(-10)})});
      const data=await res.json().catch(()=>({}));
      if(!res.ok)throw new Error(data.error||`Request failed (${res.status})`);
      waiting.remove();conversationId=data.conversationId||conversationId;add('assistant',data.answer);history.push({role:'assistant',content:data.answer});history=history.slice(-12);
    }catch(err){waiting.remove();add('assistant',err.message||'Sorry, I could not connect. Please try again.');}
    finally{send.disabled=false;send.textContent='Send';input.focus();}
  });
})();
