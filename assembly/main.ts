declare function now(): f64;
declare function warmup(descriptor: u32): void;
declare function result(descriptor: u32, time: f64): void;

const blackbox = memory.data(16);
export function bench<T>(descriptor: u32, routine: () => T): void {
	// warmup
	let iters = 1;
	let totalIters = 0;
	let elapsedTime: f64 = 0;

	// https://github.com/bheisler/criterion.rs/blob/ceade3b1d72c3ecef0896cbe0dee12f43a6ce240/src/routine.rs#L216
	warmup(descriptor);
	while (true) {
		let start = now();

		for (let i = 0; i < iters; i++) {
			store<T>(blackbox, routine());
		}

		totalIters += totalIters;
		elapsedTime += now() - start;
		if (elapsedTime > __astral__warmupTime) {
			break;
		}

		iters *= 2;
	}
}
