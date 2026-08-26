fn mod289(x: vec3<f32>) -> vec3<f32> {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}
fn mod289_4(x: vec4<f32>) -> vec4<f32> {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}
fn permute3(x: vec4<f32>) -> vec4<f32> {
  return mod289_4(((x * 34.0) + 1.0) * x);
}
fn taylorInvSqrt(r: vec4<f32>) -> vec4<f32> {
  return 1.79284291400159 - 0.85373472095314 * r;
}
fn snoise3(v: vec3<f32>) -> f32 {
  let C = vec2<f32>(1.0/6.0, 1.0/3.0);
  let D = vec4<f32>(0.0, 0.5, 1.0, 2.0);
  var i  = floor(v + dot(v, C.yyy));
  var x0 = v - i + dot(i, C.xxx);
  var g = step(x0.yzx, x0.xyz);
  var l = 1.0 - g;
  var i1 = min(g.xyz, l.zxy);
  var i2 = max(g.xyz, l.zxy);
  var x1 = x0 - i1 + C.xxx;
  var x2 = x0 - i2 + C.yyy;
  var x3 = x0 - D.yyy;
  i = mod289(i);
  var p = permute3(permute3(permute3(
             i.z + vec4<f32>(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4<f32>(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4<f32>(0.0, i1.x, i2.x, 1.0));
  var n_ = 0.142857142857;
  var ns = n_ * D.wyz - D.xzx;
  var j = p - 49.0 * floor(p * ns.z * ns.z);
  var x_ = floor(j * ns.z);
  var y_ = floor(j - 7.0 * x_);
  var x = x_ * ns.x + ns.yyyy;
  var y = y_ * ns.x + ns.yyyy;
  var h = 1.0 - abs(x) - abs(y);
  var b0 = vec4<f32>(x.xy, y.xy);
  var b1 = vec4<f32>(x.zw, y.zw);
  var s0 = floor(b0) * 2.0 + 1.0;
  var s1 = floor(b1) * 2.0 + 1.0;
  var sh = -step(h, vec4<f32>(0.0));
  var a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  var a1 = b1.xzyw + s1.xzyw * sh.zzww;
  var p0 = vec3<f32>(a0.xy, h.x);
  var p1 = vec3<f32>(a0.zw, h.y);
  var p2 = vec3<f32>(a1.xy, h.z);
  var p3 = vec3<f32>(a1.zw, h.w);
  var norm = taylorInvSqrt(vec4<f32>(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 = p0 * norm.x;
  p1 = p1 * norm.y;
  p2 = p2 * norm.z;
  p3 = p3 * norm.w;
  var m = max(0.5 - vec4<f32>(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), vec4<f32>(0.0));
  m = m * m;
  return 105.0 * dot(m * m, vec4<f32>(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

// Curl noise
fn curlNoise(p: vec3<f32>) -> vec2<f32> {
  let e = 0.01;
  let dx = vec3<f32>(e, 0.0, 0.0);
  let dy = vec3<f32>(0.0, e, 0.0);
  
  let p_x0 = snoise3(p - dx);
  let p_x1 = snoise3(p + dx);
  let p_y0 = snoise3(p - dy);
  let p_y1 = snoise3(p + dy);
  
  let x = p_y1 - p_y0;
  let y = p_x0 - p_x1;
  
  return normalize(vec2<f32>(x, y) + vec2<f32>(0.0001)) * (1.0 / (2.0 * e));
}
