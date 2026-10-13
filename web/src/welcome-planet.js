export function createWelcomePlanet(stage, sequence) {
  if (!stage) return { destroy() {} };
  const light = stage.querySelector('#hero-planet');
  const orbits = [...stage.querySelectorAll('.orbit-back, .orbit-front')];
  const moons = [...stage.querySelectorAll('.moon-revolution')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let angle=0, total=0, phase=Math.PI, pointer=null, lastX=0, lastMove=0, distance=0;
  let velocity=0, previous=null, frame, timer, triggered=false, lastTurn=0, burstStarted=0;
  let returnFocus=null, inertStates=[];
  let touch=false, pendingTurn=0, dragWidth=200, visible=false;
  function wake() {
    if(!frame && visible && !document.hidden) frame=requestAnimationFrame(animate);
  }
  const visibility=()=>{previous=null;if(document.hidden){cancelAnimationFrame(frame);frame=null;}else wake();};
  const observer=new IntersectionObserver(entries=>{
    visible=entries[0].isIntersecting;
    previous=null;
    if(!visible){cancelAnimationFrame(frame);frame=null;}else wake();
  });
  observer.observe(stage);
  document.addEventListener('visibilitychange',visibility);
  const closeSequence=()=>{
    clearTimeout(timer); sequence.hidden=true;sequence.classList.remove('is-running');
    sequence.querySelector('iframe').removeAttribute('src');
    for(const [child,inert] of inertStates)child.inert=inert;
    returnFocus?.focus({preventScroll:true});
  };
  function render() {
    const radians=angle*Math.PI/180, tilt=3*Math.sin(radians);
    light.setAttribute('cx', `${50-8*Math.cos(radians)+12*Math.sin(radians)}%`);
    light.setAttribute('cy', `${50-14*Math.cos(radians)}%`);
    // Share one orbital plane so the two halves and moon always meet.
    for(const orbit of orbits) orbit.setAttribute('transform', `rotate(${tilt} 350 290)`);
    const plane=(-31+tilt)*Math.PI/180, x=320*Math.cos(phase), y=85*Math.sin(phase);
    for(const moon of moons) {
      moon.setAttribute('transform', `translate(${350+x*Math.cos(plane)-y*Math.sin(plane)} ${290+x*Math.sin(plane)+y*Math.cos(plane)})`);
      moon.style.visibility=moon.classList.contains('moon-front')===(Math.sin(phase)>=0)?'visible':'hidden';
    }
    stage.dataset.rotation=String(angle);
  }
  function turn(delta) {
    const now=performance.now();
    if(now-lastTurn>1200||now-burstStarted>15000){total=0;burstStarted=now;}
    lastTurn=now;
    if(touch&&!reduced)pendingTurn+=delta;
    else {angle+=delta; phase+=delta*Math.PI/180;}
    total+=Math.abs(delta);
    if(total>=5400&&!triggered&&sequence) {
      triggered=true;
      sequence.querySelector('iframe').src='https://www.youtube-nocookie.com/embed/jWOetWUeAts?autoplay=1&playsinline=1&rel=0';
      sequence.querySelector('a').href='https://www.youtube.com/watch?v=jWOetWUeAts';
      // Lift the overlay out of the welcome section so navigation and stacking cannot clip it.
      document.body.append(sequence);
      returnFocus=document.activeElement;
      if(pointer!==null&&stage.hasPointerCapture(pointer))stage.releasePointerCapture(pointer);
      pointer=null;velocity=0;pendingTurn=0;stage.classList.remove('is-dragging','is-spinning');
      inertStates=[...document.querySelector('.app-window').children].map(child=>[child,child.inert]);
      for(const child of document.querySelector('.app-window').children)child.inert=true;
      sequence.hidden=false; sequence.classList.add('is-running');
      sequence.querySelector('button').focus({preventScroll:true});
    }
    render();
  }
  function animate(now) {
    frame=null;
    const elapsed=previous===null?0:Math.min(50,now-previous); previous=now;
    // Touch samples arrive irregularly; interpolate them independently of mouse dragging.
    if(pendingTurn){
      const delta=Math.abs(pendingTurn)<.01?pendingTurn:pendingTurn*(1-Math.exp(-elapsed/45));
      pendingTurn-=delta;angle+=delta;phase+=delta*Math.PI/180;
      render();
    }
    if(pointer===null) {
      if(Math.abs(velocity)>.005) {
        const decay=Math.exp(-elapsed/220), delta=velocity*220*(1-decay);
        angle+=delta; phase+=delta*Math.PI/180; velocity*=decay;
      } else {
        velocity=0; stage.classList.remove('is-spinning');
        if(!reduced){angle+=elapsed*.004;phase+=elapsed*Math.PI*2/16000;}
      }
      render();
    }
    if(!reduced||pointer!==null||pendingTurn||Math.abs(velocity)>.005)wake();
  }
  function down(event) {
    if(event.button!==0||pointer!==null)return;
    event.preventDefault();
    window.getSelection()?.removeAllRanges();
    pointer=event.pointerId;lastX=event.clientX;lastMove=performance.now();distance=0;velocity=0;
    touch=event.pointerType==='touch';dragWidth=Math.max(200,stage.clientWidth);wake();
    stage.setPointerCapture(pointer);
  }
  function move(event) {
    if(event.pointerId!==pointer)return;
    event.preventDefault();
    const now=performance.now(), dx=event.clientX-lastX;
    distance+=Math.abs(dx);
    const delta=dx*360/dragWidth;
    velocity=Math.max(-1.5,Math.min(1.5,delta/Math.max(8,now-lastMove)));
    lastMove=now;lastX=event.clientX;
    if(distance>3){stage.classList.add('is-dragging','is-spinning');turn(delta);}
  }
  function release(event) {
    if(event.pointerId!==pointer)return;
    if(performance.now()-lastMove>100||event.type==='pointercancel'||reduced)velocity=0;
    pointer=null;stage.classList.remove('is-dragging');
    window.getSelection()?.removeAllRanges();
    if(stage.hasPointerCapture(event.pointerId))stage.releasePointerCapture(event.pointerId);
  }
  function key(event) {
    if(!['ArrowLeft','ArrowRight'].includes(event.key))return;
    event.preventDefault();stage.classList.add('is-spinning');
    const delta=event.key==='ArrowRight'?18:-18;turn(delta);velocity=reduced?0:delta/100;
    wake();
  }
  render();
  const blockSelection=event=>event.preventDefault();
  const escape=event=>{if(!sequence?.hidden&&event.key==='Escape')closeSequence();};
  sequence?.querySelector('button').addEventListener('click',closeSequence);
  document.addEventListener('keydown',escape);
  const handlers={pointerdown:down,pointermove:move,pointerup:release,pointercancel:release,keydown:key,selectstart:blockSelection,dragstart:blockSelection};
  for(const [name,handler] of Object.entries(handlers))stage.addEventListener(name,handler);
  return {destroy(){observer.disconnect();document.removeEventListener('visibilitychange',visibility);cancelAnimationFrame(frame);clearTimeout(timer);document.removeEventListener('keydown',escape);sequence?.querySelector('button').removeEventListener('click',closeSequence);for(const [name,handler] of Object.entries(handlers))stage.removeEventListener(name,handler);}};
}
