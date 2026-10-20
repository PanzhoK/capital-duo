export function createSound(){
 let context=null,enabled=false;
 return {
  get enabled(){return enabled;},
  async toggle(){
   if(enabled){enabled=false;return false;}
   const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;
   if(!Audio)throw new Error('El sonido no está disponible en este navegador.');
   context??=new Audio();await context.resume();enabled=true;return true;
  },
  play(step){
   if(!enabled||!context||context.state!=='running')return;
   const oscillator=context.createOscillator(),gain=context.createGain(),now=context.currentTime;
   oscillator.type='sine';oscillator.frequency.setValueAtTime([440,392,523,659][step]??440,now);
   gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(.035,now+.015);gain.gain.exponentialRampToValueAtTime(.001,now+.18);
   oscillator.connect(gain);gain.connect(context.destination);oscillator.start(now);oscillator.stop(now+.2);
   oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
  },
  dispose(){enabled=false;context?.close().catch(()=>{});context=null;},
 };
}
