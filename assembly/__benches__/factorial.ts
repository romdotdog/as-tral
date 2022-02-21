function rFactorial(n: u64): u64 {
	return n == 0 ? 1 : n * rFactorial(n - 1);
}

export let input = 20;

bench<u64>("recursive factorial", () => {
	return rFactorial(input);
});

function lFactorial(n: u64): u64 {
	let r: u64 = n;
	while (--n > 0) {
		r *= n;
	}
	return r;
}

bench<u64>("loop factorial", () => {
	return lFactorial(input);
});
