export function createWelcomePlanet(stage, sequence) {
  if (!stage) return { destroy() {} };
  const light = stage.querySelector('#hero-planet');
  const orbits = [...stage.querySelectorAll('.orbit-back, .orbit-front')];
  const moons = [...stage.querySelectorAll('.moon-revolution')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let angle=0, total=0, phase=Math.PI, pointer=null, lastX=0, lastMove=0, distance=0;
  let velocity=0, previous=null, frame, timer, triggered=false;
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
    angle+=delta; phase+=delta*Math.PI/180; total+=Math.abs(delta);
    if(total>=1440&&!triggered&&sequence) {
      triggered=true; sequence.hidden=false; sequence.classList.add('is-running');
      timer=setTimeout(()=>{sequence.hidden=true;sequence.classList.remove('is-running');},6200);
    }
    render();
  }
  function animate(now) {
    const elapsed=previous===null?0:now-previous; previous=now;
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
    frame=requestAnimationFrame(animate);
  }
  function down(event) {
    if(event.button!==0||pointer!==null)return;
    pointer=event.pointerId;lastX=event.clientX;lastMove=performance.now();distance=0;velocity=0;
    stage.setPointerCapture(pointer);
  }
  function move(event) {
    if(event.pointerId!==pointer)return;
    const now=performance.now(), dx=event.clientX-lastX;
    distance+=Math.abs(dx);
    const delta=dx*360/Math.max(200,stage.clientWidth);
    velocity=Math.max(-1.5,Math.min(1.5,delta/Math.max(8,now-lastMove)));
    lastMove=now;lastX=event.clientX;
    if(distance>3){stage.classList.add('is-dragging','is-spinning');turn(delta);}
  }
  function release(event) {
    if(event.pointerId!==pointer)return;
    if(performance.now()-lastMove>100||event.type==='pointercancel'||reduced)velocity=0;
    pointer=null;stage.classList.remove('is-dragging');
    if(stage.hasPointerCapture(event.pointerId))stage.releasePointerCapture(event.pointerId);
  }
  function key(event) {
    if(!['ArrowLeft','ArrowRight'].includes(event.key))return;
    event.preventDefault();stage.classList.add('is-spinning');
    const delta=event.key==='ArrowRight'?18:-18;turn(delta);velocity=reduced?0:delta/100;
  }
  render();frame=requestAnimationFrame(animate);
  const handlers={pointerdown:down,pointermove:move,pointerup:release,pointercancel:release,keydown:key};
  for(const [name,handler] of Object.entries(handlers))stage.addEventListener(name,handler);
  return {destroy(){cancelAnimationFrame(frame);clearTimeout(timer);for(const [name,handler] of Object.entries(handlers))stage.removeEventListener(name,handler);}};
}
