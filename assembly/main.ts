declare function now(): f64;
declare function result(time: f64): void;

function bench(description: string, routine: () => void): void {
	let start = now();
	for (let i = 0; i < 5000; i++) {
		routine();
	}
	result(now() - start);
}
