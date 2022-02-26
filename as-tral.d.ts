// TODO: docs

interface Settings {
	warmupTime?: f64;
	measurementTime?: f64;
	sampleSize?: u32;
	numResamples?: u32;
	samplingMode?: "auto" | "linear" | "flat";
	confidenceLevel?: f64;
	significanceLevel?: f64;
	noiseThreshold?: f64;
}

declare function set(settings: Settings): void;
declare function bench<T>(description: string, routine: () => T): void;
