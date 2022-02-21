declare function now(): f64;
declare function result(time: f64): void;

const blackbox = memory.data(16);
function bench<T>(description: string, routine: () => T): void {
	let start = now();
	for (let i = 0; i < 5000; i++) {
		store<T>(blackbox, routine());
	}
	result(now() - start);
}
