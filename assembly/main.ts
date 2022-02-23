declare function now(): f64;
declare function result(descriptor: u32, time: f64): void;

const blackbox = memory.data(16);
export function bench<T>(descriptor: u32, routine: () => T): void {
	let start = now();
	for (let i = 0; i < 5000; i++) {
		store<T>(blackbox, routine());
	}
	result(descriptor, now() - start);
}
