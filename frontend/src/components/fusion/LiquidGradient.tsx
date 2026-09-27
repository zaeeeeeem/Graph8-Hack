"use client";

import { useEffect, useRef } from "react";
import { LIQUID_GRADIENT_FRAG } from "./liquidGradient.frag";

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// Uniform values from the reference card instance.
const COLORS: [number, number, number][] = [
  [0, 0, 0],
  [33, 159, 241],
  [0, 0, 0],
  [255, 81, 0],
];
const UNIFORMS: Record<string, number> = {
  u_contrast: 1.1,
  u_distBias: 0,
  u_dither: 0.05,
  u_ditherMode: 0,
  u_exposure: 1.1,
  u_jellify: 0,
  u_loop: 0,
  u_saturation: 1,
  u_scale: 0.17,
  u_seed: 648,
  u_speed: 0.5,
  u_turbAmp: 0.6,
  u_turbFreq: 0.7,
  u_turbIter: 6,
  u_waveFreq: 3.8,
};

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export function LiquidGradient({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const gl = canvas.getContext("webgl2", { antialias: false, premultipliedAlpha: false });
    if (!gl) return;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, LIQUID_GRADIENT_FRAG);
    if (!vs || !fs) return;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(prog));
      return;
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const u = (name: string) => gl.getUniformLocation(prog, name);
    for (const [k, v] of Object.entries(UNIFORMS)) gl.uniform1f(u(k), v);
    const colors = new Float32Array(32);
    COLORS.forEach(([r, g, b], i) => colors.set([r / 255, g / 255, b / 255, 1], i * 4));
    gl.uniform4fv(u("u_colors"), colors);
    gl.uniform1i(u("u_colors_length"), COLORS.length);
    const uTime = u("u_time");
    const uRes = u("u_resolution");
    const uDpr = u("u_pixelRatio");

    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
      gl.uniform1f(uDpr, dpr);
      if (reduced) {
        gl.uniform1f(uTime, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(canvas);

    const t0 = performance.now();
    let raf = 0;
    const draw = (now: number) => {
      if (visible && !document.hidden) {
        gl.uniform1f(uTime, reduced ? 0 : (now - t0) / 1000);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      if (!reduced) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
    };
  }, []);

  return <canvas ref={canvasRef} className={className} draggable={false} />;
}
