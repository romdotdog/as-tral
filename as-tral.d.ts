declare function set(settings: {
	iterations?: u64;
	stdDev?: boolean;
	mean?: boolean;
	max?: boolean;
	min?: boolean;
}): void;
declare function bench<T>(description: string, routine: () => T): void;
