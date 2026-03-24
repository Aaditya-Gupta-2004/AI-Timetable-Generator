import { Component, useEffect, useRef, useState } from "react";
import * as THREE from "three";

const C = { pink:"#f43f5e", teal:"#0d9488", amber:"#f59e0b", indigo:"#6366f1" };
const DASHBOARD_URL = "/Home";

/* ══════════════════════════════════════════════════════════════
   GLOBAL CSS — fully responsive
══════════════════════════════════════════════════════════════ */
const GLOBAL_CSS = `

  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@300;400;500&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-behavior: smooth; }
  body { background: #060e1c; color: #e2e8f0; font-family: 'DM Sans', sans-serif; overflow-x: hidden; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #0d9488; border-radius: 2px; }

  @keyframes fadeUp    { from{opacity:0;transform:translateY(32px)} to{opacity:1;transform:translateY(0)} }
  @keyframes fadeIn    { from{opacity:0} to{opacity:1} }
  @keyframes glow      { 0%,100%{box-shadow:0 0 24px 2px rgba(13,148,136,.45)} 50%{box-shadow:0 0 48px 8px rgba(13,148,136,.7)} }
  @keyframes floatY    { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
  @keyframes pulse     { 0%,100%{opacity:1} 50%{opacity:.4} }
  @keyframes ticker    { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
  @keyframes borderGlow{ 0%,100%{border-color:rgba(245,158,11,.3)} 50%{border-color:rgba(245,158,11,.9)} }
  @keyframes slideDown { from{opacity:0;transform:translateY(-12px)} to{opacity:1;transform:translateY(0)} }

  /* ── Buttons ── */
  .btn-primary, a.btn-primary {
    display:inline-block; background:#f43f5e; color:#fff; border:none; padding:12px 28px;
    border-radius:999px; font-family:'DM Sans',sans-serif; font-weight:500; font-size:15px;
    cursor:pointer; transition:transform .15s, box-shadow .15s;
    box-shadow:0 4px 24px rgba(244,63,94,.4); text-decoration:none; line-height:1.4;
    white-space:nowrap;
  }
  .btn-primary:hover, a.btn-primary:hover { transform:translateY(-2px); box-shadow:0 8px 32px rgba(244,63,94,.55); }
  .btn-glow { animation: glow 2.5s ease-in-out infinite; }

  .btn-outline {
    background:transparent; color:#fff; border:1.5px solid rgba(255,255,255,.35);
    padding:12px 28px; border-radius:999px; font-family:'DM Sans',sans-serif;
    font-weight:500; font-size:15px; cursor:pointer;
    transition:border-color .2s, background .2s; backdrop-filter:blur(8px); white-space:nowrap;
  }
  .btn-outline:hover { border-color:#fff; background:rgba(255,255,255,.08); }

  a.btn-cta {
    display:inline-block; font-size:17px; padding:16px 44px; border-radius:999px;
    font-family:'DM Sans',sans-serif; font-weight:500; background:transparent; color:#f59e0b;
    border:2px solid #f59e0b; text-decoration:none;
    animation:borderGlow 2.5s ease-in-out infinite, fadeUp .8s .2s both;
    transition:background .2s;
  }
  a.btn-cta:hover { background:rgba(245,158,11,.12); }

  /* ── Nav ── */
  .nav-link { color:rgba(255,255,255,.7); text-decoration:none; font-size:14px; font-family:'DM Sans',sans-serif; font-weight:500; transition:color .2s; padding:6px 0; }
  .nav-link:hover { color:#fff; }
  .nav-links { display:flex; gap:36px; align-items:center; }

  /* Nav auth button hover */
  .nav-auth-login:hover { border-color:rgba(255,255,255,.6) !important; background:rgba(255,255,255,.06) !important; }

  /* Mobile nav drawer */
  .mob-menu {
    position:fixed; top:64px; left:0; right:0; z-index:99;
    background:rgba(6,14,28,.97); backdrop-filter:blur(20px);
    border-bottom:1px solid rgba(255,255,255,.08);
    display:flex; flex-direction:column; gap:0;
    animation:slideDown .2s ease both;
  }
  .mob-menu a { display:block; padding:16px 24px; color:rgba(255,255,255,.8); text-decoration:none; font-size:16px; font-family:'DM Sans',sans-serif; border-bottom:1px solid rgba(255,255,255,.06); transition:background .15s; }
  .mob-menu a:hover { background:rgba(255,255,255,.05); }
  .mob-menu a:last-child { border-bottom:none; }

  /* Hamburger */
  .ham { display:none; flex-direction:column; gap:5px; cursor:pointer; padding:4px; background:none; border:none; }
  .ham span { display:block; width:22px; height:2px; background:#fff; border-radius:2px; transition:all .25s; }
  .ham.open span:nth-child(1) { transform:translateY(7px) rotate(45deg); }
  .ham.open span:nth-child(2) { opacity:0; }
  .ham.open span:nth-child(3) { transform:translateY(-7px) rotate(-45deg); }

  /* ── Cards ── */
  .feature-card {
    background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.08);
    border-radius:16px; padding:24px 20px;
    transition:border-color .25s, transform .25s, background .25s; cursor:default;
  }
  .feature-card:hover { border-color:rgba(13,148,136,.6); background:rgba(13,148,136,.07); transform:translateY(-4px); }

  .stat-card {
    background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.07);
    border-radius:16px; padding:24px 20px; transition:border-color .25s; text-align:center;
    position:relative; overflow:hidden;
  }
  .stat-card:hover { border-color:rgba(244,63,94,.5); }

  /* ── Ticker ── */
  .ticker-wrap  { overflow:hidden; background:rgba(13,148,136,.1); border-top:1px solid rgba(13,148,136,.2); border-bottom:1px solid rgba(13,148,136,.2); padding:10px 0; }
  .ticker-inner { display:flex; gap:64px; white-space:nowrap; animation:ticker 22s linear infinite; }
  .ticker-item  { font-size:13px; color:rgba(255,255,255,.5); font-family:'DM Sans',sans-serif; display:flex; align-items:center; gap:10px; }
  .ticker-item::before { content:''; width:5px; height:5px; border-radius:50%; background:#0d9488; display:inline-block; flex-shrink:0; }

  /* ── Demo table ── */
  .demo-table   { width:100%; border-collapse:collapse; font-size:11px; }
  .demo-table th{ padding:6px 8px; color:rgba(255,255,255,.4); font-weight:500; border-bottom:1px solid rgba(255,255,255,.07); font-family:'DM Sans',sans-serif; }
  .demo-table td{ padding:5px; border:1px solid rgba(255,255,255,.04); }
  .demo-cell    { padding:4px 7px; border-radius:5px; font-weight:600; font-size:11px; color:#fff; }
  .float-demo   { animation: floatY 5s ease-in-out infinite; }

  /* ══ RESPONSIVE GRIDS ══ */

  /* Stats: 4 col → 2 col → 1 col */
  .stats-grid {
    display:grid; grid-template-columns:repeat(4,1fr); gap:16px;
    max-width:1100px; margin:0 auto; position:relative; z-index:1;
  }

  /* Problem: 2 col → 1 col */
  .problem-grid { display:grid; grid-template-columns:1fr 1fr; gap:48px; align-items:center; }

  /* Features: 2 col → 1 col */
  .features-grid { display:grid; grid-template-columns:1fr 1.4fr; gap:48px; align-items:center; }

  /* Feature cards inner: 2x2 */
  .feature-cards-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }

  /* Hero section padding */
  .hero-content { position:relative; z-index:1; padding:120px 60px 80px; max-width:560px; }

  /* Section padding */
  .section-pad { padding:80px 60px; }
  .section-pad-lg { padding:100px 60px; }
  .section-pad-cta { padding:120px 60px; text-align:center; }

  /* Footer */
  .footer-inner { padding:32px 60px; display:flex; justify-content:space-between; align-items:center; position:relative; z-index:1; flex-wrap:wrap; gap:16px; }
  .footer-links { display:flex; gap:28px; }

  /* ══ TABLET (≤900px) ══ */
  @media (max-width:900px) {
    .nav-links { display:none; }
    .ham { display:flex; }
    .stats-grid { grid-template-columns:repeat(2,1fr); }
    .problem-grid { grid-template-columns:1fr; gap:40px; }
    .features-grid { grid-template-columns:1fr; gap:40px; }
    .hero-content { padding:100px 32px 64px; }
    .section-pad { padding:60px 32px; }
    .section-pad-lg { padding:72px 32px; }
    .section-pad-cta { padding:80px 32px; }
    .footer-inner { padding:28px 32px; }
  }

  /* ══ MOBILE (≤600px) ══ */
  @media (max-width:600px) {
    .stats-grid { grid-template-columns:1fr 1fr; gap:12px; }
    .feature-cards-grid { grid-template-columns:1fr; }
    .hero-content { padding:88px 20px 48px; }
    .section-pad { padding:48px 20px; }
    .section-pad-lg { padding:56px 20px; }
    .section-pad-cta { padding:64px 20px; }
    .footer-inner { padding:24px 20px; flex-direction:column; align-items:flex-start; gap:20px; }
    .footer-links { gap:20px; }
    .btn-primary, a.btn-primary, .btn-outline { font-size:14px; padding:11px 22px; }
    a.btn-cta { font-size:15px; padding:14px 32px; }
    .stat-card { padding:20px 16px; }
    .feature-card { padding:20px 16px; }
  }

  /* Engine badge — hide text on very small screens */
  @media (max-width:380px) {
    .engine-badge-text { display:none; }
  }
`;

/* ══════════════════════════════════════════════════════════════
   THREE.JS CANVASES
══════════════════════════════════════════════════════════════ */
function HeroCanvas() {
  const ref = useRef();
  useEffect(() => {
    const el = ref.current;
    const W = el.clientWidth||700, H = el.clientHeight||520;
    const renderer = new THREE.WebGLRenderer({ canvas:el, alpha:true, antialias:true });
    renderer.setSize(W,H); renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45,W/H,0.1,100);
    camera.position.set(0,2,7); camera.lookAt(0,0,0);

    const grid = new THREE.GridHelper(10,14,0x0d9488,0x0d9488);
    grid.material.opacity=0.22; grid.material.transparent=true; grid.rotation.x=0.35;
    scene.add(grid);

    const COLS=[0xf43f5e,0x0d9488,0xf59e0b,0x6366f1];
    const POS=[[-2.2,1.2,-1],[-0.6,1.6,-0.5],[1.2,0.9,-0.8],[-1.6,-0.3,0.2],[0.4,-0.6,0.4],[2.0,0.2,-0.3],[-0.2,2.2,-1.2],[1.8,1.8,-0.9]];
    const cards=POS.map(([x,y,z],i)=>{
      const m=new THREE.Mesh(new THREE.BoxGeometry(0.9,0.32,0.04),new THREE.MeshBasicMaterial({color:COLS[i%COLS.length],transparent:true,opacity:0.85}));
      m.position.set(x,y,z); m.userData={baseY:y,speed:0.4+Math.random()*0.6,phase:Math.random()*Math.PI*2};
      scene.add(m); return m;
    });

    const pPos=new Float32Array(120*3);
    for(let i=0;i<120;i++){pPos[i*3]=(Math.random()-.5)*14;pPos[i*3+1]=(Math.random()-.5)*10;pPos[i*3+2]=(Math.random()-.5)*8;}
    const pGeo=new THREE.BufferGeometry();
    pGeo.setAttribute("position",new THREE.BufferAttribute(pPos,3));
    scene.add(new THREE.Points(pGeo,new THREE.PointsMaterial({color:0x0d9488,size:0.06,transparent:true,opacity:0.55})));

    const frame=new THREE.Mesh(new THREE.BoxGeometry(4.2,2.6,0.05),new THREE.MeshBasicMaterial({color:0x0d9488,wireframe:true,transparent:true,opacity:0.18}));
    frame.position.set(0.3,0.6,-1.5); frame.rotation.set(0.12,-0.18,0); scene.add(frame);

    let t=0,raf;
    const tick=()=>{
      t+=0.012;
      cards.forEach(c=>{c.position.y=c.userData.baseY+Math.sin(t*c.userData.speed+c.userData.phase)*0.18;c.rotation.z=Math.sin(t*0.3+c.userData.phase)*0.06;});
      grid.position.y=-1.5+Math.sin(t*0.2)*0.08;
      frame.rotation.y=-0.18+Math.sin(t*0.15)*0.04;
      renderer.render(scene,camera); raf=requestAnimationFrame(tick);
    };
    raf=requestAnimationFrame(tick);
    const onResize=()=>{if(!ref.current)return;const w=ref.current.clientWidth,h=ref.current.clientHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);};
    window.addEventListener("resize",onResize);
    return ()=>{cancelAnimationFrame(raf);window.removeEventListener("resize",onResize);renderer.dispose();};
  },[]);
  return <canvas ref={ref} style={{width:"100%",height:"100%",display:"block"}} />;
}

function StatsCanvas() {
  const ref = useRef();
  useEffect(() => {
    const el=ref.current;
    const W=el.clientWidth||800,H=el.clientHeight||220;
    const renderer=new THREE.WebGLRenderer({canvas:el,alpha:true,antialias:true});
    renderer.setSize(W,H); renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    const scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(50,W/H,0.1,100);
    camera.position.set(0,0,6); camera.lookAt(0,0,0);

    const ringColors=[0xf43f5e,0x0d9488,0xf59e0b,0x6366f1];
    const rings=ringColors.map((col,i)=>{
      const mesh=new THREE.Mesh(new THREE.TorusGeometry(0.55,0.025,16,80),new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0.55}));
      mesh.position.x=-4.5+i*3; mesh.rotation.x=Math.PI/2.5;
      scene.add(mesh); return mesh;
    });
    const icos=ringColors.map((col,i)=>{
      const mesh=new THREE.Mesh(new THREE.IcosahedronGeometry(0.18,0),new THREE.MeshBasicMaterial({color:col,wireframe:true,transparent:true,opacity:0.7}));
      mesh.position.x=-4.5+i*3; scene.add(mesh); return mesh;
    });

    let t=0,raf;
    const tick=()=>{
      t+=0.012;
      rings.forEach((r,i)=>{r.rotation.z=t*0.4+i*0.8;r.rotation.x=Math.PI/2.5+Math.sin(t*0.3+i)*0.2;});
      icos.forEach((m,i)=>{m.rotation.x=t*0.7+i;m.rotation.y=t*0.5+i;});
      renderer.render(scene,camera); raf=requestAnimationFrame(tick);
    };
    raf=requestAnimationFrame(tick);
    const onResize=()=>{if(!ref.current)return;const w=ref.current.clientWidth,h=ref.current.clientHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);};
    window.addEventListener("resize",onResize);
    return ()=>{cancelAnimationFrame(raf);window.removeEventListener("resize",onResize);renderer.dispose();};
  },[]);
  return <canvas ref={ref} style={{width:"100%",height:"100%",display:"block"}} />;
}

function FeaturesCanvas() {
  const ref = useRef();
  useEffect(() => {
    const el=ref.current;
    const W=el.clientWidth||400,H=el.clientHeight||400;
    const renderer=new THREE.WebGLRenderer({canvas:el,alpha:true,antialias:true});
    renderer.setSize(W,H); renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    const scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(50,W/H,0.1,100);
    camera.position.set(0,0,5); camera.lookAt(0,0,0);

    const geos=[new THREE.OctahedronGeometry(0.5,0),new THREE.TetrahedronGeometry(0.55,0),new THREE.IcosahedronGeometry(0.45,0),new THREE.DodecahedronGeometry(0.45,0),new THREE.OctahedronGeometry(0.35,0),new THREE.TetrahedronGeometry(0.4,0)];
    const cols=[0xf43f5e,0x0d9488,0xf59e0b,0x6366f1,0x0d9488,0xf43f5e];
    const positions=[[-1.2,0.8,0],[1.0,1.0,-.5],[0,-0.8,0.3],[-0.9,-1.0,-.2],[1.2,-0.5,.4],[0.1,0.1,-1]];
    const shapes=positions.map(([x,y,z],i)=>{
      const m=new THREE.Mesh(geos[i],new THREE.MeshBasicMaterial({color:cols[i],wireframe:true,transparent:true,opacity:0.55}));
      m.position.set(x,y,z); m.userData={rx:Math.random()*0.02-0.01,ry:Math.random()*0.02-0.01,phase:Math.random()*Math.PI*2,baseY:y};
      scene.add(m); return m;
    });

    let t=0,raf;
    const tick=()=>{
      t+=0.008;
      shapes.forEach(s=>{s.rotation.x+=s.userData.rx;s.rotation.y+=s.userData.ry;s.position.y=s.userData.baseY+Math.sin(t+s.userData.phase)*0.15;});
      renderer.render(scene,camera); raf=requestAnimationFrame(tick);
    };
    raf=requestAnimationFrame(tick);
    const onResize=()=>{if(!ref.current)return;const w=ref.current.clientWidth,h=ref.current.clientHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);};
    window.addEventListener("resize",onResize);
    return ()=>{cancelAnimationFrame(raf);window.removeEventListener("resize",onResize);renderer.dispose();};
  },[]);
  return <canvas ref={ref} style={{width:"100%",height:"100%",display:"block"}} />;
}

function CtaCanvas() {
  const ref = useRef();
  useEffect(() => {
    const el=ref.current;
    const W=el.clientWidth||800,H=el.clientHeight||480;
    const renderer=new THREE.WebGLRenderer({canvas:el,alpha:true,antialias:true});
    renderer.setSize(W,H); renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    const scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(45,W/H,0.1,100);
    camera.position.set(0,0,5); camera.lookAt(0,0,0);

    const knot=new THREE.Mesh(new THREE.TorusKnotGeometry(1.2,0.28,160,20,2,3),new THREE.MeshBasicMaterial({color:0x0d9488,wireframe:true,transparent:true,opacity:0.22}));
    scene.add(knot);
    const outerRing=new THREE.Mesh(new THREE.TorusGeometry(2.1,0.02,8,120),new THREE.MeshBasicMaterial({color:0xf43f5e,transparent:true,opacity:0.35}));
    outerRing.rotation.x=Math.PI/3; scene.add(outerRing);
    const ring2=new THREE.Mesh(new THREE.TorusGeometry(1.7,0.015,8,100),new THREE.MeshBasicMaterial({color:0xf59e0b,transparent:true,opacity:0.3}));
    ring2.rotation.y=Math.PI/4; scene.add(ring2);

    const orbiters=[0xf43f5e,0xf59e0b,0x6366f1].map((col,i)=>{
      const mesh=new THREE.Mesh(new THREE.SphereGeometry(0.08,12,12),new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0.9}));
      scene.add(mesh); return {mesh,radius:2.1,speed:0.4+i*0.2,offset:(i/3)*Math.PI*2};
    });

    const pPos=new Float32Array(200*3);
    for(let i=0;i<200;i++){pPos[i*3]=(Math.random()-.5)*12;pPos[i*3+1]=(Math.random()-.5)*10;pPos[i*3+2]=(Math.random()-.5)*6;}
    const pGeo=new THREE.BufferGeometry();
    pGeo.setAttribute("position",new THREE.BufferAttribute(pPos,3));
    scene.add(new THREE.Points(pGeo,new THREE.PointsMaterial({color:0x0d9488,size:0.04,transparent:true,opacity:0.35})));

    let t=0,raf;
    const tick=()=>{
      t+=0.006;
      knot.rotation.x=t*0.3; knot.rotation.y=t*0.4;
      outerRing.rotation.z=t*0.2; outerRing.rotation.x=Math.PI/3+Math.sin(t*0.1)*0.1;
      ring2.rotation.x=t*0.15; ring2.rotation.z=-t*0.25;
      orbiters.forEach(({mesh,radius,speed,offset})=>{mesh.position.x=Math.cos(t*speed+offset)*radius;mesh.position.y=Math.sin(t*speed+offset)*radius*0.5;mesh.position.z=Math.sin(t*speed*0.7+offset)*0.5;});
      renderer.render(scene,camera); raf=requestAnimationFrame(tick);
    };
    raf=requestAnimationFrame(tick);
    const onResize=()=>{if(!ref.current)return;const w=ref.current.clientWidth,h=ref.current.clientHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);};
    window.addEventListener("resize",onResize);
    return ()=>{cancelAnimationFrame(raf);window.removeEventListener("resize",onResize);renderer.dispose();};
  },[]);
  return <canvas ref={ref} style={{width:"100%",height:"100%",display:"block"}} />;
}

function FooterCanvas() {
  const ref = useRef();
  useEffect(() => {
    const el=ref.current;
    const W=el.clientWidth||900,H=el.clientHeight||100;
    const renderer=new THREE.WebGLRenderer({canvas:el,alpha:true,antialias:true});
    renderer.setSize(W,H); renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    const scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(40,W/H,0.1,100);
    camera.position.set(0,0,4); camera.lookAt(0,0,0);

    const waveLines=[0x0d9488,0xf43f5e,0xf59e0b].map((col,li)=>{
      const pts=[];
      for(let i=0;i<=80;i++)pts.push(new THREE.Vector3(-5+i*0.125,0,0));
      const geo=new THREE.BufferGeometry().setFromPoints(pts);
      const line=new THREE.Line(geo,new THREE.LineBasicMaterial({color:col,transparent:true,opacity:0.35}));
      line.userData={offset:li*0.8,amplitude:0.12+li*0.05};
      scene.add(line); return line;
    });

    let t=0,raf;
    const tick=()=>{
      t+=0.025;
      waveLines.forEach(line=>{
        const pos=line.geometry.attributes.position;
        for(let i=0;i<=80;i++)pos.setY(i,Math.sin(i*0.18+t+line.userData.offset)*line.userData.amplitude);
        pos.needsUpdate=true;
      });
      renderer.render(scene,camera); raf=requestAnimationFrame(tick);
    };
    raf=requestAnimationFrame(tick);
    return ()=>{cancelAnimationFrame(raf);renderer.dispose();};
  },[]);
  return <canvas ref={ref} style={{width:"100%",height:"100%",display:"block"}} />;
}

/* ══════════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════════ */
function Counter({to,suffix=""}) {
  const [val,setVal]=useState(0);
  const ref=useRef();
  useEffect(()=>{
    const obs=new IntersectionObserver(([e])=>{
      if(!e.isIntersecting)return;
      let v=0;const step=Math.ceil(to/40);
      const t=setInterval(()=>{v=Math.min(v+step,to);setVal(v);if(v>=to)clearInterval(t);},30);
    },{threshold:0.5});
    if(ref.current)obs.observe(ref.current);
    return ()=>obs.disconnect();
  },[to]);
  return <span ref={ref}>{val.toLocaleString()}{suffix}</span>;
}

function useReveal(delay=0) {
  const ref=useRef();
  const [vis,setVis]=useState(false);
  useEffect(()=>{
    const obs=new IntersectionObserver(([e])=>{if(e.isIntersecting)setVis(true);},{threshold:0.12});
    if(ref.current)obs.observe(ref.current);
    return ()=>obs.disconnect();
  },[]);
  return [ref,vis?{animation:`fadeUp .7s cubic-bezier(.16,1,.3,1) ${delay}s both`}:{opacity:0}];
}

function DemoTable() {
  const days=["Mon","Tue","Wed","Thu","Fri"];
  const rows=[["DSA","","","CN",""],["","LAB","","","OS"],["DAB","","DDMS","",""],["","CN","","LAB","DSA"],["OS","","","DAB",""]];
  const colors={DSA:"#f43f5e",DAB:"#f43f5e",CN:"#f59e0b",OS:"#6366f1",LAB:"#0d9488",DDMS:"#f59e0b"};
  return (
    <table className="demo-table">
      <thead><tr><th></th>{days.map(d=><th key={d}>{d}</th>)}</tr></thead>
      <tbody>{rows.map((row,ri)=>(
        <tr key={ri}>
          <td style={{color:"rgba(255,255,255,.3)",fontSize:10,paddingRight:6}}>{ri+1}</td>
          {row.map((cell,ci)=><td key={ci}>{cell?<div className="demo-cell" style={{background:colors[cell]}}>{cell}</div>:null}</td>)}
        </tr>
      ))}</tbody>
    </table>
  );
}

/* ══════════════════════════════════════════════════════════════
   APP
══════════════════════════════════════════════════════════════ */
export default function App() {
  const [scrolled,setScrolled]=useState(false);
  const [menuOpen,setMenuOpen]=useState(false);

  useEffect(()=>{
    const fn=()=>{setScrolled(window.scrollY>40);};
    window.addEventListener("scroll",fn);
    return ()=>window.removeEventListener("scroll",fn);
  },[]);

  // Close menu on outside click
  useEffect(()=>{
    if(!menuOpen)return;
    const fn=(e)=>{if(!e.target.closest(".mob-menu")&&!e.target.closest(".ham"))setMenuOpen(false);};
    document.addEventListener("click",fn);
    return ()=>document.removeEventListener("click",fn);
  },[menuOpen]);

  const [rPH,sPH]=useReveal(0);
  const [rPL,sPL]=useReveal(0.1);
  const [rPR,sPR]=useReveal(0.2);
  const [rFH,sFH]=useReveal(0);
  const [rF1,sF1]=useReveal(0);
  const [rF2,sF2]=useReveal(0.08);
  const [rF3,sF3]=useReveal(0.16);

  const features=[
    {icon:"🗓",label:"Auto Timetable",     desc:"AI schedules all subjects automatically without conflicts.",  color:C.amber},
    {icon:"🧪",label:"Lab Scheduling",      desc:"Smart lab slot allocation across all divisions.",             color:C.teal },
    {icon:"🏛",label:"Division Management", desc:"Handle multiple divisions and semesters simultaneously.",     color:C.pink },
    {icon:"📊",label:"Excel Export",        desc:"One-click export to Excel, PDF or shareable link.",          color:C.amber},
  ];
  const stats=[
    {val:500,  suffix:"+",label:"Colleges"},
    {val:18000,suffix:"+",label:"Schedules generated"},
    {val:99,   suffix:"%",label:"Conflict-free"},
    {val:10,   suffix:"s",label:"Avg generation time"},
  ];
  const steps=[
    {num:"01",title:"Smart conflict detection",desc:"Every schedule is checked in real-time for room, teacher, and time conflicts."},
    {num:"02",title:"Multi-division support",  desc:"Manage SE-A through SE-D and more — all divisions scheduled in parallel."},
    {num:"03",title:"Instant export",          desc:"Download your timetable as Excel, PDF, or share a live preview link."},
  ];
  const navLinks=["Product","Features","How it Works","Dashboard"];

  return (
    <>
      <style dangerouslySetInnerHTML={{__html:GLOBAL_CSS}} />

      {/* ── Navbar ── */}
      <nav style={{
        position:"fixed",top:0,left:0,right:0,zIndex:100,
        padding:"0 24px 0 32px",height:64,
        display:"flex",alignItems:"center",justifyContent:"space-between",
        background:scrolled?"rgba(6,14,28,.92)":"transparent",
        backdropFilter:scrolled?"blur(16px)":"none",
        borderBottom:scrolled?"1px solid rgba(255,255,255,.07)":"none",
        transition:"background .3s",
      }}>
        {/* Logo */}
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:32,height:32,borderRadius:8,background:`linear-gradient(135deg,${C.pink},${C.teal})`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:14,color:"#fff",flexShrink:0}}>AI</div>
          <span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:15,color:"#fff",letterSpacing:-.3}}>Timetable</span>
        </div>

        {/* Desktop nav links */}
        <div className="nav-links">
          {navLinks.map(l=>(
            <a key={l} href={l==="Dashboard"?DASHBOARD_URL:"#"} className="nav-link">{l}</a>
          ))}
        </div>

        {/* Desktop right side: auth buttons + engine badge + hamburger */}
        <div style={{display:"flex",alignItems:"center",gap:12}}>

          {/* Auth buttons — hidden on mobile (hamburger shows them) */}
          <div className="nav-links" style={{gap:8}}>
            <a
              href="/Login"
              className="nav-auth-login"
              style={{
                color:"rgba(255,255,255,.8)",textDecoration:"none",fontSize:13,
                fontFamily:"'DM Sans',sans-serif",fontWeight:500,
                padding:"7px 18px",border:"1px solid rgba(255,255,255,.22)",
                borderRadius:999,transition:"border-color .2s,background .2s",
                backdropFilter:"blur(8px)",whiteSpace:"nowrap",
              }}
            >
              Login
            </a>
            <a
              href="/signup"
              className="btn-primary"
              style={{padding:"7px 18px",fontSize:13,boxShadow:"0 2px 14px rgba(244,63,94,.4)"}}
            >
              Sign Up
            </a>
          </div>

          {/* Engine badge */}
          <div style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:C.teal,fontWeight:500,fontFamily:"'DM Sans',sans-serif"}}>
            <span style={{width:7,height:7,background:C.teal,borderRadius:"50%",display:"inline-block",animation:"pulse 1.5s ease-in-out infinite",flexShrink:0}} />
            <span className="engine-badge-text">AI Engine Ready</span>
          </div>

          {/* Hamburger */}
          <button className={`ham${menuOpen?" open":""}`} onClick={()=>setMenuOpen(o=>!o)} aria-label="Menu">
            <span/><span/><span/>
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="mob-menu">
          {navLinks.map(l=>(
            <a key={l} href={l==="Dashboard"?DASHBOARD_URL:"#"} onClick={()=>setMenuOpen(false)}>{l}</a>
          ))}
          {/* Auth links in mobile drawer */}
          <a href="/Login" onClick={()=>setMenuOpen(false)} style={{fontWeight:500}}>
            Login
          </a>
          <a href="/signup" onClick={()=>setMenuOpen(false)} style={{color:"#f43f5e",fontWeight:600}}>
            Sign Up →
          </a>
        </div>
      )}

      {/* ══ HERO ══ */}
      <section style={{minHeight:"100vh",position:"relative",overflow:"hidden",display:"flex",alignItems:"center",background:`radial-gradient(ellipse 80% 60% at 60% 40%,rgba(13,148,136,.18) 0%,transparent 70%),radial-gradient(ellipse 50% 50% at 20% 70%,rgba(244,63,94,.14) 0%,transparent 60%),linear-gradient(160deg,#0a1628 0%,#060e1c 100%)`}}>
        <div style={{position:"absolute",inset:0,zIndex:0}}><HeroCanvas /></div>
        <div className="hero-content">
          <div style={{display:"inline-flex",alignItems:"center",gap:8,background:"rgba(13,148,136,.15)",border:"1px solid rgba(13,148,136,.3)",borderRadius:999,padding:"6px 16px",marginBottom:24,animation:"fadeIn .6s .1s both"}}>
            <span style={{width:7,height:7,background:C.teal,borderRadius:"50%",animation:"pulse 1.5s infinite",flexShrink:0}} />
            <span style={{fontSize:12,color:C.teal,fontWeight:500,fontFamily:"'DM Sans',sans-serif"}}>Powered by AI Scheduling Engine</span>
          </div>
          <h1 style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:"clamp(36px,6vw,68px)",lineHeight:1.08,color:"#fff",marginBottom:20,animation:"fadeUp .8s cubic-bezier(.16,1,.3,1) .2s both"}}>
            AI Timetable<br/>
            <span style={{backgroundImage:`linear-gradient(90deg,${C.pink},${C.teal})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}}>Generator</span>
          </h1>
          <p style={{fontSize:"clamp(15px,2vw,17px)",color:"rgba(255,255,255,.6)",lineHeight:1.7,maxWidth:420,marginBottom:36,fontFamily:"'DM Sans',sans-serif",fontWeight:300,animation:"fadeUp .8s .35s both"}}>
            Automatically generate conflict-free college schedules in seconds. Built for academic institutions that demand precision.
          </p>
          <div style={{display:"flex",gap:14,flexWrap:"wrap",alignItems:"center",animation:"fadeUp .8s .5s both"}}>
            <a href="/Home" className="btn-primary btn-glow">Generate Timetable →</a>
            <button className="btn-outline">View Demo</button>
          </div>
        </div>
      </section>

      {/* ── Ticker ── */}
      <div className="ticker-wrap">
        <div className="ticker-inner">
          {[...Array(2)].flatMap((_,arr)=>["Auto Scheduling","Zero Conflicts","Lab Management","Excel Export","Division Control","AI Powered","Real-time Preview","Multi-semester"].map((t,i)=>(
            <span key={`${arr}-${i}`} className="ticker-item">{t}</span>
          )))}
        </div>
      </div>

      {/* ══ STATS ══ */}
      <section className="section-pad" style={{position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",inset:0,zIndex:0,opacity:0.6}}><StatsCanvas /></div>
        <div className="stats-grid">
          {stats.map((s,i)=>(
            <div key={i} className="stat-card">
              <div style={{fontFamily:"'Syne',sans-serif",fontSize:"clamp(32px,4vw,42px)",fontWeight:800,color:"#fff",lineHeight:1}}>
                <Counter to={s.val} suffix={s.suffix} />
              </div>
              <div style={{fontSize:13,color:"rgba(255,255,255,.45)",marginTop:8,fontFamily:"'DM Sans',sans-serif"}}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ══ PROBLEM ══ */}
      <section id="features" className="section-pad-lg" style={{position:"relative",overflow:"hidden"}}>
        <div style={{maxWidth:1200,margin:"0 auto"}}>
          <div ref={rPH} style={{textAlign:"center",marginBottom:56,...sPH}}>
            <div style={{fontSize:12,letterSpacing:3,textTransform:"uppercase",color:C.teal,fontWeight:600,marginBottom:12,fontFamily:"'DM Sans',sans-serif"}}>The Challenge</div>
            <h2 style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:"clamp(26px,4vw,44px)",color:"#fff"}}>Problem Explanation</h2>
          </div>

          <div className="problem-grid">
            {/* Left */}
            <div ref={rPL} style={{...sPL}}>
              <div style={{background:"rgba(13,148,136,.06)",border:"1px solid rgba(13,148,136,.2)",borderRadius:20,padding:"28px 24px",marginBottom:24}}>
                <p style={{fontSize:"clamp(18px,2.5vw,22px)",fontFamily:"'Syne',sans-serif",fontWeight:700,color:"#fff",lineHeight:1.4,marginBottom:12}}>
                  Manual timetable creation is complex and time-consuming
                </p>
                <p style={{fontSize:15,color:"rgba(255,255,255,.55)",lineHeight:1.7,fontFamily:"'DM Sans',sans-serif"}}>
                  Scheduling across subjects, labs, and divisions manually leads to conflicts, wasted hours, and frustrated staff. AI eliminates all of that.
                </p>
              </div>
              <ul style={{listStyle:"none",display:"flex",flexDirection:"column",gap:10}}>
                {["AI automatically schedules subjects, labs, and divisions without conflicts","Real-time conflict detection and resolution","Works across all semesters simultaneously"].map((item,i)=>(
                  <li key={i} style={{display:"flex",gap:10,alignItems:"flex-start",fontSize:14,color:"rgba(255,255,255,.65)",fontFamily:"'DM Sans',sans-serif"}}>
                    <span style={{width:18,height:18,background:"rgba(13,148,136,.25)",border:`1px solid ${C.teal}`,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:2,fontSize:10,color:C.teal,fontWeight:700}}>✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Right — 3D + feature cards */}
            <div ref={rPR} style={{position:"relative",minHeight:340,...sPR}}>
              <div style={{position:"absolute",inset:0,zIndex:0,borderRadius:20,overflow:"hidden",opacity:0.75}}>
                <FeaturesCanvas />
              </div>
              <div className="feature-cards-grid" style={{position:"relative",zIndex:1}}>
                {features.map((f,i)=>(
                  <div key={i} className="feature-card" style={{backdropFilter:"blur(12px)"}}>
                    <div style={{fontSize:26,marginBottom:12}}>{f.icon}</div>
                    <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:15,color:"#fff",marginBottom:6}}>{f.label}</div>
                    <div style={{fontSize:13,color:"rgba(255,255,255,.5)",lineHeight:1.6,fontFamily:"'DM Sans',sans-serif"}}>{f.desc}</div>
                    <div style={{height:2,background:`linear-gradient(90deg,${f.color},transparent)`,borderRadius:1,marginTop:14}} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ PRODUCT FEATURES ══ */}
      <section id="how-it-works" className="section-pad-lg" style={{background:"radial-gradient(ellipse 70% 60% at 50% 50%,rgba(13,148,136,.07) 0%,transparent 70%)"}}>
        <div style={{maxWidth:1100,margin:"0 auto"}}>
          <div ref={rFH} style={{textAlign:"center",marginBottom:56,...sFH}}>
            <div style={{fontSize:12,letterSpacing:3,textTransform:"uppercase",color:C.teal,fontWeight:600,marginBottom:12,fontFamily:"'DM Sans',sans-serif"}}>Preview</div>
            <h2 style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:"clamp(26px,4vw,44px)",color:"#fff"}}>Product Features</h2>
          </div>
          <div className="features-grid">
            <div>
              {steps.map((item,i)=>(
                <div key={i} ref={[rF1,rF2,rF3][i]} style={{display:"flex",gap:18,marginBottom:28,...[sF1,sF2,sF3][i]}}>
                  <div style={{width:44,height:44,background:"rgba(13,148,136,.12)",border:"1px solid rgba(13,148,136,.25)",borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:13,color:C.teal,flexShrink:0}}>{item.num}</div>
                  <div>
                    <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:"clamp(15px,2vw,17px)",color:"#fff",marginBottom:5}}>{item.title}</div>
                    <div style={{fontSize:14,color:"rgba(255,255,255,.5)",lineHeight:1.65,fontFamily:"'DM Sans',sans-serif"}}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="float-demo" style={{background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.08)",borderRadius:20,padding:"20px 16px"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14,flexWrap:"wrap"}}>
                <div style={{width:9,height:9,borderRadius:"50%",background:C.pink}} />
                <div style={{width:9,height:9,borderRadius:"50%",background:C.amber}} />
                <div style={{width:9,height:9,borderRadius:"50%",background:C.teal}} />
                <span style={{marginLeft:6,fontSize:11,color:"rgba(255,255,255,.4)",fontFamily:"'DM Sans',sans-serif"}}>Timetable Preview — SE-A Week 1</span>
              </div>
              <DemoTable />
              <div style={{marginTop:12,fontSize:11,color:"rgba(255,255,255,.3)",textAlign:"center",fontFamily:"'DM Sans',sans-serif"}}>Preview generated timetables before exporting them</div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ CTA ══ */}
      <section className="section-pad-cta" style={{position:"relative",overflow:"hidden",background:"linear-gradient(180deg,transparent 0%,rgba(244,63,94,.06) 40%,rgba(13,148,136,.08) 100%)"}}>
        <div style={{position:"absolute",inset:0,zIndex:0,opacity:0.8}}><CtaCanvas /></div>
        <div style={{position:"relative",zIndex:1}}>
          <div style={{fontSize:12,letterSpacing:3,textTransform:"uppercase",color:C.teal,fontWeight:600,marginBottom:20,fontFamily:"'DM Sans',sans-serif",animation:"fadeIn 1s both"}}>Get Started</div>
          <h2 style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:"clamp(28px,5vw,58px)",color:"#fff",marginBottom:40,animation:"fadeUp .8s both",lineHeight:1.15}}>
            Ready to generate your<br/>
            <span style={{backgroundImage:`linear-gradient(90deg,${C.pink},${C.amber},${C.teal})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}}>timetable?</span>
          </h2>
          <a href={DASHBOARD_URL} className="btn-cta">Open Dashboard →</a>
        </div>
      </section>

      {/* ══ FOOTER ══ */}
      <footer style={{borderTop:"1px solid rgba(255,255,255,.07)",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",inset:0,zIndex:0,opacity:0.6,height:100}}><FooterCanvas /></div>
        <div className="footer-inner">
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:26,height:26,background:`linear-gradient(135deg,${C.pink},${C.teal})`,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:"#fff",fontFamily:"'Syne',sans-serif"}}>AI</div>
            <span style={{fontSize:13,color:"rgba(255,255,255,.4)",fontFamily:"'DM Sans',sans-serif"}}>AI Timetable Generator © 2026</span>
          </div>
          <div className="footer-links">
            {["Privacy","Terms","Contact"].map(l=>(
              <a key={l} href="#" style={{fontSize:13,color:"rgba(255,255,255,.35)",textDecoration:"none",fontFamily:"'DM Sans',sans-serif"}}>{l}</a>
            ))}
          </div>
        </div>
      </footer>
    </>
  );
}