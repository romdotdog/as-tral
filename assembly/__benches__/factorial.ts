set({
	warmupTime: 5000
});

function rFactorial(n: u64): u64 {
	return n == 0 ? 1 : n * rFactorial(n - 1);
}

let input = blackbox(1000);

bench("recursive factorial", () => {
	blackbox(rFactorial(input));
});

function lFactorial(n: u64): u64 {
	let r: u64 = n;
	while (--n > 0) {
		r *= n;
	}
	return r;
}

bench("loop factorial", () => {
	blackbox(lFactorial(input));
});
