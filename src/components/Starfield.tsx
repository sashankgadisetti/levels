import { useEffect, useRef } from "react";

/** Dark drifting cyan particles behind the main window (port of the prototype's #fx canvas). */
export function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const g = c?.getContext("2d");
    if (!c || !g) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, raf = 0;
    const pts = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.4 + 0.4, v: Math.random() * 0.00006 + 0.00001, a: Math.random() * 0.5 + 0.2 }));
    const size = () => { w = c.width = window.innerWidth; h = c.height = window.innerHeight; };
    const draw = () => {
      g.clearRect(0, 0, w, h);
      for (const p of pts) {
        if (!reduced) { p.y -= p.v * 16; if (p.y < 0) { p.y = 1; p.x = Math.random(); } }
        g.beginPath(); g.fillStyle = `rgba(63,216,255,${p.a})`; g.shadowColor = "#3fd8ff"; g.shadowBlur = 8;
        g.arc(p.x * w, p.y * h, p.r, 0, 7); g.fill();
      }
      if (!reduced) raf = requestAnimationFrame(draw);
    };
    size(); draw();
    window.addEventListener("resize", size);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", size); };
  }, []);
  return <canvas ref={ref} className="star-canvas" aria-hidden />;
}
