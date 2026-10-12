const HEAVEN_THRESHOLD = 1440;

export function createWelcomePlanet(stage, sequence) {
  if (!stage) return { destroy() {} };
  const rotor=stage.querySelector('.planet-drag-spin'),moons=[...stage.querySelectorAll('.moon-revolution')];
  const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let angle=0,totalTurn=0,pointerId=null,lastX=0,lastTime=0,velocity=0,frame=null,moonFrame=null,moonPhase=Math.PI,moonTime=null,sequenceTimer=null,triggered=false;

  const placeMoon=phase=>{
    const localX=320*Math.cos(phase),localY=85*Math.sin(phase),tilt=-31*Math.PI/180;
    const x=350+localX*Math.cos(tilt)-localY*Math.sin(tilt),y=290+localX*Math.sin(tilt)+localY*Math.cos(tilt);
    for(const moon of moons)moon.setAttribute('transform',`translate(${x.toFixed(2)} ${y.toFixed(2)})`);
    const front=Math.sin(phase)>=0;
    stage.querySelector('.moon-front').style.visibility=front?'visible':'hidden';
    stage.querySelector('.moon-back').style.visibility=front?'hidden':'visible';
  };
  const orbitMoon=now=>{
    const duration=stage.classList.contains('is-spinning')?900:16000;
    if(moonTime===null)moonTime=now;
    moonPhase+=(now-moonTime)/duration*Math.PI*2;moonTime=now;placeMoon(moonPhase);
    moonFrame=requestAnimationFrame(orbitMoon);
  };
  placeMoon(moonPhase);
  if(!reduceMotion)moonFrame=requestAnimationFrame(orbitMoon);

  const render=(speed=0)=>{
    rotor.style.transform=`rotate(${angle}deg)`;
    const opacity=Math.max(.08,1-Math.min(Math.abs(speed)/18,.92));
    stage.style.setProperty('--card-opacity',String(opacity));
  };
  const triggerSequence=()=>{
    if(triggered||!sequence)return;
    triggered=true;sequence.hidden=false;
    requestAnimationFrame(()=>sequence.classList.add('is-running'));
    sequenceTimer=setTimeout(()=>{sequence.classList.remove('is-running');sequence.hidden=true;},6200);
  };
  const turn=delta=>{
    angle+=delta;totalTurn+=Math.abs(delta);render(delta);
    if(totalTurn>=HEAVEN_THRESHOLD)triggerSequence();
  };
  const stopInertia=()=>{if(frame!==null)cancelAnimationFrame(frame);frame=null;};
  const coast=()=>{
    angle+=velocity;velocity*=.94;render(velocity);
    if(Math.abs(velocity)>.08){frame=requestAnimationFrame(coast);return;}
    frame=null;stage.classList.remove('is-spinning');stage.style.setProperty('--card-opacity','1');
  };
  const release=event=>{
    if(pointerId===null||event.pointerId!==pointerId)return;
    pointerId=null;stage.classList.remove('is-dragging');
    try{stage.releasePointerCapture(event.pointerId);}catch{}
    stopInertia();frame=requestAnimationFrame(coast);
  };
  const pointerDown=event=>{
    if(event.button!==undefined&&event.button!==0)return;
    stopInertia();pointerId=event.pointerId;lastX=event.clientX;lastTime=performance.now();velocity=0;
    stage.classList.add('is-dragging','is-spinning');stage.setPointerCapture(event.pointerId);
  };
  const pointerMove=event=>{
    if(event.pointerId!==pointerId)return;
    const now=performance.now(),elapsed=Math.max(8,now-lastTime),delta=(event.clientX-lastX)*.8;
    if(!delta)return;
    velocity=delta*(16/elapsed);lastX=event.clientX;lastTime=now;turn(delta);
  };
  const keyDown=event=>{
    if(!['ArrowLeft','ArrowRight'].includes(event.key))return;
    event.preventDefault();stage.classList.add('is-spinning');velocity=event.key==='ArrowRight'?18:-18;turn(velocity);
    clearTimeout(stage._keyboardSpinTimer);
    stage._keyboardSpinTimer=setTimeout(()=>{stopInertia();frame=requestAnimationFrame(coast);},180);
  };

  stage.addEventListener('pointerdown',pointerDown);
  stage.addEventListener('pointermove',pointerMove);
  stage.addEventListener('pointerup',release);
  stage.addEventListener('pointercancel',release);
  stage.addEventListener('keydown',keyDown);
  return {destroy(){stopInertia();if(moonFrame!==null)cancelAnimationFrame(moonFrame);clearTimeout(sequenceTimer);clearTimeout(stage._keyboardSpinTimer);stage.removeEventListener('pointerdown',pointerDown);stage.removeEventListener('pointermove',pointerMove);stage.removeEventListener('pointerup',release);stage.removeEventListener('pointercancel',release);stage.removeEventListener('keydown',keyDown);}};
}
