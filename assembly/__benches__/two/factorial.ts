function rFactorial(n: u64): u64 {
	return n == 0 ? 1 : n * rFactorial(n - 1);
}

bench("recursive factorial", () => {
	rFactorial(20);
});

function lFactorial(n: u64): u64 {
	let r: u64 = 1;
	while (--n > 0) {
		r *= n;
	}
	return r;
}

bench("loop factorial", () => {
	lFactorial(20);
});
