// esbuild runtime chunk for Pony Town client
export var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => (x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected));
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

export var __commonJS = (cb, mod) => () => {
  if (!mod) {
    mod = { exports: {} };
    const fn = typeof cb === 'function' ? cb : cb[Object.keys(cb)[0]];
    fn(mod.exports, mod);
  }
  return mod.exports;
};

export var __esm = (fn, res) => () => {
  if (fn) {
    const f = typeof fn === 'function' ? fn : fn[Object.keys(fn)[0]];
    res = f();
    fn = 0;
  }
  return res;
};

export var __export = (target, all) => {
  for (var name in all)
    Object.defineProperty(target, name, { get: all[name], enumerable: true });
};

export var __require = typeof require !== "undefined" ? require : (x) => {
  throw new Error('Dynamic require of "' + x + '" is not supported');
};

export var __toCommonJS = (mod) => {
  if (mod && mod.__esModule) return mod;
  var result = {};
  if (mod) {
    for (var k of Object.keys(mod)) {
      Object.defineProperty(result, k, { get: () => mod[k], enumerable: true });
    }
  }
  Object.defineProperty(result, "default", { value: mod, enumerable: true });
  return result;
};

export var __toESM = (mod, isNodeMode, target) => (
  target = mod != null ? Object.create(Object.getPrototypeOf(mod)) : {},
  Object.assign(target, mod),
  target.default = mod,
  target
);

export var __yieldStar = (value) => {
  var obj = Symbol.asyncIterator in value ? value[Symbol.asyncIterator]() : value[Symbol.iterator]();
  var next = (val) => obj.next(val);
  var throw_ = (err) => (obj.throw ? obj.throw(err) : Promise.reject(err));
  return {
    next,
    throw: throw_,
    [Symbol.asyncIterator]() { return this; },
    [Symbol.iterator]() { return this; }
  };
};
