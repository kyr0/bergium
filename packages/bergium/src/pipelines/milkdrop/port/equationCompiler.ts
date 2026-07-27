/**
 * Milkdrop preset-equation compiler (extracted for testability + DRY).
 *
 * bergium's Milkdrop port compiles preset equation strings (init/frame/pixel/point)
 * into JS functions via `new Function`. This module owns the built-in function
 * preamble injected into every compiled equation and the `if` -> `_if` sanitizer
 * (`if` is a JS reserved word).
 *
 * Kept dependency-free so it can be unit-tested in Node without spinning up WebGL.
 */

/**
 * Milkdrop built-in function preamble. Defines the math/helpers presets may call
 * (trig, `above`/`below`/`equal`/`if`, `pow`, etc.) plus the bitwise family in BOTH
 * naming conventions milkdrop presets use: `band`/`bor`/`bnot`/`bshift` AND
 * `bitand`/`bitor`/`bitxor`/`bitnot`/`bitshift`/`bitshl`/`bitshr`, and logical
 * `and`/`or`/`not`. Missing any of these caused runtime `ReferenceError`s (e.g.
 * `bitand is not defined`) on real butterchurn-presets entries.
 */
export const EQ_PREAMBLE =
  "const sin=Math.sin,cos=Math.cos,tan=Math.tan,asin=Math.asin,acos=Math.acos,atan=Math.atan,atan2=Math.atan2,sinh=Math.sinh,cosh=Math.cosh,tanh=Math.tanh,sqrt=Math.sqrt,pow=Math.pow,exp=Math.exp,log=Math.log,log10=Math.log10,abs=Math.abs,ceil=Math.ceil,floor=Math.floor,round=Math.round,min=Math.min,max=Math.max,sqr=(x)=>x*x,frac=(x)=>x-Math.floor(x),clamp=(x,lo,hi)=>Math.min(hi,Math.max(lo,x)),above=(a,b)=>a>b?1:0,below=(a,b)=>a<b?1:0,equal=(a,b)=>a===b?1:0,_if=(c,a,b)=>c?a:b,sign=(x)=>x>0?1:x<0?-1:0,sigmoid=(x)=>1/(1+Math.exp(-x)),int=(x)=>Math.trunc(x),rand=(m)=>Math.floor(Math.random()*m),randint=(m)=>Math.floor(Math.random()*m),mod=(a,b)=>a%b,div=(a,b)=>Math.trunc(a/b),bor=(a,b)=>a|b,band=(a,b)=>a&b,bnot=(a)=>~a,bshift=(a,b)=>a<<b,bitand=(a,b)=>a&b,bitor=(a,b)=>a|b,bitxor=(a,b)=>a^b,bitnot=(a)=>~a,bitshift=(a,b)=>a<<b,bitshl=(a,b)=>a<<b,bitshr=(a,b)=>a>>b,and=(a,b)=>(a&&b)?1:0,or=(a,b)=>(a||b)?1:0,not=(a)=>a?0:1,gettime=()=>performance.now()*0.001;";

/** Replace milkdrop `if(` calls with `_if(` since `if` is a JS reserved keyword. */
export function sanitizeEqs(eqs: string | undefined): string {
  return (eqs ?? "").replace(/\bif\b/g, "_if");
}

/**
 * Compile a milkdrop equation string into a JS function over the vars object `a`.
 * Mirrors butterchurn's `new Function("a", preamble + eqs + "return a;")` path.
 */
export function compileEquation(
  eqs: string | undefined,
): (m: Record<string, unknown>) => Record<string, unknown> {
  return new Function(
    "a",
    `${EQ_PREAMBLE} ${sanitizeEqs(eqs)} return a;`,
  ) as (m: Record<string, unknown>) => Record<string, unknown>;
}
