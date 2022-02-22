declare function set(settings: {
	iterations?: u64;
	stdDev?: boolean;
	mean?: boolean;
	max?: boolean;
	min?: boolean;
});
declare function bench(description: string, routine: () => void): void;
