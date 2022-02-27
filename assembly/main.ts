declare function now(): f64;
declare function warmup(descriptor: u32): void;
declare function result(timeLB: f64, time: f64, timeHB: f64): void;
declare function outliers(los: u32, lom: u32, him: u32, his: u32): void;

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
			// TODO: warning
			const expectedMs = totalRuns * df * met;
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
			// TODO: warning
			const expectedMs = ((iterationsPerSample * sampleCount) as f64) * met;
		}

		const arr = new StaticArray<u64>(sampleCount);
		for (let i = 0; i < sampleCount; ++i) {
			arr[i] = iterationsPerSample;
		}
		return arr;
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

		totalWarmupIters += totalWarmupIters;
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

	// TODO: start measurement

	//let expectedMs: f64 = 0;
	const times = new StaticArray<f64>(__astral__sampleSize);
	const averageTimes = new StaticArray<f64>(__astral__sampleSize);
	for (let i = 0; i < __astral__sampleSize; ++i) {
		//expectedMs += (mIters[i] as f64) * met;
		let start = now();

		const iters = mIters[i];
		for (let j: u64 = 0; j < iters; ++j) {
			routine();
		}

		const res = now() - start;
		if (res == 0) {
			// TODO: error
		}

		times[i] = res;
		averageTimes[i] = res / (iters as f64);
	}

	averageTimes.sort();

	const pointMean = Stats.mean(averageTimes);
	const pointStdDev = Stats.stdDev(averageTimes, pointMean);
	const pointMedian = Stats.sorted.median(averageTimes);
	const pointMAD = Stats.sorted.MAD(averageTimes, pointMedian);

	// bootstrapping
	const distMean = new StaticArray<f64>(__astral__numResamples);
	const distStdDev = new StaticArray<f64>(__astral__numResamples);
	const distMedian = new StaticArray<f64>(__astral__numResamples);
	const distMAD = new StaticArray<f64>(__astral__numResamples);

	const resampleY = new StaticArray<f64>(__astral__sampleSize);
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
	const meanLB = Stats.sorted.CI.LB(distMean);
	const meanHB = Stats.sorted.CI.HB(distMean);

	const stdDevLB = Stats.sorted.CI.LB(distStdDev);
	const stdDevHB = Stats.sorted.CI.HB(distStdDev);

	const medianLB = Stats.sorted.CI.LB(distMedian);
	const medianHB = Stats.sorted.CI.HB(distMedian);

	const MADLB = Stats.sorted.CI.LB(distMAD);
	const MADHB = Stats.sorted.CI.HB(distMAD);

	// regression

	if (!useFlatSampling) {
		const mItersF = new StaticArray<f64>(__astral__sampleSize);
		for (let i = 0; i < __astral__sampleSize; ++i) {
			mItersF[i] = mIters[i] as f64;
		}

		const pointFit = Regression.fit(mItersF, times);

		// bivariate bootstrapping
		const resampleX = new StaticArray<f64>(__astral__sampleSize);
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
		const slopeLB = Stats.sorted.CI.LB(distFit);
		const slopeHB = Stats.sorted.CI.HB(distFit);
		result(slopeLB, pointFit, slopeHB);
	} else {
		result(meanLB, pointMean, meanHB);
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
