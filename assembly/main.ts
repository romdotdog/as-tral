declare function now(): f64;
declare function warmup(descriptor: u32): void;
declare function start(estimatedMs: f64, iterCount: f64): void;
declare function analyzing(): void;
declare function faultyConfig(
    linear: i32,
    actualTime: f64,
    recommendedSampleSize: f64
): void;
declare function faultyBenchmark(): void;
declare function result(timeLB: f64, time: f64, timeHB: f64): void;
declare function change(timeLB: f64, time: f64, timeHB: f64, pValue: f64): void;
declare function outliers(los: i32, lom: i32, him: i32, his: i32): void;

namespace Sampling {
    export function chooseSamplingMode(met: f64): bool {
        // https://github.com/bheisler/criterion.rs/blob/970aa04aa5ee0514d1930c83a58c6ca994727567/src/lib.rs#L1416
        const sampleCount = __astral__sampleSize as u64;
        const targetTime = __astral__measurementTime as f64;
        const totalRuns = ((sampleCount * (sampleCount + 1)) / 2) as f64;
        const d = ceil(targetTime / met / totalRuns);
        const expectedMs = totalRuns * d * met;
        return expectedMs > 2 * targetTime;
    }

    export function linearSampling(met: f64): StaticArray<u64> {
        const sampleCount = __astral__sampleSize as u64;
        const targetTime = __astral__measurementTime as f64;
        const totalRuns = ((sampleCount * (sampleCount + 1)) / 2) as f64;
        const df = max(1, ceil(targetTime / met / totalRuns));
        const d = df as u64;

        if (d == 1) {
            const expectedMs = totalRuns * df * met;
            faultyConfig(1, expectedMs, recommendLinearSampleSize(met));
        }

        const sci32 = sampleCount as i32; // ??
        const arr = new StaticArray<u64>(sci32);
        for (let i = 0, a = 1; i < sci32; i = a++) {
            arr[i] = a * d;
        }
        return arr;
    }

    export function flatSampling(met: f64): StaticArray<u64> {
        const sampleCount = __astral__sampleSize;
        const msPerSample =
            (__astral__measurementTime as f64) / (sampleCount as f64);
        // provisional
        const iterationsPerSample = max(1, ceil(msPerSample / met) as u64);

        if (iterationsPerSample == 1) {
            const expectedMs =
                ((iterationsPerSample * sampleCount) as f64) * met;
            faultyConfig(0, expectedMs, recommendFlatSampleSize(met));
        }

        const arr = new StaticArray<u64>(sampleCount);
        for (let i = 0; i < sampleCount; ++i) {
            arr[i] = iterationsPerSample;
        }
        return arr;
    }

    function recommendLinearSampleSize(met: f64): f64 {
        const targetTime = __astral__measurementTime as f64;
        const c = targetTime / met;
        let sampleSize = (-1.0 + sqrt(4.0 * c) / 2) as u64;
        sampleSize = (sampleSize / 10) * 10;
        return max(10, sampleSize) as f64;
    }

    function recommendFlatSampleSize(met: f64): f64 {
        const targetTime = __astral__measurementTime as f64;
        let sampleSize = (targetTime / met) as u64;
        sampleSize = (sampleSize / 10) * 10;
        return max(10, sampleSize) as f64;
    }
}

namespace Stats {
    // https://github.com/bheisler/criterion.rs/blob/ceade3b1d72c3ecef0896cbe0dee12f43a6ce240/src/stats/univariate/sample.rs#L18
    export function mean(sample: StaticArray<f64>): f64 {
        return sample.reduce<f64>((a, b) => a + b, 0) / sample.length;
    }

    function variance(sample: StaticArray<f64>, mean: f64): f64 {
        let sum: f64 = 0;
        for (let i = 0; i < sample.length; ++i) {
            sum += (sample[i] - mean) ** 2;
        }
        return sum / (sample.length - 1);
    }

    export function stdDev(sample: StaticArray<f64>, mean: f64): f64 {
        return sqrt(variance(sample, mean));
    }

    export function t(sample: StaticArray<f64>, other: StaticArray<f64>): f64 {
        const xBar = mean(sample);
        const yBar = mean(other);
        const s2X = variance(sample, xBar);
        const s2Y = variance(other, yBar);
        const num = xBar - yBar;
        const den = sqrt(s2X / sample.length + s2Y / other.length);
        return num / den;
    }

    export function p_value_2(sample: StaticArray<f64>, t: f64): f64 {
        const n = sample.length;
        let hits = 0;
        for (let i = 0; i < sample.length; ++i) {
            hits += sample[i] < t ? 1 : 0;
        }
        return (min(hits, n - hits) / n) * 2;
    }

    // invariant: sample must be sorted
    export namespace sorted {
        export function median(sample: StaticArray<f64>): f64 {
            const n = sample.length;
            if (n % 2 == 1) {
                return sample[n / 2];
            } else {
                const i = n / 2;
                return (sample[i - 1] + sample[i]) / 2;
            }
        }

        export function MAD(sample: StaticArray<f64>, median: f64): f64 {
            const absDevs = new StaticArray<f64>(sample.length);
            for (let i = 0; i < sample.length; ++i) {
                absDevs[i] = abs(sample[i] - median);
            }

            absDevs.sort();
            return sorted.median(absDevs) * 1.4826;
        }

        // unchecked
        // - p must be in the range [0, 100]
        export function percentile(sample: StaticArray<f64>, p: f64): f64 {
            const len = sample.length - 1;
            if (p == 100) {
                return sample[len];
            }

            const rank: f64 = (p / 100) * len;
            const integer = floor(rank);
            const fraction = rank - integer;
            const n = integer as u32;
            const flooring = unchecked(sample[n]);
            const ceiling = unchecked(sample[n + 1]);

            return flooring + (ceiling - flooring) * fraction;
        }

        export namespace CI {
            export function LB(sample: StaticArray<f64>): f64 {
                return percentile(sample, 50 * (1 - __astral__confidenceLevel));
            }

            export function HB(sample: StaticArray<f64>): f64 {
                return percentile(sample, 50 * (1 + __astral__confidenceLevel));
            }
        }
    }
}

namespace Regression {
    function dot(x: StaticArray<f64>, y: StaticArray<f64>): f64 {
        let sum: f64 = 0;
        for (let i = 0; i < x.length; ++i) {
            sum += x[i] * y[i];
        }
        return sum;
    }

    export function fit(x: StaticArray<f64>, y: StaticArray<f64>): f64 {
        const xy = dot(x, y);
        const x2 = dot(x, x);
        return xy / x2;
    }
}

const blackboxArea = memory.data(128);
export function blackbox<T>(x: T): T {
    store<T>(blackboxArea, x);
    return load<T>(blackboxArea);
}

export const baselineIters = memory.data(__astral__sampleSize * sizeof<f64>());
export const baselineTimes = memory.data(__astral__sampleSize * sizeof<f64>());
export let flags: u32 = 0;

export let meanLB: f64 = 0;
export let meanHB: f64 = 0;
export let meanPoint: f64 = 0;
export let meanError: f64 = 0;

export let medianLB: f64 = 0;
export let medianHB: f64 = 0;
export let medianPoint: f64 = 0;
export let medianError: f64 = 0;

export let MADLB: f64 = 0;
export let MADHB: f64 = 0;
export let MADPoint: f64 = 0;
export let MADError: f64 = 0;

export let slopeLB: f64 = 0;
export let slopeHB: f64 = 0;
export let slopePoint: f64 = 0;
export let slopeError: f64 = 0;

export let stdDevLB: f64 = 0;
export let stdDevHB: f64 = 0;
export let stdDevPoint: f64 = 0;
export let stdDevError: f64 = 0;

export function bench(descriptor: u32, routine: () => void): void {
    // warmup
    let warmupIters: u64 = 1;
    let totalWarmupIters: u64 = 0;
    let warmupElapsedTime: f64 = 0;

    // https://github.com/bheisler/criterion.rs/blob/ceade3b1d72c3ecef0896cbe0dee12f43a6ce240/src/routine.rs#L216
    warmup(descriptor);
    while (true) {
        let start = now();

        for (let i: u64 = 0; i < warmupIters; ++i) {
            routine();
        }

        totalWarmupIters += warmupIters;
        warmupElapsedTime += now() - start;
        if (warmupElapsedTime > __astral__warmupTime) {
            break;
        }

        warmupIters *= 2;
    }

    const met = warmupElapsedTime / (totalWarmupIters as f64);
    const useFlatSampling =
        __astral__samplingMode == 0
            ? Sampling.chooseSamplingMode(met)
            : __astral__samplingMode == 2;

    const mIters = useFlatSampling
        ? Sampling.flatSampling(met)
        : Sampling.linearSampling(met);

    let expectedMs: f64 = 0;
    let totalIters: f64 = 0;
    for (let i = 0; i < __astral__sampleSize; ++i) {
        const iters = mIters[i] as f64;
        expectedMs += iters * met;
        totalIters += iters;
    }
    start(expectedMs, totalIters);

    let notWarned = true;
    const times = new StaticArray<f64>(__astral__sampleSize);
    const averageTimes = new StaticArray<f64>(__astral__sampleSize);
    for (let i = 0; i < __astral__sampleSize; ++i) {
        let start = now();

        const iters = mIters[i];
        for (let j: u64 = 0; j < iters; ++j) {
            routine();
        }

        const res = now() - start;
        if (res == 0 && notWarned) {
            faultyBenchmark();
            notWarned = false;
        }

        times[i] = res;
        averageTimes[i] = res / (iters as f64);
    }

    analyzing();
    averageTimes.sort();

    // bootstrapping arrays
    const resampleX = new StaticArray<f64>(__astral__sampleSize);
    const resampleY = new StaticArray<f64>(__astral__sampleSize);

    // check if there is a baseline
    let tPoint: f64 = 0;
    let meanChangePoint: f64 = 0;
    let medianChangePoint: f64 = 0;
    let pValue: f64 = 0;
    let tDist: StaticArray<f64> | null = null;
    let distMeanChange: StaticArray<f64> | null = null;
    let distMedianChange: StaticArray<f64> | null = null;
    if ((flags & 0b1) != 0) {
        const sample = new StaticArray<f64>(__astral__sampleSize * 2);
        const baseAvgTimes = new StaticArray<f64>(__astral__sampleSize);
        for (let i = 0; i < __astral__sampleSize; ++i) {
            const baseAvgTime =
                load<f64>(baselineTimes + ((<usize>i) << alignof<f64>())) /
                load<f64>(baselineIters + ((<usize>i) << alignof<f64>()));
            baseAvgTimes[i] = baseAvgTime;

            sample[i] = averageTimes[i];
            sample[i + __astral__sampleSize] = baseAvgTime;
        }

        // mixed two-sample bootstrap on t score (analysis/compare.rs > t_test)
        tPoint = Stats.t(averageTimes, baseAvgTimes);
        tDist = new StaticArray<f64>(__astral__numResamples);
        for (let i = 0; i < __astral__numResamples; ++i) {
            for (let j = 0; j < __astral__sampleSize; ++j) {
                resampleX[j] =
                    sample[(Math.random() * __astral__sampleSize * 2) as u32];
                resampleY[j] =
                    sample[(Math.random() * __astral__sampleSize * 2) as u32];
            }
            tDist[i] = Stats.t(resampleX, resampleY);
            // filter out non-finite numbers?
        }

        // estimate change (analysis/compare.rs > estimates)
        meanChangePoint =
            Stats.mean(averageTimes) / Stats.mean(baseAvgTimes) - 1.0;

        baseAvgTimes.sort();
        medianChangePoint =
            Stats.sorted.median(averageTimes) /
                Stats.sorted.median(baseAvgTimes) -
            1.0;

        distMeanChange = new StaticArray<f64>(__astral__numResamples);
        distMedianChange = new StaticArray<f64>(__astral__numResamples);

        // two-sample bootstrap (stats/univariate/mod.rs > bootstrap)
        const numResamplesSqrt = <i32>ceil(sqrt(<f64>__astral__numResamples));
        const perChunk =
            (__astral__numResamples + numResamplesSqrt - 1) / numResamplesSqrt;
        for (let i = 0; i < numResamplesSqrt; ++i) {
            const start = i * perChunk;
            const end = min((i + 1) * perChunk, __astral__numResamples);

            for (let j = 0; j < __astral__sampleSize; ++j) {
                resampleX[j] =
                    averageTimes[(Math.random() * __astral__sampleSize) as u32];
            }

            resampleX.sort();
            for (let k = start; k < end; ++k) {
                for (let j = 0; j < __astral__sampleSize; ++j) {
                    resampleY[j] =
                        baseAvgTimes[
                            (Math.random() * __astral__sampleSize) as u32
                        ];
                }
                resampleY.sort();
                distMeanChange[k] =
                    Stats.mean(resampleX) / Stats.mean(resampleY) - 1.0;
                distMedianChange[k] =
                    Stats.sorted.median(resampleX) /
                        Stats.sorted.median(resampleY) -
                    1.0;
            }
        }

        pValue = Stats.p_value_2(tDist, tPoint);
    }

    meanPoint = Stats.mean(averageTimes);
    stdDevPoint = Stats.stdDev(averageTimes, meanPoint);
    medianPoint = Stats.sorted.median(averageTimes);
    MADPoint = Stats.sorted.MAD(averageTimes, medianPoint);

    // bootstrapping

    const distMean = new StaticArray<f64>(__astral__numResamples);
    const distStdDev = new StaticArray<f64>(__astral__numResamples);
    const distMedian = new StaticArray<f64>(__astral__numResamples);
    const distMAD = new StaticArray<f64>(__astral__numResamples);

    for (let i = 0; i < __astral__numResamples; ++i) {
        for (let j = 0; j < __astral__sampleSize; ++j) {
            resampleY[j] =
                averageTimes[(Math.random() * __astral__sampleSize) as u32];
        }

        resampleY.sort();

        const mean = Stats.mean(resampleY);
        distMean[i] = mean;
        distStdDev[i] = Stats.stdDev(resampleY, mean);

        const median = Stats.sorted.median(distMedian);
        distMedian[i] = median;
        distMAD[i] = Stats.sorted.MAD(resampleY, median);
    }

    distMean.sort();
    distStdDev.sort();
    distMedian.sort();
    distMAD.sort();

    // confidence interval
    meanLB = Stats.sorted.CI.LB(distMean);
    meanHB = Stats.sorted.CI.HB(distMean);

    stdDevLB = Stats.sorted.CI.LB(distStdDev);
    stdDevHB = Stats.sorted.CI.HB(distStdDev);

    medianLB = Stats.sorted.CI.LB(distMedian);
    medianHB = Stats.sorted.CI.HB(distMedian);

    MADLB = Stats.sorted.CI.LB(distMAD);
    MADHB = Stats.sorted.CI.HB(distMAD);

    for (let i = 0; i < __astral__sampleSize; ++i) {
        store<f64>(
            baselineIters + ((<usize>i) << alignof<f64>()),
            mIters[i] as f64
        );
        store<f64>(baselineTimes + ((<usize>i) << alignof<f64>()), times[i]);
    }

    // regression

    if (!useFlatSampling) {
        flags = 0b10;
        const mItersF = new StaticArray<f64>(__astral__sampleSize);
        for (let i = 0; i < __astral__sampleSize; ++i) {
            mItersF[i] = mIters[i] as f64;
        }

        slopePoint = Regression.fit(mItersF, times);

        // bivariate bootstrapping
        const distFit = new StaticArray<f64>(__astral__numResamples);
        for (let i = 0; i < __astral__numResamples; ++i) {
            for (let j = 0; j < __astral__sampleSize; ++j) {
                const k = (Math.random() * __astral__sampleSize) as u32;
                resampleX[j] = mItersF[k];
                resampleY[j] = times[k];
            }
            distFit[i] = Regression.fit(resampleX, resampleY);
        }

        distFit.sort();
        slopeLB = Stats.sorted.CI.LB(distFit);
        slopeHB = Stats.sorted.CI.HB(distFit);
        result(slopeLB, slopePoint, slopeHB);
    } else {
        flags = 0;
        result(meanLB, meanPoint, meanHB);
    }

    if (distMeanChange != null) {
        distMeanChange.sort();
        change(
            Stats.sorted.CI.LB(distMeanChange),
            meanChangePoint,
            Stats.sorted.CI.HB(distMeanChange),
            pValue
        );
    }

    const mild = 1.5;
    const severe = 3;

    const q1 = Stats.sorted.percentile(averageTimes, 25);
    const q3 = Stats.sorted.percentile(averageTimes, 75);
    const iqr = q3 - q1;
    const lost = q1 - severe * iqr;
    const lomt = q1 - mild * iqr;
    const himt = q3 + mild * iqr;
    const hist = q3 + severe * iqr;

    let los = 0;
    let lom = 0;
    let him = 0;
    let his = 0;
    for (let i = 0; i < __astral__sampleSize; i++) {
        const x = averageTimes[i];
        if (x < lost) ++los;
        else if (x > hist) ++his;
        else if (x < lomt) ++lom;
        else if (x > himt) ++him;
    }

    outliers(los, lom, him, his);
}
