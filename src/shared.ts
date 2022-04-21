interface Settings {
    warmupTime: number;
    measurementTime: number;
    sampleSize: number;
    numResamples: number;
    samplingMode: number;
    confidenceLevel: number;
    significanceLevel: number;
    noiseThreshold: number;
}

interface Info extends Settings {
    enumeration: string[];
}
