<p align="center">
    <img width="800" src="https://raw.githubusercontent.com/romdotdog/as-tral/main/as-tral.svg" alt="logo">
</p>

---

Bringing minimalist, state-of-the-art benchmarking to AssemblyScript; as-tral is a port of the statistics-oriented Rust benchmarking library [criterion.rs.](https://github.com/bheisler/criterion.rs)

## Quickstart

In an existing [AssemblyScript project,](https://www.assemblyscript.org/getting-started.html) install as-tral.

```
npm i -D @as-tral/cli
```

Next, create a `__benches__` folder in your `assembly` directory. Add a file named `as-tral.d.ts` in there.

```
assembly/
└── __benches__/
    └── as-tral.d.ts
```

In `as-tral.d.ts`, copy and paste

```xml
/// <reference types="@as-tral/cli/as-tral" />
```

Stick any file with a `.ts` extension in `__benches__`. You can even have multiple.

```
assembly/
└── __benches__/
    ├── as-tral.d.ts
    └── my-benchmark.ts
```

Your benchmark will live in this file. Let's create an example benchmark.

```ts
// to ensure accurate benchmarks, we must make sure that binaryen doesn't do any sneaky
// optimizations on our input without us knowing. Thus, we must use `blackbox`.
const input = blackbox("The quick brown fox jumped over the lazy dog.".repeat(10));

// our string here must be a compile time constant.
// open an issue if you'd like to see this constraint lifted.
bench("string split", () => {
    // this function body will be run many times.
    // we must make sure our compiler won't throw away the computation,
    // so we use `blackbox` here again.
    blackbox(input.split(" "));
});
```

Now, let's run as-tral.

```
rom@i9-cabin:~/demo$ npx astral
Compiling assembly/__benches__/hello.ts

Benchmarking string split: Warming up for 3000ms
Benchmarking string split: Collecting 100 samples in estimated 5018.6ms (1.2M iterations)
Benchmarking string split: Analyzing
string split            time: [3770.9ns 3775ns 3778.9ns]
Found 4 outliers among 100 measurements (4%)
  3 (3%) low mild
  1 (1%) high mild
```

Pretty fast!

## Suites [(feature request)](https://github.com/romdotdog/as-tral/issues/3)

Would you like extra output that looks like this?

```
Relative to bubble sort
insertion sort          delta: [-39.704% -38.188% -36.807%] (p = 0.00 < 0.05)
selection sort          delta: [-70.733% -70.102% -69.483%] (p = 0.00 < 0.05)
merge sort              delta: [-81.935% -81.587% -81.226%] (p = 0.00 < 0.05)
quick sort              delta: [-91.517% -91.358% -91.201%] (p = 0.00 < 0.05)
```

Simply group your benchmarks using `suite`.

```ts
suite("sort", () => {
    bench("bubble sort", () => {
        bubbleSort();
    });

    bench("insertion sort", () => {
        insertionSort();
    });

    // ...
});
```

## Flags

The CLI interprets all flags before `--` as [AssemblyScript compiler options.](https://www.assemblyscript.org/compiler.html#compiler-options) For example, to enable ESM bindings,

```
npx astral --bindings esm
```

If you also want to save to a certain baseline,

```
npx astral --bindings esm -- --save-baseline mybaseline
```

Loading from a certain baseline is similar.

```
npx astral --bindings esm -- --save-baseline mybaseline --baseline myotherbaseline
```
