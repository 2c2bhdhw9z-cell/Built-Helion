/** Safe custom-force expressions. No eval, no property access. */

export type ForceKind = "off" | "radial" | "swirl" | "sine" | "expr";

export const FORCE_KINDS: readonly ForceKind[] = ["off", "radial", "swirl", "sine", "expr"];

export type ForceContext = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  r: number;
  bass: number;
};

/** Filled each frame by the engine before CPU physics. */
export const forceRuntime = { t: 0, bass: 0 };

type Node =
  | { k: "num"; n: number }
  | { k: "var"; id: keyof ForceContext | "pi" }
  | { k: "un"; op: "-"; a: Node }
  | { k: "bin"; op: "+" | "-" | "*" | "/"; a: Node; b: Node }
  | { k: "call"; fn: string; args: Node[] };

const VARS = new Set(["x", "y", "vx", "vy", "t", "r", "bass", "pi"]);
const FUNCS = new Set(["sin", "cos", "abs", "sqrt", "exp", "min", "max", "atan2"]);
const MAX_LEN = 96;
const MAX_NODES = 80;

const cache = new Map<string, Node | null>();

function tokenize(src: string): { t: string; v: string }[] | null {
  const out: { t: string; v: string }[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === " " || c === "\t") {
      i++;
      continue;
    }
    if ((c >= "0" && c <= "9") || (c === "." && src[i + 1] && src[i + 1]! >= "0" && src[i + 1]! <= "9")) {
      let j = i;
      while (j < src.length && ((src[j]! >= "0" && src[j]! <= "9") || src[j] === ".")) j++;
      const v = src.slice(i, j);
      if (!Number.isFinite(Number(v))) return null;
      out.push({ t: "num", v });
      i = j;
      continue;
    }
    if ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z")) {
      let j = i + 1;
      while (j < src.length && /[a-zA-Z0-9_]/.test(src[j]!)) j++;
      out.push({ t: "id", v: src.slice(i, j).toLowerCase() });
      i = j;
      continue;
    }
    if ("+-*/(),".includes(c)) {
      out.push({ t: c, v: c });
      i++;
      continue;
    }
    return null;
  }
  return out;
}

function parse(src: string): Node | null {
  const hit = cache.get(src);
  if (hit !== undefined) return hit;
  if (src.length > MAX_LEN) {
    cache.set(src, null);
    return null;
  }
  const tokens = tokenize(src);
  if (!tokens) {
    cache.set(src, null);
    return null;
  }
  let i = 0;
  let nodes = 0;
  const peek = () => tokens[i];
  const eat = (t?: string) => {
    const cur = tokens[i];
    if (!cur || (t && cur.t !== t)) return null;
    i++;
    return cur;
  };
  const bump = (): Node | null => {
    nodes++;
    if (nodes > MAX_NODES) return null;
    return { k: "num", n: 0 };
  };

  function parseExpr(): Node | null {
    let left = parseTerm();
    if (!left) return null;
    while (peek()?.t === "+" || peek()?.t === "-") {
      const op = eat()!.t as "+" | "-";
      const right = parseTerm();
      if (!right || !bump()) return null;
      left = { k: "bin", op, a: left, b: right };
    }
    return left;
  }

  function parseTerm(): Node | null {
    let left = parseUnary();
    if (!left) return null;
    while (peek()?.t === "*" || peek()?.t === "/") {
      const op = eat()!.t as "*" | "/";
      const right = parseUnary();
      if (!right || !bump()) return null;
      left = { k: "bin", op, a: left, b: right };
    }
    return left;
  }

  function parseUnary(): Node | null {
    if (peek()?.t === "-") {
      eat();
      const a = parseUnary();
      if (!a || !bump()) return null;
      return { k: "un", op: "-", a };
    }
    if (peek()?.t === "+") {
      eat();
      return parseUnary();
    }
    return parseCall();
  }

  function parseCall(): Node | null {
    const tok = peek();
    if (!tok) return null;
    if (tok.t === "num") {
      eat();
      if (!bump()) return null;
      return { k: "num", n: Number(tok.v) };
    }
    if (tok.t === "(") {
      eat();
      const inner = parseExpr();
      if (!inner || !eat(")")) return null;
      return inner;
    }
    if (tok.t === "id") {
      eat();
      if (peek()?.t === "(") {
        if (!FUNCS.has(tok.v)) return null;
        eat();
        const args: Node[] = [];
        if (peek()?.t !== ")") {
          const a = parseExpr();
          if (!a) return null;
          args.push(a);
          while (peek()?.t === ",") {
            eat();
            const b = parseExpr();
            if (!b) return null;
            args.push(b);
          }
        }
        if (!eat(")")) return null;
        if ((tok.v === "min" || tok.v === "max" || tok.v === "atan2") && args.length !== 2) return null;
        if (tok.v !== "min" && tok.v !== "max" && tok.v !== "atan2" && args.length !== 1) return null;
        if (!bump()) return null;
        return { k: "call", fn: tok.v, args };
      }
      if (!VARS.has(tok.v)) return null;
      if (!bump()) return null;
      return { k: "var", id: tok.v as ForceContext extends never ? never : keyof ForceContext | "pi" };
    }
    return null;
  }

  const ast = parseExpr();
  if (!ast || i !== tokens.length) {
    cache.set(src, null);
    return null;
  }
  cache.set(src, ast);
  return ast;
}

function evalNode(node: Node, ctx: ForceContext): number {
  switch (node.k) {
    case "num":
      return node.n;
    case "var":
      if (node.id === "pi") return Math.PI;
      return ctx[node.id];
    case "un":
      return -evalNode(node.a, ctx);
    case "bin": {
      const a = evalNode(node.a, ctx);
      const b = evalNode(node.b, ctx);
      if (node.op === "+") return a + b;
      if (node.op === "-") return a - b;
      if (node.op === "*") return a * b;
      return b === 0 ? 0 : a / b;
    }
    case "call": {
      const args = node.args.map((a) => evalNode(a, ctx));
      switch (node.fn) {
        case "sin":
          return Math.sin(args[0]!);
        case "cos":
          return Math.cos(args[0]!);
        case "abs":
          return Math.abs(args[0]!);
        case "sqrt":
          return Math.sqrt(Math.max(0, args[0]!));
        case "exp":
          return Math.exp(Math.min(20, args[0]!));
        case "min":
          return Math.min(args[0]!, args[1]!);
        case "max":
          return Math.max(args[0]!, args[1]!);
        case "atan2":
          return Math.atan2(args[0]!, args[1]!);
        default:
          return 0;
      }
    }
    default:
      return 0;
  }
}

export function evalForce(expr: string, ctx: ForceContext): number {
  const trimmed = expr.trim();
  if (!trimmed) return 0;
  const ast = parse(trimmed);
  if (!ast) return 0;
  try {
    const v = evalNode(ast, ctx);
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

export function forceExprOk(expr: string): boolean {
  const trimmed = expr.trim();
  if (!trimmed) return true;
  return parse(trimmed) !== null;
}

export function applyCustomForce(
  kind: ForceKind,
  strength: number,
  exprX: string,
  exprY: string,
  nx: number,
  ny: number,
  vx: number,
  vy: number,
): { ax: number; ay: number } {
  if (kind === "off") return { ax: 0, ay: 0 };
  const dx = nx - 0.5;
  const dy = ny - 0.5;
  const s = strength;
  if (kind === "radial") return { ax: dx * s * 8, ay: dy * s * 8 };
  if (kind === "swirl") return { ax: -dy * s * 8, ay: dx * s * 8 };
  if (kind === "sine") {
    const t = forceRuntime.t;
    return {
      ax: Math.sin(t * 2.2 + ny * 10) * s * 4,
      ay: Math.cos(t * 1.7 + nx * 10) * s * 4,
    };
  }
  const ctx: ForceContext = {
    x: nx,
    y: ny,
    vx,
    vy,
    t: forceRuntime.t,
    r: Math.hypot(dx, dy),
    bass: forceRuntime.bass,
  };
  const mul = s === 0 ? 1 : s;
  return { ax: evalForce(exprX, ctx) * mul, ay: evalForce(exprY, ctx) * mul };
}
